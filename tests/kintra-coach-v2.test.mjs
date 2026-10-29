import test from "node:test";
import assert from "node:assert/strict";
import {buildCoachReview,previewCoachAdjustment,renderCoachReview,renderCoachProposalPreview}
 from "../web/runna-next/kintra-coach-v2.mjs";

const date="2026-10-28";
const planned=[
 {id:"workout-wed",date:"2026-10-28",week:1,title:"Footing prévu",kind:"easy",distanceKm:8,intensity:"RPE 2–4",status:"planned"},
 {id:"workout-fri",date:"2026-10-30",week:1,title:"Tempo",kind:"tempo",distanceKm:10,intensity:"RPE 6",status:"planned"},
 {id:"workout-sun",date:"2026-11-01",week:1,title:"Sortie longue",kind:"long",distanceKm:15,status:"planned"}];
const plan=()=>({mode:"maintenance",sessions:structuredClone(planned),summary:[{week:1,plannedKm:33}],
 notes:[],totalWeeks:4,profile:{frequency:3}});
const run={id:"intervals:abc",externalId:"abc",category:"Course",startedAt:"2026-10-28T08:00:00",distanceKm:7.5,
 durationMinutes:40,pairedEventId:"workout-wed"};
const hevy={id:"hevy:1",category:"Musculation",source:"Hevy",title:"Jambes",
 startedAt:"2026-10-27T12:00:00Z",exercises:[{title:"Back Squat",sets:[{weightKg:85,reps:5}]}]};
const wellness=[
 {date:"2026-10-28",sleepSecs:5*3600,hrv:25,restingHR:64},
 ...[27,26,25,24,23].map((day,i)=>({date:"2026-10-"+day,sleepSecs:7*3600,hrv:52+i,restingHR:51+i%3}))];

test("GPS and Hevy fixtures feed the coach without any real provider key or network",()=>{
 const review=buildCoachReview({plan:plan(),activities:[run],strength:[hevy],wellness,date});
 assert.equal(review.plannedKm,33);
 assert.equal(review.dueKm,8); // Only elapsed scheduled days, not future sessions.
 assert.equal(review.recordedKm,7.5);
 assert.equal(review.deltaKm,-0.5);
 assert.equal(review.confirmedCount,1);
 assert.equal(review.strengthCount,1);
 assert.equal(review.readiness,"caution");
 assert.equal(review.proposals.length,1);
 assert.match(review.proposals[0].reason,/jambes/);
});
test("same-day workout is merely suggested unless explicit pairedEventId is recorded",()=>{
 const candidate={...run,pairedEventId:null};
 const review=buildCoachReview({plan:plan(),activities:[candidate],strength:[],wellness:[],date});
 assert.equal(review.confirmedCount,0);
 assert.equal(review.possibleCount,1);
 assert.equal(review.recordedKm,7.5);
 assert.equal(review.proposals.length,0);
 assert.match(renderCoachReview(review),/non confirmé/);
});
test("lack of recorded course or recovery is unknown, not converted into adherence or fatigue",()=>{
 const review=buildCoachReview({plan:plan(),activities:[],strength:[],wellness:[],date});
 assert.equal(review.recordedKm,null);
 assert.equal(review.deltaKm,null);
 assert.equal(review.readiness,"insufficient");
 assert.equal(review.proposals.length,0);
 assert.match(renderCoachReview(review),/non vérifiable/);
});
test("adjustment is preview-only; accepted draft changes one future session and weekly summary",()=>{
 const original=plan(),r=buildCoachReview({plan:original,activities:[run],strength:[hevy],wellness,date});
 const preview=previewCoachAdjustment(original,r.proposals[0],date);
 assert.equal(original.sessions[1].kind,"tempo"); // Original immutable until explicit accept.
 assert.equal(preview.after.kind,"easy");
 assert.equal(preview.after.distanceKm,7.5);
 assert.equal(preview.plan.sessions[0].kind,"easy");
 assert.equal(preview.plan.sessions[2].distanceKm,15);
 assert.equal(preview.plan.summary[0].plannedKm,30.5);
 assert.match(renderCoachProposalPreview(preview,r.proposals[0].reason),/coachAccept/);
 assert.match(renderCoachProposalPreview(preview,r.proposals[0].reason),/coachReject/);
});
test("no retroactive edits and no changes to completed or non-quality workouts",()=>{
 const s=plan(),p={kind:"ease-quality",targetId:"workout-wed"};
 assert.throws(()=>previewCoachAdjustment(s,p,date),/non applicable/);
 s.sessions[1].status="done";
 assert.throws(()=>previewCoachAdjustment(s,{kind:"ease-quality",targetId:"workout-fri"},date),/plus modifiable/);
 assert.throws(()=>previewCoachAdjustment(plan(),{kind:"ease-quality",targetId:"workout-fri"},"2026-11-02"),/plus modifiable/);
});
test("display escapes malicious source titles and proposals never include provider keys",()=>{
 const p=plan(),r=buildCoachReview({plan:p,activities:[run],
 strength:[{...hevy,exercises:[{title:"<img src=x onerror=alert(1)>",sets:[]}]}],wellness,date});
 r.alerts.push('<img src=x onerror="alert(1)">');
 const html=renderCoachReview(r);
 assert.ok(!html.includes('<img'));
 assert.match(html,/&lt;img/);
 assert.ok(!JSON.stringify(r).includes("api-key"));
});
