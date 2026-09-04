import v16 from "./worker-v16.js";

const HEVY = "https://api.hevyapp.com/v1";
const INTERVALS = "https://intervals.icu/api/v1";
const VERSION = "1.7.0";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, version: VERSION, configured: config(env), historyCap: 5000 });
    }

    if (url.pathname === "/status" && request.method === "GET") {
      const denied = auth(request, env); if (denied) return denied;
      return json({ ok: true, authenticated: true, version: VERSION, configured: config(env), historyCap: 5000 });
    }

    if (url.pathname === "/sync" && request.method === "GET") {
      const denied = auth(request, env); if (denied) return denied;
      const base = await v16.fetch(request, env, ctx);
      if (!base.ok || !(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID)) return base;
      try {
        const data = await base.json();
        const all = url.searchParams.get("all") === "1";
        const days = clampInt(url.searchParams.get("days"), 180, 7, 3650);
        const garmin = await fetchGarminHistory(env, all ? null : days);
        const nonGarmin = (Array.isArray(data.sessions) ? data.sessions : []).filter(s => s.source !== "Garmin");
        const merged = dedupe([...nonGarmin, ...garmin.sessions]).slice(0, 5000);
        const history = {
          ...(data.history || {}),
          returned: merged.length,
          sourceMeta: {
            ...(data.history?.sourceMeta || {}),
            garmin: garmin.meta
          }
        };
        data.sessions = merged;
        data.version = VERSION;
        data.history = history;
        data.sources = {
          ...(data.sources || {}),
          garmin: { configured: true, ok: true, count: garmin.sessions.length, error: null }
        };
        if (garmin.sessions.length <= 2 && all) {
          data.warnings = [...(data.warnings || []), "Intervals.icu ne renvoie actuellement que 2 activités Garmin sur l’historique demandé. TrainSync a interrogé plusieurs périodes et demandé explicitement une limite élevée : s’il n’y en a pas plus, elles ne sont probablement pas encore présentes dans Intervals.icu."];
        }
        return json(data);
      } catch {
        return base;
      }
    }

    if (url.pathname === "/coach/strength-options" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      if (!env.HEVY_API_KEY) return json({ error: "HEVY_API_KEY is not configured" }, 503);
      const body = await request.json().catch(() => ({}));
      const durationMinutes = clampInt(body.durationMinutes, 60, 20, 120);
      const sessions = Array.isArray(body.sessions) ? body.sessions.filter(s => s.source === "Hevy").slice(0, 260) : [];
      try {
        const templates = await fetchExerciseTemplates(env.HEVY_API_KEY);
        const options = buildBodyFocusOptions(sessions, templates, durationMinutes, body.goal || "Équilibre");
        return json({ ok: true, durationMinutes, options, version: VERSION });
      } catch (error) {
        return json({ error: safe(error) }, 500);
      }
    }

    if (url.pathname === "/coach/strength-plan" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      if (!env.HEVY_API_KEY) return json({ error: "HEVY_API_KEY is not configured" }, 503);
      const body = await request.json().catch(() => ({}));
      const durationMinutes = clampInt(body.durationMinutes, 60, 20, 120);
      const sessions = Array.isArray(body.sessions) ? body.sessions.filter(s => s.source === "Hevy").slice(0, 300) : [];
      try {
        const templates = await fetchExerciseTemplates(env.HEVY_API_KEY);
        const plan = buildStrengthPlan({
          sessions,
          templates,
          durationMinutes,
          focusId: String(body.focusId || "full"),
          focusTitle: String(body.focusTitle || "Corps complet"),
          customFocus: String(body.customFocus || "").slice(0, 240),
          goal: String(body.goal || "Équilibre")
        });
        return json({ ok: true, plan, version: VERSION });
      } catch (error) {
        return json({ error: safe(error) }, 500);
      }
    }

    return v16.fetch(request, env, ctx);
  }
};

