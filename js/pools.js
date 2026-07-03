const POOLS_API_URL =
  "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/" +
  "ilots-de-fraicheur-equipements-activites/records" +
  '?where=type%3D%22Piscine%22&limit=100';

export async function fetchPools() {
  const res = await fetch(POOLS_API_URL);
  if (!res.ok) throw new Error(`Pools fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  return data.results.map((r) => ({
    id: r.identifiant,
    name: r.nom,
    address: r.adresse,
    arrondissement: r.arrondissement,
    lat: r.geo_point_2d ? r.geo_point_2d.lat : null,
    lon: r.geo_point_2d ? r.geo_point_2d.lon : null,
  }));
}
