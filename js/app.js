import { fetchPools } from "./pools.js";
import { geocode, reverseGeocode } from "./geocode.js";
import { crowFliesKm } from "./distance.js";
import { saveLocation, loadLocation, clearLocation } from "./storage.js";
import { getOpenStatus } from "./hours.js";

const STATUS_RANK = { open: 0, unknown: 1, closed: 2 };
const STATUS_LABEL = { open: "Ouvert maintenant", closed: "Fermé", unknown: "Horaires non confirmées" };

const REMEMBERED_ROLES = ["home", "work"];

let pools = [];
let currentLocation = null; // { lat, lon, label }
let currentRole = null; // 'here' | 'home' | 'work' | 'elsewhere' | null
let pendingRole = null; // role the open address form submission is for

const poolListEl = document.getElementById("pool-list");
const poolStatusEl = document.getElementById("pool-status");
const locationStatusEl = document.getElementById("location-status");
const changeLocationBtn = document.getElementById("change-location-btn");
const addressForm = document.getElementById("address-form");
const addressInput = document.getElementById("address-input");
const whereOptions = document.getElementById("where-options");

init();

async function init() {
  whereOptions.addEventListener("click", onWhereClick);
  addressForm.addEventListener("submit", onAddressSubmit);
  changeLocationBtn.addEventListener("click", onChangeLocation);

  try {
    pools = await fetchPools();
    poolStatusEl.textContent = `${pools.length} piscines trouvées.`;
    renderPools();
  } catch (err) {
    poolStatusEl.textContent = "Impossible de charger les piscines : " + err.message;
  }
}

async function onWhereClick(event) {
  const btn = event.target.closest("button[data-role]");
  if (!btn) return;
  setActiveButton(btn);

  const role = btn.dataset.role;

  if (role === "here") {
    useGeolocation();
    return;
  }

  if (role === "elsewhere") {
    promptForAddress("elsewhere");
    return;
  }

  // home / work
  const saved = await loadLocation(role);
  if (saved) {
    setLocation(role, saved);
  } else {
    promptForAddress(role);
  }
}

function setActiveButton(activeBtn) {
  [...whereOptions.querySelectorAll("button[data-role]")].forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn === activeBtn));
  });
}

function useGeolocation() {
  if (!navigator.geolocation) {
    locationStatusEl.textContent = "Géolocalisation non disponible sur cet appareil — merci de saisir une adresse.";
    promptForAddress("elsewhere");
    return;
  }
  locationStatusEl.textContent = "Localisation en cours…";
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      let label = "Ma position (adresse inconnue)";
      try {
        const resolved = await reverseGeocode(lat, lon);
        if (resolved) label = resolved;
      } catch (err) {
        // keep the generic label — reverse geocoding failing shouldn't block using the position
      }
      setLocation("here", { lat, lon, label });
    },
    () => {
      locationStatusEl.textContent =
        "Géolocalisation refusée ou indisponible — merci de saisir une adresse ou un arrondissement.";
      promptForAddress("elsewhere");
    }
  );
}

function promptForAddress(role) {
  pendingRole = role;
  addressForm.hidden = false;
  addressInput.focus();
}

async function onAddressSubmit(event) {
  event.preventDefault();
  const query = addressInput.value.trim();
  if (!query) return;

  locationStatusEl.textContent = "Recherche de l'adresse…";
  try {
    const result = await geocode(query);
    if (!result) {
      locationStatusEl.textContent = `Adresse introuvable : "${query}". Merci de préciser.`;
      return;
    }
    if (REMEMBERED_ROLES.includes(pendingRole)) {
      await saveLocation(pendingRole, result);
    }
    addressForm.hidden = true;
    addressInput.value = "";
    setLocation(pendingRole, result);
  } catch (err) {
    locationStatusEl.textContent = "Erreur de géocodage : " + err.message;
  }
}

async function onChangeLocation() {
  if (REMEMBERED_ROLES.includes(currentRole)) {
    await clearLocation(currentRole);
  }
  promptForAddress(currentRole);
}

function setLocation(role, location) {
  currentRole = role;
  currentLocation = location;
  locationStatusEl.textContent = `Position : ${location.label}`;
  changeLocationBtn.hidden = !REMEMBERED_ROLES.includes(role);
  renderPools();
}

function renderPools() {
  const sorted = currentLocation ? sortByDistance(pools, currentLocation) : sortByName(pools);

  const now = new Date();
  const withStatus = sorted.map((pool) => ({ ...pool, openStatus: getOpenStatus(pool, now) }));
  // Stable sort: groups by status (open first) while preserving the
  // distance/name order already established within each group.
  withStatus.sort((a, b) => STATUS_RANK[a.openStatus] - STATUS_RANK[b.openStatus]);

  poolListEl.innerHTML = "";
  withStatus.forEach((pool) => {
    poolListEl.appendChild(renderPoolItem(pool));
  });
}

function sortByName(list) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

function sortByDistance(list, location) {
  return list
    .map((pool) => ({
      ...pool,
      distanceKm:
        pool.lat != null && pool.lon != null
          ? crowFliesKm(location.lat, location.lon, pool.lat, pool.lon)
          : null,
    }))
    .sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return a.name.localeCompare(b.name);
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
}

function renderPoolItem(pool) {
  const li = document.createElement("li");
  li.className = `pool pool-${pool.openStatus}`;

  const header = document.createElement("div");
  header.className = "pool-header";

  const name = document.createElement("strong");
  name.textContent = pool.name;
  header.appendChild(name);

  const badge = document.createElement("span");
  badge.className = "status-badge";
  badge.textContent = STATUS_LABEL[pool.openStatus];
  header.appendChild(badge);

  li.appendChild(header);

  const meta = document.createElement("div");
  meta.className = "pool-meta";
  const distanceText = pool.distanceKm != null ? `${pool.distanceKm.toFixed(1)} km — ` : "";
  meta.textContent = `${distanceText}${pool.address}, ${pool.arrondissement}`;
  li.appendChild(meta);

  return li;
}
