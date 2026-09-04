import baseWorker from "./worker.js";

const INTERVALS = "https://intervals.icu/api/v1";
const OPENAI = "https://api.openai.com/v1/responses";
const VERSION = "1.4.0";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Cache-Control": "no-store" };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, version: VERSION, configured: config(env) });
    if (url.pathname === "/status" && request.method === "GET") {
      const denied = auth(request, env); if (denied) return denied;
      return json({ ok: true, authenticated: true, version: VERSION, configured: { hevy: !!env.HEVY_API_KEY, garmin: !!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID), coach: !!env.OPENAI_API_KEY } });
    }
    if (url.pathname.startsWith("/activity/") && request.method === "GET") {
      const denied = auth(request, env); if (denied) return denied;
      if (!env.INTERVALS_API_KEY) return json({ error: "Intervals.icu is not configured" }, 503);
      try {
        const id = decodeURIComponent(url.pathname.slice(10)).replace(/^garmin-/, "");
        const headers = { Authorization: `Basic ${btoa(`API_KEY:${env.INTERVALS_API_KEY}`)}`, Accept: "application/json", "User-Agent": "TrainSync/1.4" };
        const [detail, map] = await Promise.all([
          fetchJson(`${INTERVALS}/activity/${encodeURIComponent(id)}?intervals=true`, headers, 25000),
          fetchJson(`${INTERVALS}/activity/${encodeURIComponent(id)}/map`, headers, 25000).catch(() => null)
        ]);
        return json({ ok: true, id: `garmin-${id}`, detail, map });
      } catch (e) { return json({ error: safe(e) }, 500); }
    }
    if (url.pathname === "/recommend" && request.method === "POST") {
      const denied = auth(request, env); if (denied) return denied;
      if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured" }, 503);
      const body = await request.json().catch(() => ({}));
      const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, 60).map(enrich) : [];
      try { return json(await coach(env, body.goal || "Équilibre", sessions)); }
      catch (e) { return json({ suggestions: fallback(body.goal || "Équilibre", sessions), degraded: true, warning: safe(e), generatedAt: new Date().toISOString() }); }
    }
    if (url.pathname === "/sync" && request.method === "GET") {
      const response = await baseWorker.fetch(request, env, ctx);
      if (!response.ok) return response;
      try { const data = await response.json(); if (Array.isArray(data.sessions)) data.sessions = data.sessions.map(enrich); return json({ ...data, version: VERSION }, response.status); }
      catch { return response; }
    }
    return baseWorker.fetch(request, env, ctx);
  }
};

function config(env) { return { auth: !!env.APP_TOKEN, hevy: !!env.HEVY_API_KEY, garmin: !!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID), coach: !!env.OPENAI_API_KEY }; }
function auth(request, env) { if (!env.APP_TOKEN) return json({ error: "APP_TOKEN is not configured" }, 503); return request.headers.get("Authorization") === `Bearer ${env.APP_TOKEN}` ? null : json({ error: "Unauthorized" }, 401); }
function enrich(s) {
  if (!s || typeof s !== "object") return s;
  const focus = s.loadFocus || focusOf(s);
  return { ...s, loadFocus: focus, loadFocusWeight: Number(s.loadFocusWeight || s.trainingLoad || s.durationMinutes || 1) };
}
function focusOf(s) {
  if (s.category === "Musculation") return "anaerobic";
  const t = `${s.activityType || ""} ${s.title || ""}`.toLowerCase();
  if (/sprint|anaerob|hiit|interval|padel|tennis|crossfit/.test(t)) return "anaerobic";
  if (/tempo|threshold|seuil|vo2|race|competition|fartlek/.test(t)) return "highAerobic";
  return "lowAerobic";
}

