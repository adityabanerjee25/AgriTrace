import { loadEnv } from 'vite';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const base = new URL(env.TELEGRAM_WEBHOOK_BASE_URL || env.PUBLIC_APP_URL || '');
if (base.protocol !== 'https:') throw new Error('Use the public HTTPS production URL.');
if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) throw new Error('Configure TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET first.');
async function telegram(method, body) {
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  } catch { throw new Error(`Telegram ${method} could not be reached.`); }
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method} failed. Check bot credentials and webhook configuration.`);
  return result.result;
}
await telegram('setWebhook', { url: new URL('/api/notifications/telegram/webhook', base).href, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message'] });
const info = await telegram('getWebhookInfo', {});
console.log(JSON.stringify({ configured: true, url: info.url, pendingUpdates: info.pending_update_count }));
