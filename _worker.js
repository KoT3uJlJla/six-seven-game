export default {
  async fetch(request, env) {
    const asset = await env.ASSETS.fetch(request);
    const contentType = asset.headers.get('content-type') || '';

    if (!contentType.includes('text/html')) return asset;

    const apiBase = env.SIX_SEVEN_API_BASE || 'https://six-seven-api.onrender.com';
    const version = 'restore-images-1';
    let html = await asset.text();

    // Remove every previously injected runtime/style so Telegram WebView cannot reuse stale broken files.
    html = html
      .replace(/\s*<link[^>]+href=["']battle-clean\.css(?:\?[^"']*)?["'][^>]*>\s*/g, '\n')
      .replace(/\s*<script>window\.SIX_SEVEN_API_BASE=.*?<\/script>\s*/g, '\n')
      .replace(/\s*<script[^>]+src=["']api-client\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/g, '\n')
      .replace(/\s*<script[^>]+src=["']desktop-guard-hard\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/g, '\n')
      .replace(/\s*<script[^>]+src=["']p1-runtime\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/g, '\n')
      .replace(/\s*<script[^>]+src=["']release-hotfix-visuals-shop\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/g, '\n')
      .replace(/\s*<script[^>]+src=["']release-referral-mask\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/g, '\n')
      .replace(/\s*<script[^>]+src=["']release-story-share\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/g, '\n')
      .replace(/\s*<script[^>]+src=["']release-share-final-fix\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/g, '\n')
      .replace(/\s*<script[^>]+src=["']release-live-final-fix\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/g, '\n')
      .replace(/\s*<script[^>]+src=["']battle-lite-engine\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/g, '\n')
      .replace(/\s*<script[^>]+src=["']battle-performance-hard\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/g, '\n');

    const headInjection = `  <link rel="stylesheet" href="battle-clean.css?v=${version}" />\n`;
    html = html.replace('</head>', `${headInjection}</head>`);

    const apiInjection = `<script>window.SIX_SEVEN_API_BASE=${JSON.stringify(apiBase)};</script>\n  <script src="api-client.js?v=${version}"></script>`;
    html = html.replace('<script src="app.js"></script>', `${apiInjection}\n  <script src="app.js?v=${version}"></script>`);

    const bodyInjection = [
      `  <script src="desktop-guard-hard.js?v=${version}"></script>`,
      `  <script src="p1-runtime.js?v=${version}"></script>`,
      `  <script src="release-hotfix-visuals-shop.js?v=${version}"></script>`,
      `  <script src="release-referral-mask.js?v=${version}"></script>`
    ].join('\n') + '\n';
    html = html.replace('</body>', `${bodyInjection}</body>`);

    return new Response(html, {
      status: asset.status,
      headers: {
        ...Object.fromEntries(asset.headers),
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        'pragma': 'no-cache',
        'expires': '0'
      }
    });
  }
};