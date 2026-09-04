import v14 from "./worker-v14.js";

const HEVY = "https://api.hevyapp.com/v1";
const INTERVALS = "https://intervals.icu/api/v1";
const OPENAI = "https://api.openai.com/v1/responses";
const VERSION = "1.5.0";
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
      return json({ ok: true, version: VERSION, configured: config(env) });
    }

    if (url.pathname === "/status" && request.method === "GET") {
      const denied = auth(request, env); if (denied) return denied;
      return json({ ok: true, authenticated: true, version: VERSION, configured: config(env) });
    }

    if (url.pathname === "/sync" && request.method === "GET") {
      const response = await v14.fetch(request, env, ctx);
      if (!response.ok) return response;
      try {
        const data = await response.json();
        const days = bounded(url.searchParams.get("days"), 120, 7, 365);
        data.sessions = await enhanceSessions(env, Array.isArray(data.sessions) ? data.sessions : [], days);
        return json({ ...data, version: VERSION }, response.status);
      } catch {
        return response;
      }
    }

    if (url.pathname.startsWith("/activity/") && request.method === "GET") {
      const denied = auth(request, env); if (denied) return denied;
      if (!env.INTERVALS_API_KEY) return json({ error: "Intervals.icu is not configured" }, 503);
      const id = decodeURIComponent(url.pathname.slice(10)).replace(/^garmin-/, "");
      try {
        const headers = intervalsHeaders(env);
        const [detail, map] = await Promise.all([
          fetchJson(`${INTERVALS}/activity/${encodeURIComponent(id)}?intervals=true`, headers, 25000),
          fetchJson(`${INTERVALS}/activity/${encodeURIComponent(id)}/map`, headers, 25000).catch(() => null)
        ]);
        return json({
          ok: true,
          id: `garmin-${id}`,
          detail,
          map,
          rawMetrics: flattenMetrics(detail),
          garminAttribution: isGarmin(detail)
        });
      } catch (error) {
        return json({ error: safe(error) }, 500);
      }
    }

    if (url.pathname === "/recommend" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      const body = await request.json().catch(() => ({}));
      const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, 60) : [];
      const goal = body.goal || "Équilibre";
      const loadReport = buildLoadReport(sessions, goal);
      let suggestions;
      let degraded = false;
      let warning = null;

      if (env.OPENAI_API_KEY) {
        try {
          suggestions = await aiCoach(env, goal, sessions, loadReport);
        } catch (error) {
          degraded = true;
          warning = safe(error);
          suggestions = fallbackSuggestions(goal, sessions, loadReport);
        }
      } else {
        degraded = true;
        warning = "OPENAI_API_KEY is not configured";
        suggestions = fallbackSuggestions(goal, sessions, loadReport);
      }

      suggestions = makeExecutableSuggestions(suggestions, sessions, loadReport);
      return json({ ok: true, suggestions, loadReport, degraded, warning, generatedAt: new Date().toISOString() });
    }

    if (url.pathname === "/publish/hevy" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      if (!env.HEVY_API_KEY) return json({ error: "HEVY_API_KEY is not configured" }, 503);
      const body = await request.json().catch(() => ({}));
      const routine = body?.suggestion?.publish?.hevyRoutine || body?.hevyRoutine;
      if (!routine?.exercises?.length) return json({ error: "Cette suggestion ne contient pas de routine Hevy exploitable." }, 400);
      try {
        const payload = {
          routine: {
            title: String(routine.title || body?.suggestion?.title || "TrainSync Coach").slice(0, 120),
            folder_id: null,
            notes: String(routine.notes || "Créée par TrainSync Coach à partir de l'historique récent."),
            source: "chatgpt",
            exercises: routine.exercises.map(toHevyExercise).filter(Boolean)
          }
        };
        if (!payload.routine.exercises.length) return json({ error: "Aucun exercice Hevy valide dans cette suggestion." }, 400);
        const r = await fetchTimed(`${HEVY}/routines`, {
          method: "POST",
          headers: { "api-key": env.HEVY_API_KEY, Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }, 20000);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `Hevy: HTTP ${r.status}`);
        return json({ ok: true, routine: data, message: "Routine créée dans Hevy." });
      } catch (error) {
        return json({ error: safe(error) }, 500);
      }
    }

    if (url.pathname === "/publish/garmin" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      if (!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID)) return json({ error: "Intervals.icu is not configured" }, 503);
      const body = await request.json().catch(() => ({}));
      const workout = body?.suggestion?.publish?.garminWorkout || body?.garminWorkout;
      const date = validDate(body.date) ? body.date : tomorrowYmd();
      if (!workout?.description) return json({ error: "Cette suggestion ne contient pas de séance Garmin structurée." }, 400);
      try {
        const event = {
          category: "WORKOUT",
          start_date_local: `${date}T00:00:00`,
          type: workout.type || "Run",
          name: String(workout.name || body?.suggestion?.title || "TrainSync Coach").slice(0, 120),
          description: String(workout.description),
          external_id: `trainsync-${String(body?.suggestion?.id || crypto.randomUUID()).slice(0, 80)}-${date}`
        };
        const r = await fetchTimed(`${INTERVALS}/athlete/${encodeURIComponent(env.INTERVALS_ATHLETE_ID)}/events/bulk?upsert=true`, {
          method: "POST",
          headers: { ...intervalsHeaders(env), "Content-Type": "application/json" },
          body: JSON.stringify([event])
        }, 20000);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `Intervals.icu: HTTP ${r.status}`);
        return json({
          ok: true,
          event: Array.isArray(data) ? data[0] : data,
          scheduledFor: date,
          message: "Séance créée dans Intervals.icu. Elle sera envoyée à Garmin si l'option « Upload planned workouts » est activée dans la connexion Garmin d'Intervals.icu."
        });
      } catch (error) {
        return json({ error: safe(error) }, 500);
      }
    }

    return v14.fetch(request, env, ctx);
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

