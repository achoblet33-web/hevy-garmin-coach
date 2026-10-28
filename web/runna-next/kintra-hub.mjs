import {evaluateSportContext,evaluateReadiness,recommendWorkout} from "./kintra-coach.mjs";
import {forecastSlots,formatLocalHour} from "./kintra-weather.mjs";
import {sleepTrend,strengthDistribution,renderWeeklyChart,formatTime} from "./kintra-presenter.mjs";
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const shown=n=>n==null||!Number.isFinite(Number(n))?"—":Number(n).toLocaleString("fr-FR",{maximumFractionDigits:1});
const short=d=>new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
const dateAdd=(date,offset)=>{const d=new Date(date+"T12:00:00");d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10)};
function recoveryCard(readiness){
 const symbols={favorable:"✓",caution:"!",limited:"~",insufficient:"?"};
 const source=readiness.signals.map(x=>`<span class="kintra-recovery-indicator" title="${safe(x.reason)}">${safe(x.name)} <strong>${safe(x.value)}</strong></span>`).join("");
 return `<article class="kintra-summary-card kintra-readiness" data-testid="readiness">
  <div class="kintra-card-head"><div><span class="eyebrow">PRÊT À PERFORMER ?</span><h3 class="heading">${safe(readiness.label)}</h3></div>
  <span class="kintra-readiness-symbol ${readiness.state}" aria-label="${safe(readiness.label)}">${symbols[readiness.state]||"?"}</span></div>
  <p class="sub">${safe(readiness.summary)}</p>
  ${source?`<div class="kintra-recovery-signals">${source}</div>`:
    `<p class="sub">Synchronise quelques nuits avec Intervals.icu pour commencer l'analyse.</p>`}
  ${readiness.freshness?`<small class="kintra-source-hint">Mesures du ${safe(readiness.freshness)} · ${readiness.referenceDays} nuits de référence disponibles</small>`:""}
 </article>`;
}
function sleepCard(context,wellness,date){
 const trend=sleepTrend(wellness,date),label=trend.hours==null?"—":trend.hours+"h "+String(trend.minutes).padStart(2,"0");
 const trendText=trend.changePct==null?"Tendance : historique insuffisant":(trend.changePct>0?"+":"")+trend.changePct+" % par rapport aux nuits précédentes";
 return `<article class="kintra-sleep-card" data-testid="sleep-card">
 <div class="kintra-sleep-moon">☾</div><div class="kintra-sleep-detail"><span class="eyebrow">SOMMEIL & RÉCUPÉRATION</span>
 <strong>${safe(label)}</strong><span class="sub">${trend.score==null?"Score non fourni":"Score de sommeil : "+shown(trend.score)}
 · ${safe(trendText)}</span>
 <small class="kintra-source-hint">${trend.date?"Mesure du "+safe(trend.date):"Aucune nuit récente synchronisée"}</small></div>
 <button class="kintra-mini-button" data-action="tab:activities" aria-label="Voir la récupération">›</button></article>`;
}
function weatherCard(state){
 const location=state.weatherPlace?.label||"Choisir une ville";
 const weather=state.weather;
 if(!weather)return `<article class="kintra-weather-detail" data-testid="weather-card">
 <div class="between"><div><span class="eyebrow">MÉTÉO POUR COURIR</span><h3 class="heading">${safe(location)}</h3></div>
 <button class="textButton" data-action="weatherLocation">Modifier ›</button></div>
 <p class="sub">Choisis une ville pour connaître les conditions des douze prochaines heures. Le GPS reste facultatif.</p>
 <button class="btn secondary full" data-action="weatherLocation">Consulter les prévisions</button></article>`;
 const forecast=forecastSlots(weather);
 const best=forecast.best;
 const hourly=forecast.hours.slice(0,12).map(x=>
  `<div class="kintra-hour-forecast ${best?.epoch===x.epoch?"best":""}">
  <strong>${formatLocalHour(x.epoch,forecast.timezone)}</strong>
  <span>${shown(x.feels)} °C</span><small>Pluie ${x.rain==null?"—":shown(x.rain)+" %"}</small>
  <small>${safe(x.grade)}</small></div>`).join("");
 return `<article class="kintra-weather-detail" data-testid="weather-card">
 <div class="between"><div><span class="eyebrow">MÉTÉO POUR COURIR · 12 H</span><h3 class="heading">${safe(location)}</h3></div>
 <button class="textButton" data-action="weatherLocation">Modifier ›</button></div>
 <div class="kintra-weather-now"><strong>${shown(weather.temperature)} °C</strong>
 <span>Ressenti ${shown(weather.apparent)} °C · Humidité ${shown(weather.humidity)} % · Vent ${shown(weather.wind)} km/h</span></div>
 ${best?`<div class="kintra-weather-best"><span>Créneau indicativement plus confortable</span>
 <strong>${formatLocalHour(best.epoch,forecast.timezone)}</strong>
 <small>${best.caution?"Vigilance : chaleur, UV ou risque de pluie":"Selon les prévisions disponibles"}</small></div>`:
 `<p class="sub">Pas de créneau de jour comparable parmi les douze prochaines heures.</p>`}
 <div class="kintra-hours" aria-label="Prévisions heure par heure">${hourly||"Prévisions indisponibles."}</div>
 <small class="kintra-source-hint">Source : Open-Meteo · ${safe(forecast.explanation)}</small></article>`;
}
export function renderKintraDashboard({state,plan,date,weekstrip,sessionCard,program}){
 const ctx=evaluateSportContext({activities:state.activities,wellness:state.wellness,strength:state.strength,date});
 const ready=evaluateReadiness({activities:state.activities,wellness:state.wellness,strength:state.strength,date});
 const sessions=plan?.sessions?.filter(x=>x.date===state.chosenDay)||[];
 const upcoming=plan?.sessions?.filter(x=>x.date>state.chosenDay&&x.kind!=="rest").slice(0,2)||[];
 const featured=sessions.find(x=>x.kind!=="rest")||upcoming[0]||null;
 const advice=recommendWorkout({plan,context:ctx,date});
 const sourceStrength=state.hevyKey?state.hevySessions:state.strength;
 const muscle=strengthDistribution(sourceStrength||[],date);
 const muscleCount=muscle.total;
 return `<div class="kintra-welcome"><span class="eyebrow">KINTRA · TON HUB SPORTIF</span>
 <h2>Aujourd'hui,<br><em>fais le point.</em></h2><p>Ton entraînement, tes tendances et ta récupération, sans chiffres fictifs.</p></div>
 ${recoveryCard(ready)}
 ${sleepCard(ctx,state.wellness,date)}
 ${featured?`<button class="kintra-next-workout" data-action="session:${safe(featured.id)}" data-testid="next-workout">
  <span class="kintra-next-icon">↗</span><span class="kintra-next-main"><small>PROCHAINE SÉANCE SUGGÉRÉE · ${short(featured.date)}</small>
  <strong>${safe(featured.title)}</strong><span>${shown(featured.distanceKm)} km · ${featured.durationMinutes?formatTime(featured.durationMinutes)+" · ":""}${safe(featured.intensity||"Intensité au ressenti")}</span>
  <small>${state.adaptiveSuggestions?safe(advice.reason):"Adaptations automatiques désactivées"}</small></span><b>›</b></button>`:
 `<div class="kintra-next-empty"><strong>Quel est ton prochain objectif ?</strong><p class="sub">Crée un plan ou un cycle maintien pour recevoir une prochaine séance.</p>
 <button class="btn" data-action="setup">Créer mon programme</button></div>`}
 <div class="kintra-data-grid" data-testid="weekly-training-tiles">
  <article class="kintra-tile"><div class="kintra-card-label">↗ COURSE · 7 JOURS</div>
  <div class="kintra-number">${ctx.runCount} <small>séances</small></div>
  <p class="sub">${shown(ctx.weeklyKm)} km parcourus</p>${renderWeeklyChart(state.activities,date,plan)}</article>
  <article class="kintra-tile"><div class="kintra-card-label">▤ ${state.hevyKey?"HEVY PRO":"MUSCULATION"} · 7 JOURS</div>
  <div class="kintra-number">${muscleCount} <small>séances</small></div>
  <p class="sub">${state.hevyKey?"Hevy Pro synchronisé":"Hevy disponible dans Plus"}</p>
 <div class="kintra-muscle-breakdown">${muscle.upper||muscle.lower?`Haut ${muscle.upper} · Bas ${muscle.lower}`:"Répartition non précisée"}${muscle.mixed?` · Mixte ${muscle.mixed}`:""}</div>
 <button class="textButton" data-action="showHevy">Détails Hevy ›</button></article>
 </div>
 ${weatherCard(state)}
 ${program?program():""}
 <div class="kintra-sheet"><div class="between"><strong>Ta semaine</strong><button class="textButton" data-action="tab:plan">Coach ›</button></div>
 ${plan?weekstrip(state.chosenDay):`<p class="sub">Créer un programme événement ou maintien.</p>`}</div>
 <div class="sectionTitle"><h2>Mes séances</h2><button class="textButton" data-action="instant">+ Séance libre</button></div>
 ${sessions.length?sessions.map(sessionCard).join(""):upcoming.length?upcoming.map(sessionCard).join(""):`<div class="card empty">Aucune séance planifiée pour cette journée.</div>`}
 <article class="kintra-coach-tip"><div class="eyebrow">CONSEIL DU COACH</div><h3>${safe(state.adaptiveSuggestions?advice.title:"Conseils désactivés")}</h3>
 <p class="sub">${safe(state.adaptiveSuggestions?advice.reason:"Tu peux activer les conseils dans Coach.")}</p>
 <div class="actions"><button class="btn secondary" data-action="adjust" ${plan?"":"disabled"}>Adapter mon entraînement</button></div></article>
 <p class="kintra-disclaimer">Avis sportifs non médicaux. L'heure météo et l'état de récupération sont indicatifs, à confirmer avec ton ressenti.</p>`;
}
export function renderKintraProgressSummary({state,date}){
 const c=evaluateSportContext({activities:state.activities,wellness:state.wellness,strength:state.strength,date});
 return `<div class="kintra-insight-strip">
 <div><small>Volume 7 j</small><strong>${shown(c.weeklyKm)} km</strong></div>
 <div><small>Charge chronique</small><strong>${shown(c.ctl)}</strong></div>
 <div><small>Charge aiguë</small><strong>${shown(c.atl)}</strong></div>
 </div><p class="sub">Charges CTL / ATL affichées uniquement si Intervals.icu les fournit.</p>`;
}
export function renderKintraStrengthSummary({state,date}){
 const sessions=state.hevyKey?state.hevySessions:state.strength;
 const list=Array.isArray(sessions)?sessions:[];
 const recent=list.filter(x=>{const dt=String(x.startedAt||"").slice(0,10);return dt>=dateAdd(date,-6)&&dt<=date;});
 const sets=recent.reduce((n,x)=>n+(x.exercises||[]).reduce((v,z)=>v+(z.sets?.length||0),0),0);
 const last=[...list].sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)))[0];
 return `<article class="card kintra-strength-review">
 <div class="between"><div><span class="eyebrow">MUSCULATION</span><h3 class="heading">Mon renforcement</h3></div>
 <button class="textButton" data-action="hevy">${state.hevyKey?"Hevy Pro ✓":"Connecter Hevy ›"}</button></div>
 <div class="kintra-strength-grid"><div><strong>${recent.length}</strong><small>séances cette semaine</small></div>
 <div><strong>${state.hevyKey?sets:"—"}</strong><small>séries enregistrées</small></div></div>
 ${last?`<p class="sub">Dernière séance : <strong>${safe(last.title||"Musculation")}</strong> · ${safe(String(last.startedAt).slice(0,10))}</p>`:""}
 </article>`;
}
