/* Gate Approvals: resident app. Talks to the Apps Script backend (window.GATE_API) and gets
   notifications through Firebase Cloud Messaging. */
(function () {
  'use strict';

  var API = window.GATE_API;
  var app = document.getElementById('app');
  var cfg = null, messaging = null, swReg = null, timer = null, highlight = null, busy = false;

  var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  /* ---------------------------------------------------------------- helpers */
  var store = {
    get: function (k) { try { return localStorage.getItem('gate.' + k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem('gate.' + k); else localStorage.setItem('gate.' + k, v); } catch (e) {} },
  };
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function show(html) { app.innerHTML = html; }
  function fmtTime(ms) {
    if (!ms) return '';
    var d = new Date(ms), h = d.getHours(), m = d.getMinutes();
    return ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function fmtDay(ms) {
    var d = new Date(ms), t = new Date();
    if (d.toDateString() === t.toDateString()) return 'Today';
    t.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'Yesterday';
    return d.getDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  }
  function ago(ms) {
    var m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    return m < 1 ? 'just now' : m === 1 ? '1 min ago' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago';
  }
  function toast(text) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);
  }
  function api(a, body) {
    return fetch(API, { method: 'POST', body: JSON.stringify(Object.assign({ a: a }, body || {})) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) { var e = new Error(j.error || 'Something went wrong.'); e.code = j.code; throw e; }
        return j;
      });
  }
  function platformName() {
    var ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || isIOS) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    return 'Computer';
  }
  function pushSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && !!messaging;
  }

  /* ------------------------------------------------------------------ start */
  function init() {
    if (!API || /PASTE_YOUR/.test(API)) {
      return show('<div class="card"><h2>Setup needed</h2><p class="note">Open <b>config.js</b> and paste your web app URL.</p></div>');
    }
    var q = new URLSearchParams(location.search);
    highlight = q.get('v');
    if (q.get('f')) store.set('pf', q.get('f'));
    if (q.get('c')) store.set('pc', q.get('c'));
    if (q.get('f') || q.get('c') || q.get('v')) {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    }
    try { cfg = JSON.parse(store.get('cfg') || 'null'); } catch (e) { cfg = null; }
    return api('config').then(function (c) { cfg = c; store.set('cfg', JSON.stringify(c)); }, function () {
      if (!cfg) throw new Error('offline');
    }).then(function () {
      document.title = cfg.society + ' Gate';
      return setupMessaging();
    }).then(function () {
      if (store.get('key')) home(); else join();
    }).catch(function () {
      show('<div class="card"><h2>No connection</h2><p class="note">Check your internet connection and open the app again.</p>' +
        '<button class="btn" onclick="location.reload()">Try again</button></div>');
    });
  }

  function setupMessaging() {
    if (!('serviceWorker' in navigator)) return Promise.resolve();
    var fb = cfg.firebase || {};
    return navigator.serviceWorker.register('sw.js?cfg=' + encodeURIComponent(JSON.stringify(fb)))
      .then(function (reg) { swReg = reg; }, function (e) { console.warn('Service worker', e); })
      .then(function () {
        if (!window.firebase || !fb.apiKey || !swReg) return;
        return Promise.resolve(firebase.messaging.isSupported ? firebase.messaging.isSupported() : true).then(function (ok) {
          if (!ok) return;
          if (!firebase.apps.length) firebase.initializeApp(fb);
          messaging = firebase.messaging();
          messaging.onMessage(onForegroundMessage);
        });
      }).catch(function (e) { console.warn('Messaging', e); messaging = null; });
  }

  function getPushToken() {
    if (!messaging || !swReg) return Promise.resolve('');
    return messaging.getToken({ vapidKey: cfg.vapidKey, serviceWorkerRegistration: swReg }).catch(function (e) {
      console.warn('Token', e); return '';
    });
  }

  function onForegroundMessage(payload) {
    var n = (payload && payload.notification) || {};
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if (swReg && Notification.permission === 'granted' && n.title) {
      swReg.showNotification(n.title, { body: n.body, icon: 'icon-192.png', tag: (payload.data && payload.data.id) || 'gate' });
    }
    if (payload && payload.data && payload.data.id) highlight = payload.data.id;
    if (store.get('key')) refresh();
  }

  /* ------------------------------------------------------------------- join */
  function join(message) {
    var f = store.get('pf') || '', c = store.get('pc') || '';
    var head = '<div class="top"><div><h1>' + esc(cfg.society) + '</h1><p class="sub">Gate approvals</p></div></div>';
    if (isIOS && !standalone) {
      return show(head + '<div class="card"><h2>Install the app first</h2>' +
        '<p class="note">On iPhone, notifications only work once the app is on your Home Screen.</p>' +
        '<ol class="steps"><li>Tap the <b>Share</b> button (the square with an arrow) at the bottom of Safari.</li>' +
        '<li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>' +
        '<li>Open <b>Gate</b> from your Home Screen.</li>' +
        '<li>Enter your flat and code from your slip:</li></ol>' +
        (f || c ? '<div class="code">Flat ' + esc(f) + ' · ' + esc(c) + '</div>' : '') +
        '<p class="tiny">Needs iOS 16.4 or newer. Use Safari, not Chrome, to add it.</p></div>');
    }
    show(head + '<div class="card"><h2>Join your flat</h2>' +
      '<p class="note">You will get a notification when a visitor comes for your flat, with their photo and Approve / Deny buttons.</p>' +
      '<label class="f" for="fl">Flat</label><input id="fl" value="' + esc(f) + '" autocapitalize="characters" placeholder="e.g. 4B">' +
      '<label class="f" for="cd">Code (on your slip)</label><input id="cd" value="' + esc(c) + '" autocapitalize="characters" maxlength="6" placeholder="6 letters/numbers">' +
      '<label class="f" for="nm">Your name</label><input id="nm" maxlength="40" autocomplete="name" placeholder="Shown to others in your flat">' +
      '<button id="go" class="btn">Join and turn on notifications</button>' +
      '<div id="er" class="err">' + esc(message || '') + '</div></div>' +
      '<p class="tiny">Your name is stored by your residents\' association with the visitor register. No phone number is needed.</p>');
    $('go').addEventListener('click', doJoin);
  }

  function doJoin() {
    var btn = $('go'), er = $('er');
    var flat = $('fl').value.trim(), code = $('cd').value.trim().toUpperCase(), name = $('nm').value.trim();
    er.textContent = '';
    if (!flat) return er.textContent = 'Please enter your flat.';
    if (code.length !== 6) return er.textContent = 'Please enter the 6-character code from your slip.';
    if (name.length < 2) return er.textContent = 'Please enter your name.';
    btn.disabled = true; btn.textContent = 'Joining…';
    // Ask for notification permission first: phones only allow it straight after a tap.
    var perm = ('Notification' in window && messaging) ? Notification.requestPermission() : Promise.resolve('unsupported');
    Promise.resolve(perm).catch(function () { return 'denied'; }).then(function (p) {
      return p === 'granted' ? getPushToken() : '';
    }).then(function (token) {
      return api('join', { flat: flat, code: code, name: name, token: token, platform: platformName(), oldKey: store.get('key') || '' })
        .then(function (r) {
          store.set('key', r.key); store.set('flat', r.flat); store.set('name', r.name); store.set('token', token || '');
          store.set('pf', null); store.set('pc', null);
          toast('Joined Flat ' + r.flat);
          home();
        });
    }).catch(function (e) {
      er.textContent = e.message; btn.disabled = false; btn.textContent = 'Join and turn on notifications';
    });
  }

  /* ------------------------------------------------------------------- home */
  function home() {
    show('<div class="top"><div><h1>Flat ' + esc(store.get('flat')) + '</h1><p class="sub" id="who">' + esc(store.get('name')) +
      ' · ' + esc(cfg.society) + '</p></div></div>' +
      '<div id="nb"></div>' +
      '<div id="pending"><div class="empty">Loading…</div></div>' +
      '<div class="card"><h2>Recent visitors</h2><ul class="recent" id="recent"><li class="tiny">Loading…</li></ul></div>' +
      '<p class="tiny" style="text-align:center" id="st"></p>' +
      '<p style="text-align:center"><button class="linkbtn" id="leave">Leave Flat ' + esc(store.get('flat')) + ' on this phone</button></p>');
    $('leave').addEventListener('click', leave);
    renderNotifBanner();
    refresh();
    clearInterval(timer);
    timer = setInterval(function () { if (document.visibilityState === 'visible') refresh(); }, 15000);
    syncToken();
  }

  function refresh() {
    if (busy) return Promise.resolve();
    busy = true;
    return api('home', { key: store.get('key') }).then(function (h) {
      busy = false;
      if (h.flat !== store.get('flat')) store.set('flat', h.flat);
      render(h);
      if ($('st')) $('st').textContent = 'Updated ' + fmtTime(Date.now());
    }).catch(function (e) {
      busy = false;
      if (e.code === 'GONE') {
        clearInterval(timer);
        store.set('key', null);
        return join(e.message);
      }
      if ($('st')) $('st').textContent = 'Offline. Retrying…';
    });
  }

  function render(h) {
    var p = $('pending'), rc = $('recent');
    if (!p) return;
    if (!h.pending.length) {
      p.innerHTML = '<div class="card empty">No visitors waiting right now.</div>';
    } else {
      p.innerHTML = h.pending.map(function (v) {
        return '<div class="card visitor' + (String(v.id) === String(highlight) ? ' hl' : '') + '" id="v' + v.id + '">' +
          '<h2>Visitor at the gate</h2>' +
          (v.photo ? '<img src="' + v.photo + '" alt="Visitor photo">' : '<p class="note">Photo not available.</p>') +
          '<div class="vname">' + esc(v.name) + '</div>' +
          '<div class="vline">' + esc(v.phone) + '</div>' +
          '<div class="vline">Waiting since ' + fmtTime(v.createdMs) + ' (' + ago(v.createdMs) + ')</div>' +
          '<div class="row"><button class="btn red" data-id="' + v.id + '" data-a="D">✖ Deny</button>' +
          '<button class="btn green" data-id="' + v.id + '" data-a="A">✓ Approve</button></div></div>';
      }).join('');
      Array.prototype.forEach.call(p.querySelectorAll('button[data-id]'), function (b) {
        b.addEventListener('click', function () { decide(b.getAttribute('data-id'), b.getAttribute('data-a')); });
      });
      if (highlight && $('v' + highlight)) $('v' + highlight).scrollIntoView({ block: 'start' });
    }
    rc.innerHTML = h.recent.length ? h.recent.map(function (v) {
      var label = { APPROVED: '✓ Approved', DENIED: '✖ Denied', EXPIRED: 'No answer' }[v.status] || v.status;
      return '<li><div><b>' + esc(v.name) + '</b><div class="tiny">' + fmtDay(v.createdMs) + ', ' + fmtTime(v.createdMs) +
        (v.by ? ' · ' + esc(v.by) : '') + '</div></div><span class="st ' + esc(v.status) + '">' + label + '</span></li>';
    }).join('') : '<li class="tiny">No visitors yet.</li>';
  }

  function decide(id, action) {
    var card = $('v' + id);
    Array.prototype.forEach.call(card.querySelectorAll('button'), function (b) { b.disabled = true; });
    api('decide', { key: store.get('key'), id: id, action: action }).then(function (r) {
      if (r.status === 'EXPIRED') toast('This request had already expired.');
      else if (r.already) toast('Already ' + r.status.toLowerCase() + ' by ' + r.by);
      else toast(r.status === 'APPROVED' ? 'Approved. The visitor\'s screen is now green.' : 'Denied. The visitor has been told.');
      highlight = null;
      refresh();
    }).catch(function (e) {
      toast(e.message);
      Array.prototype.forEach.call(card.querySelectorAll('button'), function (b) { b.disabled = false; });
      if (e.code === 'GONE') refresh();
    });
  }

  function renderNotifBanner() {
    var nb = $('nb');
    if (!nb) return;
    if (!pushSupported()) {
      nb.innerHTML = '<div class="banner bad"><b>Notifications are not available here.</b> ' +
        (isIOS ? 'Open Gate from your Home Screen (iOS 16.4 or newer).' : 'Open this app in Chrome.') +
        ' Until then, check this screen for visitors.</div>';
    } else if (Notification.permission === 'denied') {
      nb.innerHTML = '<div class="banner bad"><b>Notifications are blocked.</b> Allow them for this app in your phone\'s settings, then reopen it.</div>';
    } else if (Notification.permission !== 'granted') {
      nb.innerHTML = '<div class="banner warn"><b>Turn on notifications</b> so you know when a visitor arrives.' +
        '<button class="btn small" id="non">Turn on notifications</button></div>';
      $('non').addEventListener('click', function () {
        Notification.requestPermission().then(function () { renderNotifBanner(); return syncToken(); });
      });
    } else {
      nb.innerHTML = '<div class="banner ok"><span>🔔 Notifications are on</span><button class="linkbtn" id="tst">Send a test</button></div>';
      $('tst').addEventListener('click', function () {
        syncToken(true).then(function () { return api('test', { key: store.get('key') }); })
          .then(function () { toast('Test sent. It should arrive in a few seconds.'); }, function (e) { toast(e.message); });
      });
    }
  }

  function syncToken(force) {
    if (!pushSupported() || Notification.permission !== 'granted') return Promise.resolve();
    return getPushToken().then(function (t) {
      if (t && (force || t !== store.get('token'))) {
        return api('token', { key: store.get('key'), token: t }).then(function () { store.set('token', t); });
      }
    }).catch(function () {});
  }

  function leave() {
    if (!confirm('Stop getting visitor requests for Flat ' + store.get('flat') + ' on this phone?')) return;
    api('leave', { key: store.get('key') }).catch(function () {}).then(function () {
      clearInterval(timer);
      store.set('key', null); store.set('flat', null); store.set('name', null);
      join('You have left. Scan your slip again to rejoin.');
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && store.get('key') && cfg) { renderNotifBanner(); refresh(); }
  });

  window.GATEAPP = { init: init, refresh: refresh, onForegroundMessage: onForegroundMessage };
  init();
})();
