import { firebaseConfig, firebaseOptions } from "./firebase-config.js?v=20260611-firebase-live";

const STORAGE_KEY = "padel-tracker-state-v1";
const ADMIN_CODE = "2468";
const REMOTE_POLL_INTERVAL = 2500;

const defaultPlayerNames = [
  "איתי",
  "עודד",
  "ניראל",
  "אמרי",
  "בן",
  "סמסון",
  "קובי",
  "פרידמן",
  "אלירן",
  "אמיר",
  "שחר"
];

const defaultPlayerPhotos = {
  "איתי": "images/itay.png",
  "עודד": "images/oded.png",
  "ניראל": "images/nirel.png",
  "אמרי": "images/imri.png",
  "בן": "images/ben.png",
  "קובי": "images/kobi.jpeg",
  "פרידמן": "images/fridman.jpeg",
  "אלירן": "images/eliran.jpeg",
  "שחר": "images/shahar.png"
};

const legacySampleNames = [
  "Amit",
  "Daniel",
  "Eyal",
  "Guy",
  "Itay",
  "Noam",
  "Omer",
  "Ronen"
];

const defaultPlayers = [
  ...defaultPlayerNames
].map((name) => ({
  id: crypto.randomUUID(),
  name,
  photo: defaultPlayerPhotos[name] || "",
  playing: true
}));

let state = loadState();
let selectedSlot = null;
let editingMatchId = null;
let pendingDeleteMatchId = null;
let remoteReady = false;
let remoteSaveTimer = null;
let remotePlayerSaveTimer = null;
let remotePollTimer = null;
let applyingRemoteState = false;
let lastRemoteSignature = "";
const pendingMatchIds = new Set();
let generatorGameCount = 1;
let generatorAvailableIds = null;
let generatedMatchSuggestions = [];
const failedPhotoUrls = new Set();

const els = {
  appTitle: document.querySelector("#app-title"),
  syncStatus: document.querySelector("#sync-status"),
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  slots: document.querySelectorAll(".player-slot"),
  scoreA: document.querySelector("#score-a"),
  scoreB: document.querySelector("#score-b"),
  scoreStatus: document.querySelector("#score-status"),
  saveMatch: document.querySelector("#save-match"),
  flipScore: document.querySelector("#flip-score"),
  generateOneGame: document.querySelector("#generate-one-game"),
  generateTwoGames: document.querySelector("#generate-two-games"),
  generateRandomMatch: document.querySelector("#generate-random-match"),
  availableCount: document.querySelector("#available-count"),
  generatorNote: document.querySelector("#generator-note"),
  availablePlayerGrid: document.querySelector("#available-player-grid"),
  generatedMatches: document.querySelector("#generated-matches"),
  matchList: document.querySelector("#match-list"),
  matchCount: document.querySelector("#match-count"),
  historyList: document.querySelector("#history-list"),
  historyCount: document.querySelector("#history-count"),
  picker: document.querySelector("#player-picker"),
  pickerGrid: document.querySelector("#picker-grid"),
  pickerTitle: document.querySelector("#picker-title"),
  closePicker: document.querySelector("#close-picker"),
  unlockForm: document.querySelector("#unlock-form"),
  adminCode: document.querySelector("#admin-code"),
  adminGate: document.querySelector("#admin-gate"),
  adminDashboard: document.querySelector("#admin-dashboard"),
  insights: document.querySelector("#insights"),
  playerStats: document.querySelector("#player-stats"),
  pairStats: document.querySelector("#pair-stats"),
  adminPlayerGrid: document.querySelector("#admin-player-grid"),
  playingCount: document.querySelector("#playing-count"),
  adminMatchList: document.querySelector("#admin-match-list"),
  adminMatchCount: document.querySelector("#admin-match-count"),
  exportJson: document.querySelector("#export-json"),
  exportCsv: document.querySelector("#export-csv"),
  resetMatches: document.querySelector("#reset-matches"),
  backPublic: document.querySelector("#back-public"),
  lockAdmin: document.querySelector("#lock-admin"),
  scoreEditor: document.querySelector("#score-editor"),
  closeScoreEditor: document.querySelector("#close-score-editor"),
  scoreForm: document.querySelector("#score-form"),
  scoreEditMatch: document.querySelector("#score-edit-match"),
  editScoreA: document.querySelector("#edit-score-a"),
  editScoreB: document.querySelector("#edit-score-b"),
  editScoreNote: document.querySelector("#edit-score-note"),
  gameDetail: document.querySelector("#game-detail"),
  closeGameDetail: document.querySelector("#close-game-detail"),
  gameDetailTitle: document.querySelector("#game-detail-title"),
  gameDetailBody: document.querySelector("#game-detail-body"),
  deleteConfirm: document.querySelector("#delete-confirm"),
  closeDeleteConfirm: document.querySelector("#close-delete-confirm"),
  cancelDeleteMatch: document.querySelector("#cancel-delete-match"),
  confirmDeleteMatch: document.querySelector("#confirm-delete-match"),
  deleteConfirmText: document.querySelector("#delete-confirm-text"),
  toast: document.querySelector("#toast")
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return normalizeState();
  }

  try {
    return normalizeState(JSON.parse(saved));
  } catch {
    return normalizeState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveSharedState() {
  saveState();
  scheduleRemoteTournamentSave();
}

function savePlayersSharedState() {
  saveState();
  schedulePlayersRemoteSave();
}

function normalizeState(input = {}) {
  const savedPlayers = Array.isArray(input.players) ? input.players : [];
  const savedMatches = Array.isArray(input.matches) ? input.matches : [];
  const isLegacyRoster = savedPlayers.length === legacySampleNames.length
    && savedPlayers.every((player, index) => player.name === legacySampleNames[index]);

  return {
    players: isLegacyRoster && !savedMatches.length
      ? defaultPlayers
      : savedPlayers.length
        ? syncBundledRoster(savedPlayers)
        : defaultPlayers,
    matches: savedMatches,
    draft: normalizeDraft(input.draft)
  };
}

function normalizeDraft(draft = {}) {
  return {
    ...emptyDraft(),
    ...draft
  };
}

function remotePayload() {
  return {
    players: state.players
  };
}

function hasFirebaseConfig() {
  return Boolean(
    firebaseOptions.enabled
    && firebaseConfig.apiKey
    && firebaseConfig.projectId
    && firebaseConfig.appId
  );
}

function setSyncStatus(status, message) {
  if (!els.syncStatus) return;

  els.syncStatus.textContent = message;
  els.syncStatus.dataset.status = status;
}

function remoteDocumentUrl(...segments) {
  const tournamentId = firebaseOptions.tournamentId || "main";
  const path = ["tournaments", tournamentId, ...segments].map(encodeURIComponent).join("/");
  return `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${path}?key=${firebaseConfig.apiKey}`;
}

async function remoteRequest(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    if (response.status === 404) return null;

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = body?.error?.message || `Firestore request failed (${response.status})`;
      throw new Error(message);
    }

    return body;
  } finally {
    window.clearTimeout(timeout);
  }
}

