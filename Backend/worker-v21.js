import base from "./worker-v195.js";

const VERSION = "2.1.0";
const HEVY = "https://api.hevyapp.com/v1";
const OPENAI = "https://api.openai.com/v1/responses";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok:true, version:VERSION, configured:config(env), historyCap:5000, gpsFallback:true, hybridCoach:true, visualAssessment:!!env.OPENAI_API_KEY });
    }
    if (url.pathname === "/status" && request.method === "GET") {
      const denied = auth(request, env); if (denied) return denied;
      return json({ ok:true, authenticated:true, version:VERSION, configured:config(env), historyCap:5000, gpsFallback:true, hybridCoach:true, visualAssessment:!!env.OPENAI_API_KEY });
    }

    if (url.pathname === "/coach/hybrid-program" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      const body = await request.json().catch(() => ({}));
      const profile = normalizeProfile(body.profile);
      const readiness = normalizeReadiness(body.readiness);
      const sessions = cleanSessions(body.sessions, 520);
      const visual = sanitizeVisual(body.visualAssessment);
      const analytics = analyzeTraining(sessions, profile, readiness);
      let program = fallbackProgram(profile, readiness, analytics, visual);
      let degraded = true;
      let warning = null;
      if (env.OPENAI_API_KEY) {
        try {
          program = await aiProgram(env, { profile, readiness, analytics, visual });
          degraded = false;
        } catch (error) {
          warning = safe(error);
        }
      } else warning = "OPENAI_API_KEY absent : programme déterministe utilisé.";
      return json({ ok:true, version:VERSION, program, analytics, degraded, warning });
    }

    if (url.pathname === "/coach/strength-plan-v2" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      const body = await request.json().catch(() => ({}));
      const profile = normalizeProfile(body.profile);
      const readiness = normalizeReadiness(body.readiness);
      const sessions = cleanSessions(body.sessions, 380).filter(isStrength);
      const program = body.program && typeof body.program === "object" ? body.program : null;
      const visual = sanitizeVisual(body.visualAssessment);
      try {
        const custom = [body.customFocus, program?.today?.strengthFocus, profile.priorityText, visual?.programAdjustments?.join("; ")]
          .filter(Boolean).join(" · ").slice(0, 650);
        let plan = await baseStrength(request, env, ctx, {
          ...body,
          sessions,
          goal: body.goal || profile.strengthGoal,
          customFocus: custom,
          focusTitle: body.focusTitle || program?.today?.strengthFocus || "Musculation hybride"
        });
        plan = adaptStrength(plan, readiness, program);
        if (shouldAddNovel(plan, readiness, program)) {
          plan = await addNovelExercise(plan, sessions, env).catch(() => plan);
        }
        plan = env.OPENAI_API_KEY
          ? await enrichStrengthNotesAI(env, plan, { profile, readiness, program, visual }).catch(() => enrichStrengthNotes(plan, { profile, readiness, program }))
          : enrichStrengthNotes(plan, { profile, readiness, program });
        plan = rebuildRoutine(plan, readiness, program);
        return json({ ok:true, version:VERSION, plan });
      } catch (error) {
        return json({ error:safe(error) }, 500);
      }
    }

    if (url.pathname === "/coach/cardio-plan-v2" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      const body = await request.json().catch(() => ({}));
      const profile = normalizeProfile(body.profile);
      const readiness = normalizeReadiness(body.readiness);
      const sessions = cleanSessions(body.sessions, 480);
      const program = body.program && typeof body.program === "object" ? body.program : null;
      const analytics = analyzeTraining(sessions, profile, readiness);
      try {
        const fatigue = readiness.score < 55 || readiness.soreness >= 4 || analytics.recovery.recentLegStrength;
        const custom = [fatigue ? "endurance facile, sans fractionné" : program?.today?.cardioFocus, body.customFocus].filter(Boolean).join(" · ").slice(0, 350);
        const plan = await baseCardio(request, env, ctx, {
          ...body,
          sessions,
          goal: body.goal || profile.enduranceGoal,
          customFocus: custom
        });
        return json({ ok:true, version:VERSION, plan:enrichCardio(plan, readiness, program, analytics, profile) });
      } catch (error) {
        return json({ error:safe(error) }, 500);
      }
    }

    if (url.pathname === "/coach/visual-assessment" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      if (!env.OPENAI_API_KEY) return json({ error:"OPENAI_API_KEY is not configured" }, 503);
      const body = await request.json().catch(() => ({}));
      const images = (Array.isArray(body.images) ? body.images : []).filter(isSafeDataImage).slice(0, 3);
      if (!images.length) return json({ error:"Ajoute au moins une photo pour le bilan visuel." }, 400);
      try {
        const assessment = await aiVisual(env, images, normalizeProfile(body.profile));
        return json({ ok:true, version:VERSION, assessment, stored:false });
      } catch (error) {
        return json({ error:safe(error) }, 500);
      }
    }

    const response = await base.fetch(request, env, ctx);
    if (!response.ok) return response;
    if (!(response.headers.get("Content-Type") || "").includes("application/json")) return response;
    try {
      const data = await response.json();
      if (data && typeof data === "object") data.version = VERSION;
      return json(data, response.status);
    } catch { return response; }
  }
};

