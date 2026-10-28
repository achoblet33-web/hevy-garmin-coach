import test from "node:test";
import assert from "node:assert/strict";
import {reconcileWorkouts,uniqueRunningActivities,findPotentialDuplicates,completedStats}
 from "../web/runna-next/workout-reconciliation.mjs";
const run=(id,extras={})=>({id,externalId:id,source:"Intervals.icu",category:"Course",
 startedAt:"2026-10-28T10:00:00Z",distanceKm:10,durationMinutes:50,...extras});
test("missing calendar event ID never confirms an unpaired workout",()=>{
 const matched=reconcileWorkouts([run("a")],[{id:"",date:"2026-10-28",kind:"tempo"}]);
 assert.equal(matched[0].matchStatus,"suggested");
 assert.equal(matched[0].actual,null);
});
test("same-day two planned workouts are ambiguous, never auto marked as done or suggested",()=>{
 const results=reconcileWorkouts([run("a")],[
  {id:"p1",date:"2026-10-28",kind:"easy"},{id:"p2",date:"2026-10-28",kind:"interval"}]);
 assert.deepEqual(results.map(x=>x.matchStatus),["unmatched","unmatched"]);
});
test("a completed run cannot confirm two different plan entries or be tentatively reused",()=>{
 const a=run("a",{pairedEventId:"p1"});
 const results=reconcileWorkouts([a],[
  {id:"p1",date:"2026-10-28"},{id:"p2",pairedActivityId:"a",date:"2026-10-28"}]);
 assert.deepEqual(results.map(x=>x.matchStatus),["confirmed","unmatched"]);
});
test("explicit paired activity ID works without paired event ID",()=>{
 const results=reconcileWorkouts([run("a")],[{id:"p1",pairedActivityId:"a",date:"2026-10-28"}]);
 assert.equal(results[0].matchStatus,"confirmed");
 assert.equal(results[0].source,"paired_activity_id");
});
test("same source duplicate provider IDs merge, richest measurements preserved",()=>{
 const input=[run("intervals:a",{externalId:"a",distanceKm:null,pairedEventId:"p1"}),
  run("alias:a",{externalId:"a",averageHeartRate:162,distanceKm:10})];
 const list=uniqueRunningActivities(input);
 assert.equal(list.length,1);
 assert.equal(list[0].pairedEventId,"p1");
 assert.equal(list[0].averageHeartRate,162);
 assert.equal(completedStats(input).count,1);
});
test("different-source near-identical workouts only flagged; they are never silently deleted",()=>{
 const rows=[run("apple:1",{source:"Apple Health"}),run("garmin:2",{source:"Garmin",startedAt:"2026-10-28T10:00:55Z",distanceKm:10.04})];
 assert.equal(uniqueRunningActivities(rows).length,2);
 const suspects=findPotentialDuplicates(rows);
 assert.equal(suspects.length,1);
 assert.match(suspects[0].reason,/non supprimé/);
});
test("separate activities more than two minutes apart are not flagged",()=>{
 assert.equal(findPotentialDuplicates([run("a"),run("b",{startedAt:"2026-10-28T11:30:00Z"})]).length,0);
});
