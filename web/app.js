const APP_VERSION = "1.3.0";
const API_BASE = "https://hevy-garmin-coach.planetpizza.workers.dev";
const STORAGE_KEY = "trainsync-state-v1";
const SETTINGS_KEY = "trainsync-settings-v2";
const LEGACY_SETTINGS_KEY = "trainsync-settings-v1";

const categories = {
  "Musculation": "🏋️",
  "Course": "🏃",
  "Vélo": "🚴",
  "Marche": "🚶",
  "Cardio": "❤️",
  "Autre": "⚡"
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
  if (current) return { relayToken: String(current.relayToken || ""), goal: String(current.goal || "balanced") };
  const legacy = loadJson(LEGACY_SETTINGS_KEY, {});
  return { relayToken: String(legacy.relayToken || ""), goal: "balanced" };
}

function persistState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function persistSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ relayToken: settings.relayToken || "", goal: settings.goal || "balanced" })); }

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function normalizeText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formatCompact(value) {
  if (!Number.isFinite(value)) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.round(value).toString();
}

function formatPace(value) {
  const pace = Number(value);
  if (!Number.isFinite(pace) || pace <= 0) return "—";
  const minutes = Math.floor(pace);
  const seconds = Math.round((pace - minutes) * 60);
  return `${minutes}:${String(seconds === 60 ? 0 : seconds).padStart(2, "0")}${seconds === 60 ? ` (${minutes + 1}:00)` : ""} /km`;
}

