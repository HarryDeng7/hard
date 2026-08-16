/* ============================================================
   Life Quest · 生活闯关 — 关卡/任务管理
   纯原生 JS，数据存 localStorage
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'lifeQuest.levels.v1';

  /* ---------------- 数据 ---------------- */
  let levels = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 损坏则重建 */ }
    return seedLevels();
  }

  function seedLevels() {
    return [
      {
        id: uid(), title: '早起打卡：7 点前起床',
        desc: '闹钟一响就起，不赖床，喝一杯水。',
        difficulty: 1, completed: false, completedAt: null, plays: 0, wins: 0
      },
      {
        id: uid(), title: '完成 30 分钟锻炼',
        desc: '跑步、跳操或力量训练都可以，动起来就行。',
        difficulty: 2, completed: false, completedAt: null, plays: 0, wins: 0
      },
      {
        id: uid(), title: '阅读 20 页书',
        desc: '放下手机，专注读 20 页以上。',
        difficulty: 3, completed: false, completedAt: null, plays: 0, wins: 0
      }
    ];
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------- 界面元素 ---------------- */
  const $ = (id) => document.getElementById(id);
  const screenMenu = $('screen-menu');
  const screenGame = $('screen-game');
  const grid = $('level-grid');
  const emptyHint = $('empty-hint');
  const modalLevel = $('modal-level');
  const modalDelete = $('modal-delete');
  const modalUncomplete = $('modal-uncomplete');
  const toastEl = $('toast');

  let currentFilter = 'all';
  let editingId = null;      // 编辑中的关卡 id
  let deletingId = null;     // 待删除的关卡 id
  let uncompletingId = null; // 待撤销的关卡 id

  /* ---------------- 渲染 ---------------- */
  function render() {
    const total = levels.length;
    const done = levels.filter(l => l.completed).length;
    $('stat-done').textContent = done;
    $('stat-total').textContent = total;

    const list = levels.filter(l => {
      if (currentFilter === 'todo') return !l.completed;
      if (currentFilter === 'done') return l.completed;
      return true;
    });

    grid.innerHTML = '';
    emptyHint.hidden = total > 0;

    list.forEach((lvl, i) => grid.appendChild(card(lvl, i)));
  }

  function card(lvl, idx) {
    const el = document.createElement('article');
    el.className = 'level-card';
    el.dataset.id = lvl.id;

    const stars = [1, 2, 3, 4, 5].map(n =>
      `<span class="${n <= lvl.difficulty ? '' : 'off'}">★</span>`
    ).join('');

    const doneLine = lvl.completed
      ? `<div class="card-done-line">✅ 已完成 · ${fmtDate(lvl.completedAt)}
           <span class="undo" data-act="undo">撤销</span></div>`
      : '';

    const playLabel = lvl.completed ? '▶ 再玩一次' : '▶ 进入关卡';
    const playClass = lvl.completed ? 'btn-play done' : 'btn-play';

    el.innerHTML = `
      <div class="card-top">
        <span class="level-num ${lvl.completed ? 'done' : ''}">LEVEL ${pad2(idx + 1)}</span>
        <span class="status-badge ${lvl.completed ? 'done' : 'todo'}">${lvl.completed ? '已完成' : '未完成'}</span>
      </div>
      <h3 class="card-title">${esc(lvl.title)}</h3>
      ${lvl.desc ? `<p class="card-desc">${esc(lvl.desc)}</p>` : ''}
      <div class="card-meta">
        <span class="stars">${stars}</span>
        <span>挑战 ${lvl.plays} 次 · 通关 ${lvl.wins} 次</span>
      </div>
      ${doneLine}
      <div class="card-actions">
        <button class="btn ${playClass}" data-act="play">${playLabel}</button>
        <button class="btn btn-icon" data-act="edit" title="编辑任务">✎</button>
        <button class="btn btn-icon" data-act="del" title="删除关卡">🗑</button>
      </div>`;

    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.dataset.act;
      if (a === 'play') startLevel(lvl);
      else if (a === 'edit') openEdit(lvl);
      else if (a === 'del') openDelete(lvl);
      else if (a === 'undo') openUncomplete(lvl);
    });

    return el;
  }

  /* ---------------- 弹窗 ---------------- */
  function openEdit(lvl) {
    editingId = lvl ? lvl.id : null;
    $('modal-title').textContent = lvl ? '编辑任务' : '添加任务';
    $('f-title').value = lvl ? lvl.title : '';
    $('f-desc').value = lvl ? (lvl.desc || '') : '';
    setStars(lvl ? lvl.difficulty : 1);
    modalLevel.hidden = false;
    setTimeout(() => $('f-title').focus(), 50);
  }

  function setStars(n) {
    document.querySelectorAll('#f-difficulty .star').forEach(b => {
      b.classList.toggle('on', Number(b.dataset.v) <= n);
    });
  }

  $('f-difficulty').addEventListener('click', (e) => {
    const b = e.target.closest('.star');
    if (b) setStars(Number(b.dataset.v));
  });

  $('level-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('f-title').value.trim();
    if (!title) return;
    const desc = $('f-desc').value.trim();
    const diff = Number(document.querySelector('#f-difficulty .star.on')?.dataset.v || 1);

    if (editingId) {
      const lvl = levels.find(l => l.id === editingId);
      if (lvl) { lvl.title = title; lvl.desc = desc; lvl.difficulty = diff; }
    } else {
      levels.unshift({ id: uid(), title, desc, difficulty: diff, completed: false, completedAt: null, plays: 0, wins: 0 });
    }
    save(); render(); closeModals();
    toast(editingId ? '任务已更新' : '新关卡已添加，去现实中完成它吧！');
  });

  function openDelete(lvl) {
    deletingId = lvl.id;
    $('del-name').textContent = lvl.title;
    modalDelete.hidden = false;
  }

  $('del-confirm').addEventListener('click', () => {
    levels = levels.filter(l => l.id !== deletingId);
    save(); render(); closeModals();
    toast('关卡已删除');
  });

  function openUncomplete(lvl) {
    uncompletingId = lvl.id;
    $('un-name').textContent = lvl.title;
    modalUncomplete.hidden = false;
  }

  $('un-confirm').addEventListener('click', () => {
    const lvl = levels.find(l => l.id === uncompletingId);
    if (lvl) { lvl.completed = false; lvl.completedAt = null; }
    save(); render(); closeModals();
    toast('已恢复为未完成');
  });

  /* ---------------- 开始游戏 ---------------- */
  function startLevel(lvl) {
    screenMenu.hidden = true;
    screenGame.hidden = false;

    $('game-level-tag').textContent = `LEVEL ${pad2(levels.indexOf(lvl) + 1)}`;
    $('game-level-title').textContent = lvl.title;
    $('intro-level-num').textContent = pad2(levels.indexOf(lvl) + 1);
    $('intro-task').textContent = lvl.title;

    Game.load(lvl);
    Game.showIntro();
  }

  function backToMenu() {
    Game.stop();
    screenGame.hidden = true;
    screenMenu.hidden = false;
    render();
  }

  /* ---------------- 游戏结果回调（game.js 调用） ---------------- */
  window.App = {
    getLevel(id) { return levels.find(l => l.id === id); },
    getLevelIndex(id) { return levels.findIndex(l => l.id === id); },
    onLevelWon(levelId, result) {
      const lvl = levels.find(l => l.id === levelId);
      if (!lvl) return;
      lvl.plays++;
      lvl.wins++;
      if (!lvl.completed) {
        lvl.completed = true;
        lvl.completedAt = Date.now();
        save();
        $('win-task').textContent = `任务「${lvl.title}」已完成 ✅`;
      } else {
        $('win-task').textContent = `再次通关「${lvl.title}」`;
      }
      $('win-stats-line').textContent = `金币 ${result.coins} · 用时 ${fmtTime(result.time)} · 总通关 ${lvl.wins} 次`;
    },
    onLevelFailed(levelId) {
      const lvl = levels.find(l => l.id === levelId);
      if (lvl) lvl.plays++;
    },
    backToMenu,
    toast
  };

  /* ---------------- 工具 ---------------- */
  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function fmtTime(s) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.hidden = true; }, 2200);
  }

  function closeModals() {
    modalLevel.hidden = true;
    modalDelete.hidden = true;
    modalUncomplete.hidden = true;
  }

  /* ---------------- 事件绑定 ---------------- */
  $('add-level-btn').addEventListener('click', () => openEdit(null));
  $('modal-close').addEventListener('click', closeModals);
  $('form-cancel').addEventListener('click', closeModals);
  $('del-close').addEventListener('click', closeModals);
  $('del-cancel').addEventListener('click', closeModals);
  $('un-close').addEventListener('click', closeModals);
  $('un-cancel').addEventListener('click', closeModals);

  document.querySelectorAll('.modal-mask').forEach(mask => {
    mask.addEventListener('click', (e) => { if (e.target === mask) closeModals(); });
  });

  $('filter-bar').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    render();
  });

  $('game-back-btn').addEventListener('click', backToMenu);
  $('intro-back-btn').addEventListener('click', backToMenu);
  $('pause-quit-btn').addEventListener('click', backToMenu);
  $('win-return-btn').addEventListener('click', backToMenu);
  $('fail-return-btn').addEventListener('click', backToMenu);

  $('intro-start-btn').addEventListener('click', () => Game.start());
  $('pause-resume-btn').addEventListener('click', () => Game.resume());
  $('fail-retry-btn').addEventListener('click', () => Game.restart());
  $('win-again-btn').addEventListener('click', () => Game.restart());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !screenGame.hidden) {
      if (Game.isPaused()) Game.resume();
      else Game.pause();
    }
  });

  /* 初始渲染 */
  render();
})();
