import base from "./worker-v224.js";

const VERSION = "2.3.0";
const HEVY = "https://api.hevyapp.com/v1";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store"
};

// Source de vérité TrainSync pour cette salle. Le Coach v2.3 ne doit jamais
// proposer un exercice nécessitant un équipement absent de cette liste.
const GYM_EQUIPMENT = [
  "Cage à squat",
  "Leg extension",
  "Barre libre + disques + protection au sol",
  "Banc plat",
  "Banc incliné",
  "Vertical row",
  "Station développé couché",
  "Station développé incliné",
  "Preacher curl + machine assistée",
  "Développé militaire sur banc",
  "Poulie vis-à-vis réglable",
  "Extension du dos / banc lombaires",
  "Tirage poitrine machine à charges",
  "Barre de traction",
  "Station dips + relevés de jambes",
  "Hip thrust à charges",
  "Leg curl allongé",
  "Adduction / abduction de hanche à la poulie",
  "Kettlebells",
  "Zone tapis + sandbag + medicine ball",
  "Haltères jusqu’à 30 kg",
  "Barre hexagonale",
  "Barre EZ",
  "TRX",
  "Barre guidée / Smith machine + banc"
];

const GROUPS = {
  chest: "Pectoraux",
  back: "Dos",
  shoulders: "Épaules",
  biceps: "Biceps",
  triceps: "Triceps",
  quadriceps: "Quadriceps",
  hamstrings: "Ischio-jambiers",
  glutes: "Fessiers",
  calves: "Mollets",
  core: "Abdos / Core"
};

const ASSOCIATIONS = [
  { id:"chest_triceps", label:"Pectoraux + triceps", groups:["chest","triceps"], score:16, min:35, reason:"Poussée cohérente : les triceps assistent les développés puis peuvent être finis en isolation." },
  { id:"back_biceps", label:"Dos + biceps", groups:["back","biceps"], score:16, min:35, reason:"Tirage cohérent : le dos reste prioritaire et les biceps complètent les mouvements de traction." },
  { id:"chest_back", label:"Pectoraux + dos", groups:["chest","back"], score:15, min:55, reason:"Association agonistes/antagonistes du haut du corps, utile pour équilibrer poussée et tirage dans la même séance." },
  { id:"shoulders_arms", label:"Épaules + biceps + triceps", groups:["shoulders","biceps","triceps"], score:11, min:50, reason:"Séance haut du corps ciblée, avec une fatigue systémique modérée et un gros travail local." },
  { id:"push", label:"Pectoraux + épaules + triceps", groups:["chest","shoulders","triceps"], score:14, min:55, reason:"Push complet : mouvements de base en premier, puis travail complémentaire des deltoïdes et triceps." },
  { id:"pull", label:"Dos + biceps + épaules", groups:["back","biceps","shoulders"], score:13, min:55, reason:"Pull complet : dorsaux/haut du dos en priorité, puis biceps et deltoïdes postérieurs." },
  { id:"legs", label:"Quadriceps + ischios + fessiers", groups:["quadriceps","hamstrings","glutes"], score:15, min:55, reason:"Bas du corps complet : dominante genou et dominante hanche sont réparties pour un développement équilibré." },
  { id:"posterior", label:"Dos + ischios + fessiers", groups:["back","hamstrings","glutes"], score:8, min:65, reason:"Chaîne postérieure complète, réservée aux jours où la récupération et la course le permettent." },
  { id:"arms", label:"Biceps + triceps", groups:["biceps","triceps"], score:8, min:30, reason:"Association antagoniste compacte, utile pour renforcer les bras sans grosse fatigue générale." },
  { id:"upper", label:"Pectoraux + dos + épaules", groups:["chest","back","shoulders"], score:12, min:70, reason:"Haut du corps complet pour séance longue, avec alternance poussée/tirage puis deltoïdes." }
];

