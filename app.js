"use strict";

/* ============================================================
   HARD WORKERS' ARCADE — app logic
   Tasks are plushies in a claw machine. Play the machine to
   grab your next task. Finish tasks for coins + tickets.
   ============================================================ */

/* ---------- storage ---------- */

const STORE_KEY = "hwa_state_v1";       // legacy key, migrated into the first account
const ACCOUNTS_KEY = "hwa_accounts_v1";
const SESSION_KEY = "hwa_session_v1";
const stateKey = (id) => "hwa_state_" + id;

const defaultState = () => ({
  tasks: [],            // { id, name, stars, status: 'todo'|'picked'|'done', createdAt, completedAt }
  coins: 5,
  tickets: 0,
  streak: 0,
  lastDoneDate: null,
  prizes: [],           // claimed prize ids
  pickedId: null,
  runner: { snow: 0, desert: 0, volcano: 0 }, // completed levels per Runner chapter
});

let accounts = loadAccounts(); // [{ id, username, avatar, createdAt, equippedFrame, frames[], checkIn{} }]
let currentAccount = null;      // the logged-in player
let state = null;               // game state of the logged-in player

function loadAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveAccounts() {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (e) {
    /* storage full or unavailable — keep running in memory */
  }
}

function loadSession() {
  try {
    return localStorage.getItem(SESSION_KEY) || null;
  } catch (e) {
    return null;
  }
}

function saveSession(id) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

function loadState(id) {
  try {
    const raw = localStorage.getItem(stateKey(id));
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    const st = Object.assign(defaultState(), s);
    if (!Array.isArray(st.tasks)) st.tasks = [];
    st.tasks = st.tasks.filter((t) => t && t.id && t.name);
    if (!Array.isArray(st.prizes)) st.prizes = [];
    if (!st.runner || typeof st.runner !== "object") st.runner = {};
    for (const c of ["snow", "desert", "volcano"]) if (typeof st.runner[c] !== "number") st.runner[c] = 0;
    if (st.pickedId && !st.tasks.some((t) => t.id === st.pickedId)) st.pickedId = null;
    return st;
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  if (!currentAccount) return;
  try {
    localStorage.setItem(stateKey(currentAccount.id), JSON.stringify(state));
  } catch (e) {
    /* storage full or unavailable — keep running in memory */
  }
}

/* one-time migration: pre-account data moves into the first account created */
function migrateLegacy(accountId) {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    localStorage.setItem(stateKey(accountId), raw);
    localStorage.removeItem(STORE_KEY);
  } catch (e) {}
}

/* ---------- helpers ---------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function hashStr(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const PLUSH_EMOJIS = ["🧸", "🐻", "🐰", "🐼", "🦊", "🐷", "🐸", "🦄", "🐙", "🐥", "🐹", "🦁", "🐨", "🐯"];
const PLUSH_COLORS = ["#ff8fb3", "#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#22d3ee", "#f472b6", "#a3e635", "#fb923c"];
const plushEmoji = (task) => PLUSH_EMOJIS[hashStr(task.id) % PLUSH_EMOJIS.length];

/* ---------- accounts & check-in ---------- */

const AVATAR_EMOJIS = ["🐻", "🐰", "🐼", "🦊", "🐷", "🐸", "🦄", "🐙", "🐥", "🐹", "🦁", "🐨", "🐯", "🐵", "🐶", "🐱"];

const FRAMES = [
  { id: "default", name: "Classic Neon", desc: "The starter frame. Everyone gets one.", demo: "🧸", source: "starter" },
  { id: "gold", name: "Golden Legend", desc: "Check in 7 days in a row to unlock.", demo: "⭐", source: "checkin" },
  { id: "pink", name: "Candy Pink", desc: "Sweet, loud and proud.", demo: "🍭", source: "loot" },
  { id: "ice", name: "Ice Crystal", desc: "Cool as the other side of the machine.", demo: "🧊", source: "loot" },
  { id: "toxic", name: "Toxic Green", desc: "Glows in the dark. Probably.", demo: "🧪", source: "loot" },
  { id: "magma", name: "Magma", desc: "Straight from the coin slot.", demo: "🌋", source: "loot" },
  { id: "prism", name: "Prism Rainbow", desc: "All the colors, none of the physics.", demo: "🌈", source: "loot" },
  { id: "cyber", name: "Cyber Grid", desc: "Dashed dreams in neon.", demo: "🕹️", source: "loot" },
  { id: "nightmare", name: "Nightmare", desc: "For 3 AM task sessions.", demo: "👻", source: "loot" },
  { id: "chrome", name: "Chrome", desc: "Shiny. Untouchable.", demo: "🥇", source: "loot" },
  { id: "snow", name: "Snow Summit", desc: "Clear the Snow Mountain chapter in the Runner.", demo: "❄️", source: "runner" },
  { id: "desert", name: "Desert Storm", desc: "Clear the Scorching Desert chapter in the Runner.", demo: "🏜️", source: "runner" },
  { id: "volcano", name: "Volcano Ace", desc: "Clear the Burning Volcano chapter in the Runner.", demo: "🌋", source: "runner" },
];

const TAGS = [
  { id: "classic", name: "Classic White", desc: "The starter tag. Crisp and clean.", demo: "⬜", source: "starter" },
  { id: "gold", name: "Gold Glow", desc: "Midas would be proud.", demo: "✨", source: "loot" },
  { id: "pink", name: "Pink Pop", desc: "Bubblegum energy.", demo: "🩷", source: "loot" },
  { id: "ice", name: "Ice Blue", desc: "Cold. Frozen. Unstoppable.", demo: "❄️", source: "loot" },
  { id: "fire", name: "Fire Red", desc: "For hot streaks only.", demo: "🔥", source: "loot" },
  { id: "toxic", name: "Toxic Purple", desc: "Caution: high productivity.", demo: "☣️", source: "loot" },
  { id: "rainbow", name: "Rainbow Text", desc: "The rarest tag in the machine.", demo: "🌈", source: "loot" },
];

/* what the Prize Claw stocks — always visible, grab the one you aim at */
const MACHINE_STOCK = [
  ...FRAMES.filter((f) => f.source === "loot").map((f) => ({ kind: "frame", id: f.id, name: f.name, demo: f.demo })),
  ...TAGS.filter((t) => t.source === "loot").map((t) => ({ kind: "tag", id: t.id, name: t.name })),
];

let selectedAvatar = AVATAR_EMOJIS[0];

function avatarHtml(acc, size) {
  const f = acc.equippedFrame;
  const cls = f && f !== "default" ? "frame-" + f : "";
  return `<div class="avatar ${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.52)}px"><div class="avatar-inner">${acc.avatar}</div></div>`;
}

function renderAvatarPicker() {
  const wrap = $("#avatar-picker");
  wrap.innerHTML = "";
  for (const emoji of AVATAR_EMOJIS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "av-btn" + (emoji === selectedAvatar ? " on" : "");
    b.textContent = emoji;
    b.addEventListener("click", () => {
      selectedAvatar = emoji;
      renderAvatarPicker();
    });
    wrap.appendChild(b);
  }
}

