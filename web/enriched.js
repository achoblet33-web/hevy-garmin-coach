(() => {
  const UI_VERSION = "1.4.0";
  let activeMap = null;

  const baseRenderAll = renderAll;
  const baseRenderAnalysis = renderAnalysis;

  ensureEnhancedUi = function() {
    if (!document.querySelector('link[href="./v13.css"]')) {
      const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./v13.css"; document.head.appendChild(link);
    }
    if (!$("#sessionDetailDialog")) {
      document.body.insertAdjacentHTML("beforeend", `
        <dialog id="sessionDetailDialog" class="session-detail-dialog">
          <div class="detail-shell">
            <div class="detail-toolbar"><div><p class="eyebrow">DÉTAIL DE LA SÉANCE</p><h2 id="detailTitle">Séance</h2></div><button class="icon-button" id="closeSessionDetail" aria-label="Fermer">×</button></div>
            <div id="sessionDetailContent"></div>
          </div>
        </dialog>`);
      $("#closeSessionDetail")?.addEventListener("click", closeDetail);
      $("#sessionDetailDialog")?.addEventListener("click", event => { if (event.target === $("#sessionDetailDialog")) closeDetail(); });
    }
  };

  renderAll = function() {
    baseRenderAll();
    const version = $("#versionLabel");
    if (version) version.textContent = `TrainSync ${UI_VERSION} · synchronisation Hevy + Garmin via Cloudflare`;
  };

  renderAnalysis = function() {
    baseRenderAnalysis();
    renderLoadFocus();
    $$(".analysis-detail-panel").forEach(node => node.remove());
  };

  function closeDetail() {
    if (activeMap) { try { activeMap.remove(); } catch {} activeMap = null; }
    $("#sessionDetailDialog")?.close();
  }

  function renderLoadFocus() {
    const target = $("#loadFocusCard");
    if (!target) return;
    const cutoff = Date.now() - 28 * 86400000;
    const sessions = state.sessions.filter(s => !String(s.id).startsWith("demo-") && new Date(s.startedAt).getTime() >= cutoff);
    if (!sessions.length) {
      target.innerHTML = '<p class="muted">Synchronise tes séances pour calculer ton équilibre de charge.</p>';
      return;
    }
    const loads = { lowAerobic: 0, highAerobic: 0, anaerobic: 0 };
    sessions.forEach(s => {
      const focus = s.loadFocus || inferFocus(s);
      const weight = Math.max(1, Number(s.loadFocusWeight || s.trainingLoad || s.durationMinutes || 1));
      if (loads[focus] != null) loads[focus] += weight;
    });
    const total = Object.values(loads).reduce((a,b)=>a+b,0) || 1;
    const shares = Object.fromEntries(Object.entries(loads).map(([k,v]) => [k, v / total]));
    const targets = { lowAerobic: .45, highAerobic: .35, anaerobic: .20 };
    const missing = Object.keys(targets).sort((a,b) => (targets[b]-shares[b]) - (targets[a]-shares[a]))[0];
    const labels = { lowAerobic: "Faible aérobie", highAerobic: "Forte aérobie", anaerobic: "Anaérobie" };
    const explanations = {
      lowAerobic: "Ajoute surtout du travail facile et durable : endurance fondamentale, marche active, vélo ou natation facile.",
      highAerobic: "Ajoute une séance soutenue contrôlée : tempo, seuil ou travail proche VO₂ max selon ton état de fatigue.",
      anaerobic: "Ajoute une petite dose d'intensité courte : sprints, intervalles brefs, padel soutenu ou travail de puissance en musculation."
    };
    target.innerHTML = `
      <div class="focus-head"><div><p class="eyebrow">FOCUS DE CHARGE · 28 JOURS</p><h3>À renforcer : ${labels[missing]}</h3></div><span class="focus-badge">Toutes activités</span></div>
      <p class="focus-advice">${explanations[missing]}</p>
      <div class="focus-bars">${Object.keys(loads).map(key => `
        <div class="focus-row"><div><strong>${labels[key]}</strong><span>${Math.round(shares[key]*100)}%</span></div><div class="focus-track"><span style="width:${Math.max(2,shares[key]*100)}%"></span><i style="left:${targets[key]*100}%"></i></div></div>`).join("")}</div>
      <p class="focus-note">Estimation TrainSync basée sur la charge, la durée et le type de toutes tes séances synchronisées. Les effets Garmin sont utilisés quand ils sont disponibles.</p>`;
  }

  function inferFocus(s) {
    if (s.category === "Musculation") return "anaerobic";
    const t = normalizeText(`${s.activityType || ""} ${s.title || ""}`);
    if (/sprint|anaerob|hiit|interval|padel|tennis|crossfit/.test(t)) return "anaerobic";
    if (/tempo|threshold|seuil|vo2|race|competition|fartlek/.test(t)) return "highAerobic";
    return "lowAerobic";
  }

  openSessionDetail = async function(id) {
    const session = state.sessions.find(item => String(item.id) === String(id));
    if (!session) return;
    ensureEnhancedUi();
    if (activeMap) { try { activeMap.remove(); } catch {} activeMap = null; }
    $("#detailTitle").textContent = session.title;
    const content = $("#sessionDetailContent");
    content.innerHTML = buildSessionDetail(session);
    const dialog = $("#sessionDetailDialog");
    dialog.showModal();

    if (session.source !== "Garmin" || !settings.relayToken) return;
    content.insertAdjacentHTML("beforeend", `
      <section class="garmin-enriched" id="garminEnriched">
        <div class="enriched-loading"><span class="loading-dot"></span><div><strong>Chargement des données Garmin complètes…</strong><small>Carte, tracé GPS, intervalles, zones et métriques détaillées.</small></div></div>
      </section>`);
    try {
      const payload = await apiRequest(`/activity/${encodeURIComponent(session.id)}`, {}, 40000);
      if (!$("#sessionDetailDialog")?.open) return;
      renderGarminDetail(payload, session);
    } catch (error) {
      const box = $("#garminEnriched");
      if (box) box.innerHTML = `<div class="detail-warning"><strong>Données détaillées indisponibles</strong><span>${escapeHtml(error.message)}</span></div>`;
    }
  };

  function renderGarminDetail(payload, session) {
    const box = $("#garminEnriched");
    if (!box) return;
    const d = payload.detail || {};
    const route = extractRoute(payload.map);
    const metrics = collectMetrics(d, session);
    const intervals = Array.isArray(d.icu_intervals) ? d.icu_intervals : (Array.isArray(d.intervals) ? d.intervals : []);
    const streams = Array.isArray(d.stream_types) ? d.stream_types : [];
    const description = pick(d, "description", "notes");
    const device = pick(d, "device_name", "device", "Device");

    box.innerHTML = `
      ${route.length > 1 ? `<section class="detail-section"><div class="detail-section-title"><div><p class="eyebrow">CARTE</p><h3>Tracé de l'activité</h3></div><span>${route.length.toLocaleString("fr-FR")} points GPS</span></div><div id="activityMap" class="activity-map"></div></section>` : ""}
      ${(description || device) ? `<section class="detail-info-strip">${device ? `<span>⌚ ${escapeHtml(String(device))}</span>` : ""}${description ? `<p>${escapeHtml(String(description))}</p>` : ""}</section>` : ""}
      <section class="detail-section"><div class="detail-section-title"><div><p class="eyebrow">STATISTIQUES</p><h3>Données complètes</h3></div><span>${metrics.length} métriques</span></div><div class="full-stat-grid">${metrics.map(m => `<div class="full-stat"><span>${escapeHtml(m.label)}</span><strong>${escapeHtml(m.value)}</strong></div>`).join("")}</div></section>
      ${renderZones(d)}
      ${renderIntervals(intervals)}
      ${streams.length ? `<section class="detail-section"><div class="detail-section-title"><div><p class="eyebrow">CAPTEURS</p><h3>Données enregistrées</h3></div></div><div class="stream-tags">${streams.map(x=>`<span>${escapeHtml(String(x))}</span>`).join("")}</div></section>` : ""}`;

    if (route.length > 1) setTimeout(() => drawMap(route), 40);
  }

  function drawMap(points) {
    const el = $("#activityMap");
    if (!el || typeof L === "undefined") return;
    if (activeMap) { try { activeMap.remove(); } catch {} }
    activeMap = L.map(el, { zoomControl: true, attributionControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(activeMap);
    const line = L.polyline(points, { weight: 5, opacity: .95 }).addTo(activeMap);
    L.circleMarker(points[0], { radius: 6, weight: 2, fillOpacity: 1 }).addTo(activeMap).bindTooltip("Départ");
    L.circleMarker(points.at(-1), { radius: 6, weight: 2, fillOpacity: 1 }).addTo(activeMap).bindTooltip("Arrivée");
    activeMap.fitBounds(line.getBounds(), { padding: [22,22] });
    setTimeout(() => activeMap?.invalidateSize(), 100);
  }

  function extractRoute(payload) {
    if (!payload) return [];
    const geo = payload.type === "Feature" ? payload.geometry : payload;
    if (geo?.type === "LineString" && Array.isArray(geo.coordinates)) return geo.coordinates.map(p => pairPoint(p, true)).filter(Boolean);
    if (geo?.type === "MultiLineString" && Array.isArray(geo.coordinates)) return geo.coordinates.flat().map(p => pairPoint(p, true)).filter(Boolean);
    const candidates = Array.isArray(payload) ? [payload] : [payload.points, payload.latlngs, payload.latLngs, payload.coordinates, payload.route, payload.data, payload.map, payload.path];
    for (const c of candidates) {
      if (!Array.isArray(c) || !c.length) continue;
      const direct = c.map(objectPoint).filter(Boolean); if (direct.length > 1) return direct;
      const flat = c.flat(2).map(objectPoint).filter(Boolean); if (flat.length > 1) return flat;
    }
    return [];
  }
  function objectPoint(v) {
    if (Array.isArray(v)) return pairPoint(v, false);
    if (!v || typeof v !== "object") return null;
    const lat = numeric(v.lat ?? v.latitude ?? v.y), lon = numeric(v.lng ?? v.lon ?? v.long ?? v.longitude ?? v.x);
    return validPoint(lat,lon) ? [lat,lon] : null;
  }
  function pairPoint(v, geo) {
    if (!Array.isArray(v) || v.length < 2) return null;
    const a=Number(v[0]), b=Number(v[1]); if (!Number.isFinite(a)||!Number.isFinite(b)) return null;
    if (geo) return validPoint(b,a)?[b,a]:null;
    return validPoint(a,b)?[a,b]:validPoint(b,a)?[b,a]:null;
  }
  function validPoint(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;}

  function collectMetrics(d, session) {
    const list = [], seen = new Set();
    const add = (label, value, unit="", digits=null) => {
      if (value == null || value === "" || (typeof value === "number" && !Number.isFinite(value))) return;
      let output = value;
      const n = Number(value); if (digits != null && Number.isFinite(n)) output = n.toFixed(digits);
      const key = normalizeText(label); if (seen.has(key)) return; seen.add(key); list.push({ label, value: `${output}${unit ? ` ${unit}` : ""}` });
    };
    add("Durée", session.durationMinutes, "min"); add("Distance", session.distanceKm, "km", 2); if (session.paceMinKm) add("Allure moyenne", formatPace(session.paceMinKm));
    add("FC moyenne", pickNum(d,"average_heartrate","avg_hr") ?? session.averageHeartRate, "bpm"); add("FC max", pickNum(d,"max_heartrate","max_hr") ?? session.maxHeartRate, "bpm");
    add("Dénivelé +", pickNum(d,"total_elevation_gain","elevation_gain") ?? session.elevationGainM, "m"); add("Calories", pickNum(d,"calories") ?? session.calories, "kcal");
    add("Charge d'entraînement", pickNum(d,"icu_training_load","training_load","tss") ?? session.trainingLoad); add("Intensité", pickNum(d,"icu_intensity","intensity"), "%", 0); add("RPE", pickNum(d,"icu_rpe","rpe","session_rpe") ?? session.rpe, "/10", 1);
    add("Cadence moyenne", pickNum(d,"average_cadence","avg_cadence"), "rpm"); add("Cadence max", pickNum(d,"max_cadence"), "rpm");
    add("Puissance moyenne", pickNum(d,"average_watts","avg_watts","average_power"), "W"); add("Puissance max", pickNum(d,"max_watts","max_power"), "W"); add("Puissance normalisée", pickNum(d,"icu_weighted_avg_watts","weighted_average_watts","normalized_power"), "W");
    const avgSpeed=pickNum(d,"average_speed","avg_speed"), maxSpeed=pickNum(d,"max_speed"); if(avgSpeed!=null)add("Vitesse moyenne",avgSpeed*3.6,"km/h",1); if(maxSpeed!=null)add("Vitesse max",maxSpeed*3.6,"km/h",1);
    add("Altitude min",pickNum(d,"min_altitude"),"m"); add("Altitude max",pickNum(d,"max_altitude"),"m"); add("Pente moyenne",pickNum(d,"average_gradient"),"%",1);
    add("Effet aérobie Garmin",pickNum(d,"AerobicEffect","Aerobic Effect","aerobic_effect","total_training_effect"),"/5",1); add("Effet anaérobie Garmin",pickNum(d,"AnaerobicEffect","Anaerobic Effect","anaerobic_effect","total_anaerobic_training_effect"),"/5",1);
    add("VO₂ max Garmin",pickNum(d,"VO2MaxGarmin","VO2 Max","vo2max","vo2_max"),"ml/kg/min",1); add("Temps de récupération",pickNum(d,"RecoveryTime","Recovery Time","recovery_time"),"min",0); add("Condition de performance",pickNum(d,"PerformanceCondition","Performance Condition","performance_condition"));
    add("Température",pickNum(d,"average_temp","avg_temperature","temperature"),"°C",1); add("Longueur de foulée",pickNum(d,"average_stride_length"),"m",2); add("Oscillation verticale",pickNum(d,"average_vertical_oscillation"),"mm",1); add("Contact au sol",pickNum(d,"average_ground_contact_time"),"ms",0); add("Ratio vertical",pickNum(d,"average_vertical_ratio"),"%",1);
    add("SWOLF moyen",pickNum(d,"average_swolf","swolf")); add("Fréquence de mouvements",pickNum(d,"average_stroke_rate","stroke_rate"),"/min"); add("Profondeur moyenne",pickNum(d,"avg_depth","average_depth"),"m",1); add("Profondeur max",pickNum(d,"max_depth"),"m",1); add("Température eau",pickNum(d,"water_temperature"),"°C",1);

    const interesting = /(heart|heartrate|hr_|watts|power|cadence|speed|pace|elevation|altitude|gradient|calor|load|intensity|rpe|effect|vo2|recovery|temperature|temp|stride|ground|vertical|swolf|stroke|depth|respir|training|trimp|decoupl)/i;
    Object.entries(d).forEach(([key,value]) => {
      if (!interesting.test(key) || value == null || typeof value === "object" || typeof value === "boolean") return;
      if (String(value).length > 28) return;
      add(humanize(key), value);
    });
    return list.slice(0,60);
  }

  function renderZones(d) {
    const sets = [
      ["FC", pickArray(d,"icu_hr_zone_times","hr_zone_times","hrZoneTimes")],
      ["Puissance", pickArray(d,"icu_power_zone_times","power_zone_times","zone_times","zoneTimes")],
      ["Allure", pickArray(d,"icu_pace_zone_times","pace_zone_times","paceZoneTimes")]
    ].filter(([,values]) => values.length);
    if (!sets.length) return "";
    return `<section class="detail-section"><div class="detail-section-title"><div><p class="eyebrow">ZONES</p><h3>Temps dans les zones</h3></div></div>${sets.map(([name,values])=>{
      const total=values.reduce((a,b)=>a+(Number(b)||0),0)||1;
      return `<div class="zone-block"><strong>${name}</strong>${values.map((v,i)=>`<div class="zone-row"><span>Z${i+1}</span><div><i style="width:${Math.max(2,(Number(v)||0)/total*100)}%"></i></div><em>${formatDuration(Number(v)||0)}</em></div>`).join("")}</div>`;
    }).join("")}</section>`;
  }

  function renderIntervals(items) {
    if (!items.length) return "";
    return `<section class="detail-section"><div class="detail-section-title"><div><p class="eyebrow">INTERVALLES / TOURS</p><h3>Découpage de l'activité</h3></div><span>${items.length}</span></div><div class="interval-list">${items.slice(0,50).map((x,i)=>{
      const dist=pickNum(x,"distance"), sec=pickNum(x,"moving_time","elapsed_time"), hr=pickNum(x,"average_heartrate"), watts=pickNum(x,"average_watts"), cad=pickNum(x,"average_cadence");
      const parts=[]; if(dist!=null)parts.push(`${(dist/1000).toFixed(2)} km`); if(sec!=null)parts.push(formatDuration(sec)); if(hr!=null)parts.push(`${Math.round(hr)} bpm`); if(watts!=null)parts.push(`${Math.round(watts)} W`); if(cad!=null)parts.push(`${Math.round(cad)} rpm`);
      return `<div class="interval-row"><span>${i+1}</span><div><strong>${escapeHtml(String(x.type||x.label||x.group_id||"Intervalle"))}</strong><small>${escapeHtml(parts.join(" · "))}</small></div></div>`;
    }).join("")}</div></section>`;
  }

  generateSuggestions = async function() {
    const button = $("#generateButton"); if (!button) return;
    button.disabled = true; button.textContent = "Analyse de tes données…";
    try {
      if (!settings.relayToken) throw new Error("Connecte TrainSync au Worker dans Réglages avant d’utiliser le coach.");
      const sessions = state.sessions.filter(x => !String(x.id).startsWith("demo-")).slice(0,60).map(compactSession);
      const data = await apiRequest("/recommend", { method:"POST", body:JSON.stringify({ goal: $("#goalSelect")?.selectedOptions?.[0]?.textContent || "Équilibre", sessions }) }, 110000);
      if (!Array.isArray(data.suggestions) || !data.suggestions.length) throw new Error("Le coach a répondu sans séance exploitable.");
      state.suggestions = data.suggestions; persistState(); renderSuggestions();
      showStatus(data.degraded ? "Plan généré en mode secours : le service IA n'a pas répondu assez vite, mais TrainSync a utilisé ton historique." : "Programme personnalisé généré à partir de ton historique complet.", !!data.degraded);
    } catch (error) { showStatus(error.message, true); }
    finally { button.disabled=false; button.textContent="✦ Générer mes séances"; }
  };

  function compactSession(s) {
    return { id:s.id,source:s.source,category:s.category,title:s.title,activityType:s.activityType,startedAt:s.startedAt,durationMinutes:s.durationMinutes,distanceKm:s.distanceKm,paceMinKm:s.paceMinKm,averageHeartRate:s.averageHeartRate,maxHeartRate:s.maxHeartRate,elevationGainM:s.elevationGainM,trainingLoad:s.trainingLoad,rpe:s.rpe,loadFocus:s.loadFocus,loadFocusWeight:s.loadFocusWeight,exercises:Array.isArray(s.exercises)?s.exercises.slice(0,12).map(e=>({title:e.title,exerciseTemplateId:e.exerciseTemplateId,sets:(e.sets||[]).slice(0,6).map(x=>({type:x.type,weightKg:x.weightKg,reps:x.reps,rpe:x.rpe}))})):undefined };
  }

  function fieldMap(o){const m=new Map();if(o&&typeof o==="object")Object.entries(o).forEach(([k,v])=>m.set(normalizeText(k).replace(/[^a-z0-9]/g,""),v));return m;}
  function pick(o,...keys){const m=fieldMap(o);for(const k of keys){const v=m.get(normalizeText(k).replace(/[^a-z0-9]/g,""));if(v!=null&&v!=="")return v;}return null;}
  function pickNum(o,...keys){return numeric(pick(o,...keys));}
  function pickArray(o,...keys){const v=pick(o,...keys);return Array.isArray(v)?v:[];}
  function numeric(v){const n=Number(v);return Number.isFinite(n)?n:null;}
  function humanize(key){return String(key).replace(/[_-]+/g," ").replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^./,c=>c.toUpperCase());}
  function formatDuration(seconds){const s=Math.max(0,Math.round(Number(seconds)||0)), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;return h?`${h}h ${String(m).padStart(2,"0")}`:m?`${m}:${String(sec).padStart(2,"0")}`:`${sec}s`;}
})();