const OBJECTIVES = {
  force: {
    id:"force", label:"Force", summary:"Séries courtes, charges élevées, récupération longue.",
    main:{ reps:5, sets:4, intensity:.85, rpe:[7.5,8,8,8.5], rest:210 },
    secondary:{ reps:6, sets:3, intensity:.80, rpe:[7.5,8,8.5], rest:150 },
    isolation:{ reps:10, sets:3, intensity:.70, rpe:[7,7.5,8], rest:90 }
  },
  hypertrophy: {
    id:"hypertrophy", label:"Hypertrophie", summary:"Volume modéré, tension et progression mesurable.",
    main:{ reps:8, sets:4, intensity:.75, rpe:[7.5,8,8.5,9], rest:150 },
    secondary:{ reps:10, sets:3, intensity:.72, rpe:[7.5,8,8.5], rest:120 },
    isolation:{ reps:12, sets:3, intensity:.65, rpe:[8,8.5,9], rest:75 }
  },
  endurance: {
    id:"endurance", label:"Endurance musculaire", summary:"Séries longues, charge modérée et récupération plus courte.",
    main:{ reps:15, sets:3, intensity:.62, rpe:[6.5,7,7.5], rest:90 },
    secondary:{ reps:18, sets:3, intensity:.58, rpe:[6.5,7,7.5], rest:75 },
    isolation:{ reps:20, sets:3, intensity:.55, rpe:[7,7.5,8], rest:60 }
  }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status:204, headers:CORS });

    if ((url.pathname === "/health" || url.pathname === "/status") && request.method === "GET") {
      const response = await base.fetch(request, env, ctx);
      if (!response.ok) return response;
      const data = await response.json().catch(() => ({}));
      return json({
        ...data,
        version:VERSION,
        strengthOnlyCoach:true,
        fixedGymEquipment:true,
        gymEquipmentCount:GYM_EQUIPMENT.length,
        strengthObjectives:["force","hypertrophy","endurance"],
        delavierProgramming:true
      }, response.status);
    }

    if (url.pathname === "/coach/gym-profile" && request.method === "GET") {
      const denied = auth(request, env); if (denied) return denied;
      return json({ ok:true, version:VERSION, equipment:GYM_EQUIPMENT, immutable:true });
    }

    if (url.pathname === "/coach/strength-suggestions-v3" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      const body = await request.json().catch(() => ({}));
      const objective = objectiveOf(body.objective);
      const durationMinutes = clampInt(body.durationMinutes, 60, 30, 120);
      const sessions = cleanSessions(body.sessions, 520);
      const exposure = buildMuscleExposure(sessions);
      const lowerBodyProtected = shouldProtectLegs(sessions, body.clubSchedule);
      const suggestions = rankAssociations({ objective, durationMinutes, exposure, lowerBodyProtected }).slice(0,4);
      return json({
        ok:true,
        version:VERSION,
        objective:{ id:objective.id, label:objective.label, summary:objective.summary },
        durationMinutes,
        suggestions,
        exposure,
        lowerBodyProtected,
        equipmentCount:GYM_EQUIPMENT.length
      });
    }

    if (url.pathname === "/coach/strength-plan-v3" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      if (!env.HEVY_API_KEY) return json({ error:"HEVY_API_KEY is not configured" }, 503);
      const body = await request.json().catch(() => ({}));
      const objective = objectiveOf(body.objective);
      const durationMinutes = clampInt(body.durationMinutes, 60, 30, 120);
      const groups = normalizeGroups(body.groups);
      if (!groups.length) return json({ error:"Choisis au moins un groupe musculaire." }, 400);
      const sessions = cleanSessions(body.sessions, 520);
      try {
        const templates = await fetchExerciseTemplates(env.HEVY_API_KEY);
        const plan = buildPlan({
          objective,
          durationMinutes,
          groups,
          associationId:String(body.associationId || "custom"),
          sessions,
          templates,
          customFocus:clip(body.customFocus || "", 300),
          readiness:body.readiness || {},
          clubSchedule:body.clubSchedule || { sessions:[] }
        });
        return json({ ok:true, version:VERSION, plan, equipmentCount:GYM_EQUIPMENT.length });
      } catch (error) {
        return json({ error:safe(error), version:VERSION }, 500);
      }
    }

    const response = await base.fetch(request, env, ctx);
    return withVersion(response);
  }
};