function config(env) {
  return {
    auth: !!env.APP_TOKEN,
    hevy: !!env.HEVY_API_KEY,
    garmin: !!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID),
    coach: !!env.OPENAI_API_KEY,
    hevyWrite: !!env.HEVY_API_KEY,
    garminWrite: !!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID)
  };
}

function auth(request, env) {
  if (!env.APP_TOKEN) return json({ error: "APP_TOKEN is not configured" }, 503);
  return request.headers.get("Authorization") === `Bearer ${env.APP_TOKEN}` ? null : json({ error: "Unauthorized" }, 401);
}

async function fetchGarminHistory(env, recentDays = null) {
  const headers = intervalsHeaders(env);
  const now = new Date();
  const newest = ymd(now);
  let raw = [];

  if (recentDays != null) {
    const oldest = ymd(new Date(Date.now() - recentDays * 86400000));
    raw = await fetchActivitiesWindow(env, headers, oldest, newest, 1000);
  } else {
    const currentYear = now.getUTCFullYear();
    const windows = [];
    for (let start = 2000; start <= currentYear; start += 5) {
      const end = Math.min(currentYear, start + 4);
      windows.push([`${start}-01-01`, end === currentYear ? newest : `${end}-12-31`]);
    }
    const chunks = await Promise.all(windows.map(([oldest, end]) => fetchActivitiesWindow(env, headers, oldest, end, 2500).catch(() => [])));
    raw = chunks.flat();
  }

  const byId = new Map();
  for (const item of raw) if (item?.id != null) byId.set(String(item.id), item);
  const list = [...byId.values()].sort((a,b) => new Date(b.start_date || b.start_date_local || 0) - new Date(a.start_date || a.start_date_local || 0));
  const sessions = list.slice(0, 2500).map(normalizeGarmin);
  return {
    sessions,
    meta: {
      expected: list.length,
      returned: sessions.length,
      capped: list.length > 2500,
      oldestImportedAt: sessions.at(-1)?.startedAt || null,
      strategy: recentDays == null ? "5-year windows + explicit limit" : "date range + explicit limit"
    }
  };
}

async function fetchActivitiesWindow(env, headers, oldest, newest, limit) {
  const endpoint = `${INTERVALS}/athlete/${encodeURIComponent(env.INTERVALS_ATHLETE_ID)}/activities?oldest=${oldest}&newest=${newest}&limit=${limit}`;
  const r = await fetchTimed(endpoint, { headers }, 30000);
  if (!r.ok) throw new Error(`Intervals.icu: HTTP ${r.status}`);
  const payload = await r.json();
  return Array.isArray(payload) ? payload : (Array.isArray(payload?.activities) ? payload.activities : []);
}

function normalizeGarmin(activity) {
  const type = String(activity.type || activity.sport_type || "Workout");
  const distanceM = firstNum(activity.distance, activity.total_distance);
  const seconds = firstNum(activity.moving_time, activity.elapsed_time, activity.duration);
  const distanceKm = distanceM == null ? null : distanceM / 1000;
  const durationMinutes = seconds == null ? 0 : Math.max(1, Math.round(seconds / 60));
  return {
    id: `garmin-${activity.id}`,
    source: "Garmin",
    provider: "Intervals.icu",
    category: activityCategory(type),
    title: activity.name || activity.title || type,
    activityType: type,
    startedAt: iso(activity.start_date || activity.start_date_local),
    durationMinutes,
    distanceKm: round(distanceKm, 3),
    paceMinKm: distanceKm && durationMinutes ? round(durationMinutes / distanceKm, 3) : null,
    averageHeartRate: num(activity.average_heartrate ?? activity.avg_hr),
    maxHeartRate: num(activity.max_heartrate ?? activity.max_hr),
    elevationGainM: num(activity.total_elevation_gain ?? activity.elevation_gain),
    calories: num(activity.calories),
    trainingLoad: num(activity.icu_training_load ?? activity.training_load ?? activity.tss),
    rpe: num(activity.icu_rpe ?? activity.rpe ?? activity.perceived_exertion),
    intensity: num(activity.icu_intensity ?? activity.intensity),
    aerobicEffect: firstNum(activity.aerobic_training_effect, activity.total_training_effect, activity.aerobic_effect, activity.AerobicEffect),
    anaerobicEffect: firstNum(activity.anaerobic_training_effect, activity.total_anaerobic_training_effect, activity.anaerobic_effect, activity.AnaerobicEffect),
    deviceName: activity.device_name || null,
    averageCadence: firstNum(activity.average_cadence, activity.avg_cadence),
    maxCadence: num(activity.max_cadence),
    averagePower: firstNum(activity.average_watts, activity.avg_watts, activity.average_power),
    maxPower: firstNum(activity.max_watts, activity.max_power),
    normalizedPower: firstNum(activity.icu_weighted_avg_watts, activity.weighted_average_watts, activity.normalized_power),
    averageSpeed: firstNum(activity.average_speed, activity.avg_speed),
    maxSpeed: num(activity.max_speed),
    temperature: firstNum(activity.average_temp, activity.avg_temperature, activity.temperature)
  };
}