function formatNumber(value, suffix = "", digits = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(digits)}${suffix}` : "—";
}

function sourceClass(source) { return source === "Garmin" ? "garmin" : "hevy"; }

function activityMeta(session = {}) {
  const text = normalizeText([session.activityType, session.title, session.category].filter(Boolean).join(" "));
  const has = (...words) => words.some(word => text.includes(word));

  if (has("padel")) return { key: "padel", label: "Padel", icon: "🎾" };
  if (has("plongee", "diving", "scuba")) return { key: "diving", label: "Plongée", icon: "🤿" };
  if (has("natation", "swim", "swimming")) return { key: "swim", label: "Natation", icon: "🏊" };
  if (has("randonnee", "hike", "hiking", "trail walking")) return { key: "hike", label: "Randonnée", icon: "🥾" };
  if (has("trail run", "trailrun", "trail running")) return { key: "trail", label: "Trail", icon: "🏃‍♂️" };
  if (has("run", "running", "course")) return { key: "run", label: "Course à pied", icon: "🏃" };
  if (has("velo", "cycling", "ride", "bike", "cycl")) return { key: "bike", label: "Vélo", icon: "🚴" };
  if (has("walk", "walking", "marche")) return { key: "walk", label: "Marche", icon: "🚶" };
  if (has("tennis")) return { key: "tennis", label: "Tennis", icon: "🎾" };
  if (has("football", "soccer")) return { key: "football", label: "Football", icon: "⚽" };
  if (has("ski")) return { key: "ski", label: "Ski", icon: "🎿" };
  if (has("snowboard")) return { key: "snowboard", label: "Snowboard", icon: "🏂" };
  if (has("rowing", "rameur", "row ")) return { key: "rowing", label: "Rameur", icon: "🚣" };
  if (has("yoga")) return { key: "yoga", label: "Yoga", icon: "🧘" };
  if (has("golf")) return { key: "golf", label: "Golf", icon: "🏌️" };
  if (has("strength", "weight", "musculation", "hevy")) return { key: "strength", label: "Musculation", icon: "🏋️" };
  if (has("elliptical")) return { key: "elliptical", label: "Elliptique", icon: "⭕" };
  return { key: "other", label: session.category || session.activityType || "Autre", icon: categories[session.category] || "⚡" };
}

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
    const sport = activityMeta(session);
    const detail = session.distanceKm
      ? `${Number(session.distanceKm).toFixed(1)} km`
      : session.volumeKg ? `${formatCompact(Number(session.volumeKg))} kg` : sport.label;
    return `${dateLabel}<article class="session-card ${sourceClass(session.source)}" role="button" tabindex="0" data-session-id="${escapeHtml(session.id)}" aria-label="Voir le détail de ${escapeHtml(session.title)}">
      <div class="session-icon activity-${sport.key}" aria-hidden="true">${sport.icon}</div>
      <div class="session-main"><p class="session-title">${escapeHtml(session.title)}</p><p class="session-meta">${escapeHtml(sport.label)} · ${Number(session.durationMinutes) || 0} min · ${escapeHtml(detail)}</p></div>
      <div class="session-side"><span class="source-badge">${escapeHtml(session.source)}</span><span class="session-chevron">›</span></div>
    </article>`;
  }).join("");
}

function ensureEnhancedUi() {
  if (!document.querySelector('link[href="./v13.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./v13.css";
    document.head.appendChild(link);
  }

  const analysisView = $("#analysisView");
  if (analysisView && !$("#strengthAnalysis")) {
    analysisView.insertAdjacentHTML("beforeend", `
      <article class="panel analysis-detail-panel"><div class="panel-title"><div><p class="eyebrow">MUSCULATION</p><h3>Progression récente</h3></div></div><div id="strengthAnalysis"></div></article>
      <article class="panel analysis-detail-panel"><div class="panel-title"><div><p class="eyebrow">ENDURANCE</p><h3>Course & activités extérieures</h3></div></div><div id="enduranceAnalysis"></div></article>`);
  }

  if (!$("#sessionDetailDialog")) {
    document.body.insertAdjacentHTML("beforeend", `
      <dialog id="sessionDetailDialog" class="session-detail-dialog">
        <div class="detail-shell">
          <div class="detail-toolbar"><div><p class="eyebrow">DÉTAIL DE LA SÉANCE</p><h2 id="detailTitle">Séance</h2></div><button class="icon-button" id="closeSessionDetail" aria-label="Fermer">×</button></div>
          <div id="sessionDetailContent"></div>
        </div>
      </dialog>`);
    $("#closeSessionDetail")?.addEventListener("click", () => $("#sessionDetailDialog")?.close());
    $("#sessionDetailDialog")?.addEventListener("click", event => {
      if (event.target === $("#sessionDetailDialog")) $("#sessionDetailDialog").close();
    });
  }
}

function openSessionDetail(id) {
  const session = state.sessions.find(item => String(item.id) === String(id));
  if (!session) return;
  const dialog = $("#sessionDetailDialog");
  const content = $("#sessionDetailContent");
  const title = $("#detailTitle");
  if (!dialog || !content || !title) return;
  title.textContent = session.title;
  content.innerHTML = buildSessionDetail(session);
  dialog.showModal();
}

function detailMetric(label, value) {
  if (value == null || value === "—" || value === "") return "";
  return `<div class="detail-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function buildSessionDetail(session) {
  const sport = activityMeta(session);
  const date = new Date(session.startedAt);
  const dateText = date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeText = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const metrics = [
    detailMetric("Activité", `${sport.icon} ${sport.label}`),
    detailMetric("Durée", `${Number(session.durationMinutes) || 0} min`),
    session.distanceKm ? detailMetric("Distance", `${Number(session.distanceKm).toFixed(2)} km`) : "",
    session.paceMinKm ? detailMetric("Allure", formatPace(session.paceMinKm)) : "",
    session.averageHeartRate ? detailMetric("FC moyenne", `${Math.round(session.averageHeartRate)} bpm`) : "",
    session.maxHeartRate ? detailMetric("FC max", `${Math.round(session.maxHeartRate)} bpm`) : "",
    session.elevationGainM ? detailMetric("Dénivelé +", `${Math.round(session.elevationGainM)} m`) : "",
    session.calories ? detailMetric("Calories", `${Math.round(session.calories)} kcal`) : "",
    session.trainingLoad ? detailMetric("Charge", `${Math.round(session.trainingLoad)}`) : "",
    session.rpe ? detailMetric("RPE", `${Number(session.rpe).toFixed(1)}/10`) : "",
    session.volumeKg ? detailMetric("Volume", `${Math.round(session.volumeKg).toLocaleString("fr-FR")} kg`) : ""
  ].filter(Boolean).join("");

  let extra = "";
  if (Array.isArray(session.exercises) && session.exercises.length) {
    extra = `<section class="exercise-section"><h3>Exercices</h3>${session.exercises.map((exercise, exerciseIndex) => {
      const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
      const rows = sets.map((set, index) => {
        const values = [];
        if (set.weightKg != null) values.push(`${set.weightKg} kg`);
        if (set.reps != null) values.push(`${set.reps} rep`);
        if (set.distanceMeters != null) values.push(`${set.distanceMeters} m`);
        if (set.durationSeconds != null) values.push(`${set.durationSeconds} s`);
        if (set.rpe != null) values.push(`RPE ${set.rpe}`);
        return `<div class="set-row"><span>${index + 1}</span><strong>${escapeHtml(values.join(" × ") || set.type || "Série")}</strong></div>`;
      }).join("");
      return `<div class="exercise-card"><div class="exercise-heading"><span>${exerciseIndex + 1}</span><div><strong>${escapeHtml(exercise.title || "Exercice")}</strong>${exercise.notes ? `<small>${escapeHtml(exercise.notes)}</small>` : ""}</div></div><div class="set-list">${rows || '<p class="muted">Aucune série détaillée.</p>'}</div></div>`;
    }).join("")}</section>`;
  }

  return `<div class="detail-hero"><div class="detail-sport-icon">${sport.icon}</div><div><p>${escapeHtml(dateText)} · ${escapeHtml(timeText)}</p><span>${escapeHtml(session.source)}${session.provider ? ` · ${escapeHtml(session.provider)}` : ""}</span></div></div><div class="detail-metric-grid">${metrics}</div>${extra}`;
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
    ["🏋️", formatCompact(totalVolume), "kg soulevés"],
    ["↗", totalDistance.toFixed(1), "km parcourus"]
  ].map(metric => `<article class="metric"><div class="metric-icon">${metric[0]}</div><strong class="metric-value">${metric[1]}</strong><span class="metric-name">${metric[2]}</span></article>`).join("");

  const weeks = weeklyBuckets(recent);
  const maximum = Math.max(...weeks.map(week => week.minutes), 1);
  const chart = $("#weeklyChart");
  if (chart) chart.innerHTML = weeks.map(week => `<div class="bar-wrap"><span class="bar-value">${week.minutes}</span><div class="bar" style="height:${Math.max(3, week.minutes / maximum * 82)}%"></div><span class="bar-label">${week.label}</span></div>`).join("");

  const sportCounts = recent.reduce((result, session) => {
    const sport = activityMeta(session);
    if (!result[sport.label]) result[sport.label] = { count: 0, icon: sport.icon };
    result[sport.label].count += 1;
    return result;
  }, {});
  const maxCount = Math.max(...Object.values(sportCounts).map(x => x.count), 1);
  const breakdown = $("#categoryBreakdown");
  if (breakdown) breakdown.innerHTML = Object.entries(sportCounts).sort((a, b) => b[1].count - a[1].count).map(([name, data]) => `<div class="breakdown-row"><p>${data.icon} ${escapeHtml(name)}</p><span>${data.count} séance${data.count > 1 ? "s" : ""}</span><div class="progress"><span style="width:${data.count / maxCount * 100}%"></span></div></div>`).join("") || '<div class="empty-state">Synchronise tes séances pour commencer l’analyse.</div>';

  renderStrengthAnalysis(recent);
  renderEnduranceAnalysis(recent);
}

