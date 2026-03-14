// =============================================
// ATTENDANCE TAKER — APP.JS
// Date-based attendance, Firebase Realtime DB
// Structure: attendance/YYYY-MM-DD/memberId = 'present'|'absent'
// =============================================

// ── FIREBASE CONFIG ──
const DEFAULT_CONFIG = {
  apiKey:            "AIzaSyB1sbIH5QSKjBggetUBHIvlE-wg-mRN5N8",
  authDomain:        "kalolyouvakmandaldata.firebaseapp.com",
  databaseURL:       "https://kalolyouvakmandaldata-default-rtdb.firebaseio.com",
  projectId:         "kalolyouvakmandaldata",
  storageBucket:     "kalolyouvakmandaldata.firebasestorage.app",
  messagingSenderId: "737809672101",
  appId:             "1:737809672101:web:33c53dd73a4a9fca262a4c",
  measurementId:     "G-HD59WMWS4H"
};

// Global state
let db = null;
let members = {};      // { memberId: { name, phone } }
let attendance = {};   // { 'YYYY-MM-DD': { memberId: 'present'|'absent' } }
let currentDate = '';  // currently selected date in attendance tab

// ── HELPERS ──
const $ = id => document.getElementById(id);

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';
  el.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m,10)-1]} ${y}`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

// ── INIT ──
function initApp(config) {
  try {
    firebase.initializeApp(config);
    db = firebase.database();
    setConnected(true);
    listenToData();
    toast('Connected to Firebase!');
  } catch (e) {
    setConnected(false);
    toast('Firebase error: ' + e.message, 'error');
  }
}

function setConnected(on) {
  $('status-dot').classList.toggle('connected', on);
  $('status-text').textContent = on ? 'Connected' : 'Offline';
}

// ── REALTIME LISTENERS ──
function listenToData() {
  db.ref('members').on('value', snap => {
    members = snap.val() || {};
    renderMembers();
    if (currentDate) renderAttendanceList(currentDate);
  });

  db.ref('attendance').on('value', snap => {
    attendance = snap.val() || {};
    if (currentDate) renderAttendanceList(currentDate);
  });
}

// =============================================
// ── MEMBERS ──
// =============================================
$('add-member-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!db) return toast('Firebase not connected.', 'error');
  const name  = $('member-name').value.trim();
  const phone = $('member-phone').value.trim();
  if (!name) return toast('Name is required.', 'warning');

  const btn = $('add-member-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spin"></span> Adding…';
  try {
    await db.ref('members').push().set({ name, phone, createdAt: Date.now() });
    $('add-member-form').reset();
    toast(`${name} added!`);
    switchTab('members'); // go back to list
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '+ Add Member';
  }
});

function renderMembers() {
  const list  = $('member-list');
  const addList = $('add-member-list'); // Get the new list container in the add panel
  const count = $('member-count');
  const addCount = $('add-member-count'); // Get the new count container
  const keys  = Object.keys(members);
  
  count.textContent = keys.length;
  if(addCount) addCount.textContent = keys.length;

  if (keys.length === 0) {
    const emptyHtml = `<div class="empty-state"><div class="empty-icon">👥</div><p>No members yet.<br>Add your first member above.</p></div>`;
    list.innerHTML = emptyHtml;
    if(addList) addList.innerHTML = emptyHtml;
    return;
  }

  // Generate HTML for the regular member list (NO delete button)
  list.innerHTML = keys.map(id => {
    const m = members[id];
    return `<div class="member-card">
      <div class="member-info">
        <div class="member-name">${escHtml(m.name)}</div>
        <div class="member-phone">${m.phone ? '📱 ' + escHtml(m.phone) : 'No phone'}</div>
      </div>
    </div>`;
  }).join('');
  
  // Generate HTML for the list in the add panel (WITH delete button)
  if(addList) {
    addList.innerHTML = keys.map(id => {
      const m = members[id];
      return `<div class="member-card">
        <div class="member-info">
          <div class="member-name">${escHtml(m.name)}</div>
          <div class="member-phone">${m.phone ? '📱 ' + escHtml(m.phone) : 'No phone'}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="promptDeleteMember('${id}','${escHtml(m.name)}', this)">🗑</button>
      </div>`;
    }).join('');
  }
}

let pendingDeleteId = null;

function promptDeleteMember(id, name, btn) {
  if (pendingDeleteId === id) {
    // Second tap - actually delete
    executeDeleteMember(id, name);
  } else {
    // First tap - show confirm state
    pendingDeleteId = id;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = 'Sure? ⚠️';
    btn.style.background = 'var(--red)';
    btn.style.color = '#fff';
    
    // Reset after 3 seconds
    setTimeout(() => {
      if (pendingDeleteId === id) {
        pendingDeleteId = null;
        btn.innerHTML = originalHtml;
        btn.style.background = '';
        btn.style.color = '';
      }
    }, 3000);
  }
}

async function executeDeleteMember(id, name) {
  pendingDeleteId = null;
  try {
    await db.ref('members/' + id).remove();
    // Remove from all date attendance records
    const updates = {};
    Object.keys(attendance).forEach(date => {
      if (attendance[date] && attendance[date][id]) {
        updates[`attendance/${date}/${id}`] = null;
      }
    });
    if (Object.keys(updates).length) await db.ref().update(updates);
    toast(`${name} removed.`);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

// =============================================
// ── ATTENDANCE (date-based) ──
// =============================================
$('att-date-picker').addEventListener('change', function() {
  currentDate = this.value;
  if (currentDate) renderAttendanceList(currentDate);
});

function renderAttendanceList(date) {
  const list     = $('attendance-list');
  const statsBar = $('att-stats');
  const memberKeys = Object.keys(members);

  if (memberKeys.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>Add members first from the Members tab.</p></div>`;
    statsBar.innerHTML = '';
    return;
  }

  const att = (attendance[date] || {});

  // Stats
  let present = 0, absent = 0, notMarked = 0;
  memberKeys.forEach(mid => {
    if      (att[mid] === 'present') present++;
    else if (att[mid] === 'absent')  absent++;
    else                              notMarked++;
  });

  statsBar.innerHTML = `
    <div class="stat-chip green"><span class="val">${present}</span>Present</div>
    <div class="stat-chip red"><span class="val">${absent}</span>Absent</div>
    <div class="stat-chip blue"><span class="val">${notMarked}</span>Pending</div>
  `;

  list.innerHTML = memberKeys.map(mid => {
    const m = members[mid];
    const initials = m.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const status   = att[mid] || '';
    return `<div class="attendance-row">
      <div class="attendance-member">
        <div class="member-avatar" style="width:36px;height:36px;font-size:13px">${initials}</div>
        <div class="member-info">
          <div class="member-name">${escHtml(m.name)}</div>
          ${m.phone ? `<div class="member-phone">${escHtml(m.phone)}</div>` : ''}
        </div>
      </div>
      <div class="attendance-actions">
        <button class="att-btn present ${status === 'present' ? 'selected' : ''}"
          onclick="markAtt('${date}','${mid}','present')">✅</button>
        <button class="att-btn absent ${status === 'absent' ? 'selected' : ''}"
          onclick="markAtt('${date}','${mid}','absent')">❌</button>
      </div>
    </div>`;
  }).join('');
}

