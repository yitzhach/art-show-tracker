/* ==========================================================================
   Tests for the general paste reader (docs/product-plan.md, B1 and B2).

   Part 1 is pure node: every hand-written text in build/fixtures/paste/ is
   read and compared, field by field, with expected.json. Those texts are the
   contract. When a reading looks wrong, check it against the raw .txt, never
   by reading the reader's code (the fee parser's rule, START-HERE.md).

   Part 2 drives the Import modal in a browser: the paste goes to review,
   nothing is saved before Import, and the link the artist gave is kept.

   Usage:
     python3 -m http.server 8765     # from the repo root (part 2 only)
     node build/paste-tests.cjs
   ========================================================================== */
const fs = require('fs');
const path = require('path');

global.window = {};
require('../tracker/core.js');
require('../tracker/import.js');
const I = window.ASTImport;

let pass = 0; const fails = [];
const check = (n, ok, d) => { if (ok) { pass++; console.log('  PASS  ' + n); }
  else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

const DIR = path.join(__dirname, 'fixtures', 'paste');
const expected = JSON.parse(fs.readFileSync(path.join(DIR, 'expected.json'), 'utf8'));
const now = new Date(expected.today + 'T12:00:00');
const fs_zapp = fs.readFileSync(path.join(DIR, 'zapp-list.txt'), 'utf8');
const FIELDS = ['name', 'city', 'state', 'startDate', 'endDate', 'applyBy', 'juryFee', 'boothFee', 'url'];

// ---- part 1: every fixture reads to the right fields or to "not found" ------
Object.keys(expected).filter(k => k.endsWith('.txt')).forEach(file => {
  const want = expected[file];
  const text = fs.readFileSync(path.join(DIR, file), 'utf8');
  const got = I.readAny(text, { now });
  let rows = got.rows;
  if (got.mode === 'table') rows = I.rowsFromTable(got.table, got.mapping, 'zapp_paste');
  check(file + ': read as ' + want.mode, got.mode === want.mode, got.mode);
  check(file + ': ' + want.rows.length + ' show(s)', rows.length === want.rows.length, String(rows.length));
  want.rows.forEach((w, i) => {
    const f = (rows[i] || {}).fields || {};
    const wrong = FIELDS.filter(k => k in w && (f[k] ? f[k].value : '') !== w[k])
      .map(k => k + '=' + JSON.stringify(f[k] ? f[k].value : undefined) + ' (want ' + JSON.stringify(w[k]) + ')');
    check(file + ' #' + (i + 1) + ': every field right', !wrong.length, wrong.join(', '));
    Object.keys(w.conf || {}).forEach(k => {
      check(file + ' #' + (i + 1) + ': ' + k + ' is ' + w.conf[k] + ' confidence',
            f[k] && f[k].confidence === w.conf[k], f[k] && f[k].confidence);
    });
    (w.notesHas || []).forEach(t => check(file + ' #' + (i + 1) + ': notes mention ' + t,
      f.notes && f.notes.value.indexOf(t) !== -1, f.notes && f.notes.value));
    Object.keys(w.noteHas || {}).forEach(k => check(file + ' #' + (i + 1) + ': the ' + k + ' note names ' + w.noteHas[k],
      f[k] && f[k].note.indexOf(w.noteHas[k]) !== -1, f[k] && f[k].note));
    /* Gate B: a number the reader picked from several is never presented as certain. */
    ['juryFee', 'boothFee', 'applyBy'].forEach(k => {
      if (f[k] && /more than one|several/.test(f[k].note)) {
        check(file + ' #' + (i + 1) + ': a ' + k + ' chosen from several is not high confidence', f[k].confidence !== 'high');
      }
    });
  });
});

// ---- the link the artist gave (B2) ------------------------------------------
const email = fs.readFileSync(path.join(DIR, 'organiser-email.txt'), 'utf8');
const withLink = I.readAny(email, { now, url: 'https://example.net/artwalk/apply' }).rows[0].fields;
check('the link the artist gave becomes the show\'s link', withLink.url.value === 'https://example.net/artwalk/apply' &&
      withLink.url.confidence === 'high', withLink.url.value);
check('a different link found in the text is kept in the notes', /Link in the text: https:\/\/example\.net\/artwalk\b/.test(withLink.notes.value),
      withLink.notes.value);
const listWithLink = I.readAny(fs.readFileSync(path.join(DIR, 'zapp-list.txt'), 'utf8'), { now, url: 'https://example.com/search' });
check('a list of shows does not stamp one page\'s link on every show',
      listWithLink.rows.every(r => r.fields.url.value === '') && /not added/.test(listWithLink.note), listWithLink.note);

// ---- the small readers --------------------------------------------------------
check('"Mayor" and "Marching" are not months', !I.isMonthWord('Mayor') && !I.isMonthWord('Marching') && I.isMonthWord('Sept.'));
check('"May 2027" is not read as May 20', I.dateMentions('Applications open in May 2027.').length === 0);
check('two dates months apart are not one show\'s range',
      I.dateMentions('October 1, 2026 and January 10, 2027').length === 2);
check('"April 17 & 18, 2027" is one range', (() => { const m = I.dateMentions('Sat & Sun, April 17 & 18, 2027');
  return m.length === 1 && m[0].end && m[0].end.d === 18 && m[0].start.y === 2027; })());
check('a year written once covers a range across two months', (() => {
  const m = I.dateMentions('February 27 – March 1, 2027')[0]; return m && m.start.y === 2027 && m.end.m === 3; })());
check('a place in a sentence keeps only the town', JSON.stringify(I.placesIn('held downtown in St. Augustine, Florida on May 1')) ===
      JSON.stringify([{ city: 'St. Augustine', state: 'FL' }]), JSON.stringify(I.placesIn('held downtown in St. Augustine, Florida on May 1')));
check('a two-letter word that is not a state is not a place', I.placesIn('Booth, OK so').length === 1 &&
      I.placesIn('Hello, XY there').length === 0);
check('"Festival of the Arts" keeps its tail', I.eventPhrase('Welcome to the Riverbend Festival of the Arts') === 'Riverbend Festival of the Arts',
      I.eventPhrase('Welcome to the Riverbend Festival of the Arts'));
check('one word is not a name', I.eventPhrase('Our fair is back!') === '');
const noYear = I.readAny('Willow Run Art Fair\nJune 5-6\nWillow Run, OH', { now }).rows[0].fields;
check('dates with no year are marked as a guess', noYear.startDate.confidence === 'low' && /Year/.test(noYear.startDate.note));
const twoFees = I.readAny('Pine Hill Art Show\nMay 1-2, 2027 · Pine Hill, VT\nBooth fee: $300 (10x10) or $550 (10x20)', { now }).rows[0].fields;
check('two prices on one booth line: the 10x10, marked low', twoFees.boothFee.value === '300' && twoFees.boothFee.confidence === 'low',
      JSON.stringify(twoFees.boothFee));
const noStd = I.readAny('Pine Hill Art Show\nMay 1-2, 2027 · Pine Hill, VT\nBooth fees: $300 small, $550 large', { now }).rows[0].fields;
check('several booth prices and no standard one: not found, and the note lists them',
      noStd.boothFee.value === '' && /\$300.*\$550|\$550.*\$300/.test(noStd.boothFee.note), JSON.stringify(noStd.boothFee));
const late = I.readAny('Pine Hill Art Show\nMay 1-2, 2027\nLate deadline: March 20, 2027', { now }).rows[0].fields;
check('a late-entry deadline is not the deadline', late.applyBy.value === '', late.applyBy.value);
const after = I.readAny('Pine Hill Art Show\nThe show runs May 1-2, 2027. Booth payment is due by May 10, 2027.', { now }).rows[0].fields;
check('a payment date is not read as a deadline', after.applyBy.value === '', after.applyBy.value);
check('nothing is invented from an empty paste', I.readAny('   \n  ').mode === 'none');

// ---- part 2: the Import modal ----------------------------------------------------
(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }
  const http = require('http');
  const up = await new Promise(res => http.get('http://127.0.0.1:8765/tracker/version.json', r => { r.resume(); res(r.statusCode === 200); })
    .on('error', () => res(false)));
  if (!chromium || !up) {
    check('browser part ran (needs the server on 8765)', false, !chromium ? 'no playwright' : 'server not up');
    return finish();
  }
  const EXECUTABLE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b = await chromium.launch(fs.existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {});
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const ROOT = 'http://127.0.0.1:8765/tracker/';
  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(400);

  /* The empty ledger offers the paste box as a way in. */
  check('the empty ledger offers "Paste a show\'s page"', await p.isVisible('#emptyPaste'));
  await p.click('#emptyPaste');
  await p.waitForTimeout(200);
  check('it opens the import on the paste box', await p.isVisible('#impPasteText') &&
        await p.evaluate(() => document.activeElement && document.activeElement.id === 'impPasteText'));
  const tab = await p.textContent('#impTabPaste');
  check('the paste tab is not just for one site', !/zapp/i.test(tab), tab);
  const ph = await p.getAttribute('#impPasteText', 'placeholder');
  check('the example text names no real show', !/coconut grove|miami/i.test(ph || ''), ph);

  await p.fill('#impPasteText', email);
  await p.fill('#impPasteLink', 'not a link');
  await p.click('#impNext');
  await p.waitForTimeout(200);
  check('a link that is not a web address is refused before reading', await p.isVisible('#impStep1') &&
        /http/.test(await p.textContent('#impParseNote')));
  await p.fill('#impPasteLink', 'https://example.net/artwalk/apply');
  await p.click('#impNext');
  await p.waitForTimeout(300);
  const review = await p.evaluate(() => ({
    step3: !document.querySelector('#impStep3').hidden,
    rows: document.querySelectorAll('#impReviewHost .rev-one').length,
    name: document.querySelector('#impReviewHost [data-field="name"]').value,
    booth: document.querySelector('#impReviewHost [data-field="boothFee"]').value,
    url: document.querySelector('#impReviewHost [data-field="url"]').value,
    saved: JSON.parse(localStorage.getItem('artShowTracker.db') || '{"shows":[]}').shows.length
  }));
  check('one show goes to review, read from the email', review.step3 && review.rows === 1 &&
        review.name === 'Sandpiper Bay Art Walk' && review.booth === '295', JSON.stringify(review));
  check('nothing is saved before Import', review.saved === 0, String(review.saved));
  check('the review carries the link the artist gave', review.url === 'https://example.net/artwalk/apply', review.url);
  await p.click('#impCommit');
  await p.waitForTimeout(500);
  const saved = await p.evaluate(async () => (await window.AST.Store.list()).map(s => ({ name: s.name, url: s.url, source: s.source,
    juryFee: s.juryFee, boothFee: s.boothFee, applyBy: s.applyBy })));
  check('Import saves the show, marked as pasted, with its link', saved.length === 1 && saved[0].source === 'paste' &&
        saved[0].url === 'https://example.net/artwalk/apply' && saved[0].juryFee === 25 && saved[0].applyBy === '2026-12-04',
        JSON.stringify(saved));

  /* B2: the edit pane opens the page in a new tab, and never fetches it. */
  await p.click('.show-row .r-dates');
  await p.waitForTimeout(300);
  const open = await p.evaluate(() => { const a = document.querySelector('#f_urlOpen');
    return a && { shown: !a.hidden, href: a.getAttribute('href'), target: a.target, rel: a.rel }; });
  check('the edit pane links to the show\'s page in a new tab', open && open.shown && open.href === 'https://example.net/artwalk/apply' &&
        open.target === '_blank' && /noopener/.test(open.rel), JSON.stringify(open));
  await p.fill('#f_url', 'nope');
  await p.waitForTimeout(100);
  check('a link that is not a web address offers nothing to open', await p.evaluate(() => document.querySelector('#f_urlOpen').hidden));

  /* A list from a results page still goes to review as several shows. */
  await p.keyboard.press('Escape');
  await p.evaluate(() => window.ASTImportUI.open());
  await p.fill('#impPasteText', fs_zapp);
  await p.click('#impNext');
  await p.waitForTimeout(300);
  const listRows = await p.$$eval('#impReviewHost tbody tr', r => r.length);
  check('a pasted list of shows still reads as several rows', listRows === 3, String(listRows));

  /* One show is a form, and the reason for a flagged value is written out:
     a phone shows no tooltips, and a price picked from several must be seen. */
  await p.click('#impBack');
  await p.fill('#impPasteText', fs.readFileSync(path.join(DIR, 'prospectus-fees.txt'), 'utf8'));
  await p.click('#impNext');
  await p.waitForTimeout(300);
  const why = await p.evaluate(() => {
    const el = document.querySelector('#impReviewHost [data-why="boothFee"]');
    const input = document.querySelector('#impReviewHost [data-field="boothFee"]');
    return el && { text: el.textContent, shown: el.getBoundingClientRect().height > 0,
      labelled: !!document.querySelector('label[for="' + input.id + '"]'), font: getComputedStyle(input).fontSize };
  });
  check('a booth price picked from several says why, in words on the page', why && why.shown &&
        /\$800/.test(why.text) && /10x10/.test(why.text), JSON.stringify(why));
  check('each field in the one-show form has a label, and phone-safe text size', why && why.labelled && why.font === '16px',
        JSON.stringify(why));
  const notFound = await p.textContent('#impReviewHost [data-why="url"]');
  check('a field the text did not give says "Not in the text"', /Not in the text/.test(notFound), notFound);
  await p.fill('#impReviewHost [data-field="boothFee"]', '450');
  await p.dispatchEvent('#impReviewHost [data-field="boothFee"]', 'change');
  await p.waitForTimeout(100);
  const typed = await p.textContent('#impReviewHost [data-why="boothFee"]');
  check('a value the artist types loses its warning', typed.trim() === '', typed);

  /* Nothing that looks like a show: say so, add nothing. */
  await p.click('#impBack');
  await p.fill('#impPasteText', 'Studio news\n\nNew prints are in the shop.');
  await p.click('#impNext');
  await p.waitForTimeout(200);
  check('text with no show in it says so and stays on the paste box', await p.isVisible('#impStep1') &&
        /looked like a show/.test(await p.textContent('#impParseNote')));

  /* ---- B3: a page shared to the installed app ------------------------------ */
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tracker', 'manifest.webmanifest'), 'utf8'));
  const st = manifest.share_target || {};
  check('the installed app offers itself as a share target (GET, to the ledger)',
        st.method === 'GET' && st.action === 'index.html' && st.params &&
        st.params.title === 'share_title' && st.params.text === 'share_text' && st.params.url === 'share_url', JSON.stringify(st));

  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(ROOT + 'index.html?share_title=' + encodeURIComponent('Harbor Days Art Fair') +
               '&share_text=' + encodeURIComponent('https://example.org/harbor-days') + '#x', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const shareA = await p.evaluate(() => ({
    open: !document.querySelector('#importModal').hidden,
    text: document.querySelector('#impPasteText').value,
    link: document.querySelector('#impPasteLink').value,
    note: document.querySelector('#impParseNote').textContent,
    address: location.search + location.hash,
    saved: JSON.parse(localStorage.getItem('artShowTracker.db') || '{"shows":[]}').shows.length
  }));
  check('a shared page opens the paste box with its title and link', shareA.open && shareA.text === 'Harbor Days Art Fair' &&
        shareA.link === 'https://example.org/harbor-days', JSON.stringify(shareA));
  check('it says plainly that only the title and link came, and how to get the text', /not its text/.test(shareA.note), shareA.note);
  check('the share is taken off the address, so a reload does not share it again', shareA.address === '#x', shareA.address);
  check('nothing is read or saved from a share until the artist asks', shareA.saved === 0, String(shareA.saved));

  const post = fs.readFileSync(path.join(DIR, 'social-post.txt'), 'utf8');
  await p.goto(ROOT + 'index.html?share_text=' + encodeURIComponent(post) + '&share_url=' + encodeURIComponent('javascript:alert(1)'),
               { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const shareB = await p.evaluate(() => ({ link: document.querySelector('#impPasteLink').value,
    note: document.querySelector('#impParseNote').textContent }));
  check('a shared link that is not a web address is dropped', shareB.link === '', shareB.link);
  check('shared text is offered for checking, not read on arrival', /Check the text/.test(shareB.note) &&
        await p.isVisible('#impStep1'), shareB.note);
  await p.click('#impNext');
  await p.waitForTimeout(300);
  check('and reads like a paste once asked', await p.evaluate(() =>
    document.querySelector('#impReviewHost [data-field="name"]').value === 'Harbor Days Art Fair'));

  check('no page errors along the way', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  finish();
})().catch(e => { console.error(e); process.exit(1); });


function finish() {
  console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
  if (fails.length) { fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
}
