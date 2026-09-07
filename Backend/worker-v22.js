import base from "./worker-v21.js";

const VERSION = "2.2.0";
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
        visualAssessment: !!env.OPENAI_API_KEY
      });
    }

    if (url.pathname === "/coach/hybrid-program" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      const body = await request.json().catch(() => ({}));
      const club = normalizeClubSchedule(body.clubSchedule);
      const calendar = normalizeCalendar(body);
      const clubContext = analyzeClubSchedule(club, calendar.localDate);
      const augmented = {
        ...body,
        profile: augmentProfile(body.profile, club, clubContext, body.blockWeek),
        clubSchedule: club,
        localDate: calendar.localDate,
        localWeekday: calendar.localWeekday
      };
      const response = await callBase(request, env, ctx, "/coach/hybrid-program", augmented);
      if (!response.ok) return response;
      const data = await response.json().catch(() => ({}));
      if (data?.program) {
        data.program = applyClubToProgram(data.program, club, clubContext, calendar, body.blockWeek);
        data.club = clubContext;
      }
      data.version = VERSION;
      return json(data, response.status);
    }

    if (url.pathname === "/coach/strength-plan-v2" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      const body = await request.json().catch(() => ({}));
      const club = normalizeClubSchedule(body.clubSchedule);
      const calendar = normalizeCalendar(body);
      const clubContext = analyzeClubSchedule(club, calendar.localDate);
      const protectLegs = clubContext.hardToday || clubContext.hardTomorrow || clubContext.hardYesterday;
      const augmented = {
        ...body,
        focusId: protectLegs ? "upper" : body.focusId,
        customFocus: [
          body.customFocus,
          protectLegs ? "Séance haut du corps prioritaire. Ne programme pas de travail jambes lourd : séance course club imposée à proximité." : "",
          clubContext.next?.details ? `Prochaine séance club imposée : ${clubContext.next.details}` : ""
        ].filter(Boolean).join(" · ").slice(0, 650),
        profile: augmentProfile(body.profile, club, clubContext, body.blockWeek)
      };
      const response = await callBase(request, env, ctx, "/coach/strength-plan-v2", augmented);
      if (!response.ok) return response;
      const data = await response.json().catch(() => ({}));
      if (data?.plan) data.plan = protectStrengthPlan(data.plan, clubContext);
      data.club = clubContext;
      data.version = VERSION;
      return json(data, response.status);
    }

    if (url.pathname === "/coach/cardio-plan-v2" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      const body = await request.json().catch(() => ({}));
      const club = normalizeClubSchedule(body.clubSchedule);
      const calendar = normalizeCalendar(body);
      const clubContext = analyzeClubSchedule(club, calendar.localDate);
      if (clubContext.today) {
        return json({
          error: "Une séance course club est imposée aujourd’hui. TrainSync la considère comme prioritaire et ne génère pas une seconde séance cardio concurrente."
        }, 409);
      }
      const qualityNearby = clubContext.hardTomorrow || clubContext.hardYesterday || clubContext.hardWithin48h || clubContext.qualityNext7 >= 2;
      const augmented = {
        ...body,
        customFocus: [
          qualityNearby ? "Séance complémentaire facile uniquement : endurance fondamentale / récupération, sans fractionné ni seuil." : "",
          body.customFocus,
          clubContext.next?.details ? `Respecter la séance club imposée à venir : ${clubContext.next.details}` : ""
        ].filter(Boolean).join(" · ").slice(0, 500),
        profile: augmentProfile(body.profile, club, clubContext, body.blockWeek)
      };
      const response = await callBase(request, env, ctx, "/coach/cardio-plan-v2", augmented);
      if (!response.ok) return response;
      const data = await response.json().catch(() => ({}));
      if (data?.plan) data.plan = protectCardioPlan(data.plan, clubContext, qualityNearby);
      data.club = clubContext;
      data.version = VERSION;
      return json(data, response.status);
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

async function callBase(request, env, ctx, path, payload) {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = "";
  return base.fetch(new Request(url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(payload)
  }), env, ctx);
}

