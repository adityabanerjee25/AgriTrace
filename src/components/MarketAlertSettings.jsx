import React, { useState } from 'react';
import { CEDA_STATES, MARKET_CROPS } from '../../shared/marketCrops.js';

export default function MarketAlertSettings({ settings, connected, busy, onSave }) {
  const [form, setForm] = useState({ enabled: settings?.enabled || false, cropId: settings?.cropId || 'WHEAT', state: settings?.state || '', priceEnabled: settings?.priceEnabled !== false, demandEnabled: settings?.demandEnabled !== false, priceAbove: settings?.priceAbove ?? '', priceBelow: settings?.priceBelow ?? '' });
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  return <section className="notification-card market-alert-card" aria-labelledby="market-alert-heading">
    <h2 id="market-alert-heading">Price &amp; demand alerts</h2>
    <p>Follow one crop and state. Receive observed mandi prices and new matching buyer requests in your Telegram chat.</p>
    {!connected && <p className="market-alert-hint">Connect Telegram and enable notifications above to activate market alerts.</p>}
    <form onSubmit={event => {
      event.preventDefault();
      onSave({ ...form, priceAbove: form.priceAbove === '' ? null : Number(form.priceAbove), priceBelow: form.priceBelow === '' ? null : Number(form.priceBelow) });
    }}>
      <fieldset disabled={busy}>
        <label className="switch-row"><input type="checkbox" checked={form.enabled} onChange={event => change('enabled', event.target.checked)} /> Enable market alerts</label>
        <div className="market-alert-fields">
          <label>Crop<select value={form.cropId} onChange={event => change('cropId', event.target.value)}>{Object.entries(MARKET_CROPS).map(([id, crop]) => <option key={id} value={id}>{crop.name}</option>)}</select></label>
          <label>Market state<select value={form.state} required={form.enabled} onChange={event => change('state', event.target.value)}><option value="">Select state</option>{Object.keys(CEDA_STATES).map(state => <option key={state}>{state}</option>)}</select></label>
        </div>
        <div className="market-alert-types"><label><input type="checkbox" checked={form.priceEnabled} onChange={event => change('priceEnabled', event.target.checked)} /> Price alerts</label><label><input type="checkbox" checked={form.demandEnabled} onChange={event => change('demandEnabled', event.target.checked)} /> New buyer demand</label></div>
        {form.priceEnabled && <><div className="market-alert-fields">
          <label>Alert at or above (INR/kg)<input type="number" min="0.01" step="0.01" value={form.priceAbove} placeholder="Optional upper target" onChange={event => change('priceAbove', event.target.value)} /></label>
          <label>Alert at or below (INR/kg)<input type="number" min="0.01" step="0.01" value={form.priceBelow} placeholder="Optional lower target" onChange={event => change('priceBelow', event.target.value)} /></label>
        </div><p className="market-alert-hint">Leave both targets blank for a daily price update. With targets set, alerts are sent only when the observed mandi median reaches either target.</p></>}
        <button className="primary" disabled={busy || (form.enabled && !connected)} type="submit">{busy ? 'Saving…' : 'Save market alerts'}</button>
      </fieldset>
    </form>
    <p className="market-alert-hint">Checks run daily around 9–10 am IST. CEDA prices refresh at most once per crop/state each India calendar day. Missing or stale prices are withheld. Demand alerts use actual open AgriTrace requests, with up to 100 new requests per check.</p>
  </section>;
}