async function enhanceSessions(env, sessions, days) {
  if (!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID)) return sessions.map(addLoadProfile);
  try {
    const newest = ymd(new Date());
    const oldest = ymd(new Date(Date.now() - days * 86400000));
    const raw = await fetchJson(`${INTERVALS}/athlete/${encodeURIComponent(env.INTERVALS_ATHLETE_ID)}/activities?oldest=${oldest}&newest=${newest}`, intervalsHeaders(env), 18000);
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.activities) ? raw.activities : []);
    const byId = new Map(list.map(item => [String(item.id), item]));
    return sessions.map(session => {
      if (session.source !== "Garmin") return addLoadProfile(session);
      const rawItem = byId.get(String(session.id).replace(/^garmin-/, "")) || {};
      const aerobicEffect = firstNum(rawItem.aerobic_training_effect, rawItem.total_training_effect, rawItem.aerobic_effect, rawItem.AerobicEffect);
      const anaerobicEffect = firstNum(rawItem.anaerobic_training_effect, rawItem.total_anaerobic_training_effect, rawItem.anaerobic_effect, rawItem.AnaerobicEffect);
      const merged = {
        ...session,
        deviceName: rawItem.device_name || session.deviceName,
        aerobicEffect,
        anaerobicEffect,
        intensity: firstNum(rawItem.icu_intensity, rawItem.intensity),
        averageCadence: firstNum(rawItem.average_cadence, rawItem.avg_cadence),
        maxCadence: firstNum(rawItem.max_cadence),
        averagePower: firstNum(rawItem.average_watts, rawItem.avg_watts, rawItem.average_power),
        maxPower: firstNum(rawItem.max_watts, rawItem.max_power),
        normalizedPower: firstNum(rawItem.icu_weighted_avg_watts, rawItem.weighted_average_watts, rawItem.normalized_power),
        averageSpeed: firstNum(rawItem.average_speed, rawItem.avg_speed),
        maxSpeed: firstNum(rawItem.max_speed),
        temperature: firstNum(rawItem.average_temp, rawItem.avg_temperature, rawItem.temperature)
      };
      return addLoadProfile(merged);
    });
  } catch {
    return sessions.map(addLoadProfile);
  }
}

