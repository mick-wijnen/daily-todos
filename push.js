/* ==========================================
   SUPABASE REST — direct fetch, explicit headers
   ========================================== */
const SUPABASE_URL = 'https://nvidmaogvugzbivsvtjh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oJUKziOZ1PRb1kr7JKhbJQ_GAoNj6aS';
const REST = `${SUPABASE_URL}/rest/v1`;

async function dbPost(path, rows) {
  const res = await fetch(`${REST}/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

/* ==========================================
   URL PARAMETER SCHEMA
   ?data=<base64(JSON)>

   JSON shape:
   {
     "date": "YYYY-MM-DD",   // optional — defaults to today
     "tasks": [
       { "text": "...", "category": "...", "note": "..." }
     ]
   }
   ========================================== */

/* ==========================================
   HELPERS
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

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showError(title, body) {
  document.getElementById('push-error').style.display = 'block';
  document.getElementById('push-content').style.display = 'none';
  document.getElementById('push-error-title').textContent = title;
  document.getElementById('push-error-body').textContent = body || '';
}

/* ==========================================
   PARSE & RENDER
   ========================================== */
function parsePushData() {
  const raw = new URLSearchParams(window.location.search).get('data');
  if (!raw) throw new Error('Missing ?data= parameter.');

  let json;
  try {
    json = JSON.parse(atob(raw));
  } catch {
    throw new Error('Invalid base64 or JSON payload.');
  }

  if (!Array.isArray(json.tasks) || json.tasks.length === 0) {
    throw new Error('Payload must include a non-empty "tasks" array.');
  }

  for (const [i, t] of json.tasks.entries()) {
    if (typeof t.text !== 'string' || !t.text.trim()) {
      throw new Error(`Task at index ${i} is missing a "text" field.`);
    }
  }

  return {
    date: typeof json.date === 'string' ? json.date : getToday(),
    tasks: json.tasks,
  };
}

function render(date, tasks) {
  document.getElementById('push-content').style.display = 'block';
  document.getElementById('push-date-label').textContent = formatDayLabel(date);
  document.getElementById('push-task-count').textContent =
    `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
  document.getElementById('push-heading').textContent = formatDateLong(date);

  const preview = document.getElementById('push-preview');
  preview.innerHTML = '';

  tasks.forEach((task, i) => {
    const el = document.createElement('div');
    el.className = 'push-task-item';
    el.innerHTML = `
      <span class="push-task-num">${i + 1}.</span>
      <div class="task-body">
        <div class="task-top">
          <span class="task-text">${esc(task.text)}</span>
          ${task.category ? `<span class="category-badge">${esc(task.category)}</span>` : ''}
        </div>
        ${task.note ? `<div class="task-note">${esc(task.note)}</div>` : ''}
      </div>
    `;
    preview.appendChild(el);
  });
}

/* ==========================================
   CONFIRM & INSERT
   ========================================== */
async function confirmPush(date, tasks) {
  const btn = document.getElementById('btn-confirm');
  btn.disabled = true;
  btn.textContent = 'Pushing…';

  try {
    await dbPost('todos', tasks.map(t => ({
      date,
      text: t.text.trim(),
      category: t.category?.trim() || null,
      note: t.note?.trim() || null,
      status: 'pending',
      carried_over: false,
    })));
    window.location.href = 'https://mick-wijnen.github.io/daily-todos/';
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Confirm & Push';
    showError('Supabase insert failed', err.message);
  }
}

/* ==========================================
   INIT
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
  let date, tasks;

  try {
    ({ date, tasks } = parsePushData());
  } catch (err) {
    showError('Could not load tasks', err.message);
    return;
  }

  render(date, tasks);

  document.getElementById('btn-confirm').addEventListener('click', () => {
    confirmPush(date, tasks);
  });
});
