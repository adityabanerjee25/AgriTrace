import React from 'react';
import CropMarketIntelligence from '../../../components/CropMarketIntelligence';
import PredictionAdvisory from '../../../components/PredictionAdvisory';
import { MARKET_CROPS } from '../../../../shared/marketCrops.js';
import QuickCropRecommendation from '../../../components/QuickCropRecommendation';

export default function MarketOverviewTab({ selectedCommodityId = 'WHEAT', onLaunchDiscovery }) {
  return <div>
    <QuickCropRecommendation key={selectedCommodityId} cropId={selectedCommodityId} />
    <CropMarketIntelligence key={selectedCommodityId} cropId={selectedCommodityId} />
    {MARKET_CROPS[selectedCommodityId]?.lightgbm && <details className="market-card" style={{ padding: 20, marginBottom: 24 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Advanced LightGBM prediction with prepared features</summary><PredictionAdvisory key={selectedCommodityId} selectedCommodityId={selectedCommodityId} /></details>}
    <section className="market-card" style={{ padding: 24 }}><h3>Compare selling scenarios</h3><p>Use the separate calculator to compare illustrative procurement channels and logistics assumptions. Its demo channel prices are not live quotes.</p><button className="btn-primary" onClick={onLaunchDiscovery}>Open scenario calculator</button></section>
  </div>;
}
