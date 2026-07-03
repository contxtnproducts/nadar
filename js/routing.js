// Public Valhalla instance (OSM Germany) — free, keyless, open CORS,
// real pedestrian costing (unlike the OSRM public demo, which silently
// serves car-graph results for every profile, "foot" included). No SLA:
// a community test server, not an official API — see CLAUDE.md.
const VALHALLA_MATRIX_URL = "https://valhalla1.openstreetmap.de/sources_to_targets";

// One request for the whole pool list instead of one per pool.
export async function getWalkingDurations(origin, destinations) {
  const body = {
    sources: [{ lat: origin.lat, lon: origin.lon }],
    targets: destinations.map((d) => ({ lat: d.lat, lon: d.lon })),
    costing: "pedestrian",
  };
  const res = await fetch(VALHALLA_MATRIX_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Routing failed: HTTP ${res.status}`);
  const data = await res.json();
  return data.sources_to_targets[0].map((entry) => ({
    seconds: entry.time,
    km: entry.distance,
  }));
}