function buildPlan({ objective, durationMinutes, groups, associationId, sessions, templates, customFocus, readiness, clubSchedule }) {
  const strengthSessions = sessions.filter(isStrengthSession);
  const history = mapHistory(strengthSessions, templates);
  const supported = templates
    .map(t => ({ ...t, equipmentMatch:equipmentForExercise(t.title || ""), canonicalGroup:groupFromTemplate(t) }))
    .filter(t => t.equipmentMatch && groups.includes(t.canonicalGroup));

  const historyById = new Map(history.map(h => [h.templateId, h]));
  const candidates = [];
  for (const template of supported) {
    const id = String(template.id);
    const hist = historyById.get(id) || null;
    candidates.push({
      template,
      history:hist,
      group:template.canonicalGroup,
      compound:isCompound(template.title || ""),
      score:exerciseScore(template, hist, groups)
    });
  }
  candidates.sort((a,b) => b.score-a.score);

  const targetCount = exerciseCountForDuration(durationMinutes, groups.length);
  const selected = [];
  const used = new Set();

  // Couverture obligatoire de chaque groupe sélectionné.
  for (const group of groups) {
    const candidate = candidates.find(c => c.group === group && !used.has(String(c.template.id)));
    if (candidate) { selected.push(candidate); used.add(String(candidate.template.id)); }
  }

  // Priorité aux mouvements structurants, puis aux compléments/isolation.
  for (const candidate of candidates) {
    if (selected.length >= targetCount) break;
    const id = String(candidate.template.id);
    if (used.has(id)) continue;
    const groupCount = selected.filter(x => x.group === candidate.group).length;
    const softCap = groups.length === 1 ? targetCount : Math.ceil(targetCount / groups.length) + 1;
    if (groupCount >= softCap) continue;
    selected.push(candidate); used.add(id);
  }

  if (!selected.length) throw new Error("Aucun exercice Hevy compatible avec le matériel de la salle n’a été trouvé pour cette sélection.");

  selected.sort((a,b) => Number(b.compound)-Number(a.compound) || groups.indexOf(a.group)-groups.indexOf(b.group));
  const lowerBodyProtected = shouldProtectLegs(sessions, clubSchedule);
  const readinessScore = readinessValue(readiness);
  const exercises = selected.slice(0,targetCount).map((candidate,index) =>
    prescribeExercise(candidate, objective, index, durationMinutes, readinessScore)
  );

  // Un dropset maximum, uniquement quand l'objectif et la récupération le justifient.
  if (objective.id === "hypertrophy" && durationMinutes >= 60 && readinessScore >= 60) {
    const dropTarget = [...exercises].reverse().find(ex => !ex.compound && ex.sets.some(s => Number(s.weightKg) > 0));
    if (dropTarget) {
      const last = [...dropTarget.sets].reverse().find(s => s.type === "normal" && Number(s.weightKg) > 0);
      if (last) dropTarget.sets.push({ type:"dropset", weightKg:roundLoad(Number(last.weightKg)*.70), reps:Number(last.reps)+4, rpe:9 });
    }
  }

  const title = `${groups.map(g => GROUPS[g]).join(" + ")} · ${objective.label}`;
  const rationale = buildRationale({ groups, objective, history, lowerBodyProtected, customFocus });
  const totalSets = exercises.reduce((sum,ex) => sum + ex.sets.length,0);
  const advancedSets = {
    warmups:exercises.reduce((n,ex)=>n+ex.sets.filter(s=>s.type==="warmup").length,0),
    dropsets:exercises.reduce((n,ex)=>n+ex.sets.filter(s=>s.type==="dropset").length,0)
  };

  const routine = {
    title:clip(`${title} · TrainSync`,120),
    notes:clip([
      `Objectif : ${objective.label}.`,
      `Groupes : ${groups.map(g=>GROUPS[g]).join(" + ")}.`,
      `Matériel : uniquement inventaire salle TrainSync (${GYM_EQUIPMENT.length} équipements).`,
      rationale
    ].join("\n"),900),
    exercises:exercises.map(ex => ({
      exerciseTemplateId:ex.exerciseTemplateId,
      title:ex.title,
      restSeconds:ex.restSeconds,
      notes:ex.notes,
      sets:ex.sets
    }))
  };

  return {
    id:`strength-v3-${Date.now()}`,
    kind:"Musculation",
    title,
    durationMinutes,
    objective:{ id:objective.id, label:objective.label },
    groups,
    groupLabels:groups.map(g=>GROUPS[g]),
    associationId,
    rationale,
    totalSets,
    advancedSets,
    equipmentLocked:true,
    equipmentCount:GYM_EQUIPMENT.length,
    exercises,
    publish:{ hevyRoutine:routine }
  };
}