async function baseStrength(request, env, ctx, payload) {
  const url = new URL(request.url); url.pathname = "/coach/strength-plan"; url.search = "";
  const r = await base.fetch(new Request(url, { method:"POST", headers:request.headers, body:JSON.stringify(payload) }), env, ctx);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Coach musculation: HTTP ${r.status}`);
  if (!data?.plan?.exercises?.length) throw new Error("Le moteur de musculation n'a pas produit de séance exploitable.");
  return data.plan;
}
async function baseCardio(request, env, ctx, payload) {
  const url = new URL(request.url); url.pathname = "/coach/cardio-plan"; url.search = "";
  const r = await base.fetch(new Request(url, { method:"POST", headers:request.headers, body:JSON.stringify(payload) }), env, ctx);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Coach cardio: HTTP ${r.status}`);
  if (!data?.plan?.blocks?.length) throw new Error("Le moteur cardio n'a pas produit de séance exploitable.");
  return data.plan;
}

function normalizeProfile(value={}) {
  return {
    mode:"hybrid",
    sessionsPerWeek:clampInt(value.sessionsPerWeek,5,3,7),
    strengthDuration:clampInt(value.strengthDuration,60,30,120),
    cardioDuration:clampInt(value.cardioDuration,45,20,120),
    strengthGoal:clip(value.strengthGoal || "Force + muscle athlétique",100),
    enduranceGoal:clip(value.enduranceGoal || "Endurance et vitesse utiles",100),
    raceGoal:clip(value.raceGoal || "Performance générale",100),
    priorityText:clip(value.priorityText || "",350),
    constraintsText:clip(value.constraintsText || "",350),
    equipment:clip(value.equipment || "Salle complète",120)
  };
}
function normalizeReadiness(value={}) {
  const sleep=clampInt(value.sleep,3,1,5), energy=clampInt(value.energy,3,1,5), soreness=clampInt(value.soreness,2,1,5), motivation=clampInt(value.motivation,3,1,5);
  return { sleep, energy, soreness, motivation, score:Math.round(((sleep+energy+motivation+(6-soreness))/20)*100), note:clip(value.note||"",220) };
}
function sanitizeVisual(value) {
  if (!value || typeof value !== "object") return null;
  return { summary:clip(value.summary||"",300), observations:(Array.isArray(value.observations)?value.observations:[]).slice(0,6).map(x=>clip(x,180)), programAdjustments:(Array.isArray(value.programAdjustments)?value.programAdjustments:[]).slice(0,6).map(x=>clip(x,180)) };
}
function cleanSessions(input, limit) {
  return (Array.isArray(input)?input:[]).filter(s=>s && s.startedAt && !String(s.id||"").startsWith("demo-")).sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt)).slice(0,limit);
}

