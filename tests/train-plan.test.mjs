import test from "node:test";
import assert from "node:assert/strict";
import {generateRunningPlan,applyTodayRecommendation,getWeek,moveWorkout,normalizePlanProfile} from "../web/plan-engine.mjs";
const today="2026-10-28";
const profile={distanceKm:10,raceDate:"2027-02-14",weeklyKm:20,frequency:3,longDay:6,availableDays:[1,3,6]};
const build=(x={})=>generateRunningPlan({...profile,...x},today);
test("date and goal validation",()=>{
  assert.throws(()=>build({raceDate:"2026-11-01"}),/échéance/);
  assert.throws(()=>build({raceDate:"2027-02-30"}),/Date/);
  assert.throws(()=>build({availableDays:[1,2]}),/au moins/);
  assert.throws(()=>build({frequency:9}),/Nombre/);
  assert.equal(normalizePlanProfile(profile,today).distanceKm,10);
});
test("schedule has distinct IDs, calendar weeks and race day",()=>{
  const plan=build();assert.ok(plan.totalWeeks>10);
  assert.equal(new Set(plan.sessions.map(s=>s.id)).size,plan.sessions.length);
  assert.ok(plan.sessions.some(s=>s.kind==="race"&&s.date===profile.raceDate));
  assert.ok(plan.sessions.every(s=>s.date>=today&&s.date<=profile.raceDate));
  assert.ok(plan.summary.some(w=>w.phase==="Assimilation"));
  assert.ok(plan.summary.some(w=>w.phase==="Affûtage"));
});
test("long runs scheduled on preferred Sunday and never exceed long cap",()=>{
  const plan=build();
  const long=plan.sessions.filter(s=>s.kind==="long");
  assert.ok(long.length>4);
  assert.ok(long.every(s=>new Date(s.date+"T12:00:00Z").getUTCDay()===0));
  assert.ok(long.every(s=>s.distanceKm<=13.5));
});
test("low-volume user gets no compulsory interval session",()=>{
 const p=build({weeklyKm:6});
 assert.ok(!p.sessions.some(s=>["interval","tempo"].includes(s.kind)));
 assert.ok(p.notes.length>0);
});
test("holiday and feeling-unwell adjustments change workouts, preserve baseline",()=>{
 const normal=build();
 const holiday=build({}, {holiday:{start:"2026-11-01",end:"2026-11-10",mode:"off"}});
 assert.ok(holiday.sessions.some(s=>s.kind==="rest"));
 assert.ok(!normal.sessions.some(s=>s.kind==="rest"));
 const recovery=build({}, {recovery:{start:"2026-11-03",end:"2026-11-08",mode:"easy"}});
 assert.ok(recovery.sessions.filter(s=>s.date>="2026-11-03"&&s.date<="2026-11-08").every(s=>s.kind==="easy"||s.kind==="race"));
});
test("Hevy leg session proposes to lighten quality, without mutating plan",()=>{
 const plan=build();const quality=plan.sessions.find(s=>s.kind==="interval"||s.kind==="tempo");
 const result=applyTodayRecommendation(plan,{today:quality.date,strength:[{
  startedAt:quality.date+"T08:00:00",exercises:[{title:"Back Squat"}]
 }]});
 assert.equal(result.action,"alléger");assert.equal(result.changed,true);
 assert.equal(plan.sessions.find(s=>s.id===quality.id).kind,quality.kind);
});
test("move workout validates collisions and keeps other workouts",()=>{
 const plan=build(); const a=plan.sessions.find(s=>s.kind==="easy");
 const date="2026-11-02";
 assert.throws(()=>moveWorkout(plan,a.id,profile.raceDate),/Une autre|déplacement|déplacement|course/i); 
 const unused=Array.from({length:30},(_,i)=>{const d=new Date(today+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+i+1);return d.toISOString().slice(0,10)}).find(d=>!plan.sessions.some(s=>s.date===d));
 if(unused){
   const changed=moveWorkout(plan,a.id,unused);
   assert.equal(changed.sessions.find(s=>s.id===a.id).date,unused);
   assert.notEqual(plan.sessions.find(s=>s.id===a.id).date,unused);
 }
 assert.ok(getWeek(plan,1).length>0);
});
