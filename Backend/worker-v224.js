import base from "./worker-v223.js";
import v22 from "./worker-v22.js";

const VERSION = "2.2.4";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store"
};

const GROUPS = {
  chest: "Pectoraux",
  back: "Dos",
  shoulders: "Épaules",
  biceps: "Biceps",
  triceps: "Triceps",
  legs: "Jambes",
  glutes: "Fessiers"
};

const PAIRINGS = [
  { id:"chest_triceps", label:"Pectoraux + triceps", groups:["chest","triceps"], min:35, max:75, synergy:12, focusId:"push", reason:"Association de poussée efficace : les triceps complètent naturellement le travail des pectoraux." },
  { id:"back_biceps", label:"Dos + biceps", groups:["back","biceps"], min:35, max:75, synergy:12, focusId:"pull", reason:"Association de tirage très cohérente : le dos fournit le travail principal et les biceps le complètent." },
  { id:"chest_back", label:"Pectoraux + dos", groups:["chest","back"], min:55, max:100, synergy:11, focusId:"upper", reason:"Association antagoniste poussée/tirage : gros travail du haut du corps avec un bon équilibre postural." },
  { id:"shoulders_arms", label:"Épaules + bras", groups:["shoulders","biceps","triceps"], min:45, max:80, synergy:9, focusId:"arms", reason:"Très bonne séance de finition du haut du corps, avec moins de fatigue systémique qu’un gros push/pull." },
  { id:"push_complete", label:"Pectoraux + épaules + triceps", groups:["chest","shoulders","triceps"], min:55, max:100, synergy:10, focusId:"push", reason:"Push complet : permet de développer toute la chaîne de poussée avec une progression structurée." },
  { id:"pull_complete", label:"Dos + biceps + épaules", groups:["back","biceps","shoulders"], min:55, max:100, synergy:10, focusId:"pull", reason:"Pull complet : dorsaux, haut du dos, biceps et deltoïdes postérieurs sont travaillés de façon complémentaire." },
  { id:"legs_glutes", label:"Jambes + fessiers", groups:["legs","glutes"], min:45, max:100, synergy:11, focusId:"legs", reason:"Bas du corps complet : dominante genou et dominante hanche sont réparties pour garder un développement équilibré." },
  { id:"upper_antagonist", label:"Pectoraux + dos + épaules", groups:["chest","back","shoulders"], min:70, max:120, synergy:8, focusId:"upper", reason:"Haut du corps complet, particulièrement adapté aux séances longues quand on veut regrouper plusieurs priorités." },
  { id:"arms", label:"Biceps + triceps", groups:["biceps","triceps"], min:30, max:65, synergy:7, focusId:"arms", reason:"Association antagoniste compacte, idéale quand le temps est limité ou pour renforcer les bras sans surcharge générale." }
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status:204, headers:CORS });

    if ((url.pathname === "/health" || url.pathname === "/status") && request.method === "GET") {
      const response = await base.fetch(request, env, ctx);
      if (!response.ok) return response;
      const data = await response.json().catch(() => ({}));
      return json({
        ...data,
        version: VERSION,
        muscleChoice: true,
        muscleCombinations: true,
        musclePairingSuggestions: true,
        maxMuscleGroupsPerSession: 3
      }, response.status);
    }

    if (url.pathname === "/coach/muscle-pairings" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      const body = await request.json().catch(() => ({}));
      const durationMinutes = clampInt(body.durationMinutes, 60, 30, 120);
      const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, 420) : [];
      const readiness = body.readiness && typeof body.readiness === "object" ? body.readiness : {};
      const clubSchedule = body.clubSchedule && typeof body.clubSchedule === "object" ? body.clubSchedule : { sessions:[] };
      const profile = body.profile && typeof body.profile === "object" ? body.profile : {};
      const exposure = muscleExposure(sessions);
      const clubProtected = hasHardClubNearby(clubSchedule);
      const suggestions = rankPairings({ durationMinutes, readiness, exposure, clubProtected, profile }).slice(0, 4);
      return json({
        ok:true,
        version:VERSION,
        durationMinutes,
        suggestions,
        exposure,
        clubProtected,
        maxSelection:3
      });
    }

    if (url.pathname === "/coach/strength-plan-v2" && request.method === "POST") {
      const body = await request.clone().json().catch(() => ({}));
      const selection = normalizeSelection(body.muscleSelection);
      if (!selection.length || body.forceMuscleCombination !== true) {
        return withVersion(await base.fetch(request, env, ctx));
      }

      const pairing = PAIRINGS.find(x => x.id === String(body.musclePairingId || "")) || pairingForSelection(selection);
      const title = selection.map(id => GROUPS[id]).filter(Boolean).join(" + ");
      const focusId = pairing?.focusId || focusForSelection(selection);
      const distribution = selection.length === 1
        ? "Le groupe choisi est la priorité nette de la séance."
        : selection.length === 2
          ? "Répartis le volume de travail de façon équilibrée entre les deux groupes, avec les mouvements polyarticulaires en premier."
          : "Répartis le volume sur les trois groupes sans diluer la qualité : groupe principal légèrement prioritaire, puis deux groupes complémentaires.";
      const directive = [
        `Choix musculaire explicite de l’athlète aujourd’hui : ${title}.`,
        `Travaille réellement tous les groupes sélectionnés dans cette même séance; n’en remplace aucun par une autre zone.`,
        distribution,
        pairing?.reason || "Organise les exercices pour limiter les redondances et préserver une progression mesurable.",
        "Les groupes non sélectionnés ne doivent apparaître qu’en assistance biomécanique nécessaire, sans volume d’isolation supplémentaire."
      ].join(" ");

      const payload = {
        ...body,
        focusId,
        focusTitle:title,
        customFocus:[directive, body.customFocus].filter(Boolean).join(" · ").slice(0, 1100),
        forceMuscleChoice:false
      };
      const response = await call(v22, request, env, ctx, "/coach/strength-plan-v2", payload);
      if (!response.ok) return response;
      const data = await response.json().catch(() => ({}));
      if (data?.plan) {
        data.plan.userMuscleCombination = {
          groups: selection,
          labels: selection.map(x => GROUPS[x]),
          pairingId: pairing?.id || "custom",
          label: title,
          forced:true
        };
        data.plan.title = `${title} · ${Number(data.plan.durationMinutes || body.durationMinutes || 60)} min`;
        data.plan.rationale = `Association choisie : ${title}. ${String(data.plan.rationale || "")}`.trim();
        if (data.plan.publish?.hevyRoutine) {
          data.plan.publish.hevyRoutine.title = data.plan.title;
          data.plan.publish.hevyRoutine.notes = [
            `Association musculaire : ${title}.`,
            pairing?.reason || null,
            data.plan.publish.hevyRoutine.notes
          ].filter(Boolean).join("\n").slice(0, 900);
        }
      }
      data.version = VERSION;
      data.muscleCombinations = true;
      return json(data, response.status);
    }

    return withVersion(await base.fetch(request, env, ctx));
  }
};