function showAccountScreen() {
  currentAccount = null;
  state = null;
  $("#account-screen").classList.remove("hidden");
  renderAccountScreen();
}

function hideAccountScreen() {
  $("#account-screen").classList.add("hidden");
}

function renderAccountScreen() {
  const grid = $("#acc-list");
  grid.innerHTML = "";
  $("#acc-empty").classList.toggle("hidden", accounts.length > 0);
  for (const a of accounts) {
    const ci = a.checkIn || { streak: 0, total: 0 };
    const equippedTag = a.equippedTag || "classic";
    const card = document.createElement("div");
    card.className = "acc-card";
    card.innerHTML = `
      ${avatarHtml(a, 64)}
      <div class="acc-name tag-${equippedTag}">${esc(a.username)}</div>
      <div class="acc-meta">🔥 ${ci.streak} day streak · ${ci.total} check-ins</div>`;
    card.addEventListener("click", () => selectAccount(a.id));
    const del = document.createElement("button");
    del.className = "acc-del";
    del.textContent = "✕";
    del.title = "Delete player";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteAccount(a.id);
    });
    card.appendChild(del);
    grid.appendChild(card);
  }
}

function createAccount() {
  const name = $("#acc-name").value.trim();
  if (!name) {
    toast("Pick a name first!");
    playSound.fail();
    return;
  }
  if (name.length > 16) {
    toast("Name too long — max 16 characters.");
    playSound.fail();
    return;
  }
  if (accounts.some((a) => a.username.toLowerCase() === name.toLowerCase())) {
    toast("That name is already taken!");
    playSound.fail();
    return;
  }
  const acc = {
    id: uid(),
    username: name,
    avatar: selectedAvatar,
    createdAt: Date.now(),
    equippedFrame: "default",
    frames: ["default"],
    equippedTag: "classic",
    tags: ["classic"],
    checkIn: { lastDate: null, streak: 0, total: 0, history: [] },
  };
  accounts.push(acc);
  saveAccounts();
  if (accounts.length === 1) migrateLegacy(acc.id);
  selectAccount(acc.id);
  toast(`👋 Welcome, ${name}!`);
}

function selectAccount(id) {
  const acc = accounts.find((a) => a.id === id);
  if (!acc) return;
  currentAccount = acc;
  state = loadState(acc.id);
  saveSession(acc.id);
  hideAccountScreen();
  renderAll();
  switchView("tasks");
  log(`👋 Player "${acc.username}" plugged in.`);
}

function deleteAccount(id) {
  const acc = accounts.find((a) => a.id === id);
  if (!acc) return;
  if (!confirm(`Delete player "${acc.username}"? All their tasks and progress will be gone forever.`)) return;
  accounts = accounts.filter((a) => a.id !== id);
  try {
    localStorage.removeItem(stateKey(id));
  } catch (e) {}
  saveAccounts();
  if (currentAccount && currentAccount.id === id) {
    saveSession(null);
    showAccountScreen();
  } else {
    renderAccountScreen();
  }
}

function logout() {
  saveSession(null);
  if (runnerState === "running" || r) {
    cancelAnimationFrame(rRaf);
    runnerState = "idle";
    r = null;
  }
  showAccountScreen();
}

/* ---------- daily check-in ---------- */

function doCheckIn() {
  if (!currentAccount || !state) return;
  const ci = currentAccount.checkIn;
  const today = todayStr();
  if (ci.lastDate === today) {
    toast("Already checked in today! Come back tomorrow. ⏰");
    return;
  }

  ci.streak = ci.lastDate === yesterdayStr() ? ci.streak + 1 : 1;
  ci.lastDate = today;
  ci.total++;
  ci.history.push(today);
  if (ci.history.length > 90) ci.history = ci.history.slice(-90);

  state.coins += 2; // daily bonus — feeds the machine
  let unlocked = false;
  if (ci.streak >= 7 && !currentAccount.frames.includes("gold")) {
    currentAccount.frames.push("gold");
    currentAccount.equippedFrame = "gold";
    unlocked = true;
  }
  saveAccounts();
  saveState();
  renderAll();
  if (unlocked) {
    confetti(160);
    playSound.fanfare();
    toast("⭐ 7-day streak! GOLDEN LEGEND avatar frame unlocked!");
    log(`⭐ ${currentAccount.username} unlocked the Golden Legend frame!`);
  } else {
    confetti(50);
    playSound.win();
    toast(`✅ Checked in! +2 coins · 🔥 ${ci.streak}-day streak`);
  }
}

function equipFrame(frameId) {
  if (!currentAccount || !currentAccount.frames.includes(frameId)) return;
  currentAccount.equippedFrame = frameId;
  saveAccounts();
  renderAll();
  playSound.coin();
  const f = FRAMES.find((x) => x.id === frameId);
  toast(f ? `${f.name} frame equipped!` : "Frame equipped!");
}

function equipTag(tagId) {
  if (!currentAccount || !currentAccount.tags.includes(tagId)) return;
  currentAccount.equippedTag = tagId;
  saveAccounts();
  renderAll();
  playSound.coin();
  const f = TAGS.find((x) => x.id === tagId);
  toast(f ? `${f.name} tag equipped!` : "Tag equipped!");
}

/* ---------- profile ---------- */

function renderPlayerChip() {
  const chip = $("#player-chip");
  if (!currentAccount) {
    chip.classList.add("hidden");
    return;
  }
  chip.classList.remove("hidden");
  $("#chip-avatar").innerHTML = avatarHtml(currentAccount, 40);
  $("#chip-name").textContent = currentAccount.username;
  $("#chip-name").className = "chip-name tag-" + (currentAccount.equippedTag || "classic");
}

