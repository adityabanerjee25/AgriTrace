// Inputs must be engineered by the original training pipeline, in its original units.
export async function getMandiForecast(features, conditions = {}, review = true) {
  if (!features || Array.isArray(features) || typeof features !== 'object') return null;
  const response = await fetch('/api/ai/mandi-forecast', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ features, conditions, review })
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.message || `Mandi model unavailable (${response.status})`);
  return payload;
}
