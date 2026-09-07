(() => {
  const UI_VERSION = "2.2.0";
  const PROFILE_KEY = "trainsync-hybrid-profile-v22";
  const CLUB_KEY = "trainsync-club-running-v22";
  const READINESS_KEY = "trainsync-readiness-v22";
  const PROGRAM_KEY = "trainsync-hybrid-program-v22";
  const VISUAL_KEY = "trainsync-visual-assessment-v22";
  const BLOCK_KEY = "trainsync-hybrid-block-start-v22";

  let hybridProfile = loadJson(PROFILE_KEY, defaultProfile());
  let clubSchedule = loadJson(CLUB_KEY, { sessions: [] });
  let readiness = loadJson(READINESS_KEY, { sleep: 3, energy: 3, soreness: 2, motivation: 3, note: "" });
  let hybridProgram = loadJson(PROGRAM_KEY, null);
  let visualAssessment = loadJson(VISUAL_KEY, null);
  let selectedType = null;
  let currentPlan = null;

  const baseRenderAllV22 = typeof renderAll === "function" ? renderAll : null;
  if (baseRenderAllV22) {
    renderAll = function(...args) {
      const result = baseRenderAllV22.apply(this, args);
      setVersion();
      return result;
    };
  }
  const baseSynchronizeV22 = typeof synchronize === "function" ? synchronize : null;
  if (baseSynchronizeV22) {
    synchronize = async function(...args) {
      const result = await baseSynchronizeV22.apply(this, args);
      setVersion();
      return result;
    };
  }

  function defaultProfile() {
    return {
      sessionsPerWeek: 5,
      strengthDuration: 60,
      cardioDuration: 45,
      strengthGoal: "Force + muscle athlétique",
      enduranceGoal: "Endurance, vitesse et économie de course",
      raceGoal: "Athlète hybride performant",
      priorityText: "",
      constraintsText: "",
      equipment: "Salle complète"
    };
  }

  function allSessions() {
    return (state.sessions || [])
      .filter(s => !String(s.id || "").startsWith("demo-"))
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      .slice(0, 520);
  }

  function setupHybridCoach() {
    const view = document.querySelector("#coachView");
    const intro = view?.querySelector(".coach-intro");
    if (!view || !intro) return;

    document.querySelector("#generateButton")?.setAttribute("hidden", "");
    document.querySelector("#suggestionsList")?.setAttribute("hidden", "");
    document.querySelector("#unifiedCoachFlow")?.setAttribute("hidden", "");
    document.querySelector("#strengthPlanner")?.setAttribute("hidden", "");
    document.querySelector("#coachFocusSummary")?.setAttribute("hidden", "");

    intro.querySelector(".eyebrow")?.replaceChildren(document.createTextNode("HYBRID PERFORMANCE COACH"));
    const h2 = intro.querySelector("h2");
    if (h2) h2.textContent = "Ton programme, autour de ta vraie semaine";
    const lead = intro.querySelector("h2 + p");
    if (lead) lead.textContent = "Les séances du club sont verrouillées. TrainSync construit la musculation, la récupération et les compléments cardio autour d’elles.";
    document.querySelector("#goalSelect")?.closest("label")?.setAttribute("hidden", "");
    document.querySelector("#goalSelect")?.setAttribute("hidden", "");

    let root = document.querySelector("#hybridCoachV22");
    if (!root) {
      root = document.createElement("div");
      root.id = "hybridCoachV22";
      root.className = "hybrid-coach-v22";
      intro.insertAdjacentElement("afterend", root);
    }
    renderHybridCoach();
  }

  function renderHybridCoach() {
    const root = document.querySelector("#hybridCoachV22");
    if (!root) return;
    root.innerHTML = `
      ${renderProfileCard()}
      ${renderClubCard()}
      ${renderReadinessCard()}
      <article class="hybrid-action-card">
        <div><p class="eyebrow">DÉCISION DU COACH</p><h3>Construire ma semaine et choisir aujourd’hui</h3></div>
        <p>Le coach croise historique Hevy/Garmin, charge, progression, disponibilité du jour et séances club imposées.</p>
        <button type="button" class="primary-button full" id="hybridAnalyzeButton">✦ Analyser et décider</button>
      </article>
      <div id="hybridProgramOutput">${hybridProgram ? renderProgram(hybridProgram) : renderEmptyProgram()}</div>
      <div id="hybridPlanBuilder"></div>
      <div id="hybridPlanPreview"></div>
      ${renderVisualCard()}`;

    bindProfile();
    bindClub();
    bindReadiness();
    bindProgramActions();
    bindVisual();
  }

  function renderProfileCard() {
    return `<article class="hybrid-card profile-card">
      <div class="hybrid-card-head"><div><p class="eyebrow">1 · PROFIL ATHLÈTE</p><h3>Ce que tu veux devenir</h3></div><span class="hybrid-badge">Hybride</span></div>
      <div class="hybrid-grid two">
        ${selectField("hybridSessionsPerWeek", "Séances totales / semaine", hybridProfile.sessionsPerWeek, [3,4,5,6,7])}
        ${selectField("hybridStrengthDuration", "Durée musculation", hybridProfile.strengthDuration, [30,45,60,75,90,120], " min")}
        ${selectField("hybridCardioDuration", "Durée cardio libre", hybridProfile.cardioDuration, [30,45,60,75,90,120], " min")}
        <label><span>Matériel</span><input id="hybridEquipment" value="${esc(hybridProfile.equipment)}" placeholder="Salle complète"></label>
      </div>
      <label><span>Objectif musculation</span><input id="hybridStrengthGoal" value="${esc(hybridProfile.strengthGoal)}"></label>
      <label><span>Objectif course / endurance</span><input id="hybridEnduranceGoal" value="${esc(hybridProfile.enduranceGoal)}"></label>
      <label><span>Cap athlète</span><input id="hybridRaceGoal" value="${esc(hybridProfile.raceGoal)}" placeholder="Ex. 10 km, Hyrox, athlète hybride"></label>
      <label><span>Priorités personnelles</span><textarea id="hybridPriorityText" rows="2" placeholder="Ex. plus de dos et épaules, garder de la force sur les jambes">${esc(hybridProfile.priorityText)}</textarea></label>
      <label><span>Contraintes permanentes</span><textarea id="hybridConstraintsText" rows="2" placeholder="Ex. disponibilité, exercices à éviter, contraintes de planning">${esc(hybridProfile.constraintsText)}</textarea></label>
    </article>`;
  }

  function renderClubCard() {
    const count = clubSchedule.sessions?.length || 0;
    return `<article class="hybrid-card club-card">
      <div class="hybrid-card-head"><div><p class="eyebrow">2 · COURSE EN CLUB</p><h3>Séances imposées</h3></div><span class="club-lock-badge">🔒 ${count}</span></div>
      <p class="hybrid-help">Ces séances sont prioritaires. TrainSync ne les modifie pas : il organise tout le reste autour. Si l’intensité est inconnue, le Coach la traite comme exigeante par prudence.</p>
      <div id="clubSessionRows" class="club-session-rows">${(clubSchedule.sessions || []).map(renderClubRow).join("")}</div>
      <button type="button" class="secondary-button full" id="addClubSession">+ Ajouter une séance club</button>
    </article>`;
  }

  function renderClubRow(session, index) {
    return `<div class="club-session-row" data-club-index="${index}">
      <div class="club-row-top"><strong>🔒 Séance ${index + 1}</strong><button type="button" class="club-remove" data-remove-club="${index}" aria-label="Supprimer">×</button></div>
      <div class="hybrid-grid two compact">
        <label><span>Date</span><input type="date" data-club-field="date" value="${esc(session.date || "")}"></label>
        <label><span>Heure</span><input type="time" data-club-field="time" value="${esc(session.time || "")}"></label>
        <label><span>Intensité</span><select data-club-field="intensity">
          ${option("unknown","À confirmer",session.intensity)}${option("easy","Facile",session.intensity)}${option("moderate","Modérée",session.intensity)}${option("hard","Exigeante",session.intensity)}
        </select></label>
        <label><span>Nom</span><input data-club-field="title" value="${esc(session.title || "Séance course club")}"></label>
      </div>
      <label><span>Contenu imposé</span><textarea rows="2" data-club-field="details" placeholder="Ex. 20 min échauffement + 10 × 400 m + récup + retour au calme">${esc(session.details || "")}</textarea></label>
    </div>`;
  }

  function renderReadinessCard() {
    const score = readinessScore(readiness);
    return `<article class="hybrid-card readiness-card">
      <div class="hybrid-card-head"><div><p class="eyebrow">3 · AUJOURD’HUI</p><h3>Disponibilité du jour</h3></div><span class="readiness-score">${score}%</span></div>
      <div class="hybrid-grid two">
        ${ratingField("readinessSleep", "Sommeil", readiness.sleep)}
        ${ratingField("readinessEnergy", "Énergie", readiness.energy)}
        ${ratingField("readinessSoreness", "Courbatures", readiness.soreness)}
        ${ratingField("readinessMotivation", "Motivation", readiness.motivation)}
      </div>
      <label><span>Note du jour</span><textarea id="readinessNote" rows="2" placeholder="Ex. jambes lourdes, très en forme, peu dormi…">${esc(readiness.note || "")}</textarea></label>
      <p class="readiness-hint">1 = faible · 5 = très élevé · pour les courbatures, 5 = très fortes</p>
    </article>`;
  }

  function renderEmptyProgram() {
    return `<article class="hybrid-empty"><span>✦</span><div><strong>Le Coach attend ta semaine</strong><p>Renseigne le planning club et ta disponibilité, puis lance l’analyse.</p></div></article>`;
  }

  function renderProgram(program) {
    const clubLocked = !!program.today?.clubLocked;
    const type = program.today?.recommendedType || "strength";
    selectedType = clubLocked ? "club" : type;
    const clubCount = program.club?.sessions?.length || 0;
    return `<section class="hybrid-program">
      <article class="hybrid-card program-hero">
        <div class="program-kicker"><span>Bloc ${Number(program.block?.currentWeek || 1)}/4</span><span>${clubCount} séance(s) club verrouillée(s)</span></div>
        <h3>${esc(program.block?.name || "Bloc hybride")}</h3>
        <p>${esc(program.athleteSummary || "")}</p>
        <div class="block-progress">${(program.block?.progression || []).map((x,i)=>`<div class="${i+1===Number(program.block?.currentWeek||1)?"active":""}"><b>S${i+1}</b><span>${esc(x.replace(/^Semaine\s*\d\s*[·:-]?\s*/i,""))}</span></div>`).join("")}</div>
      </article>

      <article class="hybrid-card">
        <div class="hybrid-card-head"><div><p class="eyebrow">SEMAINE</p><h3>Planning protégé</h3></div><span class="hybrid-badge">Club + Coach</span></div>
        <div class="hybrid-week">${(program.weeklyStructure || []).map(renderWeekDay).join("")}</div>
      </article>

      <article class="hybrid-card today-card ${clubLocked ? "club-locked" : type}">
        <div class="today-icon">${clubLocked ? "🔒" : type === "strength" ? "🏋️" : "🏃"}</div>
        <div class="today-copy"><p class="eyebrow">CE QUE JE FERAIS AUJOURD’HUI</p><h3>${esc(program.today?.headline || "Décision du Coach")}</h3>
          <div class="confidence">Confiance ${Number(program.today?.confidence || 0)}%</div>
          <div class="today-reasons">${(program.today?.rationale || []).map(x=>`<p>• ${esc(x)}</p>`).join("")}</div>
        </div>
        ${clubLocked ? renderLockedClubToday(program.today?.clubSession) : renderTypeChooser(type)}
      </article>

      <article class="hybrid-card priorities-card">
        <div class="hybrid-card-head"><div><p class="eyebrow">POURQUOI CE BLOC</p><h3>Priorités du Coach</h3></div></div>
        <div class="priority-list">${(program.priorities || []).map((p,i)=>`<div><span>${i+1}</span><div><strong>${esc(p.label)}</strong><small>${esc(p.reason)}</small></div></div>`).join("")}</div>
      </article>
    </section>`;
  }

  function renderWeekDay(item) {
    const locked = item.locked || item.source === "club";
    return `<div class="week-day ${locked ? "locked" : ""}"><div class="week-day-label"><strong>${esc(item.day || "Jour")}</strong>${locked ? "<span>🔒 CLUB</span>" : "<span>COACH</span>"}</div><div><b>${esc(item.title || "")}</b><small>${esc(item.focus || "")}</small><em>${esc(item.intensity || "")}</em></div></div>`;
  }

  function renderLockedClubToday(session) {
    return `<div class="locked-session-callout"><strong>Cette séance n’est pas générée par TrainSync.</strong><span>${esc(session?.details || "Suis le contenu transmis par ton club.")}</span><small>La prochaine musculation et les compléments cardio seront adaptés après sa synchronisation.</small></div>`;
  }

  function renderTypeChooser(recommended) {
    return `<div class="today-actions">
      <p>Valide la proposition ou force ton choix :</p>
      <div class="type-choice-grid">
        <button type="button" data-v22-type="strength" class="${recommended === "strength" ? "selected" : ""}"><span>🏋️</span><strong>Musculation</strong><small>${recommended === "strength" ? "Recommandé" : "Forcer"}</small></button>
        <button type="button" data-v22-type="cardio" class="${recommended === "cardio" ? "selected" : ""}"><span>🏃</span><strong>Cardio libre</strong><small>${recommended === "cardio" ? "Recommandé" : "Forcer"}</small></button>
      </div>
      <button type="button" class="primary-button full" id="confirmHybridType">Préparer cette séance</button>
    </div>`;
  }

  function renderVisualCard() {
    const reason = hybridProgram?.photoReason || "Facultatif : un bilan visuel peut aider à affiner certaines priorités musculaires visibles.";
    return `<article class="hybrid-card visual-card">
      <div class="hybrid-card-head"><div><p class="eyebrow">OPTIONNEL · BILAN VISUEL</p><h3>Affiner les priorités musculaires</h3></div><span class="hybrid-badge">Photos</span></div>
      <p class="hybrid-help">${esc(reason)}</p>
      ${visualAssessment ? `<div class="visual-result"><strong>${esc(visualAssessment.summary || "Bilan disponible")}</strong>${(visualAssessment.programAdjustments||[]).map(x=>`<span>• ${esc(x)}</span>`).join("")}</div>` : ""}
      <input id="hybridPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple>
      <button type="button" class="secondary-button full" id="analyzeHybridPhotos">Analyser jusqu’à 3 photos</button>
      <small class="privacy-note">TrainSync ne conserve pas les fichiers photo dans ton stockage local ; seul le bilan texte est mémorisé dans l’app.</small>
    </article>`;
  }

  function bindProfile() {
    ["hybridSessionsPerWeek","hybridStrengthDuration","hybridCardioDuration","hybridEquipment","hybridStrengthGoal","hybridEnduranceGoal","hybridRaceGoal","hybridPriorityText","hybridConstraintsText"].forEach(id => {
      document.querySelector(`#${id}`)?.addEventListener("change", saveProfileFromUi);
    });
  }

  function saveProfileFromUi() {
    hybridProfile = {
      sessionsPerWeek: Number(value("hybridSessionsPerWeek") || 5),
      strengthDuration: Number(value("hybridStrengthDuration") || 60),
      cardioDuration: Number(value("hybridCardioDuration") || 45),
      equipment: value("hybridEquipment"),
      strengthGoal: value("hybridStrengthGoal"),
      enduranceGoal: value("hybridEnduranceGoal"),
      raceGoal: value("hybridRaceGoal"),
      priorityText: value("hybridPriorityText"),
      constraintsText: value("hybridConstraintsText")
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(hybridProfile));
  }

  function bindClub() {
    document.querySelector("#addClubSession")?.addEventListener("click", () => {
      const next = nextDateISO(1);
      clubSchedule.sessions = [...(clubSchedule.sessions || []), { id:`club-${Date.now()}`, date:next, time:"19:00", intensity:"unknown", title:"Séance course club", details:"" }];
      saveClub();
      renderHybridCoach();
    });
    document.querySelectorAll("[data-remove-club]").forEach(button => button.addEventListener("click", () => {
      const index = Number(button.dataset.removeClub);
      clubSchedule.sessions.splice(index, 1);
      saveClub();
      renderHybridCoach();
    }));
    document.querySelectorAll(".club-session-row").forEach(row => {
      row.querySelectorAll("[data-club-field]").forEach(input => input.addEventListener("change", () => {
        const index = Number(row.dataset.clubIndex);
        const field = input.dataset.clubField;
        clubSchedule.sessions[index][field] = input.value;
        saveClub();
        const badge = document.querySelector(".club-lock-badge");
        if (badge) badge.textContent = `🔒 ${clubSchedule.sessions.length}`;
      }));
    });
  }

  function saveClub() {
    clubSchedule.sessions = (clubSchedule.sessions || []).filter(x => x && x.date).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    localStorage.setItem(CLUB_KEY, JSON.stringify(clubSchedule));
  }

  function bindReadiness() {
    ["readinessSleep","readinessEnergy","readinessSoreness","readinessMotivation","readinessNote"].forEach(id => {
      document.querySelector(`#${id}`)?.addEventListener("change", saveReadinessFromUi);
    });
    document.querySelector("#hybridAnalyzeButton")?.addEventListener("click", analyzeHybridProgram);
  }

  function saveReadinessFromUi() {
    readiness = {
      sleep: Number(value("readinessSleep") || 3),
      energy: Number(value("readinessEnergy") || 3),
      soreness: Number(value("readinessSoreness") || 2),
      motivation: Number(value("readinessMotivation") || 3),
      note: value("readinessNote")
    };
    localStorage.setItem(READINESS_KEY, JSON.stringify(readiness));
    const score = document.querySelector(".readiness-score");
    if (score) score.textContent = `${readinessScore(readiness)}%`;
  }

  async function analyzeHybridProgram() {
    saveProfileFromUi();
    saveReadinessFromUi();
    saveClub();
    if (!settings.relayToken) return showStatus("Connecte d’abord TrainSync au Worker dans Réglages.", true);
    const button = document.querySelector("#hybridAnalyzeButton");
    if (button) { button.disabled = true; button.textContent = "Analyse du bloc, du club et de ta récupération…"; }
    try {
      const blockWeek = currentBlockWeek();
      const data = await apiRequest("/coach/hybrid-program", {
        method: "POST",
        body: JSON.stringify({
          profile: hybridProfile,
          readiness,
          clubSchedule,
          visualAssessment,
          blockWeek,
          localDate: localDateISO(),
          localWeekday: new Date().toLocaleDateString("fr-FR", { weekday:"long" }),
          sessions: allSessions()
        })
      }, 65000);
      hybridProgram = data.program;
      if (!hybridProgram?.today) throw new Error("Le Coach n’a pas renvoyé de décision exploitable.");
      localStorage.setItem(PROGRAM_KEY, JSON.stringify(hybridProgram));
      currentPlan = null;
      renderHybridCoach();
      showStatus(data.degraded ? "Programme construit avec le moteur de secours intelligent." : "Bloc hybride et séance du jour mis à jour.");
      document.querySelector("#hybridProgramOutput")?.scrollIntoView({ behavior:"smooth", block:"start" });
    } catch (error) {
      showStatus(error.message, true);
    } finally {
      const current = document.querySelector("#hybridAnalyzeButton");
      if (current) { current.disabled = false; current.textContent = "✦ Analyser et décider"; }
      setVersion();
    }
  }

  function bindProgramActions() {
    document.querySelectorAll("[data-v22-type]").forEach(button => button.addEventListener("click", () => {
      selectedType = button.dataset.v22Type;
      document.querySelectorAll("[data-v22-type]").forEach(x => x.classList.toggle("selected", x.dataset.v22Type === selectedType));
    }));
    document.querySelector("#confirmHybridType")?.addEventListener("click", renderPlanBuilder);
  }

  function renderPlanBuilder() {
    if (!hybridProgram || hybridProgram.today?.clubLocked) return;
    const target = document.querySelector("#hybridPlanBuilder");
    if (!target) return;
    currentPlan = null;
    document.querySelector("#hybridPlanPreview").innerHTML = "";
    if (selectedType === "cardio") {
      target.innerHTML = `<article class="hybrid-card builder-card"><div class="hybrid-card-head"><div><p class="eyebrow">4 · SÉANCE COMPLÉMENTAIRE</p><h3>Cardio hors club</h3></div><span class="destination">→ Garmin</span></div>
        <p class="hybrid-help">Le coach ne remplace jamais une séance du club. Cette séance n’existe que si elle apporte quelque chose au bloc sans concurrencer le planning imposé.</p>
        ${selectField("v22CardioDuration","Durée",hybridProgram.today?.durationMinutes || hybridProfile.cardioDuration,[30,45,60,75,90,120]," min")}
        <label><span>Adaptation éventuelle</span><textarea id="v22CardioCustom" rows="2" placeholder="Ex. très facile, terrain vallonné, pas de fractionné"></textarea></label>
        <button type="button" class="primary-button full" id="buildV22Cardio">Construire la séance</button></article>`;
      document.querySelector("#buildV22Cardio")?.addEventListener("click", buildCardio);
    } else {
      target.innerHTML = `<article class="hybrid-card builder-card"><div class="hybrid-card-head"><div><p class="eyebrow">4 · SÉANCE MUSCULATION</p><h3>${esc(hybridProgram.today?.strengthFocus || "Musculation hybride")}</h3></div><span class="destination">→ Hevy</span></div>
        ${selectField("v22StrengthDuration","Durée",hybridProgram.today?.durationMinutes || hybridProfile.strengthDuration,[30,45,60,75,90,120]," min")}
        <label><span>Adaptation éventuelle</span><textarea id="v22StrengthCustom" rows="2" placeholder="Ex. accentue le dos, pas d’exercice X, je veux garder les jambes fraîches"></textarea></label>
        <button type="button" class="primary-button full" id="buildV22Strength">Construire la séance complète</button></article>`;
      document.querySelector("#buildV22Strength")?.addEventListener("click", buildStrength);
    }
    target.scrollIntoView({ behavior:"smooth", block:"nearest" });
  }

  async function buildStrength() {
    const button = document.querySelector("#buildV22Strength");
    if (button) { button.disabled = true; button.textContent = "Calcul exercices, charges et consignes…"; }
    try {
      const data = await apiRequest("/coach/strength-plan-v2", {
        method: "POST",
        body: JSON.stringify({
          durationMinutes: Number(value("v22StrengthDuration") || hybridProfile.strengthDuration),
          goal: hybridProfile.strengthGoal,
          focusId: "full",
          focusTitle: hybridProgram.today?.strengthFocus || "Musculation hybride",
          customFocus: value("v22StrengthCustom"),
          sessions: allSessions(),
          profile: hybridProfile,
          readiness,
          program: hybridProgram,
          visualAssessment,
          clubSchedule,
          blockWeek: currentBlockWeek(),
          localDate: localDateISO()
        })
      }, 70000);
      currentPlan = data.plan;
      if (!currentPlan?.exercises?.length) throw new Error("Aucun exercice exploitable dans la séance.");
      renderStrengthPreview();
    } catch (error) {
      showStatus(error.message, true);
    } finally {
      const current = document.querySelector("#buildV22Strength");
      if (current) { current.disabled = false; current.textContent = "Construire la séance complète"; }
    }
  }

  function renderStrengthPreview() {
    const target = document.querySelector("#hybridPlanPreview");
    if (!target || !currentPlan) return;
    target.innerHTML = `<article class="hybrid-card plan-preview-v22">
      <div class="hybrid-card-head"><div><p class="eyebrow">5 · APERÇU AVANT HEVY</p><h3>${esc(currentPlan.title)}</h3></div><span class="destination">Hevy</span></div>
      <div class="plan-summary-chips"><span>${Number(currentPlan.durationMinutes||0)} min</span><span>${Number(currentPlan.totalSets||0)} séries</span><span>${Number(currentPlan.advancedSets?.warmups||0)} chauffe</span><span>${Number(currentPlan.advancedSets?.dropsets||0)} drop</span></div>
      <p class="plan-rationale">${esc(currentPlan.rationale || "")}</p>
      <div class="exercise-v22-list">${currentPlan.exercises.map((ex,i)=>renderExercise(ex,i)).join("")}</div>
      <div class="final-actions-v22"><button type="button" class="secondary-button full" id="rebuildV22Plan">Modifier / recalculer</button><button type="button" class="primary-button full" id="publishV22Hevy">Valider et créer dans Hevy</button></div>
      <p class="publish-safety">Rien n’est envoyé avant ta validation. Les notes techniques ci-dessus seront également jointes aux exercices Hevy.</p>
    </article>`;
    document.querySelector("#rebuildV22Plan")?.addEventListener("click", buildStrength);
    document.querySelector("#publishV22Hevy")?.addEventListener("click", publishHevyV22);
    target.scrollIntoView({ behavior:"smooth", block:"nearest" });
  }

  function renderExercise(ex, index) {
    return `<article class="exercise-v22"><div class="exercise-v22-head"><span>${index+1}</span><div><strong>${esc(ex.title || "Exercice")}</strong><small>${labelNovelty(ex.novelty)} · repos ${Math.round(Number(ex.restSeconds||120)/30)/2} min</small></div></div>
      ${ex.notes ? `<p class="exercise-coach-note">${esc(ex.notes)}</p>` : ""}
      <div class="set-grid-v22"><div class="set-row-v22 head"><span>Type</span><span>Charge</span><span>Reps</span><span>RPE</span></div>${(ex.sets||[]).map(set=>`<div class="set-row-v22 ${esc(set.type||"normal")}"><span>${setLabel(set.type)}</span><strong>${set.weightKg != null ? `${Number(set.weightKg)} kg` : "Calibration"}</strong><strong>${set.reps ?? "—"}</strong><span>${set.rpe ?? "—"}</span></div>`).join("")}</div>
    </article>`;
  }

  async function publishHevyV22() {
    const button = document.querySelector("#publishV22Hevy");
    if (!currentPlan?.publish?.hevyRoutine || !button) return;
    button.disabled = true; button.textContent = "Création dans Hevy…";
    try {
      const data = await apiRequest("/publish/hevy", { method:"POST", body:JSON.stringify({ suggestion:{ title:currentPlan.title, publish:currentPlan.publish } }) }, 35000);
      button.textContent = "✓ Routine créée dans Hevy";
      showStatus(data.message || "Routine créée dans Hevy.");
    } catch (error) {
      button.disabled = false; button.textContent = "Valider et créer dans Hevy"; showStatus(error.message, true);
    }
  }

  async function buildCardio() {
    const button = document.querySelector("#buildV22Cardio");
    if (button) { button.disabled = true; button.textContent = "Construction autour du planning club…"; }
    try {
      const data = await apiRequest("/coach/cardio-plan-v2", {
        method:"POST",
        body:JSON.stringify({
          durationMinutes:Number(value("v22CardioDuration") || hybridProfile.cardioDuration),
          customFocus:value("v22CardioCustom"),
          sessions:allSessions(), profile:hybridProfile, readiness, program:hybridProgram, clubSchedule,
          blockWeek:currentBlockWeek(), localDate:localDateISO()
        })
      }, 55000);
      currentPlan = data.plan;
      if (!currentPlan?.blocks?.length) throw new Error("Aucun bloc cardio exploitable.");
      renderCardioPreview();
    } catch (error) { showStatus(error.message, true); }
    finally { const current=document.querySelector("#buildV22Cardio"); if(current){current.disabled=false;current.textContent="Construire la séance";} }
  }

  function renderCardioPreview() {
    const target=document.querySelector("#hybridPlanPreview"); if(!target||!currentPlan)return;
    target.innerHTML=`<article class="hybrid-card plan-preview-v22"><div class="hybrid-card-head"><div><p class="eyebrow">5 · APERÇU AVANT GARMIN</p><h3>${esc(currentPlan.title)}</h3></div><span class="destination">Garmin</span></div>
      <div class="plan-summary-chips"><span>${Number(currentPlan.durationMinutes||0)} min</span><span>${esc(currentPlan.focusLabel||"Cardio")}</span><span>≈ ${Number(currentPlan.estimatedDistanceKm||0)} km</span></div>
      <p class="plan-rationale">${esc(currentPlan.rationale||"")}</p>
      ${currentPlan.clubProtected?'<div class="club-protected-note">🔒 Intensité volontairement plafonnée pour protéger les séances du club.</div>':""}
      <div class="cardio-v22-blocks">${currentPlan.blocks.map((b,i)=>`<div><span>${i+1}</span><div><strong>${esc(b.name||"Bloc")}</strong><small>${b.durationSeconds?`${Number(b.durationSeconds)} s`:`${Number(b.durationMinutes||0)} min`} · ${esc(b.target||"")}</small><em>${esc(b.note||"")}</em></div></div>`).join("")}</div>
      <label><span>Jour prévu</span><input id="v22GarminDate" type="date" value="${nextDateISO(1)}"></label>
      <div class="final-actions-v22"><button type="button" class="secondary-button full" id="rebuildV22Cardio">Modifier / recalculer</button><button type="button" class="primary-button full" id="publishV22Garmin">Valider et envoyer à Garmin</button></div></article>`;
    document.querySelector("#rebuildV22Cardio")?.addEventListener("click",buildCardio);
    document.querySelector("#publishV22Garmin")?.addEventListener("click",publishGarminV22);
    target.scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  async function publishGarminV22(){const button=document.querySelector("#publishV22Garmin");if(!currentPlan?.publish?.garminWorkout||!button)return;button.disabled=true;button.textContent="Envoi vers Garmin…";try{const data=await apiRequest("/publish/garmin",{method:"POST",body:JSON.stringify({date:value("v22GarminDate")||nextDateISO(1),suggestion:{id:currentPlan.id,title:currentPlan.title,publish:currentPlan.publish}})},35000);button.textContent="✓ Séance envoyée";showStatus(data.message||"Séance envoyée vers Garmin.");}catch(error){button.disabled=false;button.textContent="Valider et envoyer à Garmin";showStatus(error.message,true);}}

  function bindVisual(){document.querySelector("#analyzeHybridPhotos")?.addEventListener("click",analyzePhotos);}
  async function analyzePhotos(){const input=document.querySelector("#hybridPhotos"),button=document.querySelector("#analyzeHybridPhotos");const files=[...(input?.files||[])].slice(0,3);if(!files.length)return showStatus("Choisis 1 à 3 photos.",true);if(button){button.disabled=true;button.textContent="Analyse visuelle…";}try{const images=[];for(const file of files)images.push(await compressImage(file));const data=await apiRequest("/coach/visual-assessment",{method:"POST",body:JSON.stringify({images,profile:hybridProfile})},65000);visualAssessment=data.assessment;localStorage.setItem(VISUAL_KEY,JSON.stringify(visualAssessment));showStatus("Bilan visuel enregistré. Le Coach recalcule maintenant le bloc avec ces priorités.");await analyzeHybridProgram();}catch(error){showStatus(error.message,true);}finally{const current=document.querySelector("#analyzeHybridPhotos");if(current){current.disabled=false;current.textContent="Analyser jusqu’à 3 photos";}}}

  function compressImage(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error);reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error("Photo illisible."));img.onload=()=>{const max=900,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL("image/jpeg",0.78));};img.src=reader.result;};reader.readAsDataURL(file);});}

  function currentBlockWeek(){let start=localStorage.getItem(BLOCK_KEY);const now=Date.now();if(!start||!Number.isFinite(new Date(start).getTime())||now-new Date(start).getTime()>=28*86400000){start=new Date().toISOString();localStorage.setItem(BLOCK_KEY,start);}return Math.min(4,Math.floor((now-new Date(start).getTime())/(7*86400000))+1);}
  function readinessScore(r){return Math.round(((Number(r.sleep||3)+Number(r.energy||3)+Number(r.motivation||3)+(6-Number(r.soreness||2)))/20)*100);}
  function selectField(id,label,current,options,suffix=""){return `<label><span>${esc(label)}</span><select id="${id}">${options.map(x=>`<option value="${x}" ${Number(current)===Number(x)?"selected":""}>${x}${suffix}</option>`).join("")}</select></label>`;}
  function ratingField(id,label,current){return `<label><span>${esc(label)}</span><select id="${id}">${[1,2,3,4,5].map(x=>`<option value="${x}" ${Number(current)===x?"selected":""}>${x} / 5</option>`).join("")}</select></label>`;}
  function option(value,label,current){return `<option value="${value}" ${String(current||"unknown")===value?"selected":""}>${label}</option>`;}
  function labelNovelty(v){return v==="new"?"Nouveau stimulus":v==="reintroduced"?"Réintroduit":"Progression";}
  function setLabel(v){return v==="warmup"?"W · Chauffe":v==="dropset"?"D · Drop":v==="failure"?"F · Échec":"S · Travail";}
  function value(id){return document.querySelector(`#${id}`)?.value?.trim?.() ?? document.querySelector(`#${id}`)?.value ?? "";}
  function loadJson(key,fallback){try{const x=JSON.parse(localStorage.getItem(key)||"null");return x??fallback;}catch{return fallback;}}
  function localDateISO(){const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`;}
  function nextDateISO(offset){const d=new Date();d.setDate(d.getDate()+offset);const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`;}
  function esc(value){return typeof escapeHtml==="function"?escapeHtml(String(value??"")):String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
  function setVersion(){window.TRAINSYNC_RELEASE=UI_VERSION;document.documentElement.dataset.trainsyncVersion=UI_VERSION;const node=document.querySelector("#versionLabel");if(node)node.textContent=`TrainSync ${UI_VERSION} · Hybrid Coach · séances club verrouillées · Hevy + Garmin`;}

  document.addEventListener("DOMContentLoaded",()=>{
    document.documentElement.classList.add("trainsync-v22");
    setVersion();
    setTimeout(()=>{setupHybridCoach();setVersion();},750);
    document.addEventListener("click",event=>{if(event.target.closest(".bottom-nav,#syncButton,#connectButton,#syncNowButton"))setTimeout(setVersion,0);},{passive:true});
  });
})();