function analyzeTraining(sessions, profile, readiness) {
  const now=Date.now(), r7=sessions.filter(s=>ageDays(s.startedAt,now)<=7), r28=sessions.filter(s=>ageDays(s.startedAt,now)<=28), r56=sessions.filter(s=>ageDays(s.startedAt,now)<=56);
  const strength28=r28.filter(isStrength), cardio28=r28.filter(isCardio), runs56=r56.filter(isRun);
  const focus={lowAerobic:0,highAerobic:0,anaerobic:0};
  const muscles={chest:0,back:0,shoulders:0,biceps:0,triceps:0,quads:0,hamstrings:0,glutes:0,calves:0,core:0};
  const patterns={push:0,pull:0,knee:0,hinge:0,verticalPush:0,verticalPull:0,carryCore:0};
  for (const s of r28) {
    const p=s.loadProfile || inferredLoad(s); Object.keys(focus).forEach(k=>focus[k]+=Number(p[k]||0));
    if (isStrength(s)) for (const ex of Array.isArray(s.exercises)?s.exercises:[]) {
      const sets=(ex.sets||[]).filter(x=>x.type!=="warmup").length||1, c=classifyExercise(ex.title||"");
      if (muscles[c.muscle]!=null) muscles[c.muscle]+=sets; if (patterns[c.pattern]!=null) patterns[c.pattern]+=sets;
    }
  }
  const total=Object.values(focus).reduce((a,b)=>a+b,0)||1, shares=Object.fromEntries(Object.entries(focus).map(([k,v])=>[k,Math.round(v/total*100)]));
  const paces=runs56.map(s=>Number(s.paceMinKm)).filter(n=>n>0&&Number.isFinite(n)).sort((a,b)=>a-b);
  return {
    history:{total:sessions.length,recent7:r7.length,recent28:r28.length,strength28:strength28.length,cardio28:cardio28.length,runs56:runs56.length},
    readiness,
    loadFocus:{shares,priority:focusPriority(shares,profile)},
    recovery:{hardSessions72h:sessions.filter(s=>ageDays(s.startedAt,now)<=3&&isHard(s)).length,recentLegStrength:sessions.some(s=>ageDays(s.startedAt,now)<=2.5&&isStrength(s)&&hasLegWork(s)),lastStrengthDays:finiteAge(ageDays(sessions.find(isStrength)?.startedAt,now)),lastCardioDays:finiteAge(ageDays(sessions.find(isCardio)?.startedAt,now))},
    strength:{muscleExposure:muscles,movementExposure:patterns,muscleDeficits:Object.entries(muscles).sort((a,b)=>a[1]-b[1]).slice(0,4).map(([muscle,sets])=>({muscle,sets})),progress:e1rmProgress(strength28)},
    endurance:{weeklyDistanceKm:weekTotals(r56,s=>isRun(s)?Number(s.distanceKm||0):0),weeklyCardioMinutes:weekTotals(r56,s=>isCardio(s)?Number(s.durationMinutes||0):0),medianRunPaceMinKm:paces.length?paces[Math.floor(paces.length/2)]:null},
    consistency:{activeDays28:new Set(r28.map(s=>new Date(s.startedAt).toISOString().slice(0,10))).size,sessionsPerWeek28:round(r28.length/4,1),targetSessionsPerWeek:profile.sessionsPerWeek}
  };
}
function inferredLoad(s) { const load=Math.max(1,Number(s.trainingLoad||s.durationMinutes||1)), out={lowAerobic:0,highAerobic:0,anaerobic:0}, t=normalize(`${s.activityType||""} ${s.title||""} ${s.category||""}`); let k="lowAerobic"; if(isStrength(s)||/sprint|anaerob|hiit|interval|padel|tennis|crossfit/.test(t))k="anaerobic"; else if(/tempo|threshold|seuil|vo2|race|competition|fartlek/.test(t))k="highAerobic"; out[k]=load; return out; }
function focusPriority(shares, profile) { const target=/endurance|semi|10 km|5 km|trail/i.test(`${profile.enduranceGoal} ${profile.raceGoal}`)?{lowAerobic:50,highAerobic:32,anaerobic:18}:{lowAerobic:42,highAerobic:30,anaerobic:28}; return Object.keys(target).sort((a,b)=>(target[b]-Number(shares[b]||0))-(target[a]-Number(shares[a]||0)))[0]; }
function e1rmProgress(sessions) { const map=new Map(); for(const s of sessions){for(const ex of Array.isArray(s.exercises)?s.exercises:[]){const best=Math.max(0,...(ex.sets||[]).filter(x=>x.type!=="warmup").map(x=>Number(x.weightKg||0)*(1+Number(x.reps||0)/30))); if(!best)continue;const key=String(ex.exerciseTemplateId||ex.title||"");if(!map.has(key))map.set(key,{title:ex.title,latest:best,oldest:best});else map.get(key).oldest=best;}} return [...map.values()].map(x=>({title:x.title,changePct:x.oldest?round((x.latest/x.oldest-1)*100,1):0})).sort((a,b)=>b.changePct-a.changePct).slice(0,8); }
function weekTotals(sessions, getter){const now=new Date(), out=Array(8).fill(0);for(const s of sessions){const d=Math.floor((now-new Date(s.startedAt))/86400000),i=Math.floor(d/7);if(i>=0&&i<8)out[7-i]+=Number(getter(s)||0);}return out.map(x=>round(x,1));}
function classifyExercise(title){const t=normalize(title);if(/squat|leg press|hack|fente|lunge|step up|leg extension/.test(t))return{muscle:"quads",pattern:"knee"};if(/deadlift|souleve|rdl|hip thrust|good morning/.test(t))return{muscle:/hip thrust/.test(t)?"glutes":"hamstrings",pattern:"hinge"};if(/leg curl/.test(t))return{muscle:"hamstrings",pattern:"hinge"};if(/calf|mollet|soleaire/.test(t))return{muscle:"calves",pattern:"knee"};if(/bench|developpe couche|chest press|fly|ecarte|pec deck/.test(t))return{muscle:"chest",pattern:"push"};if(/overhead|military|developpe.*epaule|shoulder press|lateral raise|elevation laterale/.test(t))return{muscle:"shoulders",pattern:"verticalPush"};if(/pull.?up|traction|pulldown|tirage vertical/.test(t))return{muscle:"back",pattern:"verticalPull"};if(/row|rowing|tirage horizontal/.test(t))return{muscle:"back",pattern:"pull"};if(/curl/.test(t))return{muscle:"biceps",pattern:"pull"};if(/triceps|pushdown|extension.*bras/.test(t))return{muscle:"triceps",pattern:"push"};if(/abdo|core|gainage|plank|carry/.test(t))return{muscle:"core",pattern:"carryCore"};return{muscle:"core",pattern:"carryCore"};}

