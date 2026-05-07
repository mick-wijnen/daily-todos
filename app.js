/* ==========================================
   SUPABASE REST — direct fetch, explicit headers
   The sb_publishable_* key is not a JWT so the
   JS SDK does not attach headers correctly.
   ========================================== */
const SUPABASE_URL = 'https://nvidmaogvugzbivsvtjh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oJUKziOZ1PRb1kr7JKhbJQ_GAoNj6aS';
const REST = `${SUPABASE_URL}/rest/v1`;

function baseHeaders(extra = {}) {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

async function dbGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${REST}/${path}${qs ? '?' + qs : ''}`, {
    headers: baseHeaders(),
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function dbPost(path, rows) {
  const res = await fetch(`${REST}/${path}`, {
    method: 'POST',
    headers: baseHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
}

async function dbPatch(path, params, data) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${REST}/${path}?${qs}`, {
    method: 'PATCH',
    headers: baseHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${await res.text()}`);
}

async function dbDelete(path, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${REST}/${path}?${qs}`, {
    method: 'DELETE',
    headers: baseHeaders(),
  });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}: ${await res.text()}`);
}

/* ==========================================
   DATE HELPERS
   ========================================== */
function getToday() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDayLabel(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
}

function formatDateLong(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

/* active date — earliest date ≥ today with pending tasks; updated on each load */
let activeDate = getToday();

function setDateDisplay(dateStr) {
  document.getElementById('day-label').textContent = formatDayLabel(dateStr);
  document.getElementById('date-heading').textContent = formatDateLong(dateStr);
}

/* ==========================================
   TOAST
   ========================================== */
let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

/* ==========================================
   INIT
   ========================================== */
document.addEventListener('DOMContentLoaded', async () => {
  initDateDisplay();
  initNav();
  initForm();
  initCompletedToggle();

  setLoading(true);
  const carried = await carryOverTasks();
  await loadTodayTasks();
  setLoading(false);

  if (carried > 0) {
    showToast(`${carried} task${carried === 1 ? '' : 's'} carried over from previous days`);
  }
});

function setLoading(active) {
  document.getElementById('loading-today').classList.toggle('active', active);
}

function initDateDisplay() {
  setDateDisplay(getToday()); // placeholder until tasks load
}

/* ==========================================
   NAVIGATION
   ========================================== */
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

function switchView(view) {
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${view}`);
  });
  if (view === 'history') loadHistory();
}

/* ==========================================
   ADD TASK FORM
   ========================================== */
function initForm() {
  document.getElementById('btn-open-add').addEventListener('click', () => {
    document.getElementById('add-form-wrapper').classList.add('open');
    document.getElementById('task-text').focus();
  });
  document.getElementById('btn-cancel-add').addEventListener('click', closeForm);
  document.getElementById('add-form').addEventListener('submit', async e => {
    e.preventDefault();
    await addTask();
  });
}

function closeForm() {
  document.getElementById('add-form-wrapper').classList.remove('open');
  document.getElementById('add-form').reset();
}

