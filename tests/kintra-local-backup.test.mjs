import test from "node:test";
import assert from "node:assert/strict";
import {createPortableBackup,parsePortableBackup,MAX_BACKUP_BYTES} from "../web/runna-next/local-backup.mjs";
const plan=()=>({mode:"maintenance",totalWeeks:4,profile:{weeklyKm:24,frequency:3},
 summary:[{week:1,plannedKm:24}],
 sessions:[{id:"run-1",date:"2026-10-28",kind:"easy",title:"Endurance",distanceKm:8,week:1,status:"planned"}]});
test("portable backup contains plan and feedback but never API keys, GPS, wellness or vault",()=>{
 const raw=createPortableBackup({plan:plan(),history:[plan()],feedback:{"activity:abc":{rpe:8,comment:"Jambes lourdes"}},
  adaptiveSuggestions:false,apiToken:"PRIVATE",hevyKey:"SECRET",weatherPlace:{latitude:14.5,longitude:-61},
  wellness:[{hrv:50}],sessions:[{gps:[2,3]}]},"2026-10-28T12:00:00Z");
 for(const secret of ["PRIVATE","SECRET","apiToken","hevyKey","weatherPlace","latitude","wellness","gps"])assert.ok(!raw.includes(secret),secret);
 const roundtrip=parsePortableBackup(raw);
 assert.equal(roundtrip.plan.sessions[0].id,"run-1");
 assert.equal(roundtrip.count.versions,1);
 assert.equal(roundtrip.feedback["activity:abc"].rpe,8);
 assert.equal(roundtrip.adaptiveSuggestions,false);
});
test("secrets cannot smuggle in custom plan fields even when nested",()=>{
 const p=plan();p.profile.apiKey="secret-test-token";p.sessions[0].authorization="secret";
 const content=createPortableBackup({plan:p});
 assert.ok(!content.includes("secret-test-token"));
 assert.ok(!content.includes('"authorization"'));
});
test("invalid JSON, version, oversized and malformed plans cannot overwrite the existing state",()=>{
 assert.throws(()=>parsePortableBackup("not json"),/JSON/);
 assert.throws(()=>parsePortableBackup(JSON.stringify({schema:"unknown",payload:{}})),/Format/);
 assert.throws(()=>parsePortableBackup("a".repeat(MAX_BACKUP_BYTES+1)),/taille maximale/);
 const x=JSON.parse(createPortableBackup({plan:plan()}));
 x.payload.plan.sessions.push({...x.payload.plan.sessions[0]});
 assert.throws(()=>parsePortableBackup(JSON.stringify(x)),/dupliqué/);
});
test("malformed RPE and active plan with invalid dates are rejected",()=>{
 assert.throws(()=>createPortableBackup({feedback:{"activity:1":{rpe:99}}}),/RPE/);
 const p=plan();p.sessions[0].date="tomorrow";
 assert.throws(()=>createPortableBackup({plan:p}),/Séance invalide/);
});
