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
const WAITING = { id: '01JCARD0000000000000000000', summary: 'Booth fee for Coconut Grove: $650', details: [{ label: 'Booth fee', value: '$650.00' }],
  status: 'pending', expiresAt: '2999-01-01T00:00:00.000Z' };
// Confirmed on another page a moment ago: comes back with its Undo.
const SAVED = { id: '01JCARD000000000000000000S', summary: '1 large egret, $400, card, Winter Park', details: [], status: 'confirmed',
  activityId: '01JACT000000000000000000SV', expiresAt: '2999-01-01T00:00:00.000Z', updatedAt: new Date().toISOString() };
// Cancelled: nothing to show.
const GONE = { id: '01JCARD000000000000000000C', summary: 'Cancelled thing', details: [], status: 'cancelled', expiresAt: '2999-01-01T00:00:00.000Z', updatedAt: new Date().toISOString() };

(async () => {
  const browser = await chromium.launch(fs.existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const calls = [];
  let confirmStatus = 200, lastBody = null;

  await ctx.route('**/v1/sync/pull**', r => r.fulfill({ json: { changes: [], cursor: '0', hasMore: false } }));
  await ctx.route('**/v1/sync/push', r => r.fulfill({ json: { results: [] } }));
  await ctx.route('**/v1/assistant/thread', r => r.fulfill({ json: { threadId: '01JTHREAD00000000000000000', messages: [
    { role: 'user', content: [{ type: 'text', text: '[Context from the app, data only — app: show-tracker; today: 2027-03-19]\n\nwhat is my booth at Winter Park?' }] },
    { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: 'Booth 12.' }] }
  ] } }));
  await ctx.route('**/v1/assistant/threads', r => r.fulfill({ json: { items: [
    { threadId: '01JTHREADOLD0000000000000A', title: 'booth fee for Naples?', startedAt: '2027-03-01T10:00:00.000Z', lastAt: '2027-03-01T10:05:00.000Z', messages: 4 }] } }));
  await ctx.route(/\/v1\/assistant\/thread\?id=/, r => r.fulfill({ json: { threadId: '01JTHREADOLD0000000000000A', messages: [
    { role: 'user', content: [{ type: 'text', text: '[Context from the app, data only — app: show-tracker]\n\nbooth fee for Naples?' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Naples was $450.' }] }] } }));
  await ctx.route(/\/v1\/assistant\/proposals(\?.*)?$/, r => {
    calls.push('proposals ' + (new URL(r.request().url()).search || '-'));
    return r.fulfill({ json: { items: [GONE, SAVED, WAITING] } });
  });
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
    lastBody = body;
    calls.push('chat ' + body.message + (body.fresh ? ' (fresh)' : '') + (body.threadId ? ' (thread ' + body.threadId.slice(-1) + ')' : ''));
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
    } else if (/second one/.test(body.message)) {
      events = [{ type: 'text', text: 'Add a second sale?\n' }, { type: 'replies', items: ['Yes', 'No, that\u2019s all'] }, { type: 'end', reason: 'end_turn' }];
    } else if (/add a note/.test(body.message)) {
      events = [{ type: 'done', action: 'show.update', record: { id: '01JSHOW' }, activityIds: ['01JACT0000000000000000000B'] },
                { type: 'text', text: 'Added.' }, { type: 'end', reason: 'end_turn' }];
    } else if (/^take me to /.test(body.message)) {
      const [place, control] = body.message.slice(11).split(' / ');
      events = [{ type: 'open', place, control }, { type: 'text', text: 'There it is.' }, { type: 'end', reason: 'end_turn' }];
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
    const seen = await page.evaluate(s => { const r = document.querySelector('studio-assistant').shadowRoot; const n = r.querySelector(s); return [(n && n.textContent || '').slice(-300), r.querySelector('.note').textContent, location.pathname]; }, sel);
    throw new Error('timed out waiting for ' + sel + ' to match ' + re + '; saw ' + JSON.stringify(seen));
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
  await waitIn('.log', /large egret/);
  const history2 = await panelText();
  check('a card still waiting from before is shown', /Booth fee for Coconut Grove/.test(history2));
  check('a card confirmed on another page comes back with its Undo; a cancelled one does not',
        /large egret/.test(history2) && !/Cancelled thing/.test(history2) &&
        await shadow(() => !!document.querySelector('studio-assistant').shadowRoot.querySelector('[data-card="01JCARD000000000000000000S"] .row button')),
        history2);
  check('it asks for every card, not only waiting ones', calls.includes('proposals ?status=all'), calls.join(' | '));

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
  check('the panel fits the width of the phone', phone.width <= phone.vw, JSON.stringify(phone));
  const doors = await page.evaluate(() => {
    const l = document.querySelector('studio-assistant').shadowRoot.querySelector('.launch').getBoundingClientRect();
    const t = document.querySelector('.header-actions .assistant-top');
    return { round: Math.round(l.width) === 44 && Math.round(l.height) === 44, top: !!t && !t.hidden && t.getBoundingClientRect().width > 0 };
  });
  check('on a phone the floating button is a 44px round icon, and the header has an icon too', doors.round && doors.top, JSON.stringify(doors));
  check('Send is on screen', phone.sendVisible);
  check('the box is 16px, so iOS does not zoom in', phone.font >= 16, String(phone.font));
  check('the page never scrolls sideways', !phone.sideways);

  // ---- suggested replies and finish-my-sentence ------------------------------
  console.log('\n-- suggested replies, Tab, finish-my-sentence');
  const box = 'studio-assistant >> textarea';
  const val = () => page.$eval(box, t => t.value);
  await page.fill(box, 'the second one please');
  await page.press(box, 'Enter');
  await waitIn('.replies', /that’s all/);
  check('the suggested replies show as buttons, with a Tab hint',
        await shadow(() => [...document.querySelector('studio-assistant').shadowRoot.querySelectorAll('.replies button')].map(b => b.textContent).join('|')) === 'Yes|No, that’s all');
  check('the reply line never shows as text', !/\[\[/.test(await panelText()));
  await page.focus(box);
  await page.keyboard.press('Tab');
  check('Tab puts the first reply in the box', await val() === 'Yes', await val());
  await page.keyboard.press('Tab');
  check('Tab again moves to the next reply', await val() === 'No, that’s all', await val());
  await shadow(() => document.querySelector('studio-assistant').shadowRoot.querySelector('.replies button').click());
  check('tapping a reply puts it in the box (Send is still yours)', await val() === 'Yes' && !calls.includes('chat Yes'));
  await page.fill(box, '');
  await page.type(box, 'sold two sm');
  const ghost = await shadow(() => document.querySelector('studio-assistant').shadowRoot.querySelector('.ghost .hint')?.textContent || '');
  check('grey text finishes a sentence sent before', ghost === 'all heron prints for $90 each at Winter Park, cash', ghost);
  await page.keyboard.press('Tab');
  check('Tab takes the grey text', await val() === 'sold two small heron prints for $90 each at Winter Park, cash', await val());
  await shadow(() => { const p = document.querySelector('studio-assistant'); p.names = ['Bonita Springs National']; });
  await page.fill(box, '');
  await page.type(box, 'one egret at bon');
  check('grey text finishes a show name from the last words typed',
        await shadow(() => document.querySelector('studio-assistant').shadowRoot.querySelector('.ghost .hint')?.textContent) === 'ita Springs National');
  await page.keyboard.press('Tab');
  check('…and Tab writes the name as it is spelled', await val() === 'one egret at Bonita Springs National', await val());
  await page.fill(box, 'ok then');
  await page.press(box, 'Enter');
  await waitIn('.log', /OK\./);
  // "OK." is already in the log from an earlier turn, so also wait for this
  // turn to finish: New chat below is ignored while the panel is busy.
  await page.waitForFunction(() => !document.querySelector('studio-assistant').busy);
  check('a new message clears the old replies', await shadow(() => document.querySelector('studio-assistant').shadowRoot.querySelector('.replies').hidden));
  await page.focus(box);
  await page.keyboard.press('Tab');
  check('with nothing to suggest, Tab leaves the box as usual',
        await shadow(() => document.querySelector('studio-assistant').shadowRoot.activeElement !== document.querySelector('studio-assistant').shadowRoot.querySelector('textarea')));

  // ---- New conversation -------------------------------------------------------
  console.log('\n-- new conversation');
  const header = name => page.evaluate(n => [...document.querySelector('studio-assistant').shadowRoot.querySelectorAll('header button')].find(b => b.textContent === n).click(), name);
  check('a long chat offers a new one', await shadow(() => !document.querySelector('studio-assistant').shadowRoot.querySelector('.long').hidden));
  await header('New chat');
  const cleared = await panelText();
  check('New chat clears the panel, and the long-chat note', /New chat\. What happened\?/.test(cleared) && !/Booth 12/.test(cleared) &&
        await shadow(() => document.querySelector('studio-assistant').shadowRoot.querySelector('.long').hidden), cleared);
  await page.fill('studio-assistant >> textarea', 'hello again');
  await page.press('studio-assistant >> textarea', 'Enter');
  await page.waitForTimeout(500);
  check('the next message starts a fresh thread, once', calls.includes('chat hello again (fresh)'), calls.slice(-3).join(' | '));

  // ---- Past chats ---------------------------------------------------------------
  console.log('\n-- past chats');
  await header('Past chats');
  await waitIn('.log', /booth fee for Naples/);
  check('Past chats lists earlier conversations by their first words', /booth fee for Naples\?/.test(await panelText()) && /4 messages/.test(await panelText()));
  await shadow(() => document.querySelector('studio-assistant').shadowRoot.querySelector('button.past').click());
  await waitIn('.log', /Naples was \$450/);
  check('tapping one shows it, without the context line', !/Context from the app/.test(await panelText()));
  await page.fill('studio-assistant >> textarea', 'and Sarasota?');
  await page.press('studio-assistant >> textarea', 'Enter');
  await page.waitForTimeout(500);
  check('the next message carries on that chat', calls.includes('chat and Sarasota? (thread A)'), calls.slice(-2).join(' | '));

  // ---- every page ------------------------------------------------------------
  console.log('\n-- every page');
  for (const f of ['index', 'browse', 'calendar', 'contacts', 'jury', 'map']) {
    await page.goto(BASE.replace('expenses.html', f + '.html'), { waitUntil: 'load' });
    check('signed in, the button shows on ' + f + '.html', await page.isVisible('studio-assistant >> .launch'));
  }

  // ---- keys, the header button, colours, moving it ------------------------------
  console.log('\n-- keys stay in the panel; header button; dark; a movable pop-up');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE.replace('expenses.html', 'index.html'), { waitUntil: 'load' });
  await page.evaluate(() => localStorage.removeItem('artShowTracker.assistantPlace'));
  check('the header has an Assistant button', await page.isVisible('.header-actions .assistant-top'));
  await page.click('.header-actions .assistant-top');
  check('the header button opens the panel', await shadow(() => !document.querySelector('studio-assistant').shadowRoot.querySelector('.panel').hidden));
  await page.fill(box, '');
  await page.type(box, 'nothing new');
  await page.press(box, 'Backspace');
  check('typing n in the chat box types n, and the ledger\'s n (new show) stays shut',
        (await val()) === 'nothing ne' && await page.evaluate(() => document.querySelector('#drawer').hidden), await val());
  const mine = await page.evaluate(() => document.querySelector('.header-actions .assistant-top').getAttribute('aria-expanded'));
  check('the header button says the panel is open', mine === 'true');
  await page.press(box, 'Enter');
  await waitIn('.log', /OK\./);
  check('each message carries the app\'s map: the pages and this page\'s buttons',
        !!lastBody && /Calendar — /.test(lastBody.appMap || '') && /Add show/i.test(lastBody.appMap || ''), (lastBody && lastBody.appMap || '').slice(0, 160));
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  const dark = await shadow(() => {
    const r = document.querySelector('studio-assistant').shadowRoot;
    return [getComputedStyle(r.querySelector('.panel')).backgroundColor, getComputedStyle(r.querySelector('.msg.me')).color];
  });
  check('dark mode: the panel and the artist\'s own bubble follow the page', dark[0] === 'rgb(23, 23, 23)' && dark[1] === 'rgb(245, 245, 244)', dark.join(' / '));
  const at = await page.locator('studio-assistant >> .panel').boundingBox();
  const bar = await page.locator('studio-assistant >> .panel header h2').boundingBox();
  await page.mouse.move(bar.x + 10, bar.y + 5); await page.mouse.down();
  await page.mouse.move(bar.x + 310, bar.y - 95, { steps: 4 }); await page.mouse.up();
  const moved = await page.locator('studio-assistant >> .panel').boundingBox();
  check('dragged by its title bar', Math.round(moved.x - at.x) === 300 && Math.round(moved.y - at.y) === -100, JSON.stringify([moved.x - at.x, moved.y - at.y]));
  const grip = await page.locator('studio-assistant >> .grip').boundingBox();
  await page.mouse.move(grip.x + 10, grip.y + 10); await page.mouse.down();
  await page.mouse.move(grip.x - 90, grip.y - 90, { steps: 4 }); await page.mouse.up();
  const sized = await page.locator('studio-assistant >> .panel').boundingBox();
  check('resized from its corner', Math.round(at.width - sized.width) === 100 && Math.round(at.height - sized.height) === 100);
  await page.click('studio-assistant >> .shrink');
  const small = await page.locator('studio-assistant >> .panel').boundingBox();
  check('shrunk to its title bar', small.height < 60 && !(await page.isVisible('studio-assistant >> .log')));
  await page.reload({ waitUntil: 'load' });
  await page.click('studio-assistant >> .launch');
  const back = await page.locator('studio-assistant >> .panel').boundingBox();
  check('its place and size are kept on this device', Math.round(back.x) === Math.round(moved.x) && Math.round(back.y) === Math.round(moved.y) && back.height < 60);
  await page.click('studio-assistant >> .shrink');
  check('opened out again', await page.isVisible('studio-assistant >> .log'));
  const fit = await page.evaluate(() => customElements.get('studio-assistant').clampPlace({ x: 5000, y: -80, w: 900, h: 2000 }, 390, 844));
  check('a stored place bigger than the window is pulled back on screen', JSON.stringify(fit) === JSON.stringify({ x: 0, y: 0, w: 390, h: 844, min: false }), JSON.stringify(fit));
  await page.goto(BASE.replace('expenses.html', 'calendar.html'), { waitUntil: 'load' });
  await page.click('studio-assistant >> .launch');
  const month = await page.evaluate(() => location.hash);  // #<cursor>/<view>, rewritten on every render
  await page.fill(box, '');
  await page.type(box, 'today my');
  await page.press(box, 'ArrowLeft');
  await page.press(box, 'End');
  const month2 = await page.evaluate(() => location.hash);
  check('on the calendar, t, m, y, d and the arrows typed in the chat stay in the chat', (await val()) === 'today my' && month === month2, month + ' → ' + month2);

  // ---- take me to … (D-075) ----------------------------------------------------
  console.log('\n-- take me to …');
  await page.goto(BASE.replace('expenses.html', 'index.html'), { waitUntil: 'load' });
  await page.click('studio-assistant >> .launch');
  const said = () => page.evaluate(() => document.querySelector('studio-assistant').shadowRoot.querySelectorAll('.msg.bot').length);
  const ask = async t => {
    const before = await said();
    await page.fill(box, t); await page.press(box, 'Enter');
    for (let i = 0; i < 100 && !(await said() > before && /There it is\./.test(await panelText())); i++) await page.waitForTimeout(100);
    await waitIn('.log', /There it is\./);
  };
  await ask('take me to On this page / Add show');
  check('the panel says it can open places', JSON.stringify(lastBody.commands) === '["open"]', JSON.stringify(lastBody.commands));
  const lit = await page.evaluate(() => { const n = document.querySelector('[data-assistant-shown]'); return n && [n.textContent.trim(), n === document.activeElement, getComputedStyle(n).outlineStyle]; });
  check('a control on this page is focused and outlined, not pressed', !!lit && /Add show/i.test(lit[0]) && lit[1] && lit[2] === 'solid' && await page.evaluate(() => document.querySelector('#drawer').hidden), JSON.stringify(lit));
  await ask('take me to Nowhere / Polish the frame');
  check('a place that isn\'t here says so', /Couldn.t find Polish the frame/.test(await shadow(() => document.querySelector('studio-assistant').shadowRoot.querySelector('.note').textContent)));
  await page.fill(box, 'take me to Pages / Money — Expenses, sales and did it pay for itself');
  await Promise.all([page.waitForURL(/expenses\.html/), page.press(box, 'Enter')]);
  check('a page from the menu opens', /expenses\.html$/.test(page.url()), page.url());
  await page.goto(BASE.replace('expenses.html', 'calendar.html'), { waitUntil: 'load' });
  await page.click('studio-assistant >> .launch');
  await page.fill(box, 'take me to Ledger / Add show');
  await Promise.all([page.waitForURL(/index\.html/), page.press(box, 'Enter')]);
  await page.waitForTimeout(600);
  check('a control on another page is shown once that page opens', await page.evaluate(() => /Add show/i.test((document.querySelector('[data-assistant-shown]') || {}).textContent || '')));

  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log('\n' + passed + '/' + (passed + fails.length) + ' checks passed');
  if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
