(() => {
  const UI_VERSION = "2.3.0";
  const PREF_KEY = "trainsync-strength-coach-v23";
  const READINESS_KEY = "trainsync-readiness-v22";
  const CLUB_KEY = "trainsync-club-running-v22";

  const EQUIPMENT = [
    "Cage à squat",
    "Leg extension",
    "Barre libre + disques + protection au sol",
    "Banc plat",
    "Banc incliné",
    "Vertical row",
    "Station développé couché",
    "Station développé incliné",
    "Preacher curl + machine assistée",
    "Développé militaire sur banc",
    "Poulie vis-à-vis réglable",
    "Extension du dos / banc lombaires",
    "Tirage poitrine machine à charges",
    "Barre de traction",
    "Station dips + relevés de jambes",
    "Hip thrust à charges",
    "Leg curl allongé",
    "Adduction / abduction de hanche à la poulie",
    "Kettlebells",
    "Zone tapis + sandbag + medicine ball",
    "Haltères jusqu’à 30 kg",
    "Barre hexagonale",
    "Barre EZ",
    "TRX",
    "Barre guidée / Smith machine + banc"
  ];

  const GROUPS = [
    ["chest","Pectoraux","◒"], ["back","Dos","↔"], ["shoulders","Épaules","△"],
    ["biceps","Biceps","⌁"], ["triceps","Triceps","⋮"], ["quadriceps","Quadriceps","◇"],
    ["hamstrings","Ischio-jambiers","≋"], ["glutes","Fessiers","◈"], ["calves","Mollets","⋀"], ["core","Abdos / Core","◎"]
  ].map(([id,label,icon]) => ({id,label,icon}));

  const PRESETS = [
    ["Pectoraux + triceps",["chest","triceps"]],
    ["Dos + biceps",["back","biceps"]],
    ["Pectoraux + dos",["chest","back"]],
    ["Push complet",["chest","shoulders","triceps"]],
    ["Pull complet",["back","biceps","shoulders"]],
    ["Jambes complètes",["quadriceps","hamstrings","glutes"]],
    ["Épaules + bras",["shoulders","biceps","triceps"]]
  ];

  let prefs = loadJson(PREF_KEY,{ mode:"suggest", objective:"hypertrophy", duration:60, groups:[], customFocus:"" });
  let suggestions = [];
  let currentPlan = null;
  let busy = false;

  const baseRenderAllV23 = typeof renderAll === "function" ? renderAll : null;
  if (baseRenderAllV23) {
    renderAll = function(...args) {
      const result = baseRenderAllV23.apply(this,args);
      setTimeout(() => { setupCoach(); injectEquipmentSettings(); setVersion(); },0);
      return result;
    };
  }
  const baseSynchronizeV23 = typeof synchronize === "function" ? synchronize : null;
  if (baseSynchronizeV23) {
    synchronize = async function(...args) {
      const result = await baseSynchronizeV23.apply(this,args);
      setTimeout(() => { setupCoach(); injectEquipmentSettings(); setVersion(); },0);
      return result;
    };
  }

  function setupCoach() {
    const view=document.querySelector("#coachView");
    const intro=view?.querySelector(".coach-intro");
    if(!view||!intro)return;

    document.querySelector("#hybridCoachV22")?.setAttribute("hidden","");
    document.querySelector("#suggestionsList")?.setAttribute("hidden","");
    document.querySelector("#generateButton")?.setAttribute("hidden","");
    document.querySelector("#goalSelect")?.closest("label")?.setAttribute("hidden","");
    document.querySelector("#goalSelect")?.setAttribute("hidden","");
    document.querySelector("#unifiedCoachFlow")?.setAttribute("hidden","");
    document.querySelector("#strengthPlanner")?.setAttribute("hidden","");

    const eyebrow=intro.querySelector(".eyebrow"); if(eyebrow)eyebrow.textContent="COACH MUSCULATION";
    const title=intro.querySelector("h2"); if(title)title.textContent="Construire la bonne séance aujourd’hui";
    const lead=intro.querySelector("h2 + p"); if(lead)lead.textContent="Historique Hevy + récupération + méthodes Delavier + matériel réel de ta salle. Aucun exercice hors inventaire.";

    let root=document.querySelector("#strengthCoachV23");
    if(!root){root=document.createElement("div");root.id="strengthCoachV23";root.className="strength-coach-v23";intro.insertAdjacentElement("afterend",root);}
    renderCoach();
  }

  function renderCoach() {
    const root=document.querySelector("#strengthCoachV23"); if(!root)return;
    root.innerHTML=`
      <article class="v23-card v23-control-card">
        <div class="v23-head"><div><p class="eyebrow">OBJECTIF DU JOUR</p><h3>Quel stimulus veux-tu ?</h3></div><span class="v23-source">Matériel verrouillé</span></div>
        <div class="v23-objectives">
          ${objectiveButton("force","Force","3–6 reps sur les mouvements de force")}
          ${objectiveButton("hypertrophy","Hypertrophie","≈ 8–12 reps, volume contrôlé")}
          ${objectiveButton("endurance","Endurance","≈ 15–20+ reps, récupérations courtes")}
        </div>
        <label class="v23-field"><span>Durée disponible</span><select id="v23Duration">${[30,45,60,75,90,120].map(x=>`<option value="${x}" ${Number(prefs.duration)===x?"selected":""}>${x} min</option>`).join("")}</select></label>
        <div class="v23-mode-tabs">
          <button type="button" data-v23-mode="suggest" class="${prefs.mode==="suggest"?"is-selected":""}">✦ Suggestion du Coach</button>
          <button type="button" data-v23-mode="manual" class="${prefs.mode==="manual"?"is-selected":""}">Je construis ma séance</button>
        </div>
      </article>
      <div id="v23ModeContent"></div>
      <div id="v23PlanPreview"></div>`;

    root.querySelectorAll("[data-v23-objective]").forEach(b=>b.addEventListener("click",()=>{prefs.objective=b.dataset.v23Objective;savePrefs();suggestions=[];currentPlan=null;renderCoach();}));
    root.querySelector("#v23Duration")?.addEventListener("change",e=>{prefs.duration=Number(e.target.value)||60;savePrefs();suggestions=[];currentPlan=null;renderMode();});
    root.querySelectorAll("[data-v23-mode]").forEach(b=>b.addEventListener("click",()=>{prefs.mode=b.dataset.v23Mode;currentPlan=null;savePrefs();renderCoach();}));
    renderMode();
  }

  function objectiveButton(id,label,sub) {
    return `<button type="button" data-v23-objective="${id}" class="${prefs.objective===id?"is-selected":""}"><strong>${label}</strong><small>${sub}</small></button>`;
  }

  function renderMode() {
    const host=document.querySelector("#v23ModeContent"); if(!host)return;
    document.querySelector("#v23PlanPreview").innerHTML="";
    if(prefs.mode==="manual") renderManual(host); else renderSuggestionMode(host);
  }

  function renderSuggestionMode(host) {
    host.innerHTML=`<article class="v23-card">
      <div class="v23-head"><div><p class="eyebrow">SUGGESTION DU COACH</p><h3>Qu’est-ce qui mérite du travail ?</h3></div><span class="v23-source">Historique réel</span></div>
      <p class="v23-help">Le Coach compare les groupes récemment travaillés, le temps depuis leur dernière exposition, ta charge de course récente et la durée disponible. Il ne propose ensuite que des mouvements réalisables avec ta salle.</p>
      <button type="button" class="primary-button full" id="v23Analyze">✦ Analyser mon historique</button>
      <div id="v23Suggestions">${suggestions.length?renderSuggestions():""}</div>
    </article>`;
    host.querySelector("#v23Analyze")?.addEventListener("click",analyzeSuggestions);
    bindSuggestionCards();
  }

  function renderSuggestions() {
    return `<div class="v23-suggestion-list">${suggestions.map((s,i)=>`<button type="button" class="v23-suggestion" data-v23-suggestion="${esc(s.id)}">
      <div class="v23-sug-top"><span>${i===0?"✦ Recommandé":"Option"}</span><em>${esc(s.objective||"")}</em></div>
      <strong>${esc(s.label)}</strong><p>${esc(s.reason||"")}</p><small>${esc(s.context||"")}</small>
      <b>Construire cette séance →</b>
    </button>`).join("")}</div>`;
  }

  async function analyzeSuggestions() {
    if(busy)return; busy=true;
    const button=document.querySelector("#v23Analyze"); if(button){button.disabled=true;button.textContent="Analyse des groupes et de la récupération…";}
    try {
      const data=await apiRequest("/coach/strength-suggestions-v3",{method:"POST",body:JSON.stringify({
        objective:prefs.objective,durationMinutes:prefs.duration,sessions:allSessions(),clubSchedule:loadJson(CLUB_KEY,{sessions:[]})
      })},40000);
      suggestions=Array.isArray(data.suggestions)?data.suggestions:[];
      const container=document.querySelector("#v23Suggestions"); if(container)container.innerHTML=suggestions.length?renderSuggestions():`<p class="v23-help">Aucune suggestion exploitable : utilise le mode « Je construis ma séance ».</p>`;
      bindSuggestionCards();
    } catch(error){showStatus(error.message,true);} finally {busy=false;if(button){button.disabled=false;button.textContent="✦ Analyser mon historique";}}
  }

  function bindSuggestionCards() {
    document.querySelectorAll("[data-v23-suggestion]").forEach(button=>button.addEventListener("click",()=>{
      const s=suggestions.find(x=>String(x.id)===button.dataset.v23Suggestion); if(s)buildPlan(s.groups,s.id,"");
    }));
  }

  function renderManual(host) {
    host.innerHTML=`<article class="v23-card">
      <div class="v23-head"><div><p class="eyebrow">JE CONSTRUIS MA SÉANCE</p><h3>Choisis jusqu’à 3 groupes</h3></div><span class="v23-source">Assisté par le Coach</span></div>
      <p class="v23-help">Tu choisis les groupes. TrainSync décide ensuite des exercices, de l’ordre, des charges, des reps, des RPE, de l’échauffement et de l’éventuel dropset selon l’objectif.</p>
      <div class="v23-presets">${PRESETS.map(([label,groups])=>`<button type="button" data-v23-preset="${groups.join("|")}">${esc(label)}</button>`).join("")}</div>
      <div class="v23-groups">${GROUPS.map(g=>`<button type="button" data-v23-group="${g.id}" class="${prefs.groups.includes(g.id)?"is-selected":""}"><span>${g.icon}</span><strong>${g.label}</strong></button>`).join("")}</div>
      <p id="v23GroupSummary" class="v23-summary">${groupSummary()}</p>
      <label class="v23-field"><span>Consigne facultative</span><textarea id="v23Custom" rows="2" placeholder="Ex. priorité haut des pectoraux, éviter un mouvement, rester frais pour la course…">${esc(prefs.customFocus||"")}</textarea></label>
      <button type="button" class="primary-button full" id="v23BuildManual" ${prefs.groups.length?"":"disabled"}>Construire ma séance</button>
    </article>`;
    host.querySelectorAll("[data-v23-group]").forEach(b=>b.addEventListener("click",()=>toggleGroup(b.dataset.v23Group)));
    host.querySelectorAll("[data-v23-preset]").forEach(b=>b.addEventListener("click",()=>{prefs.groups=b.dataset.v23Preset.split("|").slice(0,3);savePrefs();renderManual(host);}));
    host.querySelector("#v23Custom")?.addEventListener("input",e=>{prefs.customFocus=e.target.value.slice(0,300);savePrefs();});
    host.querySelector("#v23BuildManual")?.addEventListener("click",()=>buildPlan([...prefs.groups],"custom",prefs.customFocus));
  }

  function toggleGroup(id) {
    if(!GROUPS.some(g=>g.id===id))return;
    if(prefs.groups.includes(id))prefs.groups=prefs.groups.filter(x=>x!==id);
    else if(prefs.groups.length<3)prefs.groups=[...prefs.groups,id];
    else return showStatus("Maximum 3 groupes musculaires par séance.",true);
    savePrefs();renderManual(document.querySelector("#v23ModeContent"));
  }

  function groupSummary() {
    if(!prefs.groups.length)return "Sélectionne 1 à 3 groupes.";
    return `Séance choisie : ${prefs.groups.map(id=>GROUPS.find(g=>g.id===id)?.label).filter(Boolean).join(" + ")}`;
  }

  async function buildPlan(groups,associationId,customFocus) {
    if(busy||!groups?.length)return;busy=true;currentPlan=null;
    const preview=document.querySelector("#v23PlanPreview"); if(preview)preview.innerHTML=`<article class="v23-card v23-loading">✦ Construction des exercices, charges, répétitions et RPE…</article>`;
    try {
      const data=await apiRequest("/coach/strength-plan-v3",{method:"POST",body:JSON.stringify({
        objective:prefs.objective,durationMinutes:prefs.duration,groups,associationId,customFocus:customFocus||"",
        sessions:allSessions(),readiness:loadJson(READINESS_KEY,{}),clubSchedule:loadJson(CLUB_KEY,{sessions:[]})
      })},70000);
      currentPlan=data.plan;
      if(!currentPlan?.exercises?.length)throw new Error("Le Coach n’a pas produit de séance exploitable.");
      renderPlan();
    } catch(error){if(preview)preview.innerHTML="";showStatus(error.message,true);} finally {busy=false;}
  }

  function renderPlan() {
    const host=document.querySelector("#v23PlanPreview"); if(!host||!currentPlan)return;
    host.innerHTML=`<article class="v23-card v23-plan">
      <div class="v23-head"><div><p class="eyebrow">APERÇU AVANT HEVY</p><h3>${esc(currentPlan.title)}</h3></div><span class="v23-source">${Number(currentPlan.durationMinutes||0)} min</span></div>
      <div class="v23-plan-chips"><span>${esc(currentPlan.objective?.label||"")}</span><span>${Number(currentPlan.totalSets||0)} séries</span><span>${Number(currentPlan.advancedSets?.warmups||0)} chauffe</span><span>${Number(currentPlan.advancedSets?.dropsets||0)} drop</span></div>
      <p class="v23-rationale">${esc(currentPlan.rationale||"")}</p>
      <div class="v23-exercises">${currentPlan.exercises.map((ex,i)=>renderExercise(ex,i)).join("")}</div>
      <div class="v23-final"><button type="button" class="secondary-button full" id="v23Rebuild">Recalculer</button><button type="button" class="primary-button full" id="v23Publish">Valider et créer dans Hevy</button></div>
      <p class="v23-safe">Aucun envoi avant validation. Les notes Hevy incluent les charges, répétitions, RPE et consignes de chaque exercice.</p>
    </article>`;
    host.querySelector("#v23Rebuild")?.addEventListener("click",()=>buildPlan(currentPlan.groups,currentPlan.associationId,prefs.customFocus||""));
    host.querySelector("#v23Publish")?.addEventListener("click",publishHevy);
    host.scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function renderExercise(ex,index) {
    return `<article class="v23-exercise"><div class="v23-ex-head"><span>${index+1}</span><div><strong>${esc(ex.title||"Exercice")}</strong><small>${esc(ex.groupLabel||"")} · ${esc(ex.equipment||"")} · repos ${Math.round(Number(ex.restSeconds||90)/30)/2} min</small></div></div>
      <p>${esc(ex.notes||"")}</p>
      <div class="v23-set-grid"><div class="v23-set-row head"><span>Type</span><span>Charge</span><span>Reps</span><span>RPE</span></div>${(ex.sets||[]).map((s,i)=>`<div class="v23-set-row ${esc(s.type||"normal")}"><span>${setLabel(s.type,i)}</span><strong>${s.weightKg!=null?`${fmt(s.weightKg)} kg`:"Calibration"}</strong><strong>${s.reps??"—"}</strong><span>${s.rpe!=null?fmt(s.rpe):"—"}</span></div>`).join("")}</div>
    </article>`;
  }

  async function publishHevy() {
    const button=document.querySelector("#v23Publish"); if(!button||!currentPlan?.publish?.hevyRoutine)return;
    button.disabled=true;button.textContent="Création et vérification dans Hevy…";
    try {
      const data=await apiRequest("/publish/hevy",{method:"POST",body:JSON.stringify({suggestion:{id:currentPlan.id,title:currentPlan.title,publish:currentPlan.publish}})},45000);
      if(data.verified===false){button.disabled=false;button.textContent="Vérifier dans Hevy";showStatus(data.message||"Hevy a accepté la routine mais la vérification n’est pas terminée.");return;}
      button.textContent="✓ Routine confirmée dans Hevy";showStatus(data.message||"Routine créée et confirmée dans Hevy.");
    } catch(error){button.disabled=false;button.textContent="Valider et créer dans Hevy";showStatus(error.message,true);}
  }

  function injectEquipmentSettings() {
    const view=document.querySelector("#settingsView"); if(!view||view.querySelector("#v23GymEquipment"))return;
    const connection=view.querySelector(".connection-panel");
    const card=document.createElement("article");card.id="v23GymEquipment";card.className="panel v23-gym-panel";
    card.innerHTML=`<div class="v23-head"><div><p class="eyebrow">MATÉRIEL COACH</p><h3>Ma salle · source de vérité</h3></div><span class="v23-source">${EQUIPMENT.length} équipements</span></div>
      <p class="muted">Liste verrouillée utilisée par le Coach. Une séance ne doit pas contenir de mouvement nécessitant une machine absente.</p>
      <details><summary>Voir l’inventaire complet</summary><div class="v23-equipment-list">${EQUIPMENT.map(x=>`<span>✓ ${esc(x)}</span>`).join("")}</div></details>`;
    connection?.insertAdjacentElement("afterend",card);
  }

  function allSessions(){try{return (typeof state!=="undefined"&&Array.isArray(state.sessions)?state.sessions:[]).filter(s=>!String(s.id||"").startsWith("demo-")).slice(0,520);}catch{return[];}}
  function setLabel(type,index){return type==="warmup"?`W${index+1}`:type==="dropset"?`D${index+1}`:type==="failure"?`F${index+1}`:`S${index+1}`;}
  function fmt(value){const n=Number(value);return Number.isFinite(n)?String(Math.round(n*10)/10).replace(".",","):"—";}
  function loadJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||"")||fallback;}catch{return fallback;}}
  function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}
  function esc(value){return String(value||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}

  function setVersion(){window.TRAINSYNC_RELEASE=UI_VERSION;document.documentElement.dataset.trainsyncVersion=UI_VERSION;const label=document.querySelector("#versionLabel");if(label)label.textContent=`TrainSync ${UI_VERSION} · Coach musculation · matériel salle verrouillé`;}

  function injectStyle(){if(document.querySelector("#v23Style"))return;const style=document.createElement("style");style.id="v23Style";style.textContent=`
    #hybridCoachV22,#unifiedCoachFlow,#strengthPlanner{display:none!important}.strength-coach-v23{display:grid;gap:14px;margin-top:14px}.v23-card{border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:17px;background:linear-gradient(145deg,rgba(255,177,92,.055),rgba(255,255,255,.022));box-shadow:0 10px 30px rgba(0,0,0,.12)}.v23-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.v23-head h3{margin:3px 0 0;font-size:19px;line-height:1.2}.v23-source{font-size:10px;color:#ffb45e;border:1px solid rgba(255,180,94,.2);background:rgba(255,180,94,.08);border-radius:999px;padding:6px 9px;white-space:nowrap}.v23-help,.v23-rationale,.v23-safe{font-size:12px;line-height:1.5;color:var(--muted,#a7aaa5)}
    .v23-objectives{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:15px 0}.v23-objectives button{min-width:0;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:12px 8px;background:rgba(0,0,0,.15);color:inherit;text-align:left}.v23-objectives button strong{display:block;font-size:13px}.v23-objectives button small{display:block;font-size:9px;line-height:1.3;color:var(--muted,#a7aaa5);margin-top:4px}.v23-objectives button.is-selected{border-color:rgba(255,180,94,.78);background:rgba(255,180,94,.11)}.v23-field{display:grid;gap:7px;margin:12px 0}.v23-field>span{font-size:11px;font-weight:750;color:#d7d7d3}.v23-field select,.v23-field textarea{width:100%;box-sizing:border-box}
    .v23-mode-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:14px}.v23-mode-tabs button{min-height:48px;border-radius:15px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.12);color:inherit;font-weight:750}.v23-mode-tabs button.is-selected{background:rgba(255,180,94,.12);border-color:rgba(255,180,94,.65)}
    .v23-suggestion-list{display:grid;gap:9px;margin-top:13px}.v23-suggestion{width:100%;text-align:left;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:14px;background:rgba(0,0,0,.14);color:inherit}.v23-suggestion:first-child{border-color:rgba(255,180,94,.55);background:rgba(255,180,94,.07)}.v23-sug-top{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}.v23-sug-top span{font-size:9px;font-weight:850;letter-spacing:.08em;color:#ffb45e}.v23-sug-top em{font-size:10px;font-style:normal;color:var(--muted,#a7aaa5)}.v23-suggestion>strong{display:block;font-size:16px}.v23-suggestion>p,.v23-suggestion>small{display:block;font-size:11px;line-height:1.4;color:#d4d4d0;margin:6px 0}.v23-suggestion>small{color:var(--muted,#a7aaa5)}.v23-suggestion>b{display:block;font-size:11px;color:#ffb45e;margin-top:9px}
    .v23-presets{display:flex;gap:7px;overflow:auto;padding:3px 0 10px;scrollbar-width:none}.v23-presets button{flex:0 0 auto;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:8px 11px;background:rgba(255,255,255,.035);color:inherit;font-size:11px}.v23-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.v23-groups button{min-height:50px;display:flex;align-items:center;gap:9px;border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:10px 12px;background:rgba(0,0,0,.13);color:inherit;text-align:left}.v23-groups button>span{width:26px;height:26px;border-radius:9px;background:rgba(255,255,255,.05);display:grid;place-items:center}.v23-groups button strong{font-size:12px}.v23-groups button.is-selected{border-color:rgba(255,180,94,.7);background:rgba(255,180,94,.1)}.v23-summary{font-size:12px;color:#ffca91;margin:12px 2px}
    .v23-plan-chips{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.v23-plan-chips span{font-size:10px;border-radius:999px;padding:6px 9px;background:rgba(255,255,255,.055);color:#ddd}.v23-exercises{display:grid;gap:10px}.v23-exercise{border:1px solid rgba(255,255,255,.07);border-radius:18px;padding:13px;background:rgba(0,0,0,.13)}.v23-ex-head{display:flex;gap:10px;align-items:flex-start}.v23-ex-head>span{width:28px;height:28px;border-radius:9px;background:rgba(255,180,94,.13);color:#ffb45e;display:grid;place-items:center;font-weight:850}.v23-ex-head>div{min-width:0}.v23-ex-head strong{display:block;font-size:14px}.v23-ex-head small{display:block;font-size:10px;line-height:1.35;color:var(--muted,#a7aaa5);margin-top:3px}.v23-exercise>p{font-size:11px;line-height:1.45;color:#d5d5d1}.v23-set-grid{display:grid;gap:4px;margin-top:10px}.v23-set-row{display:grid;grid-template-columns:1.05fr 1fr .72fr .65fr;gap:5px;align-items:center;padding:7px 8px;border-radius:10px;background:rgba(255,255,255,.032);font-size:10px}.v23-set-row.head{background:transparent;color:var(--muted,#a7aaa5);padding-top:0}.v23-set-row.warmup{opacity:.72}.v23-set-row.dropset{background:rgba(255,180,94,.07)}.v23-final{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:15px}.v23-loading{text-align:center;color:#ffca91}
    .v23-gym-panel details{margin-top:12px}.v23-gym-panel summary{cursor:pointer;font-weight:750;font-size:12px;color:#ffca91}.v23-equipment-list{display:grid;grid-template-columns:1fr;gap:6px;margin-top:12px}.v23-equipment-list span{font-size:11px;line-height:1.35;color:#d4d4d0;padding:7px 9px;border-radius:11px;background:rgba(255,255,255,.035)}
    @media(max-width:390px){.v23-objectives{grid-template-columns:1fr}.v23-final{grid-template-columns:1fr}.v23-mode-tabs{grid-template-columns:1fr}.v23-head{display:block}.v23-source{display:inline-block;margin-top:8px}}
  `;document.head.appendChild(style);}

  document.addEventListener("click",event=>{if(event.target.closest('[data-target="coach"]'))setTimeout(setupCoach,0);if(event.target.closest('[data-target="settings"]'))setTimeout(injectEquipmentSettings,0);});
  document.addEventListener("DOMContentLoaded",()=>{injectStyle();setupCoach();injectEquipmentSettings();setVersion();});
})();
