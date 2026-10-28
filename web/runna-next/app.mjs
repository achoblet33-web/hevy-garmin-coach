import {generateRunningPlan,applyTodayRecommendation,moveWorkout} from "../plan-engine.mjs";
import {encryptApiKey,decryptApiKey} from "./credentials.mjs";
import {renderTrainingReview,renderActivityReport} from "./after-run.mjs";
import {generateMaintenancePlan} from "./kintra-coach.mjs";
import {renderKintraDashboard,renderKintraProgressSummary} from "./kintra-hub.mjs";
const STORAGE="trainsync-next-running-v1";
const sample=()=>({mode:"event",maintenanceFocus:"balance",distanceKm:10,raceDate:add(today(),84),weeklyKm:23,frequency:3,longDay:6,availableDays:[1,3,6],targetTimeMinutes:50});
const $=id=>document.getElementById(id), e=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
function add(x,n){const d=new Date(x+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
const weekday=x=>(new Date(x+"T12:00:00Z").getUTCDay()+6)%7;
const monday=x=>add(x,-weekday(x));
const fmt=x=>new Date(x+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
const full=x=>new Date(x+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
const km=n=>Number(n||0).toLocaleString("fr-FR",{maximumFractionDigits:1});
const colors={easy:"#ff9b9c",long:"#d982a6",interval:"#ff526b",tempo:"#ffad8d",race:"#ffc1b4",rest:"#967a84",recovery:"#f4a1b5"};
const labels={easy:"Endurance fondamentale",long:"Sortie longue",interval:"Fractionné",tempo:"Tempo",race:"Course objectif",rest:"Repos",recovery:"Récupération"};
const emoji={easy:"🏃",long:"↗",interval:"⚡",tempo:"◈",race:"🏁",rest:"◯",recovery:"♧"};
const LIVE_HOST="trainsync-staging-demo-staging.up.railway.app";
const DEMO=new URLSearchParams(location.search).get("demo")==="1";
const KEY_VAULT="trainsync-intervals-encrypted-v1";
let state={tab:"today",step:0,form:{...sample()},plan:null,selected:null,week:0,chosenDay:today(),activities:[],strength:[],wellness:[],versionHistory:[],sheet:null,connected:false,apiOrigin:null,apiToken:null,viewMode:"weeks",feedback:{},toast:"",sourceMode:DEMO?"demo":"disconnected",weather:null,watchSuccess:null,planned:[],activityFocus:null,activitySegments:null,activityLoading:false,syncNote:""};
function readLocal(){try{const saved=JSON.parse(localStorage.getItem(STORAGE)||"{}");state.plan=saved.plan||null;state.versionHistory=(saved.history||[]).slice(-5);state.feedback=saved.feedback||{};}catch{}}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({plan:state.plan,history:state.versionHistory.slice(-5),feedback:state.feedback}));}catch{}}
function alertText(text){state.toast=text;draw();setTimeout(()=>{if(state.toast===text){state.toast="";draw()}},5000)}
function timeGoal(minutes){if(!minutes)return"Objectif libre";const h=Math.floor(minutes/60),m=Math.floor(minutes%60),s=Math.round(minutes*60%60);return (h? h+"h ":"")+String(m).padStart(h?2:1,"0")+"m "+String(s).padStart(2,"0")+"s"}
function statData(){const limit=add(today(),-28);const runs=state.activities.filter(x=>x.category==="Course"&&String(x.startedAt||"").slice(0,10)>=limit);
 return {runs,km:runs.reduce((a,x)=>a+Number(x.distanceKm||0),0),sessions:runs.length};}
function workoutDescription(x){
 if(x.kind==="interval")return[{name:"Échauffement",value:"12 min · endurance facile"},{name:"Fractionné",value:"6 × 800 m · zone d'allure à calibrer"},{name:"Récupération",value:"2 min entre les répétitions"},{name:"Retour au calme",value:"8 min facile"}];
 if(x.kind==="tempo")return[{name:"Échauffement",value:"12 min facile"},{name:"Bloc tempo",value:"Effort soutenu contrôlé"},{name:"Retour au calme",value:"8 min facile"}];
 if(x.kind==="long")return[{name:"Début",value:"Démarrer très facilement"},{name:"Corps de séance",value:"Allure conversationnelle"},{name:"Fin",value:"5 min de retour au calme"}];
 if(x.kind==="race")return[{name:"Course",value:"Gestion de l'allure selon la stratégie de course"}];
 return[{name:"Départ",value:"10 min très faciles"},{name:"Endurance",value:"Effort confortable, respiration régulière"},{name:"Fin",value:"Retour au calme"}];
}
function program(){
 if(!state.plan)return `<div class="kintra-plan-empty"><strong>Ton programme n'est pas encore configuré.</strong>
 <p class="sub">Choisis un objectif événement ou un cycle de maintien adapté à ton emploi du temps.</p>
 <button class="btn" data-action="setup">Créer mon programme</button></div>`;
 const p=state.plan.profile,isMaint=state.plan.mode==="maintenance"||p.mode==="maintenance";
 const daysLeft=isMaint?null:Math.max(0,Math.round((new Date(p.raceDate+"T12:00:00Z")-new Date(today()+"T12:00:00Z"))/86400000));
 const nowWeek=state.plan.sessions.find(x=>x.date>=today())?.week||state.plan.totalWeeks;
 const done=state.plan.sessions.filter(x=>x.status==="done").length;
 return `<div class="card hero kintra-plan-hero"><div class="between">
 <span class="eyebrow">${isMaint?"COACH · MODE MAINTIEN":"COACH · OBJECTIF ÉVÉNEMENT"}</span>
 <span class="pill">${isMaint?"Cycle de 4 semaines":daysLeft+" jours"}</span></div>
 <h2>${isMaint?"Reste en mouvement":"Objectif "+km(p.distanceKm)+" km"}</h2>
 <p class="sub">${isMaint?e(p.frequency+" séances / semaine · "+p.weeklyKm+" km de base"):full(p.raceDate)+" · "+timeGoal(p.targetTimeMinutes)}</p>
 <div class="progress"><span style="width:${Math.round(done/Math.max(1,state.plan.sessions.length)*100)}%"></span></div>
 <div class="between"><span class="sub">Semaine ${nowWeek} / ${state.plan.totalWeeks}</span>
 <button class="textButton" data-action="tab:plan">Voir mon programme ›</button></div></div>`;
}
function weekBar(date){
 const start=monday(date),arr=Array.from({length:7},(_,i)=>add(start,i));
 return `<div class="weekstrip">${arr.map(x=>{
  const has=state.plan?.sessions.some(s=>s.date===x&&s.kind!=="rest");
  return `<button data-action="day:${x}" class="${state.chosenDay===x?"active":""}"><small>${["L","M","M","J","V","S","D"][weekday(x)]}</small><strong>${x.slice(-2)}</strong><span class="dot ${has?"on":""}"></span></button>`;
 }).join("")}</div>`;
}
function sessionCard(x){
 const color=colors[x.kind]||"#94a3a9";
 const date=x.date||String(x.startedAt||"").slice(0,10);
 return `<button class="training" data-action="session:${e(x.id)}"><span class="strip" style="background:${color}"></span>
 <span style="flex:1;min-width:0"><small>${fmt(date)} · ${x.status==="done"?"Terminé":x.kind==="rest"?"Récupération":x.status==="skipped"?"Ignoré":"À venir"}</small>
 <strong>${e(x.title||labels[x.kind]||"Course")}</strong><small>${km(x.distanceKm)} km · ${e(x.intensity||"Effort personnalisé")}</small></span><span class="arrow">›</span></button>`;
}
function todayView(){return renderKintraDashboard({state,plan:state.plan,date:today(),weekstrip:weekBar,sessionCard,program});}
function emptyWelcome(){
 return `<div class="card hero"><span class="eyebrow">Bienvenue sur KINTRA</span><h2>Un objectif.<br>Un programme.<br>Ton rythme.</h2><p class="sub">Un coach de course personnalisé, jour après jour, conçu pour fonctionner avec les séances enregistrées sur ta montre.</p>
 <div class="actions"><button class="btn full" data-action="setup">Créer mon programme</button></div></div>
 <div class="card"><div class="heading">Comment ça marche</div>
 ${[["◎","Définis ton objectif","Distance, échéance et niveau actuel."],["▦","Retrouve ta semaine","Footings, fractionnés, sorties longues et repos."],["↗","Progresse après chaque course","Suivi et ajustements selon tes performances."]].map(x=>`<div class="row" style="margin:15px 0"><div class="iconTile">${x[0]}</div><div><strong>${x[1]}</strong><p class="sub">${x[2]}</p></div></div>`).join("")}</div>`;
}
function planView(){
 if(!state.plan)return emptyWelcome();
 const p=state.plan,idx=Math.max(0,Math.min(state.week,p.totalWeeks-1)),w=p.summary[idx];
 const sessions=p.sessions.filter(x=>x.week===w.week);
 const done=sessions.filter(x=>x.status==="done").length;
 return `<h2 class="pageTitle">Mon programme</h2>${program()}
 <div class="card"><div class="between"><span class="eyebrow">Semaine de course</span><button class="textButton" data-action="manage">Gérer mon plan</button></div>
 <div class="weekNav"><button data-action="week:-1">‹</button><div style="text-align:center"><strong>Semaine ${idx+1} / ${p.totalWeeks}</strong><small>${e(w.phase)} · ${w.plannedKm} km</small></div><button data-action="week:1">›</button></div>
 <div class="progress"><span style="width:${Math.round(done/Math.max(1,sessions.length)*100)}%"></span></div><p class="sub">${done} / ${sessions.length} séances déclarées réalisées</p></div>
 <div class="sectionTitle"><h2>Les séances de la semaine</h2><button class="textButton" data-action="adjust">Réorganiser</button></div>
 ${sessions.length?sessions.map(sessionCard).join(""):`<div class="card empty">Aucune séance cette semaine.</div>`}
 <div class="card"><div class="eyebrow">Progression du plan</div>
 ${p.summary.slice(Math.max(0,idx-2),Math.min(p.totalWeeks,idx+3)).map(x=>`<div class="between" style="padding:10px 0;border-bottom:1px solid #34414a"><span class="sub">S${x.week} · ${e(x.phase)}</span><strong>${x.plannedKm} km</strong></div>`).join("")}
 <button class="textButton" style="margin-top:12px" data-action="calendar">Afficher le calendrier complet ›</button></div>`;
}
function activitiesView(){
 const stats=statData();
 const runlist=state.activities.filter(x=>x.category==="Course").slice(0,25);
 const warning=state.syncNote?`<p class="warning">${e(state.syncNote)}</p>`:"";
 const long=Math.max(5,...runlist.map(x=>Number(x.distanceKm||0)));
 return `<h2 class="pageTitle">Progression</h2><p class="sub">Tes courses et tes résultats, au même endroit.</p>${warning}
 ${renderKintraProgressSummary({state,date:today()})}
 <div class="actions"><button class="btn secondary full" data-action="refreshData">Actualiser depuis Intervals.icu ↻</button></div>
 <div class="card"><div class="between"><h3 class="heading">Les 28 derniers jours</h3><span class="pill muted">${state.sourceMode==="demo"?"Données fictives":"Intervals.icu"}</span></div>
 <div class="statrow"><div class="stat"><strong>${km(stats.km)}</strong><small>Kilomètres</small></div><div class="stat"><strong>${stats.sessions}</strong><small>Courses</small></div><div class="stat"><strong>${km(stats.sessions?stats.km/stats.sessions:0)}</strong><small>Moyenne km</small></div></div>
 <div class="line"></div><strong>Volume par séance</strong><div class="metrics" style="margin-top:12px">
 ${runlist.slice(0,8).reverse().map(x=>`<div class="bar"><span>${fmt(String(x.startedAt).slice(0,10)).split(" ")[0]}</span><div class="track"><b style="width:${Math.round((Number(x.distanceKm||0)/long)*100)}%"></b></div><small>${km(x.distanceKm)} km</small></div>`).join("")||`<p class="sub">Synchronise tes courses pour voir la progression.</p>`}</div></div>
 <div class="sectionTitle"><h2>Historique</h2><button class="textButton" data-action="connect">Connecter mes données</button></div>
 ${runlist.map(x=>`<div class="training"><span class="strip"></span><span style="flex:1"><small>${fmt(String(x.startedAt).slice(0,10))}</small><strong>${e(x.title)}</strong><small>${km(x.distanceKm)} km · ${x.durationMinutes??"—"} min · FC ${x.averageHeartRate??"—"}</small></span></div>`).join("")||`<div class="card empty"><strong>Ton historique t'attend</strong>Les activités de ton Apple Watch peuvent remonter via Intervals.icu Companion.</div>`}
 ${renderTrainingReview(state.activities,state.planned||[])}
 <div class="card"><div class="heading">Analyses avancées</div><p class="sub">Les comparaisons répétition par répétition et les estimations chronométriques nécessitent les tours, les zones et des courses réelles. Aucun score de performance fictif n'est affiché.</p></div>`;
}
function libraryView(){
 const workouts=[["easy","Course facile","Endurance en aisance respiratoire","35–50 min"],["interval","Fractionné","Travail d'allure par répétitions","6 × 800 m"],["tempo","Tempo","Rythme soutenu contrôlé","35–55 min"],["long","Sortie longue","Construire l'endurance","60–110 min"]];
 return `<h2 class="pageTitle">Séances libres</h2><p class="sub">Choisis une séance sans modifier le programme principal.</p>
 <div class="choice" style="margin-top:10px">${workouts.map(x=>`<button data-action="library:${x[0]}" style="border-top:4px solid ${colors[x[0]]}"><span style="font-size:24px">${emoji[x[0]]}</span><strong>${x[1]}</strong><small style="color:#aebdc9">${x[2]} · ${x[3]}</small></button>`).join("")}</div>
 <div class="card"><div class="heading">Une séance sur mesure</div><p class="sub">Les objectifs d'allure utilisent les zones paramétrées dans Intervals.icu. Aucune allure précise n'est inventée à partir d'un objectif théorique.</p><button class="btn full secondary" data-action="connect">Configurer la synchronisation</button></div>`;
}
function profileView(){
 const p=state.plan?.profile;
 return `<h2 class="pageTitle">Mon profil</h2><p class="sub">Tes objectifs, tes appareils et les paramètres du coach.</p>
 <div class="card"><div class="row"><div class="iconTile">◎</div><div><strong>KINTRA Coach</strong><p class="sub">${p?(p.mode==="maintenance"?"Mode maintien":km(p.distanceKm)+" km")+" · "+p.frequency+" sorties/semaine":"Aucun plan actif"}</p></div></div>
 <div class="actions"><button class="btn secondary" data-action="setup">${p?"Créer un autre programme":"Définir mon objectif"}</button></div></div>
 <div class="card"><div class="heading">Mes connexions</div><div class="row" style="margin-bottom:12px"><div class="iconTile">⌚</div><div><strong>Apple Watch</strong><p class="sub">Séances via Intervals.icu Companion</p></div></div>
 <div class="row" style="margin-bottom:12px"><div class="iconTile">↗</div><div><strong>Intervals.icu</strong><p class="sub">${state.connected?"Compte Intervals.icu connecté":"Connexion requise pour les activités réelles"}</p></div></div>
 <div class="row"><div class="iconTile">▣</div><div><strong>Hevy</strong><p class="sub">Intégration complémentaire à connecter ultérieurement</p></div></div>
 <div class="actions"><button class="btn secondary" data-action="connect">Gérer les connexions</button></div></div>
 ${state.watchSuccess?`<div class="card">
 <div class="eyebrow">Séance préparée pour l'Apple Watch</div>
 <h3 class="heading">${state.watchSuccess.real?"Enregistrée sur Intervals.icu":"Publication simulée"}</h3>
 <p class="sub">${e(state.watchSuccess.message||"")}</p>
 ${state.watchSuccess.real?`<div class="callout">
 <strong>Sur ton iPhone :</strong><br>
 1. Ouvre Intervals.icu et vérifie les étapes de la séance.<br>
 2. Ouvre <strong>Intervals.icu Companion</strong> → More → Workout Settings.<br>
 3. Active <strong>Automatically Sync Planned Workouts to Apple Watch</strong> et synchronise.<br>
 4. Sur l'Ultra 3, ouvre <strong>Exercice</strong> et retrouve la séance programmée.<br>
 5. Après la course, autorise Apple Santé → Intervals.icu via Companion.
 </div>
 <div class="actions"><button class="btn secondary" data-action="refreshData">Actualiser mes activités</button></div>`:""}
 </div>`:""}
 <div class="card"><div class="heading">Mes programmes</div><button class="btn secondary full" data-action="history">Voir les anciennes versions</button>
 <p class="sub">Tes programmes et préférences sont enregistrés localement sur cet appareil. Les séances publiées doivent être vérifiées dans Intervals.icu.</p></div>
 <div class="card"><div class="heading">À propos de cette version</div><p class="sub">Interface de développement inspirée des principaux parcours d'applications de coaching running, conçue indépendamment. Pas d'enregistrement direct HealthKit dans cette PWA.</p><div class="warning">${DEMO?"Démonstration : données fictives. Aucune séance envoyée à la montre.":state.connected?"Mode actif : tes courses sont lues depuis Intervals.icu, confirme chaque publication.":"Mode actif non connecté : ouvre Mes connexions pour utiliser ton vrai compte."}</div></div>`;
}
function detailView(x){
 const steps=workoutDescription(x);
 const past=x.date<today();
 return `<div class="detailsHeader"><div class="between"><span class="eyebrow">${fmt(x.date)} · ${e(x.phase||"Séance")}</span><span class="pill muted">${x.status==="done"?"Terminée":x.status==="skipped"?"Ignorée":"Prévue"}</span></div>
 <h2>${e(x.title)}</h2><p class="sub">${km(x.distanceKm)} km · ${e(x.intensity||"Allure confortable")}</p><div class="badgeLine"><span class="pill">${e(labels[x.kind]||"Course")}</span><span class="pill muted">${state.plan?.profile?.distanceKm||"—"} km objectif</span></div></div>
 <div class="card"><h3 class="heading">Détail de la séance</h3>
 ${steps.map((s,i)=>`<div class="step"><div class="number">${i+1}</div><div><strong>${e(s.name)}</strong><small>${e(s.value)}</small></div></div>`).join("")}
 <div class="callout">Pourquoi cette séance ?<br>${e(x.reason||"Développer progressivement les capacités de course.")}</div></div>
 <div class="card"><h3 class="heading">Après ta course</h3><p class="sub">L'activité réelle doit être enregistrée par l'Apple Watch puis synchronisée. Le marquage manuel ne crée pas de course GPS.</p>
 <div class="actions"><button class="btn secondary" data-action="status:done">${x.status==="done"?"Annuler le marquage":"Marquer comme réalisée"}</button><button class="btn ghost" data-action="status:skipped">Ignorer</button></div>
 <div class="actions"><button class="btn ghost" data-action="feedback">Donner mon ressenti</button><button class="btn ghost" data-action="move">Déplacer</button></div></div>
 ${x.exportable?`<div class="card"><h3 class="heading">Courir avec l'Apple Watch</h3><p class="sub">Préparer une séance structurée dans Intervals.icu. Companion transmet ensuite la séance à l'application Exercice.</p>
 <div class="warning">La structure d'export (durées, répétitions et zones) peut nécessiter un ajustement. La distance prévue du programme ne garantit pas une correspondance exacte avec l'export.</div>
 <div class="actions"><button class="btn full" data-action="watch">Préparer pour l'Apple Watch ↗</button></div></div>`:""}`;
}
function renderWizard(){
 const f=state.form,s=state.step;
 const texts=[["Quel est ton objectif ?","Choisis la distance et la date de ton prochain défi."],["Où en es-tu aujourd'hui ?","Ton programme part de ton niveau actuel, pas de ton chrono rêvé."],["Quand peux-tu courir ?","Le calendrier s'organise autour de tes disponibilités."],["Ton programme est prêt","Vérifie-le avant de l'adopter."]];
 let body="";
 if(s===0)body=`<div class="choice">${[[5,"5 km"],[10,"10 km"],[21.0975,"Semi-marathon"],[42.195,"Marathon"]].map(([n,l])=>`<button class="${f.distanceKm===n?"active":""}" data-action="distance:${n}"><span style="font-size:23px">🏁</span>${l}</button>`).join("")}</div>
 <div class="formGrid" style="margin-top:16px"><label>Date de course<input id="raceDate" type="date" min="${add(today(),21)}" max="${add(today(),365)}" value="${e(f.raceDate)}"></label>
 <label>Chrono souhaité (facultatif)<input id="raceTime" placeholder="0:50:00" value="${f.targetTimeMinutes?timeFor(f.targetTimeMinutes):""}"></label></div>`;
 if(s===1)body=`<p class="sub">Ce volume correspond aux kilomètres que tu cours déjà en moyenne par semaine.</p>
 <div class="formGrid"><label>Km par semaine<input type="number" id="weeklyKm" min="3" max="140" value="${f.weeklyKm||""}" step=".5"></label>
 <label>Sorties par semaine<select id="freq">${[2,3,4,5,6].map(n=>`<option value="${n}" ${f.frequency===n?"selected":""}>${n} sorties</option>`).join("")}</select></label></div>
 <div class="callout" style="margin-top:15px">Le coach évitera une montée brusque du kilométrage et prévoira des semaines allégées. Les allures se calibreront après tes premières courses.</div>`;
 if(s===2)body=`<p class="sub">Sélectionne au moins ${f.frequency} jours. Le jour de sortie longue doit également être disponible.</p>
 <div class="checkgrid">${["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map((name,i)=>`<label><input type="checkbox" data-day="${i}" ${f.availableDays.includes(i)?"checked":""}>${name}</label>`).join("")}</div>
 <div class="formGrid" style="margin-top:14px"><label>Jour de sortie longue<select id="longDay">${["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"].map((name,i)=>`<option value="${i}" ${f.longDay===i?"selected":""}>${name}</option>`).join("")}</select></label></div>`;
 if(s===3)body=`<div class="statrow"><div class="stat"><strong>${km(f.distanceKm)}</strong><small>Objectif km</small></div><div class="stat"><strong>${f.weeklyKm}</strong><small>Km actuels/sem.</small></div><div class="stat"><strong>${f.frequency}</strong><small>Sorties/sem.</small></div></div>
 <div class="callout" style="margin-top:15px">Course du ${full(f.raceDate)}. Le plan comprend endurance, sorties longues, entraînements de qualité adaptés, assimilation et affûtage.</div>
 <p class="sub">Tu pourras modifier ton objectif, déplacer des séances et réorganiser le plan avec un aperçu avant validation.</p>`;
 return `<div class="top"><button class="circle" data-action="wizardBack">‹</button><div class="eyebrow">Programme personnalisé · ${s+1}/4</div><span style="width:40px"></span></div>
 <div class="content"><div class="stepper">${[0,1,2,3].map(i=>`<span class="${i<=s?"active":""}"></span>`).join("")}</div>
 <h2 class="pageTitle">${texts[s][0]}</h2><p class="sub">${texts[s][1]}</p><div class="card">${body}</div>
 <div id="wizardError" class="warning" hidden></div><button class="btn full" data-action="wizardNext">${s===3?"Créer mon programme":"Continuer"}</button>
 <p class="sub" style="text-align:center">Aucun abonnement à Runna ni licence développeur Apple nécessaire pour cette interface.</p></div>`;
}
function timeFor(m){const total=Math.round(m*60),h=Math.floor(total/3600),min=Math.floor(total/60%60),s=total%60;return h+":"+String(min).padStart(2,"0")+":"+String(s).padStart(2,"0")}
function normalPage(){
 let content=state.tab==="today"?todayView():state.tab==="plan"?planView():state.tab==="activities"?activitiesView():state.tab==="library"?libraryView():profileView();
 if(state.activityFocus){const a=state.activities.find(x=>String(x.externalId||x.id?.replace(/^intervals:/,""))===state.activityFocus);
   content=renderActivityReport({activity:a,planned:state.planned,plan:state.plan,segments:state.activitySegments,
     loading:state.activityLoading,feedback:state.feedback["activity:"+state.activityFocus]});
 }
 if(!state.activityFocus&&state.selected){const x=state.plan?.sessions.find(y=>y.id===state.selected);
 if(x)content=`<button class="textButton" data-action="back">‹ Retour</button>${detailView(x)}`;
 }
 return `<div class="app"><header class="top"><div><small>TrainSync · Coach</small><h1>${state.selected?"Ma séance":state.tab==="today"?"Bonjour 👋":state.tab==="plan"?"Mon entraînement":state.tab==="activities"?"Mes résultats":state.tab==="library"?"Courir":"Paramètres"}</h1></div>
 <button class="circle" data-action="tab:profile" aria-label="Mon profil">◎</button></header>
 <main class="content">${DEMO?`<div class="warning">Mode démonstration · données fictives · aucune séance envoyée sur ta montre. <button class="textButton" data-action="goLive">Ouvrir la version active</button></div>`:!state.connected?`<div class="callout">Mode actif · Connecte ton compte Intervals.icu pour synchroniser les courses et envoyer des séances à l’Apple Watch. <button class="textButton" data-action="connect">Connecter maintenant ›</button></div>`:""}${content}</main></div>
 <nav class="nav" aria-label="Navigation principale">${[["today","☀","Aujourd'hui"],["plan","▦","Plan"],["activities","▥","Activités"],["profile","◎","Profil"]].map(([id,icon,name])=>`<button data-action="tab:${id}" class="${state.tab===id?"active":""}"><span class="symbol">${icon}</span>${name}</button>`).join("")}</nav>`;
}
function sheet(){
 const sh=state.sheet;if(!sh)return"";
 const close=`<button class="close" data-action="close">✕</button>`;
 let body="";
 if(sh==="manage")body=`<h2>Gérer mon programme</h2><p class="sub">Une nouvelle version est prévisualisée avant de remplacer le programme en cours.</p>
 <div class="stack"><button class="btn secondary full" data-action="setup">Changer mon objectif</button><button class="btn secondary full" data-action="adjust">Fatigue, vacances ou interruption</button><button class="btn secondary full" data-action="history">Versions précédentes</button></div>`;
 if(sh==="adjust")body=`<h2>Adapter mon programme</h2><p class="sub">Réorganisation des semaines à venir, toujours après confirmation.</p>
 <div class="formGrid"><label>Motif<select id="adaptKind"><option value="recovery">Fatigue / reprise</option><option value="holiday">Vacances / indisponibilité</option></select></label>
 <label>Adaptation<select id="adaptMode"><option value="easy">Uniquement facile</option><option value="off">Pause complète</option></select></label><label>Du<input id="adaptFrom" type="date" value="${today()}"></label><label>Au<input id="adaptTo" type="date" value="${add(today(),6)}"></label></div>
 <div class="actions"><button class="btn full" data-action="previewAdapt">Prévisualiser l'adaptation</button></div>`;
 if(sh==="preview")body=`<h2>Vérifier le nouveau plan</h2><p class="sub">${state.draft.totalWeeks} semaines · ${state.draft.profile.distanceKm} km · ${state.draft.profile.frequency} séances/semaine</p>
 <div class="statrow"><div class="stat"><strong>${state.draft.summary[0]?.plannedKm??0}</strong><small>Semaine 1</small></div><div class="stat"><strong>${state.draft.sessions.length}</strong><small>Créneaux</small></div><div class="stat"><strong>${state.draft.totalWeeks}</strong><small>Semaines</small></div></div>
 ${state.draft.notes.map(n=>`<p class="warning">${e(n)}</p>`).join("")}
 <div class="actions"><button class="btn" data-action="acceptPlan">Adopter le plan</button><button class="btn secondary" data-action="close">Annuler</button></div>`;
 if(sh==="move")body=`<h2>Déplacer ma séance</h2><p class="sub">Les nouvelles dates ne doivent pas perturber les séances importantes.</p>
 <label>Nouvelle date<input id="moveDate" type="date" value="${state.plan.sessions.find(x=>x.id===state.selected)?.date||today()}"></label>
 <div class="actions"><button class="btn full" data-action="confirmMove">Déplacer</button></div>`;
 if(sh==="feedback")body=`<h2>Ton ressenti</h2><p class="sub">Une note déclarative, utile pour ajuster ton plan ultérieurement.</p>
 <label>Difficulté perçue (RPE)<select id="feedbackRpe">${Array.from({length:10},(_,i)=>`<option value="${i+1}">${i+1} / 10</option>`).join("")}</select></label>
 <label style="margin-top:12px">Commentaire<input id="feedbackText" maxlength="220" placeholder="Ex. jambes lourdes, vent, chaleur"></label>
 <div class="actions"><button class="btn full" data-action="saveFeedback">Enregistrer le ressenti</button></div>`;
 if(sh==="connect")body=DEMO?
  `<h2>Mode démonstration</h2><p class="sub">Ouvre la version active pour te connecter à ton vrai compte Intervals.icu. Les données de cette démonstration resteront fictives.</p>
    <button class="btn full" data-action="goLive">Passer à TrainSync actif</button>`:
  `<h2>Connecter Intervals.icu</h2>
  <p class="sub">Ta clé personnelle est utilisée pour lire tes courses et publier tes séances. Elle est envoyée uniquement à ton serveur TrainSync, sur HTTPS, et n'est jamais enregistrée côté serveur.</p>
  <div class="callout"><strong>Où trouver la clé ?</strong><br>Ouvre intervals.icu → Paramètres (Settings) → Developer Settings → API Key. Copie ta clé ici, jamais dans la conversation ou GitHub.</div>
  <label style="margin-top:15px">Clé API personnelle Intervals.icu
    <input id="apiToken" type="password" placeholder="Colle ta clé Intervals.icu" autocomplete="off" autocapitalize="none" spellcheck="false">
  </label>
  <label style="margin-top:12px">Phrase secrète pour sauvegarder la connexion (facultatif)
    <input id="apiVaultPass" type="password" placeholder="10 caractères minimum" autocomplete="new-password" spellcheck="false">
  </label>
  <p class="sub">Sans phrase secrète, la clé reste seulement en mémoire jusqu'à la fermeture ou au rechargement. Avec une phrase secrète, elle est chiffrée sur cet iPhone et tu pourras la déverrouiller à la prochaine ouverture.</p>
  <div class="actions"><button class="btn full" data-action="connectNow">Connecter mon compte</button></div>
  ${localStorage.getItem(KEY_VAULT)?`<div class="line"></div><strong>Connexion sauvegardée sur cet appareil</strong>
  <label>Phrase de déverrouillage<input id="apiUnlockPass" type="password" autocomplete="off" placeholder="Ta phrase secrète"></label>
  <div class="actions"><button class="btn secondary full" data-action="unlockNow">Déverrouiller ma connexion</button></div>`:""}
  ${state.connected?`<div class="callout">Compte Intervals.icu connecté. Les activités et les séances sont réelles.</div>`:""}
  <div class="actions"><button class="btn ghost full" data-action="disconnect">Déconnecter et oublier la clé sauvegardée</button></div>
  <p class="sub"><strong>Apple Watch :</strong> ouvre Intervals.icu Companion → More → Workout Settings → active « Automatically Sync Planned Workouts to Apple Watch ».</p>`;
 if(sh==="watch")body=`<h2>Préparer sur l'Apple Watch</h2><p class="sub">Une séance structurée sera publiée dans Intervals.icu uniquement après ton accord.</p>
 <div class="formGrid"><label>Type<select id="watchKind">${["easy","long","tempo","interval"].map(k=>`<option value="${k}" ${state.watch?.kind===k?"selected":""}>${labels[k]}</option>`).join("")}</select></label>
 <label>Jour prévu<input id="watchDate" type="date" value="${state.watch?.date||add(today(),1)}" min="${today()}"></label>
 <label>Durée en minutes<input id="watchMinutes" type="number" value="45" min="20" max="180"></label>
 <label>Distance par intervalle (m)<input id="watchMeters" type="number" value="800" min="200" max="2000" step="100"></label>
 <label>Répétitions<input id="watchReps" type="number" value="6" min="3" max="12"></label></div>
 <div class="actions"><button class="btn full" data-action="previewWatch">Vérifier le fractionné</button></div>
 ${state.watchPreview?`<div class="callout"><strong>Structure à publier</strong><pre style="white-space:pre-wrap;font-size:12px;line-height:1.5">${e(state.watchPreview.description)}</pre>
 ${state.connected?"Publication réelle possible après confirmation.":DEMO?"Mode démonstration : publication simulée.":"Pour publier réellement, connecte Intervals.icu depuis Profil → Mes connexions."}</div>
 <div class="actions"><button class="btn full" data-action="publishWatch">${state.connected?"Confirmer et publier":"Simuler l'envoi"}</button></div>`:""}`;
 if(sh==="activityFeedback")body=`<h2>Ton ressenti après la course</h2>
 <p class="sub">Combien était difficile cette séance ? Ta note est personnelle et n'ajuste pas le programme sans ton accord.</p>
 <label>Effort ressenti (1 = facile, 10 = maximal)<select id="runRpe">${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${i+1===5?"selected":""}>${i+1} / 10</option>`).join("")}</select></label>
 <label style="margin-top:12px">Commentaire facultatif<input id="runNote" maxlength="220" placeholder="Récupération, chaleur, douleurs, sensations…"></label>
 <div class="actions"><button class="btn full" data-action="saveActivityFeedback">Enregistrer mon ressenti</button></div>`;
 if(sh==="history")body=`<h2>Versions du programme</h2><p class="sub">Chaque remplacement peut être annulé à partir de la version précédente enregistrée.</p>
 ${state.versionHistory.length?state.versionHistory.slice().reverse().map((p,i)=>`<button class="training" data-action="restore:${state.versionHistory.length-1-i}"><span class="strip"></span><span><strong>${km(p.profile.distanceKm)} km · ${fmt(p.profile.raceDate)}</strong><small>${p.totalWeeks} semaines · Restaurer cette version</small></span></button>`).join(""):`<div class="empty">Aucune ancienne version.</div>`}`;
 if(sh==="instant")body=`<h2>Entraînement instantané</h2><p class="sub">Sélectionne un type de séance. Elle ne modifie pas automatiquement le programme.</p>
 <div class="choice">${["easy","interval","tempo","long"].map(k=>`<button data-action="instantType:${k}"><span>${emoji[k]}</span>${labels[k]}</button>`).join("")}</div>`;
 return `<div class="modalShade"><section class="modal" role="dialog" aria-modal="true" aria-label="${e(sh)}">${close}${body}</section></div>`;
}
function draw(){const a=$("app");if(!a)return;a.innerHTML=(state.step>=0&&state.wizard?`<div class="app">${renderWizard()}</div>`:normalPage())+(state.sheet?sheet():"")+(state.toast?`<div role="status" style="position:fixed;bottom:100px;left:50%;transform:translateX(-50%);z-index:100;background:#335246;color:#fff;border-radius:14px;padding:14px;max-width:95%;width:max-content">${e(state.toast)}</div>`:"");}
function wizardValues(){
 const f=state.form;
 if(state.step===0&&f.mode!=="maintenance"){f.raceDate=$("raceDate").value;const t=$("raceTime").value.trim();
  if(t){if(!/^\d{1,2}:\d{2}:\d{2}$/.test(t))throw Error("Chrono au format H:MM:SS.");
   const [h,m,s]=t.split(":").map(Number);if(m>59||s>59)throw Error("Chrono invalide.");f.targetTimeMinutes=h*60+m+s/60;}
  else f.targetTimeMinutes=null;
 }
 if(state.step===1){f.weeklyKm=Number($("weeklyKm").value);f.frequency=Number($("freq").value);if(!f.weeklyKm)throw Error("Renseigne ton kilométrage actuel.");}
 if(state.step===2){f.availableDays=[...document.querySelectorAll("[data-day]:checked")].map(x=>Number(x.dataset.day));f.longDay=Number($("longDay").value);}
}
async function api(path,options={}){
 const isDemo=DEMO&&!state.connected;
 const url="/v3"+path+(isDemo?(path.includes("?")?"&":"?")+"demo=1":"");
 if(!isDemo&&!state.connected && !path.startsWith("/workouts/preview"))throw Error("Connecte d'abord ton compte Intervals.icu depuis Profil.");
 const res=await fetch(url,{...options,
  headers:{...(options.body?{"Content-Type":"application/json"}:{}),...(!isDemo?{"x-intervals-api-key":state.apiToken}:{})},
  cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(25000)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||"Intervals.icu indisponible (HTTP "+res.status+").");
 return data;
}
async function loadLaps(){
 if(!state.connected&&!DEMO){
   state.activitySegments={error:"Connecte ton compte Intervals.icu pour consulter les fractions réelles."};
   draw();return;
 }
 const id=state.activityFocus;if(!/^[A-Za-z0-9_-]{1,80}$/.test(String(id||"")))return;
 state.activityLoading=true;draw();
 try{state.activitySegments=await api("/activities/"+encodeURIComponent(id)+"/intervals");}
 catch(error){state.activitySegments={error:error.message||"Fractions indisponibles."};}
 finally{state.activityLoading=false;draw();}
}
async function sync(){
 if(!DEMO&&!state.connected){state.activities=[];state.wellness=[];state.strength=[];state.sourceMode="disconnected";draw();return;}
 try{
  const data=await api("/dashboard?days=90");
  state.activities=Array.isArray(data.activities)?data.activities:[];
  state.strength=Array.isArray(data.strength)?data.strength:[];
  state.wellness=Array.isArray(data.wellness)?data.wellness:[];
  state.planned=Array.isArray(data.planned)?data.planned:[];
  state.syncedAt=data.syncedAt||new Date().toISOString();
  state.sourceMode=data.demo?"demo":data.ok?"intervals":"partial";
  state.syncNote=(data.warnings||[]).join(" · ");
  draw();
 }catch(err){state.syncNote=err.message;alertText("Synchronisation : "+err.message);}
}
function patchStatus(next){
 const id=state.selected;
 if(!state.plan)return;
 state.plan={...state.plan,sessions:state.plan.sessions.map(x=>x.id===id?{...x,status:x.status===next?"planned":next}:x)};
 persist();state.sheet=null;draw();
}
async function perform(action,value){
 try{
 if(action==="tab"){state.tab=value;state.selected=null;state.activityFocus=null;state.activitySegments=null;draw();return;}
 if(action==="day"){state.chosenDay=value;draw();return;}
 if(action==="week"){state.week=Math.max(0,Math.min(state.plan.totalWeeks-1,state.week+Number(value)));draw();return;}
 if(action==="session"){state.selected=value;draw();return;}
 if(action==="activity"){
   if(!/^[A-Za-z0-9_-]{1,80}$/.test(value))throw Error("Identifiant d'activité incorrect.");
   if(!state.activities.some(a=>String(a.externalId||a.id?.replace(/^intervals:/,""))===value))throw Error("Activité introuvable dans ton compte.");
   state.activityFocus=value;state.activitySegments=null;state.tab="activities";draw();
   await loadLaps();return;
 }
 if(action==="backActivity"){state.activityFocus=null;state.activitySegments=null;draw();return;}
 if(action==="loadLaps"){await loadLaps();return;}
 if(action==="activityFeedback"){state.sheet="activityFeedback";draw();return;}
 if(action==="saveActivityFeedback"){
   if(!state.activityFocus)throw Error("Aucune activité sélectionnée.");
   const rpe=Number($("runRpe")?.value);
   if(!Number.isInteger(rpe)||rpe<1||rpe>10)throw Error("Note RPE invalide.");
   state.feedback["activity:"+state.activityFocus]={rpe,comment:($("runNote")?.value||"").slice(0,220),at:new Date().toISOString()};
   persist();state.sheet=null;draw();alertText("Ressenti enregistré. Le plan reste inchangé.");return;
 }
 if(action==="back"){state.selected=null;draw();return;}
 if(action==="setup"){state.form={...sample(),...(state.plan?.profile||{}),mode:state.plan?.mode||state.plan?.profile?.mode||"event"};state.step=0;state.wizard=true;state.sheet=null;draw();return;}
 if(action==="distance"){state.form.distanceKm=Number(value);draw();return;}
 if(action==="goalMode"){state.form.mode=value==="maintenance"?"maintenance":"event";draw();return;}
 if(action==="focus"){state.form.maintenanceFocus=["balance","endurance","speed"].includes(value)?value:"balance";draw();return;}
 if(action==="wizardBack"){if(state.step===0){state.wizard=false;}else state.step--;draw();return;}
 if(action==="wizardNext"){
  wizardValues();if(state.step<3){state.step++;draw();return;}
  state.draft=state.form.mode==="maintenance"?generateMaintenancePlan(state.form,today()):generateRunningPlan(state.form,today());state.wizard=false;state.sheet="preview";draw();return;
 }
 if(action==="acceptPlan"){
  if(!state.draft)return;if(!confirm("Adopter ce programme ? Aucune séance ne sera publiée automatiquement."))return;
  if(state.plan)state.versionHistory.push(state.plan);
  state.plan=state.draft;state.draft=null;state.week=0;state.chosenDay=today();state.sheet=null;state.tab="today";persist();draw();return;
 }
 if(action==="manage"||action==="adjust"||action==="history"||action==="connect"||action==="instant"){state.sheet=action;draw();return;}
 if(action==="close"){state.sheet=null;state.draft=null;state.watchPreview=null;draw();return;}
 if(action==="calendar"){state.sheet=null;state.tab="plan";state.week=0;draw();return;}
 if(action==="status"){patchStatus(value);return;}
 if(action==="move"||action==="feedback"){state.sheet=action;draw();return;}
 if(action==="confirmMove"){
  const date=$("moveDate").value,source=state.plan.sessions.find(x=>x.id===state.selected);
  const n=Math.abs(Math.round((new Date(date+"T12:00:00Z")-new Date(source.date+"T12:00:00Z"))/864e5));
  if(n>14)throw Error("Déplace une séance au maximum de deux semaines et vérifie les efforts proches.");
  state.versionHistory.push(state.plan);state.plan=moveWorkout(state.plan,state.selected,date);state.sheet=null;persist();draw();return;
 }
 if(action==="saveFeedback"){state.feedback[state.selected]={rpe:Number($("feedbackRpe").value),comment:$("feedbackText").value,at:new Date().toISOString()};persist();state.sheet=null;alertText("Ressenti enregistré sur cet appareil.");return;}
 if(action==="previewAdapt"){
  const kind=$("adaptKind").value,mode=$("adaptMode").value,start=$("adaptFrom").value,end=$("adaptTo").value;
  if(start>end)throw Error("Dates incohérentes.");
  const span=Math.round((new Date(end+"T12:00:00Z")-new Date(start+"T12:00:00Z"))/864e5)+1;
  if(span>21)throw Error("Limite de 21 jours pour l'aperçu; pour une interruption longue, recrée un programme.");
  state.draft=generateRunningPlan(state.plan.profile,state.plan.createdAt,{...state.plan.modifiers,[kind]:{start,end,mode}});
  state.sheet="preview";draw();return;
 }
 if(action==="restore"){const old=state.versionHistory[Number(value)];if(!old)return;
  if(!confirm("Restaurer cette version du plan ?"))return;
  const previous=state.plan;state.plan=old;state.versionHistory.splice(Number(value),1);if(previous)state.versionHistory.push(previous);
  persist();state.sheet=null;draw();return;
 }
 if(action==="library"||action==="instantType"){state.sheet="watch";state.watch={kind:value,date:add(today(),1)};state.watchPreview=null;draw();return;}
 if(action==="watch"){const s=state.plan.sessions.find(x=>x.id===state.selected);
  if(!s)return;state.sheet="watch";state.watch={kind:s.kind,date:s.date};state.watchPreview=null;draw();return;}
 if(action==="previewWatch"){
  state.watch={kind:$("watchKind").value,date:$("watchDate").value,durationMinutes:Number($("watchMinutes").value),intervalMeters:Number($("watchMeters").value),repeats:Number($("watchReps").value)};
  const d=await api("/workouts/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(state.watch)});
  state.watchPreview=d.preview;draw();return;
 }
 if(action==="publishWatch"){
  if(!state.watchPreview)throw Error("Prévisualise d'abord la structure.");
  if(!state.connected&&!DEMO)throw Error("Connecte Intervals.icu pour publier cette séance.");
  if(!confirm(state.connected?"Publier réellement cette séance dans ton calendrier Intervals.icu ?":"Simuler cet envoi (aucune écriture réelle) ?"))return;
  const d=await api("/workouts/publish",{method:"POST",body:JSON.stringify(state.watch)});
  state.watchSuccess={event:d.event,structured:!!d.event?.structured,message:d.message,real:!d.simulated};
  state.sheet=null;state.watchPreview=null;state.tab="profile";draw();
  alertText(d.message||"Envoi traité.");return;
 }
 if(action==="goLive"){location.href="/runna-next/index.html";return;}
 if(action==="refreshData"){await sync();alertText("Synchronisation demandée.");return;}
 if(action==="connectNow"){
  if(DEMO)throw Error("Ouvre la version active avant de connecter Intervals.icu.");
  const key=$("apiToken").value.trim(),pass=$("apiVaultPass").value;
  if(!/^[a-zA-Z0-9_-]{12,300}$/.test(key))throw Error("Clé API invalide. Recopie la clé depuis Intervals.icu → Developer Settings.");
  const previous=state.apiToken;state.apiToken=key;state.connected=true;
  try{const status=await api("/status");if(!status?.ok||!status?.intervals?.ok)throw Error("Authentification non confirmée.");}
  catch(error){state.connected=!!previous;state.apiToken=previous;throw error;}
  if(pass){const encrypted=await encryptApiKey(key,pass);localStorage.setItem(KEY_VAULT,encrypted);}
  state.sheet=null;state.tab="activities";await sync();alertText("Compte Intervals.icu connecté. Tu peux maintenant publier tes séances.");return;
 }
 if(action==="unlockNow"){
  if(DEMO)throw Error("Ouvre la version active.");
  const vault=localStorage.getItem(KEY_VAULT);if(!vault)throw Error("Aucune clé sauvegardée sur cet iPhone.");
  const pass=$("apiUnlockPass").value;
  const key=await decryptApiKey(vault,pass);
  state.apiToken=key;state.connected=true;
  try{const status=await api("/status");if(!status?.ok)throw Error("Connexion non confirmée.");}
  catch(error){state.connected=false;state.apiToken=null;throw error;}
  state.sheet=null;state.tab="activities";await sync();alertText("Connexion Intervals.icu déverrouillée.");return;
 }
 if(action==="disconnect"){
  state.connected=false;state.apiOrigin=null;state.apiToken=null;state.sourceMode=DEMO?"demo":"disconnected";
  state.activities=[];state.strength=[];state.wellness=[];state.planned=[];state.activityFocus=null;state.activitySegments=null;state.sheet=null;
  localStorage.removeItem(KEY_VAULT);draw();if(DEMO)await sync();return;
 }
 }catch(error){const msg=error?.message||"Action impossible";if(state.wizard&&$("wizardError")){$("wizardError").hidden=false;$("wizardError").textContent=msg;}else alertText(msg);}
}
document.addEventListener("click",ev=>{
 const trigger=ev.target.closest("[data-action]");if(!trigger)return;
 const [action,...rest]=trigger.dataset.action.split(":");
 perform(action,rest.join(":"));
});
function start(){
 readLocal();
 const base=state.plan?.sessions.find(x=>x.date>=today())?.week;
 state.week=Math.max(0,(base||1)-1);
 if(DEMO&&!state.plan){
  try{state.plan=generateRunningPlan(sample(),today());state.week=0;}catch{}
 }
 draw();if(DEMO)sync();
}
start();
if ("serviceWorker" in navigator && location.protocol==="https:") navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(()=>{});
