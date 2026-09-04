// FIPS codes for the states the UI offers. Kept here so /api/places can only
// ever be pointed at the Census API, never at an arbitrary URL.
const STATE_FIPS = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09',
  DE: '10', DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17',
  IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24',
  MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31',
  NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38',
  OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46',
  TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54',
  WI: '55', WY: '56',
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

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

    // Census place lookup, proxied so the API key stays server-side.
    //
    // This used to be fetched straight from the browser. The Census API began
    // requiring a key for every data query: keyless requests now 302 to
    // /data/missing_key.html, and that redirect carries no CORS header, so the
    // browser reported it as a CORS failure and every state lookup died.
    // Proxying here keeps the key out of the bundle, makes the request
    // same-origin, and lets one cached response serve everyone.
    if (url.pathname === '/api/places' && request.method === 'GET') {
      const state = (url.searchParams.get('state') || '').toUpperCase();
      const fips = STATE_FIPS[state];

      // Only known states, so this cannot be used as an open proxy.
      if (!fips) {
        return json({ error: 'Unknown state' }, 400);
      }

      // `error` is shown to visitors, `detail` is for whoever is on call.
      if (!env.CENSUS_API_KEY) {
        return json({
          error: 'Place data is temporarily unavailable.',
          detail: 'CENSUS_API_KEY is not set on this Worker. ' +
                  'Set it with: wrangler secret put CENSUS_API_KEY',
        }, 503);
      }

      // Built by hand rather than with URLSearchParams: that percent-encodes
      // the colons and commas (for=place%3A*), and this exact unencoded form
      // is the one that has always worked against this endpoint. Only the key
      // is escaped, since it is the sole value not under our control.
      const census = 'https://api.census.gov/data/2022/acs/acs5' +
        '?get=NAME,B01003_001E,B19013_001E&for=place:*' +
        `&in=state:${fips}&key=${encodeURIComponent(env.CENSUS_API_KEY)}`;

      try {
        // ACS 2022 is a fixed annual release, so cache it hard at the edge.
        const upstream = await fetch(census, {
          cf: { cacheTtl: 86400, cacheEverything: true },
          headers: { Accept: 'application/json' },
          redirect: 'manual',
        });

        // A key problem shows up as a 302 to missing_key/invalid_key, not an
        // error status. Say so plainly instead of failing as bad JSON.
        if (upstream.status >= 300 && upstream.status < 400) {
          const to = upstream.headers.get('location') || '';
          return json({
            error: 'Place data is temporarily unavailable.',
            detail: to.includes('invalid_key')
              ? 'Census rejected CENSUS_API_KEY.'
              : 'Census redirected the query; it requires a valid API key.',
          }, 502);
        }

        if (!upstream.ok) {
          return json({ error: `Census API error: ${upstream.status}` }, 502);
        }

        const rows = await upstream.json();
        if (!Array.isArray(rows) || rows.length < 2) {
          return json({ error: 'Census returned no rows' }, 502);
        }

        // Shape it here so the browser ships less and parses less.
        const places = rows.slice(1).map(([name, pop, income]) => ({
          fullName: name,
          name: name.split(',')[0]
            .replace(/ (city|town|CDP|village|borough)$/i, '')
            .trim(),
          population: parseInt(pop) || 0,
          medianIncome: parseInt(income) > 0 ? parseInt(income) : null,
        })).filter(p => p.population > 0);

        return json({ state, places }, 200, {
          'Cache-Control': 'public, max-age=86400',
        });
      } catch (err) {
        return json({ error: err.message }, 502);
      }
    }

    // For all other routes, let the asset handler take over
    return env.ASSETS.fetch(request);
  }
};
