# Storage directory and quick crop recommendations

The farmer storage finder uses `src/services/storageDirectory.js` rather than
the old locally persisted demo warehouses. Four real CWC facilities are listed
in Mysore, Yeshwanthpur, Whitefield and Mangalore, using the official CWC digital
directory and the January 2026 Mysore facility notice linked on each listing.
Only Mysore has sourced precise coordinates; other pins are approximate area
locations. Prices, available space, ratings and cold-chain support are unknown,
not fabricated. Contact actions open official facility details; these facilities
are not integrated booking partners. Internal sample storage records retain
their IDs and operational history, with produce names and demo labels.

Each crop's market overview starts with a quick recommendation panel, followed
by the existing observed market intelligence and optional detailed Qwen review.
Quick mode calls the supplied LightGBM weights with `review:false`; the server
returns a short deterministic recommendation derived from UP/DOWN/STABLE and
never calls Qwen. It requires the original 40 engineered features, supplied as
JSON in the original training units. It does not manufacture feature values
from raw daily prices. Features must match the selected crop tab.

The trained categorical mappings cover only Tomato, Potato and Onion. Other
crop tabs explain the missing model coverage and preserve their observed-price,
buyer-demand and detailed-advisory features. Matching trained weights and
preprocessing are required before ML recommendations can cover those crops.

Checks: `python api/ai/mandi-forecast.selfcheck.py` includes direct real-weight
predictions for all three supported crops while asserting no Qwen call, plus
unsupported-crop rejection and the unchanged detailed review pipeline.