async function fetchExerciseTemplates(apiKey) {
  const headers = { "api-key": apiKey, Accept: "application/json" };
  const templates = [];
  let pageCount = 20;
  for (let page = 1; page <= pageCount; page++) {
    const r = await fetchTimed(`${HEVY}/exercise_templates?page=${page}&pageSize=100`, { headers }, 15000);
    if (!r.ok) throw new Error(`Hevy exercise templates: HTTP ${r.status}`);
    const data = await r.json();
    const batch = Array.isArray(data.exercise_templates) ? data.exercise_templates : [];
    if (!batch.length) break;
    templates.push(...batch);
    const remotePages = Number(data.page_count || 0);
    if (remotePages) pageCount = Math.min(20, remotePages);
    if (batch.length < 100 || templates.length >= 1500) break;
  }
  return templates;
}

const CLUSTERS = {
  push: { title: "Pectoraux · épaules · triceps", subtitle: "Poussée du haut du corps", groups: ["chest", "shoulders", "triceps"] },
  pull: { title: "Dos · biceps · arrière d’épaules", subtitle: "Tirage et stabilité scapulaire", groups: ["lats", "upper_back", "traps", "biceps", "shoulders"] },
  legs: { title: "Jambes · fessiers", subtitle: "Quadriceps, ischios, fessiers et mollets", groups: ["quadriceps", "hamstrings", "glutes", "calves"] },
  arms: { title: "Bras · épaules", subtitle: "Biceps, triceps et deltoïdes", groups: ["biceps", "triceps", "shoulders", "forearms"] },
  upper: { title: "Haut du corps complet", subtitle: "Poussée + tirage équilibrés", groups: ["chest", "lats", "upper_back", "shoulders", "biceps", "triceps"] },
  full: { title: "Corps complet", subtitle: "Une séance équilibrée de la tête aux jambes", groups: ["chest", "lats", "upper_back", "shoulders", "biceps", "triceps", "quadriceps", "hamstrings", "glutes", "calves"] }
};

