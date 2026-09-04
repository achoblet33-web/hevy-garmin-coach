import v15 from "./worker-v15.js";

const HEVY = "https://api.hevyapp.com/v1";
const INTERVALS = "https://intervals.icu/api/v1";
const VERSION = "1.6.0";
const HISTORY_CAP = 5000;
const SOURCE_CAP = 2500;
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
      return json({ ok: true, version: VERSION, configured: config(env), historyCap: HISTORY_CAP });
    }

    if (url.pathname === "/status" && request.method === "GET") {
      const denied = auth(request, env); if (denied) return denied;
      return json({ ok: true, authenticated: true, version: VERSION, configured: config(env), historyCap: HISTORY_CAP });
    }

    if (url.pathname === "/sync" && request.method === "GET" && url.searchParams.get("all") === "1") {
      const denied = auth(request, env); if (denied) return denied;
      try {
        const result = await syncAllHistory(env);
        return json({ ok: true, version: VERSION, ...result });
      } catch (error) {
        return json({ error: safe(error) }, 500);
      }
    }

    if (url.pathname === "/recommend" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      const body = await request.clone().json().catch(() => ({}));
      const response = await v15.fetch(request, env, ctx);
      if (!response.ok) return response;
      try {
        const data = await response.json();
        if (!Array.isArray(data.suggestions)) return json({ ...data, version: VERSION });
        const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, 160) : [];
        const templates = env.HEVY_API_KEY ? await fetchExerciseTemplates(env.HEVY_API_KEY).catch(() => []) : [];
        data.suggestions = data.suggestions.map((suggestion, index) => {
          if (suggestion.kind !== "Musculation") return suggestion;
          return evolveStrengthSuggestion(suggestion, sessions, templates, index, body.goal || "Équilibre");
        });
        data.version = VERSION;
        data.strengthMethod = {
          name: "Progression anatomique TrainSync",
          basis: "Individualisation anatomique, équilibre des groupes musculaires, variations de recrutement et progression graduelle inspirés des principes de Frédéric Delavier, combinés à ton historique réel."
        };
        return json(data);
      } catch {
        return response;
      }
    }

    return v15.fetch(request, env, ctx);
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

async function syncAllHistory(env) {
  const sources = {
    hevy: { configured: !!env.HEVY_API_KEY, ok: false, count: 0, error: null },
    garmin: { configured: !!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID), ok: false, count: 0, error: null }
  };
  const tasks = [];
  if (sources.hevy.configured) tasks.push(run("hevy", () => fetchAllHevy(env.HEVY_API_KEY)));
  if (sources.garmin.configured) tasks.push(run("garmin", () => fetchAllGarmin(env)));
  const results = await Promise.all(tasks);
  let sessions = [];
  const warnings = [];
  const sourceMeta = {};

  for (const result of results) {
    if (result.ok) {
      sources[result.key] = { configured: true, ok: true, count: result.sessions.length, error: null };
      sessions.push(...result.sessions);
      sourceMeta[result.key] = result.meta || {};
    } else {
      sources[result.key] = { configured: true, ok: false, count: 0, error: result.error };
      warnings.push(result.error);
    }
  }

  const deduped = dedupe(sessions);
  const totalBeforeCap = deduped.length;
  sessions = deduped.slice(0, HISTORY_CAP);
  const capped = totalBeforeCap > HISTORY_CAP || Object.values(sourceMeta).some(meta => meta.capped);
  if (capped) warnings.push(`Limite de sécurité TrainSync atteinte (${HISTORY_CAP.toLocaleString("fr-FR")} séances). Les séances les plus récentes ont été conservées.`);

  return {
    sessions,
    sources,
    warnings,
    syncedAt: new Date().toISOString(),
    history: {
      complete: !capped,
      cap: HISTORY_CAP,
      returned: sessions.length,
      discovered: totalBeforeCap,
      sourceMeta,
      oldestImportedAt: sessions.length ? sessions.at(-1).startedAt : null
    }
  };
}

