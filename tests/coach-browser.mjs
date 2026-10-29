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
 // KINTRA v18 keeps the program below a collapsible disclosure to match the reference iPhone board.
 const advanced=page.locator(".kintra-deep-dive summary");
 if(await advanced.count())await advanced.click();
 assert.match(await page.locator("#app").innerText(),/Objectif 10 km/);
 const visual=await page.evaluate(()=>{
  const root=getComputedStyle(document.documentElement);
  const primaryButton=document.createElement("button");primaryButton.className="btn";document.body.appendChild(primaryButton);
  const primary=getComputedStyle(primaryButton).backgroundImage;primaryButton.remove();
  const hero=getComputedStyle(document.querySelector(".hero")).backgroundImage;
  const theme=document.querySelector('meta[name="theme-color"]').getAttribute("content");
  const bar=document.querySelector(".training .strip");
  return {accent:root.getPropertyValue("--accent").trim(),
   strong:root.getPropertyValue("--accent-strong").trim(),
   background:root.getPropertyValue("--bg").trim(),
   primary,hero,theme,sessionColor:bar?getComputedStyle(bar).backgroundColor:null};
 });
 assert.deepEqual([visual.accent,visual.strong,visual.background,visual.theme],
  ["#a9163a","#b5163c","#faf8f9","#faf8f9"]);
 assert.match(visual.primary,/linear-gradient/);
 assert.ok(visual.hero.includes("linear-gradient"),"Burgundy hero gradient expected");
 assert.ok(visual.sessionColor?.startsWith("rgb("),"Colored workout strip expected");
 console.log("PASS: KINTRA premium crimson / light brand, logo and workout colors.",visual);
 assert.ok(await page.locator(".kintra-header-logo").count());
 assert.match(await page.title(),/KINTRA/);

 await mkdir("test-artifacts",{recursive:true});
 await page.locator('[data-testid="readiness"]').waitFor();
 await page.locator('[data-testid="sleep-card"]').waitFor();
 await page.locator('[data-testid="weekly-training-tiles"]').waitFor();
 await page.locator('[data-testid="weather-card"]').waitFor();
 assert.match(await page.locator("#app").innerText(),/Préparation|PRÊT À PERFORMER/);
 assert.match(await page.locator("#app").innerText(),/SOMMEIL & RÉCUPÉRATION/);
 await page.route("**/v3/places?*",route=>route.fulfill({status:200,contentType:"application/json",
  body:JSON.stringify({ok:true,results:[{label:"Le Lamentin, Martinique, France",latitude:14.61,longitude:-60.99}]})}));
 await page.route("**/v3/weather?*",route=>{
  const epoch=Math.floor(Date.now()/3600000)*3600;
  const hours=Array.from({length:24},(_,i)=>epoch+3600*i);
  return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,
    temperature:28,apparent:31,humidity:75,wind:9,timezone:"America/Martinique",
    hourly:{time:hours,temperature_2m:hours.map(()=>28),apparent_temperature:hours.map((_,i)=>i===7?26:32),
      relative_humidity_2m:hours.map(()=>70),precipitation_probability:hours.map(()=>10),
      wind_speed_10m:hours.map(()=>9),uv_index:hours.map(()=>2)}})});
 });
 await page.locator('button[data-action="weatherLocation"]').first().click();
 const geometryBefore=await page.evaluate(()=>{
  const modal=document.querySelector(".modal"),field=document.getElementById("weatherCity");
  return {width:innerWidth,scroll:document.documentElement.scrollWidth,modal:modal.getBoundingClientRect().width,
    inputFont:parseFloat(getComputedStyle(field).fontSize)};
 });
 assert.ok(geometryBefore.scroll<=geometryBefore.width+1,JSON.stringify(geometryBefore));
 assert.ok(geometryBefore.modal<=geometryBefore.width+1,JSON.stringify(geometryBefore));
 assert.ok(geometryBefore.inputFont>=16,"iOS city input font must prevent automatic focus zoom");
 await page.locator("#weatherCity").fill("Le Lamentin");
 await page.locator('button[data-action="weatherSearch"]').click();
 await page.locator(".kintra-place-results strong").waitFor({state:"visible",timeout:10000});
 await page.evaluate(()=>{document.querySelector(".kintra-place-results strong").textContent=
  "Une très longue commune avec un nom sans espaces EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE";});
 const geometryAfter=await page.evaluate(()=>{
  const modal=document.querySelector(".modal"),results=document.querySelector(".kintra-place-results");
  return {width:innerWidth,scroll:document.documentElement.scrollWidth,modal:modal.getBoundingClientRect().width,
    results:results.getBoundingClientRect().width};
 });
 assert.ok(geometryAfter.scroll<=geometryAfter.width+1,JSON.stringify(geometryAfter));
 assert.ok(geometryAfter.modal<=geometryAfter.width+1,JSON.stringify(geometryAfter));
 assert.ok(geometryAfter.results<=geometryAfter.width+1,JSON.stringify(geometryAfter));
 await page.screenshot({path:"test-artifacts/kintra-meteo-ville-iphone.png",fullPage:true});
 console.log("PASS: weather modal stays phone-width even with a long city result.");

 await page.locator('button[data-action="weatherChoose:0"]').click();
 await page.getByText(/MÉTÉO POUR COURIR · 12 H/).waitFor({timeout:12000});
 assert.match(await page.locator("#app").innerText(),/Le Lamentin/);
 assert.match(await page.locator("#app").innerText(),/Créneau indicativement plus confortable/);
 const weatherBounds=await page.evaluate(()=>{
  const box=document.querySelector(".kintra-weather-detail"),strip=document.querySelector(".kintra-hours");
  return {viewport:innerWidth,document:document.documentElement.scrollWidth,
    body:document.body.scrollWidth,box:box.getBoundingClientRect().width,
    strip:strip.clientWidth,innerStrip:strip.scrollWidth};
 });
 assert.ok(weatherBounds.document<=weatherBounds.viewport+1,JSON.stringify(weatherBounds));
 assert.ok(weatherBounds.body<=weatherBounds.viewport+1,JSON.stringify(weatherBounds));
 assert.ok(weatherBounds.box<=weatherBounds.viewport+1,JSON.stringify(weatherBounds));
 assert.ok(weatherBounds.innerStrip>weatherBounds.strip,"Hourly forecast must scroll inside its tile.");
 console.log("PASS: 12-hour weather strip scrolls inside the tile without changing phone viewport.");

 console.log("PASS: separate readiness, sleep, workout, training counts and selectable city with 12h forecast.");
 // Resize the already-loaded real hourly forecast to an iPhone SE viewport.
 // This checks the actual overflow path without a second race-prone weather lookup.
 await page.setViewportSize({width:320,height:700});
 const narrowWeather=await page.evaluate(()=>{
  const strip=document.querySelector(".kintra-hours");
  const box=document.querySelector(".kintra-weather-detail");
  return {width:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth,
    strip:strip?.getBoundingClientRect().width,box:box?.getBoundingClientRect().width};
 });
 assert.ok(narrowWeather.html<=narrowWeather.width+1,JSON.stringify(narrowWeather));
 assert.ok(narrowWeather.body<=narrowWeather.width+1,JSON.stringify(narrowWeather));
 assert.ok(narrowWeather.strip<=narrowWeather.width,JSON.stringify(narrowWeather));
 assert.ok(narrowWeather.box<=narrowWeather.width,JSON.stringify(narrowWeather));
 await page.locator('button[data-action="weatherLocation"]').first().click();
 const narrowModal=await page.evaluate(()=>({
  width:innerWidth,html:document.documentElement.scrollWidth,
  modal:document.querySelector(".modal")?.getBoundingClientRect().width,
  input:parseFloat(getComputedStyle(document.getElementById("weatherCity")).fontSize)}));
 assert.ok(narrowModal.html<=narrowModal.width+1,JSON.stringify(narrowModal));
 assert.ok(narrowModal.modal<=narrowModal.width+1,JSON.stringify(narrowModal));
 assert.ok(narrowModal.input>=16,JSON.stringify(narrowModal));
 await page.screenshot({path:"test-artifacts/kintra-meteo-320px.png",fullPage:true});
 await page.locator('button[data-action="close"]').click();
 await page.setViewportSize({width:390,height:844});
 console.log("PASS: 320px phone modal and loaded hourly weather both stay responsive.");
 await page.locator(".kintra-week-chart").waitFor();
 assert.equal(await page.locator(".kintra-week-bar").count(),7);
 await page.screenshot({path:"test-artifacts/kintra-accueil-mobile.png",fullPage:true});
 console.log("PASS: Runna-like Today entry with 10km demo goal.");
 await page.locator(".nav button[data-action='tab:plan']").click();
 await page.locator(".training[data-action^='session:']").first().waitFor();
 assert.match(await page.locator("#app").innerText(),/Les séances de la semaine/);
 await page.locator("[data-testid=coach-parameters]").waitFor();
 await page.screenshot({path:"test-artifacts/kintra-programme-mobile.png",fullPage:true});
 console.log("PASS: Week plan and session rows.");
 await page.locator(".training[data-action^='session:']").first().click();
 assert.match(await page.locator("#app").innerText(),/Détail de la séance/);
 await page.locator(".kintra-session-metadata").waitFor();
 await page.screenshot({path:"test-artifacts/kintra-seance-mobile.png",fullPage:true});
 await page.locator("header button[data-action='back']").click();
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
 if(await page.locator(".kintra-deep-dive summary").count())await page.locator(".kintra-deep-dive summary").click();
 assert.match(await page.locator("#app").innerText(),/Objectif 5 km/);
 console.log("PASS: Four-step onboarding, plan preview and explicit adoption.");
 await page.locator(".nav button[data-action='tab:profile']").click();
 await page.locator("button[data-action='setup']").click();
 await page.locator("button[data-action='goalMode:maintenance']").click();
 assert.match(await page.locator("#app").innerText(),/Mode maintien/);
 await page.locator("button[data-action='wizardNext']").click();
 await page.locator("button[data-action='wizardNext']").click();
 await page.locator("button[data-action='wizardNext']").click();
 assert.match(await page.locator("#app").innerText(),/Quatre semaines d'entretien/);
 await page.locator("button[data-action='wizardNext']").click();
 assert.match(await page.locator(".modal").innerText(),/Maintien/);
 await page.locator("button[data-action='acceptPlan']").click();
 if(await page.locator(".kintra-deep-dive summary").count())await page.locator(".kintra-deep-dive summary").click();
 assert.match(await page.locator("#app").innerText(),/COACH · MODE MAINTIEN/);
 assert.doesNotMatch(await page.locator("#app").innerText(),/jours restants/);
 console.log("PASS: four-week maintenance plan has no fictional race.");
 await page.locator(".nav button[data-action='tab:plan']").click();
 await page.locator('button[data-action="toggleAdvice"]').click();
 assert.match(await page.locator("#app").innerText(),/Conseils contextuels désactivés/);
 await page.locator('button[data-action="toggleAdvice"]').click();
 assert.match(await page.locator("#app").innerText(),/Conseils contextuels activés/);
 await page.screenshot({path:"test-artifacts/kintra-coach-mobile.png",fullPage:true});
 console.log("PASS: adaptive guidance switch is explicit and reversible.");
 await page.locator(".nav button[data-action='tab:activities']").click();
 assert.match(await page.locator("#app").innerText(),/Progression/);
 assert.match(await page.locator("#app").innerText(),/Données fictives/);
 console.log("PASS: Analytics honestly labelled demo.");
 await page.locator("[data-testid=progress-feature]").waitFor();
 await page.locator(".kintra-completed-stats").waitFor();
 await page.locator('button[data-action="progressTab:splits"]').click();
 assert.match(await page.locator("#app").innerText(),/Analyse des fractions/);
 await page.locator('button[data-action="progressTab:hr"]').click();
 assert.match(await page.locator("#app").innerText(),/Fréquence cardiaque moyenne/);
 await page.locator('button[data-action="progressTab:summary"]').click();
 await page.screenshot({path:"test-artifacts/kintra-progression-mobile.png",fullPage:true});
 console.log("PASS: summary, real splits and heart-rate views.");
 await page.locator('button[data-action^="activity:"]').first().click();
 await page.locator('header button[data-action="backActivity"]').waitFor({timeout:12000});
 assert.match(await page.locator("#app").innerText(),/Résultat de ta course/);
 await page.locator('[data-testid="route-map"]').waitFor({timeout:12000});
 await page.locator('[data-testid="complete-run-metrics"]').waitFor({timeout:12000});
 await page.route("https://tile.openstreetmap.org/**",route=>route.abort());
 assert.equal(await page.locator(".kintra-map-tiles img").count(),0,"OSM must not load without consent.");
 await page.locator('button[data-action="mapTiles"]').click();
 assert.ok(await page.locator(".kintra-map-tiles img").count()>0);
 console.log("PASS: synthetic GPS, optional OSM basemap and detailed running metrics.");

 await page.getByText("DÉMO · Échauffement").waitFor({timeout:12000});
 await page.locator(".kintra-laps-table").waitFor({timeout:12000});
 await page.locator('button[data-action="activityFeedback"]').click();
 await page.locator("#runRpe").selectOption("7");
 await page.locator("#runNote").fill("Séance contrôlée et ressenti noté.");
 await page.locator('button[data-action="saveActivityFeedback"]').click();
 assert.match(await page.locator("#app").innerText(),/Difficulté : 7\/10/);
 await page.locator('header button[data-action="backActivity"]').click();
 console.log("PASS: post-run report, fake lap segments and local RPE feedback.");
 await page.locator(".nav button[data-action='tab:today']").click();
 if(await page.locator(".kintra-deep-dive summary").count())await page.locator(".kintra-deep-dive summary").click();
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
 assert.match(await active.locator("#app").innerText(),/Intervals\.icu non connecté|Mode actif/);
 assert.doesNotMatch(await active.locator("#app").innerText(),/Mode démonstration/);
 await active.locator('.nav button[data-action="tab:profile"]').click();
 await active.locator('button[data-action="connect"]').first().click();
 assert.match(await active.locator(".modal").innerText(),/Connecter Intervals.icu/);
 await active.locator("#apiToken").waitFor();
 await active.locator("#apiVaultPass").waitFor();
 console.log("PASS: active mode is clean, requires real API key and offers encrypted vault.");
 await active.locator('button[data-action="close"]').click();
 await active.route("**/v3/hevy/workouts",route=>route.fulfill({
  status:200,contentType:"application/json",body:JSON.stringify({ok:true,source:"Hevy Pro",strength:[
   {id:"hevy:test-1",source:"Hevy",category:"Musculation",title:"Jambes",startedAt:new Date().toISOString(),exercises:[
    {title:"Back Squat",sets:[{reps:6,weightKg:90,rpe:8}]}]}]})}));
 await active.locator('button[data-action="hevy"]').click();
 await active.locator("#hevyToken").fill("00000000-0000-4000-8000-000000000001");
 await active.locator('button[data-action="hevyConnect"]').click();
 await active.locator('.modal').waitFor({state:"hidden",timeout:8000});
 assert.match(await active.locator("#app").innerText(),/Hevy Pro connecté/);
 await active.locator('.nav button[data-action="tab:today"]').click();
 assert.match(await active.locator('[data-testid="weekly-training-tiles"]').innerText(),/HEVY PRO/);
 await active.screenshot({path:"test-artifacts/kintra-hevy-accueil-mobile.png",fullPage:true});
 await active.locator('button[data-action="showHevy"]').first().click();
 await active.locator('[data-testid="hevy-workouts"]').waitFor();
 await active.locator('button[data-action="hevyWorkout:0"]').click();
 await active.locator('[data-testid="hevy-workout-detail"]').waitFor();
 assert.match(await active.locator("#app").innerText(),/Back Squat/);
 assert.match(await active.locator("#app").innerText(),/90 kg/);
 await active.locator('header button[data-action="backHevy"]').click();
 console.log("PASS: Hevy Pro personal API integration works without Intervals connected (mocked API only).");
 await active.close();
 assert.deepEqual(errors,[],"No uncaught browser errors");
 console.log("PASS: no uncaught browser errors.");
}finally{await browser.close();}
