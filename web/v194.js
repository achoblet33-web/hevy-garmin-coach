(() => {
  const RELEASE = "1.9.4";
  const RELEASE_TEXT = `TrainSync ${RELEASE} · version unifiée · cache sécurisé`;
  window.TRAINSYNC_RELEASE = RELEASE;

  function applyRelease() {
    const label = document.querySelector("#versionLabel");
    if (label && label.textContent !== RELEASE_TEXT) label.textContent = RELEASE_TEXT;
    document.documentElement.dataset.trainsyncVersion = RELEASE;
  }

  const previousRenderAll = typeof renderAll === "function" ? renderAll : null;
  if (previousRenderAll) {
    renderAll = function(...args) {
      const result = previousRenderAll.apply(this, args);
      applyRelease();
      return result;
    };
  }

  function lockReleaseLabel() {
    const label = document.querySelector("#versionLabel");
    if (!label || label.dataset.releaseLocked === "1") return;
    label.dataset.releaseLocked = "1";
    applyRelease();
    const observer = new MutationObserver(() => applyRelease());
    observer.observe(label, { childList: true, characterData: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    lockReleaseLabel();
    applyRelease();
    setTimeout(applyRelease, 150);
    setTimeout(applyRelease, 600);
    setTimeout(applyRelease, 1500);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) applyRelease();
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then(registration => registration.update())
        .catch(() => {});
    }
  });
})();