function renderProfile() {
  if (!currentAccount) return;
  const a = currentAccount;
  const ci = a.checkIn;
  const today = todayStr();

  $("#pf-avatar-wrap").innerHTML = avatarHtml(a, 96);
  $("#pf-name").textContent = a.username;
  $("#pf-name").className = "pf-name tag-" + (a.equippedTag || "classic");
  $("#pf-joined").textContent = "Member since " + new Date(a.createdAt).toLocaleDateString();
  $("#pf-streak").textContent = ci.streak;
  $("#pf-total").textContent = ci.total;
  $("#pf-coins").textContent = state ? state.coins : 0;

  // last 7 days strip
  const strip = $("#ci-strip");
  strip.innerHTML = "";
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const checked = ci.history.includes(ds);
    const isToday = i === 0;
    const el = document.createElement("div");
    el.className = "ci-day" + (checked ? " checked" : "") + (isToday ? " today" : "");
    el.textContent = checked ? "✓" : isToday ? "•" : "";
    el.title = ds;
    strip.appendChild(el);
  }

  // progress toward the golden frame
  const goldOwned = a.frames.includes("gold");
  $("#ci-progress").textContent = goldOwned
    ? "⭐ Golden Legend frame unlocked — keep the streak alive!"
    : ci.streak === 0
      ? "Check in today to start your streak! 7 days in a row unlocks the Golden Legend frame."
      : `🔥 ${Math.min(ci.streak, 7)}/7 days — ${7 - ci.streak} more day${7 - ci.streak > 1 ? "s" : ""} until the Golden Legend frame!`;

  // check-in button
  const btn = $("#btn-checkin");
  const doneToday = ci.lastDate === today;
  btn.disabled = doneToday;
  btn.textContent = doneToday ? "✓ Checked in today" : "📅 Check in! (+2 coins)";

  // frame showcase
  const list = $("#frames-list");
  list.innerHTML = "";
  const frames = a.frames || ["default"];
  for (const f of FRAMES) {
    const owned = frames.includes(f.id);
    const equipped = a.equippedFrame === f.id;
    const card = document.createElement("div");
    card.className = "frame-card" + (owned ? " owned" : "") + (equipped ? " equipped" : "") + (owned && !equipped ? " clickable" : "");
    card.innerHTML = `
      <span class="frame-demo">${avatarHtml({ avatar: f.demo, equippedFrame: f.id }, 56)}</span>
      <div class="frame-name">${f.name}</div>
      <div class="frame-desc">${f.desc}</div>
      <span class="frame-tag">${owned ? (equipped ? "✓ EQUIPPED" : "Equip") : f.source === "checkin" ? "🔒 Check in 7 days" : f.source === "loot" ? "🎁 Prize Claw" : f.source === "runner" ? "🏃 Runner chapter" : "🔒 Locked"}</span>`;
    if (owned && !equipped) {
      card.addEventListener("click", () => equipFrame(f.id));
    }
    list.appendChild(card);
  }

  // name tag showcase
  const tlist = $("#tags-list");
  tlist.innerHTML = "";
  const tags = a.tags || ["classic"];
  const equippedTag = a.equippedTag || "classic";
  for (const f of TAGS) {
    const owned = tags.includes(f.id);
    const equipped = equippedTag === f.id;
    const card = document.createElement("div");
    card.className = "frame-card" + (owned ? " owned" : "") + (equipped ? " equipped" : "") + (owned && !equipped ? " clickable" : "");
    card.innerHTML = `
      <span class="tag-demo tag-${f.id}">Aa</span>
      <div class="frame-name">${f.name}</div>
      <div class="frame-desc">${f.desc}</div>
      <span class="frame-tag">${owned ? (equipped ? "✓ EQUIPPED" : "Equip") : f.source === "loot" ? "🎁 Prize Claw" : "🔒 Locked"}</span>`;
    if (owned && !equipped) {
      card.addEventListener("click", () => equipTag(f.id));
    }
    tlist.appendChild(card);
  }
}


/* ---------- views / tabs ---------- */

let currentView = "tasks";

function switchView(view) {
  currentView = view;
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach((s) => s.classList.toggle("active", s.id === "view-" + view));
  if (view === "arcade") requestAnimationFrame(layoutMachine);
}

$$(".tab").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));

/* ---------- render ---------- */

function renderStats() {
  $("#stat-coins").textContent = state.coins;
  $("#stat-tickets").textContent = state.tickets;
  $("#stat-streak").textContent = state.streak;
  $("#stat-done").textContent = state.tasks.filter((t) => t.status === "done").length;
  $("#arcade-coins").textContent = state.coins;
  $("#prize-tickets").textContent = state.tickets;
}

function renderNowPlaying() {
  const card = $("#now-playing");
  const t = state.tasks.find((x) => x.id === state.pickedId);
  if (!t) { card.classList.add("hidden"); return; }
  card.classList.remove("hidden");
  $("#np-emoji").textContent = plushEmoji(t);
  $("#np-name").textContent = `"${t.name}"`;
  $("#np-meta").textContent = (t.stars ? "★".repeat(t.stars) + " · " : "") + "grabbed by the claw — go finish it!";
}

function renderTasks() {
  const ul = $("#task-list");
  ul.innerHTML = "";
  const todos = state.tasks.filter((t) => t.status !== "done").sort((a, b) => a.createdAt - b.createdAt);
  $("#task-count").textContent = todos.length;
  $("#task-list-empty").classList.toggle("hidden", todos.length > 0);
  for (const t of todos) {
    const li = document.createElement("li");
    li.className = "task-row" + (t.status === "picked" ? " picked" : "");
    const badge = t.status === "picked" ? '<span class="badge badge-picked">🎯 NEXT UP</span>' : "";
    li.innerHTML = `
      <button class="btn btn-done" data-action="complete" data-id="${t.id}" title="Mark done">✓</button>
      <div class="task-info">
        <div class="task-name">${esc(t.name)} ${badge}</div>
        <div class="task-stars">${"★".repeat(t.stars)}${"☆".repeat(3 - t.stars)}</div>
      </div>
      <button class="btn btn-del" data-action="delete" data-id="${t.id}" title="Delete">🗑</button>`;
    ul.appendChild(li);
  }
}

function renderDone() {
  const ul = $("#done-list");
  ul.innerHTML = "";
  const done = state.tasks.filter((t) => t.status === "done").sort((a, b) => b.completedAt - a.completedAt).slice(0, 30);
  $("#done-empty").classList.toggle("hidden", done.length > 0);
  for (const t of done) {
    const li = document.createElement("li");
    li.className = "done-row";
    li.innerHTML = `
      <span class="done-emoji">🏅</span>
      <span class="done-name">${esc(t.name)} ${"★".repeat(t.stars)}</span>
      <span class="done-date">${new Date(t.completedAt).toLocaleDateString()}</span>`;
    ul.appendChild(li);
  }
}

function renderAll() {
  if (!currentAccount || !state) return;
  renderPlayerChip();
  renderStats();
  renderTasks();
  renderNowPlaying();
  renderDone();
  renderPrizes();
  renderLocker();
  renderProfile();
  updateMachineStatus();
  renderRunner();
  if (currentView === "arcade") layoutMachine();
}

/* ---------- tasks: add / complete / delete ---------- */

let selectedStars = 1;
const STAR_HINTS = {
  0: "no sweat — 1 coin",
  1: "easy — 2 coins · 25 tickets",
  2: "medium — 3 coins · 50 tickets",
  3: "hard — 4 coins · 75 tickets",
};

function setStars(n) {
  selectedStars = n;
  $$(".star-btn").forEach((b) => b.classList.toggle("on", Number(b.dataset.stars) <= n));
  $("#star-hint").textContent = STAR_HINTS[n];
}

$$(".star-btn").forEach((b) => b.addEventListener("click", () => setStars(Number(b.dataset.stars))));

$("#add-task-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#task-input");
  const name = input.value.trim();
  if (!name) return;
  state.tasks.push({ id: uid(), name, stars: selectedStars, status: "todo", createdAt: Date.now() });
  input.value = "";
  input.focus();
  saveState();
  renderAll();
  playSound.coin();
  toast("🧸 Added to the machine!");
  log(`➕ Added "${name}" to the machine`);
});

function completeTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t || t.status === "done") return;
  t.status = "done";
  t.completedAt = Date.now();
  const coins = t.stars + 1; // 0★ = 1 coin, every extra star adds 1 more
  const tickets = t.stars * 25;
  state.coins += coins;
  state.tickets += tickets;
  if (state.pickedId === id) state.pickedId = null;

  const today = todayStr();
  if (state.lastDoneDate === yesterdayStr()) state.streak++;
  else if (state.lastDoneDate !== today) state.streak = 1;
  state.lastDoneDate = today;

  saveState();
  renderAll();
  playSound.fanfare();
  confetti(130);
  const tix = tickets > 0 ? ` · +${tickets} tickets` : "";
  toast(`✅ "${t.name}" done! +${coins} coins${tix} 🔥`);
  log(`✅ Completed "${t.name}" (+${coins}🪙${tickets > 0 ? ` +${tickets}🎟️` : ""})`);
}

function deleteTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  if (state.pickedId === id) state.pickedId = null;
  state.tasks = state.tasks.filter((x) => x.id !== id);
  saveState();
  renderAll();
  toast("🗑️ Task removed");
}

$("#task-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  if (b.dataset.action === "complete") completeTask(b.dataset.id);
  else if (b.dataset.action === "delete") deleteTask(b.dataset.id);
});

$("#np-complete").addEventListener("click", () => completeTask(state.pickedId));

/* ---------- claw machine ---------- */

const glass = $("#glass");
const claw = $("#claw");
const clawPrize = $("#claw-prize");
const pile = $("#pile");
const chute = $("#chute");

const CLAW_W = 56;
const CLAW_MIN = 10;
const CLAW_TOP = 14;
let glassW = 0;
let glassH = 0;
let clawX = 0;
let gameBusy = false;

const CLAW_MAX = () => glassW - CLAW_W - 10;
const PILE_TOP = () => glassH - 168;
const PILE_BOTTOM = () => glassH - 42;
const CLAW_DROP_Y = () => PILE_BOTTOM() - 80;
const CHUTE_X = () => Math.min(CLAW_MAX(), glassW - 70);
const MAX_PLUSHIES = 14; // machine is small — it gets stuffed
const PRIZE_COST = 2; // coins only — the claw machine never takes tickets

let machineMode = "task"; // 'task' | 'prize'

function positionClaw() {
  claw.style.left = clawX + "px";
}

function setClawX(x) {
  clawX = Math.min(Math.max(x, CLAW_MIN), CLAW_MAX());
  positionClaw();
}

function positionPlushies() {
  pile.innerHTML = "";
  if (machineMode === "prize") {
    const cols = Math.max(3, Math.min(7, Math.floor((glassW - 24) / 58)));
    MACHINE_STOCK.forEach((item, i) => {
      const h = hashStr(item.kind + item.id);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 30 + col * 58 + ((h % 12) - 6);
      const y = Math.max(PILE_TOP(), PILE_BOTTOM() - row * 50 - ((h % 10) - 4));
      const el = document.createElement("div");
      el.className = "plushie " + (item.kind === "frame" ? "prize-frame" : "prize-tag");
      el.dataset.kind = item.kind;
      el.dataset.id = item.id;
      const rot = (h % 24) - 12;
      el.style.setProperty("--rot", rot + "deg");
      el.style.setProperty("--i", i);
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.title = item.name;
      el.innerHTML = item.kind === "frame"
        ? avatarHtml({ avatar: item.demo, equippedFrame: item.id }, 42)
        : `<span class="prize-tag-sample tag-${item.id}">Aa</span>`;
      pile.appendChild(el);
    });
    return;
  }
  const todos = state.tasks.filter((t) => t.status === "todo").slice(0, MAX_PLUSHIES);
  const cols = Math.max(3, Math.min(7, Math.floor((glassW - 24) / 58)));
  todos.forEach((t, i) => {
    const h = hashStr(t.id);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 30 + col * 58 + ((h % 12) - 6);
    const y = Math.max(PILE_TOP(), PILE_BOTTOM() - row * 50 - ((h % 10) - 4));
    const el = document.createElement("div");
    el.className = "plushie";
    el.dataset.id = t.id;
    const rot = (h % 24) - 12;
    el.style.setProperty("--rot", rot + "deg");
    el.style.setProperty("--i", i);
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.background = PLUSH_COLORS[h % PLUSH_COLORS.length];
    el.textContent = plushEmoji(t);
    pile.appendChild(el);
  });
}

function updateMachineStatus() {
  if (!currentAccount || !state) return;
  const el = $("#machine-status");
  el.className = "machine-status";
  if (machineMode === "prize") {
    if (state.coins < PRIZE_COST) {
      el.textContent = "Out of coins! Finish tasks or check in to earn more.";
      el.classList.add("warn");
    } else {
      el.textContent = `${MACHINE_STOCK.length} prizes stocked · ${PRIZE_COST} coins per play`;
    }
    return;
  }
  const todos = state.tasks.filter((t) => t.status === "todo");
  if (state.coins < 1) {
    el.textContent = "Out of coins! Finish a task to earn more.";
    el.classList.add("warn");
  } else if (todos.length === 0) {
    el.textContent = state.tasks.length ? "Machine empty — everything is claimed! 🎉" : "Machine empty — add some tasks!";
  } else if (todos.length > MAX_PLUSHIES) {
    el.textContent = "Machine's stuffed! Finish some tasks to make room.";
    el.classList.add("warn");
  } else {
    el.textContent = `${todos.length} plushie${todos.length > 1 ? "s" : ""} ready · 1 coin per play`;
  }
}

function layoutMachine() {
  const r = glass.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  glassW = r.width;
  glassH = r.height;
  if (clawX === 0) clawX = (glassW - CLAW_W) / 2; // first layout: center the claw
  setClawX(clawX); // clamps if needed
  positionPlushies();
}

window.addEventListener("resize", () => {
  if (currentView === "arcade") layoutMachine();
});

/* ---------- claw game ---------- */

function pickTarget() {
  const clawCenter = clawX + CLAW_W / 2;
  const glassRect = glass.getBoundingClientRect();
  let best = null;
  let bestD = Infinity;
  for (const el of pile.children) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2 - glassRect.left;
    const d = Math.abs(x - clawCenter);
    if (d < bestD) { bestD = d; best = el; }
  }
  if (!best) return null;
  const prob = bestD <= 26 ? 0.78 : bestD <= 55 ? 0.38 : 0.05;
  return { el: best, task: state.tasks.find((t) => t.id === best.dataset.id), prob, dist: bestD };
}

function setBusy(busy) {
  gameBusy = busy;
  $$(".controls .btn").forEach((b) => (b.disabled = busy));
}

