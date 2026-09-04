(() => {
  const UI_VERSION = "1.9.0";
  let recommendation = null;
  let selectedType = null;
  let strengthOptions = [];
  let selectedStrengthFocus = null;
  let currentPlan = null;
  let analyzing = false;

  function allSessions() {
    return state.sessions
      .filter(s => !String(s.id || "").startsWith("demo-"))
      .sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt))
      .slice(0, 320);
  }

  function hevySessions() {
    return allSessions().filter(s => s.source === "Hevy").slice(0, 300);
  }

  function goalLabel() {
    return $("#goalSelect")?.selectedOptions?.[0]?.textContent || "Équilibre";
  }

  function setupUnifiedCoach() {
    const view = $("#coachView");
    const intro = view?.querySelector(".coach-intro");
    if (!view || !intro || $("#unifiedCoachFlow")) return;

    $("#generateButton")?.setAttribute("hidden", "");
    $("#suggestionsList")?.setAttribute("hidden", "");

    const flow = document.createElement("div");
    flow.id = "unifiedCoachFlow";
    flow.className = "unified-coach-flow";
    flow.innerHTML = `
      <article id="coachDecisionCard" class="panel coach-decision-card">
        <div class="coach-step-head">
          <span class="coach-step-number">1</span>
          <div><p class="eyebrow">DÉCISION DU COACH</p><h3>Qu’est-ce qu’on fait aujourd’hui ?</h3></div>
          <button type="button" class="coach-refresh" id="refreshCoachDecision">↻</button>
        </div>
        <div id="coachDecisionBody" class="coach-decision-body"><div class="coach-loading">Analyse de ta charge et de tes dernières séances…</div></div>
      </article>
      <article id="coachBuildCard" class="panel coach-build-card" hidden></article>
      <article id="coachPreviewCard" class="panel coach-preview-card" hidden></article>`;

    const focus = $("#coachFocusSummary");
    if (focus) focus.insertAdjacentElement("beforebegin", flow);
    else intro.insertAdjacentElement("afterend", flow);

    $("#coachFocusSummary")?.setAttribute("hidden", "");
    setTimeout(() => $("#strengthPlanner")?.setAttribute("hidden", ""), 400);

    $("#refreshCoachDecision")?.addEventListener("click", analyzeNextSession);
    analyzeNextSession();
  }

  async function analyzeNextSession() {
    if (analyzing) return;
    const body = $("#coachDecisionBody");
    if (!body) return;
    if (!settings.relayToken) {
      body.innerHTML = '<div class="coach-warning">Connecte d’abord TrainSync à ton Worker dans Réglages.</div>';
      return;
    }
    analyzing = true;
    recommendation = null;
    selectedType = null;
    currentPlan = null;
    resetBuildAndPreview();
    body.innerHTML = '<div class="coach-loading">Analyse de ta charge, de ton objectif et de la récupération récente…</div>';
    try {
      const data = await apiRequest("/coach/next-session", {
        method: "POST",
        body: JSON.stringify({ goal: goalLabel(), sessions: allSessions() })
      }, 35000);
      recommendation = data.recommendation;
      selectedType = recommendation?.type || "cardio";
      renderDecision();
    } catch (error) {
      body.innerHTML = `<div class="coach-warning"><strong>Analyse impossible</strong><span>${escapeHtml(error.message)}</span></div>`;
    } finally {
      analyzing = false;
    }
  }

  function renderDecision() {
    const body = $("#coachDecisionBody");
    if (!body || !recommendation) return;
    const isStrength = recommendation.type === "strength";
    const load = recommendation.loadSummary || {};
    const shares = load.shares || {};
    const focus = recommendation.loadFocus;
    const limited = recommendation.dataQuality?.limitedCardioHistory;
    body.innerHTML = `
      <div class="coach-recommendation-hero ${isStrength ? "strength" : "cardio"}">
        <div class="coach-recommendation-icon">${isStrength ? "🏋️" : "🏃"}</div>
        <div><span>Recommandation · confiance ${Number(recommendation.confidence || 0)}%</span><strong>${escapeHtml(recommendation.headline || "")}</strong></div>
      </div>
      <div class="coach-load-mini">
        ${miniLoad("Faible aérobie", shares.lowAerobic, focus === "lowAerobic")}
        ${miniLoad("Forte aérobie", shares.highAerobic, focus === "highAerobic")}
        ${miniLoad("Anaérobie", shares.anaerobic, focus === "anaerobic")}
      </div>
      <div class="coach-reasons">${(recommendation.reasons || []).map(reason => `<p>• ${escapeHtml(reason)}</p>`).join("")}</div>
      ${limited ? '<div class="coach-data-note">Historique Garmin encore limité : la recommandation cardio est volontairement prudente jusqu’à l’import complet Intervals.icu.</div>' : ""}
      <p class="coach-choice-label">Tu peux suivre le coach ou forcer ton choix :</p>
      <div class="coach-type-grid">
        <button type="button" class="coach-type-choice ${selectedType === "strength" ? "is-selected" : ""}" data-coach-type="strength"><span>🏋️</span><strong>Musculation</strong><small>${recommendation.type === "strength" ? "Recommandé" : "Forcer ce choix"}</small></button>
        <button type="button" class="coach-type-choice ${selectedType === "cardio" ? "is-selected" : ""}" data-coach-type="cardio"><span>🏃</span><strong>Cardio</strong><small>${recommendation.type === "cardio" ? "Recommandé" : "Forcer ce choix"}</small></button>
      </div>
      <button type="button" class="primary-button full" id="confirmCoachType">Valider ${selectedType === "strength" ? "la musculation" : "le cardio"}</button>`;

    body.querySelectorAll("[data-coach-type]").forEach(button => button.addEventListener("click", () => {
      selectedType = button.dataset.coachType;
      body.querySelectorAll("[data-coach-type]").forEach(card => card.classList.toggle("is-selected", card.dataset.coachType === selectedType));
      const confirm = $("#confirmCoachType");
      if (confirm) confirm.textContent = `Valider ${selectedType === "strength" ? "la musculation" : "le cardio"}`;
    }));
    $("#confirmCoachType")?.addEventListener("click", confirmType);
  }

  function miniLoad(label, share, active) {
    const pct = Math.round(Math.max(0, Math.min(1, Number(share || 0))) * 100);
    return `<div class="coach-load-mini-item ${active ? "is-priority" : ""}"><div><span>${escapeHtml(label)}</span><strong>${pct}%</strong></div><i><b style="width:${pct}%"></b></i></div>`;
  }

  function confirmType() {
    currentPlan = null;
    selectedStrengthFocus = null;
    strengthOptions = [];
    const preview = $("#coachPreviewCard");
    if (preview) { preview.hidden = true; preview.innerHTML = ""; }
    if (selectedType === "strength") renderStrengthBuilder();
    else renderCardioBuilder();
    $("#coachBuildCard")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderStrengthBuilder() {
    const card = $("#coachBuildCard");
    if (!card) return;
    card.hidden = false;
    card.innerHTML = `
      <div class="coach-step-head"><span class="coach-step-number">2</span><div><p class="eyebrow">MUSCULATION</p><h3>Définis le cadre de la séance</h3></div><span class="coach-destination">→ Hevy</span></div>
      <label class="field-label" for="unifiedStrengthDuration">Durée disponible</label>
      <select id="unifiedStrengthDuration" class="coach-select"><option value="30">30 min</option><option value="45">45 min</option><option value="60" selected>60 min</option><option value="75">75 min</option><option value="90">90 min</option></select>
      <button type="button" class="secondary-button full" id="loadUnifiedStrengthOptions">Voir ce que le coach propose de travailler</button>
      <div id="unifiedStrengthOptions" class="strength-focus-options"></div>
      <div id="unifiedStrengthAdapt" hidden>
        <label class="field-label" for="unifiedStrengthCustom">Ton adaptation éventuelle</label>
        <textarea id="unifiedStrengthCustom" rows="2" placeholder="Ex. plus de dos, pas de jambes, insiste sur les bras"></textarea>
        <button type="button" class="primary-button full" id="buildUnifiedStrengthPlan">Construire la séance détaillée</button>
      </div>`;
    $("#loadUnifiedStrengthOptions")?.addEventListener("click", loadStrengthOptions);
    $("#buildUnifiedStrengthPlan")?.addEventListener("click", buildStrengthPlan);
  }

  async function loadStrengthOptions() {
    const button = $("#loadUnifiedStrengthOptions");
    const target = $("#unifiedStrengthOptions");
    const duration = Number($("#unifiedStrengthDuration")?.value || 60);
    button.disabled = true;
    button.textContent = "Analyse musculaire…";
    try {
      const data = await apiRequest("/coach/strength-options", {
        method: "POST",
        body: JSON.stringify({ durationMinutes: duration, goal: goalLabel(), sessions: hevySessions() })
      }, 45000);
      strengthOptions = Array.isArray(data.options) ? data.options : [];
      if (!strengthOptions.length) throw new Error("Aucune orientation musculaire n’a été trouvée.");
      target.innerHTML = `<p class="coach-substep">Choisis ou adapte :</p>${strengthOptions.map(option => `
        <button type="button" class="strength-focus-card" data-unified-focus="${escapeHtml(option.id)}">
          <span class="focus-radio"></span><span class="focus-copy"><strong>${escapeHtml(option.title)}</strong><small>${escapeHtml(option.subtitle || "")}</small><em>${escapeHtml(option.reason || "")}</em></span><span class="focus-count">≈ ${Number(option.estimatedExercises || 5)} ex.</span>
        </button>`).join("")}`;
      target.querySelectorAll("[data-unified-focus]").forEach(choice => choice.addEventListener("click", () => {
        selectedStrengthFocus = strengthOptions.find(o => o.id === choice.dataset.unifiedFocus) || null;
        target.querySelectorAll(".strength-focus-card").forEach(x => x.classList.toggle("is-selected", x === choice));
        $("#unifiedStrengthAdapt").hidden = false;
      }));
    } catch (error) {
      showStatus(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Voir ce que le coach propose de travailler";
    }
  }

  async function buildStrengthPlan() {
    const button = $("#buildUnifiedStrengthPlan");
    const custom = $("#unifiedStrengthCustom")?.value.trim() || "";
    if (!selectedStrengthFocus && !custom) {
      showStatus("Choisis une zone ou indique ce que tu veux travailler.", true);
      return;
    }
    button.disabled = true;
    button.textContent = "Construction…";
    try {
      const duration = Number($("#unifiedStrengthDuration")?.value || 60);
      const data = await apiRequest("/coach/strength-plan", {
        method: "POST",
        body: JSON.stringify({
          durationMinutes: duration,
          goal: goalLabel(),
          focusId: selectedStrengthFocus?.id || "full",
          focusTitle: selectedStrengthFocus?.title || custom || "Séance personnalisée",
          customFocus: custom,
          sessions: hevySessions()
        })
      }, 55000);
      currentPlan = data.plan;
      if (!currentPlan?.exercises?.length) throw new Error("Aucun exercice exploitable dans la séance.");
      renderStrengthPreview();
    } catch (error) {
      showStatus(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Construire la séance détaillée";
    }
  }

  function renderStrengthPreview() {
    const card = $("#coachPreviewCard");
    if (!card || !currentPlan) return;
    card.hidden = false;
    const advanced = currentPlan.advancedSets || {};
    card.innerHTML = `
      <div class="coach-step-head"><span class="coach-step-number">3</span><div><p class="eyebrow">APERÇU AVANT ENVOI</p><h3>${escapeHtml(currentPlan.title)}</h3></div><span class="coach-destination">Hevy</span></div>
      <div class="coach-plan-summary"><span>${Number(currentPlan.durationMinutes || 0)} min</span><span>${Number(currentPlan.totalSets || 0)} séries</span><span>${Number(advanced.warmups || 0)} échauff.</span><span>${Number(advanced.dropsets || 0)} dropset</span></div>
      <p class="plan-rationale">${escapeHtml(currentPlan.rationale || "")}</p>
      <div class="unified-exercise-list">${currentPlan.exercises.map((exercise, index) => renderExercise(exercise, index)).join("")}</div>
      <div class="coach-final-actions"><button type="button" class="secondary-button full" id="changeCoachChoice">Changer / recalculer</button><button type="button" class="primary-button full" id="publishUnifiedHevy">Valider et créer dans Hevy</button></div>
      <p class="publish-safety">Rien n’a encore été envoyé. La routine n’est créée qu’après ta validation ci-dessus.</p>`;
    $("#changeCoachChoice")?.addEventListener("click", () => $("#coachBuildCard")?.scrollIntoView({ behavior:"smooth", block:"nearest" }));
    $("#publishUnifiedHevy")?.addEventListener("click", publishHevy);
    card.scrollIntoView({ behavior:"smooth", block:"nearest" });
  }

  function renderExercise(exercise, index) {
    const novelty = exercise.novelty === "new" ? "Nouveau" : exercise.novelty === "reintroduced" ? "Réintroduit" : "Progression";
    return `<article class="unified-exercise-card"><div class="unified-exercise-head"><span>${index + 1}</span><div><strong>${escapeHtml(exercise.title || "Exercice")}</strong><small>${escapeHtml(novelty)} · repos ${Math.round(Number(exercise.restSeconds || 120) / 30) / 2} min</small></div></div>${exercise.notes ? `<p>${escapeHtml(exercise.notes)}</p>` : ""}<div class="unified-set-table"><div class="unified-set-row head"><span>Type</span><span>Charge</span><span>Reps</span><span>RPE</span></div>${(exercise.sets || []).map(set => `<div class="unified-set-row ${escapeHtml(set.type || "normal")}"><span>${setTypeLabel(set.type)}</span><strong>${set.weightKg != null ? `${Number(set.weightKg)} kg` : "Calibration"}</strong><strong>${set.reps ?? "—"}</strong><span>${set.rpe ?? "—"}</span></div>`).join("")}</div></article>`;
  }

  function setTypeLabel(type) {
    if (type === "warmup") return "W · Chauffe";
    if (type === "dropset") return "D · Drop";
    if (type === "failure") return "F · Échec";
    return "S · Travail";
  }

  async function publishHevy() {
    const button = $("#publishUnifiedHevy");
    if (!currentPlan?.publish?.hevyRoutine || !button) return;
    button.disabled = true;
    button.textContent = "Création dans Hevy…";
    try {
      const data = await apiRequest("/publish/hevy", {
        method: "POST",
        body: JSON.stringify({ suggestion: { title: currentPlan.title, publish: currentPlan.publish } })
      }, 35000);
      button.textContent = "✓ Routine créée dans Hevy";
      showStatus(data.message || "Routine créée dans Hevy.");
    } catch (error) {
      button.disabled = false;
      button.textContent = "Valider et créer dans Hevy";
      showStatus(error.message, true);
    }
  }

  function renderCardioBuilder() {
    const card = $("#coachBuildCard");
    if (!card) return;
    card.hidden = false;
    card.innerHTML = `
      <div class="coach-step-head"><span class="coach-step-number">2</span><div><p class="eyebrow">CARDIO / COURSE</p><h3>Définis le temps et tes contraintes</h3></div><span class="coach-destination">→ Garmin</span></div>
      <label class="field-label" for="unifiedCardioDuration">Durée disponible</label>
      <select id="unifiedCardioDuration" class="coach-select"><option value="30">30 min</option><option value="45" selected>45 min</option><option value="60">60 min</option><option value="75">75 min</option><option value="90">90 min</option></select>
      <label class="field-label" for="unifiedCardioCustom">Adaptation éventuelle</label>
      <textarea id="unifiedCardioCustom" rows="2" placeholder="Ex. facile aujourd’hui, pas de fractionné, je veux du tempo"></textarea>
      <button type="button" class="primary-button full" id="buildUnifiedCardioPlan">Construire la séance détaillée</button>`;
    $("#buildUnifiedCardioPlan")?.addEventListener("click", buildCardioPlan);
  }

  async function buildCardioPlan() {
    const button = $("#buildUnifiedCardioPlan");
    button.disabled = true;
    button.textContent = "Construction…";
    try {
      const duration = Number($("#unifiedCardioDuration")?.value || 45);
      const custom = $("#unifiedCardioCustom")?.value.trim() || "";
      const data = await apiRequest("/coach/cardio-plan", {
        method: "POST",
        body: JSON.stringify({ durationMinutes: duration, customFocus: custom, goal: goalLabel(), sessions: allSessions() })
      }, 40000);
      currentPlan = data.plan;
      if (!currentPlan?.blocks?.length) throw new Error("La séance cardio ne contient aucun bloc exploitable.");
      renderCardioPreview();
    } catch (error) {
      showStatus(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Construire la séance détaillée";
    }
  }

  function renderCardioPreview() {
    const card = $("#coachPreviewCard");
    if (!card || !currentPlan) return;
    card.hidden = false;
    const tomorrow = tomorrowDate();
    card.innerHTML = `
      <div class="coach-step-head"><span class="coach-step-number">3</span><div><p class="eyebrow">APERÇU AVANT ENVOI</p><h3>${escapeHtml(currentPlan.title)}</h3></div><span class="coach-destination">Garmin</span></div>
      <div class="coach-plan-summary"><span>${Number(currentPlan.durationMinutes || 0)} min</span><span>${escapeHtml(currentPlan.focusLabel || "Cardio")}</span><span>≈ ${Number(currentPlan.estimatedDistanceKm || 0)} km</span></div>
      <p class="plan-rationale">${escapeHtml(currentPlan.rationale || "")}</p>
      <div class="cardio-block-list">${currentPlan.blocks.map((block, index) => `<div class="cardio-block"><span>${index + 1}</span><div><strong>${escapeHtml(block.name || "Bloc")}</strong><small>${durationLabel(block)} · ${escapeHtml(block.target || "")}</small><em>${escapeHtml(block.note || "")}</em></div></div>`).join("")}</div>
      ${currentPlan.dataQuality?.limited ? '<div class="coach-data-note">Allures prudentes : seulement quelques courses Garmin sont actuellement disponibles dans Intervals.icu.</div>' : ""}
      <label class="field-label" for="garminCoachDate">Jour prévu</label><input id="garminCoachDate" type="date" value="${tomorrow}">
      <div class="coach-final-actions"><button type="button" class="secondary-button full" id="changeCoachChoice">Changer / recalculer</button><button type="button" class="primary-button full" id="publishUnifiedGarmin">Valider et envoyer à Garmin</button></div>
      <p class="publish-safety">Rien n’a encore été envoyé. La séance est créée dans Intervals.icu uniquement après ta validation.</p>`;
    $("#changeCoachChoice")?.addEventListener("click", () => $("#coachBuildCard")?.scrollIntoView({ behavior:"smooth", block:"nearest" }));
    $("#publishUnifiedGarmin")?.addEventListener("click", publishGarmin);
    card.scrollIntoView({ behavior:"smooth", block:"nearest" });
  }

  async function publishGarmin() {
    const button = $("#publishUnifiedGarmin");
    if (!currentPlan?.publish?.garminWorkout || !button) return;
    button.disabled = true;
    button.textContent = "Envoi vers Garmin…";
    try {
      const date = $("#garminCoachDate")?.value || tomorrowDate();
      const data = await apiRequest("/publish/garmin", {
        method: "POST",
        body: JSON.stringify({ date, suggestion: { id: currentPlan.id, title: currentPlan.title, publish: currentPlan.publish } })
      }, 35000);
      button.textContent = "✓ Séance envoyée";
      showStatus(data.message || "Séance créée et destinée à Garmin.");
    } catch (error) {
      button.disabled = false;
      button.textContent = "Valider et envoyer à Garmin";
      showStatus(error.message, true);
    }
  }

  function durationLabel(block) {
    if (block.durationSeconds) return `${Number(block.durationSeconds)} s`;
    return `${Number(block.durationMinutes || 0)} min`;
  }

  function tomorrowDate() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function resetBuildAndPreview() {
    const build = $("#coachBuildCard");
    const preview = $("#coachPreviewCard");
    if (build) { build.hidden = true; build.innerHTML = ""; }
    if (preview) { preview.hidden = true; preview.innerHTML = ""; }
  }

  document.addEventListener("change", event => {
    if (event.target?.id === "goalSelect" && $("#unifiedCoachFlow")) setTimeout(analyzeNextSession, 50);
  });

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      setupUnifiedCoach();
      const version = $("#versionLabel");
      if (version) version.textContent = `TrainSync ${UI_VERSION} · coach unifié · validation avant publication`;
    }, 500);
  });
})();
