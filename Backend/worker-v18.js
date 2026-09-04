import v17 from "./worker-v17.js";

const HEVY = "https://api.hevyapp.com/v1";
const VERSION = "1.8.0";
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

    if (url.pathname === "/coach/strength-plan" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      const body = await request.clone().json().catch(() => ({}));
      const response = await v17.fetch(request, env, ctx);
      if (!response.ok) return response;
      try {
        const data = await response.json();
        if (data?.plan?.exercises?.length) {
          data.plan = applyAdvancedSetStrategy(data.plan, body);
          data.version = VERSION;
        }
        return json(data, response.status);
      } catch {
        return response;
      }
    }

    if (url.pathname === "/publish/hevy" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      if (!env.HEVY_API_KEY) return json({ error: "HEVY_API_KEY is not configured" }, 503);
      const body = await request.json().catch(() => ({}));
      const routine = body?.suggestion?.publish?.hevyRoutine || body?.hevyRoutine;
      if (!routine?.exercises?.length) return json({ error: "Cette séance ne contient pas de routine Hevy exploitable." }, 400);

      try {
        const exercises = routine.exercises.map(toHevyExercise).filter(Boolean);
        if (!exercises.length) return json({ error: "Aucun exercice Hevy valide dans cette séance." }, 400);
        const payload = {
          routine: {
            title: String(routine.title || body?.suggestion?.title || "TrainSync Coach").slice(0, 120),
            folder_id: null,
            notes: String(routine.notes || "Créée par TrainSync Coach."),
            source: "chatgpt",
            exercises
          }
        };
        const r = await fetchTimed(`${HEVY}/routines`, {
          method: "POST",
          headers: { "api-key": env.HEVY_API_KEY, Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }, 25000);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `Hevy: HTTP ${r.status}`);
        return json({ ok: true, routine: data, message: "Routine créée dans Hevy avec les séries d’échauffement et dropsets prévus." });
      } catch (error) {
        return json({ error: safe(error) }, 500);
      }
    }

    const response = await v17.fetch(request, env, ctx);
    if (url.pathname === "/sync" && response.ok) {
      try {
        const data = await response.json();
        data.version = VERSION;
        return json(data, response.status);
      } catch { return response; }
    }
    return response;
  }
};

function applyAdvancedSetStrategy(plan, body) {
  const goal = normalizeText(body?.goal || plan.goal || "");
  const duration = Number(body?.durationMinutes || plan.durationMinutes || 60);
  const exercises = plan.exercises.map(ex => ({ ...ex, sets: (ex.sets || []).map(set => ({ ...set, type: validSetType(set.type) })) }));

  let warmupCount = 0;
  exercises.forEach((exercise, index) => {
    const working = exercise.sets.filter(s => s.type === "normal");
    const referenceWeight = firstWorkingWeight(working);
    if (!shouldWarmUp(exercise, index, referenceWeight, warmupCount)) return;

    const warmups = buildWarmups(referenceWeight, working[0]?.reps, index === 0);
    if (!warmups.length) return;
    exercise.sets = [...warmups, ...exercise.sets];
    warmupCount += warmups.length;
    exercise.notes = `${exercise.notes || ""}${exercise.notes ? " " : ""}${warmups.length} série${warmups.length > 1 ? "s" : ""} d’échauffement ajoutée${warmups.length > 1 ? "s" : ""} pour préparer le mouvement sans entamer les séries de travail.`;
  });

  let dropSetApplied = false;
  if (duration >= 45 && !goal.includes("force") && !goal.includes("recuper") && !goal.includes("récup")) {
    for (let index = exercises.length - 1; index >= 0; index--) {
      const exercise = exercises[index];
      if (!isUsefulDropSetCandidate(exercise)) continue;
      const working = exercise.sets.filter(s => s.type === "normal");
      const last = working.at(-1);
      const weight = Number(last?.weightKg);
      const reps = Number(last?.reps);
      if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(reps) || reps <= 0) continue;
      exercise.sets.push({
        type: "dropset",
        weightKg: roundLoad(weight * 0.70),
        reps: Math.max(8, Math.min(15, reps + 3)),
        rpe: 9.5
      });
      exercise.notes = `${exercise.notes || ""}${exercise.notes ? " " : ""}Dropset final uniquement : enchaîne sans repos après la dernière série de travail, avec environ 30 % de charge en moins. Arrête si la technique se dégrade.`;
      dropSetApplied = true;
      break;
    }
  }

  const allSets = exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const warmups = exercises.reduce((n, ex) => n + ex.sets.filter(s => s.type === "warmup").length, 0);
  const dropsets = exercises.reduce((n, ex) => n + ex.sets.filter(s => s.type === "dropset").length, 0);
  const routine = {
    ...(plan.publish?.hevyRoutine || {}),
    title: plan.publish?.hevyRoutine?.title || plan.title,
    notes: `${plan.publish?.hevyRoutine?.notes || ""} TrainSync a ajouté les échauffements seulement sur les mouvements qui le justifient${dropSetApplied ? " et un dropset ciblé en fin de séance" : "; aucun dropset n’a été jugé utile sur cette séance"}.`,
    exercises: exercises.map(ex => ({
      exerciseTemplateId: ex.exerciseTemplateId,
      title: ex.title,
      restSeconds: ex.restSeconds,
      notes: ex.notes,
      sets: ex.sets.map(set => ({
        type: validSetType(set.type),
        weightKg: finiteOrNull(set.weightKg),
        reps: intOrNull(set.reps),
        rpe: quantizeRpe(set.rpe)
      }))
    }))
  };

  return {
    ...plan,
    exercises,
    totalSets: allSets,
    advancedSets: {
      warmups,
      dropsets,
      strategy: dropsets ? "Échauffement ciblé + dropset hypertrophie utile" : "Échauffement ciblé, sans dropset inutile"
    },
    publish: { ...(plan.publish || {}), hevyRoutine: routine }
  };
}

