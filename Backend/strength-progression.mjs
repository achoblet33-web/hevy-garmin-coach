// Moteur de progression isolé et testable : aucune charge n'est inventée sans historique.
const norm = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const validRpe = value => {
  const n = Number(value);
  return value == null || value === "" || !Number.isFinite(n) || n < 1 || n > 10 ? null : n;
};
const positive = value => {
  const n = Number(value);
  return value == null || value === "" || !Number.isFinite(n) || n <= 0 ? null : n;
};
const roundLoad = value => Number.isFinite(value) && value > 0 ? Math.round(value * 2) / 2 : null;
const median = values => {
  const arr = values.filter(Number.isFinite).sort((a,b) => a-b);
  if (!arr.length) return null;
  const middle = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[middle] : (arr[middle-1] + arr[middle]) / 2;
};

// La formule Epley est une estimation, volontairement bornée aux séries <= 12 reps.
// Quand le RPE est absent, le calcul reste fondé sur charges + répétitions seulement.
export function estimatedCapacity(set) {
  const kg = positive(set?.weightKg), reps = Number(set?.reps), rpe = validRpe(set?.rpe);
  if (!kg || !Number.isFinite(reps) || reps < 2 || reps > 12) return null;
  const reserve = rpe == null ? 0 : Math.min(4, Math.max(0, 10-rpe));
  return kg * (1 + (reps + reserve) / 30);
}

export function buildStrengthHistory(sessions, templates, now=Date.now()) {
  const templateMap = new Map(templates.map(t=>[String(t.id),t]));
  const result = new Map();
  const ordered = (Array.isArray(sessions) ? sessions : [])
    .filter(s=>s?.source === "Hevy" && Number.isFinite(new Date(s.startedAt).getTime()))
    .sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt));
  for (const session of ordered) {
    const days = Math.max(0, (now-new Date(session.startedAt).getTime()) / 86400000);
    for (const exercise of Array.isArray(session.exercises) ? session.exercises : []) {
      const id = exercise?.exerciseTemplateId == null ? "" : String(exercise.exerciseTemplateId);
      if (!id) continue;
      const work = (Array.isArray(exercise.sets) ? exercise.sets : [])
        .filter(s=>!["warmup","dropset"].includes(String(s?.type || "normal")))
        .map(s=>({
          type:s.type || "normal", weightKg:positive(s.weightKg), reps:Number(s.reps),
          rpe:validRpe(s.rpe)
        }))
        .filter(s=>s.weightKg && s.reps>=1 && s.reps<=30);
      if (!work.length) continue;
      const comparable = work.filter(s=>estimatedCapacity(s) != null);
      const best = comparable.length
        ? [...comparable].sort((a,b)=>estimatedCapacity(b)-estimatedCapacity(a))[0]
        : [...work].sort((a,b)=>b.weightKg*b.reps-a.weightKg*a.reps)[0];
      if (!result.has(id)) {
        const template=templateMap.get(id) || {};
        result.set(id,{templateId:id,title:exercise.title || template.title || "Exercice",
          lastAt:session.startedAt,daysSince:days,exposures:0,
          lastSets:work.slice(0,5),best,latest:best,performances:[]});
      }
      const item=result.get(id);
      item.exposures += 1;
      if (item.performances.length < 5) {
        item.performances.push({at:session.startedAt,daysSince:days,
          weightKg:best.weightKg,reps:best.reps,rpe:best.rpe,capacity:estimatedCapacity(best)});
      }
    }
  }
  for (const item of result.values()) {
    const valid = item.performances.filter(p=>p.capacity != null && p.daysSince<=90).slice(0,3);
    item.capacityKg = median(valid.map(p=>p.capacity));
    item.rpeSamples=valid.filter(p=>p.rpe != null).length;
    item.consistent = valid.length >= 2 &&
      Math.max(...valid.map(p=>p.capacity)) / Math.min(...valid.map(p=>p.capacity)) <= 1.12;
    item.trendPct = valid.length >= 2
      ? Math.round((valid[0].capacity / valid[valid.length-1].capacity - 1)*1000)/10 : null;
  }
  return [...result.values()];
}