function addLoadProfile(session) {
  const load = Math.max(1, Number(session.trainingLoad || session.durationMinutes || 1));
  const aerobic = Number(session.aerobicEffect);
  const anaerobic = Number(session.anaerobicEffect);
  let profile;
  if (Number.isFinite(aerobic) || Number.isFinite(anaerobic)) {
    const a = Number.isFinite(aerobic) ? Math.max(0, aerobic) : 0;
    const an = Number.isFinite(anaerobic) ? Math.max(0, anaerobic) : 0;
    const high = a >= 3 ? a : a * 0.25;
    const low = a >= 3 ? a * 0.35 : a;
    const sum = low + high + an || 1;
    profile = { lowAerobic: load * low / sum, highAerobic: load * high / sum, anaerobic: load * an / sum };
  } else {
    const focus = inferFocus(session);
    profile = { lowAerobic: 0, highAerobic: 0, anaerobic: 0 };
    profile[focus] = load;
  }
  return { ...session, loadProfile: profile };
}

function buildLoadReport(sessions, goal) {
  const totals = { lowAerobic: 0, highAerobic: 0, anaerobic: 0 };
  const now = Date.now();
  for (const session of sessions) {
    const age = Math.max(0, (now - new Date(session.startedAt || now).getTime()) / 86400000);
    if (age > 28) continue;
    const decay = Math.exp(-age / 24);
    const enriched = addLoadProfile(session);
    for (const key of Object.keys(totals)) totals[key] += Number(enriched.loadProfile?.[key] || 0) * decay;
  }
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const shares = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / sum]));
  const targets = targetMix(goal);
  const deficits = Object.fromEntries(Object.keys(targets).map(key => [key, targets[key].min - shares[key]]));
  const priority = Object.keys(deficits).sort((a, b) => deficits[b] - deficits[a])[0];
  const status = Object.fromEntries(Object.keys(targets).map(key => {
    const share = shares[key];
    return [key, share < targets[key].min ? "missing" : share > targets[key].max ? "high" : "balanced"];
  }));
  return { totals, shares, targets, deficits, priority, status };
}

function targetMix(goal = "") {
  const g = String(goal).toLowerCase();
  if (g.includes("force") || g.includes("muscle")) return {
    lowAerobic: { min: .25, max: .40 }, highAerobic: { min: .20, max: .35 }, anaerobic: { min: .30, max: .45 }
  };
  if (g.includes("endurance")) return {
    lowAerobic: { min: .45, max: .60 }, highAerobic: { min: .25, max: .40 }, anaerobic: { min: .08, max: .20 }
  };
  if (g.includes("récup") || g.includes("recup")) return {
    lowAerobic: { min: .55, max: .75 }, highAerobic: { min: .15, max: .28 }, anaerobic: { min: .05, max: .15 }
  };
  return {
    lowAerobic: { min: .40, max: .55 }, highAerobic: { min: .25, max: .40 }, anaerobic: { min: .12, max: .25 }
  };
}

async function aiCoach(env, goal, sessions, loadReport) {
  const context = compactContext(sessions);
  const prompt = `Tu es le coach adaptatif de TrainSync. Propose exactement 3 prochaines séances en français. Elles doivent être immédiatement réalisables et cohérentes entre elles.\n\nTu dois utiliser TOUTES les activités récentes, la fatigue et ce focus de charge: ${JSON.stringify(loadReport)}.\n- Faible aérobie = endurance facile/base.\n- Forte aérobie = tempo/seuil/VO2 contrôlé.\n- Anaérobie = puissance/sprints/musculation intense.\n- Évite deux séances difficiles consécutives.\n- Musculation: conserve les exercices réellement pratiqués et applique une surcharge progressive prudente selon charge/répétitions/RPE.\n- Course: adapte volume et intensité aux performances récentes, sans hausse brutale.\n- Pas de diagnostic médical.\nObjectif utilisateur: ${goal}\nHistorique compact: ${JSON.stringify(context)}`;

  const r = await fetchTimed(OPENAI, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.6-terra",
      input: prompt,
      store: false,
      reasoning: { effort: env.OPENAI_REASONING || "low" },
      text: { format: { type: "json_schema", name: "training_suggestions", strict: true, schema: COACH_SCHEMA } }
    })
  }, 35000);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `OpenAI: HTTP ${r.status}`);
  const text = data.output_text || data.output?.flatMap(x => x.content || []).find(x => x.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI returned no structured output");
  return JSON.parse(text).suggestions;
}

