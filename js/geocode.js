const BAN_SEARCH_URL = "https://api-adresse.data.gouv.fr/search/";

// Accepts a street address ("10 rue de Rivoli") or an arrondissement
// ("75011" / "Paris 11e") — BAN resolves both against the same endpoint.
export async function geocode(query) {
  const url = `${BAN_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed: HTTP ${res.status}`);
  const data = await res.json();
  const feature = data.features && data.features[0];
  if (!feature) return null;
  const [lon, lat] = feature.geometry.coordinates;
  return { lat, lon, label: feature.properties.label };
}
