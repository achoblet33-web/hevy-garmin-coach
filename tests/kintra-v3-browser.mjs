// Browser acceptance: mock-only Intervals/Hevy. No personal keys or write calls.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile,mkdir} from "node:fs/promises";
import {chromium} from "playwright";
import {createPortableBackup} from "../web/runna-next/local-backup.mjs";
const port=19763,base="http://127.0.0.1:"+port;
const day=new Date().toISOString().slice(0,10);
const add=(date,n)=>{const x=new Date(date+"T12:00:00Z");x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const plan={mode:"maintenance",totalWeeks:4,createdAt:day,notes:[],profile:{
 mode:"maintenance",frequency:3,weeklyKm:23,availableDays:[1,3,6],longDay:6},
 summary:[{week:1,from:day,plannedKm:27,phase:"Entretien",count:3}],
 sessions:[{id:"local-easy",date:day,kind:"easy",title:"Footing planifié",status:"planned",week:1,distanceKm:8},
 {id:"local-quality",date:add(day,2),kind:"tempo",title:"Tempo",status:"planned",week:1,distanceKm:9},
 {id:"local-long",date:add(day,4),kind:"long",title:"Longue",status:"planned",week:1,distanceKm:10}]};
const first={id:"intervals:abc",externalId:"abc",source:"Intervals.icu",category:"Course",
 startedAt:day+"T10:00:00Z",distanceKm:8.0,durationMinutes:42,title:"Sortie à associer"};
const worker=spawn(process.execPath,["preview/server.mjs"],{env:{...process.env,PORT:String(port)},stdio:"ignore"});
let browser;
try{
 let live=false;
 for(let i=0;i<100;i++){
  try{if((await fetch(base+"/health",{signal:AbortSignal.timeout(600)})).ok){live=true;break}}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(live,"preview did not become ready");
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},locale:"fr-FR",timezoneId:"UTC",
  isMobile:true,hasTouch:true,acceptDownloads:true,reducedMotion:"reduce"});
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));page.on("dialog",d=>d.accept());
 const data={ok:true,demo:true,activities:[first],strength:[],wellness:[],planned:[]};
 await page.addInitScript(plan=>localStorage.setItem("trainsync-next-running-v1",
  JSON.stringify({plan,history:[],feedback:{},adaptiveSuggestions:true,pairedRuns:{}})),plan);
 await page.route("**/v3/dashboard?*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)}));
 await page.goto(base+"/runna-next/index.html?demo=1",{waitUntil:"domcontentloaded"});
 await page.locator('.nav button[data-action="tab:plan"]').click();
 await page.locator('button[data-action="coachLink:0"]').waitFor({timeout:15000});
 await page.locator('button[data-action="coachLink:0"]').click();
 await page.getByText("Associer une sortie au programme").waitFor();
 assert.match(await page.locator(".modal").innerText(),/La date seule ne confirme pas/);
 await page.locator('button[data-action="coachLinkAccept"]').click();
 await page.locator('button[data-action="coachUnlink:0"]').waitFor();
 let saved=JSON.parse(await page.evaluate(()=>localStorage.getItem("trainsync-next-running-v1")));
 assert.equal(saved.pairedRuns["local-easy"],"intervals:abc");
 await page.locator('button[data-action="coachUnlink:0"]').click();
 await page.locator('button[data-action="coachLink:0"]').waitFor();
 saved=JSON.parse(await page.evaluate(()=>localStorage.getItem("trainsync-next-running-v1")));
 assert.deepEqual(saved.pairedRuns,{});
 // Never silently remove different-provider activities that look like duplicates.
 data.activities.push({...first,id:"garmin:xyz",externalId:"xyz",source:"Garmin",
  startedAt:day+"T10:00:20Z",distanceKm:8.04});
 await page.locator('.nav button[data-action="tab:activities"]').click();
 await page.locator('button[data-action="refreshData"]').click();
 await page.locator('[data-testid="possible-duplicates"]').waitFor({timeout:12000});
 await page.locator('.nav button[data-action="tab:profile"]').click();
 const downloadPromise=page.waitForEvent("download");
 await page.locator('button[data-action="backupExport"]').click();
 const download=await downloadPromise;
 assert.match(download.suggestedFilename(),/^KINTRA-sauvegarde-.*\.json$/);
 const json=await readFile(await download.path(),"utf8");
 assert.ok(!json.includes("apiToken"));
 assert.ok(!json.includes("wellness"));
 assert.ok(!json.includes("weatherPlace"));
 const restorePlan=structuredClone(plan);restorePlan.sessions[0].title="Programme restauré";
 const backup=createPortableBackup({plan:restorePlan,history:[plan],feedback:{"activity:abc":{rpe:6,comment:"Essai"}},
  pairedRuns:{"local-easy":"intervals:abc"},adaptiveSuggestions:false},"2026-10-28T15:00:00Z");
 await page.locator('button[data-action="backupRestore"]').click();
 await page.locator("#kintraBackupFile").setInputFiles({name:"sauvegarde.json",mimeType:"application/json",buffer:Buffer.from(backup)});
 await page.locator('button[data-action="backupInspect"]').click();
 await page.getByText("Confirmer la restauration").waitFor();
 await page.setViewportSize({width:320,height:700});
 const widths=await page.evaluate(()=>({viewport:innerWidth,html:document.documentElement.scrollWidth,
  body:document.body.scrollWidth,modal:document.querySelector(".modal")?.getBoundingClientRect().width}));
 assert.ok(widths.html<=widths.viewport+1&&widths.body<=widths.viewport+1&&widths.modal<=widths.viewport+1,JSON.stringify(widths));
 await mkdir("test-artifacts",{recursive:true});
 await page.screenshot({path:"test-artifacts/kintra-v3-backup-iphone-320.png",fullPage:true});
 await page.locator('button[data-action="backupApply"]').click();
 saved=JSON.parse(await page.evaluate(()=>localStorage.getItem("trainsync-next-running-v1")));
 assert.equal(saved.plan.sessions[0].title,"Programme restauré");
 assert.equal(saved.pairedRuns["local-easy"],"intervals:abc");
 assert.equal(saved.feedback["activity:abc"].rpe,6);
 await page.locator('.nav button[data-action="tab:profile"]').click();
 await page.locator('button[data-action="backupSecure"]').click();
 await page.locator("#kintraSecurePass").fill("phrase-longue-kintra-test-2026");
 await page.locator("#kintraSecurePassAgain").fill("phrase-longue-kintra-test-2026");
 const encryptedDownloadPromise=page.waitForEvent("download");
 await page.locator('button[data-action="backupSecureDownload"]').click();
 const encryptedDownload=await encryptedDownloadPromise;
 assert.match(encryptedDownload.suggestedFilename(),/sauvegarde-chiffree.*json/);
 const encryptedJson=await readFile(await encryptedDownload.path(),"utf8");
 assert.match(encryptedJson,/kintra-encrypted-backup-v1/);
 assert.ok(!encryptedJson.includes("Programme restauré"));
 const beforeRestore=JSON.parse(await page.evaluate(()=>localStorage.getItem("trainsync-next-running-v1")));
 await page.locator('button[data-action="backupRestore"]').click();
 await page.locator("#kintraBackupFile").setInputFiles({
  name:"KINTRA-chiffree.json",mimeType:"application/json",buffer:Buffer.from(encryptedJson)});
 await page.locator('button[data-action="backupInspect"]').click();
 await page.getByText("Déverrouiller la sauvegarde").waitFor();
 await page.locator("#kintraBackupUnlockPass").fill("une-mauvaise-phrase-tres-longue");
 await page.locator('button[data-action="backupUnlock"]').click();
 await page.getByText(/Phrase secrète incorrecte|sauvegarde chiffrée endommagée/).waitFor();
 assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem("trainsync-next-running-v1"))),beforeRestore);
 await page.locator("#kintraBackupUnlockPass").fill("phrase-longue-kintra-test-2026");
 await page.locator('button[data-action="backupUnlock"]').click();
 await page.getByText("Confirmer la restauration").waitFor();
 await page.screenshot({path:"test-artifacts/kintra-rc-encrypted-restore-iphone-320.png",fullPage:true});
 await page.locator('button[data-action="backupCancel"]').click();
 assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem("trainsync-next-running-v1"))),beforeRestore);
 assert.deepEqual(errors,[]);
 console.log("PASS: manual link confirmation and undo; duplicate warning; portable backup export/restore; 320px iPhone; encrypted backup, reject wrong passphrase, cancel restore");
}finally{if(browser)await browser.close();worker.kill("SIGTERM");}
