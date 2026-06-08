export default {
  async fetch(request, env) {
    const asset = await env.ASSETS.fetch(request);
    const contentType = asset.headers.get('content-type') || '';

    if (!contentType.includes('text/html')) return asset;

    const apiBase = env.SIX_SEVEN_API_BASE || 'https://six-seven-api.onrender.com';
    let html = await asset.text();

    if (!html.includes('window.SIX_SEVEN_API_BASE=')) {
      const injection = `<script>window.SIX_SEVEN_API_BASE=${JSON.stringify(apiBase)};</script>`;
      html = html.replace('<script src="app.js"></script>', `${injection}\n  <script src="app.js"></script>`);
    } else {
      html = html.replace(/<script>window\.SIX_SEVEN_API_BASE=.*?<\/script>/, `<script>window.SIX_SEVEN_API_BASE=${JSON.stringify(apiBase)};</script>`);
    }

    // The current app.js owns matchmaking, battle input, and realtime sync.
    // Keep old post-load runtimes out of the page; they target the pre-WS build.
    if (!html.includes('release-image-rescue.js')) {
      html = html.replace('</body>', '  <script src="release-image-rescue.js"></script>\n</body>');
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