async function aiProgram(env, context) {
  const system=`Tu es TrainSync Hybrid Coach, un préparateur physique de programmation concurrente. Construis un bloc cohérent et progressif, pas un simple récapitulatif. L'historique sert à mesurer la tolérance, la récupération, la progression, les charges et les lacunes; il ne doit pas t'enfermer dans les mêmes exercices. Principes: 1) anato-morphologie et contraintes individuelles avant le dogme; 2) mouvements de base pour force/masse, isolation pour ciblage, équilibre et points faibles; 3) intensification (dropset, pré/post-fatigue, séries longues) seulement si utile et récupérable; 4) échauffement et qualité technique avant surcharge; 5) capital de récupération limité: prioriser sans empiler les traumatismes; 6) trois semaines de progression puis semaine 4 allégée; 7) athlète hybride: force, muscle athlétique, base aérobie, seuil/VO2 et vitesse coexistent mais les stress jambes intenses ne s'empilent pas; 8) ne jamais diagnostiquer une blessure. Réponds en français.`;
  const user=`Crée un bloc de 4 semaines et la décision de séance du jour à partir de ce contexte. Les priorités doivent être actionnables et justifiées.\n${JSON.stringify(context)}`;
  const data=await openai(env,{model:env.OPENAI_COACH_MODEL||"gpt-5.6-terra",input:[{role:"system",content:system},{role:"user",content:user}],store:false,reasoning:{effort:env.OPENAI_COACH_REASONING||"medium"},text:{format:{type:"json_schema",name:"hybrid_program",strict:true,schema:PROGRAM_SCHEMA}}},50000);
  return JSON.parse(outputText(data));
}
function fallbackProgram(profile, readiness, a, visual) {
  const deficit=a.strength.muscleDeficits[0]?.muscle||"back", cardio=a.loadFocus.priority, tired=readiness.score<55||a.recovery.hardSessions72h>=2;
  const recommendedType=tired?"cardio":a.recovery.lastStrengthDays>=2?"strength":"cardio";
  const strengthFocus=muscleLabel(deficit)+" + mouvements structurants", cardioFocus=cardio==="lowAerobic"?"Base aérobie facile":cardio==="highAerobic"?"Tempo / seuil contrôlé":"Vitesse courte contrôlée";
  const days=weeklyTemplate(profile.sessionsPerWeek,strengthFocus,cardioFocus);
  return { athleteSummary:`Profil hybride ${profile.sessionsPerWeek} séances/semaine. Le bloc équilibre progression musculaire, force et endurance sans empiler les stress difficiles.`, block:{name:"Fondations hybrides",currentWeek:1,primaryObjective:"Faire progresser les qualités utiles ensemble avec une fatigue maîtrisée.",progression:["Semaine 1 · Mise en place et repères","Semaine 2 · +1 petit stimulus ou progression mesurée","Semaine 3 · Semaine la plus productive, sans échec systématique","Semaine 4 · Volume réduit et consolidation"]}, priorities:[{type:"strength",label:`Renforcer ${muscleLabel(deficit)}`,reason:"Exposition récente relativement faible dans l'historique musculation."},{type:"cardio",label:cardioFocus,reason:"C'est la filière la plus déficitaire dans la répartition de charge actuelle."},{type:"recovery",label:"Protéger la récupération jambes",reason:"Éviter deux stress jambes élevés consécutifs pour préserver la qualité."},...(visual?.programAdjustments?.[0]?[{type:"strength",label:"Ajustement visuel",reason:visual.programAdjustments[0]}]:[])].slice(0,4),weeklyStructure:days,today:{recommendedType,headline:recommendedType==="strength"?"Je privilégierais une séance de musculation ciblée":"Je privilégierais un cardio utile au bloc",confidence:tired?72:78,rationale:[tired?"La disponibilité du jour incite à limiter le stress neuromusculaire.":"L'espacement récent permet un nouveau stimulus productif.",`Focus charge prioritaire : ${cardioFocus}.`,`Point faible relatif : ${muscleLabel(deficit)}.`],strengthFocus,cardioFocus,durationMinutes:recommendedType==="strength"?profile.strengthDuration:profile.cardioDuration},strengthRules:["Progression par répétition ou petite hausse de charge, pas les deux à tout prix.","Échauffements spécifiques sur les mouvements lourds; dropsets seulement sur isolation utile.","Introduire ponctuellement un nouveau stimulus compatible avec le matériel et la technique."],cardioRules:["Augmenter progressivement le volume hebdomadaire, pas brutalement.","Une séance réellement dure à la fois quand les jambes sont chargées.","Les allures sont recalées sur l'historique et doivent rester contrôlables."],recoveryRules:["Semaine 4 allégée.","Courbatures fortes ou sommeil faible: réduire volume/intensité.","Conserver au moins une journée vraiment légère selon la semaine."],photoRecommended:true,photoReason:"Facultatif : des vues standardisées peuvent aider à affiner les priorités visibles de développement, jamais à poser un diagnostic." };
}
function weeklyTemplate(n,strengthFocus,cardioFocus){const base=[{day:"J1",title:"Musculation",focus:strengthFocus,intensity:"Modérée à élevée"},{day:"J2",title:"Cardio facile",focus:"Base aérobie",intensity:"Facile"},{day:"J3",title:"Musculation",focus:"Force + équilibre haut/bas",intensity:"Modérée"},{day:"J4",title:"Cardio qualitatif",focus:cardioFocus,intensity:"Contrôlée"},{day:"J5",title:"Musculation",focus:"Puissance / hypertrophie athlétique",intensity:"Modérée"},{day:"J6",title:"Endurance libre",focus:"Sortie facile ou randonnée",intensity:"Facile"},{day:"J7",title:"Récupération",focus:"Repos / mobilité",intensity:"Très facile"}];return base.slice(0,Math.max(3,Math.min(7,n)));}

