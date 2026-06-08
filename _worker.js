export default {
  async fetch(request, env) {
    const asset = await env.ASSETS.fetch(request);
    const contentType = asset.headers.get('content-type') || '';

    if (!contentType.includes('text/html')) return asset;

    const apiBase = env.SIX_SEVEN_API_BASE || 'https://six-seven-api.onrender.com';
    const botUsername = env.SIX_SEVEN_BOT_USERNAME || '';
    const appName = env.SIX_SEVEN_APP_NAME || '';
    const configScript = [
      '<script>',
      `window.SIX_SEVEN_API_BASE=${JSON.stringify(apiBase)};`,
      `window.SIX_SEVEN_BOT_USERNAME=${JSON.stringify(botUsername)};`,
      `window.SIX_SEVEN_APP_NAME=${JSON.stringify(appName)};`,
      '</script>',
    ].join('');

    let html = await asset.text();

    const apiScriptRegex = /<script>window\.SIX_SEVEN_API_BASE=.*?<\/script>/;
    const botScriptRegex = /<script>window\.SIX_SEVEN_BOT_USERNAME=.*?<\/script>/;
    const appScriptRegex = /<script>window\.SIX_SEVEN_APP_NAME=.*?<\/script>/;

    if (html.includes('window.SIX_SEVEN_API_BASE=')) {
      html = html.replace(apiScriptRegex, `<script>window.SIX_SEVEN_API_BASE=${JSON.stringify(apiBase)};</script>`);
      html = html.replace(botScriptRegex, `<script>window.SIX_SEVEN_BOT_USERNAME=${JSON.stringify(botUsername)};</script>`);
      html = html.replace(appScriptRegex, `<script>window.SIX_SEVEN_APP_NAME=${JSON.stringify(appName)};</script>`);
    } else if (html.includes('</head>')) {
      html = html.replace('</head>', `  ${configScript}\n</head>`);
    } else {
      html = `${configScript}${html}`;
    }

    if (!html.includes('release-image-rescue.js')) {
      html = html.replace('</body>', '  <script src="release-image-rescue.js"></script>\n</body>');
    }

    return new Response(html, {
      status: asset.status,
      headers: {
        ...Object.fromEntries(asset.headers),
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  },
};
