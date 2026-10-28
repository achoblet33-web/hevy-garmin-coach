import {evaluateSportContext,recommendWorkout} from "./kintra-coach.mjs";
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const shown=n=>n==null||!Number.isFinite(Number(n))?"—":Number(n).toLocaleString("fr-FR",{maximumFractionDigits:1});
const short=d=>new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
const dateAdd=(date,offset)=>{const d=new Date(date+"T12:00:00");d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10)};
function forecastCard(weather){
 if(!weather)return `<div class="kintra-weather">
 <div class="kintra-icon-tile">☀</div><div><strong>Météo de ton entraînement</strong>
 <p class="sub">Vérifie chaleur et humidité avant ta sortie.</p></div>
 <button class="textButton" data-action="weather">Activer ›</button></div>`;
 return `<div class="kintra-weather"><div class="kintra-icon-tile">☀</div><div style="flex:1"><strong>Météo locale</strong>
 <p class="sub">${shown(weather.temperature)} °C · Ressenti ${shown(weather.apparent)} °C<br>
 Humidité ${shown(weather.humidity)} % · Vent ${shown(weather.wind)} km/h</p></div>
 <button class="textButton" data-action="weather">↻</button></div>`;
}
function readiness(context){
 const label=context.grade==="prudence"?"Prudence aujourd'hui":context.signalsAvailable===0?"Données insuffisantes":"Contexte de récupération";
 const message=context.warnings.find(x=>!/insuffisant/.test(x))||"Aucun score arbitraire : ces données sont des repères, pas un diagnostic.";
 return `<article class="kintra-summary-card">
 <div class="kintra-card-head"><div><span class="eyebrow">État du jour</span><h3 class="heading">${label}</h3></div>
 <span class="kintra-ring ${context.grade==="prudence"?"caution":""}">${context.signalsAvailable}/5<small>mesures</small></span></div>
 <p class="sub">${safe(message)}</p>
 <div class="kintra-mini-stats">
  <div><span>Sommeil</span><strong>${context.sleepHours==null?"—":shown(context.sleepHours)+" h"}</strong></div>
  <div><span>HRV</span><strong>${context.hrv==null?"—":shown(context.hrv)+" ms"}</strong></div>
  <div><span>FC repos</span><strong>${context.restingHR==null?"—":shown(context.restingHR)+" bpm"}</strong></div>
 </div></article>`;
}
export function renderKintraDashboard({state,plan,date,weekstrip,sessionCard,program}){
 const context=evaluateSportContext({activities:state.activities,wellness:state.wellness,strength:state.strength,date});
 const daySessions=plan?.sessions?.filter(x=>x.date===state.chosenDay)||[];
 const next=plan?.sessions?.filter(x=>x.date>state.chosenDay&&x.kind!=="rest").slice(0,2)||[];
 const advice=recommendWorkout({plan,context,date});
 const recentStrength=state.activities.filter(x=>x.category==="Musculation").filter(x=>String(x.startedAt||"").slice(0,10)>=dateAdd(date,-6));
 return `<div class="kintra-welcome"><span class="eyebrow">TON POTENTIEL EN MOUVEMENT</span>
 <h2>Ta performance,<br><em>en un regard.</em></h2><p>Un tableau de bord personnel : tes vraies activités, ton entraînement et ta récupération.</p></div>
 ${readiness(context)}
 <div class="kintra-data-grid">
  <article class="kintra-tile"><div class="kintra-card-label">↗ Charge de course · 7 jours</div>
  <div class="kintra-number">${shown(context.weeklyKm)} <small>km</small></div>
  <p class="sub">${context.baselineKm>0?"Moyenne hebdo. précédente : "+shown(context.baselineKm)+" km":"Historique en cours de constitution"}</p></article>
  <article class="kintra-tile"><div class="kintra-card-label">▤ Renforcement · 7 jours</div>
  <div class="kintra-number">${context.strengthCount||recentStrength.length}</div>
  <p class="sub">Séances visibles dans les sources synchronisées. Hevy direct non connecté.</p></article>
 </div>
 ${program?program():""}
 <article class="kintra-sheet"><div class="between"><strong>Ta semaine</strong><button class="textButton" data-action="tab:plan">Voir le plan ›</button></div>
 ${plan?weekstrip(state.chosenDay):`<p class="sub">Crée un programme événement ou maintien pour organiser ton entraînement.</p>`}</article>
 <div class="sectionTitle"><h2>${state.chosenDay===date?"Prochaine séance":short(state.chosenDay)}</h2>
  <button class="textButton" data-action="instant">+ Séance libre</button></div>
 ${daySessions.length?daySessions.map(sessionCard).join(""):next.length?next.map(sessionCard).join(""):`<div class="card empty"><strong>Journée libre</strong>Récupération, mobilité ou sortie libre selon ton ressenti.</div>`}
 <article class="kintra-coach-tip"><div class="eyebrow">◉ CONSEIL KINTRA</div><h3>${safe(advice.title)}</h3>
  <p class="sub">${safe(advice.reason)}</p>
  ${context.warnings.length?`<p class="kintra-muted-warning">${safe(context.warnings.join(" "))}</p>`:""}
  <div class="actions"><button class="btn secondary" data-action="adjust">Adapter mon entraînement</button></div></article>
 ${forecastCard(state.weather)}
 <p class="kintra-disclaimer">KINTRA utilise des règles de progression prudentes inspirées des pratiques publiquement documentées de coaching sportif. Les recommandations ne remplacent ni ton ressenti ni un avis médical.</p>`;
}
export function renderKintraProgressSummary({state,date}){
 const c=evaluateSportContext({activities:state.activities,wellness:state.wellness,strength:state.strength,date});
 return `<div class="kintra-insight-strip">
 <div><small>Volume 7 j</small><strong>${shown(c.weeklyKm)} km</strong></div>
 <div><small>Charge chronique</small><strong>${shown(c.ctl)}</strong></div>
 <div><small>Charge aiguë</small><strong>${shown(c.atl)}</strong></div>
 </div>
 <p class="sub">CTL / ATL : mesures Intervals.icu lorsqu'elles sont fournies; aucune estimation inventée.</p>`;
}