function adaptStrength(plan, readiness, program) {
  const deload=Number(program?.block?.currentWeek||1)===4, low=readiness.score<55||readiness.soreness>=4;
  const exercises=(plan.exercises||[]).map(ex=>{let sets=(ex.sets||[]).map(s=>({...s}));if(deload||low){sets=sets.filter(s=>s.type!=="dropset"&&s.type!=="failure");const work=sets.filter(s=>s.type==="normal");if(work.length>2){let keep=2;sets=sets.filter(s=>s.type!=="normal"||keep-->0);}sets=sets.map(s=>({...s,rpe:s.rpe==null?s.rpe:Math.min(Number(s.rpe),8)}));}return{...ex,sets,notes:`${ex.notes||""}${deload?" Semaine allégée : volume réduit et aucune intensification.":low?" Disponibilité basse : garde 2–3 répétitions en réserve et privilégie une exécution propre.":""}`.trim()};});
  return {...plan,exercises,totalSets:exercises.reduce((n,e)=>n+(e.sets||[]).length,0),advancedSets:{warmups:exercises.reduce((n,e)=>n+(e.sets||[]).filter(s=>s.type==="warmup").length,0),dropsets:exercises.reduce((n,e)=>n+(e.sets||[]).filter(s=>s.type==="dropset").length,0),strategy:deload?"Semaine allégée":low?"Volume adapté à la disponibilité":"Progression + intensification sélective"}};
}
function shouldAddNovel(plan, readiness, program){return readiness.score>=65&&Number(program?.block?.currentWeek||1)!==4&&(plan.exercises||[]).length>=5&&!(plan.exercises||[]).some(e=>e.novelty==="new");}
async function addNovelExercise(plan, sessions, env){if(!env.HEVY_API_KEY)return plan;const templates=await fetchTemplates(env.HEVY_API_KEY);const seen=new Set();const cutoff=Date.now()-90*86400000;for(const s of sessions.filter(s=>new Date(s.startedAt).getTime()>=cutoff))for(const e of s.exercises||[])if(e.exerciseTemplateId)seen.add(String(e.exerciseTemplateId));const target=(plan.exercises||[]).at(-1),group=normalizeGroup(target?.primaryGroup);const candidate=templates.find(t=>!seen.has(String(t.id))&&normalizeGroup(t.primary_muscle_group)===group&&!riskyTitle(t.title||""));if(!candidate)return plan;const range=/force/i.test(plan.goal||"")?[6,8]:[10,12];const novel={exerciseTemplateId:String(candidate.id),title:candidate.title||"Nouvel exercice",primaryGroup:group,secondaryGroups:(candidate.secondary_muscle_groups||[]).map(normalizeGroup),novelty:"new",restSeconds:90,notes:"Nouveau stimulus : première exposition de calibration. Choisis une charge facile et garde 3–4 répétitions en réserve.",sets:[{type:"normal",weightKg:null,reps:range[0],rpe:6.5},{type:"normal",weightKg:null,reps:range[1],rpe:7},{type:"normal",weightKg:null,reps:range[1],rpe:7}]};const exercises=[...(plan.exercises||[])];exercises[exercises.length-1]=novel;return{...plan,exercises,totalSets:exercises.reduce((n,e)=>n+(e.sets||[]).length,0)};}
async function fetchTemplates(key){const out=[];for(let p=1;p<=10;p++){const r=await fetchTimed(`${HEVY}/exercise_templates?page=${p}&pageSize=100`,{headers:{"api-key":key,Accept:"application/json"}},12000);if(!r.ok)break;const d=await r.json(),batch=Array.isArray(d.exercise_templates)?d.exercise_templates:[];out.push(...batch);if(batch.length<100)break;}return out;}
function riskyTitle(title){return /nuque|behind.?neck|upright row|tirage menton|good morning|neck press/i.test(title);}

