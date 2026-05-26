export default {
  async fetch(request, env) {
    const asset = await env.ASSETS.fetch(request);
    const contentType = asset.headers.get('content-type') || '';

    if (!contentType.includes('text/html')) return asset;

    const apiBase = env.SIX_SEVEN_API_BASE || 'https://six-seven-api.onrender.com';
    let html = await asset.text();

    if (!html.includes('api-client.js')) {
      const injection = `<script>window.SIX_SEVEN_API_BASE=${JSON.stringify(apiBase)};</script>\n  <script src="api-client.js"></script>`;
      html = html.replace('<script src="app.js"></script>', `${injection}\n  <script src="app.js"></script>`);
    } else {
      html = html.replace(/<script>window\.SIX_SEVEN_API_BASE=.*?<\/script>/, `<script>window.SIX_SEVEN_API_BASE=${JSON.stringify(apiBase)};</script>`);
    }

    // P1/P2 production stack: one CSS performance layer + hard desktop guard + one consolidated runtime.
    // Old overlay files remain in the repo for rollback, but are no longer injected here.
    if (!html.includes('battle-clean.css')) {
      html = html.replace('</head>', '  <link rel="stylesheet" href="battle-clean.css" />\n</head>');
    }
    if (!html.includes('desktop-guard-hard.js')) {
      html = html.replace('</body>', '  <script src="desktop-guard-hard.js"></script>\n</body>');
    }
    if (!html.includes('p1-runtime.js')) {
      html = html.replace('</body>', '  <script src="p1-runtime.js"></script>\n</body>');
    }

    return new Response(html, {
      status: asset.status,
      headers: {
        ...Object.fromEntries(asset.headers),
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }
};