function toFirestoreValue(value) {
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue)
      }
    };
  }

  if (value && typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, toFirestoreValue(nestedValue)]))
      }
    };
  }

  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (value === null || value === undefined) return { nullValue: null };
  return { stringValue: String(value) };
}

function fromFirestoreValue(value) {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, nestedValue]) => [key, fromFirestoreValue(nestedValue)]));
  }
  return null;
}

function fromFirestoreDocument(document) {
  return Object.fromEntries(Object.entries(document?.fields || {}).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function toFirestoreDocument(data) {
  return {
    fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]))
  };
}

function scheduleRemoteTournamentSave() {
  if (!remoteReady || applyingRemoteState) return;

  setSyncStatus("syncing", "Syncing");
  window.clearTimeout(remoteSaveTimer);
  remoteSaveTimer = window.setTimeout(async () => {
    try {
      await saveTournamentRemote({
        ...remotePayload(),
        updatedAt: new Date().toISOString()
      });
      setSyncStatus("synced", "Synced");
    } catch (error) {
      console.error("Could not sync tournament state", error);
      setSyncStatus("error", "Sync error");
      toast("Could not sync. Saved on this phone.");
    }
  }, 250);
}

function schedulePlayersRemoteSave() {
  if (!remoteReady || applyingRemoteState) return;

  setSyncStatus("syncing", "Syncing");
  window.clearTimeout(remotePlayerSaveTimer);
  remotePlayerSaveTimer = window.setTimeout(async () => {
    try {
      await saveTournamentRemote({
        players: state.players,
        updatedAt: new Date().toISOString()
      });
      setSyncStatus("synced", "Synced");
    } catch (error) {
      console.error("Could not sync playing roster", error);
      setSyncStatus("error", "Sync error");
      toast("Could not sync players. Saved on this phone.");
    }
  }, 250);
}

async function saveTournamentRemote(data) {
  await remoteRequest(remoteDocumentUrl(), {
    method: "PATCH",
    body: JSON.stringify(toFirestoreDocument(data))
  });
}

async function saveMatchRemote(match) {
  if (!remoteReady || applyingRemoteState) return;

  setSyncStatus("syncing", "Syncing");
  try {
    await remoteRequest(remoteDocumentUrl("matches", match.id), {
      method: "PATCH",
      body: JSON.stringify(toFirestoreDocument(match))
    });
    setSyncStatus("synced", "Synced");
  } catch (error) {
    console.error("Could not sync match", error);
    setSyncStatus("error", "Sync error");
    toast("Could not sync. Saved on this phone.");
  }
}

async function deleteMatchRemote(matchId) {
  if (!remoteReady || applyingRemoteState) return;

  setSyncStatus("syncing", "Syncing");
  try {
    await remoteRequest(remoteDocumentUrl("matches", matchId), {
      method: "DELETE"
    });
    setSyncStatus("synced", "Synced");
  } catch (error) {
    console.error("Could not delete remote match", error);
    setSyncStatus("error", "Sync error");
    toast("Could not sync delete. Removed on this phone.");
  }
}

async function resetRemoteMatches(matchIds) {
  if (!remoteReady || applyingRemoteState) return;

  setSyncStatus("syncing", "Syncing");
  try {
    await Promise.all(matchIds.map((matchId) => remoteRequest(remoteDocumentUrl("matches", matchId), {
      method: "DELETE"
    })));
    setSyncStatus("synced", "Synced");
  } catch (error) {
    console.error("Could not reset remote matches", error);
    setSyncStatus("error", "Sync error");
    toast("Could not sync reset. Cleared on this phone.");
  }
}

async function initRemoteSync() {
  if (!hasFirebaseConfig()) {
    console.info("Firebase is disabled. Using local browser storage.");
    setSyncStatus("local", "Local only");
    return;
  }

  try {
    setSyncStatus("syncing", "Connecting");
    remoteReady = true;
    await pullRemoteState({ createIfMissing: true });
    remotePollTimer = window.setInterval(() => pullRemoteState(), REMOTE_POLL_INTERVAL);
  } catch (error) {
    console.error("Could not start Firebase sync", error);
    setSyncStatus("error", "Sync error");
    toast("Shared sync is not configured");
  }
}

