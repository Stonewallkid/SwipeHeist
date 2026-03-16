// Worker entry point for API routes
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle API routes
    if (url.pathname === '/api/search-count' && request.method === 'GET') {
      try {
        // Historical searches before counter was added
        const HISTORICAL_OFFSET = 11343;

        const result = await env.DB.prepare(`
          SELECT COUNT(*) as count
          FROM searches
          WHERE searched_at >= datetime('now', '-30 days')
        `).first();

        return new Response(JSON.stringify({
          count: (result?.count || 0) + HISTORICAL_OFFSET,
          period: '30 days'
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60'
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname === '/api/log-search' && request.method === 'POST') {
      try {
        const { town, state } = await request.json();

        if (!town || !state) {
          return new Response(JSON.stringify({ error: 'Missing town or state' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        await env.DB.prepare(
          'INSERT INTO searches (town_name, state) VALUES (?, ?)'
        ).bind(town, state).run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // For all other routes, let the asset handler take over
    return env.ASSETS.fetch(request);
  }
};