function buildBodyFocusOptions(sessions, templates, durationMinutes, goal) {
  const history = mapExerciseHistory(sessions, templates);
  const stats = clusterStats(history);
  const candidates = ["push", "pull", "legs", durationMinutes >= 60 ? "upper" : "arms", "full"];
  const scored = candidates.map(id => {
    const stat = stats[id] || { recentCount: 0, daysSince: 999 };
    let score = Math.min(30, stat.daysSince) * 1.8 - stat.recentCount * 5;
    if (/force|muscle|prise/i.test(goal) && ["push", "pull", "legs"].includes(id)) score += 5;
    if (id === "full" && durationMinutes < 45) score -= 15;
    return { id, score, stat };
  }).sort((a,b) => b.score - a.score);

  const chosen = [];
  for (const entry of scored) {
    if (chosen.length >= 3) break;
    const cluster = CLUSTERS[entry.id];
    chosen.push({
      id: entry.id,
      title: cluster.title,
      subtitle: cluster.subtitle,
      reason: entry.stat.daysSince >= 14
        ? `Zone peu sollicitée récemment (${Math.round(entry.stat.daysSince)} jours depuis la dernière exposition identifiable).`
        : entry.stat.recentCount <= 1
          ? "Volume récent faible : bon candidat pour remettre du stimulus sans répéter exactement la dernière séance."
          : "Option cohérente avec la durée choisie et l’équilibre actuel de ton historique.",
      estimatedExercises: exerciseCountForDuration(durationMinutes),
      groups: cluster.groups
    });
  }
  return chosen;
}

function buildStrengthPlan({ sessions, templates, durationMinutes, focusId, focusTitle, customFocus, goal }) {
  if (!sessions.length) throw new Error("Aucun historique Hevy détaillé n’est disponible pour construire les charges.");
  const templateMap = new Map(templates.map(t => [String(t.id), t]));
  const history = mapExerciseHistory(sessions, templates);
  const desired = resolveTargetGroups(focusId, customFocus);
  const targetCount = exerciseCountForDuration(durationMinutes);
  const recent42 = new Set(history.filter(h => h.daysSince <= 42).map(h => h.templateId));

  const ranked = history
    .filter(h => h.templateId && groupMatch(h, desired))
    .sort((a,b) => exerciseScore(b, desired, recent42) - exerciseScore(a, desired, recent42));

  const selected = [];
  const used = new Set();
  const groupHits = new Map();

  // D’abord des mouvements connus et progressables, en variant les groupes ciblés.
  for (const item of ranked) {
    if (selected.length >= targetCount) break;
    if (used.has(item.templateId)) continue;
    const primary = item.primaryGroup || "other";
    const hits = groupHits.get(primary) || 0;
    if (hits >= 2 && selected.length < Math.max(3, targetCount - 1)) continue;
    selected.push(buildProgressedExercise(item, goal, durationMinutes));
    used.add(item.templateId);
    groupHits.set(primary, hits + 1);
  }

  // Réintroduire au moins une variante connue mais absente récemment si possible.
  if (selected.length >= 3 && !selected.some(x => x.novelty === "reintroduced")) {
    const dormant = ranked.find(h => h.daysSince >= 35 && h.daysSince <= 730 && !used.has(h.templateId));
    if (dormant) {
      const replaceIndex = selected.length - 1;
      used.delete(selected[replaceIndex].exerciseTemplateId);
      selected[replaceIndex] = buildProgressedExercise(dormant, goal, durationMinutes, true);
      used.add(dormant.templateId);
    }
  }

  // S’il manque un exercice, choisir un mouvement du catalogue Hevy sans inventer une charge.
  // Il est présenté comme série de calibration et ne bloque pas l’envoi vers Hevy.
  if (selected.length < targetCount) {
    const novelTemplates = templates.filter(t => !used.has(String(t.id)) && templateMatchesGroups(t, desired));
    for (const template of novelTemplates) {
      if (selected.length >= targetCount) break;
      const similar = ranked.find(h => h.primaryGroup === normalizeGroup(template.primary_muscle_group));
      selected.push(buildNovelExercise(template, similar, goal));
      used.add(String(template.id));
    }
  }

  const exercises = selected.slice(0, targetCount);
  if (!exercises.length) throw new Error("Aucun exercice Hevy compatible avec cette orientation n’a été trouvé.");
  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const routine = {
    title: `${focusTitle || CLUSTERS[focusId]?.title || "Séance"} · ${durationMinutes} min`,
    notes: `TrainSync Coach · ${durationMinutes} min · ${customFocus ? `Adaptation: ${customFocus}. ` : ""}Charges calculées depuis l’historique Hevy. Les mouvements de calibration doivent rester faciles à la première exposition.`,
    exercises: exercises.map(ex => ({
      exerciseTemplateId: ex.exerciseTemplateId,
      title: ex.title,
      restSeconds: ex.restSeconds,
      notes: ex.notes,
      sets: ex.sets.map(set => ({ type: "normal", weightKg: set.weightKg, reps: set.reps, rpe: set.rpe }))
    }))
  };

  return {
    id: `strength-plan-${Date.now()}`,
    kind: "Musculation",
    title: routine.title,
    durationMinutes,
    focusId,
    focusTitle: focusTitle || CLUSTERS[focusId]?.title || "Musculation",
    customFocus,
    goal,
    totalSets,
    rationale: "Séance construite après validation de ta zone de travail. Elle privilégie une progression mesurable, réintroduit des variantes utiles et adapte les charges à tes dernières séries plutôt que de recopier une ancienne routine.",
    exercises,
    publish: { hevyRoutine: routine }
  };
}