export function calculateWorkingLoad(history, scheme, readinessScore, title="") {
  const latest = history?.latest;
  if (!latest?.weightKg || !Number.isFinite(Number(latest.reps))) {
    return {weightKg:null,method:"calibration",confidence:"à calibrer",previous:null,
      reason:"Aucune série de référence fiable : calibrer la charge sur une première série facile."};
  }
  const lastRpe=validRpe(latest.rpe);
  const previous={weightKg:latest.weightKg,reps:latest.reps,rpe:lastRpe,daysSince:Math.round(history.daysSince)};
  // Evite les estimations de 1RM trompeuses issues de séries de 15–30 répétitions.
  const capacity=history.capacityKg || estimatedCapacity(latest);
  if (!capacity) {
    return {weightKg:null,method:"calibration",confidence:"à calibrer",previous,
      reason:"Dernières séries trop longues pour estimer une charge de travail fiable : première série de calibration."};
  }
  let candidate=capacity * scheme.intensity;
  const notes=[];
  const repsTarget=Number(scheme.reps)||8;
  const freshness=Number(history.daysSince||0);
  const maxIncrease=lastRpe == null ? 1.025 : lastRpe>=9 ? 1 : (lastRpe<=7.5 && latest.reps>=repsTarget ? 1.05 : 1.025);
  // Une conversion d'objectif (8 reps -> 5 reps, par exemple) n'autorise pas une hausse brusque.
  candidate=Math.min(candidate,latest.weightKg*maxIncrease);
  if (lastRpe != null && lastRpe>=9) {
    notes.push("Dernier RPE élevé : pas d'augmentation de charge.");
  } else if (lastRpe != null && lastRpe<=8 && latest.reps>=repsTarget) {
    notes.push("Marge et répétitions validées : progression prudente possible.");
  } else if (lastRpe == null) {
    notes.push("RPE passé absent : progression limitée d'après les charges et répétitions.");
  }
  if (freshness>35) {
    candidate*=.95;
    notes.push("Exercice peu pratiqué récemment : reprise prudente.");
  }
  if (readinessScore<50) {
    candidate*=.94;
    notes.push("Disponibilité faible : charge réduite.");
  } else if (readinessScore<65) {
    candidate*=.97;
    notes.push("Disponibilité moyenne : petite marge supplémentaire.");
  }
  if (/dumbbell|haltere/.test(norm(title)) && candidate>30 && latest.weightKg<=30) {
    candidate=30;
    notes.push("Plafond salle : haltères de 30 kg.");
  }
  const weightKg=roundLoad(candidate);
  const pct=weightKg ? Math.round((weightKg/latest.weightKg-1)*1000)/10 : null;
  const method=lastRpe != null ? "charges + reps + RPE" : "charges + reps";
  const confidence=freshness>90 || !history.consistent ? "indicative" :
    history.exposures>=3 && history.rpeSamples>=2 ? "étayée" : "modérée";
  notes.unshift("Référence : "+latest.weightKg+" kg × "+latest.reps+" rep"+(lastRpe!=null?" · RPE "+lastRpe:" · RPE non renseigné")+".");
  if (pct != null) notes.push("Charge proposée : "+weightKg+" kg ("+(pct>0?"+":"")+pct+" % par rapport à la référence).");
  notes.push("Valeur indicative : ajuste la première série à la cible RPE.");
  return {weightKg,method,confidence,previous,changePct:pct,
    trendPct:history.trendPct,reason:notes.join(" ")};
}

