import v18 from "./worker-v18.js";

const VERSION = "1.9.0";
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

    if (url.pathname === "/coach/next-session" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      const body = await request.json().catch(() => ({}));
      const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, 320) : [];
      const goal = String(body.goal || "Équilibre");
      const recommendation = recommendNextType(sessions, goal);
      return json({ ok: true, recommendation, version: VERSION });
    }

    if (url.pathname === "/coach/cardio-plan" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      const body = await request.json().catch(() => ({}));
      const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, 320) : [];
      const durationMinutes = clampInt(body.durationMinutes, 45, 20, 120);
      const goal = String(body.goal || "Équilibre");
      const customFocus = String(body.customFocus || "").slice(0, 240);
      const plan = buildCardioPlan(sessions, durationMinutes, goal, customFocus);
      return json({ ok: true, plan, version: VERSION });
    }

    const response = await v18.fetch(request, env, ctx);
    if (!response.ok) return response;
    if (["/sync", "/coach/strength-options", "/coach/strength-plan", "/publish/hevy", "/publish/garmin", "/recommend"].includes(url.pathname)) {
      try {
        const data = await response.json();
        data.version = VERSION;
        return json(data, response.status);
      } catch { return response; }
    }
    return response;
  }
};

function recommendNextType(sessions, goal) {
  const recent = [...sessions]
    .filter(s => s?.startedAt)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const now = Date.now();
  const strength = recent.filter(s => isStrength(s));
  const cardio = recent.filter(s => isCardio(s));
  const lastStrengthDays = ageDays(strength[0]?.startedAt, now);
  const lastCardioDays = ageDays(cardio[0]?.startedAt, now);
  const lastAnyHours = recent[0] ? Math.max(0, (now - new Date(recent[0].startedAt).getTime()) / 3600000) : 999;
  const recent72Load = recent
    .filter(s => ageDays(s.startedAt, now) <= 3)
    .reduce((sum, s) => sum + Number(s.trainingLoad || s.durationMinutes || 0), 0);
  const load = loadBalance(recent, goal);
  const cardioNeed = Math.max(load.deficits.lowAerobic, load.deficits.highAerobic);
  const strengthNeed = load.deficits.anaerobic;
  const goalText = normalize(goal);
  let type = "cardio";
  const reasons = [];

  const hardYesterday = recent.some(s => ageDays(s.startedAt, now) <= 1.2 && isHard(s));
  const recentLegs = strength.some(s => ageDays(s.startedAt, now) <= 2 && looksLikeLegStrength(s));

  if (hardYesterday || recent72Load >= 260) {
    type = "cardio";
    reasons.push("Ta charge des dernières 72 h est déjà élevée : un travail cardio contrôlé est plus cohérent qu’une nouvelle séance musculaire lourde.");
  } else if ((goalText.includes("force") || goalText.includes("muscle")) && lastStrengthDays >= 2 && strengthNeed >= -0.04) {
    type = "strength";
    reasons.push("Ton objectif favorise la progression musculaire et tu as suffisamment espacé la dernière séance de musculation.");
  } else if (goalText.includes("endurance") && lastCardioDays >= 1) {
    type = "cardio";
    reasons.push("Ton objectif endurance donne la priorité au développement aérobie aujourd’hui.");
  } else if (strengthNeed > cardioNeed + 0.04 && lastStrengthDays >= 2) {
    type = "strength";
    reasons.push("La composante anaérobie est actuellement la plus déficitaire et la musculation est suffisamment espacée.");
  } else if (cardioNeed > strengthNeed + 0.03 && lastCardioDays >= 1) {
    type = "cardio";
    reasons.push("Ton profil de charge manque davantage de travail aérobie que de travail anaérobie.");
  } else {
    type = lastStrengthDays > lastCardioDays ? "strength" : "cardio";
    reasons.push(type === "strength"
      ? "L’alternance récente favorise aujourd’hui une séance de musculation."
      : "L’alternance récente favorise aujourd’hui une séance cardio.");
  }

  if (recentLegs && type === "cardio") reasons.push("Une séance jambes récente incite à éviter une course très intense aujourd’hui.");
  if (lastAnyHours < 16) reasons.push("Ta dernière activité est très récente : garde une marge et réduis l’intensité si la récupération n’est pas bonne.");

  const confidenceBase = Math.abs(cardioNeed - strengthNeed);
  const confidence = Math.round(Math.max(58, Math.min(92, 64 + confidenceBase * 100 + (type === "strength" ? Math.min(lastStrengthDays, 4) : Math.min(lastCardioDays, 4)) * 3)));

  return {
    type,
    label: type === "strength" ? "Musculation" : "Cardio / course",
    headline: type === "strength" ? "Aujourd’hui, je privilégierais la musculation" : "Aujourd’hui, je privilégierais le cardio",
    reasons: reasons.slice(0, 3),
    confidence,
    loadFocus: load.priority,
    loadSummary: load,
    lastStrengthDays: finiteAge(lastStrengthDays),
    lastCardioDays: finiteAge(lastCardioDays),
    recentLegs,
    dataQuality: {
      sessions: recent.length,
      cardioSessions: cardio.length,
      strengthSessions: strength.length,
      limitedCardioHistory: cardio.length <= 2
    }
  };
}

