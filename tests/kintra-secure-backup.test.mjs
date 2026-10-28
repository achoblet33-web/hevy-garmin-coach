import test from "node:test";
import assert from "node:assert/strict";
import {encryptPortableBackup,decryptPortableBackup,isEncryptedBackup,SECURE_SCHEMA} from "../web/runna-next/secure-backup.mjs";
import {createPortableBackup} from "../web/runna-next/local-backup.mjs";
const password="une-phrase-longue-qui-reste-privee";
const plan=()=>({mode:"maintenance",totalWeeks:4,profile:{frequency:3},
 summary:[{week:1,plannedKm:26}],sessions:[{id:"course1",date:"2026-10-28",kind:"easy",distanceKm:8}]});
test("encrypted export round trip without plaintext exercise data",async()=>{
 const data={plan:plan(),feedback:{"activity:1":{rpe:7,comment:"Jambes lourdes"}},
  pairedRuns:{course1:"intervals:12"},apiKey:"private-api-token",gps:[[14,-61]],wellness:[{hrv:55}]};
 const out=await encryptPortableBackup(data,password,"2026-10-28T11:00:00Z");
 assert.equal(isEncryptedBackup(out),true);
 for(const forbidden of ["Jambes lourdes","course1","private-api-token","gps","wellness","intervals:12"])assert.ok(!out.includes(forbidden));
 const decoded=await decryptPortableBackup(out,password);
 assert.equal(decoded.plan.sessions[0].id,"course1");
 assert.equal(decoded.feedback["activity:1"].rpe,7);
 assert.equal(decoded.pairedRuns.course1,"intervals:12");
 assert.equal(decoded.createdAt,"2026-10-28T11:00:00Z");
});
test("salt and IV are unique, tampering and wrong password fail closed",async()=>{
 const a=await encryptPortableBackup({plan:plan()},password);
 const b=await encryptPortableBackup({plan:plan()},password);
 assert.notEqual(a,b);
 const packed=JSON.parse(a);assert.equal(packed.schema,SECURE_SCHEMA);
 await assert.rejects(decryptPortableBackup(a,"mauvaise-phrase-secrete"),/incorrecte|endommagée/);
 packed.ciphertext=packed.ciphertext.slice(0,-4)+"AAAA";
 await assert.rejects(decryptPortableBackup(JSON.stringify(packed),password),/incorrecte|endommagée/);
});
test("invalid versions, oversized and too short passwords rejected",async()=>{
 await assert.rejects(encryptPortableBackup({plan:plan()},"court"),/12 caractères/);
 await assert.rejects(decryptPortableBackup('{"schema":"bad"}',password),/Version/);
 assert.equal(isEncryptedBackup(createPortableBackup({plan:plan()})),false);
 await assert.rejects(decryptPortableBackup("x".repeat(1650001),password),/volumineux/);
});
