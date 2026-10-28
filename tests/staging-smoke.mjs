import assert from "node:assert/strict";
const base=process.env.TRAINSYNC_STAGE_URL || "https://trainsync-staging-demo-staging.up.railway.app";
async function check(path,options={},expected=200) {
  let error;
  for(let i=0;i<6;i++){
    try {
      const response=await fetch(base+path,{...options,signal:AbortSignal.timeout(15000),redirect:"follow",cache:"no-store"});
      assert.equal(response.status,expected,`${path}: HTTP ${response.status}`);
      return response;
    }catch(err){
      error=err;
      if(i<5)await new Promise(resolve=>setTimeout(resolve,2000));
    }
  }
  throw error;
}
const health=await (await check("/health")).json();
assert.equal(health.mode,"synthetic-staging");
console.log("OK: stage health");
const html=await (await check("/")).text();
assert.match(html,/\.\/app\.mjs\?v=1/);
const app=await (await check("/runna-next/app.mjs?v=1")).text();
const css=await (await check("/runna-next/app.css?v=1")).text();
assert.match(app,/renderWizard/);
assert.match(app,/todayView/);
assert.match(app,/planView/);
assert.match(app,/detailView/);
assert.match(css,/\.nav/);
console.log("OK: Runna-inspired landing page, onboarding, plan, session detail and mobile navigation");
const previous=await (await check("/index.html?demo=1")).text();
assert.match(previous,/trainsync-v3\.js/);
console.log("OK: previous TrainSync preview preserved at /index.html");
const status=await (await check("/v3/status")).json();
assert.equal(status.demo,true);
console.log("OK: stage backend marked demo");
const dash=await (await check("/v3/dashboard")).json();
assert.equal(dash.demo,true);
assert.ok(dash.activities.length>0);
console.log("OK: all fitness data explicitly synthetic");
const tomorrow=new Date();tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
const w={kind:"interval",date:tomorrow.toISOString().slice(0,10),repeats:6,intervalMeters:800};
const options={method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(w)};
const preview=await (await check("/v3/workouts/preview",options)).json();
assert.equal(preview.demo,true);
assert.ok(preview.preview.description.includes("6x\n- 800mtr Z4 Pace"));
console.log("OK: 6x800 preview");
const publish=await (await check("/v3/workouts/publish",options)).json();
assert.equal(publish.simulated,true);
assert.equal(publish.watchStatus,"non vérifié");
console.log("OK: publication fictive, aucune activité Intervals écrite");
