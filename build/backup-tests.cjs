/* ==========================================================================
   Browser tests for the full backup and restore (tracker/backup.js).

   The promise being tested is simple and has to be exactly true: back up,
   lose everything, restore, and every collection and every choice is back
   as it was. Most of the rest is what a restore REFUSES: a file that is not
   a backup, one made by a newer version, a damaged one. A refusal changes
   nothing on the device.

   Usage:
     python3 -m http.server 8765     # from the repo root
     node build/backup-tests.cjs
   ========================================================================== */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXECUTABLE = process.env.PW_CHROMIUM ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://127.0.0.1:8765/tracker/index.html';
let pass = 0; const fails = [];
const check = (n, ok, d) => { if (ok) { pass++; console.log('  PASS  ' + n); }
  else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

/* Fill every collection and every setting the backup is meant to carry. */
const FILL = async () => {
  const A = window.AST, S = A.Store;
  localStorage.clear();
  await S.replaceAll([{ id: 'show-1', name: 'Test Fair', city: 'Denver', state: 'CO',
    startDate: '2027-07-02', endDate: '2027-07-04', status: 'accepted', boothFee: 650, juryFee: 45,
    grossSales: 4200, notes: 'corner booth' }, { id: 'show-2', name: 'Other Fair', status: 'interested' }]);
  await S.remove('show-2');                                   // a tombstone must survive too
  await S.upsertEvent(A.makeEvent({ id: 'evt-1', title: 'Drive day', date: '2027-07-01' }));
  await S.upsertApplication(A.makeApplication({ id: 'app-1', showId: 'show-1', stage: 'accepted', juryFee: 45 }));
  await S.upsertRanker(A.makeRanker({ id: 'rk-1', name: "Lisa's list" }));
  await S.upsertExpense(A.makeExpense({ id: 'ex-1', showId: 'show-1', category: 'lodging', amount: 310 }));
  await S.upsertExpense(A.makeExpense({ id: 'ex-2', showId: 'show-1', category: 'meals' }));   // uncosted
  await S.upsertSale(A.makeSale({ id: 'sale-1', showId: 'show-1', title: 'Heron, small', price: 900 }));
  await S.upsertSale(A.makeSale({ id: 'sale-2', showId: 'show-1', title: 'Unpriced piece' }));
  await S.upsertContact(A.makeContact({ id: 'c-1', name: 'Ann Buyer', email: 'ann@example.test', consent: 'yes' }));
  await S.upsertContact(A.makeContact({ id: 'c-2', name: 'Bo Private', consent: 'no' }));       // do not contact
  await S.upsertDebrief(A.makeDebrief({ id: 'd-1', showId: 'show-1', buyers: 8 }));
  await S.upsertReview(A.makeReview({ id: 'rv-1', title: 'Spring images' }));
  localStorage.setItem('artShowTracker.catalogue', JSON.stringify({ picks: { 'zapp-1': { liked: true, rating: 4 } }, added: [] }));
  localStorage.setItem('artShowTracker.artistProfile', JSON.stringify({ discipline: 'glass', band: 'mid' }));
  localStorage.setItem('artShowTracker.intel', JSON.stringify({ reports: [{ id: 'r1', showId: 'zapp-1' }] }));
  localStorage.setItem('artShowTracker.share', JSON.stringify({ artist: 'Test Artist' }));
  localStorage.setItem('artShowTracker.layout', JSON.stringify({ ledger: 420 }));
  localStorage.setItem('artShowTracker.calLayers', JSON.stringify({ ledger: true }));
  localStorage.setItem('artShowTracker.theme', 'dark');
};

const SETTING_KEYS = ['artShowTracker.catalogue', 'artShowTracker.artistProfile', 'artShowTracker.intel',
  'artShowTracker.share', 'artShowTracker.layout', 'artShowTracker.calLayers', 'artShowTracker.theme'];

(async () => {
  const b = await chromium.launch(fs.existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {});
  const ctx = await b.newContext({ viewport: { width: 1480, height: 1000 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });

  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForTimeout(500);
  check('page boots clean with backup.js loaded',
        errs.length === 0 && await p.evaluate(() => !!window.ASTBackup), errs.join(' | '));

  // ---- the round trip -------------------------------------------------------
  const rt = await p.evaluate(async ({ FILL, KEYS }) => {
    await (new Function('return (' + FILL + ')')())();
    // Things that must NOT travel in a backup. Planted here only: left in
    // storage across a reload they would sign the page in to Supabase.
    localStorage.setItem('artShowTracker.supabase', JSON.stringify({ url: 'https://x.supabase.co', anonKey: 'ANON-KEY-MARKER' }));
    localStorage.setItem('artShowTracker.session', JSON.stringify({ access_token: 'SESSION-MARKER' }));
    localStorage.setItem('artShowTracker.geocache', JSON.stringify({ 'denver|co': [39.7, -104.9] }));
    const A = window.AST, B = window.ASTBackup;
    const before = A.LocalStore.dump();
    const settingsBefore = KEYS.map(k => localStorage.getItem(k));
    const file = JSON.parse(JSON.stringify(await B.build()));   // as it would come back off disk
    const text = JSON.stringify(file);
    localStorage.clear();                                       // the browser was cleared
    const wiped = A.LocalStore.dump();
    const done = await B.restore(file);
    const after = A.LocalStore.dump();
    return {
      ok: done.ok, reason: done.reason,
      same: JSON.stringify(after) === JSON.stringify(before),
      diff: Object.keys(before).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k])),
      wipedExpenses: wiped.expenses.length,
      settingsSame: KEYS.every((k, i) => localStorage.getItem(k) === settingsBefore[i]),
      counts: file.counts, described: B.describe(file.counts),
      format: file.format, hasContacts: file.db.contacts.map(c => c.id).sort().join(','),
      tombstone: file.db.shows.some(s => s.id === 'show-2' && s.deletedAt),
      uncosted: file.db.expenses.find(e => e.id === 'ex-2').amount,
      unpriced: file.db.sales.find(s => s.id === 'sale-2').price,
      leaksKey: /ANON-KEY-MARKER|SESSION-MARKER/.test(text),
      carriesCache: 'artShowTracker.geocache' in file.settings,
      afterSupabase: localStorage.getItem('artShowTracker.supabase')
    };
  }, { FILL: FILL.toString(), KEYS: SETTING_KEYS });
  check('a restore after a wipe brings back every collection exactly', rt.ok && rt.same,
        rt.reason || ('differs in: ' + rt.diff.join(', ')));
  check('the wipe really was a wipe (the test is not comparing a thing to itself)', rt.wipedExpenses === 0);
  check('hearts, the fit profile, private reports, prefs and theme come back exactly', rt.settingsSame);
  check('the file names itself as a Show Ledger backup', rt.format === 'show-ledger-backup', rt.format);
  check('the file counts what it holds, in words', /1 show\b/.test(rt.described) && /2 expenses/.test(rt.described) &&
        /2 contacts/.test(rt.described), rt.described);
  check('contacts are in the backup, "do not contact" included', rt.hasContacts === 'c-1,c-2', rt.hasContacts);
  check('a deleted show stays deleted through a backup', rt.tombstone === true);
  check('an uncosted expense is still null, never $0', rt.uncosted === null, String(rt.uncosted));
  check('an unpriced sale is still null, never $0', rt.unpriced === null, String(rt.unpriced));
  check('no sign-in session or API key is written into the file', rt.leaksKey === false);
  check('caches are not in the file', rt.carriesCache === false);
  check('a restore does not invent sign-in settings', rt.afterSupabase === null, String(rt.afterSupabase));

  // ---- data from before this feature loads unchanged ------------------------
  const old = await p.evaluate(async (FILL) => {
    await (new Function('return (' + FILL + ')')())();
    return localStorage.getItem('artShowTracker.db');
  }, FILL.toString());
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(400);
  const still = await p.evaluate(() => localStorage.getItem('artShowTracker.db'));
  check('an existing season is untouched by loading the new page', still === old);

  // ---- refusals: nothing changes on the device ------------------------------
  const ref = await p.evaluate(async () => {
    const A = window.AST, B = window.ASTBackup;
    const good = JSON.parse(JSON.stringify(await B.build()));
    const before = JSON.stringify(A.LocalStore.dump()) + localStorage.getItem('artShowTracker.catalogue');
    const clone = () => JSON.parse(JSON.stringify(good));
    const cases = {
      notBackup: { hello: 'world' },
      wrongFormat: Object.assign(clone(), { format: 'something-else' }),
      newerFormat: Object.assign(clone(), { formatVersion: 99 }),
      newerSchema: (() => { const c = clone(); c.db.schemaVersion = A.SCHEMA_VERSION + 1; return c; })(),
      noSchema: (() => { const c = clone(); delete c.db.schemaVersion; return c; })(),
      noDb: (() => { const c = clone(); delete c.db; return c; })(),
      rowsNotObjects: (() => { const c = clone(); c.db.expenses = ['oops', 3]; return c; })(),
      collectionNotList: (() => { const c = clone(); c.db.sales = { a: 1 }; return c; })(),
      rowWithoutId: (() => { const c = clone(); delete c.db.sales[0].id; return c; })(),
      badSetting: (() => { const c = clone(); c.settings['artShowTracker.catalogue'] = '{not json'; return c; })(),
      settingNotString: (() => { const c = clone(); c.settings['artShowTracker.layout'] = { a: 1 }; return c; })(),
      aString: 'just text', aNumber: 7, nothing: null
    };
    const out = {};
    for (const k of Object.keys(cases)) {
      const r = await B.restore(cases[k]);
      out[k] = { ok: r.ok, reason: r.reason || '',
        unchanged: JSON.stringify(A.LocalStore.dump()) + localStorage.getItem('artShowTracker.catalogue') === before };
    }
    return out;
  });
  for (const k of Object.keys(ref)) {
    check('refused whole, with a reason, and nothing changed: ' + k,
          ref[k].ok === false && ref[k].reason.length > 10 && ref[k].unchanged, JSON.stringify(ref[k]));
  }
  check('a newer backup is told to update the app, not called damaged',
        /newer version/.test(ref.newerFormat.reason) && /newer version/.test(ref.newerSchema.reason));

  // ---- only what the app knows is written -----------------------------------
  const extra = await p.evaluate(async () => {
    const B = window.ASTBackup;
    const file = JSON.parse(JSON.stringify(await B.build()));
    file.settings['artShowTracker.session'] = JSON.stringify({ access_token: 'PLANTED' });
    file.settings['somethingElse'] = 'x';
    localStorage.removeItem('artShowTracker.session');
    const r = await B.restore(file);
    return { ok: r.ok, session: localStorage.getItem('artShowTracker.session'), other: localStorage.getItem('somethingElse') };
  });
  check('a key planted in the file is not written to the device',
        extra.ok && extra.session === null && extra.other === null, JSON.stringify(extra));

  // ---- older files -----------------------------------------------------------
  const legacy = await p.evaluate(() => {
    const B = window.ASTBackup;
    return {
      obj: B.inspect({ schemaVersion: 9, exportedAt: 'x', shows: [{ id: 'a', name: 'Old' }] }),
      arr: B.inspect([{ id: 'a', name: 'Old' }]),
      junk: B.inspect([1, 2, 3])
    };
  });
  check('the older shows-only export is still recognised', legacy.obj.ok && legacy.obj.kind === 'shows' &&
        legacy.arr.ok && legacy.arr.kind === 'shows', JSON.stringify(legacy));
  check('a list that is not shows is refused', legacy.junk.ok === false);

  const mig = await p.evaluate(async () => {
    const A = window.AST, B = window.ASTBackup;
    const file = { format: B.FORMAT, formatVersion: 1, exportedAt: '2026-01-01T00:00:00Z', settings: {},
      db: { schemaVersion: 9, shows: [{ id: 's9', name: 'From v9', status: 'accepted' }],
            expenses: [{ id: 'e9', showId: 's9', category: 'fuel', amount: 40 }] } };
    const r = await B.restore(file);
    const db = A.LocalStore.dump();
    return { ok: r.ok, v: db.schemaVersion, cur: A.SCHEMA_VERSION, show: db.shows.length, exp: db.expenses.length,
             sales: db.sales.length, contacts: db.contacts.length, catalogue: localStorage.getItem('artShowTracker.catalogue') };
  });
  check('a backup from an older version of the data is brought up to date',
        mig.ok && mig.v === mig.cur && mig.show === 1 && mig.exp === 1, JSON.stringify(mig));
  check('nothing is invented for collections the older backup never had', mig.sales === 0 && mig.contacts === 0);
  check('a setting the backup does not carry is cleared, not left over from before', mig.catalogue === null);

  // ---- undo ------------------------------------------------------------------
  const undo = await p.evaluate(async (FILL) => {
    await (new Function('return (' + FILL + ')')())();
    const A = window.AST, B = window.ASTBackup;
    const before = JSON.stringify(A.LocalStore.dump()) + localStorage.getItem('artShowTracker.theme');
    const empty = { format: B.FORMAT, formatVersion: 1, settings: {}, db: { schemaVersion: A.SCHEMA_VERSION, shows: [] } };
    const r = await B.restore(empty);
    const mid = A.LocalStore.dump().expenses.length;
    r.undo();
    return { mid, back: JSON.stringify(A.LocalStore.dump()) + localStorage.getItem('artShowTracker.theme') === before };
  }, FILL.toString());
  check('Undo puts back exactly what was there', undo.mid === 0 && undo.back, JSON.stringify(undo));

  // ---- signed in to a sync backend -------------------------------------------
  const sync = await p.evaluate(async () => {
    const A = window.AST, B = window.ASTBackup;
    const remoteShows = [A.makeShow({ id: 'remote-1', name: 'From the account' })];
    const remoteSales = [A.makeSale({ id: 'rs-1', title: 'Account sale', price: 50 })];
    let pushed = false;
    const fake = Object.assign({}, A.LocalStore, {
      list: () => Promise.resolve(remoteShows),
      listSales: () => Promise.resolve(remoteSales),
      replaceAll: () => { pushed = true; return Promise.resolve([]); },
      upsert: () => { pushed = true; return Promise.resolve(null); },
      upsertSale: () => { pushed = true; return Promise.resolve(null); }
    });
    A.useStore(fake);
    const file = JSON.parse(JSON.stringify(await B.build()));
    const localBefore = A.LocalStore.dump();
    const other = JSON.parse(JSON.stringify(file));
    other.db.shows = [{ id: 'old-1', name: 'An old season' }];
    other.db.sales = [];
    other.db.expenses = [];
    const r = await B.restore(other);
    const localAfter = A.LocalStore.dump();
    A.useStore(null);
    return {
      fileShows: file.db.shows.map(s => s.id).join(','), fileSales: file.db.sales.map(s => s.id).join(','),
      owned: file.syncedCollections.join(','), kept: (r.kept || []).join(','), pushed,
      showsLeft: JSON.stringify(localAfter.shows) === JSON.stringify(localBefore.shows),
      salesLeft: JSON.stringify(localAfter.sales) === JSON.stringify(localBefore.sales),
      expensesReplaced: localAfter.expenses.length === 0
    };
  });
  check('signed in, the backup holds the account\'s shows and sales', sync.fileShows === 'remote-1' && sync.fileSales === 'rs-1',
        JSON.stringify(sync));
  check('signed in, a restore leaves shows and sales to the account and says which', sync.kept === 'shows,sales' &&
        sync.showsLeft && sync.salesLeft && sync.pushed === false, JSON.stringify(sync));
  check('signed in, everything else is still restored', sync.expensesReplaced === true);

  // ---- "when did I last back up" ----------------------------------------------
  const st = await p.evaluate(() => {
    const B = window.ASTBackup;
    localStorage.removeItem('artShowTracker.lastBackup');
    const never = B.status();
    B.markDone('2027-03-01T12:00:00Z');
    return { never, today: B.status(new Date('2027-03-01T18:00:00Z')), yday: B.status(new Date('2027-03-02T13:00:00Z')),
             old: B.status(new Date('2027-04-15T12:00:00Z')), name: B.fileName(new Date('2027-03-01T12:00:00Z')) };
  });
  check('with no backup it says so plainly, and where the data lives', st.never.stale && /Never backed up/.test(st.never.text) &&
        /only in this browser/.test(st.never.text), st.never.text);
  check('a backup made today reads "today"', st.today.stale === false && /today/.test(st.today.text), st.today.text);
  check('a day later it reads "yesterday"', /yesterday/.test(st.yday.text), st.yday.text);
  check('after a month it is stale', st.old.stale === true && /45 days ago/.test(st.old.text), st.old.text);
  check('the file is named for what it is and the day', st.name === 'show-ledger-backup-2027-03-01.json', st.name);

  // ---- the page ---------------------------------------------------------------
  await p.evaluate(async (FILL) => { await (new Function('return (' + FILL + ')')())(); localStorage.removeItem('artShowTracker.lastBackup'); },
                   FILL.toString());
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(500);
  const labels = await p.evaluate(() => ({ exp: document.querySelector('#btnExport').textContent.trim(),
    imp: document.querySelector('#btnImport').textContent.trim(), note: document.querySelector('#backupNote').textContent }));
  check('the buttons say what they do: Back up / Restore', labels.exp === 'Back up' && labels.imp === 'Restore', JSON.stringify(labels));
  check('the ledger says there has never been a backup', /Never backed up/.test(labels.note), labels.note);

  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnExport')]);
  const tmp = path.join(os.tmpdir(), 'ast-backup-test-' + process.pid + '.json');
  await dl.saveAs(tmp);
  const onDisk = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  check('Back up hands the browser one file, named for the day',
        /^show-ledger-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  check('that file is a full backup with every collection in it', onDisk.format === 'show-ledger-backup' &&
        onDisk.db.expenses.length === 2 && onDisk.db.contacts.length === 2 && onDisk.db.sales.length === 2 &&
        onDisk.db.events.length === 1 && onDisk.db.applications.length >= 1);
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({ note: document.querySelector('#backupNote').textContent,
    toast: document.querySelector('#toastMsg').textContent }));
  check('afterwards the ledger says the last backup was today', /Last backup: today/.test(after.note), after.note);
  check('the message says a file was made, not that it is safe', /Backup file made/.test(after.toast) && !/saved to|uploaded|synced/i.test(after.toast),
        after.toast);

  // wipe, then restore through the page
  await p.evaluate(() => { const A = window.AST; const B = window.ASTBackup;
    return B.restore({ format: B.FORMAT, formatVersion: 1, settings: {}, db: { schemaVersion: A.SCHEMA_VERSION, shows: [] } }); });
  const dialogs = [];
  p.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await p.setInputFiles('#fileImport', tmp);
  await p.waitForTimeout(700);
  const restored = await p.evaluate(() => ({ db: window.AST.LocalStore.dump(), toast: document.querySelector('#toastMsg').textContent,
    undo: !document.querySelector('#toastAct').hidden, rows: document.querySelectorAll('#listBody tr, .show-row').length,
    theme: localStorage.getItem('artShowTracker.theme') }));
  check('Restore asks first, and says what the file holds', dialogs.length === 1 && /Replace everything on this device/.test(dialogs[0]) &&
        /2 expenses/.test(dialogs[0]), dialogs.join(' | '));
  check('Restore through the page brings the season back', restored.db.expenses.length === 2 && restored.db.contacts.length === 2 &&
        restored.db.shows.some(s => s.id === 'show-1') && restored.theme === 'dark');
  check('and offers Undo', restored.undo === true && /Restored/.test(restored.toast), restored.toast);

  // a file that is not a backup, through the page
  const junk = path.join(os.tmpdir(), 'ast-backup-junk-' + process.pid + '.json');
  fs.writeFileSync(junk, JSON.stringify({ format: 'show-ledger-backup', formatVersion: 42, db: {} }));
  const beforeJunk = await p.evaluate(() => JSON.stringify(window.AST.LocalStore.dump()));
  await p.setInputFiles('#fileImport', junk);
  await p.waitForTimeout(500);
  const afterJunk = await p.evaluate(() => ({ db: JSON.stringify(window.AST.LocalStore.dump()),
    toast: document.querySelector('#toastMsg').textContent }));
  check('a file from a newer version is refused on the page, with the reason, and no question is asked',
        afterJunk.db === beforeJunk && /newer version/.test(afterJunk.toast) && dialogs.length === 1, afterJunk.toast);
  fs.unlinkSync(tmp); fs.unlinkSync(junk);

  // ---- keeping the data alive ---------------------------------------------------
  const keep = await p.evaluate(async () => {
    const B = window.ASTBackup;
    const phone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', maxTouchPoints: 5 };
    return {
      asked: await B.askToKeep(),
      iphoneBrowser: B.needsHomeScreen(phone),
      iphoneInstalled: B.needsHomeScreen(Object.assign({ standalone: true }, phone)),
      ipadAsMac: B.needsHomeScreen({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1', maxTouchPoints: 5 }),
      mac: B.needsHomeScreen({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1', maxTouchPoints: 0 }),
      android: B.needsHomeScreen({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile', maxTouchPoints: 5 }),
      hintHiddenHere: document.querySelector('#whereSavedPhone').hidden
    };
  });
  check('asking the browser to keep the data never throws, whatever it answers',
        keep.asked === true || keep.asked === false || keep.asked === null, String(keep.asked));
  check('an iPhone in the browser is told about the home screen; an installed one is not',
        keep.iphoneBrowser === true && keep.iphoneInstalled === false && keep.ipadAsMac === true);
  check('a laptop or an Android phone is not shown the iPhone advice',
        keep.mac === false && keep.android === false && keep.hintHiddenHere === true, JSON.stringify(keep));

  // ---- a second tab -------------------------------------------------------------
  const p2 = await ctx.newPage();
  await p2.goto(BASE, { waitUntil: 'load' });
  await p2.waitForTimeout(400);
  await p2.evaluate(() => window.AST.Store.upsert(window.AST.makeShow({ id: 'tab2-show', name: 'Added In The Other Tab', status: 'interested' })));
  await p.waitForTimeout(600);
  const seen = await p.evaluate(() => document.body.innerText.includes('Added In The Other Tab'));
  check('a show added in another tab appears here without a reload', seen === true);
  await p2.close();

  check('no page errors along the way', errs.length === 0, errs.join(' | '));

  await b.close();
  console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
  if (fails.length) { fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
})();
