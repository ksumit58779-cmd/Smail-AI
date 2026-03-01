'use strict';

let currentEmail = null;
window._emails   = [];

document.addEventListener('DOMContentLoaded', function() {
  loadEmails();
  loadWeekCount();
  loadContacts();
  loadScheduled();
});

// ── FETCH WRAPPER ─────────────────────────────
// Always returns object. Never crashes. If Flask sends HTML → {error}
async function api(url, method, body) {
  try {
    var opts = {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    var res  = await fetch(url, opts);
    var text = await res.text();
    try { return JSON.parse(text); }
    catch (e) { return { error: 'Server error (' + res.status + '). Check terminal.' }; }
  } catch (err) {
    return { error: err.message };
  }
}

// ── EMAILS ────────────────────────────────────
async function loadEmails() {
  var list = document.getElementById('email-list');
  list.innerHTML = '<div class="center-state"><div class="spin"></div><p>Loading...</p></div>';

  var data = await api('/emails', 'GET');
  if (data.error) {
    list.innerHTML = '<div class="center-state"><p style="color:var(--danger)">⚠ ' + esc(data.error) + '</p></div>';
    return;
  }
  if (!data.length) {
    list.innerHTML = '<div class="center-state"><p>No emails found</p></div>';
    return;
  }
  window._emails = data;
  var badge = document.getElementById('inbox-count');
  if (badge) badge.textContent = data.length;

  list.innerHTML = '';
  for (var i = 0; i < data.length; i++) {
    (function(email) {
      var item    = document.createElement('div');
      item.className = 'email-item';
      var sender  = cleanSender(email.from);
      item.innerHTML =
        '<div class="ei-from">'    + esc(sender)                           + '</div>' +
        '<div class="ei-subject">' + esc(email.subject || '(no subject)')  + '</div>' +
        '<div class="ei-date">'    + fmtDate(email.date)                   + '</div>';
      item.onclick = function() { openEmail(email, item); };
      list.appendChild(item);
    })(data[i]);
  }
}

function openEmail(email, el) {
  document.querySelectorAll('.email-item').forEach(function(x) { x.classList.remove('active'); });
  el.classList.add('active');
  currentEmail = email;

  document.getElementById('pane-empty').classList.add('hidden');
  document.getElementById('email-open').classList.remove('hidden');

  var sender = cleanSender(email.from);
  document.getElementById('open-ava').textContent     = (sender[0] || '?').toUpperCase();
  document.getElementById('open-from').textContent    = sender;
  document.getElementById('open-date').textContent    = fmtDate(email.date);
  document.getElementById('open-subject').textContent = email.subject || '(no subject)';
  document.getElementById('open-body').textContent    = email.body    || '(empty)';

  var out = document.getElementById('ai-output');
  out.classList.add('hidden');
  out.textContent = '';

  document.getElementById('split').classList.add('pane-open');
}

function closeReadingPane() {
  document.getElementById('split').classList.remove('pane-open');
}

// ── ANALYZE ───────────────────────────────────
async function analyzeCurrentEmail() {
  if (!currentEmail) { toast('Select an email first', 'err'); return; }
  var btn = document.querySelector('.analyze-btn');
  var out = document.getElementById('ai-output');
  btn.textContent = 'Analyzing...'; btn.disabled = true;
  out.classList.remove('hidden');
  out.innerHTML = '<div class="spin" style="margin:0 auto"></div>';

  var data = await api('/analyze', 'POST', {
    subject: currentEmail.subject,
    sender:  currentEmail.from,
    body:    currentEmail.body
  });
  btn.textContent = 'Analyze'; btn.disabled = false;
  if (data.error) { out.textContent = '⚠ ' + data.error; return; }
  out.textContent = data.analysis;
  toast('Analysis done', 'ok');
}

// ── AI COMMAND ────────────────────────────────
async function runCommand() {
  var input = document.getElementById('ai-cmd-input');
  var cmd   = input.value.trim();
  if (!cmd) { toast('Enter a command', 'err'); return; }

  var btn = document.querySelector('#cmdpanel-ai .big-btn');
  var res = document.getElementById('cmd-result');
  btn.disabled = true; btn.textContent = 'Running...';
  res.classList.remove('hidden'); res.textContent = 'Smail AI is thinking...';

  var data = await api('/command', 'POST', { command: cmd });
  btn.disabled = false; btn.textContent = 'Run Command';

  if (data.error) { res.textContent = '⚠ ' + data.error; toast(data.error, 'err'); return; }

  if (data.action === 'send_email')     { res.textContent = '✅ ' + data.message + '\nSent to: ' + data.to; toast('Email sent', 'ok'); input.value = ''; }
  else if (data.action === 'analyze_email') { res.textContent = '📧 ' + (data.email ? data.email.subject : '') + '\n\n' + data.analysis; toast('Analysis done', 'ok'); }
  else if (data.action === 'count_emails')  { res.textContent = '📊 ' + data.message; loadWeekCount(); toast(data.message, 'ok'); }
  else if (data.action === 'delete_email')  { res.textContent = '🗑 ' + data.message; loadEmails(); toast('Done', 'ok'); }
  else if (data.action === 'reply_email')   { res.textContent = '↩ ' + data.message; toast('Reply sent', 'ok'); }
  else { res.textContent = data.message || 'Done.'; }
}

function fillCmd(el) { document.getElementById('ai-cmd-input').value = el.textContent; }

// ── SEND EMAIL ────────────────────────────────
async function sendEmailManual() {
  var to = document.getElementById('s-to').value.trim();
  var subject = document.getElementById('s-subject').value.trim();
  var body = document.getElementById('s-body').value.trim();
  if (!to || !subject || !body) { toast('Fill all fields', 'err'); return; }

  var btn = document.querySelector('#cmdpanel-send .big-btn');
  setBtn(btn, true, 'Sending...');
  var data = await api('/send', 'POST', { to: to, subject: subject, body: body });
  setBtn(btn, false, 'Send Email');
  if (data.error) { toast(data.error, 'err'); return; }
  toast('Email sent', 'ok'); closeCmd(); clearFields('s-to', 's-subject', 's-body');
}

// ── CONTACTS ──────────────────────────────────
async function saveContact() {
  var name  = document.getElementById('c-name').value.trim();
  var email = document.getElementById('c-email').value.trim();
  if (!name || !email) { toast('Fill all fields', 'err'); return; }

  var btn = document.querySelector('#cmdpanel-contact .big-btn');
  setBtn(btn, true, 'Saving...');
  // Route: /contacts/add  POST
  var data = await api('/contacts/add', 'POST', { name: name, email: email });
  setBtn(btn, false, 'Save Contact');
  if (data.error) { toast(data.error, 'err'); return; }
  toast(name + ' saved', 'ok'); closeCmd(); clearFields('c-name', 'c-email'); loadContacts();
}

async function loadContacts() {
  var grid = document.getElementById('contacts-grid');
  if (!grid) return;
  var data = await api('/contacts', 'GET');
  if (data.error || !data.length) {
    grid.innerHTML = '<div class="center-state"><div class="empty-glyph">👤</div><p>No contacts yet. Tap + Add</p></div>';
    return;
  }
  var html = '';
  for (var i = 0; i < data.length; i++) {
    var c   = data[i];
    var cid = c.id || '';
    html +=
      '<div class="contact-card">' +
        '<div class="c-ava">' + esc((c.name[0] || '?').toUpperCase()) + '</div>' +
        '<div class="c-name">'  + esc(c.name)  + '</div>' +
        '<div class="c-email">' + esc(c.email) + '</div>' +
        '<div class="card-actions">' +
          '<button class="card-btn edit" onclick="openEditContact(\'' + cid + '\',\'' + c.name.replace(/'/g,"&#39;") + '\',\'' + c.email.replace(/'/g,"&#39;") + '\')">✏ Edit</button>' +
          '<button class="card-btn del"  onclick="deleteContact(\'' + cid + '\',\'' + c.name.replace(/'/g,"&#39;") + '\')">✕ Remove</button>' +
        '</div>' +
      '</div>';
  }
  grid.innerHTML = html;
}

async function deleteContact(id, name) {
  if (!confirm('Remove contact ' + name + '?')) return;
  // Route: /contacts/delete/<id>  POST
  var data = await api('/contacts/delete/' + id, 'POST');
  if (data.error) { toast(data.error, 'err'); return; }
  toast(name + ' removed', 'ok'); loadContacts();
}

function openEditContact(id, name, email) {
  document.getElementById('edit-contact-id').value  = id;
  document.getElementById('edit-c-name').value      = name;
  document.getElementById('edit-c-email').value     = email;
  document.getElementById('edit-contact-overlay').classList.remove('hidden');
  document.getElementById('edit-contact-modal').classList.remove('hidden');
}
function closeEditContact() {
  document.getElementById('edit-contact-overlay').classList.add('hidden');
  document.getElementById('edit-contact-modal').classList.add('hidden');
}
async function submitEditContact() {
  var id    = document.getElementById('edit-contact-id').value;
  var name  = document.getElementById('edit-c-name').value.trim();
  var email = document.getElementById('edit-c-email').value.trim();
  if (!name || !email) { toast('Fill all fields', 'err'); return; }
  // Route: /contacts/edit/<id>  POST
  var data = await api('/contacts/edit/' + id, 'POST', { name: name, email: email });
  if (data.error) { toast(data.error, 'err'); return; }
  toast('Contact updated', 'ok'); closeEditContact(); loadContacts();
}

// ── SCHEDULED TASKS ───────────────────────────
// AM/PM display helper
function fmtAmPm(hour, minute) {
  var h      = parseInt(hour);
  var m      = String(minute).padStart(2, '0');
  var period = h < 12 ? 'AM' : 'PM';
  var disp   = h === 0 ? 12 : (h > 12 ? h - 12 : h);
  return disp + ':' + m + ' ' + period;
}

async function scheduleEmail() {
  var to     = document.getElementById('sc-to').value.trim();
  var subj   = document.getElementById('sc-subject').value.trim();
  var body   = document.getElementById('sc-body').value.trim();
  var hour   = document.getElementById('sc-hour').value;
  var minute = document.getElementById('sc-minute').value;
  if (!to || !subj || !body || hour === '') { toast('Fill all fields', 'err'); return; }

  var btn = document.querySelector('#cmdpanel-schedule .big-btn');
  setBtn(btn, true, 'Scheduling...');
  // Route: /schedule/add  POST
  var data = await api('/schedule/add', 'POST', { to: to, subject: subj, body: body, hour: +hour, minute: +minute });
  setBtn(btn, false, 'Schedule Daily');
  if (data.error) { toast(data.error, 'err'); return; }
  toast('Scheduled for ' + fmtAmPm(hour, minute) + ' daily', 'ok');
  closeCmd(); clearFields('sc-to', 'sc-subject', 'sc-body'); loadScheduled();
}

async function loadScheduled() {
  var list = document.getElementById('schedule-list');
  if (!list) return;
  // Route: /schedule/list  GET
  var data = await api('/schedule/list', 'GET');
  if (data.error || !data.length) {
    list.innerHTML = '<div class="center-state"><div class="empty-glyph">🕐</div><p>Nothing scheduled. Tap + Add</p></div>';
    return;
  }
  var html = '';
  for (var i = 0; i < data.length; i++) {
    var t    = data[i];
    var tid  = t.id || '';
    var time = fmtAmPm(t.hour, t.minute);
    html +=
      '<div class="sched-item">' +
        '<div class="sched-info">' +
          '<div class="sched-time">' + time + '</div>' +
          '<div>' +
            '<div class="sched-to">'      + esc(t.to)      + '</div>' +
            '<div class="sched-subject">' + esc(t.subject) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="sched-item-btns">' +
          '<button class="card-btn edit" onclick="openEditSched(\'' + tid + '\',\'' + t.to.replace(/'/g,"&#39;") + '\',\'' + t.subject.replace(/'/g,"&#39;") + '\',\'' + t.body.replace(/'/g,"&#39;").replace(/\n/g,' ') + '\',' + t.hour + ',' + t.minute + ')">✏ Edit</button>' +
          '<button class="card-btn del"  onclick="deleteSched(\'' + tid + '\')">✕ Remove</button>' +
        '</div>' +
      '</div>';
  }
  list.innerHTML = html;
}

async function deleteSched(id) {
  if (!confirm('Remove this scheduled email?')) return;
  // Route: /schedule/delete/<id>  POST
  var data = await api('/schedule/delete/' + id, 'POST');
  if (data.error) { toast(data.error, 'err'); return; }
  toast('Schedule removed', 'ok'); loadScheduled();
}

function openEditSched(id, to, subject, body, hour, minute) {
  document.getElementById('edit-sched-id').value      = id;
  document.getElementById('edit-sc-to').value         = to;
  document.getElementById('edit-sc-subject').value    = subject;
  document.getElementById('edit-sc-body').value       = body;
  document.getElementById('edit-sc-hour').value       = hour;
  document.getElementById('edit-sc-minute').value     = minute;
  document.getElementById('edit-sched-overlay').classList.remove('hidden');
  document.getElementById('edit-sched-modal').classList.remove('hidden');
}
function closeEditSched() {
  document.getElementById('edit-sched-overlay').classList.add('hidden');
  document.getElementById('edit-sched-modal').classList.add('hidden');
}
async function submitEditSched() {
  var id      = document.getElementById('edit-sched-id').value;
  var to      = document.getElementById('edit-sc-to').value.trim();
  var subject = document.getElementById('edit-sc-subject').value.trim();
  var body    = document.getElementById('edit-sc-body').value.trim();
  var hour    = document.getElementById('edit-sc-hour').value;
  var minute  = document.getElementById('edit-sc-minute').value;
  if (!to || !subject) { toast('Fill all fields', 'err'); return; }
  // Route: /schedule/edit/<id>  POST
  var data = await api('/schedule/edit/' + id, 'POST', { to: to, subject: subject, body: body, hour: +hour, minute: +minute });
  if (data.error) { toast(data.error, 'err'); return; }
  toast('Schedule updated', 'ok'); closeEditSched(); loadScheduled();
}

// ── DELETE EMAIL ──────────────────────────────
async function deleteCurrentEmail() {
  if (!currentEmail) return;
  if (!confirm('Delete this email?')) return;
  var data = await api('/delete', 'POST', { id: currentEmail.id });
  if (data.error) { toast(data.error, 'err'); return; }
  toast('Email deleted', 'ok');
  document.getElementById('email-open').classList.add('hidden');
  document.getElementById('pane-empty').classList.remove('hidden');
  document.getElementById('split').classList.remove('pane-open');
  currentEmail = null; loadEmails();
}

// ── WEEK COUNT ────────────────────────────────
async function loadWeekCount() {
  var data = await api('/count', 'GET');
  if (!data.error) {
    var el = document.getElementById('week-num');
    if (el) el.textContent = data.emails_this_week;
  }
}

// ── AI TOOLS VIEW ─────────────────────────────
async function runWeekCount() {
  var stat = document.getElementById('ai-week-stat');
  var out  = document.getElementById('ai-tool-output');
  if (!out) return;
  if (stat) stat.textContent = 'Counting...';
  out.classList.remove('hidden');
  out.textContent = 'Fetching...';
  var data = await api('/count', 'GET');
  if (data.error) { out.textContent = '⚠ ' + data.error; return; }
  var n = data.emails_this_week;
  if (stat) stat.textContent = n + ' emails this week';
  var el = document.getElementById('week-num');
  if (el) el.textContent = n;
  out.textContent = 'Weekly Report\n─────────────\nEmails this week: ' + n;
  toast(n + ' emails this week', 'ok');
}

async function analyzeLatestEmail() {
  var out = document.getElementById('ai-tool-output');
  if (!out) return;
  out.classList.remove('hidden');
  out.innerHTML = '<div class="spin" style="margin:0 auto"></div>';
  if (!window._emails || !window._emails.length) {
    var res = await api('/emails', 'GET');
    if (res.error || !res.length) { out.textContent = 'No emails to analyze'; return; }
    window._emails = res;
  }
  var latest = window._emails[0];
  out.textContent = 'Analyzing: "' + latest.subject + '"...';
  var data = await api('/analyze', 'POST', { subject: latest.subject, sender: latest.from, body: latest.body });
  if (data.error) { out.textContent = '⚠ ' + data.error; return; }
  out.textContent = 'From: ' + latest.from + '\nSubject: ' + latest.subject + '\n\n' + data.analysis;
  toast('Analysis done', 'ok');
}

// ── REPLY ─────────────────────────────────────
function quickReply() {
  if (!currentEmail) return;
  document.getElementById('r-to').value      = currentEmail.from;
  document.getElementById('r-subject').value = 'Re: ' + (currentEmail.subject || '');
  document.getElementById('r-body').value    = '';
  document.getElementById('reply-overlay').classList.remove('hidden');
  document.getElementById('reply-modal').classList.remove('hidden');
}
function closeReply() {
  document.getElementById('reply-overlay').classList.add('hidden');
  document.getElementById('reply-modal').classList.add('hidden');
}
async function sendReply() {
  var to      = document.getElementById('r-to').value;
  var subject = document.getElementById('r-subject').value;
  var body    = document.getElementById('r-body').value.trim();
  if (!body) { toast('Write a reply first', 'err'); return; }
  var btn  = document.querySelector('.reply-modal .big-btn');
  setBtn(btn, true, 'Sending...');
  var data = await api('/send', 'POST', { to: to, subject: subject, body: body });
  setBtn(btn, false, 'Send Reply');
  if (data.error) { toast(data.error, 'err'); return; }
  toast('Reply sent', 'ok'); closeReply();
}

// ── UI ────────────────────────────────────────
function gotoView(v) {
  document.querySelectorAll('.nav-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.view === v);
  });
  document.querySelectorAll('.view').forEach(function(el) {
    var match = el.id === 'view-' + v;
    el.classList.toggle('active', match);
    el.classList.toggle('hidden', !match);
  });
  var titles = { inbox:'Inbox', contacts:'Contacts', schedule:'Scheduled', ai:'AI Tools' };
  var el = document.getElementById('view-title');
  if (el) el.textContent = titles[v] || v;
  closeSidebar();
}

function openCmd(tab) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('cmd-center').classList.remove('hidden');
  if (tab) switchCmdTab(tab);
}
function closeCmd() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('cmd-center').classList.add('hidden');
}
function switchCmdTab(tab) {
  document.querySelectorAll('.cmd-tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.cmd-panel').forEach(function(p) {
    var match = p.id === 'cmdpanel-' + tab;
    p.classList.toggle('active', match);
    p.classList.toggle('hidden', !match);
  });
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('hidden');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}
function toggleTheme() {
  var html = document.documentElement;
  html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
  var icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = html.dataset.theme === 'dark' ? '☀' : '🌙';
}

function toast(msg, type) {
  var c = document.getElementById('toast-container');
  var t = document.createElement('div');
  t.className   = 'toast ' + (type || 'ok');
  t.textContent = (type === 'err' ? '⚠ ' : '✦ ') + msg;
  c.appendChild(t);
  setTimeout(function() {
    t.style.animation = 'tOut 0.3s ease forwards';
    setTimeout(function() { if (t.parentNode) t.remove(); }, 300);
  }, 3200);
}

function setBtn(btn, loading, label) { btn.disabled = loading; btn.textContent = label; }

function clearFields() {
  for (var i = 0; i < arguments.length; i++) {
    var el = document.getElementById(arguments[i]);
    if (el) el.value = '';
  }
}

function cleanSender(from) {
  return (from || '').replace(/<.*?>/g, '').replace(/"/g, '').trim() || '?';
}
function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
  catch(e) { return d; }
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}