/* TrainSync 3.0 preview — canonical Intervals.icu running hub.
   No HealthKit claims: Apple Watch sync is performed by Intervals.icu Companion. */
(() => {
  const GOAL_KEY = "trainsync-v3-running-goal";
  let dashboard = null, preview = null, requestBusy = false;
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const nf = (n, digits = 1) => Number.isFinite(Number(n)) ? Number(n).toLocaleString("fr-FR", { maximumFractionDigits: digits }) : "—";
  const localDay = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); };
  const dateFr = value => value ? new Date(value + (value.length === 10 ? "T12:00:00" : "")).toLocaleDateString("fr-FR",{ day:"numeric",month:"short" }) : "—";
  const goal = () => { try { return JSON.parse(localStorage.getItem(GOAL_KEY) || "{}"); } catch { return {}; } };
  const run = a => a.category === "Course" || /run|course/i.test(a.type || "");
  const hevyRecent = items => (items || []).filter(s => !Number.isNaN(Date.parse(s.startedAt))).sort((a,b) => Date.parse(b.startedAt)-Date.parse(a.startedAt));
  const hoursAgo = value => (Date.now() - Date.parse(value)) / 36e5;
  function legFatigue(strength) {
    const recent = hevyRecent(strength).filter(s => { const h=hoursAgo(s.startedAt); return h>=0 && h<60; });
    const legs = /squat|fente|lunge|deadlift|soulevé|souleve|presse|leg press|leg extension|leg curl|hack|quad|ischio|mollet|hip thrust|step.up/i;
    const hits = recent.filter(s => (s.exercises || []).some(e => legs.test(e.title || "")));
    const last = hits[0];
    return last ? { label:"Jambes récemment sollicitées", detail:`Hevy : ${esc(last.title || "séance jambes")} (${dateFr(last.startedAt)}). Favoriser un footing facile si courbatures ou forte fatigue.` } :
      recent.length ? { label:"Musculation récente", detail:"Aucune forte sollicitation des jambes reconnue dans les exercices disponibles. Confirme ton ressenti." } :
      { label:"Pas de séance jambes récente identifiée", detail:"Vérifie la synchronisation Hevy avant une séance intense." };
  }
  const css = `
    #performanceView{padding-bottom:18px}.ts3-stack{display:grid;gap:14px}.ts3-hero{border-radius:22px;padding:21px;background:linear-gradient(125deg,#184b3b,#102823);color:#ecfff3;border:1px solid #326b52}.ts3-hero h2{font-size:28px;margin:5px 0 9px}.ts3-hero p{font-size:13px;line-height:1.5;color:#c5ebd2;margin:0}.ts3-kicker{font-size:10px;letter-spacing:.13em;font-weight:850;text-transform:uppercase;color:#93deb5}.ts3-panel{padding:17px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.035);border-radius:20px}.ts3-panel h3{font-size:17px;margin:0 0 10px}.ts3-muted{font-size:12px;line-height:1.55;color:var(--muted,#abb1ae)}.ts3-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.ts3-stat{padding:11px;background:rgba(255,255,255,.05);border-radius:13px;min-width:0}.ts3-stat strong{display:block;font-size:18px}.ts3-stat small{font-size:10px;color:var(--muted,#abb1ae)}.ts3-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.ts3-fields label{display:grid;gap:5px;min-width:0;font-size:11px}.ts3-fields input,.ts3-fields select{min-width:0;width:100%;box-sizing:border-box;background:rgba(0,0,0,.15);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:11px;color:inherit}.ts3-wide{grid-column:span 2}.ts3-buttonrow{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.ts3-buttonrow button{flex:1 1 140px;min-height:44px}.ts3-chip{display:inline-block;background:rgba(113,224,159,.13);color:#8eeab0;border:1px solid rgba(113,224,159,.25);font-size:10px;padding:5px 9px;border-radius:999px}.ts3-entry{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)}.ts3-entry:last-child{border-bottom:none}.ts3-entry strong{display:block;font-size:13px}.ts3-entry small{font-size:11px;color:var(--muted,#abb1ae)}.ts3-code{background:rgba(0,0,0,.2);border-radius:12px;white-space:pre-wrap;word-break:break-word;font-size:12px;padding:12px;line-height:1.5}.ts3-banner{font-size:12px;line-height:1.5;padding:11px;border-radius:12px;background:rgba(245,179,67,.1);color:#f5d394}.ts3-action{background:#3cba83;color:#09251a;border:0;border-radius:12px;padding:12px;font-weight:800}.ts3-secondary{background:rgba(255,255,255,.07);color:inherit;border:1px solid rgba(255,255,255,.17);border-radius:12px;padding:12px;font-weight:650}.ts3-action:disabled,.ts3-secondary:disabled{opacity:.45}#performanceView a{color:#88e3b0}
  `;
  function markup() {
    const view=document.createElement("section"); view.className="view"; view.id="performanceView"; view.dataset.view="performance";
    view.innerHTML=`
      <div class="ts3-stack">
        <header class="ts3-hero"><div class="ts3-kicker">TrainSync 3.0 · Performance hub</div>
          <h2>Ton centre sportif</h2><p>Intervals.icu pour les courses et la récupération · Hevy pour les charges et les exercices · Apple Watch via Companion.</p></header>
        <div class="ts3-panel"><div style="display:flex;align-items:center;justify-content:space-between;gap:9px">
          <h3>Sources et synchronisation</h3><span id="ts3Source" class="ts3-chip">Non vérifié</span></div>
          <p class="ts3-muted" id="ts3SyncNote">Le suivi du jour utilise les données récupérées depuis Intervals.icu et Hevy.</p>
          <div class="ts3-buttonrow"><button type="button" id="ts3Refresh" class="ts3-action">↻ Actualiser mes données</button>
          <a class="ts3-secondary" href="https://intervals.icu/" target="_blank" rel="noopener">Ouvrir Intervals.icu</a></div></div>
        <div class="ts3-panel"><h3>Vue d'ensemble</h3><div class="ts3-grid" id="ts3Stats">
          <div class="ts3-stat"><strong>—</strong><small>Km sur 7 j</small></div><div class="ts3-stat"><strong>—</strong><small>Km sur 28 j</small></div><div class="ts3-stat"><strong>—</strong><small>Courses sur 28 j</small></div></div>
          <p class="ts3-muted" id="ts3LoadNote">En attente de données sportives réelles.</p></div>
        <div class="ts3-panel"><h3>Musculation et disponibilité</h3><div class="ts3-banner" id="ts3Legs">Connecte Hevy pour évaluer les dernières sollicitations des jambes.</div>
          <p class="ts3-muted">Indicateur contextuel, non médical. Le ressenti et la douleur priment sur les scores.</p></div>
        <div class="ts3-panel"><h3>Mon objectif running</h3><div class="ts3-fields">
          <label>Distance cible<select id="ts3GoalDistance"><option value="5">5 km</option><option value="10">10 km</option><option value="21.0975">Semi-marathon</option><option value="42.195">Marathon</option></select></label>
          <label>Échéance<input type="date" id="ts3GoalDate"></label>
          <label>Temps cible (facultatif)<input id="ts3GoalTime" placeholder="ex. 00:48:00" pattern="^([0-9]{1,2}:)?[0-5]?[0-9]:[0-5][0-9]$"></label>
          <label>Courses / semaine<select id="ts3GoalFrequency"><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option></select></label></div>
          <div class="ts3-buttonrow"><button type="button" class="ts3-secondary" id="ts3SaveGoal">Enregistrer l'objectif</button></div>
          <p class="ts3-muted" id="ts3GoalNote">Cette étape enregistre tes contraintes. Un programme complet sera activé après calibration de tes zones de course.</p></div>
        <div class="ts3-panel"><h3>Construire une séance pour l'Apple Watch</h3>
          <p class="ts3-muted">Envoi via l'API Intervals.icu. La synchronisation vers Exercice est assurée séparément par Companion.</p>
          <form id="ts3WorkoutForm" class="ts3-fields">
            <label>Type de séance<select id="ts3WorkoutKind" name="kind"><option value="easy">Footing facile</option><option value="long">Sortie longue</option><option value="interval">Fractionné</option><option value="tempo">Tempo</option></select></label>
            <label>Jour prévu<input id="ts3WorkoutDate" name="date" type="date" required></label>
            <label id="ts3DurationWrap">Durée (minutes)<input id="ts3Duration" name="durationMinutes" type="number" min="20" max="180" value="45"></label>
            <label id="ts3RepsWrap" hidden>Répétitions<input id="ts3Reps" name="repeats" type="number" min="3" max="12" value="6"></label>
            <label id="ts3MetersWrap" hidden>Distance par répétition (m)<input id="ts3Meters" name="intervalMeters" type="number" min="200" max="2000" step="100" value="800"></label>
            <div class="ts3-wide ts3-buttonrow"><button type="submit" class="ts3-action" id="ts3PreviewButton">Prévisualiser</button><button type="button" id="ts3Publish" class="ts3-secondary" disabled>Publier dans Intervals.icu</button></div>
          </form>
          <div id="ts3Preview" aria-live="polite"></div><p class="ts3-muted" id="ts3PublishMessage">Configure d'abord tes zones HR et Pace pour la course dans Intervals.icu. Une publication ne garantit pas l'arrivée sur la montre.</p></div>
        <div class="ts3-panel"><h3>Mon calendrier</h3><div id="ts3Calendar" class="ts3-muted">Pas encore synchronisé.</div></div>
        <div class="ts3-panel"><h3>Mes dernières courses</h3><div id="ts3Activities" class="ts3-muted">Pas encore synchronisé.</div></div>
      </div>`;
    return view;
  }
  function render() {
    if(!dashboard)return;
    const runs=dashboard.activities.filter(run);
    const sum=days=>runs.filter(a=>{const diff=hoursAgo(a.startedAt)/24;return diff>=0&&diff<=days;});
    const last7=sum(7),last28=sum(28),total=items=>items.reduce((v,a)=>v+(Number(a.distanceKm)||0),0);
    byId("ts3Stats").innerHTML=`<div class="ts3-stat"><strong>${nf(total(last7))}</strong><small>Km sur 7 j</small></div><div class="ts3-stat"><strong>${nf(total(last28))}</strong><small>Km sur 28 j</small></div><div class="ts3-stat"><strong>${last28.length}</strong><small>Courses sur 28 j</small></div>`;
    byId("ts3LoadNote").textContent=`${dashboard.activities.length} activités Intervals.icu · ${dashboard.strength.length} séances Hevy sur ${dashboard.period.days} jours · actualisé le ${new Date(dashboard.syncedAt).toLocaleString("fr-FR")}`;
    const fatigue=legFatigue(dashboard.strength); byId("ts3Legs").innerHTML=`<strong>${esc(fatigue.label)}</strong><div>${fatigue.detail}</div>`;
    const source=dashboard.sources;
    const ok=source.intervals?.ok && source.calendar?.ok;
    byId("ts3Source").textContent=ok?"Intervals connecté":"Synchronisation partielle";
    byId("ts3SyncNote").textContent=(dashboard.warnings || []).length?dashboard.warnings.join(" · "):"Intervals.icu : source de référence running, activités et calendrier. Hevy : détail des séries.";
    const plans=dashboard.planned.slice().sort((a,b)=>a.date.localeCompare(b.date)).filter(a=>a.date>=localDay(-1)).slice(0,8);
    byId("ts3Calendar").innerHTML=plans.length?plans.map(e=>`<div class="ts3-entry"><div><strong>${esc(e.title)}</strong><small>${esc(e.type)} · ${e.structured?"structurée":"structure non confirmée"}</small></div><small>${dateFr(e.date)}</small></div>`).join(""):"Aucune séance à venir dans le calendrier interrogé.";
    byId("ts3Activities").innerHTML=runs.slice(0,8).map(a=>`<div class="ts3-entry"><div><strong>${esc(a.title)}</strong><small>${dateFr(a.startedAt)} · ${nf(a.distanceKm)} km · ${a.durationMinutes ?? "—"} min</small></div><small>${a.averageHeartRate == null?"—":Math.round(a.averageHeartRate)+" bpm"}</small></div>`).join("")||"Aucune course sur la période. Active la synchronisation Apple Santé → Intervals.icu dans Companion.";
  }
  async function refresh() {
    const button=byId("ts3Refresh"); if(!button || requestBusy)return;
    requestBusy=true;button.disabled=true;button.textContent="Récupération en cours…";
    try {
      const status=await apiRequest("/v3/status");
      if(!status.intervals?.configured)throw Error("Clés Intervals.icu absentes du Worker Cloudflare.");
      const data=await apiRequest("/v3/dashboard?days=90",{},65000);
      if(!Array.isArray(data.activities))throw Error("Le serveur n'a pas renvoyé d'activités exploitables.");
      dashboard=data;render();
      const msg=(data.warnings||[]).length?"Données partiellement synchronisées. Vérifie le détail des sources.":"Données sportives actualisées.";
      if(typeof showStatus==="function")showStatus(msg);
    } catch(error){
      byId("ts3SyncNote").textContent=error.message || "Connexion impossible.";
      byId("ts3Source").textContent="À configurer";
      if(typeof showStatus==="function")showStatus(error.message,true);
    } finally {requestBusy=false;button.disabled=false;button.textContent="↻ Actualiser mes données";}
  }
  function inputWorkout() {
    return {kind:byId("ts3WorkoutKind").value,date:byId("ts3WorkoutDate").value,
      durationMinutes:Number(byId("ts3Duration").value),repeats:Number(byId("ts3Reps").value),intervalMeters:Number(byId("ts3Meters").value)};
  }
  function kindChanged() {
    const interval=byId("ts3WorkoutKind").value==="interval";
    byId("ts3RepsWrap").hidden=!interval;byId("ts3MetersWrap").hidden=!interval;byId("ts3DurationWrap").hidden=interval;
    byId("ts3Publish").disabled=true;preview=null;byId("ts3Preview").textContent="";
  }
  async function makePreview(event){
    event.preventDefault();const btn=byId("ts3PreviewButton");btn.disabled=true;preview=null;byId("ts3Publish").disabled=true;
    try {
      const data=await apiRequest("/v3/workouts/preview",{method:"POST",body:JSON.stringify(inputWorkout())});
      if(!data.ok||!data.preview)throw Error("Prévisualisation indisponible.");
      preview={...data.preview,inputs:inputWorkout()};
      byId("ts3Preview").innerHTML=`<p class="ts3-muted"><strong>${esc(preview.name)}</strong> · ${dateFr(preview.start_date_local)} · ${esc(preview.note)}</p><pre class="ts3-code">${esc(preview.description)}</pre>`;
      byId("ts3Publish").disabled=false;
    }catch(error){byId("ts3Preview").textContent=error.message;if(typeof showStatus==="function")showStatus(error.message,true);}
    finally{btn.disabled=false;}
  }
  async function publish() {
    if(!preview || requestBusy)return;
    if(!confirm(`Créer ${preview.name} le ${preview.inputs.date} dans ton calendrier Intervals.icu ?`))return;
    requestBusy=true;const btn=byId("ts3Publish");btn.disabled=true;btn.textContent="Envoi…";
    try {
      const res=await apiRequest("/v3/workouts/publish",{method:"POST",body:JSON.stringify(preview.inputs)},35000);
      byId("ts3PublishMessage").textContent=res.message||"Réponse non renseignée.";
      if(res.event?.structured)byId("ts3PublishMessage").textContent+=" Étapes structurées confirmées côté Intervals.icu.";
      preview=null;await refreshAfterPublish();
    }catch(error){byId("ts3PublishMessage").textContent=error.message;if(typeof showStatus==="function")showStatus(error.message,true);}
    finally{requestBusy=false;btn.textContent="Publier dans Intervals.icu";}
  }
  async function refreshAfterPublish() {
    try {dashboard=await apiRequest("/v3/dashboard?days=90",{},65000);render();}catch{}
  }
  function saveGoal(){
    const date=byId("ts3GoalDate").value, time=byId("ts3GoalTime").value.trim();
    if(date && date<localDay())return alert("La date de l'objectif doit être dans le futur.");
    if(time && !/^\d{1,2}:\d{2}:\d{2}$/.test(time))return alert("Saisis le temps cible au format HH:MM:SS.");
    const g={distance:Number(byId("ts3GoalDistance").value),date,time,frequency:Number(byId("ts3GoalFrequency").value)};
    localStorage.setItem(GOAL_KEY,JSON.stringify(g));
    byId("ts3GoalNote").textContent=`Objectif enregistré sur cet appareil : ${nf(g.distance,2)} km · ${g.date ? dateFr(g.date) : "sans échéance"} · ${g.time || "sans chrono fixé"} · ${g.frequency} sorties/semaine. La génération automatique du plan est à développer.`;
  }
  function start() {
    if(byId("performanceView"))return;
    const style=document.createElement("style");style.id="ts3Style";style.textContent=css;document.head.appendChild(style);
    const view=markup(),main=byId("app"); if(!main)return;main.prepend(view);
    const nav=document.querySelector(".bottom-nav");
    if(nav){const button=document.createElement("button");button.type="button";button.dataset.target="performance";button.innerHTML='<span aria-hidden="true">🏃</span><span>Performance</span>';button.addEventListener("click",()=>activateView("performance"));nav.prepend(button);}
    const g=goal();
    byId("ts3GoalDistance").value=String(g.distance||10);
    byId("ts3GoalDate").value=g.date||"";byId("ts3GoalTime").value=g.time||"";byId("ts3GoalFrequency").value=String(g.frequency||3);
    byId("ts3WorkoutDate").value=localDay(1);byId("ts3WorkoutDate").min=localDay();byId("ts3WorkoutKind").addEventListener("change",kindChanged);
    ["ts3Duration","ts3Reps","ts3Meters","ts3WorkoutDate"].forEach(id=>byId(id).addEventListener("input",()=>{preview=null;byId("ts3Publish").disabled=true;byId("ts3Preview").textContent="Prévisualise de nouveau la séance après toute modification.";}));
    byId("ts3WorkoutForm").addEventListener("submit",makePreview);byId("ts3Publish").addEventListener("click",publish);
    byId("ts3SaveGoal").addEventListener("click",saveGoal);byId("ts3Refresh").addEventListener("click",refresh);
    if(typeof activateView==="function")activateView("performance");
    if(typeof settings!=="undefined" && settings.relayToken)refresh();
    else byId("ts3SyncNote").textContent="Renseigne ton APP_TOKEN dans Réglages pour connecter le Worker. Aucune clé Intervals.icu n'est demandée dans la PWA.";
  }
  document.addEventListener("DOMContentLoaded",start);
})();