async function play() {
  if (gameBusy || !currentAccount || !state) return;
  const cost = machineMode === "prize" ? PRIZE_COST : 1;
  if (machineMode === "task") {
    const todos = state.tasks.filter((t) => t.status === "todo");
    if (todos.length === 0) {
      toast("The machine is empty! Add a task first.");
      playSound.fail();
      return;
    }
  }
  if (state.coins < cost) {
    toast("Out of coins! Finish tasks or check in to earn more.");
    playSound.fail();
    shakeMachine();
    return;
  }

  state.coins -= cost;
  saveState();
  renderStats();
  updateMachineStatus();
  playSound.coin();
  log(`🪙 Play! (−${cost} coin${cost > 1 ? "s" : ""})`);
  setBusy(true);

  try {
    // 1. descend
    claw.classList.remove("rising", "missed");
    claw.style.top = CLAW_DROP_Y() + "px";
    playSound.drop();
    await wait(850);

    // 2. grab attempt
    const target = pickTarget();
    let success = false;
    if (target) {
      const prob = machineMode === "prize"
        ? (target.dist <= 26 ? 0.85 : target.dist <= 55 ? 0.5 : 0.1)
        : target.prob;
      success = Math.random() < prob;
    }
    if (success) {
      claw.classList.add("closed", "grab-snap");
      clawPrize.textContent = machineMode === "prize"
        ? (target.el.dataset.kind === "tag" ? "🏷️" : (MACHINE_STOCK.find((s) => s.kind === "frame" && s.id === target.el.dataset.id) || {}).demo || "🎁")
        : plushEmoji(target.task);
      clawPrize.classList.add("show");
      target.el.classList.add("grabbed");
      playSound.grab();
      await wait(400);
    } else {
      await wait(400);
    }

    // 3. ascend
    claw.classList.add("rising");
    claw.style.top = CLAW_TOP + "px";
    await wait(850);
    claw.classList.remove("closed", "grab-snap");

    if (success) {
      // 4. carry to the chute and drop it
      setClawX(CHUTE_X());
      await wait(650);
      clawPrize.classList.remove("show");
      target.el.remove();
      chute.classList.add("flash");
      playSound.coin();
      setTimeout(() => chute.classList.remove("flash"), 900);
      if (machineMode === "prize") awardCosmetic(target.el.dataset.kind, target.el.dataset.id);
      else pickTask(target.task.id);
    } else {
      claw.classList.add("missed");
      playSound.fail();
      if (target) {
        target.el.classList.add("whew");
        const msg = target.dist <= 55 ? "😿 SO CLOSE! The claw slipped..." : "😿 Not even close...";
        toast(msg);
        log(msg);
      } else {
        toast("😿 The claw came up empty.");
        log("😿 The claw came up empty.");
      }
      await wait(500);
    }
  } catch (err) {
    console.error("claw error:", err);
    toast("😿 The claw jammed — try again.");
    playSound.fail();
  } finally {
    setBusy(false);
    claw.classList.remove("rising", "missed", "closed", "grab-snap");
    claw.style.top = CLAW_TOP + "px";
    clawPrize.classList.remove("show");
  }
}

function pickTask(id) {
  if (state.pickedId && state.pickedId !== id) {
    const prev = state.tasks.find((t) => t.id === state.pickedId);
    if (prev) prev.status = "todo"; // its plushie goes back in the machine
  }
  state.pickedId = id;
  const t = state.tasks.find((x) => x.id === id);
  if (t) t.status = "picked";
  saveState();
  renderAll();
  playSound.win();
  confetti(70);
  toast(`🎯 NICE CATCH! Next task: "${t.name}"`);
  log(`🧸 Grabbed "${t.name}" — it's your next task!`);
}

/* ---------- prize claw ---------- */

function awardCosmetic(kind, id) {
  const item = MACHINE_STOCK.find((s) => s.kind === kind && s.id === id);
  if (!item) return;
  const owned = kind === "frame"
    ? currentAccount.frames.includes(id)
    : (currentAccount.tags || []).includes(id);
  if (owned) {
    state.tickets += 30; // classic arcade: duplicates pay out in tickets
    saveState();
    renderAll();
    playSound.coin();
    toast(`🎁 Duplicate: ${item.name}! +30 tickets. Classic arcade.`);
    log(`🎁 Duplicate ${item.name} → +30 tickets`);
    return;
  }
  if (kind === "frame") {
    currentAccount.frames.push(id);
    currentAccount.equippedFrame = id;
  } else {
    currentAccount.tags = currentAccount.tags || ["classic"];
    currentAccount.tags.push(id);
    currentAccount.equippedTag = id;
  }
  saveAccounts();
  saveState();
  renderAll();
  confetti(120);
  playSound.win();
  toast(`🎉 Grabbed the ${item.name} ${kind === "frame" ? "avatar frame" : "name tag"}!`);
  log(`🎁 ${currentAccount.username} grabbed the ${item.name} ${kind}!`);
}

function setMachineMode(mode) {
  machineMode = mode;
  $$(".m-tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $("#machine-title").textContent = mode === "prize" ? "🎁 PRIZE CLAW" : "🧸 TASK CLAW";
  $("#machine-sub").textContent = mode === "prize" ? "grab a frame. flex. conquer." : "grab a task. commit. conquer.";
  updateDropLabel();
  updateMachineStatus();
  layoutMachine();
  playSound.coin();
}

function updateDropLabel() {
  $("#btn-drop").textContent = machineMode === "prize" ? `⬇ DROP (${PRIZE_COST}🪙)` : "⬇ DROP (1🪙)";
}

$$(".m-tab").forEach((b) => b.addEventListener("click", () => setMachineMode(b.dataset.mode)));

function moveClaw(dx) {
  if (gameBusy) return;
  setClawX(clawX + dx);
  playSound.move();
}

$("#btn-left").addEventListener("click", () => moveClaw(-30));
$("#btn-right").addEventListener("click", () => moveClaw(30));
$("#btn-drop").addEventListener("click", play);

document.addEventListener("keydown", (e) => {
  if (currentView !== "arcade" || !currentAccount) return;
  if (runnerState === "running") return; // the Runner owns the keyboard while playing
  if (e.target.matches("input, textarea")) return;
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { e.preventDefault(); moveClaw(-16); }
  else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); moveClaw(16); }
  else if (e.key === " " || e.key === "Enter") { e.preventDefault(); play(); }
});

function shakeMachine() {
  const m = $(".machine");
  m.classList.remove("missed");
  void m.offsetWidth;
  m.classList.add("missed");
  setTimeout(() => m.classList.remove("missed"), 500);
}

/* ---------- prizes ---------- */

const PRIZES = [
  { id: "tootsie", name: "Tootsie Roll", cost: 50, emoji: "🍬", desc: "The classic. 30 minutes of pushing for this bad boy." },
  { id: "sticker", name: "Sticker Pack", cost: 120, emoji: "✨", desc: "Slightly sticky. Mostly questionable quality." },
  { id: "keychain", name: "Teddy Keychain", cost: 250, emoji: "🧸", desc: "A mini teddy that smells faintly of milk." },
  { id: "trophy", name: "Golden Claw Trophy", cost: 500, emoji: "🏆", desc: "It says \"Winner\" on it. You are, presumably, the winner." },
  { id: "plush", name: "Champion Plushie", cost: 1000, emoji: "🦁", desc: "The big one. Guard it with your life." },
];

