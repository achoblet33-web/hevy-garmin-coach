(() => {
  const UI_VERSION = "2.0.0";
  const HISTORY_DONE_KEY = "trainsync-full-history-imported-v1";
  const HISTORY_META_KEY = "trainsync-history-meta-v1";
  window.TRAINSYNC_RELEASE = UI_VERSION;

  // Final compatibility layer: keep the useful fixes from 1.9.1–1.9.5 in
  // one place and avoid MutationObservers fighting over the UI.
  const baseApiRequestV20 = typeof apiRequest === "function" ? apiRequest : null;
  if (baseApiRequestV20) {
    apiRequest = async function(path, options = {}, timeout) {
      try {
        const data = await baseApiRequestV20(path, options, timeout);
        if (/^\/activity\//.test(String(path || "")) && data) normalizeGpsPayload(data);
        return data;
      } catch (error) {
        const message = String(error?.message || "");
        if (/APP_TOKEN incorrect|Unauthorized/i.test(message)) {
          throw new Error("APP_TOKEN refusé par le Worker. Vérifie le secret APP_TOKEN dans Cloudflare Production puis reteste, sans guillemets ni espace autour du jeton.");
        }
        throw error;
      }
    };
  }

  function normalizeGpsPayload(data) {
    const normalize = value => {
      if (!Array.isArray(value)) return value;
      return value.map(point => {
        if (!Array.isArray(point) || point.length < 2) return point;
        const lat = Number(point[0]);
        const lon = Number(point[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return point;
        return { lat, lon };
      });
    };
    if (Array.isArray(data.map)) data.map = normalize(data.map);
    if (Array.isArray(data.route)) data.route = normalize(data.route);
  }

  // Fix the old pace rounding artefact such as 5:00 (6:00) /km.
  if (typeof formatPace === "function") {
    formatPace = function(value) {
      const pace = Number(value);
      if (!Number.isFinite(pace) || pace <= 0) return "—";
      const totalSeconds = Math.max(1, Math.round(pace * 60));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
    };
  }

  connectBackend = async function() {
    const input = document.querySelector("#relayToken");
    const button = document.querySelector("#connectButton");
    const token = input?.value.trim() || "";
    if (!token) return showStatus("Entre ton APP_TOKEN Cloudflare.", true);

    settings.relayToken = token;
    persistSettings();
    connection.status = "checking";
    renderConnection();
    if (button) { button.disabled = true; button.textContent = "Connexion…"; }

    try {
      const status = await apiRequest("/status");
      connection.status = "connected";
      connection.configured = status.configured || null;
      connection.sources = null;
      renderConnection();
      showStatus("Connexion validée. Synchronisation en cours…");
      await synchronize({ quietStart: true });
    } catch (error) {
      settings.relayToken = token;
      persistSettings();
      if (input) input.value = token;
      connection.status = "error";
      renderConnection();
      showStatus(error.message, true);
    } finally {
      if (button) { button.disabled = false; button.textContent = "Connecter et synchroniser"; }
    }
  };

  synchronize = async function({ quietStart = false, forceFull = false } = {}) {
    const button = $("#syncButton");
    const secondary = $("#syncNowButton");

    if (!settings.relayToken) {
      connection.status = "disconnected";
      renderConnection();
      showStatus("Va dans Réglages et connecte ton Worker avec APP_TOKEN.", true);
      return;
    }

    const fullDone = localStorage.getItem(HISTORY_DONE_KEY) === "1";
    const full = forceFull || !fullDone;
    if (!quietStart) showStatus(full ? "Import de tout ton historique…" : "Synchronisation des séances récentes…");
    button?.classList.add("is-spinning");
    if (secondary) secondary.disabled = true;

    try {
      const path = full ? "/sync?all=1" : "/sync?days=180";
      const data = await apiRequest(path, {}, full ? 120000 : 45000);
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      mergeSessions(sessions);

      connection.status = "connected";
      connection.sources = data.sources || connection.sources || null;
      connection.configured = {
        ...(connection.configured || {}),
        hevy: data.sources?.hevy?.configured ?? connection.configured?.hevy,
        garmin: data.sources?.garmin?.configured ?? connection.configured?.garmin
      };
      renderConnection();

      if (full && data.history) {
        localStorage.setItem(HISTORY_DONE_KEY, "1");
        localStorage.setItem(HISTORY_META_KEY, JSON.stringify(data.history));
      }

      const warnings = Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [];
      if (full && !data.history) warnings.unshift("Historique synchronisé, mais sans métadonnées de complétude du Worker.");

      showStatus(warnings.length
        ? `${sessions.length} séance(s) reçue(s). ${warnings.join(" · ")}`
        : full
          ? `${sessions.length} séance(s) importée(s) depuis tout l’historique disponible.`
          : `${sessions.length} séance(s) récentes synchronisée(s).`, false);
    } catch (error) {
      connection.status = "error";
      renderConnection();
      showStatus(error.message, true);
    } finally {
      button?.classList.remove("is-spinning");
      if (secondary) secondary.disabled = false;
      applyUiState();
    }
  };

  const baseOpenSessionDetailV20 = typeof openSessionDetail === "function" ? openSessionDetail : null;
  if (baseOpenSessionDetailV20) {
    openSessionDetail = async function(id) {
      const session = state.sessions.find(item => String(item.id) === String(id));
      const result = await baseOpenSessionDetailV20(id);
      if (session?.source === "Garmin") {
        const content = document.querySelector("#sessionDetailContent");
        const hasMap = content?.querySelector("#activityMapV15, #activityMap");
        if (content && !hasMap && !content.querySelector(".gps-availability-note")) {
          const stats = [...content.querySelectorAll("section.detail-section")].find(section => /statistiques/i.test(section.textContent || ""));
          const note = document.createElement("div");
          note.className = "gps-availability-note";
          note.innerHTML = '<span>⌖</span><div><strong>Tracé GPS non disponible pour cette activité</strong><small>Les statistiques restent accessibles. La carte apparaît automatiquement dès qu’un tracé est renvoyé par Intervals.icu.</small></div>';
          if (stats) stats.insertAdjacentElement("beforebegin", note); else content.appendChild(note);
        }
      }
      return result;
    };
  }

  const baseRenderAllV20 = typeof renderAll === "function" ? renderAll : null;
  if (baseRenderAllV20) {
    renderAll = function(...args) {
      const result = baseRenderAllV20.apply(this, args);
      applyUiState();
      return result;
    };
  }

  function ensureFriendlyCopy() {
    const copies = [
      ["#sessionsView .section-heading > div", "Tout ton historique, au même endroit."],
      ["#analysisView .section-heading > div", "Comprends ta charge et ce qui mérite ton attention."],
      ["#coachView .coach-intro", "Le coach choisit avec toi, puis prépare une séance prête à lancer."],
      ["#settingsView .section-heading > div", "Tes connexions et ton historique restent sous contrôle."]
    ];
    copies.forEach(([selector, text]) => {
      const target = document.querySelector(selector);
      if (!target || target.querySelector(":scope > .view-copy")) return;
      const p = document.createElement("p");
      p.className = "view-copy";
      p.textContent = text;
      if (selector.includes("coach-intro")) {
        const existing = target.querySelector("h2 + p");
        if (existing) existing.textContent = text;
      } else {
        target.appendChild(p);
      }
    });
  }

  function ensureSessionSummary() {
    const view = document.querySelector("#sessionsView");
    const segmented = view?.querySelector(".segmented");
    if (!view || !segmented) return;
    let summary = document.querySelector("#sessionSummaryBar");
    if (!summary) {
      summary = document.createElement("div");
      summary.id = "sessionSummaryBar";
      summary.className = "session-summary-bar";
      segmented.insertAdjacentElement("afterend", summary);
    }
    const real = state.sessions.filter(s => !String(s.id || "").startsWith("demo-"));
    const hevy = real.filter(s => s.source === "Hevy").length;
    const garmin = real.filter(s => s.source === "Garmin").length;
    const last = real[0]?.startedAt ? new Date(real[0].startedAt) : null;
    const lastText = last && Number.isFinite(last.getTime())
      ? last.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
      : "—";
    summary.innerHTML = `<span><strong>${real.length.toLocaleString("fr-FR")}</strong> séances</span><span><b class="dot hevy"></b>${hevy} Hevy</span><span><b class="dot garmin"></b>${garmin} Garmin</span><span>Dernière · ${lastText}</span>`;
  }

  function applyUiState() {
    document.documentElement.dataset.trainsyncVersion = UI_VERSION;
    const version = document.querySelector("#versionLabel");
    if (version) version.textContent = `TrainSync ${UI_VERSION} · interface stable · Worker 1.9.5 compatible`;
    ensureSessionSummary();

    const appShell = document.querySelector(".app-shell");
    appShell?.classList.toggle("is-connected", connection.status === "connected");
    appShell?.classList.toggle("has-connection-error", connection.status === "error");
  }

  function makeNavigationSafer() {
    document.querySelectorAll(".bottom-nav button").forEach(button => {
      button.setAttribute("type", "button");
      button.setAttribute("aria-label", button.textContent.trim());
    });
    document.querySelectorAll(".session-card[role='button']").forEach(card => {
      card.style.touchAction = "manipulation";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.classList.add("trainsync-v20");
    ensureFriendlyCopy();
    ensureSessionSummary();
    makeNavigationSafer();
    applyUiState();

    // Refresh visual affordances after filters/navigation without observers.
    document.addEventListener("click", event => {
      if (event.target.closest(".segmented, .bottom-nav, #syncButton, #connectButton, #syncNowButton")) {
        setTimeout(() => { ensureSessionSummary(); applyUiState(); makeNavigationSafer(); }, 0);
      }
    }, { passive: true });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(registration => registration.update()).catch(() => {});
    }
  });
})();
