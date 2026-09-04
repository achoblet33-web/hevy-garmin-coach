(() => {
  const UI_VERSION = "1.8.0";
  let lastStrengthPlan = null;

  const baseApiRequest = apiRequest;
  apiRequest = async function(path, options = {}, timeout) {
    const data = await baseApiRequest(path, options, timeout);
    if (String(path).startsWith("/coach/strength-plan") && data?.plan) {
      lastStrengthPlan = data.plan;
      setTimeout(enhanceStrengthPreview, 0);
    }
    return data;
  };

  function enhanceStrengthPreview() {
    const root = $("#strengthPlanPreview");
    if (!root || !lastStrengthPlan?.exercises?.length) return;

    const oldSummary = root.querySelector(".advanced-set-summary");
    oldSummary?.remove();
    const advanced = lastStrengthPlan.advancedSets || { warmups: 0, dropsets: 0 };
    const header = root.querySelector(".plan-preview-head");
    if (header) {
      const summary = document.createElement("div");
      summary.className = "advanced-set-summary";
      summary.innerHTML = `
        <div><strong>${Number(advanced.warmups || 0)}</strong><span>série(s) d’échauffement</span></div>
        <div><strong>${Number(advanced.dropsets || 0)}</strong><span>dropset(s)</span></div>
        <p>${escapeHtml(advanced.strategy || "Échauffement ciblé selon le besoin réel de la séance.")}</p>`;
      header.insertAdjacentElement("afterend", summary);
    }

    const cards = [...root.querySelectorAll(".plan-exercise-card")];
    cards.forEach((card, exerciseIndex) => {
      const exercise = lastStrengthPlan.exercises[exerciseIndex];
      if (!exercise) return;
      const rows = [...card.querySelectorAll(".plan-set-row:not(.head)")];
      rows.forEach((row, setIndex) => {
        const set = exercise.sets?.[setIndex];
        if (!set) return;
        const type = set.type || "normal";
        row.classList.remove("set-warmup", "set-normal", "set-dropset", "set-failure");
        row.classList.add(`set-${type}`);
        const first = row.querySelector("span");
        if (first && !first.querySelector(".set-type-badge")) {
          const badge = document.createElement("b");
          badge.className = `set-type-badge ${type}`;
          badge.textContent = type === "warmup" ? "W" : type === "dropset" ? "D" : type === "failure" ? "F" : "S";
          badge.title = type === "warmup" ? "Échauffement" : type === "dropset" ? "Dropset" : type === "failure" ? "Échec" : "Série de travail";
          first.prepend(badge);
        }
      });

      const note = card.querySelector(".exercise-plan-note");
      const hasWarmup = exercise.sets?.some(set => set.type === "warmup");
      const hasDrop = exercise.sets?.some(set => set.type === "dropset");
      if ((hasWarmup || hasDrop) && !card.querySelector(".advanced-set-legend")) {
        const legend = document.createElement("div");
        legend.className = "advanced-set-legend";
        legend.textContent = [hasWarmup ? "W = échauffement" : "", hasDrop ? "D = dropset sans repos avant la baisse de charge" : ""].filter(Boolean).join(" · ");
        (note || card.querySelector(".plan-set-table"))?.insertAdjacentElement(note ? "afterend" : "beforebegin", legend);
      }
    });
  }

  function ensureGarminImportNotice() {
    const panel = $("#settingsView .connection-panel");
    if (!panel || $("#garminFullImportNotice")) return;
    const notice = document.createElement("div");
    notice.id = "garminFullImportNotice";
    notice.className = "garmin-full-import-notice";
    notice.innerHTML = `
      <strong>Historique Garmin : 2 activités seulement</strong>
      <p>Le diagnostic TrainSync confirme que l’ancien historique n’est pas actuellement présent dans Intervals.icu. Pour le récupérer : Intervals.icu → Settings → Connections → Garmin → <b>Import All Garmin Data</b>. Demande l’archive complète à Garmin puis suis l’import proposé par Intervals.icu.</p>`;
    panel.appendChild(notice);
  }

  function watchPreview() {
    const root = $("#strengthPlanPreview");
    if (!root || root.dataset.v18Observed) return;
    root.dataset.v18Observed = "1";
    new MutationObserver(() => requestAnimationFrame(enhanceStrengthPreview)).observe(root, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      watchPreview();
      ensureGarminImportNotice();
      const version = $("#versionLabel");
      if (version) version.textContent = `TrainSync ${UI_VERSION} · échauffements et dropsets intelligents · aperçu avant Hevy`;
    }, 300);
  });
})();
