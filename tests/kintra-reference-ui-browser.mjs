/**
 * KINTRA reference-board design acceptance. Real app, synthetic data; no user keys.
 * Tests the four tabs, session CTA, no horizontal overflow and accessible nav.
 */
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
const port=19831,base="http://127.0.0.1:"+port;
const worker=spawn(process.execPath,["preview/server.mjs"],{env:{...process.env,PORT:String(port)},stdio:"ignore"});
let browser;
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+"/health",{signal:AbortSignal.timeout(700)})).ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,120));}
 assert.ok(ready,"local KINTRA preview should respond");
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,locale:"fr-FR",acceptDownloads:true});
 const errors=[];page.on("pageerror",err=>errors.push(String(err)));
 await mkdir("test-artifacts",{recursive:true});
 await page.goto(base+"/runna-next/index.html?demo=1",{waitUntil:"domcontentloaded",timeout:30000});
 await page.locator(".app.kintra-ui-17").waitFor();
 const assets=await page.evaluate(()=>({
  css:[...document.styleSheets].map(x=>x.href||"").filter(Boolean),
  logo:document.querySelector(".kintra-header-logo")?.getAttribute("src"),
  nav:[...document.querySelectorAll(".nav button")].map(x=>({action:x.dataset.action,icon:!!x.querySelector("svg")})),
  tabText:document.querySelector(".kintra-welcome h2")?.textContent,
  bg:getComputedStyle(document.querySelector(".kintra-summary-card")).backgroundColor,
  primary:getComputedStyle(document.querySelector(".kintra-next-workout")).backgroundImage
 }));
 assert.ok(assets.css.some(x=>x.includes("kintra-design-v17.css?v=17")),JSON.stringify(assets.css));
 assert.equal(assets.nav.length,4);
 assert.ok(assets.nav.every(x=>x.icon),"all bottom navigation actions must show vector icons");
 assert.match(assets.tabText,/Aujourd'hui/);
 assert.equal(assets.bg,"rgb(255, 255, 255)");
 assert.match(assets.primary,/linear-gradient/);
 const scenarios=[
  ["today","Accueil",async()=>page.locator('[data-testid="weekly-training-tiles"]').waitFor()],
  ["plan","Coach",async()=>page.locator('[data-testid="coach-parameters"]').waitFor()],
  ["activities","Progression",async()=>page.locator(".kintra-progress-tabs").waitFor()],
  ["profile","Plus",async()=>page.locator('[data-testid="kintra-backup-settings"]').waitFor()]
 ];
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:780});
  for(const [tab,name,wait] of scenarios){
   await page.locator('.nav button[data-action="tab:'+tab+'"]').click();
   await wait();
   const rect=await page.evaluate(()=>({
    viewport:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth,
    content:document.querySelector(".content").getBoundingClientRect().width,
    active:document.querySelector(".nav button.active")?.dataset.action,
    pageBg:getComputedStyle(document.body).backgroundColor,
    navColor:getComputedStyle(document.querySelector(".nav")).backgroundColor
   }));
   assert.equal(rect.active,"tab:"+tab,name+" selected tab should remain selected");
   assert.ok(rect.html<=rect.viewport+1&&rect.body<=rect.viewport+1&&rect.content<=rect.viewport+1,
    tab+" viewport "+width+" "+JSON.stringify(rect));
   assert.notEqual(rect.pageBg,"rgb(16, 12, 18)","dark theme must not be used");
   if(width===390)await page.screenshot({path:"test-artifacts/kintra-v17-"+tab+"-390.png",fullPage:true});
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('.nav button[data-action="tab:today"]').click();
 await page.locator('[data-testid="next-workout"]').click();
 await page.locator(".kintra-session-header h2").waitFor();
 const order=await page.evaluate(()=>{
  const detail=[...document.querySelectorAll(".content > *")];
  return {watch:detail.findIndex(x=>x.classList.contains("kintra-watch-card")),
   after:detail.findIndex(x=>x.textContent?.includes("Après ta course")&&x.classList.contains("card")),
   name:document.querySelector(".kintra-session-header h2")?.textContent,
   watchButtons:document.querySelectorAll('button[data-action="watch"]').length,
   width:document.documentElement.scrollWidth};
 });
 assert.equal(order.watchButtons,1);
 assert.ok(order.watch>=0&&order.after>order.watch,"the Apple Watch CTA must precede post-run controls");
 assert.ok(order.width<=390);
 await page.screenshot({path:"test-artifacts/kintra-v17-session-390.png",fullPage:true});
 assert.deepEqual(errors,[],"no uncaught exceptions on the four-tab visual review");
 console.log("PASS: KINTRA reference v17: premium white/gradient design, four SVG tabs, 320/375/390/430px and Apple Watch CTA.");
}finally{await browser?.close();worker.kill("SIGTERM")}
