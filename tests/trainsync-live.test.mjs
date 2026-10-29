import test from "node:test";
import assert from "node:assert/strict";
import live from "../preview/live-worker.mjs";
import {encryptApiKey,decryptApiKey} from "../web/runna-next/credentials.mjs";
const KEY="FICTIVE_TEST_TOKEN_123456";
const day=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const req=(url,method="GET",body,auth=true)=>new Request("https://trainsync.local/v3"+url,{
 method,headers:{...(auth?{"x-intervals-api-key":KEY}:{}),...(body?{"Content-Type":"application/json"}:{})},
 ...(body?{body:JSON.stringify(body)}:{})
});
test("missing user API key cannot read real account",async()=>{
 const res=await live.fetch(req("/dashboard", "GET",null,false));
 assert.equal(res.status,401);
 assert.match((await res.json()).error,/clé/i);
});
test("workout preview validates 6 × 800 m without sensitive credentials",async()=>{
 const input={kind:"interval",date:day(1),repeats:6,intervalMeters:800};
 const res=await live.fetch(req("/workouts/preview","POST",input,false));
 assert.equal(res.status,200);
 const d=await res.json();
 assert.equal(d.demo,false);
 assert.match(d.preview.description,/6x\n- 800mtr Z4 Pace/);
 assert.equal(d.preview.type,"Run");
});
test("real status checks personal athlete with Basic API_KEY auth, never echoes secret",async()=>{
 const prior=globalThis.fetch, calls=[];
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url,auth:options.headers.Authorization});return Response.json({name:"Runner"});};
  const res=await live.fetch(req("/status"));
  assert.equal(res.status,200);
  const txt=await res.text();assert.ok(!txt.includes(KEY));
  assert.equal(JSON.parse(txt).intervals.ok,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"https://intervals.icu/api/v1/athlete/0");
  assert.equal(atob(calls[0].auth.slice(6)),"API_KEY:"+KEY);
 }finally{globalThis.fetch=prior;}
});
test("dashboard pulls actual activities, calendar and wellness without creating duplicates",async()=>{
 const prior=globalThis.fetch;
 try{
 globalThis.fetch=async(url)=>{
  const x=String(url);
  if(x.includes("/activities?"))return Response.json([{id:"run-1",type:"Run",name:"Mon footing",start_date_local:day(-1)+"T08:00:00",distance:8000,moving_time:2800},{id:"run-1",type:"Run",name:"Mon footing",start_date_local:day(-1)+"T08:00:00",distance:8000,moving_time:2800}]);
  if(x.includes("/events?"))return Response.json([{id:99,name:"Séance prévue",start_date_local:day(1)+"T08:00:00",type:"Run",workout_doc:{steps:[{type:"repeat"}]}}]);
  if(x.includes("/wellness?"))return Response.json([{id:day(-1),hrv:51,restingHR:50}]);
  throw Error("Unexpected "+x);
 };
 const res=await live.fetch(req("/dashboard?days=14"));assert.equal(res.status,200);
 const d=await res.json();assert.equal(d.activities.length,1);assert.equal(d.activities[0].distanceKm,8);
 assert.equal(d.planned[0].structured,true);assert.equal(d.wellness[0].hrv,51);
 assert.equal(d.demo,false);assert.equal(d.strength.length,0);
 }finally{globalThis.fetch=prior;}
});
test("6x800 real publication uses bulk upsert, reads the persisted WorkoutDoc and guards retries",async()=>{
 const prior=globalThis.fetch,reqs=[];
 let saved=null;
 const input={kind:"interval",date:day(2),repeats:6,intervalMeters:800};
 try{
  globalThis.fetch=async(url,options={})=>{
   const path=String(url);reqs.push({path,method:options.method||"GET"});
   if(path.includes("/events?"))return Response.json(saved?[saved]:[]);
   if(path.includes("/events/bulk?upsert=true")){
    const workouts=JSON.parse(options.body);
    assert.equal(workouts.length,1);assert.equal(workouts[0].category,"WORKOUT");
    assert.match(workouts[0].description,/6x\n- 800mtr Z4 Pace/);
    saved={id:921,...workouts[0],workout_doc:{steps:[{type:"warmup"},{type:"repeat"},{type:"cooldown"}]}};
    return Response.json([saved]);
   }
   if(path.endsWith("/events/921"))return Response.json(saved);
   throw Error("Unexpected "+path);
  };
  const first=await live.fetch(req("/workouts/publish","POST",input));
  assert.equal(first.status,200);const d=await first.json();
  assert.equal(d.event.structured,true);assert.equal(d.watchStatus,"non vérifié");assert.equal(d.existing,false);
  const again=await live.fetch(req("/workouts/publish","POST",input));
  assert.equal(again.status,200);assert.equal((await again.json()).existing,true);
  assert.equal(reqs.filter(x=>x.path.includes("/events/bulk?upsert=true")).length,1);
 }finally{globalThis.fetch=prior;}
});
test("encryption vault keeps key encrypted and requires correct passphrase",async()=>{
 const secret=KEY+"EXTRA",password="une-phrase-longue-tres-secrete";
 const cipher=await encryptApiKey(secret,password);
 assert.ok(!cipher.includes(secret));
 assert.equal(await decryptApiKey(cipher,password),secret);
 await assert.rejects(decryptApiKey(cipher,"mauvais-secret"),/incorrect|illisible/i);
});
