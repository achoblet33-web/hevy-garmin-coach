// TrainSync Performance Coach — independent, explainable, deterministic plan v3.1.
// Inspired by public coaching workflows; no Runna proprietary code or templates.
const dates = {
  parse(value) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))throw Error("Date au format AAAA-MM-JJ attendue.");
    const date=new Date(value+"T12:00:00Z");
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw Error("Date invalide.");
    return date;
  },
  add(value,days) { const d=this.parse(value);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10); },
  diff(a,b) {return Math.round((this.parse(b)-this.parse(a))/86400000);},
  weekday(value) { return (this.parse(value).getUTCDay()+6)%7; },
  monday(value) {return this.add(value,-this.weekday(value));},
};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const round=(v,d=1)=>Number(v.toFixed(d));
const name={easy:"Endurance facile",recovery:"Récupération",tempo:"Tempo / seuil",interval:"Fractionné",long:"Sortie longue",race:"Course objectif",rest:"Repos"};
function numeric(value,min,max,label){const v=Number(value);if(!Number.isFinite(v)||v<min||v>max)throw Error(label+" hors limites.");return v;}
function within(date,period) {return period?.start && period?.end && date>=period.start&&date<=period.end;}
export function normalizePlanProfile(raw,today) {
  if(!raw || typeof raw!=="object")throw Error("Renseigne les informations du programme.");
  const goalDate=String(raw.raceDate||"");dates.parse(goalDate);
  const start=String(today||"");dates.parse(start);
  if(dates.diff(start,goalDate)<21 || dates.diff(start,goalDate)>365)throw Error("L'échéance doit être comprise entre 3 semaines et 12 mois.");
  const km=numeric(raw.distanceKm,3,100,"Distance cible");
  const weekly=numeric(raw.weeklyKm,3,140,"Kilométrage actuel");
  const freq=numeric(raw.frequency,2,6,"Nombre de sorties");
  const longDay=numeric(raw.longDay??6,0,6,"Jour de sortie longue");
  const allowed=Array.isArray(raw.availableDays)?[...new Set(raw.availableDays.map(Number))].sort():[0,1,2,3,4,5,6];
  if(allowed.length<freq || allowed.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error("Sélectionne au moins autant de jours disponibles que de courses.");
  if(!allowed.includes(longDay))throw Error("Le jour de sortie longue doit être disponible.");
  const targetTimeMinutes=raw.targetTimeMinutes?numeric(raw.targetTimeMinutes,12,24*60,"Chrono cible"):null;
  return {start,raceDate:goalDate,distanceKm:km,weeklyKm:weekly,frequency:freq,longDay,availableDays:allowed,
    targetTimeMinutes,priority:String(raw.priority||"balanced"),version:1};
}
function chooseDays(settings){
  const pool=settings.availableDays;
  const dayDist=(a,b)=>Math.min((a-b+7)%7,(b-a+7)%7);
  const long=settings.longDay;
  let selected=[long];
  while(selected.length<settings.frequency) {
    const remaining=pool.filter(d=>!selected.includes(d));
    remaining.sort((a,b)=>{
      const sa=Math.min(...selected.map(x=>dayDist(a,x)));
      const sb=Math.min(...selected.map(x=>dayDist(b,x)));
      return sb-sa || a-b;
    });
    selected.push(remaining[0]);
  }
  return selected.sort((a,b)=>a-b);
}
function scheduleTypes(settings,chosen) {
  const dayDist=(a,b)=>Math.min((a-b+7)%7,(b-a+7)%7);
  const types=new Map([[settings.longDay,"long"]]);
  const available=chosen.filter(d=>d!==settings.longDay);
  if(settings.frequency>=3){
    available.sort((a,b)=>dayDist(b,settings.longDay)-dayDist(a,settings.longDay)||a-b);
    types.set(available.shift(),"quality");
  }
  for(const day of available)types.set(day,"easy");
  return types;
}
export function generateRunningPlan(raw,today,modifiers={}) {
  const p=normalizePlanProfile(raw,today);
  const days=dates.diff(p.start,p.raceDate),weeks=Math.ceil((days+1)/7);
  const chosen=chooseDays(p),assigned=scheduleTypes(p,chosen);
  const sessions=[],summary=[];
  const notes=[];
  if(weeks<8)notes.push("Délai court : programme conservateur. L'objectif chronométrique peut être irréaliste.");
  if(p.weeklyKm<10)notes.push("Faible volume initial : privilégie l'endurance facile et le ressenti; pas d'intensité obligatoire.");
  if(p.distanceKm>=21 && p.weeklyKm<20)notes.push("Longue distance avec faible volume de départ : éviter toute hausse accélérée du kilométrage.");
  let previous=p.weeklyKm;
  for(let w=0;w<weeks;w++){
    const remaining=weeks-w,deload=(w+1)%4===0 && remaining>3;
    let volume=previous;
    if(w===0)volume=p.weeklyKm;
    else if(deload)volume=previous*0.82;
    else if(w>0)volume=Math.min(previous*1.06,p.weeklyKm*Math.pow(1.06,w));
    if(remaining===2)volume=Math.min(volume,previous*0.78);
    if(remaining===1)volume=Math.min(volume,previous*0.58);
    // Do not accelerate sharply immediately after a deload. Preserve a modest ceiling.
    if(w>0 && !deload && remaining>2)volume=Math.min(volume,p.weeklyKm*Math.pow(1.06,w));
    volume=round(volume);
    previous=volume;
    const phase=remaining<=2?"Affûtage":deload?"Assimilation":w<Math.max(2,Math.floor(weeks*.3))?"Fondations":remaining<=Math.max(4,Math.floor(weeks*.35))?"Spécifique":"Développement";
    const monday=dates.monday(dates.add(p.start,w*7));
    const weekDays=chosen.map(d=>dates.add(monday,d)).filter(d=>d>=p.start&&d<=p.raceDate);
    const raceThisWeek=dates.monday(p.raceDate)===monday;
    const longFraction=p.frequency===2?.46:clamp(.39-p.frequency*.015,.28,.38);
    const longKm=round(Math.min(volume*longFraction,p.distanceKm>=42.195?28:p.distanceKm>=21?22:Math.max(12,p.distanceKm*1.35)));
    const qualityKm=round(p.frequency>=3 ? Math.min(volume*.21,Math.max(3,volume-longKm-3)) : 0);
    const easyCount=Math.max(1,weekDays.length-1-(qualityKm?1:0));
    const easyKm=round(Math.max(2,(volume-longKm-qualityKm)/easyCount));
    const hardAllowed=p.weeklyKm>=10 && remaining>1 && !deload && p.frequency>=3;
    let assignedCount=0;
    for(const date of weekDays){
      let kind=assigned.get(dates.weekday(date));
      if(kind==="quality")kind=hardAllowed ? (w%2===0?"interval":"tempo"):"easy";
      if(kind==="long"&&remaining===1)kind="easy";
      const originalKind=kind,baseKm=kind==="long"?longKm:kind==="interval"||kind==="tempo"?qualityKm:easyKm;
      let distanceKm=round(baseKm),reason="Progression prudente, cohérente avec le volume hebdomadaire.";
      if(kind==="long")reason="Endurance spécifique et développement de la résistance à l'effort.";
      if(kind==="interval")reason="Travail de vitesse : seulement si récupération suffisante.";
      if(kind==="tempo")reason="Travail d'allure soutenue : remplacer par facile si fatigue.";
      if(deload){reason="Semaine d'assimilation : intensité volontairement limitée.";}
      if(within(date,modifiers.holiday)){
        if(modifiers.holiday.mode==="off"){kind="rest";distanceKm=0;reason="Pause programmée, priorité à la récupération.";}
        else if(modifiers.holiday.mode==="easy"){kind="easy";distanceKm=Math.min(distanceKm,5);reason="Vacances : sortie facile facultative.";}
      }
      if(within(date,modifiers.recovery)){
        if(modifiers.recovery.mode==="off"){kind="rest";distanceKm=0;reason="Pause demandée : retour progressif à organiser.";}
        else {kind="easy";distanceKm=Math.min(distanceKm,4);reason="Période de récupération : effort léger uniquement si confortable.";}
      }
      if(kind==="easy"&&originalKind!=="easy"&&distanceKm>5)distanceKm=Math.min(distanceKm,Math.max(4,round(easyKm)));
      if(date===p.raceDate){kind="race";distanceKm=p.distanceKm;reason="Course principale : objectifs d'allure à confirmer selon la préparation réelle.";}
      sessions.push({id:`tsplan-${p.raceDate}-w${w+1}-${date}`,date,week:w+1,kind,title:name[kind]||name.easy,
        distanceKm:round(distanceKm),intensity:kind==="interval"?"RPE 7–8":kind==="tempo"?"RPE 6–7":kind==="race"?"Selon stratégie":"RPE 2–4",
        reason,phase,status:"planned",exportable:["easy","long","interval","tempo"].includes(kind),plannedInitially:originalKind});
      assignedCount++;
    }
    // On race week do not create intensity nearby even if program schedule differs.
    if(raceThisWeek)for(const x of sessions.filter(x=>x.week===w+1&&x.kind!=="race")) {
      if(["interval","tempo"].includes(x.kind)){x.kind="easy";x.title=name.easy;x.intensity="RPE 2–3";x.reason="Semaine de course : préserver la fraîcheur.";}
    }
    summary.push({week:w+1,from:monday,plannedKm:round(sessions.filter(x=>x.week===w+1).reduce((v,x)=>v+x.distanceKm,0)),phase,count:assignedCount});
  }
  const workoutDays=sessions.filter(x=>x.kind!=="rest");
  if(!workoutDays.some(x=>x.date===p.raceDate)){
    sessions.push({id:`tsplan-race-${p.raceDate}`,date:p.raceDate,week:weeks,kind:"race",title:name.race,distanceKm:p.distanceKm,
      intensity:"Selon stratégie",reason:"Course principale fixée à l'échéance choisie.",phase:"Affûtage",status:"planned",exportable:false});
  }
  sessions.sort((a,b)=>a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind));
  return {profile:p,createdAt:today,summary,sessions,notes,modifiers,
    totalWeeks:weeks,estimatedPlan:true,source:"TrainSync deterministic prototype; user confirmation required"};
}
export function applyTodayRecommendation(plan,context={}) {
  const day=context.today||plan.createdAt,session=plan.sessions.find(s=>s.date===day);
  const recent=(context.strength||[]).filter(s=>{
    const date=String(s.startedAt||"").slice(0,10);
    return date && dates.diff(date,day)>=0 && dates.diff(date,day)<=2;
  });
  const matches=/squat|deadlift|soulev|fente|lunge|leg press|leg extension|leg curl|hip thrust|quad|ischio/i;
  const legs=recent.some(x=>(x.exercises||[]).some(e=>matches.test(e.title||e.name||"")));
  const sore=Number(context.soreness||0)>=4;
  const lowEnergy=Number(context.energy||5)<=2;
  const highFatigue=legs||sore||lowEnergy;
  if(!session)return {title:"Pas de séance prévue",action:"repos",reason:"Consulte le programme ou utilise une séance libre.",changed:false};
  const quality=["interval","tempo"].includes(session.kind);
  if(highFatigue && quality)return {title:"Footing facile ou repos",action:"alléger",reason:"Fatigue musculaire ou ressentie défavorable. Proposons un report plutôt que deux séances intenses rapprochées.",changed:true,original:session};
  return {title:session.title,action:"maintenir",reason:highFatigue?"Rester attentif au ressenti, particulièrement après Hevy.":session.reason,changed:false,original:session};
}
export function getWeek(plan,weekNumber){return plan.sessions.filter(s=>s.week===Number(weekNumber));}
export function moveWorkout(plan,id,newDate) {
  dates.parse(newDate);
  const item=plan.sessions.find(s=>s.id===id);
  if(!item)throw Error("Séance introuvable.");
  if(newDate<plan.profile.start||newDate>plan.profile.raceDate)throw Error("Déplacement hors du programme.");
  if(item.kind==="race")throw Error("La date de course est fixée par l'objectif.");
  if(plan.sessions.some(s=>s.id!==id&&s.date===newDate&&s.kind!=="rest"))throw Error("Une autre course est déjà prévue ce jour.");
  return {...plan,sessions:plan.sessions.map(s=>s.id===id?{...s,date:newDate,reason:s.reason+" (déplacée manuellement)"}:s).sort((a,b)=>a.date.localeCompare(b.date))};
}