function renderPrizes() {
  const grid = $("#prize-grid");
  grid.innerHTML = "";
  for (const p of PRIZES) {
    const owned = state.prizes.includes(p.id);
    const afford = state.tickets >= p.cost;
    const card = document.createElement("div");
    card.className = "prize-card" + (owned ? " owned" : "");
    card.innerHTML = `
      <div class="prize-emoji">${p.emoji}</div>
      <div class="prize-name">${p.name}</div>
      <div class="prize-desc">${p.desc}</div>
      <div class="prize-cost">${p.cost} 🎟️</div>`;
    const btn = document.createElement("button");
    btn.className = "btn prize-btn" + (owned ? " claimed" : "");
    btn.textContent = owned ? "✓ CLAIMED" : "Claim";
    btn.disabled = owned || !afford;
    if (!owned && !afford) btn.title = "Not enough tickets yet";
    btn.addEventListener("click", () => claimPrize(p.id));
    card.appendChild(btn);
    grid.appendChild(card);
  }
}

function renderLocker() {
  const locker = $("#locker");
  locker.innerHTML = "";
  if (state.prizes.length === 0) {
    locker.innerHTML = '<div class="empty-state">No prizes yet — keep earning tickets! 🎟️</div>';
    return;
  }
  for (const id of state.prizes) {
    const p = PRIZES.find((x) => x.id === id);
    if (!p) continue;
    const b = document.createElement("div");
    b.className = "locker-badge";
    b.innerHTML = `<span class="lb-emoji">${p.emoji}</span> ${p.name}`;
    locker.appendChild(b);
  }
}

function claimPrize(id) {
  const p = PRIZES.find((x) => x.id === id);
  if (!p || state.prizes.includes(id)) return;
  if (state.tickets < p.cost) {
    toast("Not enough tickets yet! 🎟️");
    playSound.fail();
    return;
  }
  state.tickets -= p.cost;
  state.prizes.push(id);
  saveState();
  renderAll();
  playSound.claim();
  confetti(90);
  toast(`🏆 Claimed the ${p.name}! It's in your locker.`);
  log(`🏆 Traded ${p.cost} tickets for the ${p.name}`);
}

/* ---------- machine log ---------- */

function log(msg) {
  const ul = $("#game-log");
  const li = document.createElement("li");
  li.textContent = msg;
  ul.prepend(li);
  while (ul.children.length > 8) ul.lastElementChild.remove();
}

/* ---------- toast ---------- */

let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- sounds (Web Audio, no files) ---------- */

let audioCtx = null;
function ac() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone(freq, dur, type = "square", vol = 0.12, delay = 0, slideTo = null) {
  try {
    const c = ac();
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  } catch (e) { /* audio unavailable */ }
}

const playSound = {
  move() { tone(320, 0.05, "square", 0.05); },
  coin() { tone(950, 0.09, "square", 0.1); tone(1420, 0.14, "square", 0.1, 0.07); },
  drop() { tone(150, 0.25, "sawtooth", 0.06, 0, 60); },
  grab() { tone(220, 0.18, "sawtooth", 0.1, 0, 520); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, "square", 0.1, i * 0.09)); },
  fail() { tone(330, 0.16, "square", 0.1); tone(220, 0.22, "square", 0.1, 0.14, 150); },
  fanfare() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, "square", 0.09, i * 0.11)); },
  claim() { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.1, "triangle", 0.12, i * 0.06)); },
};

/* ---------- confetti ---------- */

const canvas = $("#confetti-canvas");
const ctx = canvas.getContext("2d");
let particles = [];
let confettiRaf = null;

const CONF_COLORS = ["#ff2d95", "#22d3ee", "#ffd93d", "#4ade80", "#fb923c", "#a78bfa"];

function confetti(n = 120) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  for (let i = 0; i < n; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.4,
      vx: (Math.random() - 0.5) * 6,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      size: 6 + Math.random() * 7,
      color: CONF_COLORS[i % CONF_COLORS.length],
      shape: Math.random() < 0.5 ? "rect" : "circle",
    });
  }
  if (!confettiRaf) loopConfetti();
}

function loopConfetti() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter((p) => p.y < canvas.height + 30);
  for (const p of particles) {
    p.vy += 0.15;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.shape === "rect") ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  if (particles.length > 0) confettiRaf = requestAnimationFrame(loopConfetti);
  else { confettiRaf = null; ctx.clearRect(0, 0, canvas.width, canvas.height); }
}

/* ---------- runner: 2D side-scroller ---------- */

const RUNNER_COST = 100; // tickets per run
const RUNNER_TIME = 300; // 5-minute limit per level
const RUNNER_CHAPTERS = [
  { id: "snow", name: "Snow Mountain", emoji: "❄️", frame: "snow", goal: [10000, 16000, 22000] },
  { id: "desert", name: "Scorching Desert", emoji: "🏜️", frame: "desert", goal: [11000, 17000, 24000] },
  { id: "volcano", name: "Burning Volcano", emoji: "🌋", frame: "volcano", goal: [12000, 18000, 26000] },
];
const RUNNER_THEMES = {
  snow: {
    sky: ["#0b1f3a", "#1d4e8f", "#7ec8f7"], far: "#9ecbe8", near: "#cfe8f5",
    ground: "#e8f4fb", groundLine: "#9fd3ef", groundDark: "#d3e9f5",
    obstacle: "#ffffff", obstacle2: "#f97316", part: "#ffffff", scarf: "#ff2d95",
  },
  desert: {
    sky: ["#3a1c0e", "#b45309", "#fbbf24"], far: "#e8a33d", near: "#f5c96b",
    ground: "#f5d48a", groundLine: "#d99a3d", groundDark: "#eec06e",
    obstacle: "#3f9d4f", obstacle2: "#256b33", part: "#fde68a", scarf: "#22d3ee",
  },
  volcano: {
    sky: ["#1c0a0a", "#5f1111", "#c2410c"], far: "#7f1d1d", near: "#b91c1c",
    ground: "#3b1414", groundLine: "#ea580c", groundDark: "#2c0f0f",
    obstacle: "#292524", obstacle2: "#ea580c", part: "#fdba74", scarf: "#4ade80",
  },
};

const rCanvas = $("#runner-canvas");
const rCtx = rCanvas ? rCanvas.getContext("2d") : null;

let runnerChapter = "snow";
let runnerState = "idle"; // idle | running | won | lost
let runnerLevel = 0;
let r = null;   // live game state
let rRaf = 0;
let rLastT = 0;
let jumpQueued = false;