function rankPairings({ durationMinutes, readiness, exposure, clubProtected, profile }) {
  const maxExposure = Math.max(1, ...Object.values(exposure).map(x => Number(x.weightedSets || 0)));
  const soreness = Number(readiness.soreness || 2);
  const energy = Number(readiness.energy || 3);
  const priorities = normalize(`${profile.priorityText || ""} ${profile.strengthGoal || ""}`);

  return PAIRINGS.map(pairing => {
    const groupStats = pairing.groups.map(g => exposure[g] || { weightedSets:0, daysSince:99 });
    const avgExposure = groupStats.reduce((a,b) => a + Number(b.weightedSets || 0), 0) / groupStats.length;
    const avgDays = groupStats.reduce((a,b) => a + Math.min(30, Number(b.daysSince ?? 30)), 0) / groupStats.length;
    let score = pairing.synergy * 2;
    score += Math.max(0, maxExposure - avgExposure) * 1.3;
    score += avgDays * 0.32;

    if (durationMinutes < pairing.min) score -= (pairing.min - durationMinutes) * 1.2;
    if (durationMinutes > pairing.max) score -= (durationMinutes - pairing.max) * 0.15;
    if (pairing.groups.length === 3 && durationMinutes < 55) score -= 18;
    if (pairing.id === "chest_back" && durationMinutes >= 60) score += 6;
    if (["chest_triceps","back_biceps"].includes(pairing.id) && durationMinutes <= 60) score += 5;
    if (energy <= 2 && pairing.groups.length === 3) score -= 8;
    if (soreness >= 4 && pairing.groups.some(g => ["legs","glutes"].includes(g))) score -= 20;
    if (clubProtected && pairing.groups.some(g => ["legs","glutes"].includes(g))) score -= 40;

    for (const g of pairing.groups) {
      const label = normalize(GROUPS[g]);
      if (label && priorities.includes(label)) score += 4;
    }

    const least = groupStats.map((s,i) => ({ group:pairing.groups[i], ...s })).sort((a,b) => Number(a.weightedSets||0)-Number(b.weightedSets||0))[0];
    const context = clubProtected && pairing.groups.some(g => ["legs","glutes"].includes(g))
      ? "Séance moins prioritaire aujourd’hui car une séance course club exigeante est proche."
      : Number(least?.daysSince || 0) >= 7
        ? `${GROUPS[least.group]} a été moins sollicité récemment : l’association remet du stimulus là où il manque.`
        : "Association compatible avec ta récupération récente et la durée choisie.";

    return {
      id:pairing.id,
      label:pairing.label,
      groups:pairing.groups,
      score:Math.round(score),
      reason:pairing.reason,
      context,
      recommendedDuration:`${pairing.min}–${pairing.max} min`
    };
  }).sort((a,b) => b.score-a.score);
}

