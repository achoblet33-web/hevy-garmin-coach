(() => {
  const UI_VERSION = "1.9.2";

  // Corrige le changement d'APP_TOKEN : le jeton nouvellement saisi reste celui
  // testé par l'application même si Cloudflare le refuse temporairement.
  // L'ancienne version restaurait silencieusement l'ancien jeton après un 401.
  const baseApiRequestV192 = apiRequest;
  apiRequest = async function(path, options = {}, timeout) {
    try {
      return await baseApiRequestV192(path, options, timeout);
    } catch (error) {
      const message = String(error?.message || "");
      if (/APP_TOKEN incorrect|Unauthorized/i.test(message)) {
        throw new Error("APP_TOKEN refusé par le Worker. Vérifie que le secret APP_TOKEN a bien été modifié dans le Worker hevy-garmin-coach en Production, puis enregistré/déployé. Ne mets ni guillemets ni espace autour du jeton.");
      }
      throw error;
    }
  };

  connectBackend = async function() {
    const input = document.querySelector("#relayToken");
    const button = document.querySelector("#connectButton");
    const token = input?.value.trim() || "";
    if (!token) return showStatus("Entre le nouveau APP_TOKEN de ton Worker Cloudflare.", true);

    // On conserve immédiatement le nouveau jeton. En cas d'échec, on ne revient
    // plus automatiquement à l'ancien token caché dans le stockage local.
    settings.relayToken = token;
    persistSettings();
    connection.status = "checking";
    renderConnection();
    if (button) { button.disabled = true; button.textContent = "Test du nouveau jeton…"; }

    try {
      const status = await apiRequest("/status");
      connection.status = "connected";
      connection.configured = status.configured || null;
      connection.sources = null;
      renderConnection();
      showStatus("Nouveau APP_TOKEN accepté. Synchronisation en cours…");
      await synchronize({ quietStart: true });
    } catch (error) {
      // Le champ et le stockage gardent le token saisi pour permettre de retester
      // après le déploiement Cloudflare, sans restaurer une ancienne valeur.
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

  function placeActivityMap() {
    const content = document.querySelector("#sessionDetailContent");
    if (!content) return;

    const map = content.querySelector("#activityMapV15");
    const mapSection = map?.closest("section");
    if (!mapSection) return;

    const summary = content.querySelector(".pinned-stats");
    const statsSection = [...content.querySelectorAll("section.detail-section")].find(section =>
      section !== mapSection && /toutes les données disponibles/i.test(section.textContent || "")
    );

    if (summary) {
      if (summary.nextElementSibling !== mapSection) summary.insertAdjacentElement("afterend", mapSection);
    } else if (statsSection && statsSection.previousElementSibling !== mapSection) {
      statsSection.insertAdjacentElement("beforebegin", mapSection);
    }

    mapSection.classList.add("activity-map-between-stats");
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }

  function watchActivityDetail() {
    const content = document.querySelector("#sessionDetailContent");
    if (!content || content.dataset.v191Observed === "1") return;
    content.dataset.v191Observed = "1";

    const observer = new MutationObserver(() => requestAnimationFrame(placeActivityMap));
    observer.observe(content, { childList: true, subtree: true });
    placeActivityMap();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      watchActivityDetail();
      const version = document.querySelector("#versionLabel");
      if (version) version.textContent = `TrainSync ${UI_VERSION} · changement APP_TOKEN fiabilisé · carte entre résumé et statistiques`;
    }, 450);
  });
})();
