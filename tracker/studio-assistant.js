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
      .map(function (b) { return String(b.text).replace(/^\[Context from the app[^\]]*\]\s*/, ''); }).join('\n').trim();
  }

  var CSS = [
    '*,*::before,*::after{box-sizing:border-box}',
    ':host{position:fixed;left:16px;bottom:16px;z-index:1900;font:inherit;color:var(--ink,#171717)}',
    ':host([hidden]){display:none}',
    '.launch{font:inherit;font-size:15px;font-weight:600;padding:10px 16px;border-radius:999px;border:1px solid var(--line,#e5e5e5);',
    'background:var(--surface,#fff);color:inherit;box-shadow:var(--shadow,0 6px 24px rgba(0,0,0,.14));cursor:pointer}',
    '.panel{position:fixed;left:16px;bottom:72px;width:min(420px,calc(100vw - 32px));max-height:min(70vh,640px);display:flex;flex-direction:column;',
    'background:var(--surface,#fff);border:1px solid var(--line,#e5e5e5);border-radius:12px;box-shadow:var(--shadow,0 10px 40px rgba(0,0,0,.16))}',
    '.panel[hidden]{display:none}',
    'header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--line,#e5e5e5)}',
    'h2{margin:0;font-size:15px}',
    '.tools{display:flex;align-items:center;gap:4px}',
    'button.small{font-size:13px;padding:4px 10px}',
    '.close{font:inherit;font-size:20px;line-height:1;border:none;background:none;color:inherit;cursor:pointer;padding:4px 8px}',
    '.log{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px;font-size:15px;line-height:1.45}',
    '.msg{margin:0;max-width:90%;padding:8px 11px;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}',
    /* The bubble stays light in dark mode, so its text stays dark. */
    '.me{align-self:flex-end;background:var(--accent-soft,#eef2ff);color:#1e1b4b}',
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
    'form{display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--line,#e5e5e5)}',
    /* 16px or iOS zooms in on focus and never zooms back out. */
    'textarea{flex:1;font:inherit;font-size:16px;resize:none;padding:8px 10px;border-radius:8px;border:1px solid var(--line,#e5e5e5);background:var(--bg,#fff);color:inherit}',
    '.note{margin:0;padding:0 14px 10px;font-size:14px;color:var(--warn,#b45309)}',
    '.note[hidden]{display:none}',
    '@media (max-width:600px){.panel{left:0;right:0;bottom:0;width:100%;max-height:80vh;border-radius:12px 12px 0 0}}'
  ].join('');

  class Panel extends HTMLElement {}

  Panel.prototype.connectedCallback = function () {
    if (this._built) return;
    this._built = true;
    var self = this;
    var root = this.attachShadow({ mode: 'open' });
    root.appendChild(el('style', { text: CSS }));
    this.launch = el('button', { class: 'launch', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'panel', text: 'Ask the assistant' });
    this.log = el('div', { class: 'log', role: 'log', 'aria-live': 'polite' });
    this.picks = el('div', { class: 'picks', hidden: true });
    this.input = el('textarea', { rows: '2', 'aria-label': 'Message to the assistant', placeholder: 'e.g. sold two heron prints for $90 each, cash' });
    this.sendBtn = el('button', { class: 'btn primary', type: 'submit', text: 'Send' });
    this.note = el('p', { class: 'note', role: 'status', hidden: true });
    var close = el('button', { class: 'close', type: 'button', 'aria-label': 'Close the assistant', text: '×' });
    var fresh = el('button', { class: 'btn small', type: 'button', text: 'New conversation' });
    var form = el('form', {}, [this.input, this.sendBtn]);
    this.panel = el('section', { class: 'panel', id: 'panel', role: 'dialog', 'aria-label': 'Studio assistant', hidden: true }, [
      el('header', {}, [el('h2', { text: 'Studio assistant' }), el('div', { class: 'tools' }, [fresh, close])]), this.log, this.picks, this.note, form
    ]);
    root.appendChild(this.launch);
    root.appendChild(this.panel);

    this.launch.addEventListener('click', function () { self.toggle(); });
    close.addEventListener('click', function () { self.toggle(false); });
    // Forget the conversation (the model starts clean); saved records stay saved.
    fresh.addEventListener('click', function () {
      if (self.busy) return;
      self.fresh = true;
      self.log.textContent = '';
      self.picks.hidden = true;
      self.setNote('');
      self.say('bot', 'New conversation. What happened?');
      self.input.focus();
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); self.send(self.input.value); });
    this.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.send(self.input.value); }
    });
    if (S) S.on('session', function () { self.paint(); });
    this.paint();
  };

  /** Shown only while signed in to the studio (and not signed out by it). */
  Panel.prototype.paint = function () {
    var sess = S && S.available() && S.session();
    this.hidden = !sess || !!sess.expired;
    if (this.hidden) this.toggle(false);
  };

  Panel.prototype.toggle = function (open) {
    if (!this.panel) return;
    open = open === undefined ? this.panel.hidden : open;
    this.panel.hidden = !open;
    this.launch.setAttribute('aria-expanded', String(open));
    if (open) {
      this.input.focus();
      if (!this._loaded) { this._loaded = true; this.load(); }
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
        (t && t.messages || []).slice(-12).forEach(function (m) {
          var text = plainText(m.content);
          if (text) self.say(m.role === 'user' ? 'me' : 'bot', text);
        });
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
    this.picks.hidden = true;
    this.picks.textContent = '';
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
      else if (e.type === 'done') { acted = true; self.done(e); }
      else if (e.type === 'end') {
        if (e.reason === 'refusal') write(started ? '' : 'I can’t help with that one.');
        else if (e.reason === 'error') write((started ? '\n' : '') + 'Something went wrong, and nothing more was saved. Try again in a moment.' + (e.message ? '\n(' + String(e.message).slice(0, 300) + ')' : ''));
        else if (e.reason === 'max_tokens' || e.reason === 'step_limit') write((started ? '\n' : '') + '(I stopped there.)');
        if (!started) bubble.remove();
        // A name that matched several records: offer them as buttons.
        if (!acted && lastSearch && lastSearch.length > 1 && lastSearch.length <= 6) self.offer(lastSearch);
      }
    }
    var body = { message: text, app: this.getAttribute('app') || 'studio', today: today(), page: document.title };
    if (this.fresh) { body.fresh = true; this.fresh = false; }
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

  customElements.define('studio-assistant', Panel);
})();
