'use strict';

// ---- 常量 ----
const ITEM_HEIGHT = 60;     // 单条高度（需与 CSS 一致）
const BUFFER = 6;           // 视口外预渲染条数
const PAGE_SIZE = 200;      // 每次拉取条数
const DEBOUNCE_MS = 140;    // 搜索防抖

// ---- 状态 ----
const state = {
  items: [],          // 当前已加载的条目（按 lastVisitTime 降序）
  query: '',
  hasMore: true,
  loading: false,
  selectedIndex: 0,
  scrollTop: 0,
};

const els = {
  search: document.getElementById('search'),
  list: document.getElementById('list'),
  spacer: document.getElementById('spacer'),
  status: document.getElementById('status'),
  empty: document.getElementById('empty'),
};

const rendered = new Map();   // index -> DOM 元素（虚拟列表）
let searchToken = 0;          // 防止跨查询竞态

// ---- 工具函数 ----
function favUrl(url) {
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function formatTime(ts) {
  const diff = Date.now() - ts;
  const d = new Date(ts);
  const today = new Date();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 6 * 3600000) return Math.floor(diff / 3600000) + '小时前';
  if (d.toDateString() === today.toDateString()) return '今天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return '昨天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  if (d.getFullYear() === today.getFullYear()) return pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function setStatus(t) { els.status.textContent = t || ''; }
function updateEmpty() { els.empty.hidden = state.items.length > 0 || state.loading; }
function countLabel() { return state.items.length ? (state.items.length + (state.hasMore ? '+' : '') + ' 项') : ''; }

// ---- 虚拟列表 ----
function createItemEl(item, index) {
  const el = document.createElement('div');
  el.className = 'item' + (index === state.selectedIndex ? ' selected' : '');
  el.innerHTML =
    '<img class="fav" alt="" />' +
    '<div class="main"><div class="title"></div><div class="url"></div></div>' +
    '<div class="time"></div>' +
    '<button class="del" title="删除" tabindex="-1">×</button>';
  // textContent 防止 XSS
  el.querySelector('.title').textContent = item.title || '(无标题)';
  el.querySelector('.url').textContent = item.url;
  el.querySelector('.time').textContent = formatTime(item.lastVisitTime);
  const img = el.querySelector('.fav');
  img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
  img.src = favUrl(item.url);

  el.addEventListener('click', (e) => {
    if (e.target.closest('.del')) return;
    openItem(item, e);
  });
  el.addEventListener('auxclick', (e) => {
    if (e.button === 1) { e.preventDefault(); openItem(item, { ctrlKey: true }); } // 中键 → 后台新标签
  });
  el.querySelector('.del').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteItem(index);
  });
  return el;
}

function clearRendered() {
  for (const el of rendered.values()) el.remove();
  rendered.clear();
}

function render() {
  const total = state.items.length;
  els.spacer.style.height = (total * ITEM_HEIGHT) + 'px';
  const ch = els.list.clientHeight;
  const start = Math.max(0, Math.floor(state.scrollTop / ITEM_HEIGHT) - BUFFER);
  const end = Math.min(total, start + Math.ceil(ch / ITEM_HEIGHT) + BUFFER * 2);

  // 移除视口外的元素
  for (const [idx, el] of rendered) {
    if (idx < start || idx >= end) { el.remove(); rendered.delete(idx); }
  }
  // 补齐视口内的元素
  for (let i = start; i < end; i++) {
    let el = rendered.get(i);
    if (!el) {
      el = createItemEl(state.items[i], i);
      el.style.top = (i * ITEM_HEIGHT) + 'px';
      els.spacer.appendChild(el);
      rendered.set(i, el);
    } else {
      el.classList.toggle('selected', i === state.selectedIndex);
    }
  }
}