function renderStrengthAnalysis(recent) {
  const target = $("#strengthAnalysis");
  if (!target) return;
  const sessions = recent.filter(session => Array.isArray(session.exercises) && session.exercises.length);
  if (!sessions.length) {
    target.innerHTML = '<p class="muted">Aucune séance Hevy détaillée sur les 28 derniers jours.</p>';
    return;
  }
  const exerciseHistory = new Map();
  [...sessions].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt)).forEach(session => {
    session.exercises.forEach(exercise => {
      const key = exercise.exerciseTemplateId || normalizeText(exercise.title);
      const workSets = (exercise.sets || []).filter(set => set.type !== "warmup" && (set.weightKg != null || set.reps != null));
      if (!workSets.length) return;
      const best = [...workSets].sort((a, b) => (Number(b.weightKg || 0) - Number(a.weightKg || 0)) || (Number(b.reps || 0) - Number(a.reps || 0)))[0];
      if (!exerciseHistory.has(key)) exerciseHistory.set(key, { title: exercise.title, entries: [] });
      exerciseHistory.get(key).entries.push({ date: session.startedAt, best });
    });
  });
  const recentExercises = [...exerciseHistory.values()].filter(item => item.entries.length).sort((a, b) => new Date(b.entries.at(-1).date) - new Date(a.entries.at(-1).date)).slice(0, 5);
  const rows = recentExercises.map(item => {
    const latest = item.entries.at(-1)?.best || {};
    const previous = item.entries.at(-2)?.best || null;
    const latestText = `${latest.weightKg ?? "—"} kg × ${latest.reps ?? "—"}`;
    const previousText = previous ? `${previous.weightKg ?? "—"} kg × ${previous.reps ?? "—"}` : "première référence";
    return `<div class="analysis-row"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(previousText)} → ${escapeHtml(latestText)}</small></div><span>${latest.rpe != null ? `RPE ${latest.rpe}` : ""}</span></div>`;
  }).join("");
  target.innerHTML = `<div class="analysis-summary"><strong>${sessions.length}</strong><span>séance${sessions.length > 1 ? "s" : ""} · ${Math.round(sessions.reduce((sum, s) => sum + Number(s.volumeKg || 0), 0)).toLocaleString("fr-FR")} kg de volume</span></div>${rows || '<p class="muted">Pas encore assez de séries comparables.</p>'}`;
}

