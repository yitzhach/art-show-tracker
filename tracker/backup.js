/* ==========================================================================
   Art Show Tracker — full backup and restore

   One file that holds everything the artist has put into this device: every
   collection in the database (shows, calendar events, applications, saved
   rankings, expenses, sales, contacts, debriefs, jury reviews) and the
   choices they made around it (hearts and ratings on the catalogue, the fit
   profile, private show reports, share and layout preferences, the theme).

   Why it exists: before this, "Export JSON" saved the shows and nothing
   else, and most of a season could not be loaded back at all. An artist with
   no account who cleared a browser lost the year.

   The rules it keeps:
     - A backup file is UNTRUSTED INPUT, like a ranking or a card-reader
       export. A file that is not a backup, was made by a newer version, or
       is malformed is refused whole, with the reason. Nothing is guessed.
     - A restore replaces what is on the device and hands back what was
       there, so the page can offer Undo. Nothing is merged silently.
     - Contacts are in the file, people marked "do not contact" included: a
       backup that drops people is not a backup. The file is made by hand
       and stays on the artist's own device. Contacts are still never sent
       to any server (docs/product-plan.md, P-10).
     - Signed in to a sync backend, the shows (and, in the studio, the sales)
       belong to the account. A restore leaves those alone and says so,
       rather than pushing an old season over a newer one.
     - Sign-in sessions, API settings and caches are not in the file.

   DOM-free, like sales.js and calendar.js: the buttons live in the page.
   Classic script (see core.js). Publishes window.ASTBackup.
   ========================================================================== */
