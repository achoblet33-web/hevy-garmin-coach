(() => {
  const UI_VERSION = "2.2.4";
  const PROFILE_KEY = "trainsync-hybrid-profile-v22";
  const CLUB_KEY = "trainsync-club-running-v22";
  const READINESS_KEY = "trainsync-readiness-v22";

  const GROUPS = [
    { id:"chest", label:"Pectoraux", icon:"◒" },
    { id:"back", label:"Dos", icon:"↔" },
    { id:"shoulders", label:"Épaules", icon:"△" },
    { id:"biceps", label:"Biceps", icon:"⌁" },
    { id:"triceps", label:"Triceps", icon:"⋮" },
    { id:"legs", label:"Jambes", icon:"◇" },
    { id:"glutes", label:"Fessiers", icon:"◈" }
  ];

  let selectedGroups = [];
  let selectedPairingId = null;
  let pairingSuggestions = [];
  let requestToken = 0;

  const baseApiRequestV224 = typeof apiRequest === "function" ? apiRequest : null;
  if (baseApiRequestV224) {
    apiRequest = async function(path, options = {}, timeout) {
      if (String(path) === "/coach/strength-plan-v2" && selectedGroups.length) {
        let body = {};
        try { body = JSON.parse(options.body || "{}"); } catch {}
        options = {
          ...options,
          body: JSON.stringify({
            ...body,
            muscleSelection:[...selectedGroups],
            musclePairingId:selectedPairingId || "custom",
            forceMuscleCombination:true,
            muscleChoice:null,
            forceMuscleChoice:false
          })
        };
      }
      return baseApiRequestV224(path, options, timeout);
    };
  }

  const baseRenderAllV224 = typeof renderAll === "function" ? renderAll : null;
  if (baseRenderAllV224) {
    renderAll = function(...args) {
      const result = baseRenderAllV224.apply(this, args);
      setVersion();
      return result;
    };
  }
  const baseSynchronizeV224 = typeof synchronize === "function" ? synchronize : null;
  if (baseSynchronizeV224) {
    synchronize = async function(...args) {
      const result = await baseSynchronizeV224.apply(this, args);
      setVersion();
      return result;
    };
  }

  function injectPairingChoice() {
    const button = document.querySelector("#buildV22Strength");
    const builder = button?.closest(".builder-card");
    if (!button || !builder) return;

    builder.querySelector("#v221MuscleChoice")?.setAttribute("hidden", "");
    if (builder.querySelector("#v224MusclePairing")) return;

    selectedGroups = [];
    selectedPairingId = null;
    pairingSuggestions = [];

    const block = document.createElement("section");
    block.id = "v224MusclePairing";
    block.className = "v224-pairing-block";
    block.innerHTML = `
      <div class="v224-head">
        <div><span class="v224-step">FOCUS MUSCULAIRE</span><strong>Quels groupes aujourd’hui ?</strong></div>
        <small>Jusqu’à 3 groupes</small>
      </div>
      <p class="v224-intro">Le Coach te propose les associations les plus cohérentes avec ton historique, ta durée et ta récupération. Tu peux accepter une association ou composer la tienne.</p>

      <div class="v224-subhead"><strong>Associations conseillées</strong><span id="v224PairingState">Analyse…</span></div>
      <div id="v224PairingSuggestions" class="v224-suggestions">
        <div class="v224-loading">✦ Le Coach compare tes groupes récemment sollicités…</div>
      </div>

      <div class="v224-subhead composer"><strong>Composer moi-même</strong><span>1 à 3 groupes</span></div>
      <div class="v224-group-grid">
        ${GROUPS.map(group => `<button type="button" data-v224-group="${group.id}"><span>${group.icon}</span><strong>${group.label}</strong></button>`).join("")}
      </div>
      <div id="v224SelectionSummary" class="v224-selection-summary">Le Coach va d’abord te proposer ses meilleures associations.</div>`;

    const durationField = builder.querySelector("#v22StrengthDuration")?.closest("label");
    if (durationField) durationField.insertAdjacentElement("afterend", block);
    else builder.querySelector(".hybrid-card-head")?.insertAdjacentElement("afterend", block);

    block.querySelectorAll("[data-v224-group]").forEach(groupButton => {
      groupButton.addEventListener("click", () => toggleGroup(groupButton.dataset.v224Group));
    });

    const duration = document.querySelector("#v22StrengthDuration");
    duration?.addEventListener("change", () => loadPairingSuggestions(true));
    loadPairingSuggestions(false);
  }

  async function loadPairingSuggestions(keepSelection) {
    const container = document.querySelector("#v224PairingSuggestions");
    const stateLabel = document.querySelector("#v224PairingState");
    if (!container || !baseApiRequestV224) return;
    const token = ++requestToken;
    if (!keepSelection) {
      selectedGroups = [];
      selectedPairingId = null;
    }
    container.innerHTML = `<div class="v224-loading">✦ Analyse des associations adaptées à aujourd’hui…</div>`;
    if (stateLabel) stateLabel.textContent = "Analyse…";

    try {
      const data = await baseApiRequestV224("/coach/muscle-pairings", {
        method:"POST",
        body:JSON.stringify({
          durationMinutes:Number(document.querySelector("#v22StrengthDuration")?.value || 60),
          sessions:Array.isArray(window.state?.sessions) ? window.state.sessions : (typeof state !== "undefined" && Array.isArray(state.sessions) ? state.sessions : []),
          profile:loadJson(PROFILE_KEY, {}),
          readiness:loadJson(READINESS_KEY, {}),
          clubSchedule:loadJson(CLUB_KEY, { sessions:[] })
        })
      }, 25000);
      if (token !== requestToken) return;
      pairingSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      renderSuggestions(data.clubProtected === true);
      if (!selectedGroups.length && pairingSuggestions[0]?.groups?.length) {
        selectPairing(pairingSuggestions[0], true);
      }
      if (stateLabel) stateLabel.textContent = pairingSuggestions.length ? `${pairingSuggestions.length} options` : "Manuel";
    } catch (error) {
      if (token !== requestToken) return;
      pairingSuggestions = fallbackPairings();
      renderSuggestions(false);
      if (!selectedGroups.length) selectPairing(pairingSuggestions[0], true);
      if (stateLabel) stateLabel.textContent = "Suggestions locales";
    }
  }

  function renderSuggestions(clubProtected) {
    const container = document.querySelector("#v224PairingSuggestions");
    if (!container) return;
    if (!pairingSuggestions.length) {
      container.innerHTML = `<div class="v224-loading">Aucune association automatique disponible. Compose ta séance juste en dessous.</div>`;
      return;
    }
    container.innerHTML = pairingSuggestions.slice(0,4).map((item,index) => `
      <button type="button" class="v224-pair-card" data-v224-pair="${escapeText(item.id)}">
        <div class="v224-pair-top"><span>${index === 0 ? "✦ Recommandé" : "Option"}</span><em>${escapeText(item.recommendedDuration || "")}</em></div>
        <strong>${escapeText(item.label)}</strong>
        <small>${escapeText(item.reason || "")}</small>
        <p>${escapeText(item.context || "")}</p>
      </button>`).join("");
    container.querySelectorAll("[data-v224-pair]").forEach(button => {
      button.addEventListener("click", () => {
        const pairing = pairingSuggestions.find(x => String(x.id) === button.dataset.v224Pair);
        if (pairing) selectPairing(pairing, false);
      });
    });
    if (clubProtected) {
      container.insertAdjacentHTML("beforeend", `<div class="v224-club-note">🔒 Les associations jambes sont volontairement moins bien classées si une séance club exigeante est proche.</div>`);
    }
    updateSelectionUi();
  }

  function selectPairing(pairing, automatic) {
    selectedGroups = [...new Set((pairing.groups || []).map(String))].filter(isGroup).slice(0,3);
    selectedPairingId = String(pairing.id || "custom");
    updateSelectionUi();
    const summary = document.querySelector("#v224SelectionSummary");
    if (summary) {
      const names = labelsFor(selectedGroups);
      summary.innerHTML = `<strong>${automatic ? "✦ Choix conseillé" : "Ton choix"} : ${escapeText(names)}</strong><span>${escapeText(pairing.reason || "Le Coach adaptera le volume et l’ordre des exercices à cette association.")}</span>`;
    }
  }

  function toggleGroup(id) {
    if (!isGroup(id)) return;
    if (selectedGroups.includes(id)) {
      selectedGroups = selectedGroups.filter(x => x !== id);
    } else {
      if (selectedGroups.length >= 3) {
        const summary = document.querySelector("#v224SelectionSummary");
        if (summary) summary.innerHTML = `<strong>Maximum 3 groupes</strong><span>Retire un groupe avant d’en ajouter un autre.</span>`;
        return;
      }
      selectedGroups = [...selectedGroups, id];
    }
    selectedPairingId = exactPairingId(selectedGroups) || "custom";
    updateSelectionUi();
    const summary = document.querySelector("#v224SelectionSummary");
    if (summary) {
      summary.innerHTML = selectedGroups.length
        ? `<strong>Ta séance : ${escapeText(labelsFor(selectedGroups))}</strong><span>Le Coach répartira exercices, séries et récupération entre ${selectedGroups.length === 1 ? "ce groupe" : "ces groupes"}.</span>`
        : `<strong>Aucun groupe imposé</strong><span>Sélectionne 1 à 3 groupes ou choisis une association conseillée.</span>`;
    }
  }

  function updateSelectionUi() {
    document.querySelectorAll("[data-v224-group]").forEach(button => {
      button.classList.toggle("is-selected", selectedGroups.includes(button.dataset.v224Group));
    });
    document.querySelectorAll("[data-v224-pair]").forEach(button => {
      button.classList.toggle("is-selected", String(selectedPairingId) === button.dataset.v224Pair);
    });
  }

  function exactPairingId(groups) {
    const key = [...groups].sort().join("|");
    const pairing = pairingSuggestions.find(item => [...(item.groups || [])].sort().join("|") === key);
    return pairing?.id || null;
  }

  function fallbackPairings() {
    return [
      { id:"chest_triceps", label:"Pectoraux + triceps", groups:["chest","triceps"], recommendedDuration:"35–75 min", reason:"Association de poussée efficace : les triceps complètent naturellement le travail des pectoraux.", context:"Bonne option quand tu veux une séance dense et facile à progresser." },
      { id:"back_biceps", label:"Dos + biceps", groups:["back","biceps"], recommendedDuration:"35–75 min", reason:"Association de tirage cohérente : dos en priorité, biceps en complément.", context:"Permet de garder une séance lisible avec un bon transfert sur les tirages." },
      { id:"chest_back", label:"Pectoraux + dos", groups:["chest","back"], recommendedDuration:"55–100 min", reason:"Association antagoniste poussée/tirage pour un haut du corps équilibré.", context:"Particulièrement intéressante sur une séance de 60 minutes ou plus." },
      { id:"shoulders_arms", label:"Épaules + bras", groups:["shoulders","biceps","triceps"], recommendedDuration:"45–80 min", reason:"Association complémentaire avec une fatigue générale modérée.", context:"Bonne option entre deux séances plus exigeantes." }
    ];
  }

  function setVersion() {
    window.TRAINSYNC_RELEASE = UI_VERSION;
    document.documentElement.dataset.trainsyncVersion = UI_VERSION;
    const version = document.querySelector("#versionLabel");
    if (version) version.textContent = `TrainSync ${UI_VERSION} · associations musculaires intelligentes · Coach hybride`;
  }

  function injectStyle() {
    if (document.querySelector("#v224Style")) return;
    const style = document.createElement("style");
    style.id = "v224Style";
    style.textContent = `
      #v221MuscleChoice,.v221-muscle-choice{display:none!important}
      .v224-pairing-block{margin:16px 0;padding:16px;border:1px solid rgba(255,255,255,.09);border-radius:22px;background:linear-gradient(145deg,rgba(255,180,94,.055),rgba(255,255,255,.025))}
      .v224-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.v224-head>div{min-width:0}.v224-head strong{display:block;font-size:18px;line-height:1.2;margin-top:4px}.v224-head small{font-size:11px;color:var(--muted,#a7aaa5);white-space:nowrap}.v224-step{font-size:10px;letter-spacing:.14em;font-weight:800;color:#ffb45e}.v224-intro{font-size:12px;line-height:1.5;color:var(--muted,#a7aaa5);margin:10px 0 16px}
      .v224-subhead{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:12px 0 9px}.v224-subhead strong{font-size:13px}.v224-subhead span{font-size:10px;color:var(--muted,#a7aaa5)}.v224-subhead.composer{margin-top:18px}
      .v224-suggestions{display:grid;grid-template-columns:1fr;gap:8px}.v224-pair-card{appearance:none;width:100%;min-width:0;border:1px solid rgba(255,255,255,.09);border-radius:17px;padding:13px;background:rgba(0,0,0,.15);color:inherit;text-align:left;font:inherit}.v224-pair-card.is-selected{border-color:rgba(255,180,94,.82);background:rgba(255,180,94,.11)}.v224-pair-top{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}.v224-pair-top span{font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:#ffb45e}.v224-pair-top em{font-size:10px;color:var(--muted,#a7aaa5);font-style:normal}.v224-pair-card>strong{display:block;font-size:14px;margin-bottom:5px}.v224-pair-card>small{display:block;font-size:11px;line-height:1.4;color:#d7d8d4}.v224-pair-card>p{margin:6px 0 0;font-size:10px;line-height:1.35;color:var(--muted,#a7aaa5)}
      .v224-loading,.v224-club-note{font-size:11px;line-height:1.45;color:var(--muted,#a7aaa5);padding:12px;border-radius:14px;background:rgba(255,255,255,.035)}.v224-club-note{grid-column:1/-1;border:1px solid rgba(255,180,94,.12)}
      .v224-group-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.v224-group-grid button{min-height:48px;min-width:0;border:1px solid rgba(255,255,255,.09);border-radius:15px;background:rgba(0,0,0,.14);color:inherit;display:flex;align-items:center;gap:9px;padding:9px 11px;text-align:left;font:inherit}.v224-group-grid button>span{width:25px;height:25px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.055);flex:0 0 auto}.v224-group-grid button strong{font-size:12px}.v224-group-grid button.is-selected{border-color:rgba(255,180,94,.8);background:rgba(255,180,94,.12)}
      .v224-selection-summary{margin-top:12px;padding:12px 13px;border-radius:15px;background:rgba(255,255,255,.04);font-size:11px;line-height:1.4}.v224-selection-summary strong{display:block;font-size:12px;color:#f1f1ed;margin-bottom:3px}.v224-selection-summary span{color:var(--muted,#a7aaa5)}
      @media(min-width:520px){.v224-suggestions{grid-template-columns:repeat(2,minmax(0,1fr))}.v224-group-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:350px){.v224-group-grid{grid-template-columns:1fr}.v224-head{display:block}.v224-head small{display:block;margin-top:5px}}
    `;
    document.head.appendChild(style);
  }

  function loadJson(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value && typeof value === "object" ? value : fallback; } catch { return fallback; }
  }
  function isGroup(id) { return GROUPS.some(x => x.id === id); }
  function labelsFor(groups) { return groups.map(id => GROUPS.find(x => x.id === id)?.label).filter(Boolean).join(" + "); }
  function escapeText(value) { return String(value || "").replace(/[&<>\"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }

  document.addEventListener("click", event => {
    if (event.target.closest("#confirmHybridType") || event.target.closest("[data-v22-type]")) setTimeout(injectPairingChoice, 20);
    if (event.target.closest("#hybridAnalyzeButton")) {
      selectedGroups = [];
      selectedPairingId = null;
      pairingSuggestions = [];
    }
    setTimeout(setVersion, 0);
  });

  document.addEventListener("DOMContentLoaded", () => {
    injectStyle();
    setVersion();
    setTimeout(injectPairingChoice, 900);
  });
})();
