import crypto from 'crypto';
import mongoose from 'mongoose';
import connectToDatabase from './_utils/db.js';
import User from './_models/User.js';
import NotificationLog from './_models/NotificationLog.js';
import { notifyUser, sendTelegram } from './_utils/telegram.js';
import { getApiRoute, handleCors } from './_utils/http.js';
import { authenticate } from './_utils/market.js';
import { deliverMarketAlerts, validateMarketAlerts } from './_utils/marketAlerts.js';

const publicPreferences = (user) => ({
  telegram: {
    enabled: Boolean(user.notifications?.telegram?.enabled),
    connected: Boolean(user.notifications?.telegram?.chatId),
    connectedAt: user.notifications?.telegram?.connectedAt || null,
  },
  whatsapp: { enabled: Boolean(user.notifications?.whatsapp?.enabled), phone: user.notifications?.whatsapp?.phone || '' },
  inApp: { enabled: user.notifications?.inApp?.enabled !== false },
  marketAlerts: user.marketAlerts || { enabled: false, priceEnabled: true, demandEnabled: true },
});

const ensureNotifications = (user) => {
  user.notifications = user.notifications || {};
  user.notifications.telegram = user.notifications.telegram || { enabled: false, chatId: null, connectedAt: null };
  user.notifications.whatsapp = user.notifications.whatsapp || { enabled: false, phone: null };
  user.notifications.inApp = user.notifications.inApp || { enabled: true };
};

async function requestUser(req) {
  const actor = authenticate(req);
  if (actor && mongoose.isValidObjectId(actor.id)) return User.findById(actor.id);
  return null;
}

