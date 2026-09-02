const APP_VERSION = "1.0.0";
const STORAGE_KEY = "trainsync-state-v1";
const SETTINGS_KEY = "trainsync-settings-v1";

const categories = {
  "Musculation": "◆",
  "Course": "↗",
  "Vélo": "◉",
  "Marche": "→",
  "Cardio": "♥",
  "Autre": "●"
};

const demoSessions = [
  { id: "demo-1", source: "Hevy", category: "Musculation", title: "Push — Pectoraux & épaules", startedAt: daysAgo(1), durationMinutes: 58, volumeKg: 7840, calories: 430 },
  { id: "demo-2", source: "Garmin", category: "Course", title: "Course facile", startedAt: daysAgo(3), durationMinutes: 42, distanceKm: 7.2, calories: 515, averageHeartRate: 146 },
  { id: "demo-3", source: "Hevy", category: "Musculation", title: "Pull — Dos & biceps", startedAt: daysAgo(5), durationMinutes: 64, volumeKg: 8920, calories: 470 },
  { id: "demo-4", source: "Garmin", category: "Vélo", title: "Vélo endurance", startedAt: daysAgo(8), durationMinutes: 75, distanceKm: 31.4, calories: 680, averageHeartRate: 137 },
  { id: "demo-5", source: "Hevy", category: "Musculation", title: "Jambes", startedAt: daysAgo(10), durationMinutes: 70, volumeKg: 11350, calories: 560 }
];

const demoSuggestions = [
  { id: "s1", kind: "Musculation", title: "Bas du corps — progression contrôlée", rationale: "Ta dernière séance jambes remonte à plus d’une semaine, tandis que le haut du corps a été stimulé récemment.", durationMinutes: 55, intensity: "RPE 7", steps: ["Squat : 4 × 6", "Soulevé de terre roumain : 3 × 8", "Fentes bulgares : 3 × 10 par jambe", "Gainage : 3 × 45 s"] },
  { id: "s2", kind: "Cardio", title: "Footing facile en zone 2", rationale: "Une sortie basse intensité complète le volume cardio sans gêner la récupération musculaire.", durationMinutes: 40, intensity: "Facile", steps: ["8 min d’échauffement", "27 min en aisance respiratoire", "5 min très faciles"] },
  { id: "s3", kind: "Récupération", title: "Mobilité + marche", rationale: "Option légère si la fatigue perçue est élevée aujourd’hui.", durationMinutes: 30, intensity: "Très facile", steps: ["20 min de marche", "5 min de mobilité hanches", "5 min de mobilité épaules"] }
];

let state = loadJson(STORAGE_KEY, { sessions: demoSessions, suggestions: demoSuggestions, demo: true });
let settings = loadJson(SETTINGS_KEY, { syncEndpoint: "", coachEndpoint: "", relayToken: "" });
let currentFilter = "all";
let deferredInstallPrompt;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

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
  $("#versionLabel").textContent = `TrainSync ${APP_VERSION} · données conservées sur cet appareil`;
}

