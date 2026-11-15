import React, { useEffect, useRef, useState } from 'react';
import { qualityRequest, preparePhoto, CEDA_STATES, qualitySampleSummary } from '../services/market/produceQualityService';
import './ProduceQuality.css';
import { MARKET_CROPS } from '../../shared/marketCrops.js';
export default function LotQualityPanel({ cropId, photos, onChange, onBusy, onError, onApplyPrice }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState('');
  const [transport, setTransport] = useState('');
  const [price, setPrice] = useState(null);
  const [priceBusy, setPriceBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; onBusy(false); }; }, [onBusy]);
  async function upload(event) {
    const files = Array.from(event.target.files || []); event.target.value = '';
    if (files.length + photos.length > 5) { setError('Attach at most five photos.'); return; }
    setBusy(true); onBusy(true); setError(''); onError('');
    const next = [...photos];
    try {
      for (const file of files) {
        const imageData = await preparePhoto(file);
        const assessment = await qualityRequest('', { action: 'analyze', cropId, imageData });
        if (!alive.current) return;
        next.push({ ...assessment, name: file.name, url: imageData }); onChange([...next]); setPrice(null);
      }
    } catch (cause) { if (alive.current) { setError(cause.message); onError(cause.message); } }
    finally { if (alive.current) { setBusy(false); onBusy(false); } }
  }
  async function recommend() {
    setPrice(null); setError('');
    if (!state || transport === '' || Number(transport) < 0) { setError('Choose a state and enter transport cost per kg (zero is allowed).'); return; }
    setPriceBusy(true);
    try { const response = await qualityRequest('', { action: 'price', assessmentIds: photos.map(photo => photo.assessmentId), cropId, state, stateId: CEDA_STATES[state], transportCostPerKg: Number(transport) }); if (alive.current) setPrice(response); }
    catch (cause) { if (alive.current) setError(cause.message); }
    finally { if (alive.current) setPriceBusy(false); }
  }
  return <section className="produce-quality" aria-labelledby="lot-quality-heading">
    <h4 id="lot-quality-heading">Photo quality assessment</h4>
    <p className="produce-quality-note"><strong>Assessing: {MARKET_CROPS[cropId]?.name || cropId}.</strong> The crop selected above determines the model; the photo filename does not. {cropId === 'TOMATO' ? 'Tomato detection and ripeness models are enabled.' : 'Automated quality grading is unavailable for this crop; photos can be reviewed by a quality partner.'}</p>
    <p>Upload up to five daylight photos, including a close-up. Images are saved with your lot for a quality partner to review.</p>
    {cropId === 'POTATO' && <p className="produce-quality-note">The supplied potato weights are general object detectors. Potato grading requires manual partner review until trained quality weights are supplied.</p>}
    <label htmlFor="produce-upload">Crop photos · JPEG, PNG or WebP, up to 8 MB each</label>
    <input id="produce-upload" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || photos.length >= 5} onChange={upload} />
    {busy && <p role="status">Saving photo and evaluating visible produce…</p>}
    {error && <p role="alert" className="produce-quality-error">{error} <button type="button" onClick={() => { setError(''); onError(''); }}>Dismiss</button></p>}
    <div className="produce-photo-list">{photos.map((photo, index) => <article key={photo.assessmentId}>
      <img src={photo.url} alt={`Uploaded ${cropId.toLowerCase()} sample ${index + 1}`} />
      <div><strong>{photo.name}</strong><p>{photo.result.grade === 'REJECT' ? 'Possible spoilage flagged — partner review required' : photo.result.grade ? `Provisional visual grade: ${photo.result.grade}` : 'Manual grading required'}</p><p>{photo.result.reason}</p>
        {photo.result.samples?.length > 0 && <p>{qualitySampleSummary(photo.result)}</p>}
        {photo.result.sampleCoverage !== undefined && photo.result.totalSampleCount > 0 && <p>{photo.result.reliableSampleCount}/{photo.result.totalSampleCount} detections meet the 65% model-score threshold. Uncertain samples are not assigned a ripeness label.</p>}
        {photo.result.warnings?.map((warning, i) => <p key={i}>{warning}</p>)}
        <small>Partner approval pending. Photo estimates do not certify the whole lot.</small>
        <button type="button" disabled={busy} onClick={() => { onChange(photos.filter((_, i) => i !== index)); setPrice(null); onError(''); setError(''); }}>Remove photo</button>
      </div></article>)}</div>
    <h4>Competitive selling-price reference</h4>
    <p>Uses cached CEDA mandi history for your state, same-month historical prices, open buyer demand, and your transport cost. No unverified quality premium is added.</p>
    <div className="produce-quality-fields">
      <label>State<select value={state} onChange={event => { setState(event.target.value); setPrice(null); }}><option value="">Select state</option>{Object.keys(CEDA_STATES).map(name => <option key={name}>{name}</option>)}</select></label>
      <label>Transport cost (INR/kg)<input type="number" min="0" step="0.01" value={transport} onChange={event => { setTransport(event.target.value); setPrice(null); }} /></label>
    </div>
    <button type="button" className="btn-secondary" disabled={priceBusy} onClick={recommend}>{priceBusy ? 'Loading cached market evidence…' : 'Get price reference'}</button>
    {price && <div className="produce-quality-note" role="status">{price.farmGateRange ? <>
      <strong>Indicative farm-gate range: ₹{price.farmGateRange.low.toFixed(2)}–₹{price.farmGateRange.high.toFixed(2)} / kg</strong>
      <p>CEDA · {price.region} · latest observation {price.latestDate} · {price.observations} records. Transport deducted: ₹{price.transportCostPerKg}/kg.</p>
      <p>Quality considered: {price.quality?.grade || 'not assessed'} · {price.quality?.approved ? 'Partner verified' : 'Provisional / unverified'}. No calibrated quality price adjustment available.</p>
      <p>{price.demand?.openDemandCount} open buyer demands · {price.demand?.quantityKg} kg requested. Seasonal price reference: {price.seasonalReference ? `₹${price.seasonalReference.sameMonthPriorYearAverage.toFixed(2)}/kg in the same month of the prior year` : 'not enough historical observations'}.</p>
      <p>Same-month prior-year demand: {price.demand?.seasonalHistory ? `${price.demand.seasonalHistory.sameMonthPriorYearQuantityKg} kg across ${price.demand.seasonalHistory.records} records` : 'insufficient historical buyer records'}. {price.demand?.seasonality}</p><p>{price.limitations.join(' ')}</p>
      <button type="button" onClick={() => onApplyPrice((price.farmGateRange.low + price.farmGateRange.high) / 2)}>Use midpoint as asking price</button>
    </> : <p>{price.reason} Enter an asking price using independently verified market information.</p>}</div>}
  </section>;
}