function compactContext(sessions) {
  return [...sessions]
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .slice(0, 28)
    .map(session => ({
      date: session.startedAt,
      title: session.title,
      type: session.activityType || session.category,
      duration: session.durationMinutes,
      distanceKm: session.distanceKm,
      pace: session.paceMinKm,
      hr: session.averageHeartRate,
      load: session.trainingLoad,
      aerobicEffect: session.aerobicEffect,
      anaerobicEffect: session.anaerobicEffect,
      rpe: session.rpe,
      exercises: Array.isArray(session.exercises) ? session.exercises.slice(0, 10).map(ex => ({
        title: ex.title,
        id: ex.exerciseTemplateId,
        sets: (ex.sets || []).filter(set => set.type !== "warmup").slice(0, 5)
      })) : undefined
    }));
}

function makeExecutableSuggestions(suggestions, sessions, loadReport) {
  let strengthIndex = 0;
  return suggestions.slice(0, 3).map((suggestion, index) => {
    const base = { ...suggestion, id: suggestion.id || `coach-${Date.now()}-${index}` };
    if (base.kind === "Musculation") {
      const routine = buildHevyRoutine(base, sessions, strengthIndex++);
      return { ...base, destination: routine ? "hevy" : "none", publish: routine ? { hevyRoutine: routine } : null };
    }
    if (base.kind === "Cardio") {
      const workout = buildGarminRun(base, sessions, loadReport);
      return { ...base, destination: "garmin", scheduledFor: datePlus(index + 1), publish: { garminWorkout: workout } };
    }
    return { ...base, destination: "none", publish: null };
  });
}

function buildHevyRoutine(suggestion, sessions, variant = 0) {
  const candidates = sessions
    .filter(s => Array.isArray(s.exercises) && s.exercises.some(ex => ex.exerciseTemplateId))
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  if (!candidates.length) return null;
  const source = candidates[Math.min(variant, candidates.length - 1)];
  const exercises = source.exercises
    .filter(ex => ex.exerciseTemplateId)
    .slice(0, 7)
    .map(ex => progressiveExercise(ex))
    .filter(Boolean);
  if (!exercises.length) return null;
  return {
    title: `${suggestion.title} · TrainSync`,
    notes: `${suggestion.rationale}\nObjectif d'intensité: ${suggestion.intensity}. Charges calculées à partir de la dernière exécution disponible.`,
    exercises
  };
}

function progressiveExercise(exercise) {
  const working = (exercise.sets || []).filter(set => set.type !== "warmup" && (Number.isFinite(Number(set.weightKg)) || Number.isFinite(Number(set.reps))));
  if (!working.length) return null;
  const rpes = working.map(s => Number(s.rpe)).filter(Number.isFinite);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : 8.5;
  const factor = avgRpe <= 8 ? 1.025 : avgRpe >= 9.5 ? .975 : 1;
  const sets = working.slice(0, 4).map(set => {
    const currentWeight = Number(set.weightKg);
    const currentReps = Number(set.reps);
    const weight = Number.isFinite(currentWeight) ? roundHalf(currentWeight * factor) : null;
    let reps = Number.isFinite(currentReps) ? Math.max(1, Math.round(currentReps)) : null;
    if (avgRpe <= 8 && Number.isFinite(currentWeight) && weight === currentWeight && reps != null) reps += 1;
    return { type: "normal", weightKg: weight, reps };
  });
  return {
    exerciseTemplateId: exercise.exerciseTemplateId,
    title: exercise.title,
    restSeconds: 120,
    notes: avgRpe <= 8 ? "Progression légère proposée par TrainSync." : avgRpe >= 9.5 ? "Charge légèrement réduite après effort très élevé." : "Charge maintenue, progression contrôlée.",
    sets
  };
}

