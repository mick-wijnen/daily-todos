/* ==========================================
   SUPABASE INIT
   ========================================== */
const SUPABASE_URL = 'https://nvidmaogvugzbivsvtjh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oJUKziOZ1PRb1kr7JKhbJQ_GAoNj6aS';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ==========================================
   DATE HELPERS
   ========================================== */
function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDate(dateStr) {
  // Parse YYYY-MM-DD in local time (not UTC)
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDayLabel(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
}

function formatDateLong(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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
  const today = getToday();
  document.getElementById('day-label').textContent = formatDayLabel(today);
  document.getElementById('date-heading').textContent = formatDateLong(today);
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
  const wrapper = document.getElementById('add-form-wrapper');
  const btnOpen = document.getElementById('btn-open-add');
  const btnCancel = document.getElementById('btn-cancel-add');
  const form = document.getElementById('add-form');

  btnOpen.addEventListener('click', () => {
    wrapper.classList.add('open');
    document.getElementById('task-text').focus();
  });

  btnCancel.addEventListener('click', closeForm);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    await addTask();
  });
}

function closeForm() {
  document.getElementById('add-form-wrapper').classList.remove('open');
  document.getElementById('add-form').reset();
}

async function addTask() {
  const text = document.getElementById('task-text').value.trim();
  const category = document.getElementById('task-category').value.trim();
  const note = document.getElementById('task-note').value.trim();

  if (!text) return;

  const btn = document.querySelector('#add-form .btn-primary');
  btn.disabled = true;
  btn.textContent = 'Adding…';

  const { error } = await db.from('todos').insert({
    date: getToday(),
    text,
    category: category || null,
    note: note || null,
    status: 'pending',
    carried_over: false,
  });

  btn.disabled = false;
  btn.textContent = 'Add Task';

  if (error) {
    console.error('Error adding task:', error);
    showToast('Failed to add task. Check console.');
    return;
  }

  closeForm();
  await loadTodayTasks();
}

/* ==========================================
   CARRY OVER
   ========================================== */
async function carryOverTasks() {
  const today = getToday();

  const [{ data: pendingOld, error: e1 }, { data: todayCarried, error: e2 }] =
    await Promise.all([
      db.from('todos').select('*').lt('date', today).eq('status', 'pending'),
      db.from('todos').select('text').eq('date', today).eq('carried_over', true),
    ]);

  if (e1 || e2 || !pendingOld || pendingOld.length === 0) return 0;

  const alreadyCarried = new Set((todayCarried || []).map(t => t.text));
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

  if (toInsert.length > 0) {
    const { error } = await db.from('todos').insert(toInsert);
    if (error) { console.error('Carry-over insert failed:', error); return 0; }
  }

  return toInsert.length;
}

/* ==========================================
   LOAD TODAY'S TASKS
   ========================================== */
async function loadTodayTasks() {
  const { data, error } = await db
    .from('todos')
    .select('*')
    .eq('date', getToday())
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading tasks:', error);
    showToast('Could not load tasks.');
    return;
  }

  const pending   = (data || []).filter(t => t.status === 'pending');
  const completed = (data || []).filter(t => t.status === 'done');

  renderPendingTasks(pending);
  renderCompletedTasks(completed);
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
  const badge     = document.getElementById('completed-count');

  container.innerHTML = '';
  badge.textContent = tasks.length;

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
  const { error } = await db
    .from('todos')
    .update({ status: checked ? 'done' : 'pending' })
    .eq('id', id);

  if (error) { console.error('Toggle error:', error); return; }
  await loadTodayTasks();
}

async function deleteTask(id) {
  const { error } = await db.from('todos').delete().eq('id', id);
  if (error) { console.error('Delete error:', error); return; }
  await loadTodayTasks();
}

/* ==========================================
   COMPLETED TOGGLE
   ========================================== */
function initCompletedToggle() {
  const btn  = document.getElementById('completed-toggle');
  const list = document.getElementById('completed-tasks');
  const icon = document.getElementById('toggle-icon');

  btn.addEventListener('click', () => {
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

  const { data, error } = await db
    .from('todos')
    .select('*')
    .lt('date', getToday())
    .order('date', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    container.innerHTML = '<div class="empty-state"><p>Failed to load history.</p></div>';
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No history yet — tasks will appear here after completed days.</p></div>';
    return;
  }

  // Group by date
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
