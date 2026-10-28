// Evidence-limited post-run analysis. No AI-generated injury diagnosis or fabricated target paces.
const num=x=>x==null||x===""||!Number.isFinite(Number(x))?null:Number(x);
const day=s=>String(s||"").slice(0,10);
const offset=(d,n)=>{const x=new Date(d+"T12:00:00Z");x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
export function weekTrend(activities=[],date){
 const run=activities.filter(a=>a?.category==="Course");
 const total=(from,to)=>run.filter(a=>{const d=day(a.startedAt);return d>=from&&d<=to;})
  .reduce((acc,a)=>acc+Math.max(0,num(a.distanceKm)||0),0);
 const sessions=(from,to)=>run.filter(a=>day(a.startedAt)>=from&&day(a.startedAt)<=to).length;
 const current=total(offset(date,-6),date),previous=total(offset(date,-13),offset(date,-7));
 return {currentKm:+current.toFixed(1),previousKm:+previous.toFixed(1),currentSessions:sessions(offset(date,-6),date),
  previousSessions:sessions(offset(date,-13),offset(date,-7)),
  changePct:previous>=5?Math.round((current/previous-1)*100):null};
}
export function analyzeRun({activity,activities=[],segments=[],feedback=null}={}){
 if(!activity)return {observations:[],recommendations:["Aucune course enregistrée."]};
 const obs=[],recommendations=[];
 const dist=num(activity.distanceKm),time=num(activity.durationMinutes),pace=dist>0&&time>0?time/dist:null;
 const prev=activities.filter(a=>a?.category==="Course"&&a.id!==activity.id&&
  day(a.startedAt)<day(activity.startedAt)&&Math.abs((num(a.distanceKm)||0)-dist)<=Math.max(1,dist*.2)&&
  num(a.durationMinutes)>0).sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt))).slice(0,8);
 if(prev.length>=3&&pace){
  const priorPaces=prev.map(a=>num(a.durationMinutes)/num(a.distanceKm)).filter(Number.isFinite).sort((a,b)=>a-b);
  const ref=priorPaces[Math.floor(priorPaces.length/2)];
  const diff=Math.round((pace/ref-1)*100);
  obs.push("À distance comparable, allure "+(diff<0?"plus rapide":diff>0?"plus lente":"équivalente")+" d'environ "+Math.abs(diff)+" % par rapport à la médiane de "+priorPaces.length+" sorties. Les parcours et conditions peuvent différer.");
 }else obs.push("Pas assez de sorties comparables pour évaluer une tendance d'allure fiable.");
 const fast=segments.filter(x=>num(x.distanceMeters)>=600&&num(x.distanceMeters)<=1000&&num(x.averagePaceMinKm)>0);
 if(fast.length>=3){
  const paces=fast.map(x=>num(x.averagePaceMinKm)),mean=paces.reduce((a,b)=>a+b,0)/paces.length;
  const range=(Math.max(...paces)-Math.min(...paces))/mean;
  obs.push(fast.length+" segments de 600 à 1 000 m analysés; écart d'allure entre le plus rapide et le plus lent : "+Math.round(range*100)+" %.");
  if(range>.08)recommendations.push("Sur tes répétitions comparables, vise une allure plus régulière plutôt qu'un départ trop rapide.");
  else recommendations.push("Tes répétitions comparables présentent des allures assez homogènes ; conserve la régularité.");
 }
 const rpe=num(feedback?.rpe)??num(activity.rpe);
 if(rpe!=null&&rpe>=8)recommendations.push("Effort ressenti élevé (RPE "+rpe+"/10). Vérifie ta récupération avant d'enchaîner une nouvelle séance intense.");
 if(rpe!=null&&rpe<=3)recommendations.push("Ressenti plutôt facile. Ne durcis pas automatiquement le programme : observe plusieurs sorties comparables.");
 if(!recommendations.length)recommendations.push("Enregistre ton ressenti après la sortie et consulte les fractions disponibles pour affiner les conseils.");
 return {observations:obs,recommendations,referenceCount:prev.length,repeatCount:fast.length};
}
