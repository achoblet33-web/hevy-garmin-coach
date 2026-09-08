import base from "./worker-v221.js";

const VERSION = "2.2.2";
const HEVY = "https://api.hevyapp.com/v1";
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
      return json({
        ok: true,
        version: VERSION,
        configured: config(env),
        historyCap: 5000,
        gpsFallback: true,
        hybridCoach: true,
        clubRunning: true,
        lockedClubSessions: true,
        muscleChoice: true,
        hevyPublishVerification: true,
        visualAssessment: !!env.OPENAI_API_KEY
      });
    }

    if (url.pathname === "/status" && request.method === "GET") {
      const denied = auth(request, env); if (denied) return denied;
      return json({
        ok: true,
        authenticated: true,
        version: VERSION,
        configured: config(env),
        historyCap: 5000,
        gpsFallback: true,
        hybridCoach: true,
        clubRunning: true,
        lockedClubSessions: true,
        muscleChoice: true,
        hevyPublishVerification: true,
        visualAssessment: !!env.OPENAI_API_KEY
      });
    }

    if (url.pathname === "/publish/hevy" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      if (!env.HEVY_API_KEY) return json({ error: "HEVY_API_KEY is not configured" }, 503);

      const body = await request.json().catch(() => ({}));
      const routine = body?.suggestion?.publish?.hevyRoutine || body?.hevyRoutine;
      if (!routine?.exercises?.length) {
        return json({ error: "La séance ne contient pas de routine Hevy exploitable." }, 400);
      }

      try {
        const title = clip(routine.title || body?.suggestion?.title || "TrainSync Coach", 120);
        const exercises = routine.exercises.map(toHevyExercise).filter(Boolean);
        if (!exercises.length) return json({ error: "Aucun exercice Hevy valide dans cette séance." }, 400);

        // Avoid creating a duplicate when the user retries immediately after an uncertain response.
        const recent = await listRoutines(env.HEVY_API_KEY).catch(() => []);
        const duplicate = recent.find(item => sameTitle(item?.title, title) && isRecent(item?.created_at, 20));
        if (duplicate?.id) {
          const verified = await getRoutine(env.HEVY_API_KEY, duplicate.id).catch(() => duplicate);
          return json({
            ok: true,
            verified: true,
            duplicatePrevented: true,
            routineId: String(duplicate.id),
            routine: verified,
            message: `Routine déjà présente et confirmée dans Hevy : ${title}`,
            version: VERSION
          });
        }

        const marker = `TrainSync ${VERSION} · ${new Date().toISOString()}`;
        const payload = {
          routine: {
            title,
            folder_id: null,
            notes: clip([routine.notes, marker].filter(Boolean).join("\n\n"), 900),
            source: "chatgpt",
            exercises
          }
        };

        const created = await hevyRequest(`${HEVY}/routines`, env.HEVY_API_KEY, {
          method: "POST",
          body: JSON.stringify(payload)
        }, 25000);

        const returnedRoutine = created.json?.routine || created.json || null;
        let routineId = returnedRoutine?.id ? String(returnedRoutine.id) : null;
        let verifiedRoutine = null;

        if (routineId) {
          verifiedRoutine = await getRoutine(env.HEVY_API_KEY, routineId).catch(() => null);
        }

        if (!verifiedRoutine) {
          const after = await listRoutines(env.HEVY_API_KEY).catch(() => []);
          const match = after.find(item => sameTitle(item?.title, title) && isRecent(item?.created_at, 20));
          if (match?.id) {
            routineId = String(match.id);
            verifiedRoutine = await getRoutine(env.HEVY_API_KEY, routineId).catch(() => match);
          }
        }

        if (verifiedRoutine && routineId) {
          return json({
            ok: true,
            verified: true,
            routineId,
            routine: verifiedRoutine,
            message: `✓ Routine confirmée dans Hevy : ${title}`,
            version: VERSION
          });
        }

        // Hevy accepted the POST, but we refuse to claim a verified publication if the read-back failed.
        return json({
          ok: true,
          verified: false,
          accepted: true,
          message: "Hevy a accepté la création, mais TrainSync n’a pas pu relire la routine pour la confirmer. Attends quelques secondes puis vérifie Mes routines avant de retenter afin d’éviter un doublon.",
          version: VERSION
        });
      } catch (error) {
        return json({ error: safe(error), version: VERSION }, 500);
      }
    }

    const response = await base.fetch(request, env, ctx);
    if (!response.ok) return response;
    if (!(response.headers.get("Content-Type") || "").includes("application/json")) return response;
    try {
      const data = await response.json();
      if (data && typeof data === "object") data.version = VERSION;
      return json(data, response.status);
    } catch {
      return response;
    }
  }
};

function toHevyExercise(exercise) {
  if (!exercise?.exerciseTemplateId) return null;
  const sets = (Array.isArray(exercise.sets) ? exercise.sets : []).map(toHevySet).filter(Boolean);
  if (!sets.length) return null;
  return {
    exercise_template_id: String(exercise.exerciseTemplateId),
    superset_id: null,
    rest_seconds: finiteInt(exercise.restSeconds, 120),
    notes: clip(exercise.notes || "", 700),
    sets
  };
}

function toHevySet(set) {
  if (!set || typeof set !== "object") return null;
  const type = ["warmup", "normal", "failure", "dropset"].includes(set.type) ? set.type : "normal";
  return {
    type,
    weight_kg: finiteOrNull(set.weightKg),
    reps: intOrNull(set.reps),
    distance_meters: null,
    duration_seconds: null,
    custom_metric: null
  };
}

async function listRoutines(apiKey) {
  const result = await hevyRequest(`${HEVY}/routines?page=1&pageSize=10`, apiKey, {}, 15000);
  const payload = result.json || {};
  return Array.isArray(payload?.routines) ? payload.routines : Array.isArray(payload) ? payload : [];
}

async function getRoutine(apiKey, id) {
  const result = await hevyRequest(`${HEVY}/routines/${encodeURIComponent(id)}`, apiKey, {}, 15000);
  return result.json?.routine || result.json || null;
}

async function hevyRequest(url, apiKey, options = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "api-key": apiKey,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const raw = await response.text();
    let parsed = null;
    if (raw) {
      try { parsed = JSON.parse(raw); } catch { parsed = { raw: clip(raw, 600) }; }
    }
    if (!response.ok) {
      const message = parsed?.error || parsed?.message || `Hevy: HTTP ${response.status}`;
      throw new Error(typeof message === "string" ? message : JSON.stringify(message));
    }
    return { status: response.status, json: parsed, raw };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Hevy : délai de réponse dépassé");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function sameTitle(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}
function isRecent(value, minutes) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time > 0 && Date.now() - time <= minutes * 60000;
}
function finiteOrNull(value) {
  const n = Number(value);
  return value == null || value === "" || !Number.isFinite(n) ? null : n;
}
function intOrNull(value) {
  const n = Number(value);
  return value == null || value === "" || !Number.isFinite(n) ? null : Math.max(0, Math.round(n));
}
function finiteInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}
function clip(value, max) { return String(value || "").slice(0, max); }
function safe(error) {
  return String(error?.message || error || "Erreur inconnue")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-F0-9-]{30,}/gi, "[redacted]")
    .slice(0, 700);
}
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
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" }
  });
}