function renderSessions() {
  const sessions = state.sessions.filter(session => currentFilter === "all" || session.source === currentFilter);
  const container = $("#sessionsList");
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
  const recent = state.sessions.filter(session => new Date(session.startedAt) >= cutoff);
  const totalMinutes = recent.reduce((sum, session) => sum + Number(session.durationMinutes || 0), 0);
  const totalVolume = recent.reduce((sum, session) => sum + Number(session.volumeKg || 0), 0);
  const totalDistance = recent.reduce((sum, session) => sum + Number(session.distanceKm || 0), 0);

  $("#metricGrid").innerHTML = [
    ["⌁", recent.length, "Séances"],
    ["◷", `${Math.floor(totalMinutes / 60)}h${String(totalMinutes % 60).padStart(2, "0")}`, "Temps total"],
    ["◆", formatCompact(totalVolume), "kg soulevés"],
    ["↗", totalDistance.toFixed(1), "km parcourus"]
  ].map(metric => `<article class="metric"><div class="metric-icon">${metric[0]}</div><strong class="metric-value">${metric[1]}</strong><span class="metric-name">${metric[2]}</span></article>`).join("");

  const weeks = weeklyBuckets(recent);
  const maximum = Math.max(...weeks.map(week => week.minutes), 1);
  $("#weeklyChart").innerHTML = weeks.map(week => `<div class="bar-wrap"><span class="bar-value">${week.minutes}</span><div class="bar" style="height:${Math.max(3, week.minutes / maximum * 82)}%"></div><span class="bar-label">${week.label}</span></div>`).join("");

  const counts = recent.reduce((result, session) => {
    result[session.category] = (result[session.category] || 0) + 1;
    return result;
  }, {});
  const maxCount = Math.max(...Object.values(counts), 1);
  $("#categoryBreakdown").innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `<div class="breakdown-row"><p>${categories[name] || "●"} ${escapeHtml(name)}</p><span>${count} séance${count > 1 ? "s" : ""}</span><div class="progress"><span style="width:${count / maxCount * 100}%"></span></div></div>`).join("") || '<div class="empty-state">Ajoute une séance pour commencer l’analyse.</div>';
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
  $("#suggestionsList").innerHTML = state.suggestions.map(suggestion => {
    const className = suggestion.kind === "Cardio" ? "cardio" : suggestion.kind === "Récupération" ? "recovery" : "strength";
    const symbol = className === "cardio" ? "↗" : className === "recovery" ? "○" : "◆";
    return `<article class="suggestion-card ${className}">
      <div class="suggestion-head"><div class="suggestion-symbol">${symbol}</div><div><p class="kind">${escapeHtml(suggestion.kind).toUpperCase()}</p><h3>${escapeHtml(suggestion.title)}</h3></div></div>
      <p>${escapeHtml(suggestion.rationale)}</p>
      <div class="suggestion-stats"><span>◷ ${Number(suggestion.durationMinutes)} min</span><span>⌁ ${escapeHtml(suggestion.intensity)}</span></div>
      <details><summary>Voir la séance</summary><ol class="steps">${suggestion.steps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol></details>
    </article>`;
  }).join("");
}

function localSuggestions(goal) {
  const lastStrength = state.sessions.find(item => item.category === "Musculation");
  const lastRun = state.sessions.find(item => item.category === "Course");
  const strengthAge = lastStrength ? (Date.now() - new Date(lastStrength.startedAt)) / 86400000 : 10;
  const runAge = lastRun ? (Date.now() - new Date(lastRun.startedAt)) / 86400000 : 10;
  const chooseCardio = goal === "endurance" || (goal === "balanced" && runAge > strengthAge);
  const primary = chooseCardio
    ? { id: crypto.randomUUID(), kind: "Cardio", title: "Course progressive", rationale: "Le cardio est moins récent que la musculation dans ton historique.", durationMinutes: 45, intensity: "Facile à modérée", steps: ["10 min faciles", "3 × 6 min soutenues avec 2 min faciles", "7 min de retour au calme"] }
    : { id: crypto.randomUUID(), kind: "Musculation", title: goal === "strength" ? "Full body — force" : "Full body progressif", rationale: "Cette séance répartit la charge sur les principaux mouvements sans répéter immédiatement la dernière séance.", durationMinutes: 55, intensity: goal === "strength" ? "RPE 8" : "RPE 7", steps: ["Squat : 4 × 6", "Développé couché : 4 × 6", "Rowing : 4 × 8", "Soulevé de terre roumain : 3 × 8"] };
  return [primary,
    { id: crypto.randomUUID(), kind: "Cardio", title: "Zone 2 sans fatigue résiduelle", rationale: "Une séance facile développe la base aérobie et favorise la récupération.", durationMinutes: 35, intensity: "Facile", steps: ["5 min progressives", "25 min en aisance respiratoire", "5 min très faciles"] },
    { id: crypto.randomUUID(), kind: "Récupération", title: "Récupération active", rationale: "Choisis cette option en cas de courbatures fortes, fatigue ou sommeil insuffisant.", durationMinutes: 25, intensity: "Très facile", steps: ["15 min de marche", "Mobilité hanches et chevilles", "Respiration lente pendant 3 min"] }
  ];
}

