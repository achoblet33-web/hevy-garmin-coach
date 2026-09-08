(() => {
  const UI_VERSION = "2.2.2";
  let muscleChoice = "coach";

  const CHOICES = [
    { id: "coach", label: "Suivre le coach", icon: "✦" },
    { id: "chest", label: "Pectoraux", icon: "◒" },
    { id: "back", label: "Dos", icon: "↔" },
    { id: "shoulders", label: "Épaules", icon: "△" },
    { id: "arms", label: "Bras", icon: "⌁" },
    { id: "legs", label: "Jambes · fessiers", icon: "◇" },
    { id: "full", label: "Full body", icon: "◎" }
  ];

  const baseApiRequestV221 = typeof apiRequest === "function" ? apiRequest : null;
  if (baseApiRequestV221) {
    apiRequest = async function(path, options = {}, timeout) {
      if (String(path) === "/coach/strength-plan-v2" && muscleChoice !== "coach") {
        let body = {};
        try { body = JSON.parse(options.body || "{}"); } catch {}
        options = {
          ...options,
          body: JSON.stringify({
            ...body,
            muscleChoice,
            forceMuscleChoice: true
          })
        };
      }
      return baseApiRequestV221(path, options, timeout);
    };
  }

  const baseRenderAllV221 = typeof renderAll === "function" ? renderAll : null;
  if (baseRenderAllV221) {
    renderAll = function(...args) {
      const result = baseRenderAllV221.apply(this, args);
      setVersion();
      return result;
    };
  }

  const baseSynchronizeV221 = typeof synchronize === "function" ? synchronize : null;
  if (baseSynchronizeV221) {
    synchronize = async function(...args) {
      const result = await baseSynchronizeV221.apply(this, args);
      setVersion();
      return result;
    };
  }

  function injectMuscleChoice() {
    const button = document.querySelector("#buildV22Strength");
    const builder = button?.closest(".builder-card");
    if (!button || !builder || builder.querySelector("#v221MuscleChoice")) return;

    muscleChoice = "coach";
    const coachFocus = builder.querySelector(".hybrid-card-head h3")?.textContent?.trim() || "la recommandation du Coach";
    const block = document.createElement("div");
    block.id = "v221MuscleChoice";
    block.className = "v221-muscle-choice";
    block.innerHTML = `
      <div class="v221-choice-head">
        <div><span class="v221-step">TON CHOIX DU JOUR</span><strong>Quel groupe veux-tu travailler ?</strong></div>
        <small>Le Coach proposait : ${escapeText(coachFocus)}</small>
      </div>
      <div class="v221-choice-grid">
        ${CHOICES.map(choice => `<button type="button" data-v221-muscle="${choice.id}" class="${choice.id === "coach" ? "is-selected" : ""}"><span>${choice.icon}</span><strong>${choice.label}</strong></button>`).join("")}
      </div>
      <p class="v221-choice-note">Tu peux suivre sa recommandation ou imposer le groupe qui te fait envie. Le Coach garde la main sur le volume, les charges, les répétitions, l’échauffement et la récupération.</p>`;

    const durationField = builder.querySelector("#v22StrengthDuration")?.closest("label");
    if (durationField) durationField.insertAdjacentElement("afterend", block);
    else builder.querySelector(".hybrid-card-head")?.insertAdjacentElement("afterend", block);

    block.querySelectorAll("[data-v221-muscle]").forEach(choiceButton => {
      choiceButton.addEventListener("click", () => {
        muscleChoice = choiceButton.dataset.v221Muscle || "coach";
        block.querySelectorAll("[data-v221-muscle]").forEach(item => item.classList.toggle("is-selected", item === choiceButton));
        const selected = CHOICES.find(x => x.id === muscleChoice);
        if (selected && muscleChoice !== "coach") {
          block.querySelector(".v221-choice-note").textContent = `${selected.label} devient ta priorité du jour. Le Coach construira la séance autour de ce choix tout en adaptant la fatigue et les charges.`;
        } else {
          block.querySelector(".v221-choice-note").textContent = "Tu suis la recommandation du Coach. Il choisit le groupe le plus cohérent avec ta semaine et ta récupération.";
        }
      });
    });
  }

  function setVersion() {
    window.TRAINSYNC_RELEASE = UI_VERSION;
    document.documentElement.dataset.trainsyncVersion = UI_VERSION;
    const version = document.querySelector("#versionLabel");
    if (version) version.textContent = `TrainSync ${UI_VERSION} · choix musculaire · publication Hevy vérifiée`;
  }

  function injectStyle() {
    if (document.querySelector("#v221Style")) return;
    const style = document.createElement("style");
    style.id = "v221Style";
    style.textContent = `
      .v221-muscle-choice{margin:16px 0;padding:16px;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:rgba(255,255,255,.035)}
      .v221-choice-head{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;margin-bottom:12px}.v221-choice-head>div{min-width:0}.v221-choice-head strong{display:block;font-size:17px;line-height:1.2;margin-top:4px}.v221-choice-head small{max-width:42%;font-size:11px;line-height:1.35;color:var(--muted,#a7aaa5);text-align:right}.v221-step{font-size:10px;letter-spacing:.13em;font-weight:800;color:#ffb45e}
      .v221-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.v221-choice-grid button{min-width:0;min-height:52px;border-radius:15px;border:1px solid rgba(255,255,255,.09);background:rgba(0,0,0,.16);color:inherit;display:flex;align-items:center;gap:9px;padding:10px 12px;text-align:left;font:inherit}.v221-choice-grid button>span{width:26px;height:26px;border-radius:9px;display:grid;place-items:center;background:rgba(255,255,255,.06);flex:0 0 auto}.v221-choice-grid button strong{font-size:13px;line-height:1.15}.v221-choice-grid button.is-selected{border-color:rgba(255,180,94,.75);background:rgba(255,180,94,.11)}.v221-choice-grid button.is-selected>span{background:rgba(255,180,94,.19)}
      .v221-choice-note{font-size:12px;line-height:1.45;color:var(--muted,#a7aaa5);margin:12px 2px 0}
      @media(min-width:520px){.v221-choice-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:360px){.v221-choice-head{display:block}.v221-choice-head small{display:block;max-width:none;text-align:left;margin-top:7px}.v221-choice-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function escapeText(value) {
    return String(value || "").replace(/[&<>\"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[char]));
  }

  document.addEventListener("click", event => {
    if (event.target.closest("#confirmHybridType")) setTimeout(injectMuscleChoice, 0);
    if (event.target.closest("[data-v22-type]")) setTimeout(injectMuscleChoice, 0);
    if (event.target.closest("#hybridAnalyzeButton")) muscleChoice = "coach";
    setTimeout(setVersion, 0);
  });

  document.addEventListener("DOMContentLoaded", () => {
    injectStyle();
    setVersion();
    setTimeout(injectMuscleChoice, 800);
  });
})();