function buildCardioPlan(sessions, durationMinutes, goal, customFocus) {
  const now = Date.now();
  const recent = [...sessions].filter(s => s?.startedAt).sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt));
  const runs = recent.filter(s => isRun(s) && Number(s.paceMinKm) > 0);
  const paceValues = runs.slice(0, 10).map(s => Number(s.paceMinKm)).filter(Number.isFinite).sort((a,b) => a-b);
  const medianPace = paceValues.length ? paceValues[Math.floor(paceValues.length / 2)] : 6;
  const load = loadBalance(recent, goal);
  const text = normalize(customFocus);
  const recentLegs = recent.some(s => isStrength(s) && ageDays(s.startedAt, now) <= 2 && looksLikeLegStrength(s));
  const hardRecently = recent.some(s => ageDays(s.startedAt, now) <= 1.5 && isHard(s));

  let focus = load.priority;
  if (/facile|easy|recup|récup|endurance fondamentale|zone 2/.test(text)) focus = "lowAerobic";
  else if (/tempo|seuil|threshold|vo2|soutenu/.test(text)) focus = "highAerobic";
  else if (/sprint|fractionne court|fractionné court|anaerob|vitesse/.test(text)) focus = "anaerobic";
  if ((recentLegs || hardRecently) && focus === "anaerobic") focus = "lowAerobic";

  const plan = focus === "anaerobic"
    ? anaerobicRun(durationMinutes, medianPace)
    : focus === "highAerobic"
      ? thresholdRun(durationMinutes, medianPace)
      : easyRun(durationMinutes, medianPace);

  const limited = runs.length <= 2;
  const rationaleBits = [];
  if (focus === "lowAerobic") rationaleBits.push("Le besoin prioritaire est la base aérobie ou la récupération entre deux stimuli plus exigeants.");
  if (focus === "highAerobic") rationaleBits.push("Le profil actuel justifie un travail soutenu mais contrôlé, sans enchaîner deux séances très dures.");
  if (focus === "anaerobic") rationaleBits.push("Le déficit principal est anaérobie : la séance utilise des répétitions courtes avec beaucoup de récupération.");
  if (recentLegs) rationaleBits.push("Une séance jambes récente a été détectée : l’intensité de course a été plafonnée.");
  if (limited) rationaleBits.push("L’historique course disponible est encore limité ; les allures proposées restent volontairement prudentes.");

  return {
    id: `cardio-plan-${Date.now()}`,
    kind: "Cardio",
    title: plan.title,
    durationMinutes,
    focus,
    focusLabel: focusLabel(focus),
    rationale: rationaleBits.join(" "),
    customFocus,
    dataQuality: { recentRunsWithPace: runs.length, limited },
    blocks: plan.blocks,
    estimatedDistanceKm: estimateDistance(plan.blocks, medianPace),
    intensity: plan.intensity,
    publish: {
      garminWorkout: {
        type: "Run",
        name: plan.title,
        description: plan.description
      }
    }
  };
}

function easyRun(duration, pace) {
  const warm = Math.min(10, Math.max(5, Math.round(duration * 0.18)));
  const cool = Math.min(8, Math.max(4, Math.round(duration * 0.12)));
  const main = Math.max(10, duration - warm - cool);
  const easyMin = pace * 1.05;
  const easyMax = pace * 1.16;
  const blocks = [
    block("Échauffement", warm, pace * 1.12, pace * 1.24, "Très facile, relâché"),
    block("Endurance facile", main, easyMin, easyMax, "Régulier, respiration confortable"),
    block("Retour au calme", cool, pace * 1.14, pace * 1.28, "Très facile")
  ];
  return {
    title: `Endurance facile · ${duration} min`,
    intensity: "Faible à modérée",
    blocks,
    description: `${warm}m ${paceRange(pace * 1.12, pace * 1.24)} Pace\n${main}m ${paceRange(easyMin, easyMax)} Pace\n${cool}m ${paceRange(pace * 1.14, pace * 1.28)} Pace`
  };
}

