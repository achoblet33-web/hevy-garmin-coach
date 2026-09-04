(() => {
  const UI_VERSION = "1.7.0";
  const GARMIN_REPAIR_KEY = "trainsync-garmin-history-repair-v17";
  let strengthOptions = [];
  let selectedFocus = null;
  let strengthPlan = null;

  function hevySessions() {
    return state.sessions.filter(s => s.source === "Hevy" && !String(s.id).startsWith("demo-")).slice(0, 300);
  }

  function goalLabel() {
    return $("#goalSelect")?.selectedOptions?.[0]?.textContent || "Équilibre";
  }

  function ensureStrengthPlanner() {
    if ($("#strengthPlanner")) return;
    const intro = document.querySelector("#coachView .coach-intro");
    if (!intro) return;
    const panel = document.createElement("article");
    panel.id = "strengthPlanner";
    panel.className = "strength-planner panel";
    panel.innerHTML = `
      <div class="planner-head">
        <div><p class="eyebrow">PRÉPARER UNE SÉANCE HEVY</p><h3>Choisis le temps, puis le travail</h3></div>
        <span class="planner-step">1 → 2 → 3</span>
      </div>
      <p class="muted">TrainSync te propose d’abord les zones les plus pertinentes. Rien n’est envoyé dans Hevy tant que tu n’as pas validé le détail complet.</p>
      <div class="planner-duration-row">
        <label class="field-label" for="strengthDuration">Durée disponible</label>
        <select id="strengthDuration">
          <option value="30">30 min</option>
          <option value="45">45 min</option>
          <option value="60" selected>60 min</option>
          <option value="75">75 min</option>
          <option value="90">90 min</option>
        </select>
      </div>
      <button class="secondary-button full" id="suggestStrengthFocus">Me proposer quoi travailler</button>
      <div id="strengthFocusOptions" class="strength-focus-options" aria-live="polite"></div>
      <div id="strengthAdaptBox" class="strength-adapt-box" hidden>
        <label class="field-label" for="strengthCustomFocus">Adapter selon ton envie</label>
        <textarea id="strengthCustomFocus" rows="2" placeholder="Ex. davantage de dos et biceps, pas de jambes aujourd’hui"></textarea>
        <button class="primary-button full" id="buildStrengthPlan">Construire la séance détaillée</button>
      </div>
      <div id="strengthPlanPreview" class="strength-plan-preview" aria-live="polite"></div>`;
    const coachFocus = $("#coachFocusSummary");
    if (coachFocus) coachFocus.insertAdjacentElement("afterend", panel);
    else intro.insertAdjacentElement("afterend", panel);

    $("#suggestStrengthFocus")?.addEventListener("click", loadStrengthOptions);
    $("#buildStrengthPlan")?.addEventListener("click", buildStrengthPlan);
  }

  async function loadStrengthOptions() {
    const button = $("#suggestStrengthFocus");
    const duration = Number($("#strengthDuration")?.value || 60);
    selectedFocus = null;
    strengthPlan = null;
    $("#strengthPlanPreview").innerHTML = "";
    $("#strengthAdaptBox").hidden = true;
    button.disabled = true;
    button.textContent = "Analyse de ton historique…";
    try {
      const data = await apiRequest("/coach/strength-options", {
        method: "POST",
        body: JSON.stringify({ durationMinutes: duration, goal: goalLabel(), sessions: hevySessions() })
      }, 45000);
      strengthOptions = Array.isArray(data.options) ? data.options : [];
      if (!strengthOptions.length) throw new Error("Aucune orientation musculaire exploitable n’a été trouvée.");
      renderStrengthOptions();
    } catch (error) {
      showStatus(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Me proposer quoi travailler";
    }
  }

  function renderStrengthOptions() {
    const target = $("#strengthFocusOptions");
    if (!target) return;
    target.innerHTML = `<p class="planner-stage-label">2 · Choisis une orientation</p>${strengthOptions.map(option => `
      <button type="button" class="strength-focus-card" data-focus-id="${escapeHtml(option.id)}">
        <span class="focus-radio" aria-hidden="true"></span>
        <span class="focus-copy"><strong>${escapeHtml(option.title)}</strong><small>${escapeHtml(option.subtitle || "")}</small><em>${escapeHtml(option.reason || "")}</em></span>
        <span class="focus-count">≈ ${Number(option.estimatedExercises) || 5} ex.</span>
      </button>`).join("")}`;
    target.querySelectorAll("[data-focus-id]").forEach(button => button.addEventListener("click", () => {
      selectedFocus = strengthOptions.find(o => o.id === button.dataset.focusId) || null;
      target.querySelectorAll(".strength-focus-card").forEach(card => card.classList.toggle("is-selected", card === button));
      $("#strengthAdaptBox").hidden = false;
      $("#strengthCustomFocus")?.focus({ preventScroll: true });
    }));
  }

  async function buildStrengthPlan() {
    const button = $("#buildStrengthPlan");
    const customFocus = $("#strengthCustomFocus")?.value.trim() || "";
    if (!selectedFocus && !customFocus) {
      showStatus("Choisis une proposition ou indique ce que tu veux travailler.", true);
      return;
    }
    button.disabled = true;
    button.textContent = "Construction de la séance…";
    try {
      const duration = Number($("#strengthDuration")?.value || 60);
      const data = await apiRequest("/coach/strength-plan", {
        method: "POST",
        body: JSON.stringify({
          durationMinutes: duration,
          goal: goalLabel(),
          focusId: selectedFocus?.id || "full",
          focusTitle: selectedFocus?.title || customFocus || "Séance personnalisée",
          customFocus,
          sessions: hevySessions()
        })
      }, 50000);
      strengthPlan = data.plan || null;
      if (!strengthPlan?.exercises?.length) throw new Error("La séance générée ne contient aucun exercice exploitable.");
      renderStrengthPlan();
    } catch (error) {
      showStatus(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Construire la séance détaillée";
    }
  }

  function renderStrengthPlan() {
    const target = $("#strengthPlanPreview");
    if (!target || !strengthPlan) return;
    const noveltyLabel = value => value === "new" ? "Nouveau" : value === "reintroduced" ? "Réintroduit" : "Progression";
    target.innerHTML = `
      <div class="plan-preview-head">
        <div><p class="eyebrow">3 · APERÇU AVANT HEVY</p><h3>${escapeHtml(strengthPlan.title)}</h3></div>
        <span>${Number(strengthPlan.durationMinutes) || 0} min · ${Number(strengthPlan.totalSets) || 0} séries</span>
      </div>
      <p class="plan-rationale">${escapeHtml(strengthPlan.rationale || "")}</p>
      <div class="plan-exercise-list">${strengthPlan.exercises.map((exercise, exerciseIndex) => `
        <article class="plan-exercise-card">
          <div class="plan-exercise-head">
            <span class="plan-exercise-number">${exerciseIndex + 1}</span>
            <div><strong>${escapeHtml(exercise.title || "Exercice")}</strong><small>${escapeHtml(prettyMuscle(exercise.primaryGroup))}${exercise.secondaryGroups?.length ? ` · ${escapeHtml(exercise.secondaryGroups.slice(0,2).map(prettyMuscle).join(", "))}` : ""}</small></div>
            <span class="novelty-pill ${escapeHtml(exercise.novelty || "progressed")}">${noveltyLabel(exercise.novelty)}</span>
          </div>
          ${exercise.notes ? `<p class="exercise-plan-note">${escapeHtml(exercise.notes)}</p>` : ""}
          <div class="plan-set-table">
            <div class="plan-set-row head"><span>Série</span><span>Charge</span><span>Reps</span><span>RPE cible</span></div>
            ${(exercise.sets || []).map((set, setIndex) => `<div class="plan-set-row"><span>${setIndex + 1}</span><strong>${set.weightKg != null ? `${Number(set.weightKg)} kg` : "Calibration"}</strong><strong>${set.reps ?? "—"}</strong><span>${set.rpe ?? "—"}</span></div>`).join("")}
          </div>
          <div class="rest-line">Repos conseillé · ${Math.round(Number(exercise.restSeconds || 120) / 60 * 10) / 10} min</div>
        </article>`).join("")}</div>
      <div class="plan-final-actions">
        <button class="secondary-button full" id="rebuildStrengthPlan">Modifier / recalculer</button>
        <button class="primary-button full" id="publishStrengthPlan">Créer cette routine dans Hevy</button>
      </div>
      <p class="publish-safety">Aucune routine n’a encore été créée dans Hevy. L’envoi ne se fait qu’avec le bouton ci-dessus.</p>`;
    $("#rebuildStrengthPlan")?.addEventListener("click", buildStrengthPlan);
    $("#publishStrengthPlan")?.addEventListener("click", publishStrengthPlan);
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function publishStrengthPlan() {
    if (!strengthPlan?.publish?.hevyRoutine) return;
    const button = $("#publishStrengthPlan");
    button.disabled = true;
    button.textContent = "Création dans Hevy…";
    try {
      const data = await apiRequest("/publish/hevy", {
        method: "POST",
        body: JSON.stringify({ suggestion: { title: strengthPlan.title, publish: strengthPlan.publish } })
      }, 30000);
      showStatus(data.message || "Routine créée dans Hevy.");
      button.textContent = "✓ Routine créée dans Hevy";
    } catch (error) {
      showStatus(error.message, true);
      button.disabled = false;
      button.textContent = "Créer cette routine dans Hevy";
    }
  }

  function prettyMuscle(value = "") {
    const labels = {
      chest: "Pectoraux", shoulders: "Épaules", triceps: "Triceps", biceps: "Biceps", lats: "Dorsaux",
      upper_back: "Haut du dos", traps: "Trapèzes", quadriceps: "Quadriceps", hamstrings: "Ischios",
      glutes: "Fessiers", calves: "Mollets", forearms: "Avant-bras", lower_back: "Lombaires", abs: "Abdominaux"
    };
    return labels[value] || String(value || "").replaceAll("_", " ");
  }

  function ensureGarminRepairControl() {
    if ($("#repairGarminHistory")) return;
    const panel = $("#settingsView .connection-panel");
    if (!panel) return;
    const button = document.createElement("button");
    button.id = "repairGarminHistory";
    button.className = "secondary-button full garmin-repair-button";
    button.textContent = "Réimporter tout l’historique Garmin";
    button.addEventListener("click", () => repairGarminHistory(true));
    panel.appendChild(button);
  }

  async function repairGarminHistory(manual = false) {
    if (!settings.relayToken) return;
    const button = $("#repairGarminHistory");
    if (button) { button.disabled = true; button.textContent = "Import Garmin en cours…"; }
    if (manual) showStatus("Recherche de tout l’historique Garmin dans Intervals.icu…");
    try {
      const data = await apiRequest("/sync?all=1", {}, 120000);
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      mergeSessions(sessions);
      const garminCount = sessions.filter(s => s.source === "Garmin").length;
      localStorage.setItem(GARMIN_REPAIR_KEY, JSON.stringify({ attemptedAt: new Date().toISOString(), count: garminCount }));
      const meta = data.history?.sourceMeta?.garmin;
      if (garminCount <= 2) {
        showStatus("TrainSync a interrogé tout l’historique Intervals.icu mais seulement 2 activités Garmin sont disponibles côté Intervals.icu.", true);
      } else {
        showStatus(`${garminCount} activités Garmin récupérées dans l’historique.`);
      }
      if (meta) updateGarminRepairInfo(meta);
    } catch (error) {
      if (manual) showStatus(error.message, true);
    } finally {
      if (button) { button.disabled = false; button.textContent = "Réimporter tout l’historique Garmin"; }
    }
  }

  function updateGarminRepairInfo(meta) {
    const panel = $("#settingsView .connection-panel");
    if (!panel) return;
    let node = $("#garminHistoryInfo");
    if (!node) {
      node = document.createElement("p");
      node.id = "garminHistoryInfo";
      node.className = "garmin-history-info muted";
      panel.appendChild(node);
    }
    node.textContent = `Garmin / Intervals.icu : ${Number(meta.returned || 0).toLocaleString("fr-FR")} activité(s) trouvée(s)${meta.oldestImportedAt ? ` · plus ancienne ${new Date(meta.oldestImportedAt).toLocaleDateString("fr-FR")}` : ""}.`;
  }

  function maybeRepairGarminHistory() {
    const currentGarmin = state.sessions.filter(s => s.source === "Garmin").length;
    if (currentGarmin > 2 || !settings.relayToken || localStorage.getItem(GARMIN_REPAIR_KEY)) return;
    setTimeout(() => repairGarminHistory(false), 1200);
  }

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      ensureStrengthPlanner();
      ensureGarminRepairControl();
      maybeRepairGarminHistory();
      const version = $("#versionLabel");
      if (version) version.textContent = `TrainSync ${UI_VERSION} · préparation Hevy avant publication · historique Garmin renforcé`;
    }, 250);
  });
})();