function normalizeClubSchedule(value) {
  const sessions = (Array.isArray(value?.sessions) ? value.sessions : [])
    .map((item, index) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(item?.date || "")) ? String(item.date) : null;
      if (!date) return null;
      const intensity = ["easy", "moderate", "hard", "unknown"].includes(item?.intensity) ? item.intensity : "unknown";
      return {
        id: String(item?.id || `club-${date}-${index}`),
        date,
        time: /^\d{2}:\d{2}$/.test(String(item?.time || "")) ? String(item.time) : "",
        title: clip(item?.title || "Séance course club", 100),
        intensity,
        details: clip(item?.details || "Séance imposée par le club", 500),
        locked: true,
        source: "club"
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return { enabled: sessions.length > 0, sessions: sessions.slice(0, 12) };
}

function normalizeCalendar(body) {
  const now = new Date();
  const fallback = now.toISOString().slice(0, 10);
  const localDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.localDate || "")) ? String(body.localDate) : fallback;
  const localWeekday = clip(body?.localWeekday || "", 20);
  return { localDate, localWeekday };
}

function analyzeClubSchedule(club, localDate) {
  const todayMs = dateMs(localDate);
  const enriched = club.sessions.map(session => ({
    ...session,
    dayOffset: Math.round((dateMs(session.date) - todayMs) / 86400000),
    conservativeIntensity: session.intensity === "unknown" ? "hard" : session.intensity
  }));
  const today = enriched.find(s => s.dayOffset === 0) || null;
  const tomorrow = enriched.find(s => s.dayOffset === 1) || null;
  const yesterday = enriched.find(s => s.dayOffset === -1) || null;
  const next = enriched.find(s => s.dayOffset >= 0) || null;
  const isHard = s => !!s && ["hard", "unknown"].includes(s.intensity);
  return {
    enabled: club.enabled,
    sessions: enriched,
    today,
    tomorrow,
    yesterday,
    next,
    hardToday: isHard(today),
    hardTomorrow: isHard(tomorrow),
    hardYesterday: isHard(yesterday),
    hardWithin48h: enriched.some(s => Math.abs(s.dayOffset) <= 2 && isHard(s)),
    qualityNext7: enriched.filter(s => s.dayOffset >= 0 && s.dayOffset <= 7 && isHard(s)).length,
    next7: enriched.filter(s => s.dayOffset >= 0 && s.dayOffset <= 7)
  };
}

function augmentProfile(profile = {}, club, clubContext, blockWeek) {
  const summary = club.enabled
    ? club.sessions.map(s => `${s.date}${s.time ? ` ${s.time}` : ""}: ${s.title} [${s.intensity}] — ${s.details}`).join(" | ")
    : "Aucune séance club planifiée.";
  const rules = "Les séances course club sont strictement imposées: ne jamais les remplacer, déplacer, raccourcir ou intensifier. Le coach adapte la musculation et les séances facultatives autour. Une intensité club inconnue est considérée comme exigeante par prudence. Éviter une grosse séance jambes dans les 24 h avant une séance club exigeante; après une séance club exigeante, privilégier haut du corps, facile ou récupération. Si deux séances club exigeantes sont déjà prévues sur 7 jours, ne pas ajouter de troisième séance cardio de qualité.";
  return {
    ...profile,
    constraintsText: [profile?.constraintsText, rules, `Planning club: ${summary}`, blockWeek ? `Semaine actuelle du bloc: ${blockWeek}/4.` : ""].filter(Boolean).join(" ").slice(0, 1800),
    clubRunningEnabled: club.enabled,
    clubQualityNext7: clubContext.qualityNext7
  };
}