function mapExerciseHistory(sessions, templates) {
  const templateMap = new Map(templates.map(t => [String(t.id), t]));
  const now = Date.now();
  const map = new Map();
  const ordered = [...sessions].sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt));
  for (const session of ordered) {
    for (const ex of Array.isArray(session.exercises) ? session.exercises : []) {
      const id = ex.exerciseTemplateId ? String(ex.exerciseTemplateId) : null;
      if (!id) continue;
      const template = templateMap.get(id) || {};
      if (!map.has(id)) {
        const work = (ex.sets || []).filter(s => s.type !== "warmup" && (Number(s.reps) > 0 || Number(s.weightKg) > 0));
        const best = chooseReferenceSet(work);
        map.set(id, {
          templateId: id,
          title: ex.title || template.title || "Exercice",
          type: template.type || "weight_reps",
          primaryGroup: normalizeGroup(template.primary_muscle_group),
          secondaryGroups: (template.secondary_muscle_groups || []).map(normalizeGroup),
          lastAt: session.startedAt,
          daysSince: Math.max(0, (now - new Date(session.startedAt).getTime()) / 86400000),
          latestSets: work.slice(0, 5),
          best,
          exposures: 1,
          recentVolume: work.reduce((n,s) => n + Number(s.weightKg || 0) * Number(s.reps || 0), 0)
        });
      } else {
        const item = map.get(id);
        item.exposures += 1;
      }
    }
  }
  return [...map.values()];
}

function clusterStats(history) {
  const out = {};
  for (const [id, cluster] of Object.entries(CLUSTERS)) {
    const matched = history.filter(h => h.primaryGroup && cluster.groups.includes(h.primaryGroup));
    out[id] = {
      recentCount: matched.filter(h => h.daysSince <= 21).reduce((n,h) => n + Math.min(3, h.exposures), 0),
      daysSince: matched.length ? Math.min(...matched.map(h => h.daysSince)) : 999
    };
  }
  return out;
}

function exerciseScore(item, desired, recent42) {
  let score = 0;
  if (desired.includes(item.primaryGroup)) score += 40;
  score += item.secondaryGroups.filter(g => desired.includes(g)).length * 8;
  score += Math.min(item.exposures, 8) * 2;
  if (item.daysSince >= 35 && item.daysSince <= 180) score += 16;
  else if (item.daysSince < 7) score -= 12;
  else if (item.daysSince <= 28) score += 5;
  if (recent42.has(item.templateId)) score += 5;
  return score;
}