async function run(key, fn) {
  try {
    const value = await fn();
    return { key, ok: true, sessions: value.sessions || value, meta: value.meta || null };
  } catch (error) {
    return { key, ok: false, sessions: [], error: safe(error) };
  }
}

async function fetchAllHevy(apiKey) {
  const headers = { "api-key": apiKey, Accept: "application/json" };
  let expected = null;
  try {
    const countResponse = await fetchTimed(`${HEVY}/workouts/count`, { headers }, 12000);
    if (countResponse.ok) {
      const countData = await countResponse.json();
      expected = Number(countData.workout_count ?? countData.count ?? countData.total ?? 0) || null;
    }
  } catch { /* pagination below remains authoritative */ }

  const workouts = [];
  const pageSize = 10;
  const maxPages = Math.ceil(SOURCE_CAP / pageSize);
  let pageCount = expected ? Math.ceil(expected / pageSize) : maxPages;
  pageCount = Math.min(maxPages, Math.max(1, pageCount));

  for (let page = 1; page <= pageCount; page++) {
    const r = await fetchTimed(`${HEVY}/workouts?page=${page}&pageSize=${pageSize}`, { headers }, 15000);
    if (!r.ok) throw new Error(`Hevy: HTTP ${r.status}`);
    const data = await r.json();
    const batch = Array.isArray(data.workouts) ? data.workouts : [];
    if (!batch.length) break;
    workouts.push(...batch);
    if (workouts.length >= SOURCE_CAP) break;
    const remotePages = Number(data.page_count || data.pageCount || 0);
    if (remotePages) pageCount = Math.min(maxPages, remotePages);
    if (batch.length < pageSize) break;
  }

  const now = Date.now();
  const sessions = workouts.slice(0, SOURCE_CAP).map(workout => normalizeHevy(workout, now));
  return {
    sessions,
    meta: {
      expected,
      returned: sessions.length,
      capped: (expected != null && expected > SOURCE_CAP) || workouts.length >= SOURCE_CAP
    }
  };
}

function normalizeHevy(workout, now) {
  const startedAt = iso(workout.start_time || workout.created_at);
  const ageDays = Math.max(0, (now - new Date(startedAt).getTime()) / 86400000);
  const fullExercises = (workout.exercises || []).map(exercise => ({
    title: exercise.title || "Exercice",
    exerciseTemplateId: exercise.exercise_template_id || exercise.exerciseTemplateId || null,
    notes: exercise.notes || "",
    sets: (exercise.sets || []).map(set => ({
      type: set.set_type || set.type || "normal",
      weightKg: num(set.weight_kg ?? set.weightKg),
      reps: num(set.reps),
      rpe: num(set.rpe),
      distanceMeters: num(set.distance_meters),
      durationSeconds: num(set.duration_seconds)
    }))
  }));
  const volumeKg = fullExercises.reduce((total, exercise) => total + exercise.sets.reduce((subtotal, set) => subtotal + (set.weightKg || 0) * (set.reps || 0), 0), 0);
  const end = workout.end_time ? new Date(workout.end_time).getTime() : null;
  const durationMinutes = end ? Math.max(1, Math.round((end - new Date(startedAt).getTime()) / 60000)) : 0;

  return {
    id: `hevy-${workout.id}`,
    source: "Hevy",
    category: "Musculation",
    title: workout.title || "Séance Hevy",
    startedAt,
    durationMinutes,
    volumeKg: Math.round(volumeKg),
    // Les séries anciennes sont volontairement allégées pour préserver le téléphone.
    exercises: ageDays <= 730 ? fullExercises : undefined,
    archivedSummary: ageDays > 730,
    exerciseCount: fullExercises.length
  };
}

