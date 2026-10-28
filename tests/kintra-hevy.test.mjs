import test from "node:test";
import assert from "node:assert/strict";
import {hevyFetch} from "../preview/hevy-relay.mjs";
const KEY="00000000-0000-4000-8000-000000000001";
const request=(key)=>new Request("https://kintra.test/v3/hevy/workouts",{headers:{"x-hevy-api-key":key||""}});
test("Hevy missing key is rejected without external access",async()=>{
 const result=await hevyFetch(request(""));
 assert.equal(result.status,401);
 assert.match((await result.json()).error,/Hevy Pro/);
});
test("Hevy workout list normalized for real muscle recovery context without leaking key",async()=>{
 const prior=globalThis.fetch;
 try{
  const calls=[];
  globalThis.fetch=async(url,opt)=>{
   calls.push({url:String(url),auth:opt.headers["api-key"],method:opt.method});
   return Response.json({page_count:1,workouts:[
    {id:"session1",title:"Jambes",start_time:"2026-10-28T12:30:00Z",exercises:[
     {title:"Back Squat",sets:[{reps:8,weight_kg:85,rpe:8},{reps:6,weight_kg:90,rpe:9}]}]},
    {id:"session2",title:"Haut",start_time:"2026-10-27T12:30:00Z",exercises:[]}
   ]});
  };
  const result=await hevyFetch(request(KEY));
  assert.equal(result.status,200);
  const raw=await result.text();assert.ok(!raw.includes(KEY));
  const d=JSON.parse(raw);assert.equal(d.strength.length,2);
  assert.equal(d.strength[0].exercises[0].sets[0].weightKg,85);
  assert.equal(d.strength[0].source,"Hevy");
  assert.equal(calls[0].auth,KEY);assert.equal(calls[0].method,"GET");
  assert.equal(calls[0].url,"https://api.hevyapp.com/v1/workouts?page=1&pageSize=10");
 }finally{globalThis.fetch=prior;}
});
test("Hevy API access denied is explicitly shown and not silently treated as connected",async()=>{
 const prior=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({error:"Access denied"}),{status:403,headers:{"Content-Type":"application/json"}});
  const res=await hevyFetch(request(KEY));assert.equal(res.status,401);
  assert.match((await res.json()).error,/refusé/);
 }finally{globalThis.fetch=prior;}
});
