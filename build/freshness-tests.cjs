/* ==========================================================================
   Tests for freshness (docs/product-plan.md, B4).

   Every sourced catalogue fact shows the date it was captured, never the
   build date. A ledger show carries the artist's own "last checked", and
   near its deadline the ledger asks the artist to look at the show's own
   page instead of trusting an old date. Old saved data loads unchanged.

   Usage:
     python3 -m http.server 8765     # from the repo root
     node build/freshness-tests.cjs
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

let pass = 0; const fails = [];
const check = (n, ok, d) => { if (ok) { pass++; console.log('  PASS  ' + n); }
  else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

const ROOTDIR = path.join(__dirname, '..');
const fit = JSON.parse(fs.readFileSync(path.join(ROOTDIR, 'tracker', 'fit-data.json'), 'utf8'));
const exportDate = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-source.json'), 'utf8')).importedAt;
const researchDate = JSON.parse(fs.readFileSync(path.join(__dirname, 'show-research.json'), 'utf8')).generatedAt;

// ---- the data: every sourced fact is dated, no estimate is ------------------
const SOURCED = ['verified', 'corroborated', 'search', 'dataset'];
let sourced = 0, undatedKey = 0, estimateDated = 0, exportWrong = 0, researchWrong = 0, checkedWrong = 0;
fit.shows.forEach(s => Object.values(s.provenance || {}).forEach(e => {
  if (!e || typeof e !== 'object') return;
  if (SOURCED.includes(e.status)) {
    sourced++;
    if (!('captured' in e)) undatedKey++;
    if (e.checked && e.captured !== e.checked) checkedWrong++;
    else if (!e.checked && e.basis === 'ZAPPlication export' && e.captured !== exportDate) exportWrong++;
    else if (!e.checked && /^ZAPPlication event page research pass/.test(e.basis || '') && e.captured !== researchDate) researchWrong++;
  } else if ('captured' in e) estimateDated++;
}));
check('every sourced fact carries a capture date or says it has none', sourced > 1000 && undatedKey === 0, sourced + ' sourced, ' + undatedKey + ' without');
check('a fact\'s own checked date is its capture date', checkedWrong === 0, String(checkedWrong));
check('an export fact is dated by the export, not the build', exportWrong === 0 && exportDate !== fit.builtAt, exportDate);
check('a research-pass fact is dated by the pass', researchWrong === 0, researchDate);
check('an estimate is never given a capture date', estimateDated === 0, String(estimateDated));

(async () => {
  const EXECUTABLE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b = await chromium.launch(fs.existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {});
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const ROOT = 'http://127.0.0.1:8765/tracker/';
  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  await p.evaluate(() => localStorage.clear());

  // ---- the drawer shows when each fact was captured ---------------------------
  const pick = fit.shows.find(s => s.provenance && s.provenance.applyBy && s.provenance.applyBy.basis === 'ZAPPlication export' &&
    !s.provenance.applyBy.checked && s.facts && s.facts.applyBy);
  await p.goto(ROOT + 'browse.html#show=' + encodeURIComponent(pick.catalogueId || pick.id), { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const drawer = await p.evaluate(exp => {
    const row = [...document.querySelectorAll('.idr .facttable tr')].find(r => /Application deadline/.test(r.textContent));
    const fac = document.querySelector('.idr .factable');
    return { open: !!document.querySelector('.idr'), row: row ? row.textContent : '', want: window.AST.fmtDay(exp),
             factorDated: fac ? /as of|date not recorded/.test(fac.textContent) : null };
  }, exportDate);
  check('the drawer opens for a catalogue show', drawer.open, pick.name);
  check('its deadline says when it was captured', drawer.row.indexOf('as of ' + drawer.want) !== -1, drawer.row);
  check('an estimated factor carries no capture date', drawer.factorDated === false);

  // ---- old saved data loads unchanged ------------------------------------------
  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const raw = await p.evaluate(({ soon, start, old }) => {
    /* Shaped as saved before B4: no checkedAt on any show, and already
       linked to catalogue records the way All shows links a hand-added show. */
    const show = (id, extra) => Object.assign({ id, name: 'Invented ' + id, city: 'Town', state: 'FL', lat: null, lng: null,
      startDate: start, endDate: start, applyBy: soon, status: 'interested', rating: 0, juryFee: 35, boothFee: 400,
      grossSales: null, routeNumber: '', isAlternate: false, hidden: false, notes: '', url: '', source: 'manual',
      catalogueId: 'led-' + id, deletedAt: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }, extra || {});
    const db = { schemaVersion: 11, pristineSeed: false, events: [], applications: [], rankers: [], expenses: [],
      reviews: [], sales: [], contacts: [], debriefs: [],
      shows: [show('soon-1', { url: 'https://example.org/soon' }), show('soon-applied', { status: 'applied' }),
              show('later', { applyBy: old })] };
    localStorage.setItem('artShowTracker.db', JSON.stringify(db));
    return localStorage.getItem('artShowTracker.db');
  }, { soon: inDays(5), start: inDays(60), old: inDays(40) });
  for (const pg of ['index.html', 'browse.html', 'calendar.html']) {
    await p.goto(ROOT + pg, { waitUntil: 'load' });
    await p.waitForTimeout(400);
  }
  check('a season saved before "last checked" existed loads byte-for-byte unchanged',
        await p.evaluate(() => localStorage.getItem('artShowTracker.db')) === raw);

  // ---- near the deadline, the ledger asks for a look at the show's page -------
  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const panel = await p.evaluate(() => [...document.querySelectorAll('#deadlinePanel .deadline-row')].map(r => ({
    text: r.textContent, link: (r.querySelector('.d-check a') || {}).href || '', btn: !!r.querySelector('[data-checked]') })));
  const soon = panel.find(r => /soon-1/.test(r.text)), applied = panel.find(r => /soon-applied/.test(r.text)),
        later = panel.find(r => /Invented later/.test(r.text));
  check('a deadline in five days, never checked, asks for a look at the page', soon && /Check the show's own page/.test(soon.text) &&
        /nobody has checked/.test(soon.text) && soon.btn, JSON.stringify(soon));
  check('it links to the show\'s page when the show has one', soon && soon.link === 'https://example.org/soon', soon && soon.link);
  check('a show already applied to is not nagged', applied && !/Check the show/.test(applied.text), applied && applied.text);
  check('a deadline weeks away is not nagged yet', later && !/Check the show/.test(later.text), later && later.text);

  await p.click('#deadlinePanel [data-checked="soon-1"]');
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({
    saved: JSON.parse(localStorage.getItem('artShowTracker.db')).shows.find(s => s.id === 'soon-1').checkedAt,
    today: window.AST.todayISO(),
    still: /Check the show/.test([...document.querySelectorAll('#deadlinePanel .deadline-row')].find(r => /soon-1/.test(r.textContent)).textContent)
  }));
  check('"I checked it today" records today and the prompt goes', after.saved === after.today && !after.still, JSON.stringify(after));

  /* A check more than a month old asks again. */
  await p.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('artShowTracker.db'));
    db.shows.find(s => s.id === 'soon-1').checkedAt = '2026-01-02';
    localStorage.setItem('artShowTracker.db', JSON.stringify(db));
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(400);
  const stale = await p.evaluate(() => [...document.querySelectorAll('#deadlinePanel .deadline-row')].find(r => /soon-1/.test(r.textContent)).textContent);
  check('a check more than a month old asks again, and says when it was', /last checked Jan 2\b/.test(stale), stale);

  // ---- the edit pane ------------------------------------------------------------
  await p.click('.show-row[data-id="later"] .r-dates');
  await p.waitForTimeout(300);
  const pane = await p.evaluate(() => ({ text: document.querySelector('#f_checkedText').textContent,
    disabled: document.querySelector('#f_checkedNow').disabled }));
  check('the edit pane says when the details were last checked', /Not checked against the show's page yet/.test(pane.text) && !pane.disabled,
        JSON.stringify(pane));
  await p.click('#f_checkedNow');
  check('"I checked it today" in the pane shows today', /today/.test(await p.textContent('#f_checkedText')));
  await p.click('#btnSave');
  await p.waitForTimeout(400);
  const savedLater = await p.evaluate(() => JSON.parse(localStorage.getItem('artShowTracker.db')).shows.find(s => s.id === 'later').checkedAt);
  check('and Save keeps it', savedLater === await p.evaluate(() => window.AST.todayISO()), savedLater);

  // ---- a pasted show's page counts as checked today ----------------------------
  const pasted = await p.evaluate(() => {
    const I = window.ASTImport;
    const out = I.readAny('Gull Point Arts Festival\nFebruary 13-15, 2027 · Gull Point, FL\nApplication deadline: September 8, 2026');
    const csv = I.makeCandidate(out.rows[0].fields, '', 'csv');
    return { paste: I.toShow(out.rows[0]).checkedAt, csv: I.toShow(csv).checkedAt, today: window.AST.todayISO() };
  });
  check('a show read from its pasted page is checked today; a CSV row is not', pasted.paste === pasted.today && pasted.csv === '',
        JSON.stringify(pasted));

  check('no page errors along the way', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
  if (fails.length) { fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
