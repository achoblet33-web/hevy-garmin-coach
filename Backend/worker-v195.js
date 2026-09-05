import v19 from "./worker-v19.js";

const VERSION = "1.9.5";
const INTERVALS = "https://intervals.icu/api/v1";
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
      return json({ ok: true, version: VERSION, configured: config(env), historyCap: 5000, gpsFallback: true });
    }

    if (url.pathname === "/status" && request.method === "GET") {
      const denied = auth(request, env); if (denied) return denied;
      return json({ ok: true, authenticated: true, version: VERSION, configured: config(env), historyCap: 5000, gpsFallback: true });
    }

    if (url.pathname.startsWith("/activity/") && request.method === "GET") {
      const denied = auth(request, env); if (denied) return denied;
      if (!env.INTERVALS_API_KEY) return json({ error: "Intervals.icu is not configured" }, 503);

      try {
        const id = decodeURIComponent(url.pathname.slice(10)).replace(/^garmin-/, "");
        const headers = intervalsHeaders(env.INTERVALS_API_KEY);

        const [detail, rawMap, streamPayload] = await Promise.all([
          fetchJson(`${INTERVALS}/activity/${encodeURIComponent(id)}?intervals=true`, headers, 25000),
          fetchJson(`${INTERVALS}/activity/${encodeURIComponent(id)}/map`, headers, 25000).catch(() => null),
          fetchJson(`${INTERVALS}/activity/${encodeURIComponent(id)}/streams.json?types=latlng`, headers, 25000).catch(() => null)
        ]);

        const streamRoute = extractLatLngStream(streamPayload);
        const mapRoute = extractMapRoute(rawMap);
        const route = streamRoute.length > 1 ? streamRoute : mapRoute;

        return json({
          ok: true,
          version: VERSION,
          id: `garmin-${id}`,
          detail,
          map: route.length > 1 ? route : rawMap,
          gps: {
            available: route.length > 1,
            points: route.length,
            source: streamRoute.length > 1 ? "latlng-stream" : mapRoute.length > 1 ? "map" : "none"
          }
        });
      } catch (error) {
        return json({ error: safe(error) }, 500);
      }
    }

    const response = await v19.fetch(request, env, ctx);
    if (!response.ok) return response;

    // Keep the public API version coherent even for delegated JSON endpoints.
    const type = response.headers.get("Content-Type") || "";
    if (type.includes("application/json")) {
      try {
        const data = await response.json();
        if (data && typeof data === "object") data.version = VERSION;
        return json(data, response.status);
      } catch {
        return response;
      }
    }
    return response;
  }
};

function intervalsHeaders(apiKey) {
  return {
    Authorization: `Basic ${btoa(`API_KEY:${apiKey}`)}`,
    Accept: "application/json",
    "User-Agent": "TrainSync/1.9.5"
  };
}

function extractLatLngStream(payload) {
  const streams = Array.isArray(payload) ? payload : Array.isArray(payload?.streams) ? payload.streams : [];
  const stream = streams.find(item => String(item?.type || "").toLowerCase() === "latlng") || streams[0];
  if (!stream || !Array.isArray(stream.data) || !Array.isArray(stream.data2)) return [];

  const length = Math.min(stream.data.length, stream.data2.length);
  const route = [];
  for (let i = 0; i < length; i++) {
    const lat = Number(stream.data[i]);
    const lon = Number(stream.data2[i]);
    if (!validPoint(lat, lon)) continue;
    const previous = route.at(-1);
    if (previous && previous[0] === lat && previous[1] === lon) continue;
    route.push([lat, lon]);
  }
  return route;
}

function extractMapRoute(payload) {
  if (!payload) return [];

  const directStreams = extractLatLngStream(payload);
  if (directStreams.length > 1) return directStreams;

  if (Array.isArray(payload?.lat) && Array.isArray(payload?.lon)) {
    return zipCoordinates(payload.lat, payload.lon);
  }
  if (Array.isArray(payload?.latitude) && Array.isArray(payload?.longitude)) {
    return zipCoordinates(payload.latitude, payload.longitude);
  }
  if (Array.isArray(payload?.latitudes) && Array.isArray(payload?.longitudes)) {
    return zipCoordinates(payload.latitudes, payload.longitudes);
  }
  if (payload?.latlng && typeof payload.latlng === "object") {
    const nested = extractLatLngStream([payload.latlng]);
    if (nested.length > 1) return nested;
  }

  const geo = payload.type === "Feature" ? payload.geometry : payload;
  if (geo?.type === "LineString" && Array.isArray(geo.coordinates)) {
    return geo.coordinates.map(value => point(value, true)).filter(Boolean);
  }
  if (geo?.type === "MultiLineString" && Array.isArray(geo.coordinates)) {
    return geo.coordinates.flat().map(value => point(value, true)).filter(Boolean);
  }

  const candidates = Array.isArray(payload)
    ? [payload]
    : [payload.points, payload.latlngs, payload.latLngs, payload.coordinates, payload.route, payload.data, payload.map, payload.path, payload.positions];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || !candidate.length) continue;
    const route = candidate.flat(3).map(value => point(value, false)).filter(Boolean);
    if (route.length > 1) return route;
  }
  return [];
}

function zipCoordinates(lats, lons) {
  const route = [];
  const length = Math.min(lats.length, lons.length);
  for (let i = 0; i < length; i++) {
    const lat = Number(lats[i]);
    const lon = Number(lons[i]);
    if (validPoint(lat, lon)) route.push([lat, lon]);
  }
  return route;
}

function point(value, geoJson) {
  if (Array.isArray(value) && value.length >= 2) {
    const a = Number(value[0]);
    const b = Number(value[1]);
    if (geoJson && validPoint(b, a)) return [b, a];
    if (validPoint(a, b)) return [a, b];
    if (validPoint(b, a)) return [b, a];
  }
  if (value && typeof value === "object") {
    const lat = Number(value.lat ?? value.latitude ?? value.y);
    const lon = Number(value.lng ?? value.lon ?? value.long ?? value.longitude ?? value.x);
    if (validPoint(lat, lon)) return [lat, lon];
  }
  return null;
}

function validPoint(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
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

async function fetchJson(url, headers, timeout = 20000) {
  const response = await fetchTimed(url, { headers }, timeout);
  if (!response.ok) throw new Error(`Intervals.icu: HTTP ${response.status}`);
  return response.json();
}

async function fetchTimed(url, options = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Service distant: délai dépassé");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function safe(error) {
  return String(error?.message || error || "Erreur inconnue")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 300);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" }
  });
}
