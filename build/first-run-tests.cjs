/* ==========================================================================
   Browser tests for the empty first run (docs/product-plan.md, A2).

   A new device used to be handed one artist's real season. Now it starts
   empty, offers an invented sample season on request, and never lets the
   sample leave the device or pose as real. A device that holds real data
   must come through all of this byte-for-byte untouched.

   Usage:
     python3 -m http.server 8765     # from the repo root
     node build/first-run-tests.cjs
   ========================================================================== */
const { chromium } = require('playwright');
const fs = require('fs');

const EXECUTABLE = process.env.PW_CHROMIUM ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT = 'http://127.0.0.1:8765/tracker/';
const PAGES = ['index.html', 'browse.html', 'calendar.html', 'expenses.html', 'contacts.html', 'map.html'];
const DB = 'artShowTracker.db';
let pass = 0; const fails = [];
const check = (n, ok, d) => { if (ok) { pass++; console.log('  PASS  ' + n); }
  else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

(async () => {
  const b = await chromium.launch(fs.existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {});
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  /* Outside services are not reachable here and are not the subject. */
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());

  const fresh = async () => {
    await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
    await p.evaluate(() => localStorage.clear());
  };
  const visitAll = async () => {
    for (const page of PAGES) {
      await p.goto(ROOT + page, { waitUntil: 'load' });
      await p.waitForTimeout(300);
    }
  };

  // ---- a brand-new browser starts empty on every page ----------------------
  await fresh();
  await visitAll();
  const empty = await p.evaluate(async () => (await window.AST.Store.list()).length);
  check('a fresh browser holds no shows after every page has opened', empty === 0, String(empty));
  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  await p.waitForTimeout(400);
  const start = await p.evaluate(() => ({
    rows: document.querySelectorAll('.show-row').length,
    box: !!document.querySelector('#emptyStart'),
    browse: !!document.querySelector('#emptyStart a[href="browse.html"]'),
    add: !!document.querySelector('#emptyAdd'),
    sample: !!document.querySelector('#emptySample'),
    note: document.querySelector('#sampleNote').hidden
  }));
  check('the empty ledger lists no rows', start.rows === 0, String(start.rows));
  check('it offers browse, add and the sample season', start.box && start.browse && start.add && start.sample,
        JSON.stringify(start));
  check('the "sample shows" note is hidden while there is no sample', start.note === true);
  const cal = await (async () => {
    await p.goto(ROOT + 'calendar.html', { waitUntil: 'load' });
    await p.waitForTimeout(400);
    return p.evaluate(() => /Naples|Bonita|Coconut Grove|Beaux Arts/.test(document.body.innerText));
  })();
  check('the calendar shows none of the old seeded season', cal === false);

  // ---- a device still holding the untouched old seed comes up empty --------
  await fresh();
  await p.evaluate(key => {
    const A = window.AST;
    const seed = [
      A.makeShow({ routeNumber: '1', name: "Naples New Year's Art Fair", city: 'Naples', state: 'FL',
                   startDate: '2027-01-02', endDate: '2027-01-03', status: 'accepted' }),
      A.makeShow({ routeNumber: '7', name: 'Coconut Grove Arts Festival', city: 'Coconut Grove, Miami', state: 'FL',
                   startDate: '2027-02-13', endDate: '2027-02-15', status: 'applied' })
    ];
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 9, shows: seed, events: [], applications: [],
      rankers: [], expenses: [], reviews: [], sales: [], pristineSeed: true }));
  }, DB);
  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  await p.waitForTimeout(400);
  const seedGone = await p.evaluate(async key => {
    const stored = JSON.parse(localStorage.getItem(key));
    return { live: (await window.AST.Store.list()).length, stored: stored.shows.length,
             flag: stored.pristineSeed, rows: document.querySelectorAll('.show-row').length };
  }, DB);
  check('an untouched old seed is cleared to empty when read', seedGone.live === 0 && seedGone.rows === 0,
        JSON.stringify(seedGone));
  check('and the stored copy is rewritten, so it is not cleared again', seedGone.stored === 0 && seedGone.flag === false,
        JSON.stringify(seedGone));

  /* A device whose seed was edited even once is someone's data: kept whole. */
  await fresh();
  await p.evaluate(key => {
    const A = window.AST;
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 11, pristineSeed: false,
      shows: [A.makeShow({ id: 'kept-1', name: "Naples New Year's Art Fair", status: 'accepted',
                           startDate: '2027-01-02', endDate: '2027-01-03' })],
      events: [], applications: [], rankers: [], expenses: [], reviews: [], sales: [], contacts: [], debriefs: [] }));
  }, DB);
  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  await p.waitForTimeout(300);
  const keptSeed = await p.evaluate(async () => (await window.AST.Store.list()).map(s => s.id).join(','));
  check('a seed the artist has written to is kept', keptSeed === 'kept-1', keptSeed);

  // ---- a real season is byte-for-byte untouched ----------------------------
  /* Shaped like the owner's own backup (2026-11-14): sixteen shows, catalogue
     and hand-added, many statuses, one sale, every other collection empty.
     Every name and number here is invented. */
  await fresh();
  const before = await p.evaluate(async key => {
    const A = window.AST;
    const catIds = (await (await fetch('catalogue.json')).json()).shows.map(r => r.id);
    const statuses = ['accepted', 'applied', 'interested', 'waitlist', 'declined', 'not_applying'];
    const shows = [];
    for (let i = 0; i < 16; i++) {
      const d = String(1 + (i % 27)).padStart(2, '0');
      const m = String(1 + Math.floor(i / 4)).padStart(2, '0');
      shows.push(A.makeShow({
        id: 'real-' + i, routeNumber: String(i + 1), name: 'Invented Fair ' + (i + 1),
        city: 'Town ' + i, state: ['FL', 'GA', 'SC', 'NC'][i % 4], lat: 27 + i / 10, lng: -82 + i / 10,
        startDate: '2027-' + m + '-' + d, endDate: '2027-' + m + '-' + d, applyBy: '2026-12-' + d,
        status: statuses[i % statuses.length], isAlternate: i % 5 === 4,
        boothFee: i % 3 ? 400 + i * 10 : null, juryFee: i % 2 ? 35 : null,
        source: i % 4 === 0 ? 'manual' : 'catalogue',
        catalogueId: i % 4 === 0 ? 'led-real-' + i : catIds[i * 7], notes: i === 2 ? 'Corner booth if possible.' : '',
        updatedAt: '2026-11-0' + (1 + (i % 9)) + 'T12:00:00.000Z'
      }));
    }
    const sales = [A.makeSale({ id: 'sale-1', showId: 'real-0', title: 'Test sale', price: 1 })];
    const db = { schemaVersion: 11, shows, events: [], applications: [], rankers: [], expenses: [],
                 reviews: [], sales, contacts: [], debriefs: [], pristineSeed: false };
    localStorage.setItem(key, JSON.stringify(db));
    return localStorage.getItem(key);
  }, DB);
  await visitAll();
  const after = await p.evaluate(key => localStorage.getItem(key), DB);
  check('a real season is byte-for-byte unchanged after every page opens', after === before,
        after === before ? '' : 'stored copy changed');
  const parsed = JSON.parse(after);
  check('all sixteen shows and the sale are still there', parsed.shows.length === 16 && parsed.sales.length === 1 &&
        parsed.pristineSeed === false, parsed.shows.length + ' shows, ' + parsed.sales.length + ' sales');
  check('and nothing was added to it', JSON.parse(before).shows.every((s, i) => parsed.shows[i].id === s.id));
  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  await p.waitForTimeout(400);
  const realView = await p.evaluate(() => ({
    sample: !!document.querySelector('#emptySample'),
    note: document.querySelector('#sampleNote').hidden,
    tags: (document.body.innerText.match(/NOT REAL/g) || []).length
  }));
  check('a real season is not offered the sample, and nothing is tagged NOT REAL',
        !realView.sample && realView.note && realView.tags === 0, JSON.stringify(realView));

  // ---- loading and removing the sample ---------------------------------------
  await fresh();
  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  await p.waitForTimeout(400);
  await p.click('#emptySample');
  await p.waitForTimeout(500);
  const loaded = await p.evaluate(async () => {
    const shows = await window.AST.Store.list();
    return { n: shows.length, allSample: shows.every(s => s.source === 'sample' && /^sample-/.test(s.id)),
             named: shows.every(s => /^Sample: /.test(s.name)),
             rows: document.querySelectorAll('.show-row').length,
             tags: document.querySelectorAll('.show-row .tag-test').length,
             note: document.querySelector('#sampleNote').hidden };
  });
  check('Load a sample season adds six invented shows', loaded.n === 6 && loaded.allSample && loaded.named,
        JSON.stringify(loaded));
  check('every sample row is tagged NOT REAL', loaded.rows === 6 && loaded.tags === 6, JSON.stringify(loaded));
  check('the "sample shows" note is showing', loaded.note === false);
  const twice = await p.evaluate(async () => {
    await window.AST.LocalStore.loadSample();
    return (await window.AST.Store.list()).length;
  });
  check('loading it twice adds nothing', twice === 6, String(twice));
  await p.goto(ROOT + 'browse.html', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const catWhile = await p.evaluate(async () => ({
    recs: window.ASTCatalogue.all().filter(r => /^Sample: /.test(r.name)).length,
    linked: (await window.AST.Store.list()).filter(s => s.catalogueId).length
  }));
  check('All shows does not turn sample shows into catalogue records', catWhile.recs === 0 && catWhile.linked === 0,
        JSON.stringify(catWhile));
  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  await p.waitForTimeout(300);

  /* The sample never goes out as real: not on the share card, caption or embed. */
  const shared = await p.evaluate(() => {
    const S = window.ASTShare;
    if (!S) return null;
    return window.AST.Store.list().then(shows => ({
      planned: S.upcoming(shows, { statusMode: 'planned', count: 99, from: new Date('2026-12-01') }).length,
      accepted: S.upcoming(shows, { statusMode: 'accepted', count: 99, from: new Date('2026-12-01') }).length
    }));
  });
  check('sample shows never appear in a public list (card, caption, embed)', shared && shared.planned === 0 &&
        shared.accepted === 0, JSON.stringify(shared));

  /* A real show added beside the sample survives Remove. */
  await p.evaluate(() => window.AST.Store.upsert(window.AST.makeShow({ id: 'mine-1', name: 'My own fair',
    startDate: '2027-04-03', endDate: '2027-04-04', status: 'interested' })));
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(400);
  await p.click('#btnRemoveSample');
  await p.waitForTimeout(500);
  const removed = await p.evaluate(async key => ({
    ids: (await window.AST.Store.list()).map(s => s.id).join(','),
    stored: JSON.parse(localStorage.getItem(key)).shows.filter(s => s.source === 'sample').length,
    note: document.querySelector('#sampleNote').hidden,
    rows: document.querySelectorAll('.show-row').length
  }), DB);
  check('Remove the sample shows takes every sample show away, tombstones too', removed.stored === 0, JSON.stringify(removed));
  check('and leaves the artist\'s own show', removed.ids === 'mine-1' && removed.rows === 1, JSON.stringify(removed));
  check('the note goes once the sample is gone', removed.note === true);
  await p.goto(ROOT + 'browse.html', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const inCatalogue = await p.evaluate(() => window.ASTCatalogue.all().filter(r => /^Sample: /.test(r.name)).length);
  check('no sample show is ever left in the catalogue', inCatalogue === 0, String(inCatalogue));

  // ---- the sample is never offered while a sync backend holds the season ----
  await fresh();
  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  await p.waitForTimeout(300);
  const synced = await p.evaluate(async () => {
    const A = window.AST;
    const fake = Object.assign({}, A.LocalStore, {
      list: () => Promise.resolve([]), listApplications: () => Promise.resolve([]),
      listSales: () => Promise.resolve([])
    });
    A.useStore(fake);
    window.dispatchEvent(new StorageEvent('storage', { key: 'artShowTracker.db' }));
    await new Promise(r => setTimeout(r, 300));
    const out = { box: !!document.querySelector('#emptyStart'), sample: !!document.querySelector('#emptySample') };
    A.useStore(null);
    return out;
  });
  check('signed in to an account, the empty ledger does not offer the sample', synced.box && !synced.sample,
        JSON.stringify(synced));

  /* The studio's "Import my existing data" leaves sample shows behind. */
  await fresh();
  const plan = await p.evaluate(async () => {
    await window.AST.LocalStore.loadSample();
    await window.AST.LocalStore.upsert(window.AST.makeShow({ id: 'mine-2', name: 'Real one' }));
    const S = window.ASTStudio;
    return S && typeof S.importPlan === 'function' ? S.importPlan().shows.map(s => s.id).join(',') : null;
  });
  check('the studio import plan sends no sample show', plan === 'mine-2', String(plan));

  /* The Supabase sync pushes the artist's own shows and never a sample one. */
  await fresh();
  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  const pushed = await p.evaluate(async () => {
    await window.AST.LocalStore.loadSample();
    await window.AST.LocalStore.upsert(window.AST.makeShow({ id: 'mine-3', name: 'Pushed one' }));
    const realFetch = window.fetch;
    const sent = [];
    window.fetch = (url, init) => {
      if (!/example\.invalid/.test(String(url))) return realFetch(url, init);
      if (init && init.method === 'POST') { const rows = JSON.parse(init.body); sent.push(...rows); return Promise.resolve(new Response(JSON.stringify(rows), { status: 201 })); }
      return Promise.resolve(new Response('[]', { status: 200 }));
    };
    const store = window.ASTSupabase.SyncStore({ config: { url: 'https://example.invalid', anonKey: 'k' },
      getSession: () => ({ access_token: 't' }) });
    await store.sync();
    window.fetch = realFetch;
    return { status: store.status(), ids: sent.map(r => r.id).join(',') };
  });
  check('the Supabase sync pushes no sample show', pushed.status === 'synced' && pushed.ids === 'mine-3',
        JSON.stringify(pushed));

  check('no page errors along the way', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close();
  console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
  if (fails.length) { fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