function buildProgressedExercise(item, goal, durationMinutes, reintroduced = false) {
  const range = repRange(goal);
  const reference = item.best || item.latestSets[0] || { weightKg: 0, reps: range.min, rpe: 8 };
  const progressed = progressPrescription(reference, range, reintroduced);
  const setsCount = durationMinutes >= 75 && item.exposures >= 3 ? 4 : 3;
  const sets = Array.from({ length: setsCount }, (_, index) => ({
    weightKg: progressed.weightKg,
    reps: Math.max(range.min, progressed.reps - (index >= 2 && progressed.reps > range.min ? 1 : 0)),
    rpe: reintroduced ? 7 : Math.min(9, 7.5 + index * 0.25)
  }));
  return {
    exerciseTemplateId: item.templateId,
    title: item.title,
    primaryGroup: item.primaryGroup,
    secondaryGroups: item.secondaryGroups,
    novelty: reintroduced ? "reintroduced" : "progressed",
    restSeconds: /force/i.test(goal) ? 180 : 120,
    notes: reintroduced
      ? `Réintroduction après ${Math.round(item.daysSince)} jours : charge légèrement prudente, amplitude contrôlée.`
      : progressed.note,
    sets
  };
}

function buildNovelExercise(template, reference, goal) {
  const range = repRange(goal);
  let estimated = null;
  if (reference?.best?.weightKg && normalizeGroup(template.primary_muscle_group) === reference.primaryGroup) {
    // Une estimation volontairement basse ; la relation entre deux exercices n’est jamais supposée équivalente.
    estimated = roundLoad(Number(reference.best.weightKg) * 0.55);
  }
  return {
    exerciseTemplateId: String(template.id),
    title: template.title || "Nouvel exercice",
    primaryGroup: normalizeGroup(template.primary_muscle_group),
    secondaryGroups: (template.secondary_muscle_groups || []).map(normalizeGroup),
    novelty: "new",
    restSeconds: 90,
    notes: estimated != null
      ? "Nouveau mouvement : charge de départ volontairement basse. Ajuste immédiatement si nécessaire pour rester autour de RPE 6–7."
      : "Nouveau mouvement : première série de calibration. Choisis une charge facile permettant toutes les répétitions avec 3–4 reps en réserve.",
    sets: Array.from({ length: 3 }, () => ({ weightKg: estimated, reps: range.min + 2, rpe: 6.5 }))
  };
}

function progressPrescription(set, range, reintroduced) {
  const weight = Number(set.weightKg || 0);
  const reps = Number(set.reps || range.min);
  const rpe = Number(set.rpe);
  if (reintroduced) return { weightKg: roundLoad(weight * 0.95), reps: Math.max(range.min, Math.min(range.max, reps)), note: "Réintroduction avec légère marge de sécurité." };
  if (Number.isFinite(rpe) && rpe >= 9.5) {
    return { weightKg: roundLoad(weight * 0.975), reps: Math.max(range.min, reps - 1), note: "Dernier effort très proche de la limite : légère réduction pour consolider." };
  }
  if ((!Number.isFinite(rpe) || rpe <= 8) && reps >= range.max) {
    return { weightKg: roundLoad(weight * 1.025), reps: range.min, note: "Haut de fourchette atteint avec marge : petite hausse de charge." };
  }
  if (!Number.isFinite(rpe) || rpe <= 8) {
    return { weightKg: roundLoad(weight), reps: Math.min(range.max, reps + 1), note: "Charge conservée, progression d’une répétition." };
  }
  return { weightKg: roundLoad(weight), reps: Math.max(range.min, Math.min(range.max, reps)), note: "Charge maintenue pour consolider la qualité d’exécution." };
}

function resolveTargetGroups(focusId, customFocus) {
  const base = [...(CLUSTERS[focusId]?.groups || CLUSTERS.full.groups)];
  const text = normalizeText(customFocus);
  if (!text) return base;
  const rules = [
    [["pec", "poitrine", "chest"], ["chest"]],
    [["dos", "back", "dorsaux"], ["lats", "upper_back", "traps"]],
    [["epaule", "delto"], ["shoulders"]],
    [["biceps"], ["biceps"]],
    [["triceps"], ["triceps"]],
    [["bras"], ["biceps", "triceps", "forearms"]],
    [["jambe", "quadriceps", "quad"], ["quadriceps"]],
    [["ischio", "hamstring"], ["hamstrings"]],
    [["fessier", "glute"], ["glutes"]],
    [["mollet", "calf"], ["calves"]]
  ];
  const explicit = [];
  for (const [words, groups] of rules) if (words.some(w => text.includes(w))) explicit.push(...groups);
  return explicit.length ? [...new Set(explicit)] : base;
}

