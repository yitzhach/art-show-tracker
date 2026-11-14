// The Show Tracker's Worker: static files from tracker/, the studio API and
// the studio assistant on the same origin (D-039). Nothing else happens here.
// The same headers tracker/_headers gives every static file. "/" is answered
// here rather than by the asset server, so it needs them attached by hand.
const PAGE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/v1/')) return env.API.fetch(request);
    if (url.pathname.startsWith('/assistant/')) {
      if (!env.ASSISTANT) return Response.json({ error: { code: 'not_found', message: 'The assistant is not switched on here' } }, { status: 404 });
      return env.ASSISTANT.fetch(request);
    }
    if (url.pathname === '/') {
      const page = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
      const res = new Response(page.body, page);
      for (const [name, value] of Object.entries(PAGE_HEADERS)) {
        if (!res.headers.has(name)) res.headers.set(name, value);
      }
      return res;
    }
    return env.ASSETS.fetch(request);
  }
};