const fmtTime = (s) => {
  const m = Math.floor(Math.max(0, s) / 60);
  const ss = Math.floor(Math.max(0, s) % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
};

function renderRunner() {
  if (!currentAccount || !state) return;
  const grid = $("#chapter-grid");
  if (!grid) return;
  grid.innerHTML = "";
  for (const ch of RUNNER_CHAPTERS) {
    const prog = (state.runner || {})[ch.id] || 0;
    const owned = currentAccount.frames.includes(ch.frame);
    const card = document.createElement("div");
    card.className = "ch-card" + (runnerChapter === ch.id ? " active" : "");
    card.innerHTML = `
      <div class="ch-avatar">${avatarHtml({ avatar: ch.emoji, equippedFrame: ch.frame }, 46)}${owned ? "" : '<span class="ch-lock">🔒</span>'}</div>
      <div class="ch-name">${ch.name}</div>
      <div class="ch-dots">${[0, 1, 2].map((i) => `<span class="ch-dot${i < prog ? " done" : ""}">${i < prog ? "✓" : i + 1}</span>`).join("")}</div>
      <div class="ch-meta">${owned ? "🖼️ frame unlocked" : "🔒 finish the chapter"}</div>`;
    card.addEventListener("click", () => {
      runnerChapter = ch.id;
      renderRunner();
    });
    grid.appendChild(card);
  }
  updateRunnerOverlay();
}

function nextRunnerLevel(ch) {
  const prog = (state.runner || {})[ch.id] || 0;
  return prog >= ch.levels ? 0 : prog;
}

function updateRunnerOverlay() {
  const el = $("#runner-overlay");
  if (!el || !currentAccount || !state) return;
  const ch = RUNNER_CHAPTERS.find((c) => c.id === runnerChapter) || RUNNER_CHAPTERS[0];
  const prog = (state.runner || {})[ch.id] || 0;
  const btn = $("#btn-run");
  if (runnerState === "running") { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  if (runnerState === "won") {
    $("#ro-title").textContent = "LEVEL CLEARED!";
    $("#ro-sub").textContent = prog >= ch.levels ? "Chapter complete — replay any level." : `Next up: level ${prog + 1} of ${ch.levels}.`;
    btn.textContent = "▶ RUN (100🎟️)";
  } else if (runnerState === "lost") {
    $("#ro-title").textContent = "OUT OF TIME!";
    $("#ro-sub").textContent = "That run cost 100 tickets. Again?";
    btn.textContent = "▶ TRY AGAIN (100🎟️)";
  } else {
    $("#ro-title").textContent = "READY?";
    $("#ro-sub").textContent = `${ch.name} · Level ${prog + 1} of ${ch.levels} · reach ${ch.goal[Math.min(prog, 2)]}m in 5:00`;
    btn.textContent = "▶ RUN (100🎟️)";
  }
  btn.disabled = state.tickets < RUNNER_COST;
  btn.title = btn.disabled ? "Not enough tickets — finish tasks or win duplicates" : "";
}

function startRunner() {
  if (!currentAccount || !state || runnerState === "running") return;
  const ch = RUNNER_CHAPTERS.find((c) => c.id === runnerChapter) || RUNNER_CHAPTERS[0];
  const level = nextRunnerLevel(ch);
  if (state.tickets < RUNNER_COST) {
    toast("Not enough tickets! Finish tasks or win duplicates.");
    playSound.fail();
    return;
  }
  state.tickets -= RUNNER_COST;
  saveState();
  renderStats();
  runnerLevel = level;
  runnerState = "running";
  jumpQueued = false;
  r = {
    ch, level,
    goal: ch.goal[level], dist: 0, time: RUNNER_TIME,
    hearts: 3,
    px: 90, py: 204, vy: 0, pw: 26, ph: 44,
    grounded: true, inv: 0, flashT: 0, runT: 0,
    speed: 240, spawnT: 1.1,
    obstacles: [], particles: [], pT: 0, over: false,
  };
  $("#runner-stage").classList.add("playing");
  updateRunnerHud();
  updateRunnerOverlay();
  log(`🏃 ${ch.name} — level ${level + 1} run started (−${RUNNER_COST}🎟️)`);
  rLastT = performance.now();
  cancelAnimationFrame(rRaf);
  rRaf = requestAnimationFrame(runnerTick);
}

function runnerTick(t) {
  if (!r || r.over) return;
  const dt = Math.min(0.033, (t - rLastT) / 1000);
  rLastT = t;
  stepRunner(dt);
  drawRunner();
  updateRunnerHud();
  if (!r.over) rRaf = requestAnimationFrame(runnerTick);
}

function stepRunner(dt) {
  r.runT += dt;
  r.time -= dt;
  if (r.time <= 0) return endRun(false, "OUT OF TIME!");
  r.dist += r.speed * dt;
  if (r.dist >= r.goal) return endRun(true);
  r.speed = Math.min(430, 240 + r.dist * 0.22);

  // player physics
  r.vy += 1500 * dt;
  r.py += r.vy * dt;
  if (r.py >= 204) { r.py = 204; r.vy = 0; r.grounded = true; }
  else r.grounded = false;
  if (jumpQueued && r.grounded) {
    r.vy = -540;
    r.grounded = false;
    jumpQueued = false;
    tone(440, 0.07, "square", 0.06);
  }
  if (r.inv > 0) r.inv -= dt;
  if (r.flashT > 0) r.flashT -= dt;

  // obstacles
  r.spawnT -= dt;
  if (r.spawnT <= 0) {
    spawnObstacle();
    r.spawnT = Math.max(0.55, 1.1 + Math.random() * 0.9 - r.dist / 3000);
  }
  for (const o of r.obstacles) o.x -= r.speed * dt;
  r.obstacles = r.obstacles.filter((o) => o.x + o.w > -60);

  for (const o of r.obstacles) {
    if (r.inv > 0) continue;
    const ph = 40;
    if (o.x < r.px + r.pw && o.x + o.w > r.px && o.gy < r.py + ph && o.gy + o.h > r.py + 4) {
      r.hearts--;
      r.inv = 1.3;
      r.flashT = 0.25;
      playSound.fail();
      if (r.hearts <= 0) return endRun(false, "CRASHED!");
    }
  }

  // theme particles
  r.pT -= dt;
  if (r.pT <= 0) {
    r.pT = 0.12;
    const th = RUNNER_THEMES[r.ch.id];
    const fall = r.ch.id === "snow";
    for (let i = 0; i < 3; i++) {
      r.particles.push({
        x: Math.random() * 860,
        y: fall ? -6 : 220 + Math.random() * 40,
        vx: fall ? -20 - Math.random() * 30 : (Math.random() - 0.5) * 30,
        vy: fall ? 40 + Math.random() * 40 : -20 - Math.random() * 30,
        s: 2 + Math.random() * 3,
        a: 0.4 + Math.random() * 0.5,
        c: th.part,
      });
    }
  }
  for (const p of r.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.a -= dt * 0.3; }
  r.particles = r.particles.filter((p) => p.a > 0 && p.y < 300);
}

function spawnObstacle() {
  if (Math.random() < 0.2) {
    // double bump
    r.obstacles.push({ x: 860, w: 26, h: 30, gy: 218, kind: "small" });
    r.obstacles.push({ x: 860 + 76, w: 26, h: 30, gy: 218, kind: "small" });
  } else if (Math.random() < 0.55) {
    r.obstacles.push({ x: 860, w: 30, h: 34, gy: 214, kind: "small" });
  } else {
    r.obstacles.push({ x: 860, w: 34, h: 48, gy: 200, kind: "tall" });
  }
}

function endRun(win, msg) {
  if (!r || r.over) return;
  r.over = true;
  runnerState = win ? "won" : "lost";
  cancelAnimationFrame(rRaf);
  drawRunner();
  if (win) {
    const ch = r.ch;
    const prog = (state.runner || {})[ch.id] || 0;
    const newProg = Math.max(prog, r.level + 1);
    state.runner = state.runner || {};
    state.runner[ch.id] = newProg;
    const f = FRAMES.find((x) => x.id === ch.frame);
    saveState();
    if (newProg >= ch.levels && f && !currentAccount.frames.includes(f.id)) {
      currentAccount.frames.push(f.id);
      currentAccount.equippedFrame = f.id;
      saveAccounts();
      confetti(200);
      playSound.fanfare();
      toast(`🏆 CHAPTER COMPLETE! ${f.name} frame unlocked!`);
      log(`🏆 ${currentAccount.username} cleared ${ch.name} — ${f.name} frame unlocked!`);
    } else {
      confetti(90);
      playSound.win();
      toast(`✅ Level ${r.level + 1} cleared! (${Math.floor(r.dist)}m)`);
      log(`🏁 ${ch.name} — level ${r.level + 1} cleared in ${fmtTime(r.time)}`);
    }
    renderAll();
  } else {
    playSound.fail();
    toast(`💥 ${msg} — that run cost 100 tickets.`);
    log(`💥 ${r.ch.name} — run failed (${msg})`);
  }
  updateRunnerOverlay();
}

function updateRunnerHud() {
  if (!r) return;
  $("#rh-level").textContent = `${r.ch.emoji} Lv ${r.level + 1}/3`;
  $("#rh-hearts").textContent = "❤".repeat(Math.max(0, r.hearts)) + "🖤".repeat(Math.max(0, 3 - r.hearts));
  $("#rh-dist").textContent = `${Math.floor(r.dist)}m / ${r.goal}m`;
  $("#rh-time").textContent = fmtTime(r.time);
}

function roundRectC(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRunner() {
  if (!r || !rCtx) return;
  const ctx = rCtx, W = 860, H = 300;
  const th = RUNNER_THEMES[r.ch.id];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, th.sky[0]);
  g.addColorStop(0.6, th.sky[1]);
  g.addColorStop(1, th.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // parallax silhouettes
  const off = r.dist * 0.15;
  ctx.fillStyle = th.far;
  ctx.beginPath();
  ctx.moveTo(0, 248);
  for (let x = -(off % 260) - 260; x < W + 260; x += 260) ctx.lineTo(x + 130, 248 - (60 + ((x * 7) % 40)));
  ctx.lineTo(W, 248);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = th.near;
  ctx.beginPath();
  ctx.moveTo(0, 248);
  for (let x = -(off % 160) - 160; x < W + 160; x += 160) ctx.lineTo(x + 80, 248 - (26 + ((x * 13) % 18)));
  ctx.lineTo(W, 248);
  ctx.closePath();
  ctx.fill();

  // ground
  ctx.fillStyle = th.ground;
  ctx.fillRect(0, 248, W, H - 248);
  ctx.fillStyle = th.groundLine;
  ctx.fillRect(0, 248, W, 3);
  ctx.strokeStyle = th.groundDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = -(r.dist % 60); x < W; x += 60) { ctx.moveTo(x, 253); ctx.lineTo(x + 20, 253); }
  ctx.stroke();

  // obstacles
  for (const o of r.obstacles) drawObstacle(ctx, th, o);

  // particles
  for (const p of r.particles) {
    ctx.globalAlpha = Math.max(0, p.a);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x, p.y, p.s, p.s);
  }
  ctx.globalAlpha = 1;

  drawPlayer(ctx, th);

  if (r.flashT > 0) {
    ctx.fillStyle = "rgba(255, 45, 149, 0.35)";
    ctx.fillRect(0, 0, W, H);
  }
}

function drawObstacle(ctx, th, o) {
  const base = 248;
  if (r.ch.id === "snow") {
    const cx = o.x + o.w / 2;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(cx, base - o.h + 13, 14, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, base - o.h + 31, 10, 0, 7); ctx.fill();
    ctx.fillStyle = th.obstacle2;
    ctx.fillRect(cx - 3, base - o.h + 27, 7, 3);
  } else if (r.ch.id === "desert") {
    ctx.fillStyle = th.obstacle;
    ctx.fillRect(o.x, base - o.h, o.w, o.h);
    ctx.fillStyle = th.obstacle2;
    ctx.fillRect(o.x + o.w / 2 - 8, base - o.h, 16, 7);
  } else {
    ctx.fillStyle = th.obstacle;
    ctx.fillRect(o.x, base - o.h, o.w, o.h);
    ctx.fillStyle = th.obstacle2;
    ctx.fillRect(o.x + 2, base - o.h, 4, o.h);
  }
}

function drawPlayer(ctx, th) {
  if (r.inv > 0 && Math.floor(r.runT * 10) % 2 === 0) return; // invincibility blink
  const px = r.px, py = r.py, ph = 44;
  const step = r.grounded ? Math.sin(r.runT * 14) : 0;
  ctx.fillStyle = "#1e1145";
  ctx.fillRect(px + 6, py + ph - 9, 5, 9 + step * 3);
  ctx.fillRect(px + 15, py + ph - 9, 5, 9 - step * 3);
  ctx.fillStyle = "#ffffff";
  roundRectC(ctx, px, py + ph - 33, 26, 29, 6);
  ctx.fill();
  ctx.fillStyle = th.scarf;
  ctx.fillRect(px + 19, py + ph - 25, 10, 5);
  ctx.fillStyle = "#ffd6a8";
  ctx.beginPath(); ctx.arc(px + 13, py + ph - 39, 8, 0, 7); ctx.fill();
  ctx.fillStyle = "#1e1145";
  ctx.fillRect(px + 16, py + ph - 40, 3, 3);
}

$("#btn-run").addEventListener("click", startRunner);
$("#btn-rjump").addEventListener("pointerdown", (e) => { e.preventDefault(); if (runnerState === "running") jumpQueued = true; });
document.addEventListener("keydown", (e) => {
  if (runnerState !== "running") return;
  if (e.target.matches("input, textarea")) return;
  if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
    e.preventDefault();
    jumpQueued = true;
  }
});
document.addEventListener("keyup", (e) => {
  if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") jumpQueued = false;
});

/* ---------- init ---------- */

function init() {
  log("🕹️ Machine online. Add tasks, then come play!");
  log("Tip: line up the claw over a plushie you like.");

  $("#btn-switch").addEventListener("click", logout);
  $("#player-chip").addEventListener("click", () => switchView("profile"));
  $("#btn-checkin").addEventListener("click", doCheckIn);
  $("#btn-create-acc").addEventListener("click", createAccount);
  $("#acc-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") createAccount();
  });
  renderAvatarPicker();
  updateDropLabel();

  const sessionId = loadSession();
  const acc = sessionId ? accounts.find((a) => a.id === sessionId) : null;
  if (acc) {
    currentAccount = acc;
    state = loadState(acc.id);
    hideAccountScreen();
    renderAll();
    switchView("tasks");
  } else {
    showAccountScreen();
  }
}

init();