// Variété de plans de mouvement : évite trois développés quasi identiques
// ou trois curls successifs lorsqu'une alternative compatible est disponible.
export function movementPattern(title, group) {
  const t=norm(title);
  if (group==="chest") return /pec deck|fly|ecarte|crossover/.test(t)?"isolation":
    /incline|incline/.test(t)?"incline-press":"horizontal-press";
  if (group==="back") return /pulldown|traction|pull.?up|chin.?up|tirage poitrine/.test(t)
    ?"vertical-pull":/face pull|reverse fly|rear delt/.test(t)?"rear-delt":"horizontal-pull";
  if (group==="shoulders") return /lateral|elevation laterale/.test(t)?"lateral-raise":
    /rear|face pull|oiseau/.test(t)?"rear-delt":/press|developpe/.test(t)?"vertical-press":"front-raise";
  if (group==="quadriceps") return /leg extension/.test(t)?"knee-isolation":
    /lunge|fente|split/.test(t)?"unilateral-knee":"squat";
  if (group==="hamstrings") return /leg curl/.test(t)?"knee-flexion":"hinge";
  if (group==="glutes") return /hip thrust/.test(t)?"hip-thrust":/abduction|kickback/.test(t)?"glute-isolation":"hinge";
  if (group==="biceps") return /preacher|pupitre/.test(t)?"preacher-curl":/hammer|marteau/.test(t)?"hammer-curl":"curl";
  if (group==="triceps") return /dip/.test(t)?"dips":/overhead|au dessus/.test(t)?"overhead-extension":"triceps-extension";
  if (group==="calves") return /seated|assis/.test(t)?"seated-calf":"standing-calf";
  if (group==="core") return /plank|gainage/.test(t)?"stability":/raise|releve/.test(t)?"hip-flexion":"trunk-flexion";
  return group || "other";
}

export function selectCoherentExercises(candidates, groups, targetCount) {
  const source=[...candidates].map(c=>({...c,pattern:movementPattern(c.template?.title,c.group)}));
  const selected=[], used=new Set(), patterns=new Map(), counts=new Map();
  const add = c => {
    selected.push(c); used.add(String(c.template.id));
    counts.set(c.group,(counts.get(c.group)||0)+1);
    const key=c.group+":"+c.pattern;
    patterns.set(key,(patterns.get(key)||0)+1);
  };
  // Garantir au moins un exercice pour chaque groupe demandé.
  for (const group of groups) {
    const choices=source.filter(c=>c.group===group && !used.has(String(c.template.id)));
    choices.sort((a,b)=>(Number(b.compound)-Number(a.compound))*8 + b.score-a.score);
    if (choices[0]) add(choices[0]);
  }
  while (selected.length<targetCount) {
    const available=source.filter(c=>!used.has(String(c.template.id)) &&
      (counts.get(c.group)||0)<Math.max(2,Math.ceil(targetCount/groups.length)+1));
    if (!available.length) break;
    const scored=available.map(c=>{
      const duplicates=patterns.get(c.group+":"+c.pattern)||0;
      const hasAlternative=available.some(x=>x.group===c.group && x.pattern!==c.pattern);
      return {c,score:c.score + (duplicates===0?18:-27*duplicates)
        - (counts.get(c.group)||0)*13 + (hasAlternative&&duplicates? -24:0)};
    }).sort((a,b)=>b.score-a.score);
    if (!scored.length || (scored[0].score<0 && selected.length>=groups.length)) break;
    add(scored[0].c);
  }
  // Polyarticulaires au début, mais alterner les groupes autant que possible.
  const remaining=[...selected].sort((a,b)=>Number(b.compound)-Number(a.compound)
    || groups.indexOf(a.group)-groups.indexOf(b.group));
  const ordered=[];
  while (remaining.length) {
    const last=ordered[ordered.length-1];
    const index=remaining.findIndex(c=>!last || c.group!==last.group);
    ordered.push(remaining.splice(index>=0?index:0,1)[0]);
  }
  return ordered;
}
