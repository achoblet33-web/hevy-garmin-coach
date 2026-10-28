/**
 * TrainSync 3.0 — Intervals.icu is the canonical endurance activity/calendar store.
 * Hevy remains the source of truth for strength session exercise details.
 * This Worker is an additive overlay: v2.3 routes keep working unchanged.
 * Configure Backend/wrangler.jsonc main=worker-v30.js ONLY after preview validation.
 */
import legacy from "./worker-v23.js";
import { buildRunningWorkout } from "./running-workouts.mjs";
const VERSION = "3.0.0-preview.1";
const API = "https://intervals.icu/api/v1";
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};
const json = (data, code = 200) => new Response(JSON.stringify(data), {
  status: code, headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8" },
});
const n = value => value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Math.floor(Number(value)))) : fallback;
const isoDay = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(new Date(value + "T12:00:00Z").getTime());
const dayShift = (date, delta) => { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10); // Used only as query default; UI supplies user-local workout dates.
function auth(request, env) {
  if (!env.APP_TOKEN) return json({ error: "APP_TOKEN absent sur le Worker." }, 503);
  return request.headers.get("Authorization") === `Bearer ${env.APP_TOKEN}` ? null : json({ error: "Non autorisé." }, 401);
}
function intervalConfig(env) {
  const athlete = String(env.INTERVALS_ATHLETE_ID || "").trim();
  return { ready: !!env.INTERVALS_API_KEY && !!athlete, athlete };
}
async function intervalRequest(env, path, options = {}) {
  const config = intervalConfig(env);
  if (!config.ready) throw Object.assign(new Error("Configure INTERVALS_API_KEY et INTERVALS_ATHLETE_ID sur Cloudflare."), { status: 503 });
  const credentials = btoa(`API_KEY:${env.INTERVALS_API_KEY}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(`${API}/athlete/${encodeURIComponent(config.athlete)}${path}`, {
      ...options, signal: controller.signal,
      headers: { Authorization: `Basic ${credentials}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    });
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) throw Object.assign(new Error(`Intervals.icu : HTTP ${response.status}. Vérifie les droits et les paramètres sportifs.`), { status: response.status === 401 || response.status === 403 ? 502 : response.status });
    return data;
  } finally { clearTimeout(timer); }
}
function normalizeActivity(a) {
  const start = a.start_date || a.start_date_local;
  if (!start || Number.isNaN(Date.parse(start))) return null;
  const distanceKm = n(a.distance) == null ? null : +(Number(a.distance) / 1000).toFixed(3);
  const durationSeconds = n(a.moving_time) ?? n(a.elapsed_time) ?? n(a.duration);
  const type = String(a.type || a.sport_type || "");
  return {
    id: `intervals:${String(a.id)}`, externalId: String(a.id), source: "Intervals.icu",
    provider: a.source || a.device_name || null,
    title: a.name || type || "Activité", type,
    category: /run/i.test(type) ? "Course" : /ride|bike|cycl/i.test(type) ? "Vélo" : /weight|strength/i.test(type) ? "Musculation" : "Autre",
    startedAt: start, durationMinutes: durationSeconds == null ? null : Math.round(durationSeconds / 60),
    distanceKm, paceMinKm: distanceKm && durationSeconds ? +((durationSeconds / 60) / distanceKm).toFixed(2) : null,
    averageHeartRate: n(a.average_heartrate ?? a.avg_hr), maxHeartRate: n(a.max_heartrate ?? a.max_hr),
    trainingLoad: n(a.icu_training_load ?? a.training_load), rpe: n(a.icu_rpe ?? a.rpe),
    elevationGainM: n(a.total_elevation_gain), calories: n(a.calories),
  };
}
function normalizeEvent(e) {
  return { id: String(e.id), externalId: e.external_id || null, title: e.name || "Séance",
    date: String(e.start_date_local || "").slice(0, 10), type: e.type || "",
    description: e.description || "", durationMinutes: n(e.moving_time) == null ? null : Math.round(e.moving_time / 60),
    structured: Array.isArray(e.workout_doc?.steps) && e.workout_doc.steps.length > 0 };
}
async function dashboard(request, env) {
  const url = new URL(request.url);
  const days = clamp(url.searchParams.get("days"), 7, 180, 42);
  const end = today(), start = dayShift(end, -days);
  const query = `oldest=${start}&newest=${end}`;
  // Calendar must include future workouts; the activity/wellness lookback must not.
  const calendarQuery = `oldest=${dayShift(end,-7)}&newest=${dayShift(end,42)}`;
  const results = await Promise.allSettled([
    intervalRequest(env, `/activities?${query}`),
    intervalRequest(env, `/events?${calendarQuery}&category=WORKOUT`),
    intervalRequest(env, `/wellness?${query}`),
    // Reuse existing Hevy authentication/normalization; never expose API key to PWA.
    legacy.fetch(new Request(new URL(`/sync?days=${days}`, request.url), { headers: { Authorization: request.headers.get("Authorization") || "" } }), env, {}),
  ]);
  const warnings = [];
  const read = (index, label) => {
    if (results[index].status === "rejected") { warnings.push(`${label} indisponible.`); return []; }
    const data = results[index].value;
    if (index === 3) return data;
    return Array.isArray(data) ? data : [];
  };
  const activities = read(0, "Activités").map(normalizeActivity).filter(Boolean);
  const plans = read(1, "Calendrier").map(normalizeEvent);
  const wellness = read(2, "Récupération").map(w => ({
    date: w.id || w.date || null,
    restingHR: n(w.restingHR), hrv: n(w.hrv), sleepSecs: n(w.sleepSecs),
    weight: n(w.weight), steps: n(w.steps), ctl: n(w.ctl), atl: n(w.atl),
  }));
  const hevyResponse = read(3, "Hevy");
  let strength = [];
  if (hevyResponse instanceof Response && hevyResponse.ok) {
    const payload = await hevyResponse.json().catch(() => ({}));
    strength = (Array.isArray(payload.sessions) ? payload.sessions : []).filter(x => x.source === "Hevy");
    if (payload.sources?.hevy?.configured && !payload.sources?.hevy?.ok) warnings.push("Connexion Hevy non synchronisée.");
  } else warnings.push("Hevy non disponible pour le moment.");
  const unique = new Map(activities.map(a => [a.id, a]));
  return json({
    version: VERSION, syncedAt: new Date().toISOString(), period: { start, end, days },
    sources: { intervals: { configured: true, ok: results[0].status === "fulfilled" },
      calendar: { ok: results[1].status === "fulfilled" }, wellness: { ok: results[2].status === "fulfilled" },
      hevy: { configured: !!env.HEVY_API_KEY, ok: !!strength.length } },
    activities: [...unique.values()].sort((a,b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)),
    strength, planned: plans, wellness, warnings,
    note: "Intervals.icu est la référence des activités. Hevy reste la référence des séries et charges. Aucun doublon n'est écrit dans Apple Santé.",
  });
}
function buildWorkout(input) { return buildRunningWorkout(input, today()); }
async function publish(request, env) {
  const body = await request.json().catch(() => ({}));
  const workout = buildWorkout(body);
  const date = workout.start_date_local.slice(0, 10);
  // The GET-before-POST check prevents ordinary retry duplicates. A backend-level lock
  // would be needed for simultaneous requests; avoid parallel clicks client-side.
  const existing = await intervalRequest(env, `/events?oldest=${date}&newest=${date}&category=WORKOUT`);
  const match = (Array.isArray(existing) ? existing : []).find(e => e.external_id === workout.external_id);
  if (match) return json({ ok: true, existing: true, event: normalizeEvent(match),
    message: "Cette séance existe déjà dans Intervals.icu. Aucun doublon créé.", watchStatus: "non vérifié" });
  // Intervals.icu documents bulk upsert using external_id as the stable client key.
  const results = await intervalRequest(env, "/events/bulk?upsert=true", { method:"POST", body: JSON.stringify([workout]) });
  const created = Array.isArray(results) ? results[0] : null;
  if (!created?.id) throw Object.assign(new Error("Publication non confirmée par Intervals.icu. Vérifier le calendrier avant de réessayer."), {status:502});
  // Read the persisted event to verify structural parsing; do not conflate this with watch sync.
  const event = await intervalRequest(env, `/events/${encodeURIComponent(String(created.id))}`);
  const normalized = normalizeEvent(event || created);
  return json({ ok:true, existing:false, event:normalized, watchStatus:"non vérifié",
    message: normalized.structured
      ? "Séance structurée créée dans Intervals.icu. Ouvre Companion pour contrôler l'envoi sur l'Apple Watch."
      : "Séance créée, mais étapes non confirmées. Vérifie son détail dans Intervals.icu avant l'envoi à la montre." });
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/v3/")) return legacy.fetch(request, env, ctx);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
    const denied = auth(request, env); if (denied) return denied;
    try {
      if (url.pathname === "/v3/status" && request.method === "GET") return json({
        ok: true, version: VERSION, intervals: { configured: intervalConfig(env).ready },
        hevy: { configured: !!env.HEVY_API_KEY },
        watch: { mode: "Intervals.icu Companion", directlyConnected: false },
      });
      if (!intervalConfig(env).ready) return json({ error:"La source Intervals.icu doit être configurée sur Cloudflare." }, 503);
      if (url.pathname === "/v3/dashboard" && request.method === "GET") return dashboard(request, env);
      if (url.pathname === "/v3/workouts/preview" && request.method === "POST") {
        const workout = buildWorkout(await request.json().catch(() => ({})));
        return json({ ok: true, preview: { ...workout, note: "Vérifie les zones HR/Pace de Run dans Intervals.icu avant la synchronisation Apple Watch." } });
      }
      if (url.pathname === "/v3/workouts/publish" && request.method === "POST") return publish(request, env);
      return json({ error: "Route inconnue." }, 404);
    } catch (error) {
      console.error("TrainSync v3 endpoint error", error?.message);
      return json({ error: String(error?.message || "Erreur de synchronisation").slice(0, 180) },
        Number(error?.status) >= 400 && Number(error?.status) <= 599 ? error.status : 502);
    }
  }
};
