const APP_VERSION = "1.2.0";
const API_BASE = "https://hevy-garmin-coach.planetpizza.workers.dev";
const STORAGE_KEY = "trainsync-state-v1";
const SETTINGS_KEY = "trainsync-settings-v2";
const LEGACY_SETTINGS_KEY = "trainsync-settings-v1";

const categories = {
  "Musculation": "◆",
  "Course": "↗",
  "Vélo": "◉",
  "Marche": "→",
  "Cardio": "♥",
  "Autre": "●"
};

const demoSessions = [
  { id: "demo-1", source: "Hevy", category: "Musculation", title: "Exemple — séance musculation", startedAt: daysAgo(1), durationMinutes: 55, volumeKg: 7200 },
  { id: "demo-2", source: "Garmin", category: "Course", title: "Exemple — footing facile", startedAt: daysAgo(3), durationMinutes: 40, distanceKm: 7.0, averageHeartRate: 145 }
];

const demoSuggestions = [
  { id: "demo-s1", kind: "Musculation", title: "Connecte TrainSync pour personnaliser", rationale: "Une fois Hevy et Garmin synchronisés, le coach utilisera tes vraies performances.", durationMinutes: 50, intensity: "À personnaliser", steps: ["Connecte le Worker dans Réglages", "Synchronise tes séances", "Reviens ici pour générer ton programme"] }
];

let state = loadJson(STORAGE_KEY, { sessions: demoSessions, suggestions: demoSuggestions, demo: true });
let settings = loadSettings();
let currentFilter = "all";
let deferredInstallPrompt;
let connection = { status: settings.relayToken ? "unknown" : "disconnected", configured: null, sources: null };

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function daysAgo(value) {
  const date = new Date();
  date.setDate(date.getDate() - value);
  date.setHours(18, 0, 0, 0);
  return date.toISOString();
}

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}

function loadSettings() {
  const current = loadJson(SETTINGS_KEY, null);
  if (current) return { relayToken: String(current.relayToken || "") };
  const legacy = loadJson(LEGACY_SETTINGS_KEY, {});
  return { relayToken: String(legacy.relayToken || "") };
}

function persistState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function persistSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ relayToken: settings.relayToken || "" })); }

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function formatCompact(value) {
  if (!Number.isFinite(value)) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.round(value).toString();
}

function sourceClass(source) { return source === "Garmin" ? "garmin" : "hevy"; }

function renderAll() {
  state.sessions.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  renderSessions();
  renderAnalysis();
  renderSuggestions();
  renderConnection();
  const version = $("#versionLabel");
  if (version) version.textContent = `TrainSync ${APP_VERSION} · données conservées sur cet appareil`;
}

function renderSessions() {
  const sessions = state.sessions.filter(session => currentFilter === "all" || session.source === currentFilter);
  const container = $("#sessionsList");
  if (!container) return;
  if (!sessions.length) {
    container.innerHTML = '<div class="empty-state">Aucune séance dans ce filtre.</div>';
    return;
  }
  let previousDay = "";
  container.innerHTML = sessions.map(session => {
    const date = new Date(session.startedAt);
    const dayKey = date.toDateString();
    const dateLabel = dayKey !== previousDay
      ? `<p class="date-label">${escapeHtml(date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }))}</p>`
      : "";
    previousDay = dayKey;
    const detail = session.distanceKm
      ? `${Number(session.distanceKm).toFixed(1)} km`
      : session.volumeKg ? `${formatCompact(Number(session.volumeKg))} kg` : session.category;
    return `${dateLabel}<article class="session-card ${sourceClass(session.source)}">
      <div class="session-icon" aria-hidden="true">${categories[session.category] || "●"}</div>
      <div><p class="session-title">${escapeHtml(session.title)}</p><p class="session-meta">${Number(session.durationMinutes) || 0} min · ${escapeHtml(detail)}</p></div>
      <span class="source-badge">${escapeHtml(session.source)}</span>
    </article>`;
  }).join("");
}