function renderEnduranceAnalysis(recent) {
  const target = $("#enduranceAnalysis");
  if (!target) return;
  const outdoor = recent.filter(session => session.source === "Garmin" && (session.distanceKm || session.averageHeartRate || session.elevationGainM));
  if (!outdoor.length) {
    target.innerHTML = '<p class="muted">Aucune activité Garmin exploitable sur les 28 derniers jours.</p>';
    return;
  }
  const runs = outdoor.filter(session => ["run", "trail"].includes(activityMeta(session).key));
  const runKm = runs.reduce((sum, session) => sum + Number(session.distanceKm || 0), 0);
  const runMinutes = runs.reduce((sum, session) => sum + Number(session.durationMinutes || 0), 0);
  const longest = Math.max(0, ...runs.map(session => Number(session.distanceKm || 0)));
  const avgPace = runKm > 0 ? runMinutes / runKm : null;
  const hrValues = outdoor.map(session => Number(session.averageHeartRate)).filter(Number.isFinite);
  const avgHr = hrValues.length ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : null;
  const elevation = outdoor.reduce((sum, session) => sum + Number(session.elevationGainM || 0), 0);

  const sportRows = Object.entries(outdoor.reduce((acc, session) => {
    const sport = activityMeta(session);
    if (!acc[sport.label]) acc[sport.label] = { icon: sport.icon, count: 0, km: 0 };
    acc[sport.label].count += 1;
    acc[sport.label].km += Number(session.distanceKm || 0);
    return acc;
  }, {})).sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([name, data]) => `<div class="analysis-row"><div><strong>${data.icon} ${escapeHtml(name)}</strong><small>${data.count} séance${data.count > 1 ? "s" : ""}</small></div><span>${data.km ? `${data.km.toFixed(1)} km` : ""}</span></div>`).join("");

  target.innerHTML = `<div class="analysis-kpis">${
    runs.length ? `<div><strong>${runKm.toFixed(1)} km</strong><span>course · ${formatPace(avgPace)}</span></div><div><strong>${longest.toFixed(1)} km</strong><span>plus longue sortie</span></div>` : ""
  }${avgHr ? `<div><strong>${avgHr} bpm</strong><span>FC moyenne activités</span></div>` : ""}${elevation ? `<div><strong>${Math.round(elevation)} m</strong><span>dénivelé positif</span></div>` : ""}</div>${sportRows}`;
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
    const symbol = className === "cardio" ? "🏃" : className === "recovery" ? "🧘" : "🏋️";
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
    const message = normalizeText(error?.message || "");
    if (message.includes("failed to fetch") || message.includes("load failed") || message.includes("networkerror")) {
      throw new Error("La connexion au Worker a été interrompue. Vérifie le réseau puis réessaie.");
    }
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
  if (!button) return;
  button.disabled = true;
  button.textContent = "Analyse en cours…";
  try {
    if (!settings.relayToken) throw new Error("Connecte TrainSync au Worker dans Réglages avant d’utiliser le coach.");
    const data = await apiRequest("/recommend", {
      method: "POST",
      body: JSON.stringify({
        goal: $("#goalSelect")?.selectedOptions?.[0]?.textContent || "Équilibre",
        sessions: state.sessions.filter(x => !String(x.id).startsWith("demo-")).slice(0, 40)
      })
    }, 90000);
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
  const normalized = normalizeText(value);
  if (normalized.includes("run") || normalized.includes("course")) return "Course";
  if (normalized.includes("cycl") || normalized.includes("velo") || normalized.includes("bike") || normalized.includes("ride")) return "Vélo";
  if (normalized.includes("walk") || normalized.includes("marche") || normalized.includes("hike") || normalized.includes("randonnee")) return "Marche";
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

  $("#sessionsList")?.addEventListener("click", event => {
    const card = event.target.closest("[data-session-id]");
    if (card) openSessionDetail(card.dataset.sessionId);
  });
  $("#sessionsList")?.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-session-id]");
    if (card) { event.preventDefault(); openSessionDetail(card.dataset.sessionId); }
  });

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

  $("#goalSelect")?.addEventListener("change", event => {
    settings.goal = event.target.value;
    persistSettings();
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
  ensureEnhancedUi();
  if ($("#relayToken")) $("#relayToken").value = settings.relayToken || "";
  if ($("#goalSelect")) $("#goalSelect").value = settings.goal || "balanced";
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