async function fetchAllGarmin(env) {
  const newest = ymd(new Date());
  const oldest = "2000-01-01";
  const endpoint = `${INTERVALS}/athlete/${encodeURIComponent(env.INTERVALS_ATHLETE_ID)}/activities?oldest=${oldest}&newest=${newest}`;
  const r = await fetchTimed(endpoint, { headers: intervalsHeaders(env) }, 30000);
  if (!r.ok) throw new Error(`Intervals.icu: HTTP ${r.status}`);
  const payload = await r.json();
  const list = Array.isArray(payload) ? payload : (Array.isArray(payload.activities) ? payload.activities : []);
  const sessions = list.slice(0, SOURCE_CAP).map(normalizeGarmin);
  return { sessions, meta: { expected: list.length, returned: sessions.length, capped: list.length > SOURCE_CAP } };
}

function normalizeGarmin(activity) {
  const type = String(activity.type || activity.sport_type || "Workout");
  const distanceM = firstNum(activity.distance, activity.total_distance);
  const seconds = firstNum(activity.moving_time, activity.elapsed_time, activity.duration);
  const distanceKm = distanceM == null ? null : distanceM / 1000;
  const durationMinutes = seconds == null ? 0 : Math.max(1, Math.round(seconds / 60));
  const aerobicEffect = firstNum(activity.aerobic_training_effect, activity.total_training_effect, activity.aerobic_effect, activity.AerobicEffect);
  const anaerobicEffect = firstNum(activity.anaerobic_training_effect, activity.total_anaerobic_training_effect, activity.anaerobic_effect, activity.AnaerobicEffect);
  const session = {
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
    rpe: num(activity.icu_rpe ?? activity.rpe),
    intensity: num(activity.icu_intensity ?? activity.intensity),
    aerobicEffect,
    anaerobicEffect,
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
  return addLoadProfile(session);
}

function addLoadProfile(session) {
  const load = Math.max(1, Number(session.trainingLoad || session.durationMinutes || 1));
  const aerobic = Number(session.aerobicEffect);
  const anaerobic = Number(session.anaerobicEffect);
  const profile = { lowAerobic: 0, highAerobic: 0, anaerobic: 0 };
  if (Number.isFinite(aerobic) || Number.isFinite(anaerobic)) {
    const a = Number.isFinite(aerobic) ? Math.max(0, aerobic) : 0;
    const an = Number.isFinite(anaerobic) ? Math.max(0, anaerobic) : 0;
    const high = a >= 3 ? a : a * 0.25;
    const low = a >= 3 ? a * 0.35 : a;
    const sum = low + high + an || 1;
    profile.lowAerobic = load * low / sum;
    profile.highAerobic = load * high / sum;
    profile.anaerobic = load * an / sum;
  } else {
    profile[inferFocus(session)] = load;
  }
  return { ...session, loadProfile: profile };
}

async function fetchExerciseTemplates(apiKey) {
  const headers = { "api-key": apiKey, Accept: "application/json" };
  const templates = [];
  const pageSize = 10;
  let pageCount = 50;
  for (let page = 1; page <= pageCount; page++) {
    const r = await fetchTimed(`${HEVY}/exercise_templates?page=${page}&pageSize=${pageSize}`, { headers }, 12000);
    if (!r.ok) break;
    const data = await r.json();
    const batch = Array.isArray(data.exercise_templates) ? data.exercise_templates : (Array.isArray(data.exerciseTemplates) ? data.exerciseTemplates : []);
    if (!batch.length) break;
    templates.push(...batch);
    const remotePages = Number(data.page_count || data.pageCount || 0);
    if (remotePages) pageCount = Math.min(100, remotePages);
    if (batch.length < pageSize || templates.length >= 1000) break;
  }
  return templates;
}

function evolveStrengthSuggestion(suggestion, sessions, templates, index, goal) {
  const history = strengthHistory(sessions);
  if (!history.length) return {
    ...suggestion,
    evolutionNote: "Le coach manque encore d'historique Hevy détaillé pour individualiser les charges. La séance reste volontairement conservatrice."
  };

  const familyLoad = recentFamilyLoad(history, 35);
  const priorities = familyPriorities(goal, familyLoad);
  const recentIds = new Set(history.filter(item => item.ageDays <= 42).map(item => item.templateId).filter(Boolean));
  const dormant = history.filter(item => item.templateId && item.ageDays > 42 && item.ageDays <= 730);
  const routineExercises = [];
  const used = new Set();

  // 1) Base mesurable : 3 mouvements tolérés et progressables.
  for (const family of priorities) {
    const candidate = bestHistoryCandidate(history, family, used, 42);
    if (candidate) {
      routineExercises.push(toProgressedExercise(candidate, false));
      used.add(candidate.templateId || normalize(candidate.title));
    }
    if (routineExercises.length >= 3) break;
  }

  // 2) Évolution : réintroduire un mouvement historique non pratiqué récemment.
  for (const family of priorities) {
    const candidate = bestDormantCandidate(dormant, family, used);
    if (candidate) {
      routineExercises.push(toProgressedExercise(candidate, true));
      used.add(candidate.templateId || normalize(candidate.title));
      break;
    }
  }

  // 3) Nouveauté anatomique ciblée : un seul nouvel exercice, choisi dans le catalogue Hevy.
  if (routineExercises.length < 5 && templates.length) {
    const family = priorities.find(name => !routineExercises.some(ex => ex.family === name)) || priorities[0];
    const template = chooseNovelTemplate(templates, history, family, recentIds);
    if (template) {
      const reference = bestHistoryCandidate(history, family, new Set(), 365);
      routineExercises.push(toNovelExercise(template, family, reference));
    }
  }

  // Compléter avec des mouvements fiables si nécessaire.
  for (const family of priorities) {
    if (routineExercises.length >= 5) break;
    const candidate = bestHistoryCandidate(history, family, used, 365);
    if (candidate) {
      routineExercises.push(toProgressedExercise(candidate, false));
      used.add(candidate.templateId || normalize(candidate.title));
    }
  }

  const clean = routineExercises.filter(ex => ex.exerciseTemplateId).slice(0, 6);
  if (!clean.length) return suggestion;

  const hevyRoutine = {
    title: `${suggestion.title || "Séance"} · évolution`,
    notes: "TrainSync : progression individualisée avec continuité mesurable, rééquilibrage des groupes sous-travaillés et 1 à 2 variations ciblées. Pour un exercice inédit, la première charge est une estimation prudente à valider autour de RPE 6–7.",
    exercises: clean.map(({ family, novelty, ...exercise }) => exercise)
  };

  return {
    ...suggestion,
    rationale: `${suggestion.rationale || ""} La sélection ne se limite pas à reproduire tes dernières séances : elle conserve une base mesurable puis introduit des variations ciblées selon les groupes et mouvements sous-représentés.`.trim(),
    evolutionNote: "Méthode anatomique : base stable + réintroduction d'anciens mouvements utiles + au maximum un exercice réellement nouveau par séance pour continuer à progresser sans perdre le suivi des charges.",
    publish: { ...(suggestion.publish || {}), hevyRoutine }
  };
}

function strengthHistory(sessions) {
  const now = Date.now();
  const map = new Map();
  for (const session of sessions) {
    if (!Array.isArray(session.exercises)) continue;
    const sessionDate = new Date(session.startedAt || now).getTime();
    const ageDays = Math.max(0, (now - sessionDate) / 86400000);
    for (const exercise of session.exercises) {
      const templateId = exercise.exerciseTemplateId || exercise.exercise_template_id || null;
      const key = templateId || normalize(exercise.title);
      const sets = (exercise.sets || []).filter(set => set.type !== "warmup" && (num(set.weightKg) != null || num(set.reps) != null));
      if (!sets.length) continue;
      const work = sets.map(set => ({ weightKg: num(set.weightKg) || 0, reps: num(set.reps) || 0, rpe: num(set.rpe), type: set.type || "normal" }));
      const best = [...work].sort((a, b) => (b.weightKg * Math.max(1, b.reps)) - (a.weightKg * Math.max(1, a.reps)))[0];
      const item = { key, templateId, title: exercise.title || "Exercice", family: movementFamily(exercise.title), ageDays, date: session.startedAt, sets: work, best };
      if (!map.has(key) || ageDays < map.get(key).ageDays) map.set(key, item);
    }
  }
  return [...map.values()];
}

function recentFamilyLoad(history, maxAge) {
  const totals = {};
  for (const item of history.filter(x => x.ageDays <= maxAge)) {
    const family = item.family;
    totals[family] = (totals[family] || 0) + Math.max(1, item.sets.length);
  }
  return totals;
}

function familyPriorities(goal, loads) {
  const g = normalize(goal);
  const base = g.includes("force")
    ? ["squat", "hinge", "horizontalPush", "verticalPull", "row", "verticalPush", "core", "arms"]
    : g.includes("muscle")
      ? ["horizontalPush", "row", "squat", "hinge", "verticalPush", "verticalPull", "arms", "core"]
      : ["squat", "horizontalPush", "row", "hinge", "verticalPull", "verticalPush", "core", "arms"];
  return [...base].sort((a, b) => (loads[a] || 0) - (loads[b] || 0));
}

function bestHistoryCandidate(history, family, used, maxAge) {
  return history
    .filter(item => item.family === family && item.ageDays <= maxAge && !used.has(item.templateId || normalize(item.title)))
    .sort((a, b) => scoreHistory(b) - scoreHistory(a))[0] || null;
}

function bestDormantCandidate(history, family, used) {
  return history
    .filter(item => item.family === family && !used.has(item.templateId || normalize(item.title)))
    .sort((a, b) => a.ageDays - b.ageDays)[0] || null;
}

function scoreHistory(item) {
  const best = item.best || {};
  const estimated = (best.weightKg || 0) * (1 + (best.reps || 0) / 30);
  return estimated + Math.max(0, 100 - item.ageDays) * 0.05;
}

function toProgressedExercise(item, reintroduced) {
  const work = item.sets.slice(0, 4);
  const avgRpe = average(work.map(set => set.rpe).filter(Number.isFinite));
  const factor = reintroduced ? 0.95 : (avgRpe != null && avgRpe <= 8 ? 1.025 : avgRpe != null && avgRpe >= 9.5 ? 0.975 : 1);
  const sets = work.length ? work.map(set => ({
    type: "normal",
    weightKg: roundLoad((set.weightKg || 0) * factor),
    reps: Math.max(1, Math.round(set.reps || 8)),
    rpe: reintroduced ? 7 : 8
  })) : [{ type: "normal", weightKg: roundLoad((item.best?.weightKg || 0) * factor), reps: 8, rpe: 8 }];
  return {
    exerciseTemplateId: item.templateId,
    title: item.title,
    family: item.family,
    novelty: reintroduced ? "reintroduced" : "progressed",
    notes: reintroduced ? "Réintroduction ciblée après plusieurs semaines d'absence : priorité à la technique et à l'amplitude contrôlée." : "Progression calculée à partir de ta dernière exposition et du RPE disponible.",
    sets
  };
}

function chooseNovelTemplate(templates, history, family, recentIds) {
  const allHistoryIds = new Set(history.map(item => item.templateId).filter(Boolean));
  const candidates = templates.map(template => ({ template, family: templateFamily(template) }))
    .filter(item => item.family === family)
    .filter(item => {
      const id = String(item.template.id || item.template.exercise_template_id || item.template.exerciseTemplateId || "");
      return id && !recentIds.has(id) && !allHistoryIds.has(id);
    });
  return candidates[0]?.template || null;
}

function toNovelExercise(template, family, reference) {
  const id = String(template.id || template.exercise_template_id || template.exerciseTemplateId || "");
  const title = template.title || template.name || "Nouvel exercice";
  const equipment = normalize(template.equipment_category || template.equipmentCategory || "");
  const bodyweight = /body|none|assisted/.test(equipment) || /push.?up|pull.?up|dip|plank|crunch/.test(normalize(title));
  const referenceLoad = reference?.best?.weightKg || 0;
  const estimated = bodyweight ? 0 : roundLoad(referenceLoad > 0 ? referenceLoad * 0.65 : 5);
  return {
    exerciseTemplateId: id,
    title,
    family,
    novelty: "new",
    notes: "Nouvelle variation anatomique ciblée. Charge d'amorçage estimée : valide-la à RPE 6–7 lors de la première séance, puis TrainSync utilisera cette nouvelle référence.",
    sets: [
      { type: "normal", weightKg: estimated, reps: 10, rpe: 6.5 },
      { type: "normal", weightKg: estimated, reps: 10, rpe: 7 }
    ]
  };
}

function templateFamily(template) {
  const text = `${template.title || template.name || ""} ${template.primary_muscle_group || template.primaryMuscleGroup || ""} ${(template.secondary_muscle_groups || template.secondaryMuscleGroups || []).join?.(" ") || ""}`;
  return movementFamily(text);
}

function movementFamily(title = "") {
  const t = normalize(title);
  if (/squat|hack|leg press|presse a cuisse|fente|lunge|split squat|extension.*jambe|leg extension/.test(t)) return "squat";
  if (/deadlift|souleve de terre|romanian|rdl|hip thrust|good morning|leg curl|ischio/.test(t)) return "hinge";
  if (/bench|developpe couche|chest press|pompe|push.?up|pec deck|fly|ecarte/.test(t)) return "horizontalPush";
  if (/pull.?up|chin.?up|lat pulldown|tirage vertical|tractions?/.test(t)) return "verticalPull";
  if (/row|rowing|tirage horizontal|seated cable/.test(t)) return "row";
  if (/overhead press|shoulder press|developpe militaire|arnold|elevation laterale|lateral raise/.test(t)) return "verticalPush";
  if (/curl|biceps|triceps|extension triceps|pushdown/.test(t)) return "arms";
  if (/plank|gainage|crunch|abdo|core|pallof/.test(t)) return "core";
  if (/calf|mollet/.test(t)) return "calves";
  return "other";
}

function inferFocus(session) {
  if (session.category === "Musculation") return "anaerobic";
  const text = normalize(`${session.activityType || ""} ${session.title || ""}`);
  if (/sprint|anaerob|hiit|interval|padel|tennis|crossfit/.test(text)) return "anaerobic";
  if (/tempo|threshold|seuil|vo2|race|competition|fartlek/.test(text)) return "highAerobic";
  return "lowAerobic";
}

function activityCategory(value = "") {
  const t = normalize(value);
  if (/run|course/.test(t)) return "Course";
  if (/ride|bike|cycl|velo/.test(t)) return "Vélo";
  if (/walk|hike|marche|randonnee/.test(t)) return "Marche";
  if (/weight|strength|workout|muscu/.test(t)) return "Musculation";
  return "Cardio";
}

function dedupe(items) {
  const map = new Map();
  for (const item of items) map.set(String(item.id || `${item.source}-${item.startedAt}-${item.title}`), item);
  return [...map.values()].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

function intervalsHeaders(env) {
  return {
    Authorization: `Basic ${btoa(`API_KEY:${env.INTERVALS_API_KEY}`)}`,
    Accept: "application/json",
    "User-Agent": "TrainSync/1.6"
  };
}

async function fetchTimed(url, options = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (error) { if (error?.name === "AbortError") throw new Error("Service distant: délai dépassé"); throw error; }
  finally { clearTimeout(timer); }
}

function normalize(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function num(value) { if (value == null || value === "") return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function firstNum(...values) { for (const value of values) { const n = num(value); if (n != null) return n; } return null; }
function round(value, digits = 2) { if (!Number.isFinite(value)) return null; const factor = 10 ** digits; return Math.round(value * factor) / factor; }
function roundLoad(value) { if (!Number.isFinite(value) || value <= 0) return 0; return Math.round(value * 2) / 2; }
function average(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function iso(value) { const date = new Date(value || Date.now()); return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(); }
function ymd(date) { return date.toISOString().slice(0, 10); }
function safe(error) { return String(error?.message || error || "Erreur inconnue").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 300); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }); }
