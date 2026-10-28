/**
 * Read-only reconciliation of completed Intervals.icu activities and calendar workouts.
 * A completion is confirmed ONLY with paired_event_id / paired_activity_id, not matching dates.
 * Proximity is a tentative suggestion and never changes training load or plan status.
 */
const validId=x=>String(x??"").trim();
const onDay=s=>String(s??"").slice(0,10);
const isRunning=x=>x?.category==="Course"||/run/i.test(String(x?.type||""));
const positive=n=>Number.isFinite(Number(n))&&Number(n)>0?Number(n):null;
const rounding=(n,d=1)=>n==null?null:Number(n.toFixed(d));
function activityMap(activities){
 const map=new Map();
 for(const a of activities||[]){
  if(!a?.id||!isRunning(a))continue;
  const id=validId(a.id);if(!map.has(id))map.set(id,a);
 }
 return [...map.values()];
}
export function reconcileWorkouts(activities=[],planned=[]){
 const runs=activityMap(activities);
 const results=[];
 const consumed=new Set();
 for(const p of planned||[]){
  const eventId=validId(p.id);
  const exact=runs.filter(a=>validId(a.pairedEventId)===eventId||
   (p.pairedActivityId!=null&&(validId(a.externalId)===validId(p.pairedActivityId)||validId(a.id)===validId(p.pairedActivityId))));
  const actual=exact.length===1?exact[0]:null;
  if(actual){
   consumed.add(validId(actual.id));
   results.push({...p,matchStatus:"confirmed",actual,source:"paired_event_id",candidates:[]});
   continue;
  }
  const date=onDay(p.date);
  // Suggest possible candidates only for same day and a single unpaired run.
  const candidates=runs.filter(a=>!consumed.has(validId(a.id))&&
    !a.pairedEventId&&onDay(a.startedAt)===date);
  results.push({...p,matchStatus:candidates.length===1?"suggested":"unmatched",actual:null,
    source:null,candidates:candidates.length===1?candidates:[]});
 }
 return results;
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
 const list=plan.sessions.filter(s=>s.date===day&&s.kind!=="rest");
 return list.length===1?list[0]:null;
}
export function completedStats(activities=[]){
 const run=activityMap(activities),km=run.reduce((s,a)=>s+(positive(a.distanceKm)||0),0);
 return {count:run.length,km:rounding(km,1),lastDate:run.map(a=>onDay(a.startedAt)).sort().at(-1)||null};
}
