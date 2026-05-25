export default {
  async fetch(request, env) {
    const asset = await env.ASSETS.fetch(request);
    const contentType = asset.headers.get('content-type') || '';

    if (!contentType.includes('text/html')) return asset;

    const apiBase = env.SIX_SEVEN_API_BASE || '';
    let html = await asset.text();
    if (!html.includes('api-client.js')) {
      const injection = `<script>window.SIX_SEVEN_API_BASE=${JSON.stringify(apiBase)};</script>\n  <script src="api-client.js"></script>`;
      html = html.replace('<script src="app.js"></script>', `${injection}\n  <script src="app.js"></script>`);
    }
    if (!html.includes('battle-performance.css')) {
      html = html.replace('</head>', '  <link rel="stylesheet" href="battle-performance.css" />\n</head>');
    }
    if (!html.includes('battle-hands-fix.css')) {
      html = html.replace('</head>', '  <link rel="stylesheet" href="battle-hands-fix.css" />\n</head>');
    }
    if (!html.includes('desktop-guard-hard.js')) {
      html = html.replace('</body>', '  <script src="desktop-guard-hard.js"></script>\n</body>');
    }
    if (!html.includes('battle-performance-hard.js')) {
      html = html.replace('</body>', '  <script src="battle-performance-hard.js"></script>\n</body>');
    }
    if (!html.includes('battle-lite-engine.js')) {
      html = html.replace('</body>', '  <script src="battle-lite-engine.js"></script>\n</body>');
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