async function generateSuggestions() {
  const button = $("#generateButton");
  button.disabled = true;
  button.textContent = "Analyse en cours…";
  try {
    if (settings.coachEndpoint) {
      const response = await fetch(settings.coachEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(settings.relayToken ? { Authorization: `Bearer ${settings.relayToken}` } : {}) },
        body: JSON.stringify({ goal: $("#goalSelect").selectedOptions[0].textContent, sessions: state.sessions.slice(0, 30) })
      });
      if (!response.ok) throw new Error("Le coach distant n’a pas répondu.");
      const data = await response.json();
      state.suggestions = data.suggestions;
      showStatus("Nouvelles suggestions reçues.");
    } else {
      state.suggestions = localSuggestions($("#goalSelect").value);
      showStatus("Suggestions calculées sur cet appareil.");
    }
    persist();
    renderSuggestions();
  } catch (error) { showStatus(error.message, true); }
  finally { button.disabled = false; button.textContent = "✦ Générer mes séances"; }
}

async function synchronize() {
  const button = $("#syncButton");
  if (!settings.syncEndpoint) {
    showStatus("Configure un relais dans Réglages ou importe un fichier Hevy/Garmin.", true);
    return;
  }
  button.classList.add("is-spinning");
  try {
    const response = await fetch(settings.syncEndpoint, { headers: settings.relayToken ? { Authorization: `Bearer ${settings.relayToken}` } : {} });
    if (!response.ok) throw new Error("Synchronisation impossible.");
    const data = await response.json();
    mergeSessions(data.sessions || []);
    showStatus(`${(data.sessions || []).length} séance(s) synchronisée(s).`);
  } catch (error) { showStatus(error.message, true); }
  finally { button.classList.remove("is-spinning"); }
}

function mergeSessions(incoming) {
  const map = new Map(state.sessions.map(item => [item.id, item]));
  incoming.map(normalizeSession).forEach(item => map.set(item.id, item));
  state.sessions = [...map.values()].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  state.demo = false;
  persist();
  renderAll();
}