// ---- 数据加载（游标分页） ----
async function loadMore() {
  if (state.loading || !state.hasMore) return;
  const token = searchToken;
  state.loading = true;
  setStatus('加载中…');

  const params = { text: state.query, maxResults: PAGE_SIZE, startTime: 0 };
  if (state.items.length) {
    // 以最后一条的访问时间为游标，拉取更早的记录
    params.endTime = state.items[state.items.length - 1].lastVisitTime;
  }

  let results;
  try {
    results = await chrome.history.search(params);
  } catch (e) {
    if (token === searchToken) { state.loading = false; setStatus('加载失败'); }
    return;
  }
  if (token !== searchToken) { state.loading = false; return; } // 已被新查询取代

  if (results.length < PAGE_SIZE) state.hasMore = false;
  const seen = new Set(state.items.map(it => it.url));
  const fresh = results.filter(r => !seen.has(r.url));
  if (fresh.length === 0 && results.length > 0) state.hasMore = false; // 无新增 → 已到边界
  state.items.push(...fresh);

  state.loading = false;
  render();
  updateEmpty();
  setStatus(countLabel());
}

// ---- 交互 ----
function openItem(item, e) {
  const background = !!(e && (e.ctrlKey || e.metaKey));
  chrome.tabs.create({ url: item.url, active: !background });
}

async function deleteItem(index) {
  const item = state.items[index];
  if (!item) return;
  try { await chrome.history.deleteUrl({ url: item.url }); } catch (e) { return; }
  state.items.splice(index, 1);
  if (state.selectedIndex > index) state.selectedIndex--;
  else if (state.selectedIndex >= state.items.length) state.selectedIndex = Math.max(0, state.items.length - 1);
  clearRendered();
  render();
  updateEmpty();
  setStatus(countLabel());
}

function moveSelection(delta) {
  if (!state.items.length) return;
  state.selectedIndex = Math.max(0, Math.min(state.items.length - 1, state.selectedIndex + delta));
  const top = state.selectedIndex * ITEM_HEIGHT;
  const bottom = top + ITEM_HEIGHT;
  const vTop = els.list.scrollTop;
  const vBottom = vTop + els.list.clientHeight;
  if (top < vTop) els.list.scrollTop = top;
  else if (bottom > vBottom) els.list.scrollTop = bottom - els.list.clientHeight;
  render();
}

function openSelected(e) {
  const item = state.items[state.selectedIndex];
  if (item) openItem(item, e || {});
}

async function doSearch(q) {
  searchToken++;                 // 作废所有在途请求
  state.query = q;
  state.items = [];
  state.hasMore = true;
  state.selectedIndex = 0;
  clearRendered();
  els.list.scrollTop = 0;
  state.scrollTop = 0;
  els.spacer.style.height = '0px';
  updateEmpty();
  await loadMore();
}

// ---- 事件绑定 ----
let searchTimer = null;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => doSearch(els.search.value.trim()), DEBOUNCE_MS);
});

els.search.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); moveSelection(1); break;
    case 'ArrowUp': e.preventDefault(); moveSelection(-1); break;
    case 'Enter': e.preventDefault(); openSelected(e); break;
    case 'Delete':
      if (!els.search.value) { e.preventDefault(); deleteItem(state.selectedIndex); }
      break;
    case 'Escape':
      if (els.search.value) { els.search.value = ''; doSearch(''); }
      else window.close();
      break;
  }
});

let rafPending = false;
els.list.addEventListener('scroll', () => {
  state.scrollTop = els.list.scrollTop;
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; render(); });
  }
  if (state.hasMore && !state.loading) {
    const threshold = ITEM_HEIGHT * 12;
    if (els.list.scrollTop + els.list.clientHeight >= els.list.scrollHeight - threshold) {
      loadMore();
    }
  }
}, { passive: true });

// 同步其它来源的删除（如用户在 chrome://history 里删了一条）
if (chrome.history.onVisitRemoved) {
  chrome.history.onVisitRemoved.addListener((data) => {
    if (!data) return;
    if (data.allHistory) {
      state.items = []; state.hasMore = false; clearRendered(); render(); updateEmpty(); return;
    }
    if (data.urls && data.urls.length) {
      const remove = new Set(data.urls);
      let changed = false;
      for (let i = state.items.length - 1; i >= 0; i--) {
        if (remove.has(state.items[i].url)) { state.items.splice(i, 1); changed = true; }
      }
      if (changed) {
        if (state.selectedIndex >= state.items.length) state.selectedIndex = Math.max(0, state.items.length - 1);
        clearRendered(); render(); updateEmpty();
      }
    }
  });
}

// ---- 初始化 ----
doSearch('');
els.search.focus();
