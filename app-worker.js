// The Show Tracker's Worker: static files from tracker/, the studio API and
// the studio assistant on the same origin (D-039). Nothing else happens here.
export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/v1/')) return env.API.fetch(request);
    if (url.pathname.startsWith('/assistant/')) {
      if (!env.ASSISTANT) return Response.json({ error: { code: 'not_found', message: 'The assistant is not switched on here' } }, { status: 404 });
      return env.ASSISTANT.fetch(request);
    }
    if (url.pathname === '/') return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    return env.ASSETS.fetch(request);
  }
};