function applyClubToProgram(program, club, clubContext, calendar, blockWeek) {
  const result = structuredCloneSafe(program);
  result.block = result.block || {};
  if (Number.isFinite(Number(blockWeek))) result.block.currentWeek = clampInt(blockWeek, 1, 1, 4);
  result.club = {
    enabled: club.enabled,
    rule: "Les séances du club sont verrouillées. TrainSync organise le reste autour d’elles.",
    sessions: clubContext.next7
  };
  result.weeklyStructure = mergeWeeklyStructure(result.weeklyStructure, clubContext.next7, calendar.localDate);

  if (clubContext.today) {
    const s = clubContext.today;
    result.today = {
      ...(result.today || {}),
      recommendedType: "cardio",
      headline: `Course club imposée aujourd’hui · ${s.title}`,
      confidence: 99,
      rationale: [
        "Cette séance appartient au planning du club et reste prioritaire.",
        s.details || "Le contenu est imposé par le club.",
        isClubHard(s) ? "Aucune autre séance intense n’est ajoutée aujourd’hui." : "Le reste de la journée reste volontairement léger."
      ],
      strengthFocus: "Aucune musculation jambes lourde aujourd’hui",
      cardioFocus: s.details || s.title,
      durationMinutes: Number(result.today?.durationMinutes || 60),
      clubLocked: true,
      clubSession: s
    };
  } else {
    result.today = result.today || {};
    result.today.clubLocked = false;
    result.today.clubSession = null;

    if (clubContext.hardTomorrow) {
      result.today.recommendedType = "strength";
      result.today.headline = "Musculation haut du corps — protéger la séance club de demain";
      result.today.strengthFocus = "Haut du corps · dos / poussée / épaules · jambes fraîches";
      result.today.rationale = prependUnique(result.today.rationale, "Une séance course club exigeante est prévue demain : pas de grosse fatigue des jambes aujourd’hui.");
    } else if (clubContext.hardYesterday) {
      result.today.strengthFocus = "Haut du corps ou séance générale très contrôlée";
      result.today.cardioFocus = "Récupération / endurance très facile";
      result.today.rationale = prependUnique(result.today.rationale, "La séance club exigeante d’hier compte déjà comme stimulus jambes/cardio de qualité.");
    }
    if (clubContext.qualityNext7 >= 2) {
      result.cardioRules = prependUnique(result.cardioRules, "Deux séances club exigeantes sont déjà prévues : les séances cardio supplémentaires restent faciles sauf décision exceptionnelle du coach.");
    }
  }

  result.strengthRules = prependUnique(result.strengthRules, "La musculation se place autour des séances club verrouillées; protéger en priorité la qualité des jambes avant les séances course exigeantes.");
  result.recoveryRules = prependUnique(result.recoveryRules, "Les séances club imposées entrent intégralement dans le calcul de charge et de récupération.");
  return result;
}

function mergeWeeklyStructure(base, clubSessions, localDate) {
  const start = dateMs(localDate);
  const byDate = new Map(clubSessions.map(s => [s.date, s]));
  const coach = Array.isArray(base) ? [...base] : [];
  const out = [];
  let coachIndex = 0;
  for (let i = 0; i < 7; i++) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const club = byDate.get(date);
    if (club) {
      out.push({
        day: formatDay(date),
        date,
        title: club.title,
        focus: club.details || "Séance imposée par le club",
        intensity: club.intensity === "unknown" ? "Imposée · intensité à confirmer" : labelIntensity(club.intensity),
        source: "club",
        locked: true
      });
      continue;
    }
    const item = coach[coachIndex++];
    if (!item) {
      out.push({ day: formatDay(date), date, title: "Récupération / libre", focus: "Repos, mobilité ou marche", intensity: "Très facile", source: "coach", locked: false });
      continue;
    }
    const previousClub = clubSessions.find(s => s.date === new Date(start + (i - 1) * 86400000).toISOString().slice(0, 10));
    const nextClub = clubSessions.find(s => s.date === new Date(start + (i + 1) * 86400000).toISOString().slice(0, 10));
    let adjusted = { ...item };
    if (nextClub && isClubHard(nextClub) && /jambe|lower|squat|force.*bas|puissance/i.test(`${item.title} ${item.focus}`)) {
      adjusted = { ...adjusted, title: "Musculation haut du corps", focus: "Préserver les jambes pour la séance club du lendemain", intensity: "Modérée" };
    }
    if (previousClub && isClubHard(previousClub) && /cardio qualitatif|interval|seuil|tempo|vo2|vitesse/i.test(`${item.title} ${item.focus}`)) {
      adjusted = { ...adjusted, title: "Récupération active", focus: "Assimiler la séance club de la veille", intensity: "Facile" };
    }
    out.push({ ...adjusted, day: formatDay(date), date, source: "coach", locked: false });
  }
  return out;
}

