const BAN_SEARCH_URL = "https://api-adresse.data.gouv.fr/search/";
const BAN_REVERSE_URL = "https://api-adresse.data.gouv.fr/reverse/";
// INSEE commune code for Paris — Nadar is Paris-only, so address search
// is scoped to it (BAN matches this against all 20 arrondissements).
const PARIS_CITYCODE = "75056";

// Accepts a street address ("10 rue de Rivoli") or an arrondissement
// ("75011" / "Paris 11e") — BAN resolves both against the same endpoint.
export async function geocode(query) {
  const url = `${BAN_SEARCH_URL}?q=${encodeURIComponent(query)}&citycode=${PARIS_CITYCODE}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed: HTTP ${res.status}`);
  const data = await res.json();
  const feature = data.features && data.features[0];
  if (!feature) return null;
  const [lon, lat] = feature.geometry.coordinates;
  return { lat, lon, label: feature.properties.label };
}

// Turns a lat/lon (e.g. from navigator.geolocation) back into a human
// address label, so the "here" position is shown, not just coordinates.
export async function reverseGeocode(lat, lon) {
  const url = `${BAN_REVERSE_URL}?lon=${lon}&lat=${lat}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Reverse geocoding failed: HTTP ${res.status}`);
  const data = await res.json();
  const feature = data.features && data.features[0];
  return feature ? feature.properties.label : null;
}

// For autocomplete-as-you-type: several candidates instead of just the best one.
export async function searchAddresses(query, limit = 5) {
  const url = `${BAN_SEARCH_URL}?q=${encodeURIComponent(query)}&citycode=${PARIS_CITYCODE}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Address search failed: HTTP ${res.status}`);
  const data = await res.json();
  return (data.features || []).map((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    return { lat, lon, label: feature.properties.label };
  });
}