function groupMatch(item, desired) {
  return desired.includes(item.primaryGroup) || item.secondaryGroups.some(g => desired.includes(g));
}
function templateMatchesGroups(template, desired) {
  const primary = normalizeGroup(template.primary_muscle_group);
  const second = (template.secondary_muscle_groups || []).map(normalizeGroup);
  return desired.includes(primary) || second.some(g => desired.includes(g));
}
function chooseReferenceSet(sets) {
  if (!sets.length) return null;
  return [...sets].sort((a,b) => {
    const ea = Number(a.weightKg || 0) * (1 + Number(a.reps || 0) / 30);
    const eb = Number(b.weightKg || 0) * (1 + Number(b.reps || 0) / 30);
    return eb - ea;
  })[0];
}
function repRange(goal) {
  const g = normalizeText(goal);
  if (g.includes("force")) return { min: 4, max: 6 };
  if (g.includes("muscle") || g.includes("prise")) return { min: 8, max: 12 };
  return { min: 6, max: 10 };
}
function exerciseCountForDuration(minutes) {
  if (minutes <= 30) return 4;
  if (minutes <= 45) return 5;
  if (minutes <= 60) return 6;
  if (minutes <= 75) return 7;
  return 8;
}
function normalizeGroup(value = "") {
  const s = normalizeText(value).replace(/\s+/g, "_");
  const map = {
    quads: "quadriceps", quad: "quadriceps", hamstring: "hamstrings", hamstrings: "hamstrings",
    glute: "glutes", gluteus: "glutes", calves: "calves", calf: "calves", lats: "lats",
    back: "upper_back", upperback: "upper_back", traps: "traps", shoulders: "shoulders",
    shoulder: "shoulders", chest: "chest", triceps: "triceps", biceps: "biceps", forearms: "forearms"
  };
  return map[s] || s;
}
function activityCategory(value = "") {
  const s = normalizeText(value);
  if (s.includes("run")) return "Course";
  if (s.includes("ride") || s.includes("bike") || s.includes("cycl")) return "Vélo";
  if (s.includes("walk") || s.includes("hike")) return "Marche";
  if (s.includes("weight") || s.includes("strength")) return "Musculation";
  return "Cardio";
}
function intervalsHeaders(env) {
  return { Authorization: `Basic ${btoa(`API_KEY:${env.INTERVALS_API_KEY}`)}`, Accept: "application/json", "User-Agent": "TrainSync/1.7" };
}
async function fetchTimed(url, options = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (error) { if (error?.name === "AbortError") throw new Error("Service distant: délai dépassé"); throw error; }
  finally { clearTimeout(timer); }
}
function clampInt(value, fallback, min, max) {
  const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}
function firstNum(...values) { for (const v of values) { const n = Number(v); if (v !== "" && v != null && Number.isFinite(n)) return n; } return null; }
function num(value) { const n = Number(value); return value == null || value === "" || !Number.isFinite(n) ? null : n; }
function round(value, digits = 2) { return value == null || !Number.isFinite(Number(value)) ? null : Number(Number(value).toFixed(digits)); }
function roundLoad(value) { const n = Number(value); return !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 2) / 2; }
function ymd(date) { return date.toISOString().slice(0, 10); }
function iso(value) { const d = new Date(value || Date.now()); return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); }
function normalizeText(value = "") { return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function dedupe(items) { const map = new Map(); for (const item of items) map.set(String(item.id || `${item.source}-${item.startedAt}-${item.title}`), item); return [...map.values()].sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt)); }
function safe(error) { return String(error?.message || error || "Erreur inconnue").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }); }