function renderAnalysis() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 28);
  const recent = state.sessions.filter(session => !String(session.id).startsWith("demo-") && new Date(session.startedAt) >= cutoff);
  const totalMinutes = recent.reduce((sum, session) => sum + Number(session.durationMinutes || 0), 0);
  const totalVolume = recent.reduce((sum, session) => sum + Number(session.volumeKg || 0), 0);
  const totalDistance = recent.reduce((sum, session) => sum + Number(session.distanceKm || 0), 0);
  const metricGrid = $("#metricGrid");
  if (metricGrid) metricGrid.innerHTML = [
    ["⌁", recent.length, "Séances"],
    ["◷", `${Math.floor(totalMinutes / 60)}h${String(totalMinutes % 60).padStart(2, "0")}`, "Temps total"],
    ["◆", formatCompact(totalVolume), "kg soulevés"],
    ["↗", totalDistance.toFixed(1), "km parcourus"]
  ].map(metric => `<article class="metric"><div class="metric-icon">${metric[0]}</div><strong class="metric-value">${metric[1]}</strong><span class="metric-name">${metric[2]}</span></article>`).join("");

  const weeks = weeklyBuckets(recent);
  const maximum = Math.max(...weeks.map(week => week.minutes), 1);
  const chart = $("#weeklyChart");
  if (chart) chart.innerHTML = weeks.map(week => `<div class="bar-wrap"><span class="bar-value">${week.minutes}</span><div class="bar" style="height:${Math.max(3, week.minutes / maximum * 82)}%"></div><span class="bar-label">${week.label}</span></div>`).join("");

  const counts = recent.reduce((result, session) => {
    result[session.category] = (result[session.category] || 0) + 1;
    return result;
  }, {});
  const maxCount = Math.max(...Object.values(counts), 1);
  const breakdown = $("#categoryBreakdown");
  if (breakdown) breakdown.innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `<div class="breakdown-row"><p>${categories[name] || "●"} ${escapeHtml(name)}</p><span>${count} séance${count > 1 ? "s" : ""}</span><div class="progress"><span style="width:${count / maxCount * 100}%"></span></div></div>`).join("") || '<div class="empty-state">Synchronise tes séances pour commencer l’analyse.</div>';
}

function weeklyBuckets(sessions) {
  const result = [];
  for (let index = 3; index >= 0; index--) {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() - index * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    result.push({
      label: index === 0 ? "Cette sem." : `S-${index}`,
      minutes: Math.round(sessions.filter(item => new Date(item.startedAt) >= start && new Date(item.startedAt) <= end).reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0))
    });
  }
  return result;
}

function renderSuggestions() {
  const container = $("#suggestionsList");
  if (!container) return;
  const suggestions = Array.isArray(state.suggestions) ? state.suggestions : [];
  container.innerHTML = suggestions.map(suggestion => {
    const className = suggestion.kind === "Cardio" ? "cardio" : suggestion.kind === "Récupération" ? "recovery" : "strength";
    const symbol = className === "cardio" ? "↗" : className === "recovery" ? "○" : "◆";
    return `<article class="suggestion-card ${className}">
      <div class="suggestion-head"><div class="suggestion-symbol">${symbol}</div><div><p class="kind">${escapeHtml(suggestion.kind).toUpperCase()}</p><h3>${escapeHtml(suggestion.title)}</h3></div></div>
      <p>${escapeHtml(suggestion.rationale)}</p>
      <div class="suggestion-stats"><span>◷ ${Number(suggestion.durationMinutes) || 0} min</span><span>⌁ ${escapeHtml(suggestion.intensity || "")}</span></div>
      <details><summary>Voir la séance</summary><ol class="steps">${(suggestion.steps || []).map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol></details>
    </article>`;
  }).join("");
}

function renderConnection() {
  const badge = $("#connectionState");
  const details = $("#connectionDetails");
  if (!badge || !details) return;
  const states = {
    connected: ["Connecté", "ok"], error: ["Erreur", "error"], checking: ["Vérification…", "checking"],
    unknown: ["À vérifier", "checking"], disconnected: ["Non connecté", "off"]
  };
  const [label, className] = states[connection.status] || states.disconnected;
  badge.textContent = label;
  badge.className = `connection-badge ${className}`;

  const source = (name, title) => {
    const status = connection.sources?.[name];
    if (!settings.relayToken) return statusRow(title, "En attente", "off");
    if (!connection.configured) return statusRow(title, "À vérifier", "checking");
    if (!connection.configured[name]) return statusRow(title, "Non configuré", "error");
    if (!status) return statusRow(title, "Configuré", "checking");
    if (status.ok) return statusRow(title, `${status.count ?? 0} séance(s)`, "ok");
    return statusRow(title, status.error || "Erreur", "error");
  };

  const coachConfigured = connection.configured?.coach;
  details.innerHTML = [
    source("hevy", "Hevy"),
    source("garmin", "Garmin / Intervals.icu"),
    statusRow("Coach OpenAI", coachConfigured ? "Configuré" : (settings.relayToken ? "À vérifier" : "En attente"), coachConfigured ? "ok" : "off")
  ].join("");
}

