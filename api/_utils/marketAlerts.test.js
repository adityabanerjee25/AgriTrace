import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMarketAlerts, priceAlertMessage, demandAlertMessage, deliverMarketAlerts } from './marketAlerts.js';
import User from '../_models/User.js';
import NotificationLog from '../_models/NotificationLog.js';
import handler from '../notifications.js';
import { notifyUser } from './telegram.js';

const settings = { enabled: true, cropId: 'TOMATO', state: 'Karnataka', stateId: 29, priceEnabled: true, demandEnabled: true, priceAbove: null, priceBelow: null };
const market = { status: 'READY', mandiMedian: 30, latestDate: '2026-11-15' };
const user = id => ({ _id: id, marketAlerts: settings, notifications: { telegram: { enabled: true, chatId: 'fixture-only' } } });
test('market subscriptions reject unsupported crops, invalid costs, and empty alert types', () => {
  assert.equal(validateMarketAlerts(settings).stateId, 29);
  for (const patch of [{ cropId: 'UNKNOWN' }, { state: '__proto__' }, { priceAbove: -1 }, { priceBelow: '20' }, { priceBelow: 40, priceAbove: 30 }, { priceEnabled: false, demandEnabled: false }]) assert.throws(() => validateMarketAlerts({ ...settings, ...patch }));
  assert.deepEqual(validateMarketAlerts({ enabled: false }), { enabled: false });
});
test('price alerts use observed prices, inclusive thresholds and suppress stale evidence', () => {
  assert.match(priceAlertMessage(settings, market), /INR 30.00\/kg/);
  assert.equal(priceAlertMessage({ ...settings, priceAbove: 31 }, market), null);
  assert.equal(priceAlertMessage({ ...settings, priceBelow: 29 }, market), null);
  assert.ok(priceAlertMessage({ ...settings, priceAbove: 30 }, market));
  assert.ok(priceAlertMessage({ ...settings, priceBelow: 30 }, market));
  assert.equal(priceAlertMessage(settings, { ...market, status: 'STALE_DATA' }), null);
  assert.equal(priceAlertMessage(settings, { ...market, mandiMedian: NaN }), null);
  assert.equal(demandAlertMessage(settings, []), null);
});
test('daily delivery shares market evidence, isolates users, and advances demand only on success', async () => {
  const oldUpdate = User.updateOne;
  let fetches = 0;
  const sent = [], updates = [], queries = [];
  const now = new Date('2026-11-15T03:30:00Z');
  User.updateOne = async (...args) => { updates.push(args); };
  const dependencies = { now, getMarket: async () => { fetches++; return market; }, findDemands: async query => {
    queries.push(query);
    return [{ demandId: 'fixture-demand', quantity: 500, unit: 'kg', maxPrice: 40, priceUnit: 'INR/kg', deliveryBy: new Date('2026-11-18'), createdAt: new Date('2026-11-15T01:00:00Z') }];
  }, send: async (actor, message) => { sent.push([actor._id, message]); return { status: actor._id === 'fail' ? 'FAILED' : 'SENT' }; } };
  try {
    const result = await deliverMarketAlerts([user('a'), user('b'), user('fail'), { ...user('paused'), notifications: { telegram: { enabled: false, chatId: 'fixture' } } }], dependencies);
    assert.equal(fetches, 1);
    assert.deepEqual(result, { sent: 4, failed: 2, skipped: 1 });
    assert.equal(updates.length, 2);
    assert.equal(updates[0][1].$max['marketAlerts.lastDemandCheckAt'].toISOString(), '2026-11-15T01:00:00.000Z');
    assert.notEqual(sent[0][1].idempotencyKey, sent[2][1].idempotencyKey);
    assert.equal(queries[0].buyerId.$ne, 'a');
    assert.match(sent[1][1].message, /500 kg/);
  } finally { User.updateOne = oldUpdate; }
});
test('notification API rejects impersonation headers and untrusted cron/webhook calls before DB access', async () => {
  for (const route of ['/preferences', '/history', '/market-alerts/run', '/telegram/webhook']) {
    let status;
    const response = { setHeader() {}, status(value) { status = value; return this; }, json() {} };
    await handler({ method: route.includes('webhook') ? 'POST' : 'GET', query: { route }, headers: { 'x-user-id': 'victim', 'x-user-email': 'victim@example.test' } }, response);
    assert.ok([401, 503].includes(status), `${route}: ${status}`);
  }
});
test('demand-only subscriptions never request prices; delivery failures preserve the demand cursor', async () => {
  const oldUpdate = User.updateOne;
  User.updateOne = async () => { throw new Error('A failed delivery must not advance the cursor'); };
  const actor = { ...user('demand-only'), marketAlerts: { ...settings, priceEnabled: false } };
  try {
    const totals = await deliverMarketAlerts([actor], { getMarket: () => { throw new Error('Unexpected CEDA request'); }, findDemands: async () => [{ demandId: 'd1', quantity: 1, unit: 'kg', maxPrice: 10, priceUnit: 'INR/kg', deliveryBy: new Date(), createdAt: new Date() }], send: async () => ({ status: 'FAILED' }) });
    assert.deepEqual(totals, { sent: 0, failed: 1, skipped: 0 });
  } finally { User.updateOne = oldUpdate; }
});
test('Telegram delivery deduplicates an existing daily notification before calling the provider', async () => {
  const oldFind = NotificationLog.findOne;
  const oldFetch = global.fetch;
  NotificationLog.findOne = async () => ({ status: 'SENT', idempotencyKey: 'fixture' });
  global.fetch = () => { throw new Error('Duplicate provider request'); };
  try { assert.equal((await notifyUser(user('a'), { eventType: 'MARKET_PRICE_ALERT', message: 'fixture', idempotencyKey: 'fixture' })).status, 'SENT'); }
  finally { NotificationLog.findOne = oldFind; global.fetch = oldFetch; }
});
