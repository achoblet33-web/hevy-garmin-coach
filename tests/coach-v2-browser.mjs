// No real credentials or external fitness providers: local Railway preview server + mocked Intervals/Hevy data.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";

const port=19762,base="http://127.0.0.1:"+port;
const day=new Date().toISOString().slice(0,10);
const add=(x,n)=>{const d=new Date(x+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const plan={
 mode:"maintenance",totalWeeks:4,createdAt:day,notes:[],
 profile:{mode:"maintenance",weeklyKm:25,frequency:3,longDay:6,availableDays:[1,3,6],maintenanceFocus:"balance",raceDate:null},
 summary:[{week:1,phase:"Entretien",from:day,plannedKm:29,count:3}],
 sessions:[
 {id:"today-run",date:day,week:1,kind:"easy",title:"Footing",distanceKm:8,status:"planned",intensity:"RPE 2–4"},
 {id:"quality-run",date:add(day,2),week:1,kind:"tempo",title:"Tempo léger",distanceKm:9,status:"planned",intensity:"RPE 5–6"},
 {id:"long-run",date:add(day,4),week:1,kind:"long",title:"Sortie longue facile",distanceKm:12,status:"planned",intensity:"RPE 2–4"}
 ]};
const mock={ok:true,demo:true,activities:[{id:"intervals:abc",externalId:"abc",category:"Course",startedAt:day+"T07:00:00Z",
 title:"Sortie enregistrée",distanceKm:7.5,durationMinutes:42,pairedEventId:"today-run"}],
 strength:[{id:"hevy:fake",source:"Hevy",category:"Musculation",startedAt:add(day,-1)+"T12:00:00Z",title:"Jambes",
 exercises:[{title:"Back Squat",sets:[{reps:8,weightKg:80,rpe:8}]}]}],
 wellness:[{date:day,sleepSecs:18000,hrv:26,restingHR:63},
 ...Array.from({length:5},(_,i)=>({date:add(day,-i-1),sleepSecs:26100,hrv:54+i,restingHR:50+i%2}))],
 planned:[]};
const child=spawn(process.execPath,["preview/server.mjs"],{env:{...process.env,PORT:String(port)},stdio:"ignore"});
let browser;
try{
 let ready=false;
 for(let i=0;i<90;i++){
  try{const r=await fetch(base+"/health",{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(ready,"preview server not ready");
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,locale:"fr-FR",
  timezoneId:"UTC",isMobile:true,hasTouch:true,reducedMotion:"reduce"});
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 page.on("dialog",d=>d.accept());
 await page.addInitScript(saved=>localStorage.setItem("trainsync-next-running-v1",JSON.stringify(saved)),
  {plan,history:[],feedback:{},adaptiveSuggestions:true});
 await page.route("**/v3/dashboard?*",route=>route.fulfill({status:200,contentType:"application/json",
  body:JSON.stringify(mock)}));
 await page.goto(base+"/runna-next/index.html?demo=1",{waitUntil:"domcontentloaded",timeout:30000});
 await page.locator('.nav button[data-action="tab:plan"]').click();
 const review=page.locator('[data-testid="coach-v2-review"]');
 await review.waitFor({timeout:10000});
 await page.locator('button[data-action="coachProposal:0"]').waitFor({timeout:10000});
 assert.match(await review.innerText(),/Prévu \/ réalisé/);
 assert.match(await review.innerText(),/Course enregistrée/);
 assert.match(await review.innerText(),/Musculation enregistrée/);
 const w=await page.evaluate(()=>({inner:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
 assert.ok(w.scroll<=w.inner+1&&w.body<=w.inner+1,JSON.stringify(w));
 await page.locator('button[data-action="coachProposal:0"]').click();
 await page.getByText("Vérifier la proposition").waitFor();
 assert.match(await page.locator(".modal").innerText(),/AVANT/);
 assert.match(await page.locator(".modal").innerText(),/APRÈS CONFIRMATION/);
 await page.setViewportSize({width:320,height:700});
 const small=await page.evaluate(()=>({width:innerWidth,html:document.documentElement.scrollWidth,
  body:document.body.scrollWidth,modal:document.querySelector(".modal")?.getBoundingClientRect().width}));
 assert.ok(small.html<=small.width+1&&small.body<=small.width+1&&small.modal<=small.width+1,JSON.stringify(small));
 await mkdir("test-artifacts",{recursive:true});
 await page.screenshot({path:"test-artifacts/kintra-coach-v2-iphone-320.png",fullPage:true});
 await page.locator('button[data-action="coachReject"]').click();
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("trainsync-next-running-v1")).plan);
 assert.equal(saved.sessions.find(s=>s.id==="quality-run").kind,"tempo","Reject must preserve original plan");
 await page.locator('button[data-action="coachProposal:0"]').click();
 await page.locator('button[data-action="coachAccept"]').click();
 saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("trainsync-next-running-v1")).plan);
 assert.equal(saved.sessions.find(s=>s.id==="quality-run").kind,"easy","Only acceptance updates local plan");
 assert.equal(saved.sessions.find(s=>s.id==="today-run").distanceKm,8);
 assert.equal(saved.sessions.find(s=>s.id==="long-run").distanceKm,12);
 assert.deepEqual(errors,[]);
 console.log("PASS: KINTRA Coach v2 phone 390/320 widths; no viewport overflow; review and explicit consent");
 console.log("PASS: fake course/Hevy/recovery data; reject preserves local plan; accept changes only one session");
}finally{
 if(browser)await browser.close();
 child.kill("SIGTERM");
}