async function pullRemoteState(options = {}) {
  if (!remoteReady) return;

  try {
    const tournamentDocument = await remoteRequest(remoteDocumentUrl());
    if (!tournamentDocument) {
      if (options.createIfMissing) {
        await saveTournamentRemote({
          ...remotePayload(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      setSyncStatus("synced", "Synced");
      return;
    }

    const matchesDocument = await remoteRequest(`${remoteDocumentUrl("matches")}&pageSize=100`);
    const remoteData = fromFirestoreDocument(tournamentDocument);
    const remoteMatches = (matchesDocument?.documents || [])
      .map(fromFirestoreDocument)
      .filter((match) => match.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const remoteState = normalizeState({
      players: remoteData.players,
      matches: remoteMatches
    });
    const remoteMatchIds = new Set(remoteState.matches.map((match) => match.id));
    const remoteSignature = JSON.stringify({
      players: remoteState.players.map(({ id, name, photo, playing }) => ({ id, name, photo, playing })),
      matches: remoteState.matches
    });
    const unsyncedMatches = state.matches.filter((match) => pendingMatchIds.has(match.id) && !remoteMatchIds.has(match.id));
    if (remoteSignature === lastRemoteSignature && !unsyncedMatches.length) {
      setSyncStatus("synced", "Synced");
      return;
    }

    applyingRemoteState = true;
    const localDraft = state.draft;
    remoteMatchIds.forEach((id) => pendingMatchIds.delete(id));
    remoteState.matches = [...remoteState.matches, ...unsyncedMatches];
    state = {
      ...remoteState,
      draft: localDraft
    };
    clearInactiveDraftPlayers();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
    lastRemoteSignature = remoteSignature;
    setSyncStatus("synced", "Synced");
    applyingRemoteState = false;
  } catch (error) {
    applyingRemoteState = false;
    console.error("Could not pull remote tournament state", error);
    setSyncStatus("error", "Sync error");
  }
}

function clearInactiveDraftPlayers() {
  const activeIds = new Set(state.players.filter((player) => player.playing).map((player) => player.id));
  ["a1", "a2", "b1", "b2"].forEach((slot) => {
    if (state.draft[slot] && !activeIds.has(state.draft[slot])) {
      state.draft[slot] = "";
    }
  });
}

function hydrateBundledPhotos(players) {
  return players.map((player) => ({
    ...player,
    photo: defaultPlayerPhotos[player.name] || player.photo || "",
    playing: typeof player.playing === "boolean" ? player.playing : true
  }));
}

function syncBundledRoster(players) {
  const hydratedPlayers = hydrateBundledPhotos(players);
  const existingNames = new Set(hydratedPlayers.map((player) => player.name));
  const missingPlayers = defaultPlayerNames
    .filter((name) => !existingNames.has(name))
    .map((name) => ({
      id: crypto.randomUUID(),
      name,
      photo: defaultPlayerPhotos[name] || "",
      playing: true
    }));

  return [...hydratedPlayers, ...missingPlayers];
}

function emptyDraft() {
  return {
    a1: "",
    a2: "",
    b1: "",
    b2: "",
    scoreA: "",
    scoreB: ""
  };
}

function playerById(id) {
  return state.players.find((player) => player.id === id);
}

function playerName(id) {
  return playerById(id)?.name || "Unknown";
}

function firstName(name) {
  return name.split(/\s+/).filter(Boolean)[0] || name;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function avatar(player) {
  const wrap = document.createElement("span");
  wrap.className = "avatar";

  const fallback = () => {
    wrap.replaceChildren(profileIcon());
    wrap.classList.add("avatar-fallback");
  };

  if (player.photo && !failedPhotoUrls.has(player.photo)) {
    const img = document.createElement("img");
    img.src = player.photo;
    img.alt = "";
    img.onerror = () => {
      failedPhotoUrls.add(player.photo);
      fallback();
    };
    wrap.append(img);
  } else {
    fallback();
  }
  return wrap;
}

function profileIcon() {
  const icon = document.createElement("span");
  icon.className = "profile-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = `
    <svg viewBox="0 0 48 48" focusable="false">
      <circle cx="24" cy="18" r="9"></circle>
      <path d="M9 42c2.5-8.5 8-13 15-13s12.5 4.5 15 13"></path>
    </svg>
  `;
  return icon;
}

function renderSlot(button) {
  const id = state.draft[button.dataset.slot];
  const player = playerById(id);
  button.replaceChildren();

  if (!player) {
    button.classList.remove("has-player");
    button.setAttribute("aria-label", "Pick player");
    button.innerHTML = `
      <span class="plus-mark" aria-hidden="true">+</span>
    `;
    return;
  }

  const text = document.createElement("span");
  button.classList.add("has-player");
  button.setAttribute("aria-label", player.name);
  text.className = "slot-player-name";
  text.textContent = firstName(player.name);
  button.append(avatar(player), text);
}

function renderMatchForm() {
  els.slots.forEach(renderSlot);
  els.scoreA.value = state.draft.scoreA;
  els.scoreB.value = state.draft.scoreB;
  updateScoreStatus();
  validateMatch();
  renderMatchGenerator();
}

function activePlayers() {
  return state.players.filter((player) => player.playing);
}

function ensureGeneratorAvailableIds() {
  const activeIds = new Set(activePlayers().map((player) => player.id));
  if (!generatorAvailableIds) {
    generatorAvailableIds = new Set(activeIds);
    return;
  }

  generatorAvailableIds = new Set([...generatorAvailableIds].filter((id) => activeIds.has(id)));
}

function renderMatchGenerator() {
  ensureGeneratorAvailableIds();
  const availablePlayers = activePlayers();
  const selectedCount = generatorAvailableIds.size;
  const neededPlayers = generatorGameCount * 4;

  els.generateOneGame.classList.toggle("is-active", generatorGameCount === 1);
  els.generateTwoGames.classList.toggle("is-active", generatorGameCount === 2);
  els.availableCount.textContent = `${selectedCount}/${availablePlayers.length} available`;
  els.generatorNote.textContent = selectedCount >= neededPlayers
    ? `${neededPlayers} players needed for ${generatorGameCount === 1 ? "1 court" : "2 courts"}.`
    : `Select ${neededPlayers - selectedCount} more for ${generatorGameCount === 1 ? "1 court" : "2 courts"}.`;
  els.generateRandomMatch.disabled = selectedCount < neededPlayers;

  els.availablePlayerGrid.replaceChildren(...availablePlayers.map((player) => {
    const button = document.createElement("button");
    const isSelected = generatorAvailableIds.has(player.id);
    button.className = "available-player-card";
    button.classList.toggle("is-selected", isSelected);
    button.type = "button";
    button.setAttribute("aria-pressed", String(isSelected));

    const name = document.createElement("span");
    name.textContent = firstName(player.name);
    button.append(avatar(player), name);
    button.addEventListener("click", () => toggleGeneratorPlayer(player.id));
    return button;
  }));

  renderGeneratedMatches();
}

function toggleGeneratorPlayer(playerId) {
  ensureGeneratorAvailableIds();
  if (generatorAvailableIds.has(playerId)) {
    generatorAvailableIds.delete(playerId);
  } else {
    generatorAvailableIds.add(playerId);
  }
  generatedMatchSuggestions = [];
  renderMatchGenerator();
}

function setGeneratorGameCount(count) {
  generatorGameCount = count;
  generatedMatchSuggestions = [];
  renderMatchGenerator();
}

function renderGeneratedMatches() {
  els.generatedMatches.replaceChildren();

  if (!generatedMatchSuggestions.length) {
    const empty = document.createElement("p");
    empty.className = "generator-empty";
    empty.textContent = "Generate when the next players are ready.";
    els.generatedMatches.append(empty);
    return;
  }

  generatedMatchSuggestions.forEach((suggestion, index) => {
    const card = document.createElement("article");
    card.className = "generated-match-card";
    const historyText = suggestion.historyCount === 0
      ? "Brand new game"
      : `Played ${suggestion.historyCount} time${suggestion.historyCount === 1 ? "" : "s"} before`;

    const topline = document.createElement("div");
    topline.className = "generated-match-topline";
    const court = document.createElement("span");
    court.textContent = `Court ${index + 1}`;
    const history = document.createElement("strong");
    history.textContent = historyText;
    topline.append(court, history);

    const teams = document.createElement("div");
    teams.className = "generated-teams";
    const versus = document.createElement("div");
    versus.className = "generated-versus";
    versus.textContent = "VS";
    teams.append(generatedTeamBlock("Team A", suggestion.teamA), versus, generatedTeamBlock("Team B", suggestion.teamB));

    const useButton = document.createElement("button");
    useButton.className = "ghost-button compact";
    useButton.type = "button";
    useButton.dataset.suggestion = String(index);
    useButton.textContent = "Use this match";
    useButton.addEventListener("click", () => useGeneratedMatch(index));

    const actions = document.createElement("div");
    actions.className = "generated-actions";
    actions.append(useButton);

    if (generatedMatchSuggestions.length === 2) {
      const regenerateButton = document.createElement("button");
      regenerateButton.className = "ghost-button compact";
      regenerateButton.type = "button";
      regenerateButton.textContent = "Regenerate this court";
      regenerateButton.addEventListener("click", () => regenerateGeneratedCourt(index));

      actions.append(regenerateButton);
    }

    card.append(topline, teams, actions);
    els.generatedMatches.append(card);
  });
}

function generatedTeamBlock(label, team) {
  const block = document.createElement("div");
  block.className = "generated-team";

  const title = document.createElement("small");
  title.textContent = label;

  const players = document.createElement("div");
  players.className = "generated-player-row";
  team.forEach((id) => {
    const player = playerById(id);
    const playerCard = document.createElement("span");
    playerCard.className = "generated-player-card";
    if (player) {
      const name = document.createElement("strong");
      name.textContent = firstName(player.name);
      playerCard.append(avatar(player), name);
    } else {
      playerCard.textContent = "Unknown";
    }
    players.append(playerCard);
  });

  const pairHistory = document.createElement("span");
  pairHistory.className = "generated-pair-history";
  pairHistory.textContent = pairHistoryLabel(team);

  block.append(title, players, pairHistory);
  return block;
}

function generateRandomMatches() {
  ensureGeneratorAvailableIds();
  const availableIds = [...generatorAvailableIds];
  const neededPlayers = generatorGameCount * 4;

  if (availableIds.length < neededPlayers) {
    toast(`Need ${neededPlayers} available players`);
    return;
  }

  const selectedIds = choosePlayersForGeneratedMatches(availableIds, neededPlayers);
  generatedMatchSuggestions = [];
  const remainingIds = selectedIds.slice();

  for (let court = 0; court < generatorGameCount; court += 1) {
    const courtIds = remainingIds.splice(0, 4);
    generatedMatchSuggestions.push(bestRandomMatchForPlayers(courtIds));
  }

  renderGeneratedMatches();
}

function regenerateGeneratedCourt(index) {
  if (!generatedMatchSuggestions[index]) return;

  ensureGeneratorAvailableIds();
  const usedByOtherCourts = new Set(generatedMatchSuggestions
    .filter((_, suggestionIndex) => suggestionIndex !== index)
    .flatMap((suggestion) => [...suggestion.teamA, ...suggestion.teamB]));
  const candidateIds = [...generatorAvailableIds].filter((id) => !usedByOtherCourts.has(id));

  if (candidateIds.length < 4) {
    toast("Need 4 available players for this court");
    return;
  }

  const currentIds = new Set([...generatedMatchSuggestions[index].teamA, ...generatedMatchSuggestions[index].teamB]);
  const selectedIds = choosePlayersForGeneratedMatches(candidateIds, 4);
  const attempts = [selectedIds];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    attempts.push(choosePlayersForGeneratedMatches(candidateIds, 4));
  }

  const bestAttempt = attempts
    .map((ids) => bestRandomMatchForPlayers(ids))
    .sort((a, b) => {
      const aChanged = generatedPlayerSetChanged(a, currentIds) ? 0 : 1;
      const bChanged = generatedPlayerSetChanged(b, currentIds) ? 0 : 1;
      return a.historyCount - b.historyCount || aChanged - bChanged || Math.random() - 0.5;
    })[0];

  generatedMatchSuggestions[index] = bestAttempt;
  renderGeneratedMatches();
}

function generatedPlayerSetChanged(suggestion, previousIds) {
  return [...suggestion.teamA, ...suggestion.teamB].some((id) => !previousIds.has(id));
}

function choosePlayersForGeneratedMatches(playerIds, neededPlayers) {
  const shuffled = shuffle(playerIds);
  if (playerIds.length <= neededPlayers) return shuffled.slice(0, neededPlayers);

  const gameCounts = new Map();
  state.matches.forEach((match) => {
    [...match.teamA, ...match.teamB].forEach((id) => {
      gameCounts.set(id, (gameCounts.get(id) || 0) + 1);
    });
  });

  return shuffled
    .sort((a, b) => (gameCounts.get(a) || 0) - (gameCounts.get(b) || 0) || Math.random() - 0.5)
    .slice(0, neededPlayers);
}

function bestRandomMatchForPlayers(playerIds) {
  const matchups = possibleMatchups(playerIds);
  const enriched = matchups.map((matchup) => ({
    ...matchup,
    historyCount: matchupHistoryCount(matchup.teamA, matchup.teamB)
  }));
  const lowestCount = Math.min(...enriched.map((matchup) => matchup.historyCount));
  return shuffle(enriched.filter((matchup) => matchup.historyCount === lowestCount))[0];
}

function possibleMatchups(playerIds) {
  const [a, b, c, d] = playerIds;
  return [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] }
  ];
}

function matchupHistoryCount(teamA, teamB) {
  const key = matchupKey(teamA, teamB);
  return state.matches.filter((match) => matchupKey(match.teamA, match.teamB) === key).length;
}

function pairHistoryCount(team) {
  const key = pairKey(team);
  return state.matches.filter((match) => pairKey(match.teamA) === key || pairKey(match.teamB) === key).length;
}

function pairHistoryLabel(team) {
  const count = pairHistoryCount(team);
  return count === 0
    ? "Never played together"
    : `Played together ${count} time${count === 1 ? "" : "s"}`;
}

function matchupKey(teamA, teamB) {
  return [pairKey(teamA), pairKey(teamB)].sort().join(" vs ");
}

function pairKey(team) {
  return team.slice().sort().join("|");
}

function useGeneratedMatch(index) {
  const suggestion = generatedMatchSuggestions[index];
  if (!suggestion) return;

  state.draft.a1 = suggestion.teamA[0];
  state.draft.a2 = suggestion.teamA[1];
  state.draft.b1 = suggestion.teamB[0];
  state.draft.b2 = suggestion.teamB[1];
  saveState();
  renderAll();
  showView("match");
  toast(`Court ${index + 1} loaded`);
}

function shuffle(items) {
  return items
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function renderAdminRoster() {
  els.adminPlayerGrid.replaceChildren();
  const playingCount = state.players.filter((player) => player.playing).length;
  els.playingCount.textContent = `${playingCount}/${state.players.length}`;

  state.players.forEach((player) => {
    const card = document.createElement("button");
    card.className = "admin-player-card";
    card.classList.toggle("is-not-playing", !player.playing);
    card.type = "button";
    card.setAttribute("aria-pressed", String(player.playing));

    const details = document.createElement("div");
    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = firstName(player.name);
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = player.playing ? "Active" : "Inactive";
    details.append(name, meta);

    const toggle = document.createElement("span");
    toggle.className = "playing-toggle";
    toggle.textContent = player.playing ? "Playing" : "Not playing";

    card.append(avatar(player), details, toggle);
    card.addEventListener("click", () => togglePlayerPlaying(player.id));
    els.adminPlayerGrid.append(card);
  });
}

function togglePlayerPlaying(playerId) {
  const player = playerById(playerId);
  if (!player) return;

  player.playing = !player.playing;
  if (!player.playing) {
    Object.keys(state.draft).forEach((slot) => {
      if (state.draft[slot] === playerId) state.draft[slot] = "";
    });
  }

  savePlayersSharedState();
  renderAll();
}

function renderPicker() {
  const used = new Set(["a1", "a2", "b1", "b2"].filter((slot) => slot !== selectedSlot).map((slot) => state.draft[slot]));
  els.pickerGrid.replaceChildren();
  const availablePlayers = state.players.filter((player) => player.playing);

  if (!availablePlayers.length) {
    const empty = document.createElement("p");
    empty.className = "picker-empty";
    empty.textContent = "No active players. Open admin and mark who is playing.";
    els.pickerGrid.append(empty);
    return;
  }

  availablePlayers.forEach((player) => {
    const button = document.createElement("button");
    button.className = "picker-card";
    button.type = "button";
    button.disabled = used.has(player.id);

    const details = document.createElement("span");
    const name = document.createElement("span");
    name.className = "picker-name";
    name.textContent = firstName(player.name);
    const meta = document.createElement("span");
    meta.className = "picker-state";
    meta.textContent = button.disabled ? "Selected" : "";
    details.append(name, meta);

    button.append(avatar(player), details);
    button.addEventListener("click", () => {
      state.draft[selectedSlot] = player.id;
      saveState();
      els.picker.close();
      renderAll();
    });
    els.pickerGrid.append(button);
  });
}

function renderMatches() {
  els.matchList.replaceChildren();
  els.matchCount.textContent = state.matches.length;
  els.historyList.replaceChildren();
  els.historyCount.textContent = state.matches.length;

  if (!state.matches.length) {
    els.matchList.append(emptyMatchItem("No matches yet."));
    els.historyList.append(emptyMatchItem("No games saved yet."));
    return;
  }

  const orderedMatches = state.matches.slice().reverse();
  orderedMatches.slice(0, 10).forEach((match) => {
    els.matchList.append(matchItem(match));
  });
  orderedMatches.forEach((match, index) => {
    els.historyList.append(historyItem(match, state.matches.length - index));
  });
}

function emptyMatchItem(message) {
  const empty = document.createElement("li");
  empty.className = "match-item";
  empty.textContent = message;
  return empty;
}

function matchItem(match) {
  const item = document.createElement("li");
  item.className = "match-item";

  const score = document.createElement("div");
  score.className = "match-score";
  score.innerHTML = `<span>${match.scoreA}</span><span>${match.scoreB}</span>`;

  const players = document.createElement("div");
  players.className = "match-players";
  players.textContent = matchLabel(match);

  item.append(score, players);
  return item;
}

function historyItem(match, gameNumber) {
  const item = document.createElement("li");
  item.className = "history-item";
  const button = document.createElement("button");
  button.className = "history-row";
  button.type = "button";
  button.innerHTML = `
    <span class="history-game-number">#${gameNumber}</span>
    <span class="history-matchup">${matchLabel(match)}</span>
    <span class="history-row-score">${match.scoreA}-${match.scoreB}</span>
    <span class="history-row-winner">${matchWinnerLabel(match)}</span>
  `;
  button.addEventListener("click", () => openGameDetail(match, gameNumber));
  item.append(button);
  return item;
}

function matchWinnerLabel(match) {
  if (match.scoreA === match.scoreB) return "Draw";
  return match.scoreA > match.scoreB ? `${teamLabel(match.teamA)} won` : `${teamLabel(match.teamB)} won`;
}

function openGameDetail(match, gameNumber) {
  els.gameDetailTitle.textContent = `Game ${gameNumber}`;
  els.gameDetailBody.innerHTML = `
    <dl>
      <div>
        <dt>Submitted</dt>
        <dd>${formatDateTime(match.createdAt)}</dd>
      </div>
      <div>
        <dt>Team A</dt>
        <dd>${teamLabel(match.teamA)}</dd>
      </div>
      <div>
        <dt>Team B</dt>
        <dd>${teamLabel(match.teamB)}</dd>
      </div>
      <div>
        <dt>Score</dt>
        <dd>${match.scoreA}-${match.scoreB}</dd>
      </div>
      <div>
        <dt>Result</dt>
        <dd>${matchWinnerLabel(match)}</dd>
      </div>
    </dl>
  `;
  els.gameDetail.showModal();
}

function matchLabel(match) {
  return `${teamLabel(match.teamA)} vs ${teamLabel(match.teamB)}`;
}

function teamLabel(team) {
  return `${playerName(team[0])} & ${playerName(team[1])}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function updateScoreStatus() {
  const scoreA = numberOrNull(state.draft.scoreA);
  const scoreB = numberOrNull(state.draft.scoreB);

  if (scoreA === null && scoreB === null) {
    els.scoreStatus.textContent = "Enter one score and the other side completes to 32.";
    return;
  }

  if (scoreA !== null && scoreB !== null && scoreA + scoreB !== 32) {
    els.scoreStatus.textContent = `Scores must add up to 32. Current total: ${scoreA + scoreB}.`;
    return;
  }

  els.scoreStatus.textContent = "Ready when all four players are selected.";
}

function validateMatch() {
  const picks = ["a1", "a2", "b1", "b2"].map((slot) => state.draft[slot]);
  const uniquePicks = new Set(picks.filter(Boolean));
  const scoreA = numberOrNull(state.draft.scoreA);
  const scoreB = numberOrNull(state.draft.scoreB);
  const validScores = scoreA !== null && scoreB !== null && scoreA >= 0 && scoreB >= 0 && scoreA + scoreB === 32;
  els.saveMatch.disabled = !(uniquePicks.size === 4 && validScores);
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function setScore(side, rawValue) {
  const value = rawValue === "" ? "" : Math.max(0, Math.min(32, Number.parseInt(rawValue, 10) || 0));
  const other = value === "" ? "" : 32 - value;

  if (side === "a") {
    state.draft.scoreA = value;
    state.draft.scoreB = other;
  } else {
    state.draft.scoreB = value;
    state.draft.scoreA = other;
  }

  saveState();
  renderMatchForm();
}

function applyPreset(score) {
  setScore("a", score);
}

function flipScore() {
  const scoreA = state.draft.scoreA;
  state.draft.scoreA = state.draft.scoreB;
  state.draft.scoreB = scoreA;
  saveState();
  renderMatchForm();
}

function saveMatch() {
  const match = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    teamA: [state.draft.a1, state.draft.a2],
    teamB: [state.draft.b1, state.draft.b2],
    scoreA: Number(state.draft.scoreA),
    scoreB: Number(state.draft.scoreB)
  };

  state.matches.push(match);
  state.draft = emptyDraft();
  pendingMatchIds.add(match.id);
  saveState();
  saveMatchRemote(match);
  renderAll();
  toast("Match saved");
}

function stats() {
  const playerStats = new Map();
  state.players.forEach((player) => {
    playerStats.set(player.id, {
      id: player.id,
      name: player.name,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      diff: 0,
      closeGames: 0,
      closeWins: 0,
      blowoutWins: 0,
      partnerIds: new Set(),
      opponentIds: new Set()
    });
  });

  const pairStats = new Map();
  const summary = {
    games: state.matches.length,
    closeGames: 0,
    draws: 0,
    decisiveGames: 0,
    totalMargin: 0,
    totalPoints: 0,
    biggestWin: null,
    closestGame: null
  };

  state.matches.forEach((match) => {
    const margin = Math.abs(match.scoreA - match.scoreB);
    summary.totalMargin += margin;
    summary.totalPoints += match.scoreA + match.scoreB;
    if (margin <= 4) summary.closeGames += 1;
    if (margin === 0) summary.draws += 1;
    if (margin >= 10) summary.decisiveGames += 1;
    if (!summary.biggestWin || margin > summary.biggestWin.margin) {
      summary.biggestWin = { match, margin };
    }
    if (!summary.closestGame || margin < summary.closestGame.margin) {
      summary.closestGame = { match, margin };
    }

    applyTeamStats(match.teamA, match.teamB, match.scoreA, match.scoreB);
    applyTeamStats(match.teamB, match.teamA, match.scoreB, match.scoreA);
    applyPairStats(match.teamA, match.scoreA, match.scoreB, margin);
    applyPairStats(match.teamB, match.scoreB, match.scoreA, margin);
  });

  function applyTeamStats(team, opponents, pointsFor, pointsAgainst) {
    const margin = Math.abs(pointsFor - pointsAgainst);
    const isClose = margin <= 4;
    const isBlowout = margin >= 10;
    team.forEach((id) => {
      const row = playerStats.get(id);
      if (!row) return;
      row.games += 1;
      row.pointsFor += pointsFor;
      row.pointsAgainst += pointsAgainst;
      row.diff += pointsFor - pointsAgainst;
      if (pointsFor > pointsAgainst) row.wins += 1;
      if (pointsFor === pointsAgainst) row.draws += 1;
      if (pointsFor < pointsAgainst) row.losses += 1;
      if (isClose) row.closeGames += 1;
      if (isClose && pointsFor > pointsAgainst) row.closeWins += 1;
      if (isBlowout && pointsFor > pointsAgainst) row.blowoutWins += 1;
      team.filter((partnerId) => partnerId !== id).forEach((partnerId) => row.partnerIds.add(partnerId));
      opponents.forEach((opponentId) => row.opponentIds.add(opponentId));
    });
  }

  function applyPairStats(team, pointsFor, pointsAgainst, margin) {
    const key = team.slice().sort().join("|");
    if (!pairStats.has(key)) {
      pairStats.set(key, {
        ids: team.slice(),
        names: team.map(playerName).join(" & "),
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        diff: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        closeGames: 0,
        closeWins: 0
      });
    }
    const row = pairStats.get(key);
    row.games += 1;
    row.pointsFor += pointsFor;
    row.pointsAgainst += pointsAgainst;
    row.diff += pointsFor - pointsAgainst;
    if (pointsFor > pointsAgainst) row.wins += 1;
    if (pointsFor === pointsAgainst) row.draws += 1;
    if (pointsFor < pointsAgainst) row.losses += 1;
    if (margin <= 4) row.closeGames += 1;
    if (margin <= 4 && pointsFor > pointsAgainst) row.closeWins += 1;
  }

  const rankedPlayers = [...playerStats.values()].map((player) => ({
    ...player,
    winRate: player.games ? player.wins / player.games : 0,
    avgDiff: player.games ? player.diff / player.games : 0,
    uniquePartners: player.partnerIds.size,
    uniqueOpponents: player.opponentIds.size
  })).sort((a, b) => {
    return b.diff - a.diff || b.wins - a.wins || b.pointsFor - a.pointsFor || a.name.localeCompare(b.name);
  });
  const rankedPairs = [...pairStats.values()].map((pair) => ({
    ...pair,
    winRate: pair.games ? pair.wins / pair.games : 0,
    avgDiff: pair.games ? pair.diff / pair.games : 0
  })).sort((a, b) => {
    return b.diff - a.diff || b.wins - a.wins || b.pointsFor - a.pointsFor || a.names.localeCompare(b.names);
  });

  summary.avgMargin = summary.games ? summary.totalMargin / summary.games : 0;
  summary.avgPoints = summary.games ? summary.totalPoints / summary.games : 0;

  return { rankedPlayers, rankedPairs, summary };
}

function renderAdmin() {
  const { rankedPlayers, rankedPairs, summary } = stats();
  const winner = rankedPlayers.find((player) => player.games > 0);
  const anchor = rankedPlayers.slice().reverse().find((player) => player.games > 0);
  const mostGames = rankedPlayers.slice().sort((a, b) => b.games - a.games || b.diff - a.diff)[0];
  const bestPair = rankedPairs.find((pair) => pair.games > 0);
  const bestWinRate = rankedPlayers
    .filter((player) => player.games > 0)
    .sort((a, b) => b.winRate - a.winRate || b.diff - a.diff || b.games - a.games)[0];
  const clutchPlayer = rankedPlayers
    .filter((player) => player.closeGames > 0)
    .sort((a, b) => b.closeWins - a.closeWins || b.closeGames - a.closeGames || b.diff - a.diff)[0];
  const socialPlayer = rankedPlayers
    .filter((player) => player.games > 0)
    .sort((a, b) => b.uniquePartners - a.uniquePartners || b.games - a.games || b.diff - a.diff)[0];
  const bestAvgPair = rankedPairs
    .filter((pair) => pair.games > 0)
    .sort((a, b) => b.avgDiff - a.avgDiff || b.winRate - a.winRate)[0];
  const mostClinical = rankedPlayers
    .filter((player) => player.games > 0)
    .sort((a, b) => b.avgDiff - a.avgDiff || b.winRate - a.winRate)[0];
  const steadyHand = rankedPlayers
    .filter((player) => player.games > 0)
    .sort((a, b) => Math.abs(a.avgDiff) - Math.abs(b.avgDiff) || b.games - a.games)[0];

  els.insights.replaceChildren(
    insight("Tournament Pulse", summary.games ? `${summary.games} games` : "No data", summary.games ? `${summary.closeGames} close, ${summary.decisiveGames} decisive, ${formatOneDecimal(summary.avgMargin)} avg margin` : "Save matches first", "Overall tournament shape: close games are decided by 4 points or less; decisive games are 10+ point margins."),
    insight("Leader", winner?.name || "No data", winner ? `${formatDiff(winner.diff)} diff, ${formatPercent(winner.winRate)} wins` : "Save matches first", "Top ranked player by total point difference, then wins and points scored.", { playerIds: winner ? [winner.id] : [] }),
    insight("Hot Hand", bestWinRate?.name || "No data", bestWinRate ? `${recordLabel(bestWinRate)}, ${formatPercent(bestWinRate.winRate)} win rate` : "Save matches first", "Best win rate among players who have played at least one game.", { playerIds: bestWinRate ? [bestWinRate.id] : [] }),
    insight("Best Couple", bestPair?.names || "No data", bestPair ? `${formatDiff(bestPair.diff)} diff over ${bestPair.games} games` : "Save matches first", "Best two-player partnership by total point difference.", { playerIds: bestPair?.ids || [] }),
    insight("Most Clinical", mostClinical?.name || "No data", mostClinical ? `${formatOneDecimal(mostClinical.avgDiff)} avg diff per game` : "Save matches first", "Highest average point margin per game. This rewards efficient wins.", { playerIds: mostClinical ? [mostClinical.id] : [] }),
    insight("Clutch", clutchPlayer?.name || "No close games", clutchPlayer ? `${clutchPlayer.closeWins}/${clutchPlayer.closeGames} close games won` : "Margin of 4 or less", "Best performer in close games, where the final margin is 4 points or less.", { playerIds: clutchPlayer ? [clutchPlayer.id] : [] }),
    insight("Mix Master", socialPlayer?.name || "No data", socialPlayer ? `${socialPlayer.uniquePartners} partners, ${socialPlayer.games} games` : "Save matches first", "Player who has teamed up with the most different partners.", { playerIds: socialPlayer ? [socialPlayer.id] : [] }),
    insight("Best Avg Couple", bestAvgPair?.names || "No data", bestAvgPair ? `${formatOneDecimal(bestAvgPair.avgDiff)} avg diff, ${formatPercent(bestAvgPair.winRate)} wins` : "Save matches first", "Partnership with the best average point difference per game.", { playerIds: bestAvgPair?.ids || [] }),
    insight("Biggest Win", summary.biggestWin ? `${summary.biggestWin.margin} points` : "No data", summary.biggestWin ? matchResultDetail(summary.biggestWin.match) : "Save matches first", "The single largest winning margin in one saved game.", { playerIds: summary.biggestWin ? winningTeam(summary.biggestWin.match) : [] }),
    insight("Steady Hand", steadyHand?.name || "No data", steadyHand ? `${formatOneDecimal(steadyHand.avgDiff)} avg diff, ${steadyHand.games} games` : "Save matches first", "Most balanced player: average point difference closest to zero.", { playerIds: steadyHand ? [steadyHand.id] : [] }),
    insight("Most Games", mostGames?.name || "No data", mostGames ? `${mostGames.games} games played` : "Save matches first", "Player who appeared in the most saved games.", { playerIds: mostGames ? [mostGames.id] : [] }),
    insight("Anchor", anchor?.name || "No data", anchor ? `${formatDiff(anchor.diff)} diff. Needs a comeback arc.` : "Save matches first", "Lowest ranked player by point difference among players who have played.", { playerIds: anchor ? [anchor.id] : [] })
  );

  els.playerStats.replaceChildren(...rankedPlayers.map((player, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${player.name}</td>
      <td>${player.games}</td>
      <td>${recordLabel(player)}</td>
      <td>${formatPercent(player.winRate)}</td>
      <td>${player.pointsFor}-${player.pointsAgainst}</td>
      <td>${formatOneDecimal(player.avgDiff)}</td>
      <td>${player.uniquePartners}</td>
      <td>${formatDiff(player.diff)}</td>
    `;
    return row;
  }));

  els.pairStats.replaceChildren(...rankedPairs.map((pair) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${pair.names}</td>
      <td>${pair.games}</td>
      <td>${recordLabel(pair)}</td>
      <td>${formatPercent(pair.winRate)}</td>
      <td>${pair.pointsFor}-${pair.pointsAgainst}</td>
      <td>${formatDiff(pair.diff)}</td>
      <td>${formatOneDecimal(pair.avgDiff)}</td>
    `;
    return row;
  }));

  renderAdminMatches();
}

function renderAdminMatches() {
  els.adminMatchList.replaceChildren();
  els.adminMatchCount.textContent = state.matches.length;

  if (!state.matches.length) {
    els.adminMatchList.append(emptyMatchItem("No games to edit yet."));
    return;
  }

  state.matches.slice().reverse().forEach((match, index) => {
    const item = historyItem(match, state.matches.length - index);
    item.classList.add("admin-history-item");

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const edit = document.createElement("button");
    edit.className = "ghost-button";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => openScoreEditor(match.id));

    const remove = document.createElement("button");
    remove.className = "ghost-button danger";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => openDeleteConfirm(match.id));

    actions.append(edit, remove);
    item.append(actions);
    els.adminMatchList.append(item);
  });
}

function insight(label, value, detail, explanation, options = {}) {
  const card = document.createElement("article");
  card.className = "insight-card";

  const header = document.createElement("div");
  header.className = "insight-header";

  const labelNode = document.createElement("div");
  labelNode.className = "insight-label";
  labelNode.textContent = label;

  const avatars = insightAvatars(options.playerIds || []);
  header.append(labelNode);
  if (avatars) header.append(avatars);

  const valueNode = document.createElement("div");
  valueNode.className = "insight-value";
  valueNode.textContent = value;

  const detailNode = document.createElement("div");
  detailNode.className = "insight-detail";
  detailNode.textContent = detail;

  const explanationNode = document.createElement("div");
  explanationNode.className = "insight-explanation";
  explanationNode.textContent = explanation;

  card.append(header, valueNode, detailNode, explanationNode);
  return card;
}

function insightAvatars(playerIds) {
  const players = playerIds.map(playerById).filter(Boolean);
  if (!players.length) return null;

  const list = document.createElement("div");
  list.className = "insight-avatars";
  players.slice(0, 2).forEach((player) => {
    const item = avatar(player);
    item.classList.add("insight-avatar");
    item.setAttribute("title", player.name);
    list.append(item);
  });
  return list;
}

function formatDiff(value) {
  return value > 0 ? `+${value}` : String(value);
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatOneDecimal(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function recordLabel(row) {
  return `${row.wins}-${row.draws}-${row.losses}`;
}

function scoreLine(match) {
  return `${match.scoreA}-${match.scoreB}`;
}

function winningTeam(match) {
  return match.scoreA >= match.scoreB ? match.teamA : match.teamB;
}

function losingTeam(match) {
  return match.scoreA >= match.scoreB ? match.teamB : match.teamA;
}

function matchResultDetail(match) {
  if (match.scoreA === match.scoreB) {
    return `${teamLabel(match.teamA)} drew ${teamLabel(match.teamB)} ${scoreLine(match)}`;
  }

  return `${teamLabel(winningTeam(match))} beat ${teamLabel(losingTeam(match))} ${scoreLine(match)}`;
}

function openScoreEditor(matchId) {
  const match = state.matches.find((item) => item.id === matchId);
  if (!match) return;

  editingMatchId = matchId;
  els.scoreEditMatch.textContent = matchLabel(match);
  els.editScoreA.value = match.scoreA;
  els.editScoreB.value = match.scoreB;
  updateEditScoreNote();
  els.scoreEditor.showModal();
}

function updateEditScore(side, rawValue) {
  const value = rawValue === "" ? "" : Math.max(0, Math.min(32, Number.parseInt(rawValue, 10) || 0));
  const other = value === "" ? "" : 32 - value;

  if (side === "a") {
    els.editScoreA.value = value;
    els.editScoreB.value = other;
  } else {
    els.editScoreB.value = value;
    els.editScoreA.value = other;
  }

  updateEditScoreNote();
}

function updateEditScoreNote() {
  const scoreA = numberOrNull(els.editScoreA.value);
  const scoreB = numberOrNull(els.editScoreB.value);
  const total = (scoreA || 0) + (scoreB || 0);
  els.editScoreNote.textContent = scoreA !== null && scoreB !== null && total === 32
    ? "Ready to save."
    : `Scores must add up to 32. Current total: ${total}.`;
}

function saveEditedScore() {
  const match = state.matches.find((item) => item.id === editingMatchId);
  const scoreA = numberOrNull(els.editScoreA.value);
  const scoreB = numberOrNull(els.editScoreB.value);

  if (!match || scoreA === null || scoreB === null || scoreA + scoreB !== 32) {
    toast("Scores must add up to 32");
    return;
  }

  match.scoreA = scoreA;
  match.scoreB = scoreB;
  saveState();
  saveMatchRemote(match);
  els.scoreEditor.close();
  editingMatchId = null;
  renderAll();
  toast("Score updated");
}

function openDeleteConfirm(matchId) {
  const match = state.matches.find((item) => item.id === matchId);
  if (!match) return;

  pendingDeleteMatchId = matchId;
  els.deleteConfirmText.textContent = `${matchLabel(match)} (${match.scoreA}-${match.scoreB})`;
  els.deleteConfirm.showModal();
}

function closeDeleteConfirm() {
  pendingDeleteMatchId = null;
  els.deleteConfirm.close();
}

function deletePendingMatch() {
  if (!pendingDeleteMatchId) return;

  const deletedMatchId = pendingDeleteMatchId;
  state.matches = state.matches.filter((item) => item.id !== pendingDeleteMatchId);
  pendingDeleteMatchId = null;
  saveState();
  deleteMatchRemote(deletedMatchId);
  els.deleteConfirm.close();
  renderAll();
  toast("Game deleted");
}

function exportData(format) {
  if (format === "json") {
    download("padel-tournament.json", "application/json", JSON.stringify({
      players: state.players,
      matches: state.matches,
      generatedAt: new Date().toISOString(),
      stats: stats()
    }, null, 2));
    return;
  }

  const rows = [
    ["created_at", "team_a", "team_b", "score_a", "score_b"],
    ...state.matches.map((match) => [
      match.createdAt,
      match.teamA.map(playerName).join(" & "),
      match.teamB.map(playerName).join(" & "),
      match.scoreA,
      match.scoreB
    ])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  download("padel-matches.csv", "text/csv", csv);
}

function download(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 1800);
}

function renderAll() {
  renderMatchForm();
  renderAdminRoster();
  renderMatches();
  renderAdmin();
}

function unlockAdmin() {
  els.adminGate.hidden = true;
  els.adminDashboard.hidden = false;
  els.adminCode.value = "";
  renderAdmin();
}

function showView(viewName) {
  els.tabs.forEach((item) => item.classList.toggle("is-active", item.dataset.view === viewName));
  els.views.forEach((view) => view.classList.toggle("is-active", view.id === `${viewName}-view`));
}

function applyRoute() {
  if (window.location.hash === "#admin") {
    document.body.classList.add("admin-mode");
    showView("admin");
    return;
  }

  document.body.classList.remove("admin-mode");
  const publicActive = [...els.tabs].find((tab) => tab.classList.contains("is-active"));
  showView(publicActive?.dataset.view || "match");
}

function openAdminBackdoor() {
  unlockAdmin();
  if (window.location.hash !== "#admin") {
    window.location.hash = "admin";
  } else {
    applyRoute();
  }
  toast("Admin unlocked");
}

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    showView(tab.dataset.view);
  });
});

els.slots.forEach((slot) => {
  slot.addEventListener("click", () => {
    selectedSlot = slot.dataset.slot;
    els.pickerTitle.textContent = selectedSlot.startsWith("a") ? "Team A" : "Team B";
    renderPicker();
    els.picker.showModal();
  });
});

els.closePicker.addEventListener("click", () => els.picker.close());
els.scoreA.addEventListener("input", (event) => setScore("a", event.target.value));
els.scoreB.addEventListener("input", (event) => setScore("b", event.target.value));
document.querySelectorAll(".score-presets button").forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.score));
});
els.flipScore.addEventListener("click", flipScore);
els.saveMatch.addEventListener("click", saveMatch);
els.generateOneGame.addEventListener("click", () => setGeneratorGameCount(1));
els.generateTwoGames.addEventListener("click", () => setGeneratorGameCount(2));
els.generateRandomMatch.addEventListener("click", generateRandomMatches);

