import test from "node:test";
import assert from "node:assert/strict";
import {generateMaintenancePlan,evaluateSportContext,recommendWorkout} from "../web/runna-next/kintra-coach.mjs";
const today="2026-10-28";
const input={weeklyKm:24,frequency:3,longDay:6,availableDays:[1,3,6],maintenanceFocus:"balance"};
test("maintain mode makes a rolling 4-week plan with no false race or taper",()=>{
 const p=generateMaintenancePlan(input,today);
 assert.equal(p.mode,"maintenance");
 assert.equal(p.totalWeeks,4);
 assert.equal(p.profile.raceDate,null);
 assert.ok(!p.sessions.some(s=>s.kind==="race"));
 assert.ok(p.sessions.every(s=>s.date>=today && s.kind!=="rest"));
 assert.ok(p.summary.some(x=>x.phase==="Assimilation"));
 assert.ok(p.sessions.every(x=>x.exportable));
 assert.equal(new Set(p.sessions.map(x=>x.id)).size,p.sessions.length);
});
test("maintenance schedule respects actual available days",()=>{
 const p=generateMaintenancePlan(input,today);
 const days=p.sessions.map(s=>(new Date(s.date+"T12:00:00Z").getUTCDay()+6)%7);
 assert.ok(days.every(x=>[1,3,6].includes(x)));
 assert.ok(p.sessions.some(s=>s.kind==="long"));
});
test("low training base avoids quality intensity",()=>{
 const p=generateMaintenancePlan({...input,weeklyKm:7},today);
 assert.equal(p.sessions.filter(x=>["tempo","interval"].includes(x.kind)).length,0);
});
test("unavailable training days and implausible volume are rejected",()=>{
 assert.throws(()=>generateMaintenancePlan({...input,availableDays:[1,3]},today),/journées/i);
 assert.throws(()=>generateMaintenancePlan({...input,weeklyKm:300},today),/hors plage/i);
});
test("sports summary never fabricates sleep or recovery score from missing values",()=>{
 const x=evaluateSportContext({date:today});
 assert.equal(x.hrv,null);assert.equal(x.sleepHours,null);assert.equal(x.restingHR,null);
 assert.equal(x.signalsAvailable,0);assert.equal(x.grade,"inconnu");
});
test("real data produces transparent contextual advice, not automatic mutations",()=>{
 const activities=[{category:"Course",startedAt:today+"T07:30:00",distanceKm:8}];
 const wellness=[
  {date:"2026-10-28",sleepSecs:18000,hrv:25,restingHR:64,ctl:40,atl:55},
  {date:"2026-10-27",sleepSecs:27000,hrv:56,restingHR:50},
  {date:"2026-10-26",sleepSecs:26000,hrv:54,restingHR:51},
  {date:"2026-10-25",sleepSecs:29000,hrv:53,restingHR:49},
  {date:"2026-10-24",sleepSecs:28000,hrv:52,restingHR:52},
  {date:"2026-10-23",sleepSecs:27000,hrv:55,restingHR:51},
 ];
 const data=evaluateSportContext({date:today,activities,wellness});
 assert.equal(data.sleepHours,5);assert.equal(data.weeklyKm,8);
 assert.ok(data.warnings.length>=2);
 const plan=generateMaintenancePlan(input,today);
 const workout=plan.sessions.find(s=>s.kind==="tempo");
 const advice=recommendWorkout({date:workout.date,plan,context:data});
 assert.equal(advice.action,"suggest-easy");
 assert.equal(workout.kind,"tempo","do not alter plan automatically");
});