function prescribeExercise(candidate, objective, index, durationMinutes, readinessScore) {
  const title = candidate.template.title || candidate.history?.title || "Exercice";
  const tier = candidate.compound ? (index < 2 ? "main" : "secondary") : "isolation";
  const scheme = objective[tier];
  const history = candidate.history;
  const reference = history?.best || null;
  let workingWeight = estimateWorkingWeight(reference, scheme.intensity, readinessScore);
  const normalSets = [];
  for (let i=0;i<scheme.sets;i++) {
    const rpe = scheme.rpe[Math.min(i,scheme.rpe.length-1)];
    normalSets.push({ type:"normal", weightKg:workingWeight, reps:scheme.reps, rpe });
  }

  const warmups = [];
  if (candidate.compound && index < 3) {
    if (workingWeight) {
      warmups.push({ type:"warmup", weightKg:roundLoad(workingWeight*.50), reps:10, rpe:4 });
      if (objective.id !== "endurance") warmups.push({ type:"warmup", weightKg:roundLoad(workingWeight*.70), reps:6, rpe:5.5 });
    } else {
      warmups.push({ type:"warmup", weightKg:null, reps:10, rpe:4 });
    }
  }

  const equipment = candidate.template.equipmentMatch;
  const novelty = history ? (history.daysSince > 45 ? "reintroduced" : "progressed") : "new";
  const objectiveText = objective.id === "force"
    ? "Force : aucune série de 4 reps imposée par défaut ; la cible principale est 5 reps sur les mouvements structurants."
    : objective.id === "hypertrophy"
      ? "Hypertrophie : séries moyennes, contrôle et tension ; pas de séries très courtes sauf échauffement technique."
      : "Endurance musculaire : séries longues et récupération courte, sans transformer la séance en travail de force.";
  const note = [
    `Matériel : ${equipment}.`,
    techniqueNote(title),
    objectiveText,
    history ? `Référence Hevy : ${Math.round(history.daysSince)} j depuis la dernière exposition identifiable.` : "Nouveau mouvement : première séance de calibration, reste volontairement en marge.",
    novelty === "reintroduced" ? "Réintroduction : conserve une marge supplémentaire sur la première série de travail." : null
  ].filter(Boolean).join(" ");

  return {
    exerciseTemplateId:String(candidate.template.id),
    title,
    primaryGroup:candidate.group,
    groupLabel:GROUPS[candidate.group],
    compound:candidate.compound,
    equipment,
    novelty,
    restSeconds:scheme.rest,
    notes:clip(note,620),
    sets:[...warmups,...normalSets]
  };
}

function rankAssociations({ objective, durationMinutes, exposure, lowerBodyProtected }) {
  const maxSets = Math.max(1,...Object.values(exposure).map(x=>Number(x.weightedSets||0)));
  return ASSOCIATIONS.map(item => {
    const stats = item.groups.map(g=>exposure[g] || { weightedSets:0, daysSince:99 });
    const avgSets = stats.reduce((a,b)=>a+Number(b.weightedSets||0),0)/stats.length;
    const avgDays = stats.reduce((a,b)=>a+Math.min(30,Number(b.daysSince??30)),0)/stats.length;
    let score = item.score*2 + (maxSets-avgSets)*1.4 + avgDays*.35;
    if (durationMinutes < item.min) score -= (item.min-durationMinutes)*1.5;
    if (item.groups.length===3 && durationMinutes<55) score -= 14;
    if (objective.id==="force" && ["chest_triceps","back_biceps","legs","chest_back"].includes(item.id)) score += 4;
    if (objective.id==="hypertrophy" && ["push","pull","shoulders_arms","chest_back"].includes(item.id)) score += 4;
    if (objective.id==="endurance" && item.groups.length===3) score += 3;
    if (lowerBodyProtected && item.groups.some(g=>["quadriceps","hamstrings","glutes"].includes(g))) score -= 35;
    const least = item.groups.map((g,i)=>({group:g,...stats[i]})).sort((a,b)=>Number(a.weightedSets||0)-Number(b.weightedSets||0))[0];
    return {
      id:item.id,
      label:item.label,
      groups:item.groups,
      score:Math.round(score),
      reason:item.reason,
      context:lowerBodyProtected && item.groups.some(g=>["quadriceps","hamstrings","glutes"].includes(g))
        ? "Moins prioritaire aujourd’hui : TrainSync protège les jambes autour de la charge de course récente / club."
        : Number(least?.daysSince||0)>=7
          ? `${GROUPS[least.group]} a été moins sollicité récemment : cette association remet du stimulus là où il manque.`
          : "Association compatible avec l’historique récent et la durée choisie.",
      objective:objective.label,
      recommendedDuration:`${item.min} min et +`
    };
  }).sort((a,b)=>b.score-a.score);
}