function thresholdRun(duration, pace) {
  const warm = duration <= 35 ? 8 : 12;
  const cool = duration <= 35 ? 6 : 8;
  const remaining = Math.max(12, duration - warm - cool);
  const reps = duration < 45 ? 2 : duration < 70 ? 3 : 4;
  const recovery = 2;
  const work = Math.max(4, Math.floor((remaining - recovery * (reps - 1)) / reps));
  const fastMin = pace * 0.91;
  const fastMax = pace * 0.98;
  const easyMin = pace * 1.12;
  const easyMax = pace * 1.24;
  const blocks = [block("Échauffement", warm, pace * 1.10, pace * 1.22, "Progressif")];
  for (let i = 0; i < reps; i++) {
    blocks.push(block(`Tempo ${i + 1}/${reps}`, work, fastMin, fastMax, "Soutenu mais maîtrisé"));
    if (i < reps - 1) blocks.push(block("Récupération", recovery, easyMin, easyMax, "Trot facile"));
  }
  blocks.push(block("Retour au calme", cool, pace * 1.14, pace * 1.28, "Très facile"));
  return {
    title: `Tempo / seuil contrôlé · ${duration} min`,
    intensity: "Modérée à élevée",
    blocks,
    description: `${warm}m ${paceRange(pace * 1.10, pace * 1.22)} Pace\n${reps}x\n- ${work}m ${paceRange(fastMin, fastMax)} Pace\n- ${recovery}m ${paceRange(easyMin, easyMax)} Pace\n${cool}m ${paceRange(pace * 1.14, pace * 1.28)} Pace`
  };
}

function anaerobicRun(duration, pace) {
  const warm = duration <= 35 ? 10 : 12;
  const cool = duration <= 35 ? 6 : 8;
  const reps = duration < 40 ? 5 : duration < 60 ? 6 : 8;
  const fastSeconds = duration < 45 ? 45 : 60;
  const recoverSeconds = fastSeconds === 45 ? 75 : 90;
  const fastMin = pace * 0.76;
  const fastMax = pace * 0.86;
  const easyMin = pace * 1.14;
  const easyMax = pace * 1.28;
  const blocks = [block("Échauffement", warm, pace * 1.10, pace * 1.22, "Progressif + quelques accélérations souples")];
  for (let i = 0; i < reps; i++) {
    blocks.push({ name: `Rapide ${i + 1}/${reps}`, durationSeconds: fastSeconds, target: paceRange(fastMin, fastMax), note: "Rapide, propre, sans sprint maximal" });
    blocks.push({ name: "Récupération", durationSeconds: recoverSeconds, target: paceRange(easyMin, easyMax), note: "Trot très facile" });
  }
  blocks.push(block("Retour au calme", cool, pace * 1.15, pace * 1.30, "Très facile"));
  return {
    title: `Intervalles courts · ${duration} min`,
    intensity: "Élevée par fractions",
    blocks,
    description: `${warm}m ${paceRange(pace * 1.10, pace * 1.22)} Pace\n${reps}x\n- ${fastSeconds}s ${paceRange(fastMin, fastMax)} Pace\n- ${recoverSeconds}s ${paceRange(easyMin, easyMax)} Pace\n${cool}m ${paceRange(pace * 1.15, pace * 1.30)} Pace`
  };
}

function block(name, minutes, minPace, maxPace, note) {
  return { name, durationMinutes: minutes, target: paceRange(minPace, maxPace), note };
}

function loadBalance(sessions, goal) {
  const totals = { lowAerobic: 0, highAerobic: 0, anaerobic: 0 };
  const now = Date.now();
  for (const s of sessions) {
    const age = ageDays(s.startedAt, now);
    if (age > 28) continue;
    const decay = Math.exp(-age / 24);
    const profile = s.loadProfile || inferredProfile(s);
    for (const key of Object.keys(totals)) totals[key] += Number(profile[key] || 0) * decay;
  }
  const sum = Object.values(totals).reduce((a,b) => a+b, 0) || 1;
  const shares = Object.fromEntries(Object.entries(totals).map(([k,v]) => [k, v / sum]));
  const targets = targetMix(goal);
  const deficits = Object.fromEntries(Object.keys(targets).map(k => [k, targets[k].min - shares[k]]));
  const priority = Object.keys(deficits).sort((a,b) => deficits[b] - deficits[a])[0];
  return { totals, shares, targets, deficits, priority };
}

