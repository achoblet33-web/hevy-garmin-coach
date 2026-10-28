/**
 * Safari-engine acceptance smoke test. WebKit on Linux, not physical iPhone/iOS.
 * Uses Railway local preview with fake data and offline mock weather.
 */
import assert from "node:assert/strict";
import {webkit,devices} from "playwright";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
const port=19765,base="http://127.0.0.1:"+port;
const child=spawn(process.execPath,["preview/server.mjs"],{env:{...process.env,PORT:String(port)},stdio:"ignore"});
let browser;
try{
 let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(base+"/health",{signal:AbortSignal.timeout(700)})).ok){ready=true;break}}catch{}
  await new Promise(r=>setTimeout(r,110));}
 assert.ok(ready,"local preview unavailable");
 browser=await webkit.launch({headless:true});
 const page=await browser.newPage({...devices["iPhone 13"],viewport:{width:390,height:844},locale:"fr-FR",
  timezoneId:"America/Martinique",acceptDownloads:true});
 const errors=[];page.on("pageerror",x=>errors.push(String(x)));
 await page.route("**/v3/places?*",r=>r.fulfill({status:200,contentType:"application/json",
  body:JSON.stringify({ok:true,results:[{label:"Le Lamentin, Martinique, France",latitude:14.61,longitude:-60.99}]})}));
 await page.route("**/v3/weather?*",r=>{
  const epoch=Math.floor(Date.now()/3600000)*3600;const times=Array.from({length:30},(_,i)=>epoch+i*3600);
  const body={ok:true,timezone:"America/Martinique",asOf:Date.now(),temperature:28,apparent:31,
   humidity:77,wind:12,hourly:{time:times,temperature_2m:times.map(()=>28),
   apparent_temperature:times.map(()=>32),relative_humidity_2m:times.map(()=>78),
   precipitation_probability:times.map(()=>10),wind_speed_10m:times.map(()=>12),
   uv_index:times.map(()=>4)}};
  return r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
 });
 await page.goto(base+"/runna-next/index.html?demo=1",{waitUntil:"domcontentloaded"});
 await page.locator('button[data-action="weatherLocation"]').first().waitFor();
 await mkdir("test-artifacts",{recursive:true});
 async function check(label){
  const rect=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,
   body:document.body.scrollWidth,modal:document.querySelector(".modal")?.getBoundingClientRect().width||0}));
  assert.ok(rect.document<=rect.viewport+1&&rect.body<=rect.viewport+1&&rect.modal<=rect.viewport+1,
   label+" "+JSON.stringify(rect));
 }
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:780});
  await check("home-"+width);
  await page.locator('button[data-action="weatherLocation"]').first().click();
  await check("weather-modal-"+width);
  const font=await page.locator("#weatherCity").evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  assert.ok(font>=16,"iOS autozoom protection "+font);
  await page.locator("#weatherCity").fill("Le Lamentin");
  await page.locator('button[data-action="weatherSearch"]').click();
  await page.locator('button[data-action="weatherChoose:0"]').waitFor();
  await check("weather-results-"+width);
  await page.locator('button[data-action="weatherChoose:0"]').click();
  await page.getByText(/MÉTÉO POUR COURIR/).first().waitFor();
  await check("weather-hourly-"+width);
  await page.locator('.nav button[data-action="tab:profile"]').click();
  await check("profile-"+width);
  await page.locator('button[data-action="backupSecure"]').click();
  await check("backup-modal-"+width);
  if(width===390)await page.screenshot({path:"test-artifacts/kintra-rc-webkit-weather-backup-390.png",fullPage:true});
  await page.locator('button[data-action="close"]').first().click();
  await page.locator('.nav button[data-action="tab:today"]').click();
 }
 assert.deepEqual(errors,[],"Uncaught Safari-engine exceptions");
 console.log("PASS: WebKit simulated iPhone 320/375/390/430 with weather search, hourly, profile and encrypted backup");
}finally{if(browser)await browser.close();child.kill("SIGTERM")}