async function fetchExerciseTemplates(apiKey) {
  const headers = { "api-key":apiKey, Accept:"application/json" };
  const templates = [];
  let pageCount = 20;
  for (let page=1;page<=pageCount;page++) {
    const r = await fetchTimed(`${HEVY}/exercise_templates?page=${page}&pageSize=100`, { headers }, 15000);
    if (!r.ok) throw new Error(`Hevy exercise templates: HTTP ${r.status}`);
    const data = await r.json();
    const batch = Array.isArray(data.exercise_templates) ? data.exercise_templates : [];
    if (!batch.length) break;
    templates.push(...batch);
    const remotePages = Number(data.page_count||0);
    if (remotePages) pageCount = Math.min(20,remotePages);
    if (batch.length<100 || templates.length>=1500) break;
  }
  return templates;
}

function mapHistory(sessions, templates) {
  const templateMap = new Map(templates.map(t=>[String(t.id),t]));
  const now = Date.now();
  const map = new Map();
  for (const session of [...sessions].sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt))) {
    for (const ex of Array.isArray(session.exercises)?session.exercises:[]) {
      const id = ex.exerciseTemplateId ? String(ex.exerciseTemplateId) : null;
      if (!id) continue;
      const template = templateMap.get(id) || {};
      const work = (ex.sets||[]).filter(s=>s.type!=="warmup" && (Number(s.reps)>0 || Number(s.weightKg)>0));
      if (!work.length) continue;
      if (!map.has(id)) {
        map.set(id,{
          templateId:id,
          title:ex.title || template.title || "Exercice",
          group:groupFromTemplate(template) || classifyTitle(ex.title||""),
          daysSince:Math.max(0,(now-new Date(session.startedAt).getTime())/86400000),
          exposures:1,
          best:chooseReferenceSet(work),
          lastSets:work.slice(0,5)
        });
      } else map.get(id).exposures += 1;
    }
  }
  return [...map.values()];
}

function buildMuscleExposure(sessions) {
  const now=Date.now();
  const out=Object.fromEntries(Object.keys(GROUPS).map(k=>[k,{weightedSets:0,daysSince:99}]));
  for (const session of sessions) {
    if (!isStrengthSession(session)) continue;
    const time=new Date(session.startedAt||0).getTime();
    if (!Number.isFinite(time)||!time) continue;
    const days=Math.max(0,(now-time)/86400000);
    if (days>42) continue;
    const decay=Math.exp(-days/24);
    for (const ex of Array.isArray(session.exercises)?session.exercises:[]) {
      const group=classifyTitle(ex.title||"");
      if (!group||!out[group]) continue;
      const sets=(ex.sets||[]).filter(s=>s.type!=="warmup").length||1;
      out[group].weightedSets += sets*decay;
      out[group].daysSince=Math.min(out[group].daysSince,days);
    }
  }
  for (const value of Object.values(out)) {
    value.weightedSets=Math.round(value.weightedSets*10)/10;
    value.daysSince=value.daysSince>=99?99:Math.round(value.daysSince*10)/10;
  }
  return out;
}

