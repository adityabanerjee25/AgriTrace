# Telegram price and demand alerts

Open the account menu → Notification settings → Connect Telegram. Follow the
personal link and press Start in the bot, then return and refresh status. A
link expires after 15 minutes and can be used once. Only private chats link;
one Telegram chat belongs to one account. Bot credentials stay on the server.

Enable market alerts, select one of the nine listed crops and a market state,
then choose prices, new buyer demand, or both. Optional inclusive upper/lower
price targets use INR/kg. With neither target, a daily observed-price update
is sent. With targets, the median must meet at least one target. Missing and
stale price observations never generate a price alert.

Demand checks use actual open, unexpired regional buyer requests, excluding
the recipient's own demands. The first check includes existing matching
requests; later checks include new requests after the last delivered batch.
Up to 100 requests are processed in creation order per daily check, with three
examples in the message. Failed delivery does not advance the demand cursor.
Delivery history records sent/failed attempts. Telegram /stop pauses delivery;
resume from the website. Disabling the market subscription keeps other trade
notifications active. Disconnecting Telegram also invalidates unused links.

## Hosting

Production environment variables:

| Variable | Purpose |
| --- | --- |
| TELEGRAM_BOT_TOKEN | BotFather token, server secret |
| TELEGRAM_BOT_USERNAME | Public bot username without @ |
| TELEGRAM_WEBHOOK_SECRET | Random secret registered with Telegram |
| CRON_SECRET | Random bearer secret for Vercel's scheduled request |

Register the HTTPS webhook at `/api/notifications/telegram/webhook` with
Telegram `setWebhook`, `secret_token` matching TELEGRAM_WEBHOOK_SECRET, and
`allowed_updates:["message"]`. Preserve queued updates during configuration.
The handler validates the webhook header before any database access.
After deploying the environment variables, run
`node scripts/configure-telegram-webhook.mjs` with PUBLIC_APP_URL (or
TELEGRAM_WEBHOOK_BASE_URL) set to the HTTPS production origin. The script does
not print tokens or drop queued updates.

The Vercel daily cron calls `/api/notifications/market-alerts/run` at 03:30 UTC
(09:00 IST; Hobby may run within the following hour). It requires CRON_SECRET.
Only enabled subscriptions with enabled, personally linked Telegram accounts
are read. The job refreshes only subscribed crop/state price queries and uses
the same persistent, once-per-India-day CEDA cache as the UI. Demand-only
subscriptions never call CEDA. Duplicate price checks reuse a per-account/day
delivery key; demand batches also include their request IDs. Failed sends are
logged; demand can be retried on the following day. The current worker is
intended for the hackathon's small subscriber set within a 300-second function;
larger deployments should use a queued worker with pagination.

No public endpoint accepts arbitrary chat IDs. Settings/history require the
account's signed bearer token. A shared TELEGRAM_CHAT_ID fallback is not used.

Verification: `npm test` covers thresholds, validation, cache sharing, cursor
safety, authorization, paused accounts and deduplication without external
messages or CEDA calls. Test delivery from the settings screen after linking.

Provider documentation: [Telegram Bot API](https://core.telegram.org/bots/api#setwebhook),
[Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
