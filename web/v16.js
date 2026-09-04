(() => {
  const UI_VERSION = "1.6.0";
  const HISTORY_DB = "trainsync-history-v1";
  const HISTORY_STORE = "sessions";
  const HISTORY_DONE_KEY = "trainsync-full-history-imported-v1";
  const HISTORY_META_KEY = "trainsync-history-meta-v1";
  const HISTORY_CAP = 5000;
  let dbPromise = null;

  const previousPersistState = persistState;
  const previousRenderSuggestions = renderSuggestions;

  function openHistoryDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(HISTORY_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function saveHistory(sessions) {
    if (!Array.isArray(sessions) || !sessions.length || !window.indexedDB) return;
    try {
      const db = await openHistoryDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(HISTORY_STORE, "readwrite");
        const store = tx.objectStore(HISTORY_STORE);
        sessions.slice(0, HISTORY_CAP).forEach(session => store.put(session));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (error) {
      console.warn("TrainSync history storage", error);
    }
  }

  async function loadHistory() {
    if (!window.indexedDB) return [];
    try {
      const db = await openHistoryDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(HISTORY_STORE, "readonly");
        const request = tx.objectStore(HISTORY_STORE).getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => reject(request.error);
      });
    } catch { return []; }
  }

  persistState = function() {
    const recent = [...state.sessions].sort((a,b) => new Date(b.startedAt)-new Date(a.startedAt)).slice(0, 140);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, sessions: recent }));
    } catch {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions: recent.slice(0, 60), suggestions: state.suggestions || [], demo: false })); } catch {}
    }
    saveHistory(state.sessions);
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
    if (!quietStart) showStatus(full ? "Import de tout ton historique Hevy + Garmin…" : "Synchronisation des séances récentes…");
    button?.classList.add("is-spinning");
    if (secondary) secondary.disabled = true;

    try {
      const path = full ? "/sync?all=1" : "/sync?days=180";
      const data = await apiRequest(path, {}, full ? 90000 : 35000);
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      mergeSessions(sessions);
      await saveHistory(state.sessions);

      connection.status = "connected";
      connection.sources = data.sources || null;
      renderConnection();

      if (full) {
        localStorage.setItem(HISTORY_DONE_KEY, "1");
        localStorage.setItem(HISTORY_META_KEY, JSON.stringify(data.history || { returned: sessions.length, cap: HISTORY_CAP }));
      }
      renderHistoryStatus();

      const warnings = Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [];
      if (warnings.length) showStatus(`${sessions.length} séance(s) reçue(s). ${warnings.join(" · ")}`, false);
      else showStatus(full ? `${sessions.length} séance(s) importée(s) depuis tout l’historique disponible.` : `${sessions.length} séance(s) récentes synchronisée(s).`);
    } catch (error) {
      connection.status = "error";
      renderConnection();
      showStatus(error.message, true);
    } finally {
      button?.classList.remove("is-spinning");
      if (secondary) secondary.disabled = false;
    }
  };

  generateSuggestions = async function() {
    const button = $("#generateButton");
    if (!button) return;
    button.disabled = true;
    button.textContent = "Analyse en cours…";
    try {
      if (!settings.relayToken) throw new Error("Connecte TrainSync au Worker dans Réglages avant d’utiliser le coach.");
      const data = await apiRequest("/recommend", {
        method: "POST",
        body: JSON.stringify({
          goal: $("#goalSelect")?.selectedOptions?.[0]?.textContent || "Équilibre",
          sessions: state.sessions.filter(x => !String(x.id).startsWith("demo-")).slice(0, 160)
        })
      }, 90000);
      if (!Array.isArray(data.suggestions) || !data.suggestions.length) throw new Error("Le coach a répondu sans séance exploitable.");
      state.suggestions = data.suggestions;
      state.strengthMethod = data.strengthMethod || null;
      persistState();
      renderSuggestions();
      showStatus(data.degraded ? "Programme généré en mode de secours et prêt à être utilisé." : "Programme mis à jour à partir de ton historique complet et de ton focus de charge.");
    } catch (error) {
      showStatus(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "✦ Générer mes séances";
    }
  };

  renderSuggestions = function() {
    previousRenderSuggestions();
    const cards = $$("#suggestionsList .suggestion-card");
    cards.forEach((card, index) => {
      const suggestion = state.suggestions?.[index];
      if (!suggestion?.evolutionNote || card.querySelector(".evolution-note")) return;
      const note = document.createElement("div");
      note.className = "evolution-note";
      note.innerHTML = `<strong>Progression anatomique</strong><span>${escapeHtml(suggestion.evolutionNote)}</span>`;
      const stats = card.querySelector(".suggestion-stats");
      (stats || card).insertAdjacentElement("afterend", note);
    });
  };

  function renderHistoryStatus() {
    const panel = $("#settingsView .connection-panel");
    if (!panel) return;
    let node = $("#historyStatus");
    if (!node) {
      node = document.createElement("div");
      node.id = "historyStatus";
      node.className = "history-status";
      panel.appendChild(node);
    }
    let meta = {};
    try { meta = JSON.parse(localStorage.getItem(HISTORY_META_KEY) || "{}"); } catch {}
    const count = state.sessions.filter(x => !String(x.id).startsWith("demo-")).length;
    const complete = meta.complete !== false;
    node.innerHTML = `<div><strong>${count.toLocaleString("fr-FR")} séances en mémoire</strong><span>${complete ? "Historique complet importé" : "Historique importé jusqu’à la limite de sécurité"}</span></div><small>Stockage IndexedDB · garde-fou TrainSync ${HISTORY_CAP.toLocaleString("fr-FR")} séances</small>`;
  }

  async function hydrateHistory() {
    const stored = await loadHistory();
    if (!stored.length) { renderHistoryStatus(); return; }
    const map = new Map(state.sessions.map(session => [String(session.id), session]));
    stored.forEach(session => map.set(String(session.id), session));
    state.sessions = [...map.values()].sort((a,b) => new Date(b.startedAt)-new Date(a.startedAt)).slice(0, HISTORY_CAP);
    state.demo = false;
    renderAll();
    renderHistoryStatus();
  }

  function enforceCoreStats() {
    const content = $("#sessionDetailContent");
    if (!content || content.dataset.coreStatsBusy === "1") return;
    const cards = [...content.querySelectorAll(".fav-stat")];
    if (!cards.length) return;
    content.dataset.coreStatsBusy = "1";
    try {
      const coreNames = new Set(["Durée", "Distance", "Allure moyenne", "Vitesse moyenne", "FC moyenne"]);
      let section = content.querySelector(".pinned-stats");
      if (!section) {
        section = document.createElement("section");
        section.className = "pinned-stats";
        section.innerHTML = '<div class="detail-section-title"><div><p class="eyebrow">RÉSUMÉ</p><h3>Essentiel + mes favoris</h3></div><span>Essentiel</span></div><div class="pinned-stat-grid"></div>';
        const hero = content.querySelector(".detail-hero");
        hero?.insertAdjacentElement("afterend", section);
      }
      const grid = section.querySelector(".pinned-stat-grid");
      const title = section.querySelector("h3");
      const badge = section.querySelector(".detail-section-title > span");
      if (title) title.textContent = "Essentiel + mes favoris";
      if (badge) badge.textContent = "Fixe + ♥";

      cards.forEach(card => {
        const label = card.querySelector(":scope > span")?.textContent?.trim();
        if (!coreNames.has(label)) return;
        if (card.parentElement !== grid) grid?.prepend(card);
        card.classList.add("is-core-stat");
        const heart = card.querySelector(".heart-button");
        if (heart) {
          heart.hidden = true;
          heart.setAttribute("aria-hidden", "true");
        }
      });
    } finally {
      content.dataset.coreStatsBusy = "0";
    }
  }

  function watchActivityDetail() {
    const content = $("#sessionDetailContent");
    if (!content || content.dataset.v16Observed) return;
    content.dataset.v16Observed = "1";
    const observer = new MutationObserver(() => requestAnimationFrame(enforceCoreStats));
    observer.observe(content, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      hydrateHistory();
      renderHistoryStatus();
      watchActivityDetail();
      const version = $("#versionLabel");
      if (version) version.textContent = `TrainSync ${UI_VERSION} · historique complet · progression anatomique`;
    }, 100);
  });
})();