function buildGarminRun(suggestion, sessions, loadReport) {
  const runs = sessions.filter(s => String(s.category).toLowerCase().includes("course") && Number(s.paceMinKm) > 0);
  const paces = runs.slice(0, 8).map(s => Number(s.paceMinKm)).filter(Number.isFinite).sort((a, b) => a - b);
  const median = paces.length ? paces[Math.floor(paces.length / 2)] : 6;
  const focus = loadReport.priority;
  let description;
  if (focus === "anaerobic") {
    description = `Échauffement\n- 12m ${paceRange(median * 1.08, median * 1.18)} Pace\n\n6x\n- 1m ${paceRange(median * .82, median * .90)} Pace\n- 2m ${paceRange(median * 1.08, median * 1.20)} Pace\n\nRetour au calme\n- 8m ${paceRange(median * 1.10, median * 1.22)} Pace`;
  } else if (focus === "highAerobic") {
    description = `Échauffement\n- 12m ${paceRange(median * 1.08, median * 1.18)} Pace\n\n3x\n- 7m ${paceRange(median * .93, median * 1.00)} Pace\n- 3m ${paceRange(median * 1.08, median * 1.18)} Pace\n\nRetour au calme\n- 8m ${paceRange(median * 1.10, median * 1.22)} Pace`;
  } else {
    description = `Endurance fondamentale\n- ${Math.max(30, Math.min(60, Number(suggestion.durationMinutes) || 40))}m ${paceRange(median * 1.07, median * 1.18)} Pace`;
  }
  return { type: "Run", name: suggestion.title, description };
}

function fallbackSuggestions(goal, sessions, loadReport) {
  const priority = loadReport.priority;
  const focusText = priority === "anaerobic" ? "anaérobie" : priority === "highAerobic" ? "forte aérobie" : "faible aérobie";
  const cardio = priority === "anaerobic"
    ? { id: "fallback-cardio", kind: "Cardio", title: "Intervalles courts contrôlés", rationale: `Le focus de charge montre un déficit relatif en ${focusText}.`, durationMinutes: 40, intensity: "RPE 8", steps: ["12 min faciles", "6 × 1 min vite / 2 min facile", "8 min retour au calme"] }
    : priority === "highAerobic"
      ? { id: "fallback-cardio", kind: "Cardio", title: "Tempo progressif", rationale: `Le focus de charge montre un déficit relatif en ${focusText}.`, durationMinutes: 45, intensity: "Soutenue contrôlée", steps: ["12 min faciles", "3 × 7 min tempo / 3 min facile", "8 min retour au calme"] }
      : { id: "fallback-cardio", kind: "Cardio", title: "Endurance fondamentale", rationale: `Le focus de charge montre un déficit relatif en ${focusText}.`, durationMinutes: 40, intensity: "Facile", steps: ["40 min en aisance respiratoire", "Allure stable", "Pas d'accélération finale"] };
  const hasStrength = sessions.some(s => Array.isArray(s.exercises) && s.exercises.length);
  const strength = { id: "fallback-strength", kind: "Musculation", title: /force/i.test(goal) ? "Force — progression contrôlée" : "Musculation — continuité", rationale: hasStrength ? "Reprendre les mouvements récents permet une progression mesurable avec charges adaptées." : "Aucun historique Hevy détaillé suffisant : séance prudente.", durationMinutes: 55, intensity: "RPE 7–8", steps: ["Mouvements récents prioritaires", "3–4 séries de travail", "1–3 répétitions en réserve"] };
  const recovery = { id: "fallback-recovery", kind: "Récupération", title: "Récupération active", rationale: "Une séance légère permet d'absorber la charge totale avant la prochaine intensité.", durationMinutes: 30, intensity: "Très facile", steps: ["20–25 min faciles", "5–10 min mobilité", "Pas d'intensité"] };
  return /force|muscle/i.test(goal) ? [strength, cardio, recovery] : [cardio, strength, recovery];
}

function toHevyExercise(exercise) {
  if (!exercise?.exerciseTemplateId) return null;
  return {
    exercise_template_id: String(exercise.exerciseTemplateId),
    superset_id: null,
    rest_seconds: Number(exercise.restSeconds || 120),
    notes: String(exercise.notes || ""),
    sets: (exercise.sets || []).map(set => ({
      type: "normal",
      weight_kg: finiteOrNull(set.weightKg),
      reps: intOrNull(set.reps),
      distance_meters: null,
      duration_seconds: null,
      custom_metric: null
    }))
  };
}