els.unlockForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (els.adminCode.value === ADMIN_CODE) {
    unlockAdmin();
  } else {
    toast("Wrong passcode");
  }
});

let titleTapCount = 0;
let titleTapTimer = null;
els.appTitle.addEventListener("click", () => {
  titleTapCount += 1;
  window.clearTimeout(titleTapTimer);

  if (titleTapCount >= 5) {
    titleTapCount = 0;
    openAdminBackdoor();
    return;
  }

  titleTapTimer = window.setTimeout(() => {
    titleTapCount = 0;
  }, 1200);
});

els.editScoreA.addEventListener("input", (event) => updateEditScore("a", event.target.value));
els.editScoreB.addEventListener("input", (event) => updateEditScore("b", event.target.value));
els.closeScoreEditor.addEventListener("click", () => els.scoreEditor.close());
els.closeGameDetail.addEventListener("click", () => els.gameDetail.close());
els.scoreForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveEditedScore();
});
els.closeDeleteConfirm.addEventListener("click", closeDeleteConfirm);
els.cancelDeleteMatch.addEventListener("click", closeDeleteConfirm);
els.confirmDeleteMatch.addEventListener("click", deletePendingMatch);
els.backPublic.addEventListener("click", () => {
  window.location.hash = "";
  showView("match");
});
els.lockAdmin.addEventListener("click", () => {
  els.adminGate.hidden = false;
  els.adminDashboard.hidden = true;
});
els.exportJson.addEventListener("click", () => exportData("json"));
els.exportCsv.addEventListener("click", () => exportData("csv"));
els.resetMatches.addEventListener("click", () => {
  const matchIds = state.matches.map((match) => match.id);
  state.matches = [];
  state.draft = emptyDraft();
  saveState();
  resetRemoteMatches(matchIds);
  renderAll();
  toast("Matches reset");
});

renderAll();
applyRoute();
initRemoteSync();
window.addEventListener("hashchange", applyRoute);