function statusRow(title, text, kind) {
  return `<div class="connection-row"><span class="status-dot ${kind}"></span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(text)}</small></div></div>`;
}

async function apiRequest(path, options = {}, timeoutMs = 20000) {
  if (!settings.relayToken) throw new Error("Ajoute ton APP_TOKEN dans Réglages pour connecter TrainSync.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
        Authorization: `Bearer ${settings.relayToken}`
      }
    });
    let data = null;
    try { data = await response.json(); } catch { }
    if (!response.ok) {
      if (response.status === 401) throw new Error("APP_TOKEN incorrect. Recopie le jeton actuel depuis Cloudflare.");
      if (response.status === 403) throw new Error("Accès refusé par Cloudflare.");
      if (response.status === 429) throw new Error("Limite de requêtes atteinte. Réessaie dans quelques minutes.");
      throw new Error(data?.error || `Erreur du backend (HTTP ${response.status}).`);
    }
    return data || {};
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Le backend met trop de temps à répondre. Réessaie.");
    if (error?.message === "Failed to fetch") throw new Error("Impossible de joindre le Worker Cloudflare. Vérifie ta connexion Internet.");
    throw error;
  } finally { clearTimeout(timer); }
}

async function connectBackend() {
  const input = $("#relayToken");
  const button = $("#connectButton");
  const token = input?.value.trim() || "";
  if (!token) return showStatus("Entre le APP_TOKEN de ton Worker Cloudflare.", true);

  const previousToken = settings.relayToken;
  settings.relayToken = token;
  connection.status = "checking";
  renderConnection();
  if (button) { button.disabled = true; button.textContent = "Connexion…"; }

  try {
    const status = await apiRequest("/status");
    settings.relayToken = token;
    persistSettings();
    connection.status = "connected";
    connection.configured = status.configured || null;
    connection.sources = null;
    renderConnection();
    showStatus("Worker connecté. Synchronisation en cours…");
    await synchronize({ quietStart: true });
  } catch (error) {
    settings.relayToken = previousToken;
    connection.status = "error";
    renderConnection();
    showStatus(error.message, true);
  } finally {
    if (button) { button.disabled = false; button.textContent = "Connecter et synchroniser"; }
  }
}

async function synchronize({ quietStart = false } = {}) {
  const button = $("#syncButton");
  const secondary = $("#syncNowButton");
  if (!settings.relayToken) {
    connection.status = "disconnected";
    renderConnection();
    showStatus("Va dans Réglages et connecte ton Worker avec APP_TOKEN.", true);
    return;
  }
  if (!quietStart) showStatus("Synchronisation Hevy + Garmin…");
  button?.classList.add("is-spinning");
  if (secondary) secondary.disabled = true;

  try {
    const data = await apiRequest("/sync?days=120", {}, 30000);
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    mergeSessions(sessions);
    connection.status = "connected";
    connection.sources = data.sources || null;
    connection.configured = {
      ...(connection.configured || {}),
      hevy: data.sources?.hevy?.configured ?? connection.configured?.hevy,
      garmin: data.sources?.garmin?.configured ?? connection.configured?.garmin
    };
    renderConnection();
    const warnings = Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [];
    if (warnings.length) showStatus(`${sessions.length} séance(s) synchronisée(s). ${warnings.join(" · ")}`, sessions.length === 0);
    else showStatus(`${sessions.length} séance(s) synchronisée(s) depuis Hevy et Garmin.`);
  } catch (error) {
    connection.status = "error";
    renderConnection();
    showStatus(error.message, true);
  } finally {
    button?.classList.remove("is-spinning");
    if (secondary) secondary.disabled = false;
  }
}

async function generateSuggestions() {
  const button = $("#generateButton");
  button.disabled = true;
  button.textContent = "Analyse en cours…";
  try {
    if (!settings.relayToken) throw new Error("Connecte TrainSync au Worker dans Réglages avant d’utiliser le coach.");
    const data = await apiRequest("/recommend", {
      method: "POST",
      body: JSON.stringify({
        goal: $("#goalSelect").selectedOptions[0].textContent,
        sessions: state.sessions.filter(x => !String(x.id).startsWith("demo-")).slice(0, 40)
      })
    }, 50000);
    if (!Array.isArray(data.suggestions) || !data.suggestions.length) throw new Error("Le coach a répondu sans séance exploitable.");
    state.suggestions = data.suggestions;
    persistState();
    renderSuggestions();
    showStatus("Programme mis à jour à partir de tes dernières performances.");
  } catch (error) { showStatus(error.message, true); }
  finally { button.disabled = false; button.textContent = "✦ Générer mes séances"; }
}

