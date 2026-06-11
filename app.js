const STORAGE_KEY = "padel-tracker-state-v1";
const ADMIN_CODE = "2468";

const defaultPlayerNames = [
  "איתי",
  "עודד",
  "ניראל",
  "אמרי",
  "בן",
  "סמסון",
  "קובי",
  "פרידמן",
  "אמיר",
  "שחר"
];

const defaultPlayerPhotos = {
  "איתי": "images/itay.png",
  "עודד": "images/oded.png",
  "ניראל": "images/nirel.png",
  "אמרי": "images/imri.png",
  "בן": "images/ben.png",
  "סמסון": "images/samson.jpg",
  "קובי": "images/kobi.png",
  "פרידמן": "images/fridman.jpg",
  "אמיר": "images/amir.jpg",
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

const els = {
  appTitle: document.querySelector("#app-title"),
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  slots: document.querySelectorAll(".player-slot"),
  scoreA: document.querySelector("#score-a"),
  scoreB: document.querySelector("#score-b"),
  scoreStatus: document.querySelector("#score-status"),
  saveMatch: document.querySelector("#save-match"),
  flipScore: document.querySelector("#flip-score"),
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
    return {
      players: defaultPlayers,
      matches: [],
      draft: emptyDraft()
    };
  }

  try {
    const parsed = JSON.parse(saved);
    const savedPlayers = Array.isArray(parsed.players) ? parsed.players : [];
    const savedMatches = Array.isArray(parsed.matches) ? parsed.matches : [];
    const isLegacyRoster = savedPlayers.length === legacySampleNames.length
      && savedPlayers.every((player, index) => player.name === legacySampleNames[index]);

    return {
      players: isLegacyRoster && !savedMatches.length ? defaultPlayers : savedPlayers.length ? hydrateBundledPhotos(savedPlayers) : defaultPlayers,
      matches: savedMatches,
      draft: parsed.draft || emptyDraft()
    };
  } catch {
    return {
      players: defaultPlayers,
      matches: [],
      draft: emptyDraft()
    };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function hydrateBundledPhotos(players) {
  return players.map((player) => ({
    ...player,
    photo: defaultPlayerPhotos[player.name] || player.photo || "",
    playing: typeof player.playing === "boolean" ? player.playing : true
  }));
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

  if (player.photo) {
    const img = document.createElement("img");
    img.src = player.photo;
    img.alt = "";
    img.onerror = fallback;
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

  saveState();
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
  saveState();
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
      pointsFor: 0,
      pointsAgainst: 0,
      diff: 0
    });
  });

  const pairStats = new Map();

  state.matches.forEach((match) => {
    applyTeamStats(match.teamA, match.scoreA, match.scoreB);
    applyTeamStats(match.teamB, match.scoreB, match.scoreA);
    applyPairStats(match.teamA, match.scoreA, match.scoreB);
    applyPairStats(match.teamB, match.scoreB, match.scoreA);
  });

  function applyTeamStats(team, pointsFor, pointsAgainst) {
    team.forEach((id) => {
      const row = playerStats.get(id);
      if (!row) return;
      row.games += 1;
      row.pointsFor += pointsFor;
      row.pointsAgainst += pointsAgainst;
      row.diff += pointsFor - pointsAgainst;
      if (pointsFor > pointsAgainst) row.wins += 1;
      if (pointsFor === pointsAgainst) row.draws += 1;
    });
  }

  function applyPairStats(team, pointsFor, pointsAgainst) {
    const key = team.slice().sort().join("|");
    if (!pairStats.has(key)) {
      pairStats.set(key, {
        ids: team.slice(),
        names: team.map(playerName).join(" & "),
        games: 0,
        wins: 0,
        draws: 0,
        diff: 0,
        pointsFor: 0
      });
    }
    const row = pairStats.get(key);
    row.games += 1;
    row.pointsFor += pointsFor;
    row.diff += pointsFor - pointsAgainst;
    if (pointsFor > pointsAgainst) row.wins += 1;
    if (pointsFor === pointsAgainst) row.draws += 1;
  }

  const rankedPlayers = [...playerStats.values()].sort((a, b) => {
    return b.diff - a.diff || b.wins - a.wins || b.pointsFor - a.pointsFor || a.name.localeCompare(b.name);
  });
  const rankedPairs = [...pairStats.values()].sort((a, b) => {
    return b.diff - a.diff || b.wins - a.wins || b.pointsFor - a.pointsFor || a.names.localeCompare(b.names);
  });

  return { rankedPlayers, rankedPairs };
}

function renderAdmin() {
  const { rankedPlayers, rankedPairs } = stats();
  const winner = rankedPlayers.find((player) => player.games > 0);
  const anchor = rankedPlayers.slice().reverse().find((player) => player.games > 0);
  const mostGames = rankedPlayers.slice().sort((a, b) => b.games - a.games || b.diff - a.diff)[0];
  const bestPair = rankedPairs.find((pair) => pair.games > 0);

  els.insights.replaceChildren(
    insight("Winner", winner?.name || "No data", winner ? `+${winner.diff} diff, ${winner.wins} wins` : "Save matches first"),
    insight("Best Couple", bestPair?.names || "No data", bestPair ? `+${bestPair.diff} diff over ${bestPair.games} games` : "Save matches first"),
    insight("Most Games", mostGames?.name || "No data", mostGames ? `${mostGames.games} games played` : "Save matches first"),
    insight("Anchor", anchor?.name || "No data", anchor ? `${anchor.diff} diff. Someone buy him coffee.` : "Save matches first")
  );

  els.playerStats.replaceChildren(...rankedPlayers.map((player, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${player.name}</td>
      <td>${player.games}</td>
      <td>${player.wins}</td>
      <td>${player.pointsFor}-${player.pointsAgainst}</td>
      <td>${formatDiff(player.diff)}</td>
    `;
    return row;
  }));

  els.pairStats.replaceChildren(...rankedPairs.map((pair) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${pair.names}</td>
      <td>${pair.games}</td>
      <td>${pair.wins}</td>
      <td>${formatDiff(pair.diff)}</td>
      <td>${(pair.diff / pair.games).toFixed(1)}</td>
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

function insight(label, value, detail) {
  const card = document.createElement("article");
  card.className = "insight-card";
  card.innerHTML = `
    <div class="insight-label">${label}</div>
    <div class="insight-value">${value}</div>
    <div class="insight-detail">${detail}</div>
  `;
  return card;
}

function formatDiff(value) {
  return value > 0 ? `+${value}` : String(value);
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

  state.matches = state.matches.filter((item) => item.id !== pendingDeleteMatchId);
  pendingDeleteMatchId = null;
  saveState();
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
  state.matches = [];
  state.draft = emptyDraft();
  saveState();
  renderAll();
  toast("Matches reset");
});

renderAll();
applyRoute();
window.addEventListener("hashchange", applyRoute);
