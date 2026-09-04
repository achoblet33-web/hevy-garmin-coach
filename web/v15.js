(() => {
  const UI_VERSION = "1.5.0";
  const FAVORITES_KEY = "trainsync-stat-favorites-v1";
  let favorites = loadFavorites();
  let detailState = null;
  let mapInstance = null;

  const v14RenderAll = renderAll;
  const v14RenderAnalysis = renderAnalysis;

  renderAll = function() {
    v14RenderAll();
    ensureCoachFocus();
    renderCoachFocus();
    const version = $("#versionLabel");
    if (version) version.textContent = `TrainSync ${UI_VERSION} · coach exécutable · favoris de statistiques`;
  };

  renderAnalysis = function() {
    v14RenderAnalysis();
    renderFocusCard();
  };

  function loadFavorites() {
    try {
      const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "null");
      return new Set(Array.isArray(stored) ? stored : ["duration", "distance"]);
    } catch { return new Set(["duration", "distance"]); }
  }

  function saveFavorites() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  }

  function toggleFavorite(key) {
    if (favorites.has(key)) favorites.delete(key); else favorites.add(key);
    saveFavorites();
    if (detailState) renderActivityDetail(detailState.session, detailState.payload);
  }

  function ensureCoachFocus() {
    if ($("#coachFocusSummary")) return;
    const intro = document.querySelector("#coachView .coach-intro");
    if (intro) intro.insertAdjacentHTML("afterend", '<article id="coachFocusSummary" class="coach-focus-summary"></article>');
  }

  function goalTargets() {
    const goal = settings.goal || $("#goalSelect")?.value || "balanced";
    if (goal === "strength" || goal === "muscle") return { lowAerobic:[25,40], highAerobic:[20,35], anaerobic:[30,45] };
    if (goal === "endurance") return { lowAerobic:[45,60], highAerobic:[25,40], anaerobic:[8,20] };
    if (goal === "recovery") return { lowAerobic:[55,75], highAerobic:[15,28], anaerobic:[5,15] };
    return { lowAerobic:[40,55], highAerobic:[25,40], anaerobic:[12,25] };
  }

  function loadSnapshot() {
    const cutoff = Date.now() - 28 * 86400000;
    const totals = { lowAerobic:0, highAerobic:0, anaerobic:0 };
    const now = Date.now();
    state.sessions.filter(s => !String(s.id).startsWith("demo-") && new Date(s.startedAt).getTime() >= cutoff).forEach(session => {
      const age = Math.max(0, (now - new Date(session.startedAt).getTime()) / 86400000);
      const decay = Math.exp(-age / 24);
      const profile = session.loadProfile || inferredProfile(session);
      Object.keys(totals).forEach(key => totals[key] += Number(profile[key] || 0) * decay);
    });
    const sum = Object.values(totals).reduce((a,b)=>a+b,0) || 1;
    const shares = Object.fromEntries(Object.entries(totals).map(([k,v]) => [k, Math.round(v / sum * 100)]));
    const targets = goalTargets();
    const status = {};
    Object.keys(totals).forEach(key => status[key] = shares[key] < targets[key][0] ? "missing" : shares[key] > targets[key][1] ? "high" : "balanced");
    const priority = Object.keys(totals).sort((a,b) => (targets[b][0]-shares[b]) - (targets[a][0]-shares[a]))[0];
    return { totals, shares, targets, status, priority };
  }

  function inferredProfile(session) {
    const load = Math.max(1, Number(session.trainingLoad || session.durationMinutes || 1));
    const profile = { lowAerobic:0, highAerobic:0, anaerobic:0 };
    const text = normalizeText(`${session.activityType || ""} ${session.title || ""}`);
    let focus = "lowAerobic";
    if (session.category === "Musculation" || /sprint|anaerob|hiit|interval|padel|tennis|crossfit/.test(text)) focus = "anaerobic";
    else if (/tempo|threshold|seuil|vo2|race|competition|fartlek/.test(text)) focus = "highAerobic";
    profile[focus] = load;
    return profile;
  }

  const focusLabels = { lowAerobic:"Faible aérobie", highAerobic:"Forte aérobie", anaerobic:"Anaérobie" };
  const focusHints = {
    lowAerobic:"Base d’endurance : footing facile, marche active, vélo ou natation faciles.",
    highAerobic:"Travail soutenu : tempo, seuil, intervalles longs ou VO₂ contrôlé.",
    anaerobic:"Puissance et intensité courte : sprints, intervalles brefs, padel soutenu et musculation."
  };

  function focusStatusLabel(status) {
    return status === "missing" ? "À renforcer" : status === "high" ? "Déjà élevé" : "Dans la cible";
  }

  function focusMarkup(snapshot, compact = false) {
    const p = snapshot.priority;
    const balanced = Object.values(snapshot.status).every(x => x === "balanced");
    return `<div class="v15-focus-head"><div><p class="eyebrow">FOCUS DE CHARGE · TOUTES ACTIVITÉS</p><h3>${balanced ? "Profil de charge équilibré" : `Priorité actuelle : ${focusLabels[p]}`}</h3></div><span>${compact ? "Coach" : "28 jours"}</span></div>
      <p class="v15-focus-lead">${balanced ? "Les trois filières sont dans leur plage cible pour ton objectif actuel." : focusHints[p]}</p>
      <div class="v15-focus-grid">${Object.keys(snapshot.shares).map(key => {
        const share = snapshot.shares[key], [min,max] = snapshot.targets[key], st = snapshot.status[key];
        return `<div class="v15-focus-item ${st}"><div class="v15-focus-title"><strong>${focusLabels[key]}</strong><span>${share}%</span></div><div class="v15-focus-track"><span style="width:${Math.max(2,share)}%"></span><i style="left:${min}%"></i><i style="left:${max}%"></i></div><small>${focusStatusLabel(st)} · cible ${min}–${max}%</small></div>`;
      }).join("")}</div>${compact ? "" : '<p class="focus-note">Calcul TrainSync pondéré par récence, charge d’entraînement, effets aérobie/anaérobie quand ils sont disponibles, durée et type de toutes les séances.</p>'}`;
  }

  function renderFocusCard() {
    const target = $("#loadFocusCard");
    if (!target) return;
    target.innerHTML = focusMarkup(loadSnapshot(), false);
  }

  function renderCoachFocus() {
    const target = $("#coachFocusSummary");
    if (!target) return;
    target.innerHTML = focusMarkup(loadSnapshot(), true);
  }

  const previousGoalHandler = null;
  document.addEventListener("change", event => {
    if (event.target?.id === "goalSelect") {
      setTimeout(() => { renderFocusCard(); renderCoachFocus(); }, 0);
    }
  });

  openSessionDetail = async function(id) {
    const session = state.sessions.find(item => String(item.id) === String(id));
    if (!session) return;
    ensureEnhancedUi();
    destroyMap();
    $("#detailTitle").textContent = session.title;
    const dialog = $("#sessionDetailDialog");
    dialog.showModal();
    detailState = { session, payload:null };
    renderActivityDetail(session, null);

    if (session.source !== "Garmin" || !settings.relayToken) return;
    const content = $("#sessionDetailContent");
    content.insertAdjacentHTML("beforeend", '<div class="v15-loading" id="v15Loading">Chargement de toutes les données Garmin / Intervals.icu…</div>');
    try {
      const payload = await apiRequest(`/activity/${encodeURIComponent(session.id)}`, {}, 45000);
      detailState = { session, payload };
      renderActivityDetail(session, payload);
    } catch (error) {
      $("#v15Loading")?.remove();
      content.insertAdjacentHTML("beforeend", `<div class="detail-warning"><strong>Données Garmin détaillées indisponibles</strong><span>${escapeHtml(error.message)}</span></div>`);
    }
  };

  function destroyMap() {
    if (mapInstance) { try { mapInstance.remove(); } catch {} mapInstance = null; }
  }

  function renderActivityDetail(session, payload) {
    const content = $("#sessionDetailContent");
    if (!content) return;
    destroyMap();
    const metrics = collectAllMetrics(session, payload);
    const pinned = metrics.filter(metric => favorites.has(metric.key));
    const normal = metrics.filter(metric => !favorites.has(metric.key));
    const route = extractRoute(payload?.map);
    const date = new Date(session.startedAt);
    const sport = activityMeta(session);

    content.innerHTML = `
      <div class="detail-hero"><div class="detail-sport-icon">${sport.icon}</div><div><p>${escapeHtml(date.toLocaleDateString("fr-FR", {weekday:"long",day:"numeric",month:"long",year:"numeric"}))}</p><span>${escapeHtml(session.source)}${session.deviceName ? ` · ${escapeHtml(session.deviceName)}` : ""}</span></div></div>
      ${pinned.length ? `<section class="pinned-stats"><div class="detail-section-title"><div><p class="eyebrow">ÉPINGLÉ</p><h3>Mes statistiques favorites</h3></div><span>♥ ${pinned.length}</span></div><div class="pinned-stat-grid">${pinned.map(metricCard).join("")}</div></section>` : ""}
      ${route.length > 1 ? '<section class="detail-section"><div class="detail-section-title"><div><p class="eyebrow">CARTE</p><h3>Tracé GPS</h3></div></div><div id="activityMapV15" class="activity-map"></div></section>' : ""}
      <section class="detail-section"><div class="detail-section-title"><div><p class="eyebrow">STATISTIQUES</p><h3>Toutes les données disponibles</h3></div><span>${metrics.length} métriques</span></div><div class="favorite-hint">Touchez le <strong>♥</strong> d’une statistique pour l’épingler en haut de toutes vos activités quand elle est disponible.</div><div class="all-stat-grid">${normal.map(metricCard).join("")}</div></section>
      ${session.source === "Hevy" ? renderExercises(session) : ""}
      ${payload?.garminAttribution ? '<p class="garmin-attribution">Données issues d’un appareil Garmin, synchronisées via Intervals.icu.</p>' : ""}`;

    content.querySelectorAll("[data-favorite-key]").forEach(button => button.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation(); toggleFavorite(button.dataset.favoriteKey);
    }));
    if (route.length > 1) setTimeout(() => drawMap(route), 40);
  }

  function metricCard(metric) {
    const liked = favorites.has(metric.key);
    return `<div class="fav-stat ${liked ? "is-favorite" : ""}"><button class="heart-button" data-favorite-key="${escapeHtml(metric.key)}" aria-label="${liked ? "Retirer des favoris" : "Ajouter aux favoris"}">${liked ? "♥" : "♡"}</button><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(String(metric.value))}</strong></div>`;
  }

  function renderExercises(session) {
    if (!Array.isArray(session.exercises) || !session.exercises.length) return "";
    return `<section class="exercise-section"><h3>Exercices et séries</h3>${session.exercises.map((exercise, i) => `<div class="exercise-card"><div class="exercise-heading"><span>${i+1}</span><div><strong>${escapeHtml(exercise.title || "Exercice")}</strong>${exercise.notes ? `<small>${escapeHtml(exercise.notes)}</small>` : ""}</div></div><div class="set-list">${(exercise.sets || []).map((set,j) => { const bits=[]; if(set.weightKg!=null)bits.push(`${set.weightKg} kg`); if(set.reps!=null)bits.push(`${set.reps} rep`); if(set.rpe!=null)bits.push(`RPE ${set.rpe}`); return `<div class="set-row"><span>${j+1}</span><strong>${escapeHtml(bits.join(" · ") || set.type || "Série")}</strong></div>`; }).join("")}</div></div>`).join("")}</section>`;
  }

  function collectAllMetrics(session, payload) {
    const d = payload?.detail || {};
    const result = [], labels = new Set();
    const add = (key,label,value) => {
      if (value == null || value === "" || value === "—") return;
      const labelKey = normalizeText(label); if (labels.has(labelKey)) return;
      labels.add(labelKey); result.push({ key, label, value });
    };
    add("duration","Durée",`${Number(session.durationMinutes)||0} min`);
    if (session.distanceKm) add("distance","Distance",`${Number(session.distanceKm).toFixed(2)} km`);
    if (session.paceMinKm) add("pace","Allure moyenne",formatPace(session.paceMinKm));
    add("hrAvg","FC moyenne",unit(firstNum(d.average_heartrate,d.avg_hr,session.averageHeartRate),"bpm"));
    add("hrMax","FC max",unit(firstNum(d.max_heartrate,d.max_hr,session.maxHeartRate),"bpm"));
    add("elevation","Dénivelé +",unit(firstNum(d.total_elevation_gain,d.elevation_gain,session.elevationGainM),"m"));
    add("calories","Calories",unit(firstNum(d.calories,session.calories),"kcal"));
    add("trainingLoad","Charge d'entraînement",firstNum(d.icu_training_load,d.training_load,d.tss,session.trainingLoad));
    add("intensity","Intensité",unit(firstNum(d.icu_intensity,d.intensity,session.intensity),"%"));
    add("rpe","RPE",slash(firstNum(d.icu_rpe,d.rpe,d.session_rpe,session.rpe),10));
    add("aerobicEffect","Effet aérobie",slash(firstNum(d.aerobic_training_effect,d.total_training_effect,d.aerobic_effect,session.aerobicEffect),5));
    add("anaerobicEffect","Effet anaérobie",slash(firstNum(d.anaerobic_training_effect,d.total_anaerobic_training_effect,d.anaerobic_effect,session.anaerobicEffect),5));
    add("cadenceAvg","Cadence moyenne",unit(firstNum(d.average_cadence,d.avg_cadence,session.averageCadence),"rpm"));
    add("cadenceMax","Cadence max",unit(firstNum(d.max_cadence,session.maxCadence),"rpm"));
    add("powerAvg","Puissance moyenne",unit(firstNum(d.average_watts,d.avg_watts,d.average_power,session.averagePower),"W"));
    add("powerMax","Puissance max",unit(firstNum(d.max_watts,d.max_power,session.maxPower),"W"));
    add("powerNorm","Puissance normalisée",unit(firstNum(d.icu_weighted_avg_watts,d.weighted_average_watts,d.normalized_power,session.normalizedPower),"W"));
    const avgSpeed=firstNum(d.average_speed,d.avg_speed,session.averageSpeed); if(avgSpeed!=null)add("speedAvg","Vitesse moyenne",`${(avgSpeed*3.6).toFixed(1)} km/h`);
    const maxSpeed=firstNum(d.max_speed,session.maxSpeed); if(maxSpeed!=null)add("speedMax","Vitesse max",`${(maxSpeed*3.6).toFixed(1)} km/h`);
    add("temperature","Température moyenne",unit(firstNum(d.average_temp,d.avg_temperature,d.temperature,session.temperature),"°C"));
    add("vo2max","VO₂ max",unit(firstNum(d.vo2max,d.vo2_max,d.VO2MaxGarmin),"ml/kg/min"));
    add("recovery","Temps de récupération",unit(firstNum(d.recovery_time,d.RecoveryTime),"min"));
    add("performance","Condition de performance",firstNum(d.performance_condition,d.PerformanceCondition));

    const raw = Array.isArray(payload?.rawMetrics) ? payload.rawMetrics : [];
    raw.forEach(item => {
      const label = item.label || humanize(item.key);
      let value = item.value;
      const low = normalizeText(label + " " + item.key);
      if ((low.includes("transpiration") || low.includes("sweat") || low.includes("xxx178") || low.includes("f 178")) && Number.isFinite(Number(value))) value = `${Math.round(Number(value))} ml`;
      else if (typeof value === "boolean") value = value ? "Oui" : "Non";
      else if (typeof value === "number" && !Number.isInteger(value)) value = Number(value).toFixed(2);
      add(`raw:${item.key}`, label, value);
    });
    return result;
  }

  function firstNum(...values) { for (const value of values) { const n=Number(value); if(Number.isFinite(n)) return n; } return null; }
  function unit(value,u){ return value==null ? null : `${Number(value).toFixed(Number(value)%1 ? 1 : 0)} ${u}`; }
  function slash(value,max){ return value==null ? null : `${Number(value).toFixed(1)}/${max}`; }
  function humanize(key){ const leaf=String(key||"").split(".").at(-1).replace(/^icu_/,"").replace(/_/g," "); return leaf.charAt(0).toUpperCase()+leaf.slice(1); }

  function extractRoute(payload) {
    if (!payload) return [];
    const geo = payload.type === "Feature" ? payload.geometry : payload;
    if (geo?.type === "LineString" && Array.isArray(geo.coordinates)) return geo.coordinates.map(p => point(p,true)).filter(Boolean);
    if (geo?.type === "MultiLineString" && Array.isArray(geo.coordinates)) return geo.coordinates.flat().map(p => point(p,true)).filter(Boolean);
    const candidates = Array.isArray(payload) ? [payload] : [payload.points,payload.latlngs,payload.latLngs,payload.coordinates,payload.route,payload.data,payload.path];
    for (const c of candidates) { if(!Array.isArray(c))continue; const pts=c.flat(2).map(v=>point(v,false)).filter(Boolean); if(pts.length>1)return pts; }
    return [];
  }
  function point(v, geo) { if(Array.isArray(v)&&v.length>=2){const a=Number(v[0]),b=Number(v[1]); if(geo&&valid(b,a))return[b,a]; if(valid(a,b))return[a,b]; if(valid(b,a))return[b,a];} if(v&&typeof v==="object"){const lat=Number(v.lat??v.latitude??v.y),lon=Number(v.lng??v.lon??v.long??v.longitude??v.x); if(valid(lat,lon))return[lat,lon];} return null; }
  function valid(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;}
  function drawMap(points) { const el=$("#activityMapV15"); if(!el||typeof L==="undefined")return; mapInstance=L.map(el,{zoomControl:true}); L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(mapInstance); const line=L.polyline(points,{weight:5,opacity:.95}).addTo(mapInstance); L.circleMarker(points[0],{radius:6,weight:2,fillOpacity:1}).addTo(mapInstance).bindTooltip("Départ"); L.circleMarker(points.at(-1),{radius:6,weight:2,fillOpacity:1}).addTo(mapInstance).bindTooltip("Arrivée"); mapInstance.fitBounds(line.getBounds(),{padding:[22,22]}); setTimeout(()=>mapInstance?.invalidateSize(),100); }

  renderSuggestions = function() {
    const container = $("#suggestionsList"); if(!container)return;
    const suggestions = Array.isArray(state.suggestions) ? state.suggestions : [];
    container.innerHTML = suggestions.map((suggestion,index) => {
      const cls=suggestion.kind==="Cardio"?"cardio":suggestion.kind==="Récupération"?"recovery":"strength";
      const icon=cls==="cardio"?"🏃":cls==="recovery"?"🧘":"🏋️";
      const publish = suggestion.destination === "hevy"
        ? `<button class="publish-button hevy-publish" data-publish-hevy="${index}">Créer cette routine dans Hevy</button>`
        : suggestion.destination === "garmin"
          ? `<div class="garmin-publish-row"><input class="publish-date" id="publishDate-${index}" type="date" value="${escapeHtml(suggestion.scheduledFor || tomorrow())}"><button class="publish-button garmin-publish" data-publish-garmin="${index}">Envoyer à Garmin</button></div><small class="publish-note">Création via Intervals.icu → Garmin Connect → montre.</small>`
          : "";
      return `<article class="suggestion-card ${cls}"><div class="suggestion-head"><div class="suggestion-symbol">${icon}</div><div><p class="kind">${escapeHtml(suggestion.kind).toUpperCase()}</p><h3>${escapeHtml(suggestion.title)}</h3></div></div><p>${escapeHtml(suggestion.rationale)}</p><div class="suggestion-stats"><span>◷ ${Number(suggestion.durationMinutes)||0} min</span><span>${escapeHtml(suggestion.intensity||"")}</span></div><details><summary>Voir la séance</summary><ol class="steps">${(suggestion.steps||[]).map(step=>`<li>${escapeHtml(step)}</li>`).join("")}</ol></details>${publish}</article>`;
    }).join("");
    container.querySelectorAll("[data-publish-hevy]").forEach(button => button.addEventListener("click", () => publishHevy(Number(button.dataset.publishHevy), button)));
    container.querySelectorAll("[data-publish-garmin]").forEach(button => button.addEventListener("click", () => publishGarmin(Number(button.dataset.publishGarmin), button)));
  };

  async function publishHevy(index, button) {
    const suggestion=state.suggestions[index]; if(!suggestion)return;
    const old=button.textContent; button.disabled=true; button.textContent="Création dans Hevy…";
    try { const data=await apiRequest("/publish/hevy",{method:"POST",body:JSON.stringify({suggestion})},30000); button.textContent="✓ Routine créée"; showStatus(data.message || "Routine créée dans Hevy."); }
    catch(error){ button.disabled=false; button.textContent=old; showStatus(error.message,true); }
  }

  async function publishGarmin(index, button) {
    const suggestion=state.suggestions[index]; if(!suggestion)return;
    const date=$("#publishDate-"+index)?.value || tomorrow(); const old=button.textContent; button.disabled=true; button.textContent="Envoi…";
    try { const data=await apiRequest("/publish/garmin",{method:"POST",body:JSON.stringify({suggestion,date})},30000); button.textContent="✓ Planifiée"; showStatus(data.message || "Séance planifiée pour Garmin."); }
    catch(error){ button.disabled=false; button.textContent=old; showStatus(error.message,true); }
  }

  const oldGenerate = generateSuggestions;
  generateSuggestions = async function() {
    const button=$("#generateButton"); if(!button)return;
    button.disabled=true; button.textContent="Coach en réflexion…";
    try {
      const data=await apiRequest("/recommend",{method:"POST",body:JSON.stringify({goal:$("#goalSelect")?.selectedOptions?.[0]?.textContent||"Équilibre",sessions:state.sessions.filter(x=>!String(x.id).startsWith("demo-")).slice(0,60)})},55000);
      if(!Array.isArray(data.suggestions)||!data.suggestions.length)throw new Error("Le coach n’a produit aucune séance.");
      state.suggestions=data.suggestions; persistState(); renderSuggestions();
      if(data.degraded) showStatus(`Coach disponible en mode de secours : ${data.warning || "réponse IA indisponible"}.`, false); else showStatus("Programme personnalisé généré. Tu peux maintenant l’envoyer vers Hevy ou Garmin.");
    } catch(error) { showStatus(error.message,true); }
    finally { button.disabled=false; button.textContent="✦ Générer mes séances"; }
  };

  function tomorrow(){const d=new Date();d.setDate(d.getDate()+1);return d.toISOString().slice(0,10);}

  document.addEventListener("DOMContentLoaded", () => {
    ensureCoachFocus(); renderCoachFocus(); renderFocusCard();
  });
})();