function mergeSessions(incoming) {
  const existing = state.demo ? [] : state.sessions.filter(item => !String(item.id || "").startsWith("demo-"));
  const map = new Map(existing.map(item => [item.id, item]));
  incoming.map(normalizeSession).forEach(item => map.set(item.id, item));
  state.sessions = [...map.values()].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  state.demo = false;
  persistState();
  renderAll();
}

function normalizeSession(item, defaultSource = "Hevy") {
  const source = String(item.source || defaultSource).toLowerCase().includes("garmin") ? "Garmin" : "Hevy";
  const rawCategory = item.category || item.type || item.activityType || item.activity_type || (source === "Hevy" ? "Musculation" : "Cardio");
  const categoryName = Object.keys(categories).find(key => String(rawCategory).toLowerCase().includes(key.toLowerCase())) || mapActivityCategory(rawCategory);
  const startedAt = new Date(item.startedAt || item.start_time || item.startTime || item.date || Date.now()).toISOString();
  const durationMinutes = durationToMinutes(item.durationMinutes ?? item.duration_minutes ?? item.elapsed_time ?? item.duration ?? item.duration_seconds);
  return {
    ...item,
    id: String(item.id || `${source}-${startedAt}-${item.title || item.name || rawCategory}`),
    source, category: categoryName,
    title: String(item.title || item.name || item.activityName || item.activity_name || `${categoryName} ${source}`),
    startedAt, durationMinutes: Math.round(durationMinutes),
    distanceKm: optionalNumber(item.distanceKm ?? item.distance_km ?? item.distance),
    volumeKg: optionalNumber(item.volumeKg ?? item.volume_kg ?? item.volume),
    calories: optionalNumber(item.calories),
    averageHeartRate: optionalNumber(item.averageHeartRate ?? item.avg_hr ?? item.average_hr),
    maxHeartRate: optionalNumber(item.maxHeartRate ?? item.max_hr),
    paceMinKm: optionalNumber(item.paceMinKm), elevationGainM: optionalNumber(item.elevationGainM),
    trainingLoad: optionalNumber(item.trainingLoad), rpe: optionalNumber(item.rpe),
    exercises: Array.isArray(item.exercises) ? item.exercises : undefined
  };
}

function durationToMinutes(value) {
  if (!value) return 0;
  if (typeof value === "string" && value.includes(":")) {
    const parts = value.split(":").map(Number);
    if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
    if (parts.length === 2) return Math.round(parts[0] + parts[1] / 60);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return number > 300 ? Math.round(number / 60) : Math.round(number);
}

function optionalNumber(value) {
  if (value === "" || value == null) return undefined;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : undefined;
}

function mapActivityCategory(value = "") {
  const normalized = String(value).toLowerCase();
  if (normalized.includes("run") || normalized.includes("course")) return "Course";
  if (normalized.includes("cycl") || normalized.includes("vélo") || normalized.includes("bike") || normalized.includes("ride")) return "Vélo";
  if (normalized.includes("walk") || normalized.includes("marche") || normalized.includes("hike")) return "Marche";
  if (normalized.includes("strength") || normalized.includes("muscu") || normalized.includes("weight")) return "Musculation";
  return "Cardio";
}

async function importFile(file, source) {
  if (!file) return;
  try {
    const text = await file.text();
    let records;
    if (file.name.toLowerCase().endsWith(".json")) {
      const parsed = JSON.parse(text);
      records = parsed.sessions || parsed.workouts || parsed.activities || (Array.isArray(parsed) ? parsed : [parsed]);
    } else records = parseCsv(text);
    const sessions = aggregateImportedRecords(records, source);
    mergeSessions(sessions);
    showStatus(`${sessions.length} séance(s) importée(s) depuis ${source}.`);
  } catch { showStatus("Le fichier n’a pas pu être lu. Vérifie son format.", true); }
}

function aggregateImportedRecords(records, source) {
  if (source !== "Hevy") return records.map(item => normalizeSession(item, source));
  const grouped = new Map();
  for (const row of records) {
    const key = row.workout_id || row.id || `${row.start_time || row.date || "date"}-${row.title || row.workout_title || "séance"}`;
    if (!grouped.has(key)) grouped.set(key, { ...row, id: key, title: row.title || row.workout_title || "Séance Hevy", source: "Hevy", category: "Musculation", volumeKg: 0 });
    const session = grouped.get(key);
    const weight = optionalNumber(row.weight_kg || row.weight) || 0;
    const reps = optionalNumber(row.reps) || 0;
    session.volumeKg += weight * reps;
    if (!session.durationMinutes && row.end_time && row.start_time) session.durationMinutes = Math.round((new Date(row.end_time) - new Date(row.start_time)) / 60000);
  }
  return [...grouped.values()].map(item => normalizeSession(item, "Hevy"));
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const parseLine = line => {
    const cells = []; let current = ""; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) { cells.push(current.trim()); current = ""; }
      else current += char;
    }
    cells.push(current.trim()); return cells;
  };
  const headers = parseLine(lines[0]).map(header => header.trim().replace(/\s+/g, "_").toLowerCase());
  return lines.slice(1).map(line => { const cells = parseLine(line); return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])); });
}

