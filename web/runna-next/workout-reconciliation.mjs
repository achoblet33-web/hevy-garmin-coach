/**
 * KINTRA reconciliation: only explicit Intervals paired IDs confirm completion.
 * No approximate matching may silently mark a workout as complete or delete records.
 */
const validId=x=>String(x??"").trim();
const onDay=s=>String(s??"").slice(0,10);
const isRunning=x=>x?.category==="Course"||/run/i.test(String(x?.type||""));
const positive=n=>n!==null&&n!==undefined&&n!==""&&Number.isFinite(Number(n))&&Number(n)>0?Number(n):null;
const rounding=(n,d=1)=>n==null?null:Number(n.toFixed(d));
const identity=a=>{
 const external=validId(a.externalId);
 const origin=validId(a.source||a.provider||"unknown");
 return external?origin+":"+external:validId(a.id);
};
function activityMap(activities){
 const map=new Map();
 for(const a of activities||[]){
  if(!a?.id||!isRunning(a))continue;
  const key=identity(a);if(!key)continue;
  const previous=map.get(key);
  if(!previous){map.set(key,a);continue;}
  // Prefer the more complete same-source record, but retain an explicit pairing.
  const fields=["distanceKm","durationMinutes","averageHeartRate","trainingLoad","rpe","pairedEventId"];
  const richness=x=>fields.filter(k=>x[k]!==undefined&&x[k]!==null).length;
  const winner=richness(a)>richness(previous)?a:previous;
  map.set(key,{...winner,pairedEventId:winner.pairedEventId||previous.pairedEventId||a.pairedEventId||null});
 }
 return [...map.values()];
}
export function uniqueRunningActivities(activities=[]){return activityMap(activities)}
export function reconcileWorkouts(activities=[],planned=[]){
 const runs=activityMap(activities),results=[];
 const consumed=new Set();
 // First reserve all provable pairings. Never consume a run twice even with duplicate calendar events.
 for(const p of planned||[]){
  const eventId=validId(p?.id),pairedActivity=validId(p?.pairedActivityId);
  const exact=eventId||pairedActivity?runs.filter(a=>!consumed.has(identity(a))&&(
   (eventId&&validId(a.pairedEventId)===eventId)||
   (pairedActivity&&(validId(a.externalId)===pairedActivity||validId(a.id)===pairedActivity))
  )):[];
  const actual=exact.length===1?exact[0]:null;
  if(actual){
   consumed.add(identity(actual));
   results.push({...p,matchStatus:"confirmed",actual,
    source:eventId&&validId(actual.pairedEventId)===eventId?"paired_event_id":"paired_activity_id",candidates:[]});
  }else results.push({...p,matchStatus:"unmatched",actual:null,source:null,candidates:[]});
 }
 // Tentative matches must be one-to-one and never rely on paired activities from another event.
 const candidatesByDay=new Map();
 for(const a of runs){
  if(consumed.has(identity(a))||validId(a.pairedEventId))continue;
  const day=onDay(a.startedAt);
  candidatesByDay.set(day,[...(candidatesByDay.get(day)||[]),a]);
 }
 const pendingByDay=new Map();
 for(let i=0;i<results.length;i++){
  if(results[i].matchStatus!=="unmatched"||!onDay(results[i].date))continue;
  const day=onDay(results[i].date);
  pendingByDay.set(day,[...(pendingByDay.get(day)||[]),i]);
 }
 for(const [day,indices] of pendingByDay){
  const candidate=candidatesByDay.get(day)||[];
  if(indices.length!==1||candidate.length!==1)continue;
  const i=indices[0];results[i]={...results[i],matchStatus:"suggested",candidates:candidate};
 }
 return results;
}
/**
 * Potential duplicates are review-only. Different provider IDs can represent
 * separate workouts, so never merge or delete these without user confirmation.
 */
export function findPotentialDuplicates(activities=[]){
 const runs=activityMap(activities).filter(a=>positive(a.distanceKm)&&positive(a.durationMinutes))
  .slice(0,500).sort((a,b)=>String(a.startedAt).localeCompare(String(b.startedAt)));
 const suspects=[];
 for(let i=0;i<runs.length;i++){
  for(let j=i+1;j<runs.length;j++){
   const a=runs[i],b=runs[j],ta=Date.parse(a.startedAt),tb=Date.parse(b.startedAt);
   if(!Number.isFinite(ta)||!Number.isFinite(tb))continue;
   const diff=Math.abs(tb-ta);if(diff>120_000){if(tb>ta)break;continue;}
   if(identity(a)===identity(b))continue;
   if(Math.abs(a.distanceKm-b.distanceKm)>Math.max(.15,a.distanceKm*.025))continue;
   if(Math.abs(a.durationMinutes-b.durationMinutes)>Math.max(1,a.durationMinutes*.03))continue;
   suspects.push({firstId:a.id,secondId:b.id,date:onDay(a.startedAt),reason:"Horaires, distance et durée proches ; doublon possible, non supprimé."});
   if(suspects.length>=30)return suspects;
  }
 }
 return suspects;
}
export function summarizeRun(a,p=null){
 if(!a)return null;
 const distanceKm=positive(a.distanceKm),durationMinutes=positive(a.durationMinutes);
 const plannedKm=positive(p?.distanceKm),plannedMinutes=positive(p?.durationMinutes);
 return {
  id:a.id,date:onDay(a.startedAt),title:a.title||"Course",
  distanceKm:rounding(distanceKm,2),durationMinutes:rounding(durationMinutes,1),
  paceMinKm:distanceKm&&durationMinutes?rounding(durationMinutes/distanceKm,2):null,
  averageHeartRate:positive(a.averageHeartRate),trainingLoad:positive(a.trainingLoad),
  rpe:positive(a.rpe),plannedKm:rounding(plannedKm,2),plannedMinutes:rounding(plannedMinutes,1),
  distanceDeltaKm:distanceKm&&plannedKm?rounding(distanceKm-plannedKm,2):null,
  durationDeltaMinutes:durationMinutes&&plannedMinutes?rounding(durationMinutes-plannedMinutes,1):null,
 };
}
export function findPlanWorkout(plan,run){
 if(!plan||!run)return null;
 const day=onDay(run.startedAt);
 const list=(plan.sessions||[]).filter(s=>s.date===day&&s.kind!=="rest");
 return list.length===1?list[0]:null;
}
export function completedStats(activities=[]){
 const run=activityMap(activities),km=run.reduce((s,a)=>s+(positive(a.distanceKm)||0),0);
 return {count:run.length,km:rounding(km,1),lastDate:run.map(a=>onDay(a.startedAt)).sort().at(-1)||null};
}
