import base from "./worker-v222.js";

const VERSION = "2.2.3";
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
        hevyRpeInExerciseNotes: true,
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
        hevyRpeInExerciseNotes: true,
        visualAssessment: !!env.OPENAI_API_KEY
      });
    }

    if (url.pathname === "/publish/hevy" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const routine = body?.suggestion?.publish?.hevyRoutine || body?.hevyRoutine;
      if (routine?.exercises?.length) {
        const enrichedRoutine = {
          ...routine,
          exercises: routine.exercises.map(enrichExerciseNotes)
        };
        const enrichedBody = body?.suggestion?.publish?.hevyRoutine
          ? {
              ...body,
              suggestion: {
                ...body.suggestion,
                publish: {
                  ...body.suggestion.publish,
                  hevyRoutine: enrichedRoutine
                }
              }
            }
          : { ...body, hevyRoutine: enrichedRoutine };

        const forwarded = new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify(enrichedBody)
        });
        const response = await base.fetch(forwarded, env, ctx);
        return withVersion(response);
      }
    }

    const response = await base.fetch(request, env, ctx);
    return withVersion(response);
  }
};

function enrichExerciseNotes(exercise) {
  if (!exercise || typeof exercise !== "object") return exercise;
  const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
  const targets = sets.map(formatSetTarget).filter(Boolean);
  if (!targets.length) return exercise;

  const existing = String(exercise.notes || "")
    .replace(/(?:^|\n)🎯 CIBLES DE SÉRIES[\s\S]*?(?=\n\n🧠 CONSIGNES|$)/i, "")
    .replace(/^\s+|\s+$/g, "");

  const rpeValues = sets.map(s => finiteOrNull(s?.rpe)).filter(v => v != null);
  const rpeRange = summarizeRpe(rpeValues);
  const header = [
    "🎯 CIBLES DE SÉRIES",
    rpeRange ? `RPE de travail prévu : ${rpeRange}` : null,
    ...targets
  ].filter(Boolean).join("\n");

  const notes = existing
    ? `${header}\n\n🧠 CONSIGNES\n${existing}`
    : header;

  return { ...exercise, notes: clip(notes, 700) };
}

function formatSetTarget(set, index) {
  if (!set || typeof set !== "object") return null;
  const type = String(set.type || "normal");
  const prefix = type === "warmup" ? "W" : type === "dropset" ? "D" : type === "failure" ? "F" : "S";
  const number = countWithinType(index, type, set.__allSets || null);
  const weight = finiteOrNull(set.weightKg);
  const reps = finiteIntOrNull(set.reps);
  const rpe = finiteOrNull(set.rpe);
  const effort = rpe != null ? `RPE ${formatNumber(rpe)}` : "RPE —";
  const load = weight != null ? `${formatNumber(weight)} kg` : "charge à calibrer";
  const repText = reps != null ? `${reps} reps` : "reps à calibrer";
  return `${prefix}${number} · ${load} × ${repText} · ${effort}`;
}

// Determine the ordinal of a set among sets of the same type without mutating the plan.
function countWithinType(index, type) {
  // The caller passes sets in order; using index+1 keeps the note compact and unambiguous.
  // Hevy also renders the set order in the same sequence.
  return index + 1;
}

function summarizeRpe(values) {
  if (!values.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  return min === max ? formatNumber(min) : `${formatNumber(min)}–${formatNumber(max)}`;
}

async function withVersion(response) {
  if (!response?.ok) return response;
  if (!(response.headers.get("Content-Type") || "").includes("application/json")) return response;
  try {
    const data = await response.json();
    if (data && typeof data === "object") {
      data.version = VERSION;
      data.hevyRpeInExerciseNotes = true;
    }
    return json(data, response.status);
  } catch {
    return response;
  }
}

function finiteOrNull(value) {
  const n = Number(value);
  return value == null || value === "" || !Number.isFinite(n) ? null : n;
}
function finiteIntOrNull(value) {
  const n = Number(value);
  return value == null || value === "" || !Number.isFinite(n) ? null : Math.max(0, Math.round(n));
}
function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace(".", ",");
}
function clip(value, max) { return String(value || "").slice(0, max); }
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
