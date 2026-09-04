(() => {
  const UI_VERSION = "1.9.3";
  const HISTORY_DONE_KEY = "trainsync-full-history-imported-v1";
  const HISTORY_META_KEY = "trainsync-history-meta-v1";

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

    if (!quietStart) {
      showStatus(full ? "Import de tout ton historique Hevy + Garmin…" : "Synchronisation des séances récentes…");
    }
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
      if (full && !data.history) {
        warnings.unshift(`Le Worker ${data.version || "actuel"} a synchronisé les séances mais n’a pas renvoyé les métadonnées d’historique complet.`);
      }

      if (warnings.length) {
        showStatus(`${sessions.length} séance(s) reçue(s). ${warnings.join(" · ")}`, false);
      } else {
        showStatus(full
          ? `${sessions.length} séance(s) importée(s) depuis tout l’historique disponible.`
          : `${sessions.length} séance(s) récentes synchronisée(s).`);
      }
    } catch (error) {
      connection.status = "error";
      renderConnection();
      showStatus(error.message, true);
    } finally {
      button?.classList.remove("is-spinning");
      if (secondary) secondary.disabled = false;
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      const version = $("#versionLabel");
      if (version) version.textContent = `TrainSync ${UI_VERSION} · synchronisation compatible Worker 1.9+`;
    }, 450);
  });
})();