const commandText = (command, user) => {
  if (command === '/status') return `🌾 AgriTrace account status\n\nName: ${user.name}\nRole: ${user.role}\nTelegram notifications: ${user.notifications?.telegram?.enabled ? 'Enabled' : 'Paused'}`;
  if (command === '/notifications') return `Market alerts: ${user.marketAlerts?.enabled ? `${user.marketAlerts.cropId} in ${user.marketAlerts.state}` : 'Not configured'}\n\nChoose crop, state and price targets in AgriTrace Settings → Notifications. Market checks run daily; /stop pauses all Telegram messages.`;
  return 'AgriTrace bot commands:\n/status — account connection\n/notifications — notification settings\n/stop — pause notifications\n/help — show this help';
};

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    const url = getApiRoute(req);
    if (url.includes('/market-alerts/run')) {
      if (req.method !== 'GET') return res.status(405).json({ message: 'Method Not Allowed' });
      if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ message: 'Invalid scheduler credentials' });
      if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(503).json({ message: 'Telegram bot is not configured' });
      await connectToDatabase();
      const users = await User.find({ 'marketAlerts.enabled': true, 'notifications.telegram.enabled': true, 'notifications.telegram.chatId': { $type: 'string' } });
      return res.status(200).json(await deliverMarketAlerts(users));
    }

    if (url.includes('/telegram/webhook')) {
      if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
      const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
      if (!expected) return res.status(503).json({ message: 'TELEGRAM_WEBHOOK_SECRET is not configured' });
      if (req.headers['x-telegram-bot-api-secret-token'] !== expected) return res.status(401).json({ message: 'Invalid webhook secret' });
      await connectToDatabase();
      const message = req.body?.message;
      const chatId = message?.chat?.id ? String(message.chat.id) : null;
      const text = String(message?.text || '').trim();
      if (!chatId || !text || message.chat.type !== 'private') return res.status(200).json({ ok: true });

      if (text.startsWith('/start')) {
        const token = text.split(/\s+/)[1];
        const user = token ? await User.findOneAndUpdate({ telegramLinkToken: token, telegramLinkExpiresAt: { $gt: new Date() } }, { $unset: { telegramLinkToken: '', telegramLinkExpiresAt: '' } }, { new: true }) : null;
        if (!user) {
          await sendTelegram(chatId, 'This AgriTrace connection link is invalid or expired. Generate a new link from Settings → Notifications.');
          return res.status(200).json({ ok: true });
        }
        user.notifications = user.notifications || {};
        user.notifications.telegram = { enabled: true, chatId, connectedAt: new Date() };
        user.notifications.inApp = user.notifications.inApp || { enabled: true };
        user.telegramLinkToken = undefined;
        user.telegramLinkExpiresAt = undefined;
        await user.save();
        await sendTelegram(chatId, `🌾 Welcome to AgriTrace, ${user.name}.\n\nTelegram connected successfully. You will now receive important trade, payment, quality, storage and logistics updates here.`);
        return res.status(200).json({ ok: true });
      }

      const user = await User.findOne({ 'notifications.telegram.chatId': chatId });
      if (!user) return res.status(200).json({ ok: true });
      const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();
      if (command === '/stop') {
        user.notifications.telegram.enabled = false;
        await user.save();
        await sendTelegram(chatId, 'Telegram notifications paused.\n\nYou can reconnect them anytime from AgriTrace Settings.');
      } else if (['/status', '/notifications', '/help'].includes(command)) {
        await sendTelegram(chatId, commandText(command, user));
      }
      return res.status(200).json({ ok: true });
    }

    if (!authenticate(req)) return res.status(401).json({ message: 'Sign in to manage notifications.' });
    await connectToDatabase();
    const user = await requestUser(req);
    if (!user) return res.status(401).json({ message: 'Sign in with a server-backed AgriTrace account to manage notifications.' });
    ensureNotifications(user);

    if (url.includes('/market-alerts')) {
      if (req.method !== 'PUT') return res.status(405).json({ message: 'Method Not Allowed' });
      let next;
      try { next = validateMarketAlerts(req.body || {}); } catch (error) { return res.status(400).json({ message: error.message }); }
      if (next.enabled && (!process.env.TELEGRAM_BOT_TOKEN || !user.notifications.telegram.chatId || !user.notifications.telegram.enabled)) return res.status(409).json({ message: 'Connect Telegram and enable notifications before saving market alerts.' });
      const old = user.marketAlerts?.toObject?.() || user.marketAlerts || {};
      const changed = next.enabled && (old.cropId !== next.cropId || old.state !== next.state);
      user.marketAlerts = { ...old, ...next, ...(changed ? { lastDemandCheckAt: undefined } : {}) };
      await user.save();
      return res.status(200).json(publicPreferences(user));
    }

    if (url.includes('/preferences')) {
      if (req.method === 'GET') return res.status(200).json(publicPreferences(user));
      if (req.method !== 'PUT') return res.status(405).json({ message: 'Method Not Allowed' });
      const next = req.body || {};
      if (typeof next.telegram?.enabled === 'boolean') user.notifications.telegram.enabled = next.telegram.enabled && Boolean(user.notifications.telegram.chatId);
      if (typeof next.inApp?.enabled === 'boolean') user.notifications.inApp.enabled = next.inApp.enabled;
      if (typeof next.whatsapp?.enabled === 'boolean') user.notifications.whatsapp.enabled = next.whatsapp.enabled;
      if (typeof next.whatsapp?.phone === 'string') user.notifications.whatsapp.phone = next.whatsapp.phone;
      await user.save();
      return res.status(200).json(publicPreferences(user));
    }

    if (url.includes('/telegram/connect')) {
      if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
      if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(503).json({ message: 'Telegram bot is not configured.' });
      const username = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
      if (!username) return res.status(503).json({ message: 'TELEGRAM_BOT_USERNAME is not configured.' });
      const token = crypto.randomBytes(24).toString('hex');
      user.telegramLinkToken = token;
      user.telegramLinkExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      return res.status(200).json({ url: `https://t.me/${username}?start=${token}`, expiresInSeconds: 900 });
    }

    if (url.includes('/telegram/disconnect')) {
      if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
      user.notifications.telegram = { enabled: false, chatId: null, connectedAt: null };
      user.telegramLinkToken = undefined;
      user.telegramLinkExpiresAt = undefined;
      await user.save();
      return res.status(200).json(publicPreferences(user));
    }

    if (url.includes('/telegram/test')) {
      if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
      if (!user.notifications.telegram?.chatId) return res.status(409).json({ message: 'Connect Telegram before sending a test.' });
      const sent = await notifyUser(user, {
        eventType: 'TELEGRAM_TEST',
        title: 'Telegram test',
        message: `✅ Telegram is connected to AgriTrace, ${user.name}.\n\nImportant account updates will arrive here.`,
        idempotencyKey: `telegram:test:${user._id}:${Date.now()}`,
        force: true,
      });
      return res.status(sent?.status === 'SENT' ? 200 : 502).json({ ok: sent?.status === 'SENT', message: sent?.status === 'SENT' ? 'Sent' : 'Telegram delivery failed. Check your bot connection and try again.', notification: sent });
    }

    if (url.includes('/history')) {
      if (req.method !== 'GET') return res.status(405).json({ message: 'Method Not Allowed' });
      return res.status(200).json(await NotificationLog.find({ userId: String(user._id) }).sort({ createdAt: -1 }).limit(50));
    }

    if (url.includes('/events')) {
      if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
      const { eventType, title, message, idempotencyKey } = req.body || {};
      if (!eventType || !message || !idempotencyKey) return res.status(400).json({ message: 'eventType, message and idempotencyKey are required.' });
      if (user.notifications?.inApp?.enabled !== false) {
        await NotificationLog.findOneAndUpdate(
          { idempotencyKey: `inapp:${user._id}:${idempotencyKey}` },
          { $setOnInsert: { userId: String(user._id), channel: 'IN_APP', eventType, title, message, status: 'SENT', sentAt: new Date() } },
          { upsert: true, new: true }
        );
      }
      const telegram = await notifyUser(user, { eventType, title, message, idempotencyKey: `telegram:${user._id}:${idempotencyKey}` });
      return res.status(202).json({ ok: true, telegram });
    }

    return res.status(404).json({ message: 'Notification endpoint not found' });
  } catch (error) {
    console.error('Notification API error:', error.name);
    return res.status(500).json({ message: 'Notification service unavailable. Try again shortly.' });
  }
}