function exerciseScore(template,hist,groups) {
  let score=groups.includes(template.canonicalGroup)?50:0;
  if (hist) {
    score += Math.min(10,hist.exposures)*2;
    if (hist.daysSince<2.5) score -= 18;
    else if (hist.daysSince<=21) score += 6;
    else if (hist.daysSince>=35 && hist.daysSince<=180) score += 10;
  } else score += 4;
  if (isCompound(template.title||"")) score += 8;
  return score;
}

function estimateWorkingWeight(reference,intensity,readinessScore) {
  if (!reference) return null;
  const weight=Number(reference.weightKg||0), reps=Number(reference.reps||0);
  if (!(weight>0) || !(reps>0)) return null;
  const e1rm=weight*(1+reps/30);
  const fatigueFactor=readinessScore<50?.94:readinessScore<65?.97:1;
  return roundLoad(e1rm*intensity*fatigueFactor);
}

function chooseReferenceSet(sets) {
  if (!sets.length) return null;
  return [...sets].sort((a,b)=>{
    const ea=Number(a.weightKg||0)*(1+Number(a.reps||0)/30);
    const eb=Number(b.weightKg||0)*(1+Number(b.reps||0)/30);
    return eb-ea;
  })[0];
}

function equipmentForExercise(title) {
  const t=normalize(title);
  const rules=[
    [/leg extension/,"Leg extension"],
    [/lying leg curl|leg curl allonge|prone leg curl/,"Leg curl allongé"],
    [/hip thrust/,"Hip thrust à charges"],
    [/back extension|hyperextension|extension lombaire/,"Extension du dos / banc lombaires"],
    [/pec deck|butterfly/,"Pec deck"],
    [/lat pulldown|pulldown|tirage poitrine|tirage vertical/,"Tirage poitrine machine à charges"],
    [/vertical row/,"Vertical row"],
    [/pull[- ]?up|chin[- ]?up|traction/,"Barre de traction"],
    [/dip|releve de jambes|hanging leg raise/,"Station dips + relevés de jambes"],
    [/preacher|curl pupitre/,"Preacher curl + machine assistée"],
    [/cable|poulie|cross.?over|face pull|pushdown|triceps rope|cable fly|cable curl|adduction|abduction/,"Poulie vis-à-vis réglable"],
    [/smith/,"Barre guidée / Smith machine + banc"],
    [/trap bar|hex bar/,"Barre hexagonale"],
    [/ez bar|barre ez/,"Barre EZ"],
    [/trx|suspension/,"TRX"],
    [/kettlebell|kb /,"Kettlebells"],
    [/sandbag|medicine ball|med ball|slam ball/,"Zone tapis + sandbag + medicine ball"],
    [/dumbbell|haltere/,"Haltères jusqu’à 30 kg"],
    [/bench press|developpe couche/,"Station développé couché / banc + barre"],
    [/incline press|developpe incline/,"Station développé incliné / banc incliné"],
    [/overhead press|military press|developpe militaire/,"Développé militaire sur banc"],
    [/squat|front squat|back squat/,"Cage à squat + barre libre"],
    [/deadlift|souleve de terre|romanian|rdl|good morning|barbell row|bent over row/,"Barre libre + disques + protection au sol"],
    [/barbell|barre /,"Barre libre + disques"],
    [/push[- ]?up|pompe|plank|gainage|bodyweight/,"Poids du corps / tapis"],
    [/lunge|fente|split squat|bulgarian/,"Haltères / cage / banc"],
    [/calf raise|mollet/,"Haltères / barre guidée / banc"],
    [/row|rowing|tirage horizontal/,"Vertical row / haltères / poulie"],
    [/fly|ecarte/,"Poulie vis-à-vis / haltères / pec deck"],
    [/curl/,"Haltères / barre EZ / preacher curl / poulie"],
    [/triceps|skull crusher|extension triceps/,"Barre EZ / haltères / poulie / dips"]
  ];
  for (const [rx,label] of rules) if (rx.test(t)) return label;
  return null;
}

