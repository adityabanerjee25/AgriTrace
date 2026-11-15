import User from '../_models/User.js';
import BuyerDemand from '../_models/BuyerDemand.js';
import { notifyUser } from './telegram.js';
import { producePriceRecommendation } from './producePricing.js';
import { MARKET_CROPS, CEDA_STATES } from '../../shared/marketCrops.js';
import { createHash } from 'node:crypto';

export function validateMarketAlerts(input) {
  if (typeof input.enabled !== 'boolean') throw new Error('Choose whether market alerts are enabled.');
  if (!input.enabled) return { enabled: false };
  if (!Object.hasOwn(MARKET_CROPS, input.cropId) || !Object.hasOwn(CEDA_STATES, input.state)) throw new Error('Select a listed crop and state.');
  if (typeof input.priceEnabled !== 'boolean' || typeof input.demandEnabled !== 'boolean' || (!input.priceEnabled && !input.demandEnabled)) throw new Error('Enable price alerts, demand alerts, or both.');
  const limits = {};
  for (const key of ['priceAbove', 'priceBelow']) {
    const value = input[key] ?? null;
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) throw new Error('Price targets must be positive numbers in INR/kg, or left blank.');
    limits[key] = value;
  }
  if (limits.priceAbove !== null && limits.priceBelow !== null && limits.priceBelow >= limits.priceAbove) throw new Error('The lower target must be below the upper target.');
  return { enabled: true, cropId: input.cropId, state: input.state, stateId: CEDA_STATES[input.state], priceEnabled: input.priceEnabled, demandEnabled: input.demandEnabled, ...limits };
}

export function priceAlertMessage(settings, market) {
  if (!settings.priceEnabled || market.status !== 'READY' || !Number.isFinite(market.mandiMedian)) return null;
  const { priceAbove, priceBelow } = settings;
  if ((priceAbove != null || priceBelow != null) && !(priceAbove != null && market.mandiMedian >= priceAbove) && !(priceBelow != null && market.mandiMedian <= priceBelow)) return null;
  return `AgriTrace price alert\n${MARKET_CROPS[settings.cropId].name} · ${settings.state}\nObserved mandi median: INR ${market.mandiMedian.toFixed(2)}/kg\nLatest observation: ${market.latestDate}\nSource: CEDA Agmarknet daily snapshot. Commodity-level reference, not a guaranteed sale price or future forecast.`;
}

export function demandAlertMessage(settings, rows) {
  if (!settings.demandEnabled || !rows.length) return null;
  return `AgriTrace buyer-demand alert\n${MARKET_CROPS[settings.cropId].name} · ${settings.state}\n${rows.length} new open buyer request(s) since the last delivered check.\n${rows.slice(0, 3).map(row => `${row.quantity} ${row.unit} · maximum INR ${row.maxPrice} (${row.priceUnit}) · deliver by ${new Date(row.deliveryBy).toISOString().slice(0, 10)}`).join('\n')}\nView Buyer demand in AgriTrace to compare requirements. Requests may change or close.`;
}

// Only opted-in, personally linked accounts are eligible. Daily price requests share the UI cache.
export async function deliverMarketAlerts(users, { now = new Date(), getMarket = producePriceRecommendation, send = notifyUser, findDemands = query => BuyerDemand.find(query).sort({ createdAt: 1 }).limit(100).lean() } = {}) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const markets = new Map();
  const totals = { sent: 0, failed: 0, skipped: 0 };
  for (const user of users) {
    const settings = user.marketAlerts;
    if (!settings?.enabled || !user.notifications?.telegram?.enabled || !user.notifications.telegram.chatId) { totals.skipped++; continue; }
    try {
      validateMarketAlerts(settings);
      const key = `${settings.cropId}:${settings.stateId}`;
      if (settings.priceEnabled) {
        if (!markets.has(key)) markets.set(key, getMarket({ cropId: settings.cropId, state: settings.state, stateId: settings.stateId, transportCostPerKg: 0, ownerId: String(user._id) }).catch(() => null));
        const market = await markets.get(key);
        const message = market && priceAlertMessage(settings, market);
        if (message) {
          const log = await send(user, { eventType: 'MARKET_PRICE_ALERT', title: 'Crop price alert', message, idempotencyKey: `market:price:${user._id}:${key}:${day}` });
          totals[log.status === 'SENT' ? 'sent' : 'failed']++;
        }
      }
      if (settings.demandEnabled) {
        const rows = await findDemands({ cropId: settings.cropId, status: 'OPEN', buyerId: { $ne: String(user._id) }, 'deliveryLocation.state': settings.state, deliveryBy: { $gte: now }, ...(settings.lastDemandCheckAt ? { createdAt: { $gt: settings.lastDemandCheckAt, $lte: now } } : { createdAt: { $lte: now } }) });
        const message = demandAlertMessage(settings, rows);
        if (message) {
          const batch = createHash('sha256').update(rows.map(row => row.demandId).sort().join(',')).digest('hex').slice(0, 24);
          const log = await send(user, { eventType: 'MARKET_DEMAND_ALERT', title: 'New crop demand', message, idempotencyKey: `market:demand:${user._id}:${key}:${day}:${batch}` });
          totals[log.status === 'SENT' ? 'sent' : 'failed']++;
          if (log.status === 'SENT') await User.updateOne({ _id: user._id, 'marketAlerts.cropId': settings.cropId, 'marketAlerts.state': settings.state }, { $max: { 'marketAlerts.lastDemandCheckAt': rows.at(-1).createdAt } });
        } else await User.updateOne({ _id: user._id, 'marketAlerts.cropId': settings.cropId, 'marketAlerts.state': settings.state }, { $max: { 'marketAlerts.lastDemandCheckAt': now } });
      }
    } catch { totals.failed++; }
  }
  return totals;
}
