import test from "node:test";
import assert from "node:assert/strict";
import {reconcileWorkouts,summarizeRun,findPlanWorkout,completedStats} from "../web/runna-next/workout-reconciliation.mjs";
import {renderTrainingReview,renderActivityReport} from "../web/runna-next/after-run.mjs";
import live from "../preview/live-worker.mjs";
const KEY="FICTIVE_TEST_TOKEN_123456";
const a=(id,day,event=null)=>({id:"intervals:"+id,externalId:id,category:"Course",type:"Run",
 startedAt:day+"T08:00:00",pairedEventId:event,distanceKm:9.72,durationMinutes:52,averageHeartRate:149,title:"Course en extérieur"});
const p=(id,date)=>({id:String(id),title:"Fractionné 6 × 800 m",date,type:"Run",distanceKm:10.2});
const request=(route,withKey=true)=>new Request("https://train.local/v3"+route,{headers:withKey?{"x-intervals-api-key":KEY}:{}});

test("paired_event_id confirms exact workout, not date similarity",()=>{
 const run=a("i111","2026-10-28","42");
 const matching=reconcileWorkouts([run],[p(42,"2026-10-28")]);
 assert.equal(matching[0].matchStatus,"confirmed");
 assert.equal(matching[0].actual.id,run.id);
 assert.equal(matching[0].source,"paired_event_id");
 const different=reconcileWorkouts([a("i222","2026-10-28")],[p(45,"2026-10-28")]);
 assert.equal(different[0].matchStatus,"suggested");
 assert.equal(different[0].actual,null,"Never auto-complete based on day alone");
});
test("duplicate raw Intervals activity ID is not counted twice",()=>{
 const run=a("i111","2026-10-28","42");
 assert.equal(completedStats([run,{...run}]).count,1);
 assert.equal(completedStats([run,{...run}]).km,9.7);
});
test("planned event may be explicitly paired to a raw provider activity ID",()=>{
 const result=reconcileWorkouts([a("i123","2026-10-28")],[{...p(43,"2026-10-28"),pairedActivityId:"i123"}]);
 assert.equal(result[0].matchStatus,"confirmed");
});
test("training review escapes untrusted activity title",()=>{
 const html=renderTrainingReview([a("i444","2026-10-28")],[]);
 assert.match(html,/Bilan de tes entraînements/);
 assert.match(html,/Association à vérifier/);
 const scary=a("i445","2026-10-28");scary.title="<img src=x onerror=alert(1)>";
 const output=renderTrainingReview([scary],[]);
 assert.ok(!output.includes("<img"));
 assert.match(output,/&lt;img/);
});
test("activity report is transparent about laps and unconfirmed association",()=>{
 const activity=a("i111","2026-10-28");
 const html=renderActivityReport({activity,planned:[p(42,"2026-10-28")],segments:{segments:[]}});
 assert.match(html,/association au calendrier non confirmée/i);
 assert.match(html,/Pas de segments détaillés disponibles/);
 assert.ok(!html.includes("Séance liée :"));
 const confirmed=renderActivityReport({activity:{...activity,pairedEventId:"42"},planned:[p(42,"2026-10-28")],
  segments:{segments:[{label:"Intervalle 1",distanceMeters:800,durationSeconds:206,averageHeartRate:161,averagePaceMinKm:4.29}]}});
 assert.match(confirmed,/Séance liée :/);
 assert.match(confirmed,/Intervalle 1/);
 assert.match(confirmed,/4:17 \/km/);
});
test("live lap endpoint validates identity, reads provider only and never includes API secret",async()=>{
 const old=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,opt)=>{
   calls.push({url:String(url),headers:opt.headers});
   return Response.json({icu_intervals:[
    {name:"800 m rapide",distance:800,moving_time:205,average_heartrate:159},
    {name:"Récupération",distance:240,moving_time:120,average_heartrate:138}
   ]});
  };
  const r=await live.fetch(request("/activities/i444/intervals"));
  assert.equal(r.status,200);
  const raw=await r.text();assert.ok(!raw.includes(KEY));
  const data=JSON.parse(raw);
  assert.equal(data.segments.length,2);
  assert.equal(data.segments[0].averagePaceMinKm,4.27);
  assert.equal(calls[0].url,"https://intervals.icu/api/v1/activity/i444/intervals");
  assert.equal(atob(calls[0].headers.Authorization.slice(6)),"API_KEY:"+KEY);
 }finally{globalThis.fetch=old;}
});
test("lap endpoint rejects missing API key and malformed ID without forwarding",async()=>{
 const noKey=await live.fetch(request("/activities/i444/intervals",false));
 assert.equal(noKey.status,401);
 const bad=await live.fetch(request("/activities/i444%20junk/intervals"));
 assert.equal(bad.status,404);
});
