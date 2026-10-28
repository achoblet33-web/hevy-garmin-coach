/* KINTRA coach principles: original deterministic rules, not proprietary Runna/Garmin algorithms.
 * Never infer medical readiness or precise target pace from sparse wellbeing data.
 */
const add=(date,n)=>{const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const weekday=s=>(new Date(s+"T12:00:00Z").getUTCDay()+6)%7;
const monday=s=>add(s,-weekday(s));
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(v,hi));
const round=(v,d=1)=>Number(v.toFixed(d));
const val=(n,min,max,label)=>{const x=Number(n);if(!Number.isFinite(x)||x<min||x>max)throw Error(label+" hors plage admissible.");return x;};
const textDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(new Date(s+"T12:00:00Z").getTime());
export function generateMaintenancePlan(input,date){
 if(!textDate(date))throw Error("Date de départ invalide.");
 const weeklyKm=val(input.weeklyKm,3,140,"Kilométrage hebdomadaire");
 const frequency=val(input.frequency,2,6,"Nombre de sorties");
 const longDay=val(input.longDay??6,0,6,"Jour de sortie longue");
 const availableDays=[...new Set((input.availableDays||[]).map(Number))].sort();
 if(availableDays.length<frequency||!availableDays.includes(longDay)||availableDays.some(x=>!Number.isInteger(x)||x<0||x>6))
  throw Error("Sélectionne assez de journées disponibles, y compris pour la sortie longue.");
 const preferred=[longDay],distance=(a,b)=>Math.min((a-b+7)%7,(b-a+7)%7);
 while(preferred.length<frequency){
  const next=availableDays.filter(d=>!preferred.includes(d)).sort((a,b)=>{
   const da=Math.min(...preferred.map(p=>distance(a,p))),db=Math.min(...preferred.map(p=>distance(b,p)));
   return db-da||a-b;
  })[0];
  preferred.push(next);
 }
 const days=preferred.sort((a,b)=>a-b);
 const focus=["balance","endurance","speed"].includes(input.maintenanceFocus)?input.maintenanceFocus:"balance";
 const quality=focus!=="endurance"&&frequency>=3&&weeklyKm>=15?days.filter(x=>x!==longDay).sort((a,b)=>distance(b,longDay)-distance(a,longDay))[0]:null;
 const start=monday(date),sessions=[],summary=[];
 const level=String(input.maintenanceFocus||"balance");
 const allowed=["balance","endurance","speed"].includes(level)?level:"balance";
 for(let w=0;w<4;w++){
  const volume=round(weeklyKm*(w===3?.82:w===2?1.03:1),1);
  const phase=w===3?"Assimilation":"Entretien";
  const longPart=frequency===2?.42:focus==="endurance"?.39:.33;
  const longKm=round(Math.min(volume*longPart,Math.max(12,weeklyKm*.5)),1);
  const rest=volume-longKm;
  const qualityKm=quality!==null?round(Math.min(rest*.4,Math.max(3,volume*.2)),1):0;
  const easyKm=round(Math.max(2,(rest-qualityKm)/(frequency-1-(quality!==null?1:0)||1)),1);
  let used=0,plannedKm=0;
  for(const d of days){
   const dt=add(start,w*7+d);if(dt<date)continue;
   let kind=d===longDay?"long":d===quality?(allowed==="speed"&&w%2===0?"interval":"tempo"):"easy";
   if(w===3&&["tempo","interval"].includes(kind))kind="easy";
   const km=round(kind==="long"?longKm:["tempo","interval"].includes(kind)?qualityKm:easyKm);
   const note=kind==="long"?"Endurance facile et durable.":kind==="interval"?"Effort contrôlé; remplacer par facile si fatigue.":kind==="tempo"?"Bloc modéré, jamais à épuisement.":"Aisance respiratoire.";
   const title={long:"Sortie longue facile",easy:"Endurance fondamentale",tempo:"Tempo léger",interval:"Intervalles contrôlés"}[kind];
   sessions.push({id:"kintra-maint-"+date+"-w"+(w+1)+"-"+dt,date:dt,week:w+1,kind,title,distanceKm:km,
    intensity:kind==="interval"?"RPE 6–7":kind==="tempo"?"RPE 5–6":"RPE 2–4",
    reason:note+" Programme d'entretien sans objectif de compétition.",
    phase,status:"planned",exportable:true,plannedInitially:kind});
   used++;plannedKm+=km;
  }
  summary.push({week:w+1,from:add(start,w*7),plannedKm:round(plannedKm),phase,count:used});
 }
 return {mode:"maintenance",profile:{...input,mode:"maintenance",start:date,raceDate:null,weeklyKm,frequency,longDay,availableDays,
    maintenanceFocus:allowed},createdAt:date,summary,sessions,totalWeeks:4,notes:[
    "Cycle d'entretien de quatre semaines, à renouveler après examen du volume réellement effectué.",
    "L'intensité est facultative : la priorité reste la régularité, la récupération et le plaisir de courir."
 ],modifiers:{},estimatedPlan:true,source:"KINTRA — entretien heuristique, non entraînement médical"};
}
const number=x=>x==null||x===""?null:Number.isFinite(Number(x))?Number(x):null;
export function evaluateSportContext({activities=[],wellness=[],strength=[],date}={}){
 if(!textDate(date))throw Error("Date de référence invalide.");
 const sorted=[...wellness].filter(x=>x&&x.date<=date).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const recent=sorted.slice(0,7);
 const latest=recent[0]||{};
 const last=latest.date>=add(date,-1)?latest:{};
 const sleep=number(last.sleepSecs),hrv=number(last.hrv),rhr=number(last.restingHR),ctl=number(last.ctl),atl=number(last.atl),sleepScore=number(last.sleepScore),sleepQuality=number(last.sleepQuality);
 const run=activities.filter(x=>x.category==="Course");
 const recentRuns=run.filter(x=>String(x.startedAt||"").slice(0,10)>=add(date,-6)&&String(x.startedAt||"").slice(0,10)<=date);
 const baselineRuns=run.filter(x=>String(x.startedAt||"").slice(0,10)>=add(date,-34)&&String(x.startedAt||"").slice(0,10)<add(date,-6));
 const weeklyKm=round(recentRuns.reduce((n,x)=>n+(number(x.distanceKm)||0),0));
 const baselineKm=round(baselineRuns.reduce((n,x)=>n+(number(x.distanceKm)||0),0)/4);
 const warning=[];
 if(sorted.length<5)warning.push("Historique de récupération insuffisant pour déterminer une tendance fiable.");
 const refHR=recent.slice(1).map(x=>number(x.restingHR)).filter(x=>x!==null);
 const refHRV=recent.slice(1).map(x=>number(x.hrv)).filter(x=>x!==null);
 const avg=a=>a.reduce((n,v)=>n+v,0)/a.length;
 if(rhr!=null&&refHR.length>=4&&rhr>avg(refHR)+7)warning.push("FC de repos supérieure à sa tendance récente : privilégier un effort facile et vérifier ton ressenti.");
 if(hrv!=null&&refHRV.length>=4&&hrv<avg(refHRV)*.75)warning.push("HRV inférieure à sa tendance récente : à interpréter avec ton ressenti et l'historique.");
 if(sleep!=null&&sleep<6*3600)warning.push("Sommeil enregistré inférieur à six heures : éviter une intensité imposée.");
 if(baselineRuns.length>=4&&baselineKm>=5&&weeklyKm>baselineKm*1.35)
   warning.push("Volume des sept derniers jours nettement supérieur à la moyenne des semaines précédentes.");
 const recentLeg=(strength||[]).filter(x=>{
  const d=String(x.startedAt||"").slice(0,10);
  return d>=add(date,-2)&&d<=date&&(x.category==="Musculation"||x.source==="Hevy"||x.exercises?.length);
 }).some(x=>Array.isArray(x.exercises)&&x.exercises.some(z=>/squat|deadlift|soulev|fente|lunge|leg press|leg curl|hip thrust/i.test(z.title||z.name||"")));
 if(recentLeg)warning.push("Séance jambes récente détectée : vérifier les courbatures avant une séance intense.");
 return {sleepHours:sleep==null?null:round(sleep/3600,1),sleepSecs:sleep,sleepScore,sleepQuality,latestDate:last.date||null,hrv,restingHR:rhr,ctl,atl,
  weeklyKm,baselineKm,runCount:recentRuns.length,strengthCount:strength.filter(x=>String(x.startedAt||"").slice(0,10)>=add(date,-6)).length,
  warnings:warning,signalsAvailable:[sleep,hrv,rhr,ctl,atl].filter(x=>x!==null).length,grade:
  warning.some(x=>!/insuffisant/i.test(x))?"prudence":sorted.length>=5?"données partielles":"inconnu"};
}
export function recommendWorkout({plan,context,date,feeling=null}){
 const session=plan?.sessions?.find(x=>x.date===date&&x.kind!=="rest")||null;
 if(!session)return {title:"Récupération ou activité libre",action:"rest",reason:"Aucune séance obligatoire aujourd'hui."};
 const quality=["tempo","interval"].includes(session.kind);
 const sore=feeling?.soreness>=4||feeling?.energy<=2;
 const concerns=context.warnings.filter(s=>!/insuffisant/i.test(s));
 if(quality&&(sore||concerns.length>=2))return {
  title:"Envisager une séance facile ou un report",action:"suggest-easy",original:session,
  reason:"Plusieurs signaux invitent à la prudence. Proposition à confirmer, sans modifier le plan automatiquement."};
 return {title:session.title,action:"keep",original:session,
  reason:context.signalsAvailable===0?"Données physiologiques absentes : adapte l'effort au ressenti.":"Séance prévue, à ajuster selon tes sensations."};
}

