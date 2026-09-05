(() => {
  const RELEASE = "1.9.5";
  const RELEASE_TEXT = `TrainSync ${RELEASE} · GPS Garmin fiabilisé · cache sécurisé`;
  window.TRAINSYNC_RELEASE = RELEASE;

  function applyRelease() {
    const label = document.querySelector("#versionLabel");
    if (label && label.textContent !== RELEASE_TEXT) label.textContent = RELEASE_TEXT;
    document.documentElement.dataset.trainsyncVersion = RELEASE;
  }

  function placeMap() {
    const content = document.querySelector("#sessionDetailContent");
    if (!content) return;
    const map = content.querySelector("#activityMapV15, #activityMap");
    const section = map?.closest("section");
    if (!section) return;

    const summary = content.querySelector(".pinned-stats");
    const detailedStats = [...content.querySelectorAll("section.detail-section")].find(node =>
      node !== section && /toutes les données disponibles|données complètes/i.test(node.textContent || "")
    );

    if (summary && summary.nextElementSibling !== section) {
      summary.insertAdjacentElement("afterend", section);
    } else if (!summary && detailedStats && detailedStats.previousElementSibling !== section) {
      detailedStats.insertAdjacentElement("beforebegin", section);
    }

    section.classList.add("activity-map-between-stats");
    map.style.display = "block";
    map.style.width = "100%";
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    setTimeout(() => window.dispatchEvent(new Event("resize")), 180);
  }

  function lockReleaseLabel() {
    const label = document.querySelector("#versionLabel");
    if (!label || label.dataset.release195Locked === "1") return;
    label.dataset.release195Locked = "1";
    applyRelease();
    new MutationObserver(applyRelease).observe(label, { childList: true, characterData: true, subtree: true });
  }

  function watchDetail() {
    const content = document.querySelector("#sessionDetailContent");
    if (!content || content.dataset.v195Observed === "1") return;
    content.dataset.v195Observed = "1";
    new MutationObserver(() => requestAnimationFrame(placeMap)).observe(content, { childList: true, subtree: true });
    placeMap();
  }

  const previousRenderAll = typeof renderAll === "function" ? renderAll : null;
  if (previousRenderAll) {
    renderAll = function(...args) {
      const result = previousRenderAll.apply(this, args);
      applyRelease();
      return result;
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    lockReleaseLabel();
    watchDetail();
    applyRelease();
    setTimeout(applyRelease, 250);
    setTimeout(applyRelease, 900);
    setTimeout(placeMap, 500);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(registration => registration.update()).catch(() => {});
    }
  });
})();
