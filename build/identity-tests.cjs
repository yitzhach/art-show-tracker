/* ==========================================================================
   Browser tests for "no default person" (docs/product-plan.md, A3).

   The app was built around one artist and used to show his name to every
   visitor. A new browser must show no name at all until the artist types
   their own, and what they type is what appears.

   Usage:
     python3 -m http.server 8765     # from the repo root
     node build/identity-tests.cjs
   ========================================================================== */
const { chromium } = require('playwright');
const fs = require('fs');

const EXECUTABLE = process.env.PW_CHROMIUM ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT = 'http://127.0.0.1:8765/tracker/';
const PAGES = ['index.html', 'browse.html', 'calendar.html', 'expenses.html', 'contacts.html', 'jury.html', 'map.html', 'embed.html'];
let pass = 0; const fails = [];
const check = (n, ok, d) => { if (ok) { pass++; console.log('  PASS  ' + n); }
  else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

(async () => {
  const b = await chromium.launch(fs.existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {});
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));

  // ---- a brand-new browser sees no person's name anywhere -------------------
  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  await p.evaluate(() => localStorage.clear());
  for (const page of PAGES) {
    await p.goto(ROOT + page, { waitUntil: 'load' });
    await p.waitForTimeout(250);
    const seen = await p.evaluate(() => ({ title: document.title, text: document.body.innerText,
      attrs: [...document.querySelectorAll('input,textarea')].map(e => (e.value || '') + ' ' + (e.placeholder || '')).join(' ') }));
    check(page + ': no default person in the title, the text or a field',
          !/isaac|anderson/i.test(seen.title + ' ' + seen.text + ' ' + seen.attrs), seen.title);
  }
  const manifest = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'tracker', 'manifest.webmanifest'), 'utf8'));
  check('the installed app is not named after a person', !/isaac|anderson/i.test(manifest.name + manifest.short_name), manifest.name);

  await p.goto(ROOT + 'index.html', { waitUntil: 'load' });
  await p.waitForTimeout(300);
  const fresh = await p.evaluate(() => ({ title: document.title, sub: document.querySelector('#brandSub').textContent }));
  check('with no name given the ledger says "Your season"', fresh.sub === 'Your season' && fresh.title === 'Show Ledger', JSON.stringify(fresh));

  // ---- the share text and card, with no name --------------------------------
  const share = await p.evaluate(() => {
    const S = window.ASTShare;
    const rows = [window.AST.makeShow({ id: 'a', name: 'Test Fair', city: 'Denver', state: 'CO', startDate: '2027-07-02', endDate: '2027-07-04', status: 'accepted' })];
    const cap = S.textBlock(rows, { style: 'caption' });
    const mail = S.textBlock(rows, { style: 'email' });
    const named = S.textBlock(rows, { style: 'email', artist: 'Dana Glass' });
    const frame = S.embedSnippet(rows, { mode: 'iframe' });
    return { cap, mail, named, frame, file: S.fileName({}) };
  });
  check('a caption with no name starts with the season, not a blank or a dash',
        !/^\s*[—·-]/.test(share.cap) && !/undefined|null/.test(share.cap) && /show season/i.test(share.cap.split('\n')[0]), share.cap.split('\n')[0]);
  check('an email block with no name does the same', !/^\s*[—·-]/.test(share.mail) && /show schedule/i.test(share.mail.split('\n')[0]),
        share.mail.split('\n')[0]);
  check('a name the artist gave is the one used', /^Dana Glass — /.test(share.named), share.named.split('\n')[0]);
  check('the embed points at this app, not at one artist\'s website',
        /127\.0\.0\.1:8765\/tracker\/embed\.html/.test(share.frame) && !/isaacanderson/i.test(share.frame), share.frame.slice(0, 160));
  check('the card file is named without a person', share.file.indexOf('shows-') === 0, share.file);

  // ---- typing a name puts it in the header ----------------------------------
  await p.click('#btnShare');
  await p.waitForTimeout(300);
  const opened = await p.evaluate(() => ({ artist: document.querySelector('#shrArtist').value, link: document.querySelector('#shrLink').value }));
  check('the share panel opens with the name and link empty', opened.artist === '' && opened.link === '', JSON.stringify(opened));
  await p.fill('#shrArtist', 'Dana Glass');
  await p.dispatchEvent('#shrArtist', 'change');
  await p.waitForTimeout(200);
  const named = await p.evaluate(() => ({ title: document.title, sub: document.querySelector('#brandSub').textContent }));
  check('the name typed there appears in the header and the title',
        /^Dana Glass/.test(named.sub) && named.title === 'Show Ledger — Dana Glass', JSON.stringify(named));
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(300);
  const kept = await p.evaluate(() => document.querySelector('#brandSub').textContent);
  check('and is still there after a reload', /^Dana Glass/.test(kept), kept);

  // ---- Account & sync tells a newcomer the truth (A4) ------------------------
  await p.evaluate(() => { localStorage.clear(); });
  await p.goto(ROOT + 'index.html#account', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const acct = await p.evaluate(() => {
    const d = document.querySelector('#settingsDrawer');
    const vis = el => !!el && el.checkVisibility();   // sees through a closed <details>
    return { open: !d.hidden, where: document.querySelector('#whereSavedText').textContent,
      backup: document.querySelector('#whereSavedBackup').textContent,
      advancedOpen: document.querySelector('#supabaseAdvanced').open,
      keyFieldVisible: vis(document.querySelector('#f_supaKey')), urlFieldVisible: vis(document.querySelector('#f_supaUrl')),
      backupBtn: vis(document.querySelector('#btnBackupHere')), focus: document.activeElement && document.activeElement.id };
  });
  check('Account & sync opens', acct.open === true);
  check('it says the season is saved in this browser and not on a server',
        /In this browser/.test(acct.where) && /not on a server/.test(acct.where), acct.where);
  check('it says there has never been a backup', /Never backed up/.test(acct.backup), acct.backup);
  check('Back up is right there, and is what the drawer lands on', acct.backupBtn && acct.focus === 'btnBackupHere', acct.focus);
  check('a newcomer is not asked for a database address or key',
        acct.advancedOpen === false && !acct.keyFieldVisible && !acct.urlFieldVisible, JSON.stringify(acct));

  await p.evaluate(() => localStorage.setItem('artShowTracker.supabase', JSON.stringify({ url: 'https://x.supabase.co', anonKey: 'k' })));
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(500);
  const using = await p.evaluate(() => ({ open: document.querySelector('#supabaseAdvanced').open,
    url: document.querySelector('#f_supaUrl').value, visible: document.querySelector('#f_supaUrl').checkVisibility(),
    where: document.querySelector('#whereSavedText').textContent }));
  check('someone already using Supabase still finds their settings, opened', using.open && using.visible && /x\.supabase\.co/.test(using.url),
        JSON.stringify(using));
  check('signed in to nothing, it still does not claim an account holds anything', /In this browser/.test(using.where) ||
        /are in your account/.test(using.where), using.where);
  await p.evaluate(() => localStorage.clear());

  check('no page errors along the way', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
  if (fails.length) { fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
})();