/**
 * Explainable, non-clinical readiness guidance. No synthetic 0–100 index.
 * Requires recent measured recovery data and a personal baseline to say "favorable".
 */
export function evaluateReadiness({activities=[],wellness=[],strength=[],date}={}){
 const ctx=evaluateSportContext({activities,wellness,strength,date});
 const goodDate=x=>typeof x?.date==="string"&&x.date<=date&&x.date>=add(date,-1);
 const todayData=[...wellness].filter(goodDate).sort((a,b)=>b.date.localeCompare(a.date))[0]||null;
 const sorted=[...wellness].filter(x=>x?.date&&x.date<todayData?.date&&x.date>=add(date,-21)).sort((a,b)=>b.date.localeCompare(a.date));
 const numeric=x=>x==null||x===""||!Number.isFinite(Number(x))?null:Number(x);
 const average=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
 const baselineHrv=sorted.map(x=>numeric(x.hrv)).filter(x=>x!==null&&x>0);
 const baselineHR=sorted.map(x=>numeric(x.restingHR)).filter(x=>x!==null&&x>0);
 const hrv=numeric(todayData?.hrv),rhr=numeric(todayData?.restingHR),sleep=numeric(todayData?.sleepSecs);
 const baselineHrvMean=baselineHrv.length>=4?average(baselineHrv):null;
 const baselineRhrMean=baselineHR.length>=4?average(baselineHR):null;
 const signals=[];
 if(sleep!=null)signals.push({name:"Sommeil",value:(sleep/3600).toFixed(1)+" h",status:sleep<6*3600?"attention":"observé",reason:sleep<6*3600?"Nuit courte enregistrée.":"Durée de sommeil enregistrée."});
 if(hrv!=null)signals.push({name:"HRV",value:Math.round(hrv)+" ms",status:baselineHrvMean!=null&&hrv<baselineHrvMean*.8?"attention":baselineHrvMean!=null?"tendance":"sans référence",reason:baselineHrvMean==null?"Historique HRV encore trop court.":"Référence récente : "+Math.round(baselineHrvMean)+" ms."});
 if(rhr!=null)signals.push({name:"FC repos",value:Math.round(rhr)+" bpm",status:baselineRhrMean!=null&&rhr>baselineRhrMean+7?"attention":baselineRhrMean!=null?"tendance":"sans référence",reason:baselineRhrMean==null?"Historique FC repos encore trop court.":"Référence récente : "+Math.round(baselineRhrMean)+" bpm."});
 const exerciseWarnings=ctx.warnings.filter(x=>/Volume des sept|Séance jambes/.test(x));
 const concerns=signals.filter(x=>x.status==="attention").length+exerciseWarnings.length;
 const baselineOk=baselineHrvMean!==null||baselineRhrMean!==null;
 const enough=signals.length>=2&&baselineOk;
 const state=!todayData||signals.length===0?"insufficient":concerns>0?"caution":enough?"favorable":"limited";
 return {state,
   label:state==="favorable"?"Dynamique favorable":state==="caution"?"Récupération à surveiller":state==="limited"?"Tendance à confirmer":"Données insuffisantes",
   summary:state==="favorable"?"Plusieurs tendances disponibles sont cohérentes; confirme avec tes sensations avant de courir.":
   state==="caution"?"Certains signaux incitent à alléger ou différer l’intensité; ce n’est pas un diagnostic.":
   "Connecte et synchronise davantage de nuits pour identifier ta tendance personnelle.",
   signals,warning:exerciseWarnings,referenceDays:Math.max(baselineHR.length,baselineHrv.length),
   freshness:todayData?.date||null,hasBaseline:baselineOk};
}
