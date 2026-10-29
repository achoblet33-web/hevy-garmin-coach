import assert from "node:assert/strict";
import {webkit} from "playwright";
import {spawn} from "node:child_process";
const PORT=19841,URL="http://127.0.0.1:"+PORT;
const server=spawn(process.execPath,["preview/server.mjs"],{env:{...process.env,PORT:String(PORT)},stdio:"ignore"});
let browser;
try{
 let online=false;for(let i=0;i<100;i++){try{if((await fetch(URL+"/health",{signal:AbortSignal.timeout(700)})).ok){online=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,140));}
 assert.ok(online,"preview server unavailable");
 browser=await webkit.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},locale:"fr-FR",acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 await page.route("**/v3/status",route=>route.fulfill({status:200,contentType:"application/json",
  body:JSON.stringify({ok:true,intervals:{ok:true}})}));
 await page.route("**/v3/dashboard?*",route=>route.fulfill({status:200,contentType:"application/json",
  body:JSON.stringify({ok:true,demo:false,activities:[{
   id:"intervals:777",externalId:"777",category:"Course",title:"WebKit trajet réel simulé",
   startedAt:"2026-10-28T12:00:00Z",distanceKm:7,durationMinutes:42
  }],wellness:[],strength:[],planned:[],warnings:[],syncedAt:"2026-10-29T12:00:00Z"})}));
 await page.goto(URL+"/runna-next/index.html",{waitUntil:"domcontentloaded"});
 await page.locator('button[data-action="connect"]').first().click();
 await page.locator("#apiToken").fill("test-webkit-personal-key-012345678901");
 await page.locator('button[data-action="connectNow"]').click();
 await page.getByText("WebKit trajet réel simulé").first().waitFor({timeout:20000});
 await page.reload({waitUntil:"domcontentloaded"});
 await page.locator('.nav button[data-action="tab:activities"]').click();
 await page.getByText("WebKit trajet réel simulé").first().waitFor({timeout:25000});
 await page.locator('.nav button[data-action="tab:profile"]').click();
 await page.getByText(/Compte Intervals\.icu connecté · synchronisation active/).waitFor();
 assert.deepEqual(errors,[]);
 console.log("PASS: WebKit Safari-like browser preserves device encrypted session and restores Intervals on re-open.");
}finally{await browser?.close();server.kill("SIGTERM")}