async function enrichStrengthNotesAI(env, plan, context){const compact=(plan.exercises||[]).map(e=>({id:String(e.exerciseTemplateId||""),title:e.title,novelty:e.novelty,restSeconds:e.restSeconds,sets:(e.sets||[]).map(s=>({type:s.type,weightKg:s.weightKg,reps:s.reps,rpe:s.rpe}))}));const prompt=`Rédige les notes d'exécution pour chaque exercice de cette séance. Tu n'as pas le droit de modifier les exercices, séries, charges, répétitions ou RPE. Chaque note doit expliquer: intention du mouvement, 2-4 consignes techniques utiles, amplitude/contrôle, respiration ou gainage si pertinent, et pourquoi l'exercice est là dans le bloc. Si nouveau mouvement: insister sur calibration. Pas de diagnostic médical. Style bref, coach, français. Contexte=${JSON.stringify(context)} Séance=${JSON.stringify(compact)}`;const data=await openai(env,{model:env.OPENAI_COACH_MODEL||"gpt-5.6-terra",input:prompt,store:false,reasoning:{effort:"medium"},text:{format:{type:"json_schema",name:"strength_notes",strict:true,schema:NOTES_SCHEMA}}},40000);const parsed=JSON.parse(outputText(data)),map=new Map((parsed.notes||[]).map(x=>[String(x.exerciseTemplateId),x.notes]));return{...plan,exercises:(plan.exercises||[]).map(e=>({...e,notes:map.get(String(e.exerciseTemplateId))||e.notes}))};}
function enrichStrengthNotes(plan,{readiness,program}){return{...plan,exercises:(plan.exercises||[]).map(e=>({...e,notes:[e.notes,techniqueNote(e.title),readiness.score<60?"Aujourd'hui: arrête la série si la vitesse ou la technique se dégrade.":"Progression: valide toutes les répétitions propres avant d'augmenter la charge.",program?.block?.currentWeek===4?"Semaine allégée: aucune série à l'échec.":""].filter(Boolean).join(" ")}))};}
function techniqueNote(title){const t=normalize(title);if(/bench|developpe couche/.test(t))return"Omoplates stables, pieds ancrés, descente contrôlée; pousse sans décoller les épaules du banc.";if(/fly|ecarte|pec deck/.test(t))return"Garde une légère flexion des coudes, ouvre sans forcer l'épaule puis resserre les pectoraux sans élan.";if(/squat|leg press|hack/.test(t))return"Tronc gainé, genoux dans l'axe des pieds, amplitude que tu contrôles; remonte sans rebond.";if(/deadlift|souleve|rdl|hip hinge/.test(t))return"Charnière de hanche, dos neutre, charge proche du corps; termine par les hanches, pas par une hyperextension lombaire.";if(/row|rowing/.test(t))return"Initie avec les omoplates, garde le tronc stable et tire les coudes sans hausser les épaules.";if(/pull.?up|traction|pulldown|tirage vertical/.test(t))return"Déprime les épaules avant de tirer, garde les côtes contrôlées et mène les coudes vers le bas.";if(/overhead|military|shoulder press|developpe.*epaule/.test(t))return"Gainage actif, trajectoire verticale et contrôle de l'omoplate; évite de compenser par le bas du dos.";if(/lateral raise|elevation laterale/.test(t))return"Monte sans élan, épaules basses, coude légèrement fléchi; contrôle surtout la descente.";if(/curl/.test(t))return"Coude stable, supination/prise selon l'exercice, pas d'élan du buste; serre en fin de flexion.";if(/triceps|pushdown|extension/.test(t))return"Garde le coude stable et termine l'extension sans transformer le mouvement en poussée d'épaule.";if(/leg curl/.test(t))return"Bassin stable, flexion contrôlée et retour lent; cherche les ischios plutôt que l'élan.";if(/leg extension/.test(t))return"Contrôle toute l'amplitude sans lancer la charge; marque brièvement la contraction si confortable.";if(/calf|mollet|soleaire/.test(t))return"Amplitude contrôlée, pause en bas et contraction nette en haut; évite les rebonds.";return"Répétitions propres, amplitude contrôlée, gainage stable et arrêt avant que la technique se dégrade.";}
function rebuildRoutine(plan, readiness, program){const exercises=(plan.exercises||[]).map(e=>({...e,sets:(e.sets||[]).map(s=>({...s,type:validType(s.type)}))}));const routine={title:plan.title,notes:`TrainSync Hybrid Coach · semaine ${Number(program?.block?.currentWeek||1)}/4 · disponibilité ${readiness.score}%. ${plan.rationale||""}`.slice(0,900),exercises:exercises.map(e=>({exerciseTemplateId:e.exerciseTemplateId,title:e.title,restSeconds:e.restSeconds,notes:e.notes,sets:e.sets.map(s=>({type:validType(s.type),weightKg:finiteOrNull(s.weightKg),reps:intOrNull(s.reps),rpe:finiteOrNull(s.rpe)}))}))};return{...plan,exercises,totalSets:exercises.reduce((n,e)=>n+e.sets.length,0),publish:{...(plan.publish||{}),hevyRoutine:routine}};}