function normalizeSession(item, defaultSource = "Hevy") {
  const source = String(item.source || defaultSource).toLowerCase().includes("garmin") ? "Garmin" : "Hevy";
  const rawCategory = item.category || item.type || item.activityType || item.activity_type || (source === "Hevy" ? "Musculation" : "Cardio");
  const category = Object.keys(categories).find(key => rawCategory.toLowerCase().includes(key.toLowerCase())) || mapActivityCategory(rawCategory);
  const startedAt = new Date(item.startedAt || item.start_time || item.startTime || item.date || Date.now()).toISOString();
  const durationMinutes = durationToMinutes(item.durationMinutes || item.duration_minutes || item.elapsed_time || item.duration || item.duration_seconds);
  return {
    id: String(item.id || `${source}-${startedAt}-${item.title || item.name || rawCategory}`),
    source, category,
    title: String(item.title || item.name || item.activityName || item.activity_name || `${category} ${source}`),
    startedAt,
    durationMinutes: Math.round(durationMinutes),
    distanceKm: optionalNumber(item.distanceKm || item.distance_km || item.distance),
    volumeKg: optionalNumber(item.volumeKg || item.volume_kg || item.volume),
    calories: optionalNumber(item.calories),
    averageHeartRate: optionalNumber(item.averageHeartRate || item.avg_hr || item.average_hr)
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
  if (normalized.includes("cycl") || normalized.includes("vélo") || normalized.includes("bike")) return "Vélo";
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
    } else {
      records = parseCsv(text);
    }
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

async function loadPublishedCoach() {
  try {
    const response = await fetch(`./data/coach.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (!Array.isArray(data.suggestions) || !data.suggestions.length || data.updatedAt === state.coachVersion) return;
    state.suggestions = data.suggestions;
    state.coachVersion = data.updatedAt;
    persist();
    renderSuggestions();
    showStatus("Les nouvelles suggestions du coach sont disponibles.");
  } catch { /* Le site reste utilisable hors ligne. */ }
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
  return lines.slice(1).map(line => Object.fromEntries(headers.map((header, index) => [header, parseLine(line)[index] || ""])));
}

function showStatus(message, isError = false) {
  const status = $("#statusBar");
  status.textContent = message;
  status.style.background = isError ? "var(--red)" : "var(--accent)";
  status.hidden = false;
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => { status.hidden = true; }, 4200);
}

function setupEvents() {
  $$(".bottom-nav button").forEach(button => button.addEventListener("click", () => {
    const target = button.dataset.target;
    $$(".bottom-nav button").forEach(item => { item.classList.toggle("is-active", item === button); item.removeAttribute("aria-current"); });
    button.setAttribute("aria-current", "page");
    $$(".view").forEach(view => view.classList.toggle("is-active", view.dataset.view === target));
    window.scrollTo({ top: 0, behavior: "smooth" });
    $("#app").focus({ preventScroll: true });
  }));

  $$(".segmented button").forEach(button => button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    $$(".segmented button").forEach(item => item.classList.toggle("is-selected", item === button));
    renderSessions();
  }));

  $("#openAddSession").addEventListener("click", () => {
    const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    $("#sessionDate").value = date.toISOString().slice(0, 16);
    $("#sessionDialog").showModal();
  });

  $("#sessionForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mergeSessions([normalizeSession({ id: crypto.randomUUID(), title: form.get("title"), source: form.get("source"), category: form.get("category"), startedAt: form.get("date"), durationMinutes: form.get("duration"), distanceKm: form.get("distance"), volumeKg: form.get("volume") })]);
    $("#sessionDialog").close();
    event.currentTarget.reset();
    showStatus("Séance ajoutée.");
  });

  $("#generateButton").addEventListener("click", generateSuggestions);
  $("#syncButton").addEventListener("click", synchronize);
  $("#hevyImport").addEventListener("change", event => importFile(event.target.files[0], "Hevy"));
  $("#garminImport").addEventListener("change", event => importFile(event.target.files[0], "Garmin"));
  $("#saveSettings").addEventListener("click", () => {
    settings = { syncEndpoint: $("#syncEndpoint").value.trim(), coachEndpoint: $("#coachEndpoint").value.trim(), relayToken: $("#relayToken").value };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    showStatus("Réglages enregistrés sur cet appareil.");
  });
  $("#resetData").addEventListener("click", () => {
    if (!confirm("Supprimer toutes les séances enregistrées sur cet appareil ?")) return;
    state = { sessions: demoSessions, suggestions: demoSuggestions, demo: true };
    persist(); renderAll(); showStatus("Données de démonstration restaurées.");
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); deferredInstallPrompt = event; $("#installButton").hidden = false;
  });
  $("#installButton").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    await deferredInstallPrompt.prompt(); deferredInstallPrompt = null; $("#installButton").hidden = true;
  });
}

function initialize() {
  $("#syncEndpoint").value = settings.syncEndpoint || "";
  $("#coachEndpoint").value = settings.coachEndpoint || "";
  $("#relayToken").value = settings.relayToken || "";
  setupEvents(); renderAll(); loadPublishedCoach();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").then(registration => registration.update()).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => showStatus("Nouvelle version installée."));
  }
  if (settings.syncEndpoint) synchronize();
}

document.addEventListener("DOMContentLoaded", initialize);