function groupFromTemplate(template) {
  const raw=normalize(String(template?.primary_muscle_group||""));
  if (/chest|pector/.test(raw)) return "chest";
  if (/lat|back|trap/.test(raw)) return "back";
  if (/shoulder|delto/.test(raw)) return "shoulders";
  if (/biceps/.test(raw)) return "biceps";
  if (/triceps/.test(raw)) return "triceps";
  if (/quad/.test(raw)) return "quadriceps";
  if (/hamstring/.test(raw)) return "hamstrings";
  if (/glute/.test(raw)) return "glutes";
  if (/calf|calves/.test(raw)) return "calves";
  if (/abdom|core/.test(raw)) return "core";
  return classifyTitle(template?.title||"");
}

function classifyTitle(title) {
  const t=normalize(title);
  if (/bench|chest press|pec deck|fly|ecarte|pompe|push up/.test(t)) return "chest";
  if (/pulldown|pull up|chin up|row|rowing|tirage|dorsal|shrug/.test(t)) return "back";
  if (/shoulder|overhead|military|lateral raise|front raise|rear delt|oiseau|face pull/.test(t)) return "shoulders";
  if (/curl|biceps/.test(t)) return "biceps";
  if (/triceps|pushdown|skull|extension.*bras|close grip/.test(t)) return "triceps";
  if (/leg extension|squat|lunge|fente|split squat|quad/.test(t)) return "quadriceps";
  if (/leg curl|hamstring|rdl|romanian|good morning/.test(t)) return "hamstrings";
  if (/hip thrust|glute|fessier|kickback/.test(t)) return "glutes";
  if (/calf|mollet/.test(t)) return "calves";
  if (/crunch|plank|gainage|leg raise|abdom|core/.test(t)) return "core";
  return null;
}

function isCompound(title) {
  const t=normalize(title);
  return /bench press|developpe couche|incline press|developpe incline|overhead press|military press|squat|deadlift|souleve|rdl|romanian|hip thrust|row|rowing|pulldown|pull up|chin up|traction|dip|split squat|lunge|fente/.test(t);
}

function techniqueNote(title) {
  const t=normalize(title);
  if (/bench|developpe couche|incline press|developpe incline/.test(t)) return "Stabilise les omoplates, garde une trajectoire contrôlée et une amplitude confortable sans rebond.";
  if (/fly|ecarte|pec deck/.test(t)) return "Garde les coudes légèrement fléchis, contrôle l’étirement et rapproche les bras sans à-coup.";
  if (/row|rowing|tirage horizontal/.test(t)) return "Initie le tirage avec les omoplates et évite de transformer le mouvement en balancement lombaire.";
  if (/pulldown|traction|pull up|chin up/.test(t)) return "Conserve le buste stable et pense à tirer les coudes vers le bas plutôt qu’à seulement fléchir les bras.";
  if (/squat/.test(t)) return "Gaine le tronc, contrôle la descente et conserve une trajectoire stable des genoux et du bassin.";
  if (/leg extension/.test(t)) return "Monte sans élan et contrôle le retour ; cherche la contraction du quadriceps plutôt que la vitesse.";
  if (/leg curl/.test(t)) return "Garde le bassin stable contre le support et contrôle la phase de retour.";
  if (/hip thrust/.test(t)) return "Termine par une extension de hanche contrôlée avec forte contraction des fessiers, sans hyperextension lombaire.";
  if (/rdl|romanian|souleve|deadlift/.test(t)) return "Charnière de hanche : dos gainé, barre proche du corps et amplitude limitée par le contrôle des ischios.";
  if (/lateral raise|elevation laterale/.test(t)) return "Monte sans élan, garde une légère flexion du coude et contrôle la descente.";
  if (/curl/.test(t)) return "Garde le bras stable et évite de transformer la répétition en mouvement d’épaule.";
  if (/triceps|pushdown|skull/.test(t)) return "Stabilise le bras et cherche l’extension du coude sans compenser avec l’épaule.";
  return "Exécution contrôlée, amplitude confortable et répétitions techniquement propres avant toute hausse de charge.";
}