function inferredProfile(session) {
  const load = Math.max(1, Number(session.trainingLoad || session.durationMinutes || 1));
  const out = { lowAerobic: 0, highAerobic: 0, anaerobic: 0 };
  const text = normalize(`${session.category || ""} ${session.activityType || ""} ${session.title || ""}`);
  let focus = "lowAerobic";
  if (isStrength(session) || /sprint|hiit|anaerob|padel|tennis|crossfit/.test(text)) focus = "anaerobic";
  else if (/tempo|threshold|seuil|vo2|race|competition|interval|fartlek/.test(text)) focus = "highAerobic";
  out[focus] = load;
  return out;
}

function targetMix(goal = "") {
  const g = normalize(goal);
  if (g.includes("force") || g.includes("muscle")) return { lowAerobic:{min:.25,max:.40}, highAerobic:{min:.20,max:.35}, anaerobic:{min:.30,max:.45} };
  if (g.includes("endurance")) return { lowAerobic:{min:.45,max:.60}, highAerobic:{min:.25,max:.40}, anaerobic:{min:.08,max:.20} };
  if (g.includes("recup") || g.includes("récup")) return { lowAerobic:{min:.55,max:.75}, highAerobic:{min:.15,max:.28}, anaerobic:{min:.05,max:.15} };
  return { lowAerobic:{min:.40,max:.55}, highAerobic:{min:.25,max:.40}, anaerobic:{min:.12,max:.25} };
}

function isStrength(s) {
  const text = normalize(`${s?.category || ""} ${s?.activityType || ""} ${s?.title || ""}`);
  return s?.source === "Hevy" || /musculation|strength|weight|gym|bodybuilding/.test(text);
}
function isRun(s) {
  const text = normalize(`${s?.category || ""} ${s?.activityType || ""} ${s?.title || ""}`);
  return /course|run|running|trail/.test(text);
}
function isCardio(s) { return !isStrength(s); }
function isHard(s) {
  const rpe = Number(s?.rpe);
  const aerobic = Number(s?.aerobicEffect);
  const anaerobic = Number(s?.anaerobicEffect);
  const intensity = Number(s?.intensity);
  return (Number.isFinite(rpe) && rpe >= 8.5) || (Number.isFinite(aerobic) && aerobic >= 4) || (Number.isFinite(anaerobic) && anaerobic >= 3) || (Number.isFinite(intensity) && intensity >= 90);
}
function looksLikeLegStrength(s) {
  const ex = Array.isArray(s?.exercises) ? s.exercises.map(x => x.title || "").join(" ") : "";
  return /squat|leg|jambe|quad|ischio|hamstring|fessier|glute|mollet|calf|hip thrust|deadlift|souleve/.test(normalize(`${s?.title || ""} ${ex}`));
}
function ageDays(value, now = Date.now()) {
  if (!value) return 999;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? Math.max(0, (now - t) / 86400000) : 999;
}
function finiteAge(value) { return Number.isFinite(value) && value < 900 ? Math.round(value * 10) / 10 : null; }
function focusLabel(value) { return value === "anaerobic" ? "Anaérobie" : value === "highAerobic" ? "Forte aérobie" : "Faible aérobie"; }
function paceRange(a, b) {
  const slow = Math.max(a, b);
  const fast = Math.min(a, b);
  return `${paceClock(fast)}-${paceClock(slow)}/km`;
}
function paceClock(value) {
  const v = Math.max(3, Math.min(12, Number(value) || 6));
  let m = Math.floor(v), s = Math.round((v - m) * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, "0")}`;
}
function estimateDistance(blocks, fallbackPace) {
  let minutes = 0;
  for (const b of blocks) minutes += Number(b.durationMinutes || 0) + Number(b.durationSeconds || 0) / 60;
  return Math.round((minutes / Math.max(4, Number(fallbackPace) || 6)) * 10) / 10;
}
function clampInt(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback; }
function normalize(value = "") { return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function config(env) { return { auth: !!env.APP_TOKEN, hevy: !!env.HEVY_API_KEY, garmin: !!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID), coach: !!env.OPENAI_API_KEY, hevyWrite: !!env.HEVY_API_KEY, garminWrite: !!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID) }; }
function auth(request, env) { if (!env.APP_TOKEN) return json({ error: "APP_TOKEN is not configured" }, 503); return request.headers.get("Authorization") === `Bearer ${env.APP_TOKEN}` ? null : json({ error: "Unauthorized" }, 401); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }); }
