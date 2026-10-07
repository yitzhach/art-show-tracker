/* ==========================================================================
   Art Show Tracker — <studio-assistant>, the studio assistant panel (Phase 3)

   A button that opens a chat panel. The artist types what happened ("sold two
   heron prints for $90 each at Winter Park, cash"); the reply streams in from
   studio-assistant (/assistant/chat on this origin). Anything that saves money
   or changes a record comes back as a confirm card: nothing is written until
   the artist taps Confirm, and every saved change has Undo. When a name could
   mean several shows, the matches come back as buttons to tap.

   Honesty rules, as everywhere in this app:
     - It says "Saved" only after the studio answered.
     - Offline, it says the assistant needs a connection; the rest of the app
       keeps working as before.
     - Text from the model or the studio is shown as text, never as markup.
   Shown only when signed in to the studio over http(s). Uses studio-store.js
   for the session and to pull a confirmed change onto this device.
   ========================================================================== */
(function () {
  'use strict';
  if (!window.customElements || customElements.get('studio-assistant')) return;
  var S = window.ASTStudio;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'hidden') n.hidden = !!attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function post(url, body) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) {
          var e = new Error((data && data.error && data.error.message) || ('The studio answered ' + res.status));
          e.status = res.status;
          throw e;
        }
        return data;
      });
    });
  }
  /** The text the person typed, without the context line the assistant adds. */
  function plainText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.filter(function (b) { return b && b.type === 'text'; })
      .map(function (b) { return String(b.text).replace(/^\[Context from the app[^\]]*\]\s*/, '').replace(/\s*\[\[replies:[^\]]*\]\]\s*$/, ''); }).join('\n').trim();
  }

  /*
   * Finish-my-sentence. Two sources, both from this device: what the artist
   * sent before (the whole message) and names they use (shows, pieces). The
   * last one to four words typed are matched against the start of a name.
   * Returns the full text it would become, or null.
   */
  function completion(text, said, names) {
    if (!text || /\s$/.test(text)) return null;
    var low = text.toLowerCase(), i, j;
    if (text.length >= 4) {
      for (i = 0; i < said.length; i++) {
        if (said[i].length > text.length && said[i].toLowerCase().indexOf(low) === 0) return text + said[i].slice(text.length);
      }
    }
    var starts = [];
    for (i = 0; i < text.length; i++) if (!/\s/.test(text[i]) && (i === 0 || /\s/.test(text[i - 1]))) starts.push(i);
    starts = starts.slice(-4);
    for (i = 0; i < starts.length; i++) {
      var tail = text.slice(starts[i]), t = tail.toLowerCase();
      if (t.length < 2) continue;
      for (j = 0; j < names.length; j++) {
        if (names[j].length > tail.length && names[j].toLowerCase().indexOf(t) === 0) return text.slice(0, starts[i]) + names[j];
      }
    }
    return null;
  }
  var SAID_KEY = 'artShowTracker.assistantSaid';
  function readSaid() {
    try { var a = JSON.parse(localStorage.getItem(SAID_KEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }) : []; }
    catch (_) { return []; }
  }
  function rememberSaid(text) {
    try {
      var a = readSaid().filter(function (x) { return x !== text; });
      a.unshift(text);
      localStorage.setItem(SAID_KEY, JSON.stringify(a.slice(0, 40)));
    } catch (_) {}
  }

  var CSS = [
    '*,*::before,*::after{box-sizing:border-box}',
    ':host{position:fixed;left:16px;bottom:16px;z-index:1900;font:inherit;color:var(--ink,#171717)}',
    ':host([hidden]){display:none}',
    '.launch{font:inherit;font-size:15px;font-weight:600;padding:10px 16px;border-radius:999px;border:1px solid var(--line,#e5e5e5);',
    'background:var(--surface,#fff);color:inherit;box-shadow:var(--shadow,0 6px 24px rgba(0,0,0,.14));cursor:pointer}',
    /* A pop-up the artist drags by its title bar, resizes from the corner and
       shrinks to the bar; place() sets left, top, width and height. */
    '.panel{position:fixed;display:flex;flex-direction:column;overflow:hidden;',
    'background:var(--surface,#fff);border:1px solid var(--line,#e5e5e5);border-radius:12px;box-shadow:var(--shadow,0 10px 40px rgba(0,0,0,.16))}',
    '.panel[hidden]{display:none}',
    '.panel.moving{opacity:.75}',
    '.panel.min{height:auto!important}',
    '.panel.min>:not(header){display:none!important}',
    'header{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 8px 6px 14px;border-bottom:1px solid var(--line,#e5e5e5);cursor:move;touch-action:none;user-select:none;-webkit-user-select:none}',
    '.panel.min header{border-bottom:none}',
    'h2{margin:0;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.tools{display:flex;align-items:center;gap:4px;flex:none}',
    'button.small{font-size:13px;padding:4px 10px}',
    '.close,.shrink{font:inherit;font-size:20px;line-height:1;border:none;background:none;color:inherit;cursor:pointer;padding:4px 8px;min-width:32px}',
    '.grip{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;touch-action:none;',
    'background:linear-gradient(135deg,transparent 50%,var(--muted,#737373) 50%,var(--muted,#737373) 58%,transparent 58%,transparent 70%,var(--muted,#737373) 70%,var(--muted,#737373) 78%,transparent 78%)}',
    '.launch svg{display:none;width:20px;height:20px}',
    '.log{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px;font-size:15px;line-height:1.45}',
    '.msg{margin:0;max-width:90%;padding:8px 11px;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}',
    /* The artist's own bubble: a tint of the accent, light or dark with the page's theme. */
    '.me{align-self:flex-end;background:color-mix(in srgb,var(--accent,#2f5d4f) 16%,var(--surface,#fff));color:var(--ink,#171717)}',
    '.bot{align-self:flex-start;background:var(--bg,#f5f5f5)}',
    '.bot.thinking{color:var(--muted,#737373)}',
    '.card{border:1px solid var(--line,#e5e5e5);border-radius:10px;padding:10px 12px;background:var(--surface,#fff)}',
    '.card h3{margin:0 0 4px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#737373)}',
    '.card .sum{margin:0 0 6px;font-weight:600}',
    '.card dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:14px}',
    '.card dt{color:var(--muted,#737373)}.card dd{margin:0;overflow-wrap:anywhere}',
    '.row{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}',
    'button.btn{font:inherit;font-size:15px;padding:8px 14px;border-radius:8px;border:1px solid var(--line,#e5e5e5);background:var(--surface,#fff);color:inherit;cursor:pointer}',
    'button.primary{background:var(--ink,#171717);color:var(--surface,#fff);border-color:transparent}',
    'button[disabled]{opacity:.55;cursor:default}',
    '.status{margin:6px 0 0;font-size:14px}',
    '.picks{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px}',
    '.picks[hidden]{display:none}',
    'form{display:flex;gap:8px;padding:10px 22px 10px 14px;border-top:1px solid var(--line,#e5e5e5)}',
    /* 16px or iOS zooms in on focus and never zooms back out. */
    '.compose{position:relative;flex:1;display:flex;border-radius:8px;background:var(--bg,#fff)}',
    /* The grey finish-my-sentence text sits behind the (transparent) box, in the same font and wrap. */
    '.ghost,textarea{font:inherit;font-size:16px;line-height:1.4;padding:8px 10px;border:1px solid transparent;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}',
    '.ghost{position:absolute;inset:0;overflow:hidden;pointer-events:none;color:transparent}',
    '.ghost .hint{color:var(--muted,#737373)}',
    'textarea{position:relative;flex:1;resize:none;border-color:var(--line,#e5e5e5);background:transparent;color:inherit}',
    '.long{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 14px 8px;padding:8px 10px;border-radius:8px;border:1px solid var(--line,#e5e5e5);font-size:14px}',
    '.long[hidden]{display:none}',
    '.long p{margin:0;flex:1 1 200px}',
    'button.past{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;margin-top:6px;text-align:left}',
    'button.past small{color:var(--muted,#737373);font-size:12px}',
    '.replies{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px}',
    '.replies[hidden]{display:none}',
    '.replies .hint{width:100%;margin:0;font-size:12px;color:var(--muted,#737373)}',
    '.note{margin:0;padding:0 14px 10px;font-size:14px;color:var(--warn,#b45309)}',
    '.note[hidden]{display:none}',
    /* Phones: the pill shrinks to a round icon, so it covers less of the page. */
    '@media (max-width:700px){.launch{width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center}.launch span{display:none}.launch svg{display:block}}'
  ].join('');

  /* The header's door to the panel, in the page's own .header-actions (styled here, not in app.css). */
  var TOP_CSS = '.assistant-top{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--line);border-radius:999px;font-size:13px;font-weight:500;white-space:nowrap}' +
    '.assistant-top svg{width:16px;height:16px}.assistant-top[hidden]{display:none}' +
    '@media (max-width:700px){.assistant-top{width:34px;height:34px;padding:0;justify-content:center}.assistant-top span{display:none}}';
  var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';

  /* Where the panel sits, per device: { x, y, w, h, min } in CSS pixels. */
  var PLACE_KEY = 'artShowTracker.assistantPlace';
  function readPlace() {
    try {
      var v = JSON.parse(localStorage.getItem(PLACE_KEY) || 'null');
      return v && ['x', 'y', 'w', 'h'].every(function (k) { return isFinite(v[k]); }) ? v : null;
    } catch (_) { return null; }
  }
  function savePlace(v) { try { localStorage.setItem(PLACE_KEY, JSON.stringify(v)); } catch (_) {} }
  /** Where a new panel opens: bottom left on a computer; on a phone the lower half. */
  function defaultPlace(vw, vh) {
    if (vw <= 600) {
      var ph = Math.round(Math.min(vh * 0.5, 460));
      return { x: 8, y: vh - ph - 72, w: vw - 16, h: ph, min: false };
    }
    var w = Math.min(420, vw - 32), h = Math.round(Math.min(vh * 0.7, 640));
    return { x: 16, y: vh - h - 72, w: w, h: h, min: false };
  }
  /** Kept inside the window, at least 260 × 200, its title bar always reachable. */
  function clampPlace(v, vw, vh) {
    var w = Math.round(Math.max(Math.min(260, vw), Math.min(v.w, vw)));
    var h = Math.round(Math.max(Math.min(200, vh), Math.min(v.h, vh)));
    return {
      x: Math.round(Math.min(Math.max(0, v.x), vw - w)),
      y: Math.round(Math.min(Math.max(0, v.y), vh - (v.min ? 44 : h))),
      w: w, h: h, min: !!v.min
    };
  }

  /*
   * What the assistant can point to (Art-Talk-Back D-072): every page in the
   * menu, and the buttons, fields and links on this one, by their own labels.
   */
  function appMap() {
    var out = [], N = window.ASTNav;
    if (N && N.PAGES) out.push('Pages (the menu at the top right): ' + N.PAGES.map(function (p) { return p.label + ' — ' + p.note; }).join('; '));
    var seen = {}, here = [];
    document.querySelectorAll(CONTROLS).forEach(function (n) {
      if (n.closest('studio-assistant') || n.closest('[hidden]')) return;
      var t = labelOf(n);
      if (!t || t.length > 60 || seen[t]) return;
      seen[t] = 1;
      here.push(t);
    });
    if (here.length) out.push('On this page (' + document.title + '): ' + here.join(', '));
    return out.join('\n').slice(0, 15000);
  }

  /* The controls the map lists, by the same labels (appMap reads these too). */
  var CONTROLS = 'header button, header a, main button, main a, main input, main select, nav button, .header-actions button';
  function labelOf(n) { return (n.getAttribute('aria-label') || n.getAttribute('title') || n.textContent || n.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim(); }
  // "Money — Expenses, …" is the page Money; "+ Add show" is Add show.
  function fold(t) { return String(t || '').split(' \u2014 ')[0].replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase(); }
  var PENDING = 'artShowTracker.assistantShow';

  /** Scrolls to the control named `name` on this page, focuses and outlines it. Presses nothing. */
  function showControl(name) {
    var want = fold(name), hit = null;
    if (!want) return false;
    document.querySelectorAll(CONTROLS).forEach(function (n) {
      if (hit || n.closest('studio-assistant') || n.closest('[hidden]')) return;
      if (fold(labelOf(n)) === want) hit = n;
    });
    if (!hit) return false;
    hit.scrollIntoView({ block: 'center', behavior: 'smooth' });
    try { hit.focus({ preventScroll: true }); } catch (_) {}
    var st = hit.style, was = [st.outline, st.outlineOffset];
    st.outline = '3px solid var(--accent, #d97706)'; st.outlineOffset = '3px';
    hit.setAttribute('data-assistant-shown', '');
    setTimeout(function () { st.outline = was[0]; st.outlineOffset = was[1]; hit.removeAttribute('data-assistant-shown'); }, 2500);
    return true;
  }

  /*
   * "Take me to …" (Art-Talk-Back D-075): `place` and `control` come from the
   * map. A page in the menu is opened (a control on it is shown once it has
   * loaded); a control on this page is shown. Nothing is pressed or changed.
   * Returns false when the map's names match nothing here.
   */
  function openPlace(place, control) {
    var pages = (window.ASTNav && window.ASTNav.PAGES) || [];
    var here = String(location.pathname).split('/').pop() || 'index.html';
    var names = [control, place].filter(Boolean);
    for (var i = 0; i < names.length; i++) {
      var page = pages.filter(function (p) { return fold(p.label) === fold(names[i]); })[0];
      if (!page) continue;
      var rest = names[i] === control ? null : control;
      if (page.file === here) { if (rest) showControl(rest); return true; }
      try { if (rest) sessionStorage.setItem(PENDING, rest); else sessionStorage.removeItem(PENDING); } catch (_) {}
      location.href = page.file;
      return true;
    }
    return names.some(showControl);
  }

  class Panel extends HTMLElement {}

  Panel.prototype.connectedCallback = function () {
    if (this._built) return;
    this._built = true;
    var self = this;
    var root = this.attachShadow({ mode: 'open' });
    root.appendChild(el('style', { text: CSS }));
    this.launch = el('button', { class: 'launch', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'panel', 'aria-label': 'Ask the assistant', title: 'Ask the assistant' }, [el('span', { text: 'Ask the assistant' })]);
    this.launch.insertAdjacentHTML('beforeend', ICON);
    this.log = el('div', { class: 'log', role: 'log', 'aria-live': 'polite' });
    this.picks = el('div', { class: 'picks', hidden: true });
    this.input = el('textarea', { rows: '2', 'aria-label': 'Message to the assistant', placeholder: 'e.g. sold two heron prints for $90 each, cash' });
    this.sendBtn = el('button', { class: 'btn primary', type: 'submit', text: 'Send' });
    this.note = el('p', { class: 'note', role: 'status', hidden: true });
    var close = el('button', { class: 'close', type: 'button', 'aria-label': 'Close the assistant', text: '×' });
    this.shrinkBtn = el('button', { class: 'shrink', type: 'button', 'aria-label': 'Shrink the assistant to its title bar', title: 'Shrink', text: '–' });
    var grip = el('div', { class: 'grip', 'aria-hidden': 'true', title: 'Drag to resize' });
    var fresh = el('button', { class: 'btn small', type: 'button', text: 'New chat' });
    var past = el('button', { class: 'btn small', type: 'button', text: 'Past chats' });
    // A long chat costs more per message (all of it is sent each time): offer a fresh one.
    var restart = el('button', { class: 'btn small', type: 'button', text: 'Start a new chat' });
    this.long = el('div', { class: 'long', hidden: true }, [
      el('p', { text: 'This chat is getting long, and every message re-sends all of it. A new chat costs less; this one stays in Past chats.' }), restart
    ]);
    this.ghost = el('div', { class: 'ghost', 'aria-hidden': 'true' });
    this.replies = el('div', { class: 'replies', hidden: true });
    var form = el('form', {}, [el('div', { class: 'compose' }, [this.ghost, this.input]), this.sendBtn]);
    this.said = readSaid();
    this.names = [];
    this.panel = el('section', { class: 'panel', id: 'panel', role: 'dialog', 'aria-label': 'Studio assistant', hidden: true }, [
      el('header', { title: 'Drag to move' }, [el('h2', { text: 'Assistant' }), el('div', { class: 'tools' }, [past, fresh, this.shrinkBtn, close])]), this.log, this.long, this.picks, this.replies, this.note, form, grip
    ]);
    root.appendChild(this.launch);
    root.appendChild(this.panel);

    this.launch.addEventListener('click', function () { self.toggle(); });
    close.addEventListener('click', function () { self.toggle(false); });
    this.shrinkBtn.addEventListener('click', function () { self.shrink(); });
    var header = this.panel.querySelector('header');
    this.drag(header, function (s, dx, dy) { return { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h, min: s.min }; });
    this.drag(grip, function (s, dx, dy) { return { x: s.x, y: s.y, w: s.w + dx, h: s.h + dy, min: s.min }; });
    header.addEventListener('dblclick', function (e) { if (!e.target.closest('button')) self.shrink(); });
    window.addEventListener('resize', function () { if (!self.panel.hidden) self.place(self.where); });
    // Keys typed in the panel stay in it. Retargeted to <studio-assistant>, they
    // reached the pages' own shortcuts as if typed on the page: "n" on the
    // ledger opened a new show, and t/m/d/y and the arrows moved the calendar.
    root.addEventListener('keydown', function (e) { e.stopPropagation(); });
    // Forget the conversation (the model starts clean); saved records stay saved.
    function startNew() {
      if (self.busy) return;
      self.clear();
      self.fresh = true;
      self.say('bot', 'New chat. What happened?');
      self.input.focus();
    }
    fresh.addEventListener('click', startNew);
    restart.addEventListener('click', startNew);
    past.addEventListener('click', function () { if (!self.busy) self.listPast(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); self.send(self.input.value); });
    this.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.send(self.input.value); return; }
      // Tab takes the grey suggestion, or else the next suggested reply. Otherwise Tab moves on as usual.
      if (e.key === 'Tab' && !e.shiftKey && self.tab()) e.preventDefault();
    });
    this.input.addEventListener('input', function () { self.hint(); });
    this.input.addEventListener('scroll', function () { self.ghost.scrollTop = self.input.scrollTop; });
    if (S) S.on('session', function () { self.paint(); });
    this.paint();
  };

  /** Empties the panel (not the studio: every chat stays saved). */
  Panel.prototype.clear = function () {
    this.log.textContent = '';
    this.picks.hidden = true;
    this.replies.hidden = true;
    this.replyItems = [];
    this.long.hidden = true;
    this.turns = 0;
    this.threadId = null;
    this.fresh = false;
    this.setNote('');
  };

  /** Counts what the artist said in this chat; past LONG_CHAT, suggests a new one. */
  var LONG_CHAT = 8;
  Panel.prototype.count = function (n) {
    this.turns = (this.turns || 0) + n;
    this.long.hidden = this.turns < LONG_CHAT;
  };

  /** Shows one chat's messages (the current one, or a past one by id). */
  Panel.prototype.show = function (t) {
    var self = this, n = 0;
    (t && t.messages || []).slice(-12).forEach(function (m) {
      var text = plainText(m.content);
      if (text) self.say(m.role === 'user' ? 'me' : 'bot', text);
      if (m.role === 'user' && text) n++;
      // What was said on other devices finishes sentences here too.
      if (m.role === 'user' && text.length >= 8 && self.said.indexOf(text) < 0) self.said.push(text);
    });
    this.count(n);
  };

  /** Past chats, newest first: tap one to read it; the next message continues it. */
  Panel.prototype.listPast = function () {
    var self = this;
    this.clear();
    var box = el('div', { class: 'card' }, [el('h3', { text: 'Past chats' })]);
    this.log.appendChild(box);
    var status = el('p', { class: 'status', text: 'Loading…' });
    box.appendChild(status);
    fetch('/v1/assistant/threads', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var items = d && d.items || [];
        status.textContent = items.length ? '' : 'No chats yet.';
        items.forEach(function (it) {
          var when = new Date(it.lastAt);
          var b = el('button', { class: 'btn past', type: 'button' }, [
            el('span', { text: it.title }),
            el('small', { text: when.toLocaleDateString() + ' ' + when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · ' + it.messages + ' messages' })
          ]);
          b.addEventListener('click', function () { self.openPast(it.threadId); });
          box.appendChild(b);
        });
      }, function () { status.textContent = 'Couldn’t load past chats. Try again with a connection.'; });
  };

  Panel.prototype.openPast = function (id) {
    var self = this;
    fetch('/v1/assistant/thread?id=' + encodeURIComponent(id), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (t) {
        if (!t) return self.setNote('That chat could not be opened.');
        self.clear();
        self.threadId = id;
        self.show(t);
        self.say('bot', 'This is an earlier chat. Send a message to carry on with it, or tap New chat.');
      });
  };

  /** Names from this device's own data, for finish-my-sentence. */
  Panel.prototype.loadNames = function () {
    var self = this, St = window.AST && window.AST.Store;
    if (!St) return;
    Promise.all([
      Promise.resolve(St.list ? St.list() : []).catch(function () { return []; }),
      Promise.resolve(St.listSales ? St.listSales() : []).catch(function () { return []; })
    ]).then(function (r) {
      var seen = {}, out = [];
      (r[0] || []).map(function (x) { return x && x.name; }).concat((r[1] || []).map(function (x) { return x && x.title; }))
        .forEach(function (n) {
          n = String(n || '').trim();
          if (n.length > 2 && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = 1; out.push(n); }
        });
      self.names = out;
    });
  };

  /** Redraws the grey suggestion after what's typed (only with the cursor at the end). */
  Panel.prototype.hint = function () {
    var v = this.input.value, at = this.input.selectionStart === v.length;
    this.suggestion = at ? completion(v, this.said, this.names) : null;
    this.ghost.textContent = '';
    if (!this.suggestion) return;
    this.ghost.appendChild(document.createTextNode(v));
    this.ghost.appendChild(el('span', { class: 'hint', text: this.suggestion.slice(v.length) }));
    this.ghost.scrollTop = this.input.scrollTop;
  };

  Panel.prototype.fill = function (text) {
    this.input.value = text;
    this.input.focus();
    this.input.setSelectionRange(text.length, text.length);
    this.hint();
  };

  /** Tab: the grey suggestion first, else cycle through the suggested replies. True if it did something. */
  Panel.prototype.tab = function () {
    if (this.suggestion) { this.fill(this.suggestion); return true; }
    var items = this.replyItems || [];
    if (this.replies.hidden || !items.length) return false;
    var v = this.input.value.trim();
    if (v && items.indexOf(v) < 0) return false;
    this.fill(items[(items.indexOf(v) + 1) % items.length]);
    return true;
  };

  /** The assistant's likely answers to its own question: tap or Tab to put one in the box, then Send. */
  Panel.prototype.offerReplies = function (items) {
    var self = this;
    this.replyItems = items;
    this.replies.textContent = '';
    items.forEach(function (t) {
      var b = el('button', { class: 'btn', type: 'button', text: t });
      b.addEventListener('click', function () { self.fill(t); });
      self.replies.appendChild(b);
    });
    this.replies.appendChild(el('p', { class: 'hint', text: 'Tab puts the first one in the box; Tab again for the next.' }));
    this.replies.hidden = false;
  };

  /** Shown only while signed in to the studio (and not signed out by it). */
  Panel.prototype.paint = function () {
    var sess = S && S.available() && S.session();
    this.hidden = !sess || !!sess.expired;
    this.topButton();
    if (this.hidden) this.toggle(false);
  };

  /** A second door in the page's header (beside the menu), shown only with the panel. */
  Panel.prototype.topButton = function () {
    var self = this, host = document.querySelector('.header-actions');
    if (!host) return;
    if (!this.top) {
      if (!document.getElementById('assistant-top-css')) document.head.appendChild(el('style', { id: 'assistant-top-css', text: TOP_CSS }));
      this.top = el('button', { class: 'assistant-top', type: 'button', 'aria-label': 'Ask the assistant', title: 'Ask the assistant', 'aria-expanded': 'false' }, [el('span', { text: 'Assistant' })]);
      this.top.insertAdjacentHTML('afterbegin', ICON);
      this.top.addEventListener('click', function () { self.toggle(); });
      host.appendChild(this.top);
    }
    this.top.hidden = this.hidden;
  };

  /** Puts the panel at v (or where it was last left on this device), kept on screen. */
  Panel.prototype.place = function (v) {
    var vw = window.innerWidth, vh = window.innerHeight;
    this.where = clampPlace(v || readPlace() || defaultPlace(vw, vh), vw, vh);
    var p = this.where, st = this.panel.style;
    st.left = p.x + 'px'; st.top = p.y + 'px'; st.width = p.w + 'px'; st.height = p.h + 'px';
    this.panel.classList.toggle('min', p.min);
    this.shrinkBtn.textContent = p.min ? '▢' : '–';
    this.shrinkBtn.setAttribute('aria-label', p.min ? 'Open the assistant out again' : 'Shrink the assistant to its title bar');
    this.shrinkBtn.title = p.min ? 'Open out' : 'Shrink';
  };

  /** Shrinks the panel to its title bar, or opens it out again; remembered. */
  Panel.prototype.shrink = function (min) {
    if (min === undefined) min = !(this.where && this.where.min);
    var w = this.where;
    this.place({ x: w.x, y: w.y, w: w.w, h: w.h, min: min });
    savePlace(this.where);
    if (!min) this.input.focus();
  };

  /** Pointer drag on handle: to(start, dx, dy) gives the new place; saved when let go. */
  Panel.prototype.drag = function (handle, to) {
    var self = this;
    handle.addEventListener('pointerdown', function (e) {
      if (e.button > 0 || e.target.closest('button')) return;
      e.preventDefault();
      var start = self.where, sx = e.clientX, sy = e.clientY;
      if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
      self.panel.classList.add('moving');
      function move(ev) { self.place(to(start, ev.clientX - sx, ev.clientY - sy)); }
      function up() {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        self.panel.classList.remove('moving');
        savePlace(self.where);
      }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  };

  Panel.prototype.toggle = function (open) {
    if (!this.panel) return;
    open = open === undefined ? this.panel.hidden : open;
    this.panel.hidden = !open;
    this.launch.setAttribute('aria-expanded', String(open));
    if (this.top) this.top.setAttribute('aria-expanded', String(open));
    if (open) {
      this.place();
      if (!this.where.min) this.input.focus();
      if (!this._loaded) { this._loaded = true; this.load(); }
      this.loadNames();
    }
  };

  Panel.prototype.say = function (who, text) {
    var p = el('p', { class: 'msg ' + who, text: text || '' });
    this.log.appendChild(p);
    this.log.scrollTop = this.log.scrollHeight;
    return p;
  };

  Panel.prototype.setNote = function (text) { this.note.textContent = text || ''; this.note.hidden = !text; };

  /** The conversation so far (any device) and the cards still waiting. */
  Panel.prototype.load = function () {
    var self = this;
    if (!navigator.onLine) return;
    return fetch('/v1/assistant/thread', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (t) {
        self.show(t);
        return fetch('/v1/assistant/proposals?status=all', { credentials: 'same-origin' });
      })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (list) {
        var now = new Date().toISOString(), since = new Date(Date.now() - 12 * 3600e3).toISOString();
        // Oldest first, like the conversation: cards still waiting, and recent saves with their Undo.
        (list && list.items || []).slice().reverse().forEach(function (p) {
          if (p.status === 'pending' && p.expiresAt > now) self.card(p);
          else if (p.status === 'confirmed' && p.activityId && p.updatedAt > since) self.saved(p);
        });
      })
      .catch(function () {});
  };

  Panel.prototype.send = function (text) {
    var self = this;
    text = String(text || '').trim();
    if (!text || this.busy) return;
    this.setNote('');
    if (!navigator.onLine) {
      this.setNote('The assistant needs a connection. Everything else in the app works offline as usual.');
      return;
    }
    this.busy = true;
    this.sendBtn.disabled = true;
    this.input.value = '';
    this.hint();
    this.picks.hidden = true;
    this.picks.textContent = '';
    this.replies.hidden = true;
    this.replyItems = [];
    if (text.length >= 8) { rememberSaid(text); this.said = readSaid(); }
    var gotReplies = false;
    this.say('me', text);
    var bubble = this.say('bot thinking', 'Thinking…');
    var started = false, acted = false, lastSearch = null;
    function write(t) {
      if (!started) { started = true; bubble.textContent = ''; bubble.className = 'msg bot'; }
      bubble.textContent += t;
      self.log.scrollTop = self.log.scrollHeight;
    }
    function handle(e) {
      if (e.type === 'text') write(e.text);
      else if (e.type === 'search') lastSearch = e.items;
      else if (e.type === 'card') { acted = true; self.card(e.proposal); }
      else if (e.type === 'replies') { gotReplies = true; self.offerReplies(e.items || []); }
      else if (e.type === 'done') { acted = true; self.done(e); }
      else if (e.type === 'open') {
        // "Take me to …": the page shows the place; nothing changes. On a phone the
        // panel shrinks to its bar so what it showed isn't under it (not saved).
        var shown = openPlace(e.place, e.control);
        if (shown && window.innerWidth <= 600 && self.where && !self.where.min) self.place({ x: self.where.x, y: self.where.y, w: self.where.w, h: self.where.h, min: true });
        if (!shown) self.setNote('Couldn\u2019t find ' + (e.control || e.place) + ' here.');
      }
      else if (e.type === 'end') {
        if (e.reason === 'refusal') write(started ? '' : 'I can’t help with that one.');
        else if (e.reason === 'error') write((started ? '\n' : '') + 'Something went wrong, and nothing more was saved. Try again in a moment.' + (e.message ? '\n(' + String(e.message).slice(0, 300) + ')' : ''));
        else if (e.reason === 'max_tokens' || e.reason === 'step_limit') write((started ? '\n' : '') + '(I stopped there.)');
        if (!started) bubble.remove();
        // A name that matched several records: offer them as buttons.
        if (!acted && !gotReplies && lastSearch && lastSearch.length > 1 && lastSearch.length <= 6) self.offer(lastSearch);
        bubble.textContent = bubble.textContent.replace(/\s+$/, '');
      }
    }
    var body = { message: text, app: this.getAttribute('app') || 'studio', today: today(), page: document.title };
    try { var map = appMap(); if (map) body.appMap = map; } catch (_) {}
    body.commands = ['open']; // this app can show a place when asked (D-075)
    if (this.fresh) { body.fresh = true; this.fresh = false; }
    else if (this.threadId) body.threadId = this.threadId;
    this.count(1);
    fetch('/assistant/chat', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return null; }).then(function (data) {
            if (res.status === 401) throw new Error('Your studio sign-in has ended. Sign in again in Account & sync.');
            if (res.status === 404 || res.status === 503) throw new Error('The assistant isn’t switched on yet.');
            throw new Error((data && data.error && data.error.message) || 'The assistant could not answer.');
          });
        }
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
        function pump() {
          return reader.read().then(function (r) {
            if (r.value) buf += dec.decode(r.value, { stream: true });
            var parts = buf.split('\n\n');
            buf = parts.pop();
            parts.forEach(function (chunk) {
              var line = chunk.split('\n').filter(function (l) { return l.indexOf('data: ') === 0; })[0];
              if (line) { try { handle(JSON.parse(line.slice(6))); } catch (_) {} }
            });
            if (!r.done) return pump();
          });
        }
        return pump();
      })
      .catch(function (err) {
        bubble.remove();
        self.setNote(navigator.onLine ? err.message : 'The connection dropped. Nothing was saved by that message.');
      })
      .then(function () { self.busy = false; self.sendBtn.disabled = false; });
  };

  Panel.prototype.offer = function (items) {
    var self = this;
    this.picks.textContent = '';
    items.forEach(function (it) {
      var b = el('button', { class: 'btn', type: 'button', text: it.label });
      b.title = it.detail || '';
      b.addEventListener('click', function () { self.send(it.label); });
      self.picks.appendChild(b);
    });
    this.picks.hidden = false;
  };

  /** A confirm card: the assistant's line, studio-api's lines, Confirm and Cancel. */
  Panel.prototype.card = function (p) {
    var self = this;
    if (this.log.querySelector('[data-card="' + p.id + '"]')) return;
    var dl = el('dl');
    (p.details || []).forEach(function (d) { dl.appendChild(el('dt', { text: d.label })); dl.appendChild(el('dd', { text: d.value })); });
    var ok = el('button', { class: 'btn primary', type: 'button', text: 'Confirm' });
    var no = el('button', { class: 'btn', type: 'button', text: 'Cancel' });
    var status = el('p', { class: 'status', role: 'status' });
    var row = el('div', { class: 'row' }, [ok, no]);
    var card = el('div', { class: 'card', 'data-card': p.id }, [
      el('h3', { text: 'Confirm to save' }), el('p', { class: 'sum', text: p.summary || '' }), dl, row, status
    ]);
    this.log.appendChild(card);
    this.log.scrollTop = this.log.scrollHeight;
    function busy(on) { ok.disabled = no.disabled = on; }
    ok.addEventListener('click', function () {
      busy(true);
      status.textContent = 'Saving…';
      post('/v1/assistant/proposals/' + encodeURIComponent(p.id) + '/confirm').then(function (r) {
        row.remove();
        status.textContent = 'Saved.';
        self.undo(card, status, r.activityIds && r.activityIds[0]);
        if (S) S.sync();
      }, function (e) {
        busy(false);
        status.textContent = navigator.onLine ? e.message : 'No connection. Tap Confirm again when you’re back online.';
        if (e.status === 409) row.remove();
      });
    });
    no.addEventListener('click', function () {
      busy(true);
      post('/v1/assistant/proposals/' + encodeURIComponent(p.id) + '/cancel').then(function () {
        row.remove();
        status.textContent = 'Cancelled. Nothing was saved.';
      }, function (e) { busy(false); status.textContent = e.message; });
    });
  };

  /** A card confirmed earlier (another page, another device): what it saved, with Undo. */
  Panel.prototype.saved = function (p) {
    if (this.log.querySelector('[data-card="' + p.id + '"]')) return;
    var status = el('p', { class: 'status', role: 'status', text: 'Saved.' });
    var box = el('div', { class: 'card', 'data-card': p.id }, [el('h3', { text: 'Saved' }), el('p', { class: 'sum', text: p.summary || '' }), status]);
    this.log.appendChild(box);
    this.undo(box, status, p.activityId);
  };

  /** Something the studio lets the assistant do on its own: it is saved, with Undo. */
  Panel.prototype.done = function (e) {
    var status = el('p', { class: 'status', role: 'status', text: 'Saved.' });
    var box = el('div', { class: 'card' }, [el('h3', { text: 'Saved' }), status]);
    this.log.appendChild(box);
    this.undo(box, status, e.activityIds && e.activityIds[0]);
    if (S) S.sync();
  };

  Panel.prototype.undo = function (box, status, activityId) {
    if (!activityId) return;
    var b = el('button', { class: 'btn', type: 'button', text: 'Undo' });
    var row = el('div', { class: 'row' }, [b]);
    box.appendChild(row);
    b.addEventListener('click', function () {
      b.disabled = true;
      post('/v1/activity/' + encodeURIComponent(activityId) + '/undo').then(function () {
        row.remove();
        status.textContent = 'Undone.';
        if (S) S.sync();
      }, function (e) { b.disabled = false; status.textContent = e.message; });
    });
  };

  // For the test harness: the place arithmetic and the map the assistant is sent.
  Panel.clampPlace = clampPlace;
  Panel.appMap = appMap;
  Panel.openPlace = openPlace;
  // A control asked for on another page is shown once that page has loaded.
  window.addEventListener('load', function () {
    var name = null;
    try { name = sessionStorage.getItem(PENDING); sessionStorage.removeItem(PENDING); } catch (_) {}
    if (name) setTimeout(function () { showControl(name); }, 300);
  });
  customElements.define('studio-assistant', Panel);
})();