window.ASTBackup = (function () {
  'use strict';

  var A = window.AST;

  var FORMAT = 'show-ledger-backup';
  var FORMAT_VERSION = 1;
  var LAST_KEY = 'artShowTracker.lastBackup';
  var MAX_SETTING_CHARS = 4 * 1024 * 1024;

  /* What the artist chose, outside the database. Each is one localStorage
     value, carried as the exact string that was stored. Not here on purpose:
     sign-in sessions, the Supabase and network settings, the studio's state,
     and the geocode / route / weather caches, which rebuild themselves. */
  var SETTINGS = [
    { key: 'artShowTracker.catalogue',     label: 'hearts and ratings',  json: true },
    { key: 'artShowTracker.artistProfile', label: 'fit profile',         json: true },
    { key: 'artShowTracker.intel',         label: 'private show reports', json: true },
    { key: 'artShowTracker.share',         label: 'share preferences',   json: true },
    { key: 'artShowTracker.layout',        label: 'layout',              json: true },
    { key: 'artShowTracker.calLayers',     label: 'calendar layers',     json: true },
    { key: 'artShowTracker.theme',         label: 'theme',               json: false }
  ];

  /* The database's collections, in the order a person would list them. */
  var COLLECTIONS = [
    { key: 'shows',        one: 'show',           many: 'shows' },
    { key: 'applications', one: 'application',    many: 'applications' },
    { key: 'events',       one: 'calendar event', many: 'calendar events' },
    { key: 'expenses',     one: 'expense',        many: 'expenses' },
    { key: 'sales',        one: 'sale',           many: 'sales' },
    { key: 'contacts',     one: 'contact',        many: 'contacts' },
    { key: 'debriefs',     one: 'debrief',        many: 'debriefs' },
    { key: 'rankers',      one: 'saved ranking',  many: 'saved rankings' },
    { key: 'reviews',      one: 'jury review',    many: 'jury reviews' }
  ];

  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function live(rows) { return rows.filter(function (r) { return !r.deletedAt; }); }

  function getRaw(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function setRaw(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      return true;
    } catch (_) { return false; }
  }

  /* ---- which collections a sync backend owns ----------------------------- */
  function synced() {
    var backend = A.currentStore();
    if (backend === A.LocalStore) return [];
    var owned = ['shows'];
    if (typeof backend.listSales === 'function') owned.push('sales');
    return owned;
  }

  /* ---- counts, for the sentence the page shows --------------------------- */
  function countsOf(db) {
    var out = {};
    COLLECTIONS.forEach(function (c) {
      out[c.key] = Array.isArray(db[c.key]) ? live(db[c.key]).length : 0;
    });
    return out;
  }
  /** "9 shows, 14 expenses, 3 sales" — only what is there; "nothing" if empty. */
  function describe(counts) {
    var parts = [];
    COLLECTIONS.forEach(function (c) {
      var n = counts && counts[c.key];
      if (n) parts.push(n + ' ' + (n === 1 ? c.one : c.many));
    });
    return parts.length ? parts.join(', ') : 'nothing';
  }

  /* ---- build -------------------------------------------------------------- */
  /**
   * Everything on this device, as one object ready to be written to a file.
   * Signed in to a sync backend, the shows (and studio sales) are read from
   * it, so the file holds the season the artist is actually looking at.
   */
  function build() {
    var db = A.LocalStore.dump();
    var owned = synced();
    var reads = [];
    if (owned.indexOf('shows') !== -1) {
      reads.push(A.Store.list().then(function (rows) { db.shows = rows; }));
    }
    if (owned.indexOf('sales') !== -1) {
      reads.push(A.Store.listSales().then(function (rows) { db.sales = rows; }));
    }
    return Promise.all(reads).then(function () {
      var settings = {};
      SETTINGS.forEach(function (s) {
        var raw = getRaw(s.key);
        if (raw !== null) settings[s.key] = raw;
      });
      var version = null;
      try { version = (window.ASTVersion && window.ASTVersion.current && window.ASTVersion.current()) || null; }
      catch (_) { version = null; }
      return {
        format: FORMAT,
        formatVersion: FORMAT_VERSION,
        schemaVersion: A.SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        appVersion: version,
        syncedCollections: owned,
        counts: countsOf(db),
        db: db,
        settings: settings
      };
    });
  }

  /* ---- inspect: is this a file we can restore? ---------------------------- */
  function refuse(reason) { return { ok: false, reason: reason }; }

  /**
   * Look at a parsed file and say what it is. Never throws.
   *   { ok:false, reason }                         refused, in words
   *   { ok:true, kind:'shows', shows:[...] }       an older shows-only export
   *   { ok:true, kind:'full', counts, exportedAt } a full backup
   */
  function inspect(parsed) {
    if (Array.isArray(parsed)) {
      return parsed.every(isObject)
        ? { ok: true, kind: 'shows', shows: parsed }
        : refuse('That file is a list, but not a list of shows.');
    }
    if (!isObject(parsed)) return refuse('That file is not a Show Ledger backup.');

    if (parsed.format === undefined) {
      // The older export: { schemaVersion, exportedAt, shows: [...] }.
      if (Array.isArray(parsed.shows) && parsed.shows.every(isObject)) {
        return { ok: true, kind: 'shows', shows: parsed.shows };
      }
      return refuse('That file is not a Show Ledger backup.');
    }
    if (parsed.format !== FORMAT) return refuse('That file is not a Show Ledger backup.');
    if (typeof parsed.formatVersion !== 'number' || parsed.formatVersion < 1) {
      return refuse('That backup does not say which version made it, so it was not restored.');
    }
    if (parsed.formatVersion > FORMAT_VERSION) {
      return refuse('That backup was made by a newer version of the app. Update the app, then restore it.');
    }
    var db = parsed.db;
    if (!isObject(db)) return refuse('That backup has no data in it.');
    if (typeof db.schemaVersion !== 'number' || db.schemaVersion < 1) {
      return refuse('That backup does not say which version of the data it holds, so it was not restored.');
    }
    if (db.schemaVersion > A.SCHEMA_VERSION) {
      return refuse('That backup was made by a newer version of the app. Update the app, then restore it.');
    }
    for (var i = 0; i < COLLECTIONS.length; i++) {
      var c = COLLECTIONS[i];
      var rows = db[c.key];
      if (rows === undefined) continue;      // an older backup may lack a newer collection
      if (!Array.isArray(rows) || !rows.every(isObject)) {
        return refuse('That backup is damaged: its ' + c.many + ' could not be read. Nothing was restored.');
      }
      for (var j = 0; j < rows.length; j++) {
        if (typeof rows[j].id !== 'string' || !rows[j].id) {
          return refuse('That backup is damaged: one of its ' + c.many + ' has no id. Nothing was restored.');
        }
      }
    }
    var settings = parsed.settings;
    if (settings !== undefined && !isObject(settings)) {
      return refuse('That backup is damaged: its preferences could not be read. Nothing was restored.');
    }
    for (var k = 0; k < SETTINGS.length; k++) {
      var s = SETTINGS[k];
      var raw = settings ? settings[s.key] : undefined;
      if (raw === undefined) continue;
      if (typeof raw !== 'string' || raw.length > MAX_SETTING_CHARS) {
        return refuse('That backup is damaged: its ' + s.label + ' could not be read. Nothing was restored.');
      }
      if (s.json) {
        try { JSON.parse(raw); }
        catch (_) { return refuse('That backup is damaged: its ' + s.label + ' could not be read. Nothing was restored.'); }
      }
    }
    return {
      ok: true, kind: 'full',
      counts: countsOf(db),
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
      schemaVersion: db.schemaVersion
    };
  }

  /* ---- restore ------------------------------------------------------------ */
  function snapshotSettings() {
    var out = {};
    SETTINGS.forEach(function (s) { out[s.key] = getRaw(s.key); });
    return out;
  }

  /**
   * Replace what is on this device with a full backup. Resolves to
   *   { ok:false, reason }  — refused; nothing changed
   *   { ok:true, counts, kept, undo }
   * `kept` names the collections a sync backend owns, which were left alone.
   * `undo()` puts back exactly what was there before.
   */
  function restore(parsed) {
    var seen = inspect(parsed);
    if (!seen.ok) return Promise.resolve(seen);
    if (seen.kind !== 'full') {
      return Promise.resolve(refuse('That file holds shows only. Use it to replace the show list instead.'));
    }
    var kept = synced();
    var prevSettings = snapshotSettings();
    var prevDb;
    try { prevDb = A.LocalStore.restore(parsed.db, kept); }
    catch (_) { return Promise.resolve(refuse('Could not save — storage is unavailable or full. Nothing was restored.')); }

    // Only the settings we know, and only as the strings they were stored as.
    // A setting the backup does not carry is cleared: the device ends up as
    // the backup had it, not as a mix of the two.
    var given = parsed.settings || {};
    SETTINGS.forEach(function (s) {
      setRaw(s.key, typeof given[s.key] === 'string' ? given[s.key] : null);
    });

    return Promise.resolve({
      ok: true,
      counts: seen.counts,
      kept: kept,
      undo: function () {
        A.LocalStore.restore(prevDb, kept);
        SETTINGS.forEach(function (s) { setRaw(s.key, prevSettings[s.key]); });
      }
    });
  }

  /* ---- when was the last one ---------------------------------------------- */
  function markDone(when) { setRaw(LAST_KEY, when || new Date().toISOString()); }
  function lastAt() {
    var raw = getRaw(LAST_KEY);
    return raw && !isNaN(Date.parse(raw)) ? raw : null;
  }
  /**
   * What to tell the artist about their backup, in words. `stale` is true
   * when there has never been one, or the last is more than 30 days old.
   */
  function status(now) {
    var at = lastAt();
    if (!at) return { at: null, days: null, stale: true, text: 'Never backed up — your season is saved only in this browser.' };
    var days = Math.floor(((now || new Date()).getTime() - Date.parse(at)) / 86400000);
    if (days < 0) days = 0;
    var when = days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
    return { at: at, days: days, stale: days > 30, text: 'Last backup: ' + when + '.' };
  }

  function fileName(when) {
    return 'show-ledger-backup-' + (when || new Date()).toISOString().slice(0, 10) + '.json';
  }

  return {
    FORMAT: FORMAT, FORMAT_VERSION: FORMAT_VERSION,
    SETTINGS: SETTINGS, COLLECTIONS: COLLECTIONS,
    build: build, inspect: inspect, restore: restore,
    describe: describe, countsOf: countsOf, synced: synced,
    markDone: markDone, lastAt: lastAt, status: status, fileName: fileName
  };
})();
