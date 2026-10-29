import test from "node:test";
import assert from "node:assert/strict";
import {weeklyRunningBars,sleepTrend,strengthDistribution,renderWeeklyChart,renderRaceSummary,formatPace,formatTime}
 from "../web/runna-next/kintra-presenter.mjs";
const date="2026-10-28";
test("weekly running chart uses only recorded activities, never the planned goal as actual",()=>{
 const activities=[{category:"Course",startedAt:"2026-10-28T07:00:00",distanceKm:8},
  {category:"Course",startedAt:"2026-10-27T07:00:00",distanceKm:6},
  {category:"Musculation",startedAt:"2026-10-28T12:00:00",distanceKm:5}];
 const w=weeklyRunningBars(activities,date);
 assert.equal(w.count,2);assert.equal(w.totalKm,14);assert.equal(w.bars.length,7);
 const html=renderWeeklyChart(activities,date,{summary:[{from:"2026-10-26",plannedKm:40}]});
 assert.match(html,/14 km enregistrés/);assert.match(html,/objectif du plan 40 km/);
});
test("sleep card compares nights only when three reference nights are available",()=>{
 const rows=[{date,sleepSecs:28800,sleepScore:80},
  {date:"2026-10-27",sleepSecs:25200},{date:"2026-10-26",sleepSecs:27000},
  {date:"2026-10-25",sleepSecs:26100}];
 const v=sleepTrend(rows,date);
 assert.equal(v.hours,8);assert.equal(v.minutes,0);assert.equal(v.score,80);
 assert.ok(Number.isInteger(v.changePct));
 assert.equal(sleepTrend([rows[0]],date).changePct,null);
 assert.equal(sleepTrend([{date:"2026-10-20",sleepSecs:28000}],date).hours,null);
});
test("Hevy upper/lower classification avoids inventing unknown splits",()=>{
 const sessions=["Jambes","Haut du corps","Full body","Training"].map((title,i)=>({startedAt:"2026-10-28T08:00:00",title,id:i}));
 const split=strengthDistribution(sessions,date);
 assert.equal(split.total,4);assert.equal(split.upper,1);assert.equal(split.lower,1);
 assert.equal(split.other,2);
});
test("completed activity metrics are computed from source, RPE stays unknown if missing",()=>{
 const run={category:"Course",id:"intervals:alpha",externalId:"alpha",startedAt:"2026-10-28T07:30:00",
  title:"Course de test",distanceKm:12.4,durationMinutes:63.7,averageHeartRate:158,trainingLoad:78};
 const ui=renderRaceSummary([run],{});
 assert.match(ui,/12,4 km/);
 assert.match(ui,/1:03:42/);
 assert.match(ui,/5:08 \/km/);
 assert.match(ui,/158 bpm/);
 assert.match(ui,/activity:alpha/);
 assert.match(ui,/Ressenti/);
 assert.ok(!ui.includes("8/10"));
 const feedback=renderRaceSummary([run],{"activity:alpha":{rpe:8}});
 assert.match(feedback,/8\/10/);
});
test("training values and user names are HTML-escaped",()=>{
 const run={category:"Course",id:"intervals:abc",externalId:"abc",startedAt:"2026-10-28",title:"<script>alert(1)</script>"};
 const ui=renderRaceSummary([run],{});
 assert.ok(!ui.includes("<script>"));assert.match(ui,/&lt;script&gt;/);
});
test("time and pace formatting handles unavailable data",()=>{
 assert.equal(formatPace(null),"—");
 assert.equal(formatTime(undefined),"—");
 assert.equal(formatPace(5+8/60),"5:08 /km");
});
