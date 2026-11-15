import React, { useState } from 'react';
import { MARKET_CROPS } from '../../shared/marketCrops.js';
import { getMandiForecast } from '../services/market/mandiForecastService.js';
import './PredictionAdvisory.css';

export default function QuickCropRecommendation({ cropId }) {
  const crop = MARKET_CROPS[cropId];
  const [json, setJson] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!crop) return null;
  async function predict(event) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null);
    try {
      const packet = JSON.parse(json);
      const features = packet.features || packet;
      if (features.vegetable?.toUpperCase() !== cropId) throw new Error(`Use prepared features for ${crop.name} to match this crop tab.`);
      setResult(await getMandiForecast(features, packet.conditions || {}, false));
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <section className="market-card prediction-advisory" aria-label={`${crop.name} quick recommendation`}>
    <header className="prediction-header"><div><h3>{crop.name}: quick recommendation</h3><p>Direct LightGBM output. No Qwen request or LLM review.</p></div></header>
    {crop.lightgbm ? <>
      {result ? <div role="status" className="prediction-advice"><h4>Model direction: {result.direction}</h4><p>{result.quickRecommendation}</p><p className="prediction-help">Model class score: {(result.classProbabilities[result.direction] * 100).toFixed(1)}% (uncalibrated). This is a direction signal, not a guaranteed price or sale instruction.</p></div> : <p className="prediction-help">Supply the 40 features prepared with the original training formulas and units. No recommendation is generated from missing or invented inputs.</p>}
      <details className="prediction-import"><summary>Supply prepared model inputs</summary><form onSubmit={predict}>
        <label>Prepared {crop.name} features (JSON)<textarea rows={5} value={json} onChange={event => { setJson(event.target.value); setResult(null); setError(''); }} placeholder={'{"features":{"vegetable":"' + crop.name + '",…}}'} disabled={busy} /></label>
        <label>Or upload a JSON feature file<input type="file" accept=".json,application/json" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (file.size > 100000) { setError('Use a file smaller than 100 KB.'); return; } try { setJson(await file.text()); setResult(null); setError(''); } catch { setError('Could not read the feature file.'); } }} /></label>
        <button type="submit" className="prediction-primary" disabled={busy || !json.trim()}>{busy ? 'Running LightGBM…' : 'Get quick recommendation'}</button>
      </form></details>
    </> : <p className="prediction-message">The supplied model has no trained category for {crop.name}. An ML recommendation is unavailable until matching weights are supplied. Use the observed market evidence and detailed intelligence below.</p>}
    {error && <p role="alert" className="prediction-message prediction-error">{error}</p>}
  </section>;
}
