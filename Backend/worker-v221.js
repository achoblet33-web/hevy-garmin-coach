import v22 from "./worker-v22.js";
import v21 from "./worker-v21.js";

const VERSION = "2.2.1";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store"
};

const MUSCLE_CHOICES = {
  chest: {
    focusId: "push",
    title: "Pectoraux",
    directive: "Priorité choisie par l’athlète aujourd’hui : pectoraux. Construis la séance autour des pectoraux, avec triceps/épaules seulement comme assistance utile."
  },
  back: {
    focusId: "pull",
    title: "Dos",
    directive: "Priorité choisie par l’athlète aujourd’hui : dos, dorsaux, haut du dos et trapèzes. Les biceps sont une assistance, pas la priorité principale."
  },
  shoulders: {
    focusId: "arms",
    title: "Épaules",
    directive: "Priorité choisie par l’athlète aujourd’hui : épaules et deltoïdes. Mets l’accent sur les deltoïdes avec un équilibre entre poussée et élévations, sans transformer la séance en séance pectoraux."
  },
  arms: {
    focusId: "arms",
    title: "Bras",
    directive: "Priorité choisie par l’athlète aujourd’hui : bras, biceps, triceps et avant-bras. Garde seulement les mouvements structurants nécessaires."
  },
  legs: {
    focusId: "legs",
    title: "Jambes · fessiers",
    directive: "Priorité choisie par l’athlète aujourd’hui : jambes, quadriceps, ischio-jambiers, fessiers et mollets. Répartis le travail entre dominante genou et charnière de hanche."
  },
  full: {
    focusId: "full",
    title: "Full body",
    directive: "Priorité choisie par l’athlète aujourd’hui : corps complet. Répartis les mouvements pour couvrir haut et bas du corps sans volume inutile."
  }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/health" && request.method === "GET") {
      const response = await v22.fetch(request, env, ctx);
      const data = await response.json().catch(() => ({}));
      return json({ ...data, version: VERSION, muscleChoice: true });
    }

    if (url.pathname === "/status" && request.method === "GET") {
      const response = await v22.fetch(request, env, ctx);
      if (!response.ok) return response;
      const data = await response.json().catch(() => ({}));
      return json({ ...data, version: VERSION, muscleChoice: true }, response.status);
    }

    if (url.pathname === "/coach/strength-plan-v2" && request.method === "POST") {
      const body = await request.clone().json().catch(() => ({}));
      const choice = MUSCLE_CHOICES[String(body.muscleChoice || "")];

      // No explicit choice: keep the full 2.2 club-aware recommendation path.
      if (!choice || body.forceMuscleChoice !== true) {
        return withVersion(await v22.fetch(request, env, ctx));
      }

      // Explicit athlete choice: respect the chosen muscle group. The v21
      // engine still adapts volume to readiness and the current 4-week block.
      const customFocus = [choice.directive, body.customFocus]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 900);
      const payload = {
        ...body,
        focusId: choice.focusId,
        focusTitle: choice.title,
        customFocus
      };
      const response = await call(v21, request, env, ctx, "/coach/strength-plan-v2", payload);
      if (!response.ok) return response;
      const data = await response.json().catch(() => ({}));
      if (data?.plan) {
        data.plan.userMuscleChoice = {
          id: String(body.muscleChoice),
          label: choice.title,
          forced: true
        };
        data.plan.title = `${choice.title} · ${Number(data.plan.durationMinutes || body.durationMinutes || 60)} min`;
        data.plan.rationale = `Priorité du jour choisie par toi : ${choice.title}. ${String(data.plan.rationale || "")}`.trim();
        if (data.plan.publish?.hevyRoutine) {
          data.plan.publish.hevyRoutine.title = data.plan.title;
          data.plan.publish.hevyRoutine.notes = `Priorité athlète : ${choice.title}. ${String(data.plan.publish.hevyRoutine.notes || "")}`.slice(0, 900);
        }
      }
      data.version = VERSION;
      return json(data, response.status);
    }

    return withVersion(await v22.fetch(request, env, ctx));
  }
};

async function call(worker, request, env, ctx, path, payload) {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = "";
  return worker.fetch(new Request(url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(payload)
  }), env, ctx);
}

async function withVersion(response) {
  if (!(response.headers.get("Content-Type") || "").includes("application/json")) return response;
  try {
    const data = await response.json();
    if (data && typeof data === "object") data.version = VERSION;
    return json(data, response.status);
  } catch {
    return response;
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" }
  });
}
