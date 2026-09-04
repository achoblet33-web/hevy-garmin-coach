(() => {
  const UI_VERSION = "1.9.1";

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
      if (version) version.textContent = `TrainSync ${UI_VERSION} · carte entre résumé et statistiques détaillées`;
    }, 350);
  });
})();