function muscleExposure(sessions) {
  const now = Date.now();
  const out = Object.fromEntries(Object.keys(GROUPS).map(k => [k, { weightedSets:0, daysSince:99 }]));
  for (const session of sessions) {
    if (session?.source !== "Hevy" || !Array.isArray(session.exercises)) continue;
    const time = new Date(session.startedAt || 0).getTime();
    if (!Number.isFinite(time) || !time) continue;
    const days = Math.max(0, (now-time)/86400000);
    if (days > 42) continue;
    const decay = Math.exp(-days/24);
    for (const ex of session.exercises) {
      const group = classifyExercise(ex?.title || "");
      if (!group || !out[group]) continue;
      const sets = (Array.isArray(ex.sets) ? ex.sets : []).filter(s => s?.type !== "warmup").length || 1;
      out[group].weightedSets += sets * decay;
      out[group].daysSince = Math.min(out[group].daysSince, days);
    }
  }
  for (const value of Object.values(out)) {
    value.weightedSets = Math.round(value.weightedSets * 10) / 10;
    value.daysSince = value.daysSince >= 99 ? 99 : Math.round(value.daysSince * 10) / 10;
  }
  return out;
}

function classifyExercise(title) {
  const t = normalize(title);
  if (/curl|biceps/.test(t)) return "biceps";
  if (/triceps|pushdown|extension.*bras|skull|barre.*front/.test(t)) return "triceps";
  if (/lateral raise|elevation|shoulder|overhead press|developpe militaire|rear delt|oiseau|face pull/.test(t)) return "shoulders";
  if (/bench|developpe couche|developpe incline|chest press|pec deck|fly|ecarte|pompe|dips/.test(t)) return "chest";
  if (/row|tirage|pulldown|traction|pull up|chin up|lat |dorsal|rowing|shrug/.test(t)) return "back";
  if (/hip thrust|glute|fessier|rdl|romanian|souleve.*terre|deadlift|leg curl|ischio/.test(t)) return "glutes";
  if (/squat|leg press|presse|hack|fente|lunge|split squat|leg extension|quadriceps|mollet|calf/.test(t)) return "legs";
  return null;
}

function hasHardClubNearby(clubSchedule) {
  const today = Date.now();
  return (Array.isArray(clubSchedule?.sessions) ? clubSchedule.sessions : []).some(s => {
    if (!s?.date) return false;
    const time = new Date(`${s.date}T12:00:00`).getTime();
    if (!Number.isFinite(time)) return false;
    const offset = Math.abs(time-today)/86400000;
    return offset <= 2.25 && ["hard","unknown"].includes(String(s.intensity || "unknown"));
  });
}

function pairingForSelection(selection) {
  const key = [...selection].sort().join("|");
  return PAIRINGS.find(p => [...p.groups].sort().join("|") === key) || null;
}
function focusForSelection(selection) {
  const set = new Set(selection);
  if ([...set].every(x => ["chest","shoulders","triceps"].includes(x))) return "push";
  if ([...set].every(x => ["back","biceps","shoulders"].includes(x))) return "pull";
  if ([...set].every(x => ["biceps","triceps","shoulders"].includes(x))) return "arms";
  if ([...set].every(x => ["legs","glutes"].includes(x))) return "legs";
  if ([...set].every(x => ["chest","back","shoulders","biceps","triceps"].includes(x))) return "upper";
  return "full";
}
function normalizeSelection(value) {
  const input = Array.isArray(value) ? value : [];
  return [...new Set(input.map(String).filter(x => GROUPS[x]))].slice(0,3);
}

async function call(worker, request, env, ctx, path, payload) {
  const url = new URL(request.url); url.pathname = path; url.search = "";
  return worker.fetch(new Request(url, { method:"POST", headers:request.headers, body:JSON.stringify(payload) }), env, ctx);
}
async function withVersion(response) {
  if (!(response.headers.get("Content-Type") || "").includes("application/json")) return response;
  try {
    const data = await response.json();
    if (data && typeof data === "object") data.version = VERSION;
    return json(data, response.status);
  } catch { return response; }
}
function auth(request, env) {
  if (!env.APP_TOKEN) return json({ error:"APP_TOKEN is not configured" }, 503);
  return request.headers.get("Authorization") === `Bearer ${env.APP_TOKEN}` ? null : json({ error:"Unauthorized" }, 401);
}
function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function clampInt(value, fallback, min, max) {
  const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}
function json(value, status=200) {
  return new Response(JSON.stringify(value), { status, headers:{ ...CORS, "Content-Type":"application/json; charset=utf-8" } });
}
