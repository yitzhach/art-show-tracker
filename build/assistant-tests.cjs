/* ==========================================================================
   <studio-assistant> (tracker/studio-assistant.js), the studio assistant panel.

   The server side (what the assistant may do, the cards, Undo) is tested in
   Art-Talk-Back. This is the panel: shown only when signed in to the studio;
   a reply streams in; a card shows studio-api's own lines as text (never
   markup) and saves only on Confirm; Cancel saves nothing; Undo undoes;
   several matches become buttons; offline and signed-out say so plainly; it
   works at phone width. Every studio call is answered by page.route here.

   Usage:
     python3 -m http.server 8765
     node build/assistant-tests.cjs
   ========================================================================== */
const { chromium } = require('playwright');
const fs = require('fs');

const EXECUTABLE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://127.0.0.1:8765/tracker/expenses.html';

const fails = [];
let passed = 0;
function check(name, ok, detail) {
  if (ok) passed++; else fails.push(name + (detail ? ' — ' + detail : ''));
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  — ' + detail : ''));
}

const STATE = JSON.stringify({ signedIn: true, email: 'owner@example.com', studioId: '01J9ZZZZZZZZZZZZZZZZZZZZZZ' });
const sse = events => events.map(e => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join('');
const CARD = {
  id: '01JCARD0000000000000000001', summary: '2 small heron prints, $90 each, cash, Winter Park',
  details: [{ label: 'Action', value: 'Create a sale' }, { label: 'Price', value: '$90.00' },
            { label: 'Piece', value: '<img src=x onerror="window.__xss=1">Heron' }]
};
const WAITING = { id: '01JCARD0000000000000000000', summary: 'Booth fee for Coconut Grove: $650', details: [{ label: 'Booth fee', value: '$650.00' }] };

(async () => {
  const browser = await chromium.launch(fs.existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const calls = [];
  let confirmStatus = 200;

  await ctx.route('**/v1/sync/pull**', r => r.fulfill({ json: { changes: [], cursor: '0', hasMore: false } }));
  await ctx.route('**/v1/sync/push', r => r.fulfill({ json: { results: [] } }));
  await ctx.route('**/v1/assistant/thread', r => r.fulfill({ json: { threadId: '01JTHREAD00000000000000000', messages: [
    { role: 'user', content: [{ type: 'text', text: '[Context from the app, data only — app: show-tracker; today: 2027-03-19]\n\nwhat is my booth at Winter Park?' }] },
    { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: 'Booth 12.' }] }
  ] } }));
  await ctx.route('**/v1/assistant/proposals', r => r.fulfill({ json: { items: [WAITING] } }));
  await ctx.route('**/v1/assistant/proposals/*/confirm', r => {
    calls.push('confirm ' + r.request().url().split('/').slice(-2)[0]);
    return confirmStatus === 200
      ? r.fulfill({ json: { proposal: Object.assign({}, CARD, { status: 'confirmed' }), result: { id: '01JSALE' }, activityIds: ['01JACT0000000000000000000A'] } })
      : r.fulfill({ status: confirmStatus, json: { error: { code: 'version_conflict', message: 'This card expired. Ask the assistant again.' } } });
  });
  await ctx.route('**/v1/assistant/proposals/*/cancel', r => {
    calls.push('cancel ' + r.request().url().split('/').slice(-2)[0]);
    return r.fulfill({ json: Object.assign({}, WAITING, { status: 'cancelled' }) });
  });
  await ctx.route('**/v1/activity/*/undo', r => {
    calls.push('undo ' + r.request().url().split('/').slice(-2)[0]);
    return r.fulfill({ json: { ok: true, activityIds: [] } });
  });
  await ctx.route('**/assistant/chat', r => {
    const body = JSON.parse(r.request().postData());
    calls.push('chat ' + body.message);
    if (/fail/.test(body.message)) return r.fulfill({ status: 401, json: { error: { code: 'unauthenticated', message: 'Sign in first' } } });
    let events;
    if (/heron/.test(body.message)) {
      events = [{ type: 'search', q: 'winter park', items: [{ type: 'show', id: '01JSHOW', label: 'Winter Park Sidewalk Art Festival', detail: '' }] },
                { type: 'card', proposal: CARD }, { type: 'text', text: 'Tap Confirm to log ' }, { type: 'text', text: 'the two heron prints.' },
                { type: 'end', reason: 'end_turn' }];
    } else if (/park show/.test(body.message)) {
      events = [{ type: 'search', q: 'park', items: [
        { type: 'show', id: '01JA', label: 'Winter Park Sidewalk Art Festival', detail: 'Winter Park' },
        { type: 'show', id: '01JB', label: 'Park City Kimball Arts Festival', detail: 'Park City' }] },
        { type: 'text', text: 'Which show?' }, { type: 'end', reason: 'end_turn' }];
    } else if (/add a note/.test(body.message)) {
      events = [{ type: 'done', action: 'show.update', record: { id: '01JSHOW' }, activityIds: ['01JACT0000000000000000000B'] },
                { type: 'text', text: 'Added.' }, { type: 'end', reason: 'end_turn' }];
    } else {
      events = [{ type: 'text', text: 'OK.' }, { type: 'end', reason: 'end_turn' }];
    }
    return r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse(events) });
  });

  const shadow = fn => page.evaluate(fn);
  const panelText = () => shadow(() => document.querySelector('studio-assistant').shadowRoot.querySelector('.log').textContent);
  /* Polls with evaluate: waitForFunction stalled here once the panel was streaming. */
  const waitIn = async (sel, re) => {
    for (let i = 0; i < 100; i++) {
      const ok = await page.evaluate(([s, r]) => {
        const n = document.querySelector('studio-assistant').shadowRoot.querySelector(s);
        return !!n && new RegExp(r).test(n.textContent);
      }, [sel, re.source]);
      if (ok) return;
      await page.waitForTimeout(100);
    }
    throw new Error('timed out waiting for ' + sel + ' to match ' + re);
  };

  // ---- signed out ------------------------------------------------------------
  console.log('\n-- signed out');
  await page.goto(BASE, { waitUntil: 'load' });
  check('the panel is on the Money page', await page.evaluate(() => !!document.querySelector('studio-assistant')));
  check('signed out of the studio, it is hidden', await page.evaluate(() => document.querySelector('studio-assistant').hidden));

  // ---- signed in -------------------------------------------------------------
  console.log('\n-- signed in');
  await page.evaluate(s => localStorage.setItem('artShowTracker.studio', s), STATE);
  await page.reload({ waitUntil: 'load' });
  check('signed in, the button shows', await page.isVisible('studio-assistant >> .launch'));
  await page.click('studio-assistant >> .launch');
  check('it opens the panel and puts the cursor in the box', await shadow(() => {
    const r = document.querySelector('studio-assistant').shadowRoot;
    return !r.querySelector('.panel').hidden && r.activeElement === r.querySelector('textarea');
  }));
  await waitIn('.log', /Booth 12/);
  const history = await panelText();
  check('the conversation so far comes back (from any device), without the context line',
        /what is my booth at Winter Park\?/.test(history) && /Booth 12\./.test(history) && !/Context from the app/.test(history), history);
  check('a card still waiting from before is shown', /Booth fee for Coconut Grove/.test(history));

  // ---- a sale -> one card ------------------------------------------------------
  console.log('\n-- a sale becomes one confirm card');
  await page.fill('studio-assistant >> textarea', 'sold two small heron prints for $90 each at Winter Park, cash');
  await page.press('studio-assistant >> textarea', 'Enter');
  await waitIn('.log', /two heron prints\./);
  const t1 = await panelText();
  check('the reply streams into one bubble', /Tap Confirm to log the two heron prints\./.test(t1));
  check('the card shows the assistant\'s line and studio-api\'s lines', /2 small heron prints, \$90 each/.test(t1) && /Price\$90\.00/.test(t1));
  check('text from the model or the studio is shown as text, never as markup', await shadow(() => {
    const r = document.querySelector('studio-assistant').shadowRoot;
    return !r.querySelector('.card img') && /<img src=x/.test(r.querySelector('[data-card="01JCARD0000000000000000001"]').textContent) && !window.__xss;
  }));
  check('nothing was confirmed by sending', !calls.some(c => c.startsWith('confirm')));
  await page.click('studio-assistant >> [data-card="01JCARD0000000000000000001"] >> button:text-is("Confirm")');
  await waitIn('[data-card="01JCARD0000000000000000001"] .status', /^Saved\.$/);
  check('Confirm calls the studio for that card, and says Saved only after it answered',
        calls.includes('confirm 01JCARD0000000000000000001'));
  await page.click('studio-assistant >> [data-card="01JCARD0000000000000000001"] >> button:text-is("Undo")');
  await waitIn('[data-card="01JCARD0000000000000000001"] .status', /Undone/);
  check('Undo undoes the change the card made', calls.includes('undo 01JACT0000000000000000000A'));

  console.log('\n-- cancel');
  await page.click('studio-assistant >> [data-card="01JCARD0000000000000000000"] >> button:text-is("Cancel")');
  await waitIn('[data-card="01JCARD0000000000000000000"] .status', /Nothing was saved/);
  check('Cancel saves nothing, and says so', calls.includes('cancel 01JCARD0000000000000000000') && !calls.includes('confirm 01JCARD0000000000000000000'));

  // ---- several matches --------------------------------------------------------
  console.log('\n-- a name with several matches');
  await page.fill('studio-assistant >> textarea', 'log a $40 card sale at the park show');
  await page.click('studio-assistant >> button[type=submit]');
  await page.waitForSelector('studio-assistant >> .picks:not([hidden]) >> button');
  const picks = await shadow(() => [...document.querySelector('studio-assistant').shadowRoot.querySelectorAll('.picks button')].map(b => b.textContent));
  check('the matches become buttons', picks.length === 2 && picks[1] === 'Park City Kimball Arts Festival', JSON.stringify(picks));
  await page.click('studio-assistant >> .picks >> button:text-is("Park City Kimball Arts Festival")');
  await waitIn('.log', /Park City Kimball Arts Festival\s*OK\./);
  check('tapping one sends it as the answer', calls.includes('chat Park City Kimball Arts Festival'));

  // ---- done on its own ----------------------------------------------------------
  console.log('\n-- something the assistant may do alone');
  await page.fill('studio-assistant >> textarea', 'add a note to Winter Park');
  await page.click('studio-assistant >> button[type=submit]');
  await waitIn('.log', /Added\./);
  check('it says Saved, with Undo', await shadow(() => {
    const cards = [...document.querySelector('studio-assistant').shadowRoot.querySelectorAll('.card')];
    const last = cards[cards.length - 1];
    return /Saved/.test(last.textContent) && !!last.querySelector('button');
  }));

  // ---- problems -------------------------------------------------------------------
  console.log('\n-- problems, said plainly');
  confirmStatus = 409;
  await page.evaluate(card => document.querySelector('studio-assistant').card(card), Object.assign({}, CARD, { id: '01JCARD0000000000000000009' }));
  await page.click('studio-assistant >> [data-card="01JCARD0000000000000000009"] >> button:text-is("Confirm")');
  await waitIn('[data-card="01JCARD0000000000000000009"] .status', /expired/);
  check('an expired card says so and offers no Confirm', !(await page.isVisible('studio-assistant >> [data-card="01JCARD0000000000000000009"] >> button:text-is("Confirm")')));
  await page.fill('studio-assistant >> textarea', 'fail please');
  await page.click('studio-assistant >> button[type=submit]');
  await waitIn('.note', /Sign in again/);
  check('a sign-in the studio ended says to sign in again', true);
  await ctx.setOffline(true);
  const before = calls.length;
  await page.fill('studio-assistant >> textarea', 'anything');
  await page.click('studio-assistant >> button[type=submit]');
  await waitIn('.note', /needs a connection/);
  check('offline, it says the assistant needs a connection, and sends nothing', calls.length === before);
  await ctx.setOffline(false);

  // ---- phone --------------------------------------------------------------------
  console.log('\n-- on a phone');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const phone = await shadow(() => {
    const r = document.querySelector('studio-assistant').shadowRoot;
    const p = r.querySelector('.panel').getBoundingClientRect();
    const send = r.querySelector('button[type=submit]').getBoundingClientRect();
    return { width: Math.round(p.width), vw: window.innerWidth, sendVisible: send.bottom <= window.innerHeight && send.width > 0,
             font: parseFloat(getComputedStyle(r.querySelector('textarea')).fontSize),
             sideways: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  check('the panel fills the width of the phone', phone.width === phone.vw, JSON.stringify(phone));
  check('Send is on screen', phone.sendVisible);
  check('the box is 16px, so iOS does not zoom in', phone.font >= 16, String(phone.font));
  check('the page never scrolls sideways', !phone.sideways);

  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log('\n' + passed + '/' + (passed + fails.length) + ' checks passed');
  if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