function shouldWarmUp(exercise, index, workingWeight, currentWarmups) {
  if (!Number.isFinite(workingWeight) || workingWeight < 10) return false;
  if (exercise.novelty === "new") return false;
  if (index === 0) return true;
  if (currentWarmups >= 3) return false;
  if (workingWeight < 25) return false;
  return isCompoundLike(exercise.title) && index <= 3;
}

function buildWarmups(workingWeight, reps, firstExercise) {
  const targetReps = Number.isFinite(Number(reps)) ? Number(reps) : 8;
  if (workingWeight >= 40 && firstExercise) {
    return [
      { type: "warmup", weightKg: roundLoad(workingWeight * 0.50), reps: Math.max(6, Math.min(10, targetReps + 2)), rpe: 6 },
      { type: "warmup", weightKg: roundLoad(workingWeight * 0.72), reps: Math.max(3, Math.min(6, targetReps - 2)), rpe: 6 }
    ];
  }
  return [{ type: "warmup", weightKg: roundLoad(workingWeight * 0.60), reps: Math.max(5, Math.min(8, targetReps)), rpe: 6 }];
}

function isUsefulDropSetCandidate(exercise) {
  if (exercise.novelty === "new") return false;
  const text = normalizeText(exercise.title || "");
  const isolation = /curl|extension|elevation|lateral|raise|fly|ecarte|pec deck|triceps|biceps|mollet|calf|leg curl|leg extension|pushdown|pulldown|abduction|adduction/.test(text);
  const compound = /squat|deadlift|souleve|bench|developpe couche|overhead press|military|row barbell|barbell row|hip thrust lourd/.test(text);
  return isolation && !compound;
}

function isCompoundLike(title = "") {
  const text = normalizeText(title);
  return /squat|deadlift|souleve|bench|developpe|press|row|tirage|pull.?up|traction|dip|hip thrust|leg press|hack squat/.test(text);
}

function firstWorkingWeight(sets) {
  for (const set of sets) {
    const n = Number(set.weightKg);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function toHevyExercise(exercise) {
  if (!exercise?.exerciseTemplateId) return null;
  return {
    exercise_template_id: String(exercise.exerciseTemplateId),
    superset_id: null,
    rest_seconds: Math.max(0, Math.round(Number(exercise.restSeconds || 120))),
    notes: String(exercise.notes || ""),
    sets: (exercise.sets || []).map(set => ({
      type: validSetType(set.type),
      weight_kg: finiteOrNull(set.weightKg),
      reps: intOrNull(set.reps),
      distance_meters: null,
      duration_seconds: null,
      custom_metric: null,
      rpe: quantizeRpe(set.rpe)
    }))
  };
}

function validSetType(value) {
  return ["warmup", "normal", "failure", "dropset"].includes(value) ? value : "normal";
}
function quantizeRpe(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const allowed = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];
  return allowed.reduce((best, candidate) => Math.abs(candidate - n) < Math.abs(best - n) ? candidate : best, allowed[0]);
}
function finiteOrNull(value) { const n = Number(value); return value == null || value === "" || !Number.isFinite(n) ? null : n; }
function intOrNull(value) { const n = Number(value); return value == null || value === "" || !Number.isFinite(n) ? null : Math.max(1, Math.round(n)); }
function roundLoad(value) { const n = Number(value); return !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 2) / 2; }
function normalizeText(value = "") { return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function config(env) { return { auth: !!env.APP_TOKEN, hevy: !!env.HEVY_API_KEY, garmin: !!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID), coach: !!env.OPENAI_API_KEY, hevyWrite: !!env.HEVY_API_KEY, garminWrite: !!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID) }; }
function auth(request, env) { if (!env.APP_TOKEN) return json({ error: "APP_TOKEN is not configured" }, 503); return request.headers.get("Authorization") === `Bearer ${env.APP_TOKEN}` ? null : json({ error: "Unauthorized" }, 401); }
async function fetchTimed(url, options = {}, timeout = 20000) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout); try { return await fetch(url, { ...options, signal: controller.signal }); } catch (error) { if (error?.name === "AbortError") throw new Error("Service distant: délai dépassé"); throw error; } finally { clearTimeout(timer); } }
function safe(error) { return String(error?.message || error || "Erreur inconnue").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }); }