function enrichCardio(plan, readiness, program, a, profile){const low=readiness.score<55||readiness.soreness>=4||a.recovery.recentLegStrength;const coachNote=low?"Le coach a plafonné l'intensité aujourd'hui pour protéger la récupération des jambes.":`Cette séance sert le bloc ${program?.block?.name||"hybride"} sans sacrifier la prochaine séance de force.`;return{...plan,rationale:`${plan.rationale||""} ${coachNote}`.trim(),coachNote,runGuide:{progressionRule:"Augmente le volume ou la difficulté par petits incréments; si la récupération baisse, consolide avant d'ajouter.",interferenceRule:"Évite d'enchaîner une course très intense avec une grosse séance jambes; garde la qualité prioritaire de la semaine.",raceGoal:profile.raceGoal}};}

async function aiVisual(env, images, profile){const content=[{type:"input_text",text:`Tu analyses uniquement des éléments visibles utiles à la programmation sportive. Décris avec prudence les différences visibles de développement musculaire, équilibre gauche/droite apparent et proportions générales pouvant orienter le choix de groupes musculaires. Ne donne pas d'estimation de masse grasse, âge, santé, blessure, diagnostic, douleur, attractivité ou identité. Une photo ne permet pas de conclure sur la fonction. Transforme seulement les observations sûres en ajustements d'entraînement prudents. Profil=${JSON.stringify(profile)}`}];for(const image_url of images)content.push({type:"input_image",image_url});const data=await openai(env,{model:env.OPENAI_COACH_MODEL||"gpt-5.6-terra",input:[{role:"user",content}],store:false,reasoning:{effort:"medium"},text:{format:{type:"json_schema",name:"visual_training_assessment",strict:true,schema:VISUAL_SCHEMA}}},50000);return JSON.parse(outputText(data));}

async function openai(env,payload,timeout){const r=await fetchTimed(OPENAI,{method:"POST",headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify(payload)},timeout);const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error?.message||`OpenAI: HTTP ${r.status}`);return data;}
function outputText(data){const text=data.output_text||data.output?.flatMap(x=>x.content||[]).find(x=>x.type==="output_text")?.text;if(!text)throw new Error("OpenAI n'a renvoyé aucune sortie structurée.");return text;}

const PROGRAM_SCHEMA={type:"object",additionalProperties:false,required:["athleteSummary","block","priorities","weeklyStructure","today","strengthRules","cardioRules","recoveryRules","photoRecommended","photoReason"],properties:{athleteSummary:{type:"string"},block:{type:"object",additionalProperties:false,required:["name","currentWeek","primaryObjective","progression"],properties:{name:{type:"string"},currentWeek:{type:"integer",minimum:1,maximum:4},primaryObjective:{type:"string"},progression:{type:"array",minItems:4,maxItems:4,items:{type:"string"}}}},priorities:{type:"array",minItems:2,maxItems:4,items:{type:"object",additionalProperties:false,required:["type","label","reason"],properties:{type:{type:"string",enum:["strength","cardio","recovery"]},label:{type:"string"},reason:{type:"string"}}}},weeklyStructure:{type:"array",minItems:3,maxItems:7,items:{type:"object",additionalProperties:false,required:["day","title","focus","intensity"],properties:{day:{type:"string"},title:{type:"string"},focus:{type:"string"},intensity:{type:"string"}}}},today:{type:"object",additionalProperties:false,required:["recommendedType","headline","confidence","rationale","strengthFocus","cardioFocus","durationMinutes"],properties:{recommendedType:{type:"string",enum:["strength","cardio"]},headline:{type:"string"},confidence:{type:"integer",minimum:50,maximum:99},rationale:{type:"array",minItems:2,maxItems:4,items:{type:"string"}},strengthFocus:{type:"string"},cardioFocus:{type:"string"},durationMinutes:{type:"integer",minimum:20,maximum:120}}},strengthRules:{type:"array",minItems:2,maxItems:5,items:{type:"string"}},cardioRules:{type:"array",minItems:2,maxItems:5,items:{type:"string"}},recoveryRules:{type:"array",minItems:2,maxItems:5,items:{type:"string"}},photoRecommended:{type:"boolean"},photoReason:{type:"string"}}};
const NOTES_SCHEMA={type:"object",additionalProperties:false,required:["notes"],properties:{notes:{type:"array",items:{type:"object",additionalProperties:false,required:["exerciseTemplateId","notes"],properties:{exerciseTemplateId:{type:"string"},notes:{type:"string"}}}}}};
const VISUAL_SCHEMA={type:"object",additionalProperties:false,required:["summary","observations","programAdjustments","limitations"],properties:{summary:{type:"string"},observations:{type:"array",minItems:1,maxItems:6,items:{type:"string"}},programAdjustments:{type:"array",minItems:1,maxItems:6,items:{type:"string"}},limitations:{type:"string"}}};

