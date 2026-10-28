import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const BASE=process.env.TRAINSYNC_STAGE_URL || "https://trainsync-staging-demo-staging.up.railway.app";
const browser=await chromium.launch({headless:true});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,locale:"fr-FR",reducedMotion:"reduce"});
 page.on("pageerror",e=>errors.push(String(e)));
 page.on("dialog",dialog=>dialog.accept());
 await page.goto(BASE+"/runna-next/index.html?demo=1",{waitUntil:"domcontentloaded",timeout:40000});
 await page.locator(".nav button[data-action='tab:plan']").waitFor({timeout:15000});
 assert.match(await page.locator("#app").innerText(),/Objectif 10 km/);
 const visual=await page.evaluate(()=>{
  const root=getComputedStyle(document.documentElement);
  const primaryButton=document.createElement("button");primaryButton.className="btn";document.body.appendChild(primaryButton);
  const primary=getComputedStyle(primaryButton).backgroundColor;primaryButton.remove();
  const hero=getComputedStyle(document.querySelector(".hero")).backgroundImage;
  const theme=document.querySelector('meta[name="theme-color"]').getAttribute("content");
  const bar=document.querySelector(".training .strip");
  return {accent:root.getPropertyValue("--accent").trim(),
   strong:root.getPropertyValue("--accent-strong").trim(),
   background:root.getPropertyValue("--bg").trim(),
   primary,hero,theme,sessionColor:bar?getComputedStyle(bar).backgroundColor:null};
 });
 assert.deepEqual([visual.accent,visual.strong,visual.background,visual.theme],
  ["#ff7c89","#cd2f47","#100c12","#100c12"]);
 assert.match(visual.primary,/205,\s*47,\s*71/);
 assert.ok(visual.hero.includes("linear-gradient"),"Burgundy hero gradient expected");
 assert.ok(visual.sessionColor?.startsWith("rgb("),"Colored workout strip expected");
 console.log("PASS: red/burgundy brand and meaningful coral training colors.",visual);

 await mkdir("test-artifacts",{recursive:true});
 await page.screenshot({path:"test-artifacts/coach-rouge-accueil-mobile.png",fullPage:true});
 console.log("PASS: Runna-like Today entry with 10km demo goal.");
 await page.locator(".nav button[data-action='tab:plan']").click();
 await page.locator(".training[data-action^='session:']").first().waitFor();
 assert.match(await page.locator("#app").innerText(),/Les séances de la semaine/);
 await page.screenshot({path:"test-artifacts/coach-rouge-programme-mobile.png",fullPage:true});
 console.log("PASS: Week plan and session rows.");
 await page.locator(".training[data-action^='session:']").first().click();
 assert.match(await page.locator("#app").innerText(),/Détail de la séance/);
 await page.screenshot({path:"test-artifacts/coach-rouge-fiche-seance-mobile.png",fullPage:true});
 await page.locator("button[data-action='back']").click();
 console.log("PASS: Session details and return.");
 await page.locator(".nav button[data-action='tab:profile']").click();
 await page.locator("button[data-action='setup']").click();
 assert.match(await page.locator("#app").innerText(),/Quel est ton objectif/);
 await page.locator("button[data-action='distance:5']").click();
 await page.locator("button[data-action='wizardNext']").click();
 assert.match(await page.locator("#app").innerText(),/Où en es-tu aujourd'hui/);
 await page.locator("button[data-action='wizardNext']").click();
 assert.match(await page.locator("#app").innerText(),/Quand peux-tu courir/);
 await page.locator("button[data-action='wizardNext']").click();
 assert.match(await page.locator("#app").innerText(),/Ton programme est prêt/);
 await page.locator("button[data-action='wizardNext']").click();
 assert.match(await page.locator(".modal").innerText(),/Vérifier le nouveau plan/);
 await page.locator("button[data-action='acceptPlan']").click();
 assert.match(await page.locator("#app").innerText(),/Objectif 5 km/);
 console.log("PASS: Four-step onboarding, plan preview and explicit adoption.");
 await page.locator(".nav button[data-action='tab:activities']").click();
 assert.match(await page.locator("#app").innerText(),/Progression/);
 assert.match(await page.locator("#app").innerText(),/Données fictives/);
 console.log("PASS: Analytics honestly labelled demo.");
 await page.locator(".nav button[data-action='tab:today']").click();
 await page.locator("button[data-action='instant']").click();
 await page.locator("button[data-action='instantType:interval']").click();
 assert.match(await page.locator(".modal").innerText(),/Préparer sur l'Apple Watch/);
 await page.locator("button[data-action='previewWatch']").click();
 await page.locator(".modal pre").waitFor({timeout:12000});
 assert.match(await page.locator(".modal pre").innerText(),/6x/);
 await page.locator("button[data-action='publishWatch']").click();
 await page.getByRole("status").filter({hasText:"SIMULATION UNIQUEMENT"}).waitFor({timeout:15000});
 assert.match(await page.locator("#app").innerText(),/SIMULATION UNIQUEMENT/);
 console.log("PASS: Instant 6x800 preview and simulated publish, no live write.");
 // Active mode must never silently show synthetic fitness data.
 const active=await browser.newPage({viewport:{width:390,height:844},locale:"fr-FR"});
 active.on("pageerror",e=>errors.push(String(e)));
 await active.goto(BASE+"/runna-next/index.html",{waitUntil:"domcontentloaded",timeout:30000});
 await active.locator('.nav button[data-action="tab:profile"]').waitFor({timeout:12000});
 assert.match(await active.locator("#app").innerText(),/Mode actif/);
 assert.doesNotMatch(await active.locator("#app").innerText(),/Mode démonstration/);
 await active.locator('.nav button[data-action="tab:profile"]').click();
 await active.locator('button[data-action="connect"]').click();
 assert.match(await active.locator(".modal").innerText(),/Connecter Intervals.icu/);
 await active.locator("#apiToken").waitFor();
 await active.locator("#apiVaultPass").waitFor();
 console.log("PASS: active mode is clean, requires real API key and offers encrypted vault.");
 await active.close();
 assert.deepEqual(errors,[],"No uncaught browser errors");
 console.log("PASS: no uncaught browser errors.");
}finally{await browser.close();}