async function coach(env, goal, sessions) {
  const context = compactContext(sessions);
  const prompt = `Tu es le coach de TrainSync. Propose exactement 3 prochaines séances en français, directement exploitables et cohérentes entre elles. Utilise toutes les activités récentes et leur charge, pas seulement un sport. Tiens compte du manque éventuel de faible aérobie, forte aérobie ou anaérobie. Musculation: surcharge progressive prudente exercice par exercice à partir des charges, répétitions et RPE. Course/endurance: utilise distance, allure, FC, dénivelé et charge; évite les hausses brutales et deux séances difficiles consécutives. Si les données sont insuffisantes, reste conservateur. Pas de diagnostic médical.\nObjectif: ${goal}\nDonnées: ${JSON.stringify(context)}`;
  const r = await fetchTimed(OPENAI, { method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.OPENAI_MODEL || "gpt-5.6-luna", input: prompt, store: false, reasoning: { effort: env.OPENAI_REASONING || "low" }, text: { format: { type: "json_schema", name: "training_suggestions", strict: true, schema: SCHEMA } } }) }, 60000);
  const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error?.message || `OpenAI: HTTP ${r.status}`);
  const text = data.output_text || data.output?.flatMap(x => x.content || []).find(x => x.type === "output_text")?.text; if (!text) throw new Error("OpenAI returned no structured output");
  return { ...JSON.parse(text), degraded: false, generatedAt: new Date().toISOString() };
}
function compactContext(sessions) {
  const recent = [...sessions].sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt));
  const focus = { lowAerobic:0, highAerobic:0, anaerobic:0 };
  for (const s of recent.slice(0,40)) { const f=s.loadFocus||focusOf(s), w=Number(s.loadFocusWeight||s.trainingLoad||s.durationMinutes||1); if (focus[f]!=null) focus[f]+=w; }
  return {
    loadFocus28d: focus,
    recent: recent.slice(0,24).map(s=>({date:s.startedAt,title:s.title,type:s.activityType||s.category,duration:s.durationMinutes,distanceKm:s.distanceKm,pace:s.paceMinKm,hr:s.averageHeartRate,load:s.trainingLoad,rpe:s.rpe,focus:s.loadFocus,exercises:Array.isArray(s.exercises)?s.exercises.slice(0,12).map(e=>({title:e.title,sets:(e.sets||[]).slice(0,6)})):undefined}))
  };
}
function fallback(goal, sessions) {
  const c=compactContext(sessions), f=c.loadFocus28d, missing=Object.entries(f).sort((a,b)=>a[1]-b[1])[0]?.[0]||"lowAerobic";
  const cardio=missing==="anaerobic"?{id:"fallback-1",kind:"Cardio",title:"Rappel anaérobie contrôlé",rationale:"Le profil récent manque surtout de travail anaérobie.",durationMinutes:40,intensity:"RPE 8",steps:["12 min faciles","6 × 1 min soutenue / 2 min facile","8 min retour au calme"]}:missing==="highAerobic"?{id:"fallback-1",kind:"Cardio",title:"Tempo / seuil progressif",rationale:"Le profil récent manque surtout de travail aérobie soutenu.",durationMinutes:45,intensity:"Soutenue contrôlée",steps:["12 min faciles","3 × 7 min soutenues / 3 min faciles","6 min retour au calme"]}:{id:"fallback-1",kind:"Cardio",title:"Endurance fondamentale",rationale:"Le profil récent gagnerait à renforcer la base aérobie.",durationMinutes:40,intensity:"Facile",steps:["Aisance respiratoire","Allure régulière","5 min retour au calme"]};
  return [cardio,{id:"fallback-2",kind:"Musculation",title:/force/i.test(goal)?"Force — continuité":"Musculation — progression mesurée",rationale:"Conserver les mouvements récents permet une progression mesurable sans hausse brutale.",durationMinutes:55,intensity:"RPE 7–8",steps:["Reprendre 4–5 exercices récents","3 séries de travail par exercice","Garder 1–3 répétitions en réserve"]},{id:"fallback-3",kind:"Récupération",title:"Récupération active",rationale:"Une journée légère aide à absorber la charge globale.",durationMinutes:30,intensity:"Très facile",steps:["20–25 min faciles","Mobilité 5–10 min","Pas d'intensité"]}];
}

const SCHEMA={type:"object",additionalProperties:false,required:["suggestions"],properties:{suggestions:{type:"array",minItems:3,maxItems:3,items:{type:"object",additionalProperties:false,required:["id","kind","title","rationale","durationMinutes","intensity","steps"],properties:{id:{type:"string"},kind:{type:"string",enum:["Musculation","Cardio","Récupération"]},title:{type:"string"},rationale:{type:"string"},durationMinutes:{type:"integer"},intensity:{type:"string"},steps:{type:"array",items:{type:"string"}}}}}}};
async function fetchJson(url,headers,timeout){const r=await fetchTimed(url,{headers},timeout);if(!r.ok)throw new Error(`Intervals.icu: HTTP ${r.status}`);return r.json();}
async function fetchTimed(url,options={},timeout=20000){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);try{return await fetch(url,{...options,signal:c.signal});}catch(e){if(e?.name==="AbortError")throw new Error("Service distant: délai dépassé");throw e;}finally{clearTimeout(t);}}
function safe(e){return String(e?.message||e||"Erreur inconnue").replace(/Bearer\s+\S+/gi,"Bearer [redacted]").slice(0,300);}
function json(v,status=200){return new Response(JSON.stringify(v),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8"}});}
