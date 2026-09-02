// Cloudflare Worker /recommend — définir OPENAI_API_KEY et, facultativement, APP_TOKEN.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method !== "POST" || url.pathname !== "/recommend") {
      return json({ error: "Not found" }, 404);
    }
    if (env.APP_TOKEN && request.headers.get("Authorization") !== `Bearer ${env.APP_TOKEN}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await request.json();
    const prompt = `Tu es un coach sportif prudent. Analyse l'historique fourni et propose exactement 3 séances complémentaires en français. Objectif: ${body.goal}. Ne pose aucun diagnostic médical. Historique JSON: ${JSON.stringify(body.sessions)}`;
    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-5.6-luna",
        input: prompt,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "training_suggestions",
            strict: true,
            schema: {
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
                      title: { type: "string" },
                      rationale: { type: "string" },
                      durationMinutes: { type: "integer" },
                      intensity: { type: "string" },
                      steps: { type: "array", items: { type: "string" } }
                    }
                  }
                }
              }
            }
          }
        }
      })
    });

    const response = await openAIResponse.json();
    if (!openAIResponse.ok) return json({ error: response.error?.message || "OpenAI error" }, 502);
    const outputText = response.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text;
    if (!outputText) return json({ error: "Empty model response" }, 502);
    return new Response(outputText, { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