function flattenMetrics(value, prefix = "", depth = 0, out = []) {
  if (depth > 3 || value == null) return out;
  if (Array.isArray(value)) return out;
  if (typeof value !== "object") return out;
  for (const [key, raw] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (raw == null || raw === "") continue;
    if (typeof raw === "object") {
      if (!Array.isArray(raw)) flattenMetrics(raw, path, depth + 1, out);
      continue;
    }
    if (["id", "athlete_id", "oauth_client_id", "uid", "calendar_id"].includes(key)) continue;
    out.push({ key: path, label: metricLabel(path), value: raw });
  }
  return out.slice(0, 400);
}

function metricLabel(path) {
  const p = String(path).toLowerCase();
  if (p.includes("sweat") || /(^|\.)xxx178$/.test(p) || /(^|\.)f_178$/.test(p)) return "Estimation de la transpiration";
  if (/xxx196$/.test(p) || /f_196$/.test(p)) return "Calories au repos";
  const leaf = String(path).split(".").at(-1)
    .replace(/^icu_/, "")
    .replace(/_/g, " ")
    .replace(/\bavg\b/g, "moyenne")
    .replace(/\bhr\b/g, "FC")
    .replace(/\bmax\b/g, "max");
  return leaf.charAt(0).toUpperCase() + leaf.slice(1);
}

function isGarmin(detail) {
  return String(detail?.device_name || detail?.source || "").toLowerCase().includes("garmin");
}

function inferFocus(session) {
  if (session.category === "Musculation") return "anaerobic";
  const text = `${session.activityType || ""} ${session.title || ""}`.toLowerCase();
  if (/sprint|anaerob|hiit|interval|padel|tennis|crossfit/.test(text)) return "anaerobic";
  if (/tempo|threshold|seuil|vo2|race|competition|fartlek/.test(text)) return "highAerobic";
  return "lowAerobic";
}

const COACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array", minItems: 3, maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "kind", "title", "rationale", "durationMinutes", "intensity", "steps"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["Musculation", "Cardio", "Récupération"] },
          title: { type: "string" }, rationale: { type: "string" },
          durationMinutes: { type: "integer" }, intensity: { type: "string" },
          steps: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
};

function intervalsHeaders(env) {
  return { Authorization: `Basic ${btoa(`API_KEY:${env.INTERVALS_API_KEY}`)}`, Accept: "application/json", "User-Agent": "TrainSync/1.5" };
}
async function fetchJson(url, headers, timeout) { const r = await fetchTimed(url, { headers }, timeout); if (!r.ok) throw new Error(`Intervals.icu: HTTP ${r.status}`); return r.json(); }
async function fetchTimed(url, options = {}, timeout = 20000) { const c = new AbortController(), t = setTimeout(() => c.abort(), timeout); try { return await fetch(url, { ...options, signal: c.signal }); } catch (e) { if (e?.name === "AbortError") throw new Error("Service distant: délai dépassé"); throw e; } finally { clearTimeout(t); } }
function safe(error) { return String(error?.message || error || "Erreur inconnue").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }); }
function firstNum(...values) { for (const value of values) { const n = Number(value); if (Number.isFinite(n)) return n; } return null; }
function finiteOrNull(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function intOrNull(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(1, Math.round(n)) : null; }
function roundHalf(value) { return Math.round(value * 2) / 2; }
function bounded(value, fallback, min, max) { const n = Number.parseInt(value, 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function ymd(date) { return date.toISOString().slice(0, 10); }
function tomorrowYmd() { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); }
function datePlus(days) { const d = new Date(); d.setDate(d.getDate() + days); return ymd(d); }
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }
function paceRange(a, b) { return `${paceText(Math.min(a, b))}-${paceText(Math.max(a, b))}/km`; }
function paceText(minutes) { const total = Math.max(120, Math.round(Number(minutes || 6) * 60)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`; }
