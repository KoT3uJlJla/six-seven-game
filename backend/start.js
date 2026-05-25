import 'dotenv/config';

const defaults = [
  'https://sixseven-a2f.pages.dev',
];

const current = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map(v => v.trim().replace(/\/$/, ''))
  .filter(Boolean);

process.env.FRONTEND_ORIGINS = Array.from(new Set([...current, ...defaults])).join(',');

await import('./server-production.js');
