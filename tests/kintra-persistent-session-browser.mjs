import assert from "node:assert/strict";
import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
const PORT=19840,BASE="http://127.0.0.1:"+PORT;
const server=spawn(process.execPath,["preview/server.mjs"],{env:{...process.env,PORT:String(PORT)},stdio:"ignore"});
let browser;
try{
 let ready=false;
 for(let n=0;n<110;n++){try{if((await fetch(BASE+"/health",{signal:AbortSignal.timeout(750)})).ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,130));}
 assert.ok(ready,"preview server must respond");
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},locale:"fr-FR"});
 const page=await context.newPage();
 page.on("dialog",dialog=>dialog.accept());
 const failures=[];page.on("pageerror",error=>failures.push(error.message));
 const FAKE_KEY="a-local-fake-intervals-credential-123456";
 const fakeActivity={id:"intervals:123456",externalId:"123456",category:"Course",title:"Sortie réelle simulée",
  startedAt:"2026-10-27T08:25:00Z",distanceKm:10.2,durationMinutes:53,averageHeartRate:149};
 let available=true;
 await page.route("**/v3/status",route=>{
  if(!available)return route.abort("internetdisconnected");
  return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,intervals:{ok:true}})});
 });
 await page.route("**/v3/dashboard?*",route=>{
  if(!available)return route.abort("internetdisconnected");
  return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
   ok:true,demo:false,syncedAt:"2026-10-29T11:00:00Z",activities:[fakeActivity],wellness:[],strength:[],planned:[],warnings:[]})});
 });
 await page.goto(BASE+"/runna-next/index.html",{waitUntil:"domcontentloaded"});
 await page.locator('button[data-action="connect"]').first().click();
 assert.ok(await page.locator("#rememberIntervalsDevice").isChecked(),"trusted-device login defaults on");
 await page.locator("#apiToken").fill(FAKE_KEY);
 await page.locator('button[data-action="connectNow"]').click();
 await page.getByText("Sortie réelle simulée").first().waitFor({timeout:15000});
 assert.ok(await page.evaluate(async()=>new Promise((resolve,reject)=>{
  const req=indexedDB.open("kintra-device-session-v1");
  req.onerror=()=>reject(req.error);
  req.onsuccess=()=>{const tx=req.result.transaction("records","readonly");
   const x=tx.objectStore("records").get("api:intervals");
   x.onsuccess=()=>resolve(!!x.result?.cipher&&!x.result?.secret);
  };
 })),"encrypted persistent session saved without plaintext");
 const localDump=await page.evaluate(()=>Object.values(localStorage).join(" "));
 assert.ok(!localDump.includes(FAKE_KEY),"never persist clear API key in localStorage");
 await mkdir("test-artifacts",{recursive:true});
 await page.screenshot({path:"test-artifacts/kintra-v18-connected-iphone.png",fullPage:true});
 await page.reload({waitUntil:"domcontentloaded"});
 await page.getByText("Sortie réelle simulée").first().waitFor({timeout:20000});
 await page.locator('.nav button[data-action="tab:profile"]').click();
 await page.getByText(/Compte Intervals\.icu connecté · synchronisation active/).waitFor();
 await page.locator('.nav button[data-action="tab:activities"]').click();
 available=false;
 await page.reload({waitUntil:"domcontentloaded"});
 await page.getByText("Sortie réelle simulée").first().waitFor({timeout:20000});
 await page.getByText(/Dernière copie chiffrée locale/).first().waitFor({timeout:20000});
 await page.screenshot({path:"test-artifacts/kintra-v18-cached-iphone.png",fullPage:true});
 // Reconnection must recover without retyping the API key, and refresh cached status.
 available=true;await page.reload({waitUntil:"domcontentloaded"});
 await page.getByText("Sortie réelle simulée").first().waitFor();
 await page.getByText(/Dernière copie chiffrée locale/).waitFor({state:"detached",timeout:20000});
 await page.locator('.nav button[data-action="tab:profile"]').click();
 await page.locator('button[data-action="connect"]').first().click();
 await page.locator('button[data-action="disconnect"]').click();
 await page.getByText("Compte non connecté").waitFor();
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForTimeout(300);
 assert.ok(!(await page.locator("#app").innerText()).includes("Sortie réelle simulée"),"explicit logout removes cached health details");
 assert.deepEqual(failures,[]);
 console.log("PASS: encrypted device-only Intervals persistence, auto-reconnect, offline dashboard, reconnect and explicit logout.");
}finally{await browser?.close();server.kill("SIGTERM")}
