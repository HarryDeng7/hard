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
  { id: "default", name: "Classic Neon", desc: "The starter frame. Everyone gets one.", demo: "🧸" },
  { id: "gold", name: "Golden Legend", desc: "Check in 7 days in a row to unlock.", demo: "⭐" },
];

let selectedAvatar = AVATAR_EMOJIS[0];

function avatarHtml(acc, size) {
  const cls = acc.equippedFrame === "gold" ? "frame-gold" : "";
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
    const card = document.createElement("div");
    card.className = "acc-card";
    card.innerHTML = `
      ${avatarHtml(a, 64)}
      <div class="acc-name">${esc(a.username)}</div>
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
    playSound("fail");
    return;
  }
  if (name.length > 16) {
    toast("Name too long — max 16 characters.");
    playSound("fail");
    return;
  }
  if (accounts.some((a) => a.username.toLowerCase() === name.toLowerCase())) {
    toast("That name is already taken!");
    playSound("fail");
    return;
  }
  const acc = {
    id: uid(),
    username: name,
    avatar: selectedAvatar,
    createdAt: Date.now(),
    equippedFrame: "default",
    frames: ["default"],
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
    playSound("fanfare");
    toast("⭐ 7-day streak! GOLDEN LEGEND avatar frame unlocked!");
    log(`⭐ ${currentAccount.username} unlocked the Golden Legend frame!`);
  } else {
    confetti(50);
    playSound("win");
    toast(`✅ Checked in! +2 coins · 🔥 ${ci.streak}-day streak`);
  }
}

function equipFrame(frameId) {
  if (!currentAccount || !currentAccount.frames.includes(frameId)) return;
  currentAccount.equippedFrame = frameId;
  saveAccounts();
  renderAll();
  playSound("coin");
  toast(frameId === "gold" ? "⭐ Golden Legend frame equipped!" : "Classic Neon frame equipped.");
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
}

function renderProfile() {
  if (!currentAccount) return;
  const a = currentAccount;
  const ci = a.checkIn;
  const today = todayStr();

  $("#pf-avatar-wrap").innerHTML = avatarHtml(a, 96);
  $("#pf-name").textContent = a.username;
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
  for (const f of FRAMES) {
    const owned = a.frames.includes(f.id);
    const equipped = a.equippedFrame === f.id;
    const card = document.createElement("div");
    card.className = "frame-card" + (owned ? " owned" : "") + (equipped ? " equipped" : "") + (owned && !equipped ? " clickable" : "");
    card.innerHTML = `
      <span class="frame-demo">${avatarHtml({ avatar: f.demo, equippedFrame: f.id }, 56)}</span>
      <div class="frame-name">${f.name}</div>
      <div class="frame-desc">${f.desc}</div>
      <span class="frame-tag">${owned ? (equipped ? "✓ EQUIPPED" : "Equip") : "🔒 Locked"}</span>`;
    if (owned && !equipped) {
      card.addEventListener("click", () => equipFrame(f.id));
    }
    list.appendChild(card);
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
  $("#np-meta").textContent = "★".repeat(t.stars) + " · grabbed by the claw — go finish it!";
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
  if (currentView === "arcade") layoutMachine();
}

/* ---------- tasks: add / complete / delete ---------- */

let selectedStars = 1;
const STAR_HINTS = {
  1: "easy — 3 coins · 25 tickets",
  2: "medium — 6 coins · 50 tickets",
  3: "hard — 9 coins · 75 tickets",
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
  playSound("coin");
  toast("🧸 Added to the machine!");
  log(`➕ Added "${name}" to the machine`);
});

function completeTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t || t.status === "done") return;
  t.status = "done";
  t.completedAt = Date.now();
  const coins = t.stars * 3;
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
  playSound("fanfare");
  confetti(130);
  toast(`✅ "${t.name}" done! +${coins} coins · +${tickets} tickets 🔥`);
  log(`✅ Completed "${t.name}" (+${coins}🪙 +${tickets}🎟️)`);
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

function positionClaw() {
  claw.style.left = clawX + "px";
}

function setClawX(x) {
  clawX = Math.min(Math.max(x, CLAW_MIN), CLAW_MAX());
  positionClaw();
}

function positionPlushies() {
  pile.innerHTML = "";
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
  const todos = state.tasks.filter((t) => t.status === "todo");
  const el = $("#machine-status");
  el.className = "machine-status";
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
  const todos = state.tasks.filter((t) => t.status === "todo");
  if (todos.length === 0) {
    toast("The machine is empty! Add a task first.");
    playSound("fail");
    return;
  }
  if (state.coins < 1) {
    toast("Out of coins! Finish a task to earn more.");
    playSound("fail");
    shakeMachine();
    return;
  }

  state.coins--;
  saveState();
  renderStats();
  updateMachineStatus();
  playSound("coin");
  log("🪙 Play! (−1 coin)");
  setBusy(true);

  // 1. descend
  claw.classList.remove("rising", "missed");
  claw.style.top = CLAW_DROP_Y() + "px";
  playSound("drop");
  await wait(850);

  // 2. grab attempt
  const target = pickTarget();
  const success = target && Math.random() < target.prob;
  if (success) {
    claw.classList.add("closed", "grab-snap");
    clawPrize.textContent = plushEmoji(target.task);
    clawPrize.classList.add("show");
    target.el.classList.add("grabbed");
    playSound("grab");
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
    playSound("coin");
    setTimeout(() => chute.classList.remove("flash"), 900);
    pickTask(target.task.id);
  } else {
    claw.classList.add("missed");
    playSound("fail");
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

  setBusy(false);
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
  playSound("win");
  confetti(70);
  toast(`🎯 NICE CATCH! Next task: "${t.name}"`);
  log(`🧸 Grabbed "${t.name}" — it's your next task!`);
}

function moveClaw(dx) {
  if (gameBusy) return;
  setClawX(clawX + dx);
  playSound("move");
}

$("#btn-left").addEventListener("click", () => moveClaw(-30));
$("#btn-right").addEventListener("click", () => moveClaw(30));
$("#btn-drop").addEventListener("click", play);

document.addEventListener("keydown", (e) => {
  if (currentView !== "arcade" || !currentAccount) return;
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
    playSound("fail");
    return;
  }
  state.tickets -= p.cost;
  state.prizes.push(id);
  saveState();
  renderAll();
  playSound("claim");
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