async function markAtt(date, memberId, status) {
  if (!db) return toast('Not connected.', 'error');
  try {
    await db.ref(`attendance/${date}/${memberId}`).set(status);
    if (!attendance[date]) attendance[date] = {};
    attendance[date][memberId] = status;
    renderAttendanceList(date);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

$('mark-all-present').addEventListener('click', async () => {
  if (!currentDate) return toast('Pick a date first.', 'warning');
  if (!db)          return toast('Not connected.', 'error');
  const updates = {};
  Object.keys(members).forEach(mid => {
    updates[`attendance/${currentDate}/${mid}`] = 'present';
  });
  await db.ref().update(updates);
  toast('All marked Present!');
});

$('mark-all-absent').addEventListener('click', async () => {
  if (!currentDate) return toast('Pick a date first.', 'warning');
  if (!db)          return toast('Not connected.', 'error');
  const updates = {};
  Object.keys(members).forEach(mid => {
    updates[`attendance/${currentDate}/${mid}`] = 'absent';
  });
  await db.ref().update(updates);
  toast('All marked Absent!');
});

// =============================================
// ── REPORTS ──
// =============================================
$('report-date-pick').addEventListener('change', function() {
  if (this.value) generateReport(this.value);
});

$('generate-report-btn').addEventListener('click', () => {
  const d = $('report-date-pick').value;
  if (!d) return toast('Pick a date first.', 'warning');
  generateReport(d);
});

$('export-report-btn').addEventListener('click', exportCSV);

function generateReport(date) {
  const wrap = $('report-wrap');
  const memberKeys = Object.keys(members);

  if (memberKeys.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>No members found.</p></div>`;
    return;
  }

  const att = (attendance[date] || {});
  let present = 0, absent = 0, notMarked = 0;
  memberKeys.forEach(mid => {
    if      (att[mid] === 'present') present++;
    else if (att[mid] === 'absent')  absent++;
    else                              notMarked++;
  });

  const statsHtml = `<div class="stats-bar">
    <div class="stat-chip green"><span class="val">${present}</span>Present</div>
    <div class="stat-chip red"><span class="val">${absent}</span>Absent</div>
    <div class="stat-chip blue"><span class="val">${notMarked}</span>Pending</div>
  </div>`;

  const dateLabel = `<div class="section-label" style="margin-bottom:8px">📅 ${formatDate(date)}</div>`;

  let tbody = memberKeys.map((mid, i) => {
    const m  = members[mid];
    const st = att[mid];
    const badge = st === 'present'
      ? `<span class="badge badge-present">Present</span>`
      : st === 'absent'
      ? `<span class="badge badge-absent">Absent</span>`
      : `<span class="badge badge-na">—</span>`;
    return `<tr>
      <td>${i + 1}</td>
      <td>${escHtml(m.name)}</td>
      <td>${m.phone ? escHtml(m.phone) : '—'}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = statsHtml + dateLabel + `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Status</th></tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;
}

function exportCSV() {
  const date = $('report-date-pick').value;
  const memberKeys = Object.keys(members);
  if (!date || memberKeys.length === 0) return toast('No data to export.', 'warning');

  const att = (attendance[date] || {});
  let csv = `Date,Member Name,Phone,Status\n`;
  memberKeys.forEach(mid => {
    const m  = members[mid];
    const st = att[mid] || 'Not Marked';
    csv += `"${date}","${m.name}","${m.phone || ''}","${st}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `attendance-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported!');
}

// =============================================
// ── TAB NAVIGATION ──
// =============================================
function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.section').forEach(sec => {
    sec.classList.toggle('active', sec.id === 'section-' + tab);
  });
}