async function addTask() {
  const text     = document.getElementById('task-text').value.trim();
  const category = document.getElementById('task-category').value.trim();
  const note     = document.getElementById('task-note').value.trim();
  if (!text) return;

  const btn = document.querySelector('#add-form .btn-primary');
  btn.disabled = true;
  btn.textContent = 'Adding…';

  try {
    await dbPost('todos', {
      date: activeDate,
      text,
      category: category || null,
      note: note || null,
      status: 'pending',
      carried_over: false,
    });
    closeForm();
    await loadTodayTasks();
  } catch (err) {
    console.error(err);
    showToast('Failed to add task.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Task';
  }
}

/* ==========================================
   CARRY OVER
   Fetches all pending tasks from before today,
   then inserts any not already present in today's list.
   ========================================== */
async function carryOverTasks() {
  const today = getToday();

  try {
    const [pendingOld, todayCarried] = await Promise.all([
      dbGet('todos', { 'date': `lt.${today}`, 'status': 'eq.pending' }),
      dbGet('todos', { 'date': `eq.${today}`, 'carried_over': 'eq.true', 'select': 'text' }),
    ]);

    if (!pendingOld.length) return 0;

    const alreadyCarried = new Set(todayCarried.map(t => t.text));
    const seen = new Set();
    const toInsert = [];

    for (const task of pendingOld) {
      if (!alreadyCarried.has(task.text) && !seen.has(task.text)) {
        seen.add(task.text);
        toInsert.push({
          date: today,
          text: task.text,
          category: task.category,
          note: task.note,
          status: 'pending',
          carried_over: true,
        });
      }
    }

    if (toInsert.length) await dbPost('todos', toInsert);
    return toInsert.length;
  } catch (err) {
    console.error('Carry-over failed:', err);
    return 0;
  }
}

/* ==========================================
   LOAD TASKS
   Queries all todos from today onwards (date >= today),
   then displays the earliest date that has pending tasks.
   This means tasks prepared the evening before for tomorrow
   appear as soon as you open the app the next day.
   ========================================== */
async function loadTodayTasks() {
  const today = getToday();
  try {
    const upcoming = await dbGet('todos', {
      'date': `gte.${today}`,
      'order': 'date.asc,created_at.asc',
    });

    // Pick the earliest date that has at least one pending task; fall back to today
    const firstPending = upcoming.find(t => t.status === 'pending');
    activeDate = firstPending ? firstPending.date : today;

    setDateDisplay(activeDate);

    const forDate = upcoming.filter(t => t.date === activeDate);
    renderPendingTasks(forDate.filter(t => t.status === 'pending'));
    renderCompletedTasks(forDate.filter(t => t.status === 'done'));
  } catch (err) {
    console.error('Load tasks failed:', err);
    showToast('Could not load tasks.');
  }
}

/* ==========================================
   RENDER TASKS
   ========================================== */
function renderPendingTasks(tasks) {
  const container  = document.getElementById('pending-tasks');
  const emptyState = document.getElementById('empty-pending');
  container.innerHTML = '';

  if (tasks.length === 0) {
    container.appendChild(emptyState);
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  tasks.forEach(t => container.appendChild(createTaskEl(t)));
}

function renderCompletedTasks(tasks) {
  const container = document.getElementById('completed-tasks');
  document.getElementById('completed-count').textContent = tasks.length;
  container.innerHTML = '';
  tasks.forEach(t => container.appendChild(createTaskEl(t)));
}

function createTaskEl(task) {
  const item = document.createElement('div');
  item.className = 'task-item' + (task.status === 'done' ? ' done' : '');
  item.dataset.id = task.id;

  item.innerHTML = `
    <input type="checkbox" class="task-checkbox" ${task.status === 'done' ? 'checked' : ''} aria-label="Toggle task">
    <div class="task-body">
      <div class="task-top">
        <span class="task-text">${esc(task.text)}</span>
        ${task.category ? `<span class="category-badge">${esc(task.category)}</span>` : ''}
        ${task.carried_over ? `<span class="carried-badge">carried over</span>` : ''}
      </div>
      ${task.note ? `<div class="task-note">${esc(task.note)}</div>` : ''}
    </div>
    <div class="task-actions">
      <button class="btn-delete" title="Delete task" aria-label="Delete task">×</button>
    </div>
  `;

  item.querySelector('.task-checkbox').addEventListener('change', async e => {
    await toggleTask(task.id, e.target.checked);
  });
  item.querySelector('.btn-delete').addEventListener('click', async () => {
    await deleteTask(task.id);
  });

  return item;
}

/* ==========================================
   TASK ACTIONS
   ========================================== */
async function toggleTask(id, checked) {
  try {
    await dbPatch('todos', { 'id': `eq.${id}` }, { status: checked ? 'done' : 'pending' });
    await loadTodayTasks();
  } catch (err) {
    console.error('Toggle failed:', err);
  }
}

async function deleteTask(id) {
  try {
    await dbDelete('todos', { 'id': `eq.${id}` });
    await loadTodayTasks();
  } catch (err) {
    console.error('Delete failed:', err);
  }
}

/* ==========================================
   COMPLETED TOGGLE
   ========================================== */
function initCompletedToggle() {
  const list = document.getElementById('completed-tasks');
  const icon = document.getElementById('toggle-icon');

  document.getElementById('completed-toggle').addEventListener('click', () => {
    const isOpen = list.classList.toggle('open');
    icon.classList.toggle('open', isOpen);
  });
}

/* ==========================================
   HISTORY
   ========================================== */
async function loadHistory() {
  const container = document.getElementById('history-container');
  container.innerHTML = '<div class="loading-state active" style="padding:32px 0"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';

  try {
    const data = await dbGet('todos', {
      'date': `lt.${getToday()}`,
      'order': 'date.desc,created_at.asc',
    });

    if (!data.length) {
      container.innerHTML = '<div class="empty-state"><p>No history yet — tasks will appear here after completed days.</p></div>';
      return;
    }

    const byDate = {};
    for (const task of data) {
      if (!byDate[task.date]) byDate[task.date] = [];
      byDate[task.date].push(task);
    }

    container.innerHTML = '';

    for (const [date, tasks] of Object.entries(byDate)) {
      const done  = tasks.filter(t => t.status === 'done').length;
      const total = tasks.length;
      const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

      const section = document.createElement('div');
      section.className = 'history-day';
      section.innerHTML = `
        <div class="history-day-header">
          <div class="history-day-label">${formatDayLabel(date)}</div>
          <div class="history-day-date">${formatDateLong(date)}</div>
          <div class="history-day-stats">${done} of ${total} completed</div>
          <div class="history-progress">
            <div class="history-progress-bar" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="task-list history-task-list"></div>
      `;

      const list = section.querySelector('.history-task-list');
      tasks.forEach(t => list.appendChild(createHistoryTaskEl(t)));
      container.appendChild(section);
    }
  } catch (err) {
    console.error('History failed:', err);
    container.innerHTML = '<div class="empty-state"><p>Failed to load history.</p></div>';
  }
}

function createHistoryTaskEl(task) {
  const item = document.createElement('div');
  item.className = 'task-item' + (task.status === 'done' ? ' done' : '');
  item.innerHTML = `
    <div class="task-check-static ${task.status === 'done' ? 'checked' : ''}"></div>
    <div class="task-body">
      <div class="task-top">
        <span class="task-text">${esc(task.text)}</span>
        ${task.category ? `<span class="category-badge">${esc(task.category)}</span>` : ''}
        ${task.carried_over ? `<span class="carried-badge">carried over</span>` : ''}
      </div>
      ${task.note ? `<div class="task-note">${esc(task.note)}</div>` : ''}
    </div>
  `;
  return item;
}

/* ==========================================
   UTILS
   ========================================== */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