function isSafeDataImage(v){return typeof v==="string"&&/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(v)&&v.length<1900000;}
function isStrength(s){return s?.source==="Hevy"||s?.category==="Musculation"||/strength|weight|muscu/i.test(`${s?.activityType||""} ${s?.title||""}`);}
function isRun(s){return /run|running|course|trail/i.test(`${s?.activityType||""} ${s?.category||""} ${s?.title||""}`);}
function isCardio(s){return !isStrength(s);}
function isHard(s){return Number(s.trainingLoad||0)>=90||Number(s.rpe||0)>=8.5||Number(s.anaerobicEffect||0)>=2.5||Number(s.aerobicEffect||0)>=4||/tempo|threshold|seuil|interval|sprint|race|vo2/i.test(`${s.activityType||""} ${s.title||""}`);}
function hasLegWork(s){return (s.exercises||[]).some(e=>/squat|leg|fente|lunge|deadlift|souleve|hip thrust|ischio|quad|mollet|calf/i.test(e.title||""));}
function muscleLabel(x){return({chest:"pectoraux",back:"dos",shoulders:"épaules",biceps:"biceps",triceps:"triceps",quads:"quadriceps",hamstrings:"ischio-jambiers",glutes:"fessiers",calves:"mollets",core:"tronc"})[x]||x;}
function normalizeGroup(v=""){const s=normalize(v).replace(/\s+/g,"_");const m={quads:"quadriceps",quad:"quadriceps",hamstring:"hamstrings",glute:"glutes",gluteus:"glutes",calf:"calves",back:"upper_back",upperback:"upper_back",shoulder:"shoulders"};return m[s]||s;}
function validType(v){return["warmup","normal","failure","dropset"].includes(v)?v:"normal";}
function config(env){return{auth:!!env.APP_TOKEN,hevy:!!env.HEVY_API_KEY,garmin:!!(env.INTERVALS_API_KEY&&env.INTERVALS_ATHLETE_ID),coach:!!env.OPENAI_API_KEY,hevyWrite:!!env.HEVY_API_KEY,garminWrite:!!(env.INTERVALS_API_KEY&&env.INTERVALS_ATHLETE_ID)};}
function auth(request,env){if(!env.APP_TOKEN)return json({error:"APP_TOKEN is not configured"},503);return request.headers.get("Authorization")===`Bearer ${env.APP_TOKEN}`?null:json({error:"Unauthorized"},401);}
async function fetchTimed(url,options={},timeout=20000){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);try{return await fetch(url,{...options,signal:c.signal});}catch(e){if(e?.name==="AbortError")throw new Error("Service distant: délai dépassé");throw e;}finally{clearTimeout(t);}}
function json(v,status=200){return new Response(JSON.stringify(v),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8"}});}
function safe(e){return String(e?.message||e||"Erreur inconnue").replace(/Bearer\s+\S+/gi,"Bearer [redacted]").slice(0,500);}
function clip(v,n){return String(v||"").slice(0,n);}
function clampInt(v,f,min,max){const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):f;}
function normalize(v=""){return String(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function ageDays(value,now=Date.now()){if(!value)return 999;const t=new Date(value).getTime();return Number.isFinite(t)?Math.max(0,(now-t)/86400000):999;}
function finiteAge(v){return Number.isFinite(v)&&v<900?round(v,1):null;}
function finiteOrNull(v){const n=Number(v);return v==null||v===""||!Number.isFinite(n)?null:n;}
function intOrNull(v){const n=Number(v);return v==null||v===""||!Number.isFinite(n)?null:Math.max(1,Math.round(n));}
function round(v,d=2){const n=Number(v);return Number.isFinite(n)?Number(n.toFixed(d)):0;}