document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// =============================================
// ── FIREBASE CONFIG MODAL ──
// =============================================
$('config-form').addEventListener('submit', e => {
  e.preventDefault();
  const config = {
    apiKey:            $('cfg-apiKey').value.trim(),
    authDomain:        $('cfg-authDomain').value.trim(),
    databaseURL:       $('cfg-databaseURL').value.trim(),
    projectId:         $('cfg-projectId').value.trim(),
    storageBucket:     $('cfg-storageBucket').value.trim(),
    messagingSenderId: $('cfg-messagingSenderId').value.trim(),
    appId:             $('cfg-appId').value.trim(),
  };
  if (!config.apiKey || !config.databaseURL) {
    return toast('API Key and Database URL required.', 'error');
  }
  $('config-modal').style.display = 'none';
  initApp(config);
});

$('dismiss-modal-btn').addEventListener('click', () => {
  $('config-modal').style.display = 'none';
});

// ── AUTO-CONNECT ON LOAD ──
window.addEventListener('DOMContentLoaded', () => {
  // Pre-fill modal
  Object.entries(DEFAULT_CONFIG).forEach(([k, v]) => {
    const el = $('cfg-' + k);
    if (el) el.value = v;
  });

  // Hide modal, auto-connect
  $('config-modal').style.display = 'none';
  initApp(DEFAULT_CONFIG);

  // Default dates to today
  const t = today();
  $('att-date-picker').value  = t;
  $('report-date-pick').value = t;
  currentDate = t;

  switchTab('members');
});