function showStatus(message, isError = false) {
  const status = $("#statusBar");
  if (!status) return;
  status.textContent = message;
  status.style.background = isError ? "var(--red)" : "var(--accent)";
  status.style.color = isError ? "#fff" : "var(--accent-ink)";
  status.hidden = false;
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => { status.hidden = true; }, 6500);
}

function activateView(target) {
  $$(".bottom-nav button").forEach(item => {
    const active = item.dataset.target === target;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
  });
  $$(".view").forEach(view => view.classList.toggle("is-active", view.dataset.view === target));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setupEvents() {
  $$(".bottom-nav button").forEach(button => button.addEventListener("click", () => activateView(button.dataset.target)));
  $$(".segmented button").forEach(button => button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    $$(".segmented button").forEach(item => item.classList.toggle("is-selected", item === button));
    renderSessions();
  }));
  $("#openAddSession")?.addEventListener("click", () => {
    const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    $("#sessionDate").value = date.toISOString().slice(0, 16);
    $("#sessionDialog").showModal();
  });
  $("#sessionForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mergeSessions([normalizeSession({ id: crypto.randomUUID(), title: form.get("title"), source: form.get("source"), category: form.get("category"), startedAt: form.get("date"), durationMinutes: form.get("duration"), distanceKm: form.get("distance"), volumeKg: form.get("volume") })]);
    $("#sessionDialog").close();
    event.currentTarget.reset();
    showStatus("Séance ajoutée.");
  });
  $("#generateButton")?.addEventListener("click", generateSuggestions);
  $("#syncButton")?.addEventListener("click", () => synchronize());
  $("#syncNowButton")?.addEventListener("click", () => synchronize());
  $("#connectButton")?.addEventListener("click", connectBackend);
  $("#disconnectButton")?.addEventListener("click", () => {
    settings.relayToken = "";
    persistSettings();
    connection = { status: "disconnected", configured: null, sources: null };
    $("#relayToken").value = "";
    renderConnection();
    showStatus("Jeton supprimé de cet appareil.");
  });
  $("#hevyImport")?.addEventListener("change", event => importFile(event.target.files[0], "Hevy"));
  $("#garminImport")?.addEventListener("change", event => importFile(event.target.files[0], "Garmin"));
  $("#resetData")?.addEventListener("click", () => {
    if (!confirm("Supprimer toutes les séances enregistrées sur cet appareil ?")) return;
    state = { sessions: demoSessions, suggestions: demoSuggestions, demo: true };
    persistState(); renderAll(); showStatus("Données locales réinitialisées.");
  });
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); deferredInstallPrompt = event;
    if ($("#installButton")) $("#installButton").hidden = false;
  });
  $("#installButton")?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    await deferredInstallPrompt.prompt(); deferredInstallPrompt = null; $("#installButton").hidden = true;
  });
}

async function initialize() {
  if ($("#relayToken")) $("#relayToken").value = settings.relayToken || "";
  setupEvents(); renderAll();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").then(registration => registration.update()).catch(() => {});
  if (settings.relayToken) {
    connection.status = "checking"; renderConnection();
    try {
      const status = await apiRequest("/status");
      connection.status = "connected";
      connection.configured = status.configured || null;
      renderConnection();
      await synchronize({ quietStart: true });
    } catch (error) {
      connection.status = "error"; renderConnection(); showStatus(error.message, true);
    }
  }
}

document.addEventListener("DOMContentLoaded", initialize);