function buildRationale({groups,objective,history,lowerBodyProtected,customFocus}) {
  const exposures=groups.map(g=>{
    const related=history.filter(h=>h.group===g);
    const days=related.length?Math.min(...related.map(h=>h.daysSince)):null;
    return days==null?`${GROUPS[g]} : peu ou pas de référence récente`:`${GROUPS[g]} : dernière exposition identifiable il y a ${Math.round(days)} j`;
  });
  return [
    `Séance ${objective.label.toLowerCase()} construite uniquement avec le matériel déclaré dans TrainSync.`,
    exposures.join(" · "),
    lowerBodyProtected?"La charge de course récente / club est prise en compte pour éviter de surcharger inutilement les jambes.":null,
    customFocus?`Adaptation demandée : ${customFocus}.`:null,
    "Principe de programmation : mouvements structurants d’abord, compléments ensuite, avec gestion de la récupération et des points moins sollicités."
  ].filter(Boolean).join(" ");
}

function shouldProtectLegs(sessions,clubSchedule) {
  const now=Date.now();
  const recentHardRun=sessions.some(s=>{
    const days=(now-new Date(s.startedAt||0).getTime())/86400000;
    if (!(days>=0&&days<=2.25)) return false;
    const text=normalize(`${s.category||""} ${s.activityType||""} ${s.title||""}`);
    if (!/course|run|running|trail/.test(text)) return false;
    return Number(s.trainingLoad||0)>=55 || Number(s.rpe||0)>=8 || Number(s.durationMinutes||0)>=70;
  });
  const club=(Array.isArray(clubSchedule?.sessions)?clubSchedule.sessions:[]).some(s=>{
    if (!s?.date) return false;
    const time=new Date(`${s.date}T12:00:00`).getTime();
    if (!Number.isFinite(time)) return false;
    return Math.abs(time-now)/86400000<=2.25 && ["hard","unknown"].includes(String(s.intensity||"unknown"));
  });
  return recentHardRun||club;
}

function isStrengthSession(s) {
  if (s?.source==="Hevy") return true;
  return /musculation|strength|weight/i.test(`${s?.category||""} ${s?.activityType||""}`);
}
function cleanSessions(input,limit) {
  return (Array.isArray(input)?input:[]).filter(s=>s&&!String(s.id||"").startsWith("demo-")).sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt)).slice(0,limit);
}
function normalizeGroups(value) { return [...new Set((Array.isArray(value)?value:[]).map(String).filter(x=>GROUPS[x]))].slice(0,3); }
function objectiveOf(value) { return OBJECTIVES[String(value||"").toLowerCase()] || OBJECTIVES.hypertrophy; }
function exerciseCountForDuration(minutes,groupCount) {
  const base=minutes<=30?4:minutes<=45?5:minutes<=60?6:minutes<=75?7:8;
  return Math.max(groupCount,base);
}
function readinessValue(r) {
  const sleep=clampInt(r?.sleep,3,1,5), energy=clampInt(r?.energy,3,1,5), soreness=clampInt(r?.soreness,2,1,5), motivation=clampInt(r?.motivation,3,1,5);
  return Math.round(((sleep+energy+motivation+(6-soreness))/20)*100);
}
async function fetchTimed(url,options={},timeout=20000) {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout);
  try { return await fetch(url,{...options,signal:controller.signal}); }
  catch(error){ if(error?.name==="AbortError") throw new Error("Service distant : délai dépassé"); throw error; }
  finally { clearTimeout(timer); }
}
async function withVersion(response) {
  if (!(response.headers.get("Content-Type")||"").includes("application/json")) return response;
  try { const data=await response.json(); if(data&&typeof data==="object") data.version=VERSION; return json(data,response.status); }
  catch { return response; }
}
function auth(request,env){ if(!env.APP_TOKEN)return json({error:"APP_TOKEN is not configured"},503); return request.headers.get("Authorization")===`Bearer ${env.APP_TOKEN}`?null:json({error:"Unauthorized"},401); }
function clampInt(value,fallback,min,max){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;}
function roundLoad(value){const n=Number(value);return !Number.isFinite(n)||n<=0?null:Math.round(n*2)/2;}
function clip(value,max){return String(value||"").slice(0,max);}
function normalize(value=""){return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function safe(error){return String(error?.message||error||"Erreur inconnue").replace(/Bearer\s+\S+/gi,"Bearer [redacted]").slice(0,700);}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8"}});}