function protectStrengthPlan(plan, clubContext) {
  if (!clubContext.hardToday && !clubContext.hardTomorrow && !clubContext.hardYesterday) return annotateClubPlan(plan, clubContext);
  const exercises = (plan.exercises || []).filter(ex => !isLegExercise(ex.title || ""));
  const kept = exercises.length >= 3 ? exercises : (plan.exercises || []).map(ex => {
    if (!isLegExercise(ex.title || "")) return ex;
    const sets = (ex.sets || []).filter(s => s.type !== "dropset" && s.type !== "failure");
    let normalSeen = 0;
    return {
      ...ex,
      notes: `${ex.notes || ""} Volume jambes réduit pour préserver la séance course club imposée.`.trim(),
      sets: sets.filter(s => s.type === "warmup" || (s.type === "normal" && ++normalSeen <= 2)).map(s => s.type === "normal" ? { ...s, rpe: Math.min(Number(s.rpe || 8), 7.5) } : s)
    };
  });
  const finalExercises = exercises.length >= 3 ? exercises : kept;
  const protectedPlan = {
    ...plan,
    title: exercises.length >= 3 ? `${plan.title} · haut du corps` : plan.title,
    rationale: `${plan.rationale || ""} TrainSync protège volontairement les jambes car une séance course club exigeante est proche.`.trim(),
    exercises: finalExercises,
    totalSets: finalExercises.reduce((n, ex) => n + (ex.sets || []).length, 0)
  };
  if (protectedPlan.publish?.hevyRoutine) {
    const ids = new Set(finalExercises.map(ex => String(ex.exerciseTemplateId)));
    protectedPlan.publish.hevyRoutine = {
      ...protectedPlan.publish.hevyRoutine,
      notes: `${protectedPlan.publish.hevyRoutine.notes || ""} Adaptation club course: jambes protégées autour de la séance imposée.`.trim(),
      exercises: (protectedPlan.publish.hevyRoutine.exercises || []).filter(ex => ids.has(String(ex.exerciseTemplateId)))
    };
  }
  return protectedPlan;
}

function annotateClubPlan(plan, clubContext) {
  if (!clubContext.next) return plan;
  return {
    ...plan,
    rationale: `${plan.rationale || ""} Prochaine séance club verrouillée : ${clubContext.next.date} · ${clubContext.next.title}.`.trim()
  };
}

function protectCardioPlan(plan, clubContext, qualityNearby) {
  if (!qualityNearby) return annotateClubPlan(plan, clubContext);
  return {
    ...plan,
    title: /facile|endurance/i.test(plan.title || "") ? plan.title : `Endurance complémentaire · ${plan.durationMinutes || ""} min`.trim(),
    rationale: `${plan.rationale || ""} Les séances club fournissent déjà le travail qualitatif : cette séance complémentaire doit rester facile.`.trim(),
    coachNote: "Séance volontairement facile pour ne pas concurrencer le planning course du club.",
    clubProtected: true
  };
}

function prependUnique(list, text) {
  const arr = Array.isArray(list) ? list.filter(Boolean) : [];
  return arr.includes(text) ? arr : [text, ...arr].slice(0, 6);
}

function isClubHard(session) {
  return !!session && ["hard", "unknown"].includes(session.intensity);
}
function isLegExercise(title) {
  return /squat|leg press|hack|fente|lunge|step up|leg extension|leg curl|deadlift|souleve|rdl|hip thrust|good morning|mollet|calf|ischio|quadriceps/i.test(title);
}
function labelIntensity(value) {
  return value === "easy" ? "Facile" : value === "moderate" ? "Modérée" : value === "hard" ? "Exigeante" : "À confirmer";
}
function formatDay(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
function dateMs(date) {
  return Date.parse(`${date}T12:00:00Z`);
}
function structuredCloneSafe(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
function clip(value, max) {
  return String(value || "").trim().slice(0, max);
}
function clampInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
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
