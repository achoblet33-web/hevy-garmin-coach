const HEVY = "https://api.hevyapp.com/v1";
const INTERVALS = "https://intervals.icu/api/v1";
const OPENAI = "https://api.openai.com/v1/responses";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, hevy: !!env.HEVY_API_KEY, garmin: !!env.INTERVALS_API_KEY, coach: !!env.OPENAI_API_KEY });
    }
    if (env.APP_TOKEN && request.headers.get("Authorization") !== `Bearer ${env.APP_TOKEN}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      if (url.pathname === "/sync" && request.method === "GET") {
        return json(await syncAll(env, bounded(url.searchParams.get("days") || env.SYNC_DAYS, 120, 7, 365)));
      }
      if (url.pathname === "/recommend" && request.method === "POST") {
        if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured" }, 503);
        const body = await request.json().catch(() => ({}));
        const live = await syncAll(env, bounded(env.COACH_HISTORY_DAYS, 120, 28, 365));
        const sessions = dedupe([...(live.sessions || []), ...(Array.isArray(body.sessions) ? body.sessions : [])]);
        return recommend(env, body.goal || "Équilibre", sessions);
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: String(error.message || error).slice(0, 300) }, 500);
    }
  }
};

async function syncAll(env, days) {
  const jobs = [];
  if (env.HEVY_API_KEY) jobs.push(fetchHevy(env.HEVY_API_KEY, days));
  if (env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID) jobs.push(fetchGarmin(env, days));
  if (!jobs.length) return { sessions: [], sources: [], warnings: ["Configure HEVY_API_KEY et/ou Intervals.icu."] };

  const results = await Promise.allSettled(jobs);
  const sessions = [], sources = [], warnings = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      sessions.push(...result.value.sessions);
      sources.push(result.value.source);
    } else warnings.push(String(result.reason?.message || result.reason));
  }
  return { sessions: dedupe(sessions), sources, warnings };
}

async function fetchHevy(apiKey, days) {
  const cutoff = Date.now() - days * 86400000;
  const workouts = [];
  for (let page = 1; page <= 50; page++) {
    const r = await fetch(`${HEVY}/workouts?page=${page}&pageSize=10`, { headers: { "api-key": apiKey, Accept: "application/json" } });
    if (!r.ok) throw new Error(`Hevy: HTTP ${r.status}`);
    const data = await r.json();
    const batch = data.workouts || [];
    workouts.push(...batch);
    if (page >= Number(data.page_count || page)) break;
    const oldest = Math.min(...batch.map(w => new Date(w.start_time || Date.now()).getTime()));
    if (batch.length && oldest < cutoff) break;
  }
  return {
    source: "Hevy",
    sessions: workouts.filter(w => new Date(w.start_time || 0).getTime() >= cutoff).map(normalizeHevy)
  };
}

function normalizeHevy(w) {
  const exercises = (w.exercises || []).map(ex => ({
    title: ex.title || "Exercice",
    exerciseTemplateId: ex.exercise_template_id || null,
    notes: ex.notes || "",
    sets: (ex.sets || []).map(s => ({
      type: s.set_type || "normal",
      weightKg: num(s.weight_kg), reps: num(s.reps), rpe: num(s.rpe),
      distanceMeters: num(s.distance_meters), durationSeconds: num(s.duration_seconds)
    }))
  }));
  const volumeKg = exercises.reduce((a, ex) => a + ex.sets.reduce((b, s) => b + (s.weightKg || 0) * (s.reps || 0), 0), 0);
  const start = iso(w.start_time || w.created_at);
  const duration = w.end_time ? Math.max(1, Math.round((new Date(w.end_time) - new Date(start)) / 60000)) : 0;
  return {
    id: `hevy-${w.id}`, source: "Hevy", category: "Musculation", title: w.title || "Séance Hevy",
    startedAt: start, durationMinutes: duration, volumeKg: Math.round(volumeKg), exercises
  };
}

async function fetchGarmin(env, days) {
  const newest = ymd(new Date());
  const oldest = ymd(new Date(Date.now() - days * 86400000));
  const token = btoa(`API_KEY:${env.INTERVALS_API_KEY}`);
  const endpoint = `${INTERVALS}/athlete/${encodeURIComponent(env.INTERVALS_ATHLETE_ID)}/activities?oldest=${oldest}&newest=${newest}`;
  const r = await fetch(endpoint, { headers: { Authorization: `Basic ${token}`, Accept: "application/json", "User-Agent": "TrainSync/1.1" } });
  if (!r.ok) throw new Error(`Intervals.icu: HTTP ${r.status}`);
  const activities = await r.json();
  return {
    source: "Garmin via Intervals.icu",
    sessions: (Array.isArray(activities) ? activities : [])
      .filter(a => !(env.HEVY_API_KEY && isStrength(a.type)))
      .map(normalizeGarmin)
  };
}

function normalizeGarmin(a) {
  const type = String(a.type || a.sport_type || "Workout");
  const distanceM = first(a.distance, a.total_distance);
  const movingS = first(a.moving_time, a.elapsed_time, a.duration);
  const km = distanceM == null ? null : distanceM / 1000;
  const minutes = movingS == null ? 0 : Math.max(1, Math.round(movingS / 60));
  return {
    id: `garmin-${a.id}`, source: "Garmin", provider: "Intervals.icu", category: category(type),
    title: a.name || a.title || type, activityType: type, startedAt: iso(a.start_date || a.start_date_local),
    durationMinutes: minutes, distanceKm: round(km, 3), paceMinKm: km && minutes ? round(minutes / km, 3) : null,
    averageHeartRate: num(a.average_heartrate || a.avg_hr), maxHeartRate: num(a.max_heartrate || a.max_hr),
    elevationGainM: num(a.total_elevation_gain), calories: num(a.calories),
    trainingLoad: num(a.icu_training_load || a.training_load || a.tss), rpe: num(a.icu_rpe || a.rpe)
  };
}

async function recommend(env, goal, sessions) {
  const context = coachContext(sessions);
  const prompt = `Tu es le coach de TrainSync. Propose exactement 3 prochaines séances en français, cohérentes entre elles et avec les données réelles.

Règles musculation:
- applique une surcharge progressive prudente exercice par exercice;
- utilise charges, répétitions et RPE récents;
- si une série récente était facile (RPE <= 8), privilégie une petite hausse de répétitions ou de charge;
- si RPE >= 9.5 ou performance en baisse, maintiens ou réduis légèrement au lieu d'augmenter;
- garde une continuité des exercices pour permettre la progression mesurable.

Règles course:
- utilise kilométrage, allure, fréquence cardiaque, dénivelé et charge récente;
- construis une progression logique entre footing facile, séance de qualité et sortie longue;
- évite une hausse brutale du volume hebdomadaire et deux séances difficiles consécutives;
- tiens compte d'une séance jambes récente avant de programmer de l'intensité en course.

Pas de diagnostic médical. Si les données sont insuffisantes, reste conservateur et indique-le.
Objectif: ${goal}
Contexte calculé: ${JSON.stringify(context)}
Historique récent: ${JSON.stringify(sessions.slice(0, 40))}`;

  const r = await fetch(OPENAI, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.6-luna", input: prompt, store: false,
      reasoning: { effort: env.OPENAI_REASONING || "low" },
      text: { format: { type: "json_schema", name: "training_suggestions", strict: true, schema: SCHEMA } }
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `OpenAI: HTTP ${r.status}`);
  const text = data.output_text || data.output?.flatMap(x => x.content || []).find(x => x.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI returned no structured output");
  return new Response(text, { headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

function coachContext(sessions) {
  const recent = [...sessions].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const strength = new Map();
  for (const s of recent.filter(x => x.category === "Musculation" && Array.isArray(x.exercises)).reverse()) {
    for (const ex of s.exercises) {
      const key = ex.exerciseTemplateId || ex.title.toLowerCase();
      if (!strength.has(key)) strength.set(key, { title: ex.title, history: [] });
      const sets = ex.sets.filter(x => x.type !== "warmup" && (x.weightKg || x.reps));
      if (sets.length) strength.get(key).history.push({ date: s.startedAt, sets, volumeKg: Math.round(sets.reduce((n, x) => n + (x.weightKg || 0) * (x.reps || 0), 0)) });
    }
  }

  const runs = recent.filter(x => x.category === "Course");
  const now = Date.now();
  const km = maxAge => runs.filter(r => now - new Date(r.startedAt) <= maxAge * 86400000).reduce((n, r) => n + (r.distanceKm || 0), 0);
  return {
    strength: [...strength.values()].map(x => ({ title: x.title, recent: x.history.slice(-4).reverse() })).slice(0, 24),
    running: {
      km7d: round(km(7), 1), km28d: round(km(28), 1),
      longestRun28d: round(Math.max(0, ...runs.filter(r => now - new Date(r.startedAt) <= 28 * 86400000).map(r => r.distanceKm || 0)), 1),
      recentRuns: runs.slice(0, 10).map(r => ({ date: r.startedAt, distanceKm: r.distanceKm, durationMinutes: r.durationMinutes, paceMinKm: r.paceMinKm, averageHeartRate: r.averageHeartRate, elevationGainM: r.elevationGainM, trainingLoad: r.trainingLoad, rpe: r.rpe }))
    },
    recentSchedule: recent.slice(0, 14).map(s => ({ date: s.startedAt, category: s.category, title: s.title, durationMinutes: s.durationMinutes }))
  };
}

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["suggestions"], properties: {
    suggestions: { type: "array", minItems: 3, maxItems: 3, items: {
      type: "object", additionalProperties: false,
      required: ["id", "kind", "title", "rationale", "durationMinutes", "intensity", "steps"],
      properties: {
        id: { type: "string" }, kind: { type: "string", enum: ["Musculation", "Cardio", "Récupération"] },
        title: { type: "string" }, rationale: { type: "string" }, durationMinutes: { type: "integer" },
        intensity: { type: "string" }, steps: { type: "array", items: { type: "string" } }
      }
    }}
  }
};

function dedupe(items) {
  const m = new Map();
  for (const x of items) m.set(String(x.id || `${x.source}-${x.startedAt}-${x.title}`), x);
  return [...m.values()].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}
function category(v = "") { const s = v.toLowerCase(); if (s.includes("run")) return "Course"; if (s.includes("ride") || s.includes("bike") || s.includes("cycl")) return "Vélo"; if (s.includes("walk") || s.includes("hike")) return "Marche"; if (isStrength(s)) return "Musculation"; return "Cardio"; }
function isStrength(v = "") { const s = String(v).toLowerCase(); return s.includes("weight") || s.includes("strength") || s === "workout"; }
function num(v) { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function first(...v) { for (const x of v) { const n = num(x); if (n != null) return n; } return null; }
function round(v, d = 2) { if (!Number.isFinite(v)) return null; const f = 10 ** d; return Math.round(v * f) / f; }
function iso(v) { const d = new Date(v || Date.now()); return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); }
function ymd(d) { return d.toISOString().slice(0, 10); }
function bounded(v, fallback, min, max) { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Cache-Control": "no-store" };
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }); }
