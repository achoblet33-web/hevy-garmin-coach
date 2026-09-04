(() => {
  const API_BASE = "https://hevy-garmin-coach.planetpizza.workers.dev";
  const DEFAULT_SYNC = `${API_BASE}/sync`;
  const DEFAULT_COACH = `${API_BASE}/recommend`;

  settings = {
    ...settings,
    syncEndpoint: settings.syncEndpoint || DEFAULT_SYNC,
    coachEndpoint: settings.coachEndpoint || DEFAULT_COACH,
    relayToken: settings.relayToken || ""
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

  async function apiError(response, fallback) {
    let detail = "";
    try {
      const body = await response.clone().json();
      detail = body?.error || body?.message || "";
    } catch {
      try { detail = (await response.clone().text()).trim(); } catch { /* noop */ }
    }
    if (response.status === 401) return "Jeton du relais incorrect ou manquant. Vérifie APP_TOKEN dans Réglages.";
    if (response.status === 403) return "Accès refusé par le relais Cloudflare.";
    if (response.status === 429) return "Trop de requêtes. Réessaie dans quelques minutes.";
    return detail ? `${fallback} ${detail}` : `${fallback} (HTTP ${response.status}).`;
  }

  normalizeSession = function(item, defaultSource = "Hevy") {
    const source = String(item.source || defaultSource).toLowerCase().includes("garmin") ? "Garmin" : "Hevy";
    const rawCategory = item.category || item.type || item.activityType || item.activity_type || (source === "Hevy" ? "Musculation" : "Cardio");
    const category = Object.keys(categories).find(key => String(rawCategory).toLowerCase().includes(key.toLowerCase())) || mapActivityCategory(rawCategory);
    const startedAt = new Date(item.startedAt || item.start_time || item.startTime || item.date || Date.now()).toISOString();
    const durationMinutes = durationToMinutes(item.durationMinutes ?? item.duration_minutes ?? item.elapsed_time ?? item.duration ?? item.duration_seconds);
    return {
      ...item,
      id: String(item.id || `${source}-${startedAt}-${item.title || item.name || rawCategory}`),
      source,
      category,
      title: String(item.title || item.name || item.activityName || item.activity_name || `${category} ${source}`),
      startedAt,
      durationMinutes: Math.round(durationMinutes),
      distanceKm: optionalNumber(item.distanceKm ?? item.distance_km ?? item.distance),
      volumeKg: optionalNumber(item.volumeKg ?? item.volume_kg ?? item.volume),
      calories: optionalNumber(item.calories),
      averageHeartRate: optionalNumber(item.averageHeartRate ?? item.avg_hr ?? item.average_hr),
      maxHeartRate: optionalNumber(item.maxHeartRate ?? item.max_hr),
      paceMinKm: optionalNumber(item.paceMinKm),
      elevationGainM: optionalNumber(item.elevationGainM),
      trainingLoad: optionalNumber(item.trainingLoad),
      rpe: optionalNumber(item.rpe),
      exercises: Array.isArray(item.exercises) ? item.exercises : undefined
    };
  };

  mergeSessions = function(incoming) {
    const existing = state.demo
      ? []
      : state.sessions.filter(item => !String(item.id || "").startsWith("demo-"));
    const map = new Map(existing.map(item => [item.id, item]));
    incoming.map(normalizeSession).forEach(item => map.set(item.id, item));
    state.sessions = [...map.values()].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    state.demo = false;
    persist();
    renderAll();
  };

  synchronize = async function() {
    const button = $("#syncButton");
    settings.syncEndpoint = settings.syncEndpoint || DEFAULT_SYNC;
    if (!settings.relayToken) {
      showStatus("Ajoute ton APP_TOKEN dans Réglages → Jeton du relais, puis Enregistrer.", true);
      return;
    }
    button.classList.add("is-spinning");
    try {
      const response = await fetch(settings.syncEndpoint, {
        headers: { Authorization: `Bearer ${settings.relayToken}` },
        cache: "no-store"
      });
      if (!response.ok) throw new Error(await apiError(response, "Synchronisation impossible."));
      const data = await response.json();
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      mergeSessions(sessions);
      const warnings = Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [];
      const sources = Array.isArray(data.sources) ? data.sources : [];
      if (warnings.length) {
        showStatus(`${sessions.length} séance(s) reçue(s). ${warnings.join(" · ")}`, sessions.length === 0);
      } else {
        const suffix = sources.length ? ` · ${sources.join(" + ")}` : "";
        showStatus(`${sessions.length} séance(s) synchronisée(s)${suffix}.`);
      }
    } catch (error) {
      const message = error?.message === "Failed to fetch"
        ? "Impossible de joindre Cloudflare. Vérifie ta connexion puis réessaie."
        : error.message;
      showStatus(message, true);
    } finally {
      button.classList.remove("is-spinning");
    }
  };

  generateSuggestions = async function() {
    const button = $("#generateButton");
    button.disabled = true;
    button.textContent = "Analyse en cours…";
    settings.coachEndpoint = settings.coachEndpoint || DEFAULT_COACH;
    try {
      if (!settings.relayToken) throw new Error("Ajoute ton APP_TOKEN dans Réglages avant d’utiliser le coach.");
      const response = await fetch(settings.coachEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.relayToken}`
        },
        body: JSON.stringify({
          goal: $("#goalSelect").selectedOptions[0].textContent,
          sessions: state.sessions.slice(0, 40)
        })
      });
      if (!response.ok) throw new Error(await apiError(response, "Le coach n’a pas répondu."));
      const data = await response.json();
      if (!Array.isArray(data.suggestions) || data.suggestions.length === 0) throw new Error("Le coach a répondu sans séance exploitable.");
      state.suggestions = data.suggestions;
      persist();
      renderSuggestions();
      showStatus("Programme mis à jour à partir de tes dernières performances.");
    } catch (error) {
      showStatus(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "✦ Générer mes séances";
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    const syncInput = $("#syncEndpoint");
    const coachInput = $("#coachEndpoint");
    if (syncInput) syncInput.value = settings.syncEndpoint || DEFAULT_SYNC;
    if (coachInput) coachInput.value = settings.coachEndpoint || DEFAULT_COACH;

    const save = $("#saveSettings");
    if (save) {
      save.addEventListener("click", () => {
        setTimeout(() => {
          settings.syncEndpoint = $("#syncEndpoint").value.trim() || DEFAULT_SYNC;
          settings.coachEndpoint = $("#coachEndpoint").value.trim() || DEFAULT_COACH;
          settings.relayToken = $("#relayToken").value.trim();
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
          if (settings.relayToken) synchronize();
        }, 0);
      });
    }
  });
})();
