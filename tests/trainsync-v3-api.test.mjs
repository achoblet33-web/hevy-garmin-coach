import test from "node:test";
import assert from "node:assert/strict";
import api from "../Backend/worker-v30.js";
import fake from "../preview/worker.js";
const dateOffset=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const auth="Bearer TEST_ONLY_NOT_A_REAL_SECRET";
const env={APP_TOKEN:"TEST_ONLY_NOT_A_REAL_SECRET",INTERVALS_API_KEY:"TEST_ONLY",INTERVALS_ATHLETE_ID:"0"};
const request=(path,method="GET",body,hasAuth=true)=>new Request("https://api.test"+path,{
 method,headers:{...(hasAuth?{Authorization:auth}:{}),...(body?{"Content-Type":"application/json"}:{})},
 ...(body?{body:JSON.stringify(body)}:{})
});
test("v3 endpoints fail closed with no bearer token",async()=>{
 const response=await api.fetch(request("/v3/status","GET",null,false),env,{});
 assert.equal(response.status,401);
});
test("missing Intervals API config blocks live workouts",async()=>{
 const response=await api.fetch(request("/v3/dashboard"),{APP_TOKEN:env.APP_TOKEN},{});
 assert.equal(response.status,503);
});
test("6x800m preview is deterministic and does not write",async()=>{
 const w={kind:"interval",date:dateOffset(1),repeats:6,intervalMeters:800};
 const response=await api.fetch(request("/v3/workouts/preview","POST",w),env,{});
 assert.equal(response.status,200);
 const data=await response.json();
 assert.match(data.preview.description,/6x\\n- 800mtr Z4 Pace/);
 assert.match(data.preview.external_id,/trainsync3-/);
});
test("publishing uses documented Intervals bulk upsert and verifies event",async()=>{
 const original=globalThis.fetch;
 const date=dateOffset(1);let calls=[];
 try {
 globalThis.fetch=async(url, options={})=>{
   const route=String(url); calls.push({route,method:options.method || "GET",body:options.body});
   if(route.includes("/events?"))return Response.json([]);
   if(route.includes("/events/bulk?upsert=true")){
     const data=JSON.parse(options.body);
     assert.equal(data.length,1);
     assert.equal(data[0].category,"WORKOUT");
     assert.equal(data[0].type,"Run");
     assert.equal(data[0].external_id,`trainsync3-${date}-interval-6x800`);
     return Response.json([{id:101,...data[0]}]);
   }
   if(route.endsWith("/events/101"))return Response.json({
      id:101,external_id:`trainsync3-${date}-interval-6x800`,
      name:"TrainSync · Fractionné",start_date_local:date+"T00:00:00",
      type:"Run",workout_doc:{steps:[{type:"warmup"},{type:"interval"}]}
   });
   throw new Error("Unexpected fetch route: "+route);
 };
 const w={kind:"interval",date,repeats:6,intervalMeters:800};
 const response=await api.fetch(request("/v3/workouts/publish","POST",w),env,{});
 assert.equal(response.status,200);
 const payload=await response.json();
 assert.equal(payload.event.structured,true);
 assert.equal(payload.watchStatus,"non vérifié");
 assert.equal(calls.filter(x=>x.route.includes("/events/bulk?upsert=true")).length,1);
 }finally{globalThis.fetch=original;}
});
test("calendar covers 42 future days, unlike activity history",async()=>{
 const original=globalThis.fetch;const date=dateOffset(8),queries=[];
 try{
 globalThis.fetch=async(url)=>{
    const u=new URL(url);queries.push(u);
    if(u.pathname.includes("/activities"))return Response.json([]);
    if(u.pathname.endsWith("/wellness"))return Response.json([]);
    if(u.pathname.endsWith("/events"))return Response.json([{id:17,name:"Test next week",
      start_date_local:date+"T00:00:00",category:"WORKOUT",type:"Run",workout_doc:{steps:[{}]}}]);
    throw new Error("Unexpected "+u);
 };
 const response=await api.fetch(request("/v3/dashboard?days=7"),env,{});
 assert.equal(response.status,200);
 const payload=await response.json();
 assert.equal(payload.planned.some(x=>x.id==="17"),true);
 const calendar=queries.find(x=>x.pathname.endsWith("/events"));
 assert.ok(calendar);
 assert.ok(calendar.searchParams.get("newest")>dateOffset(7));
 }finally{globalThis.fetch=original;}
});
test("public preview does not send writes to real Intervals",async()=>{
 const resp=await fake.fetch(request("/v3/workouts/publish","POST",{
 kind:"interval",date:dateOffset(1),repeats:6,intervalMeters:800
 }),{});
 assert.equal(resp.status,200);
 const result=await resp.json();
 assert.equal(result.simulated,true);
 assert.match(result.message,/SIMULATION/);
});
