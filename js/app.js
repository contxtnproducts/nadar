import { fetchPools } from "./pools.js";
import { geocode, reverseGeocode, searchAddresses } from "./geocode.js";
import { crowFliesKm } from "./distance.js";
import { saveLocation, loadLocation, clearLocation } from "./storage.js";
import { getOpenStatus, getTodaySlots, formatSlot } from "./hours.js";
import { getWalkingDurations } from "./routing.js";

const STATUS_RANK = { open: 0, unknown: 1, closed: 2 };

const REMEMBERED_ROLES = ["home", "work"];
const AUTOCOMPLETE_MIN_LENGTH = 3;
const AUTOCOMPLETE_DEBOUNCE_MS = 300;

let pools = [];
let currentLocation = null; // { lat, lon, label }
let currentRole = null; // 'here' | 'home' | 'work' | 'elsewhere' | null
let pendingRole = null; // role the open address form submission is for
let whenMode = "now"; // 'now' | 'later'
let walkingByPoolId = {}; // pool.id -> { seconds, km } | absent while loading/unavailable
let addressSuggestions = new Map(); // label -> { lat, lon, label }
let autocompleteTimer = null;

const poolListEl = document.getElementById("pool-list");
const poolStatusEl = document.getElementById("pool-status");
const locationStatusEl = document.getElementById("location-status");
const routingStatusEl = document.getElementById("routing-status");
const changeLocationBtn = document.getElementById("change-location-btn");
const addressForm = document.getElementById("address-form");
const addressInput = document.getElementById("address-input");
const addressSuggestionsEl = document.getElementById("address-suggestions");
const whereOptions = document.getElementById("where-options");
const whenOptions = document.getElementById("when-options");
const departureTimeInput = document.getElementById("departure-time-input");

init();

async function init() {
  whereOptions.addEventListener("click", onWhereClick);
  addressForm.addEventListener("submit", onAddressSubmit);
  addressInput.addEventListener("input", onAddressInput);
  changeLocationBtn.addEventListener("click", onChangeLocation);
  whenOptions.addEventListener("click", onWhenClick);
  departureTimeInput.addEventListener("change", renderPools);

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
  setActiveButton(whereOptions, btn);

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

function onWhenClick(event) {
  const btn = event.target.closest("button[data-when]");
  if (!btn) return;
  setActiveButton(whenOptions, btn);

  whenMode = btn.dataset.when;
  if (whenMode === "now") {
    departureTimeInput.hidden = true;
  } else {
    departureTimeInput.hidden = false;
    if (!departureTimeInput.value) {
      departureTimeInput.value = toLocalDatetimeValue(new Date());
    }
  }
  renderPools();
}

function setActiveButton(group, activeBtn) {
  [...group.querySelectorAll("button[aria-pressed]")].forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn === activeBtn));
  });
}

function toLocalDatetimeValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getEffectiveDepartureTime() {
  if (whenMode === "now") return new Date();
  const value = departureTimeInput.value;
  return value ? new Date(value) : new Date();
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

function onAddressInput() {
  clearTimeout(autocompleteTimer);
  const query = addressInput.value.trim();
  if (query.length < AUTOCOMPLETE_MIN_LENGTH) {
    addressSuggestionsEl.innerHTML = "";
    return;
  }
  autocompleteTimer = setTimeout(async () => {
    try {
      const results = await searchAddresses(query, 5);
      addressSuggestions = new Map(results.map((r) => [r.label, r]));
      addressSuggestionsEl.innerHTML = "";
      results.forEach((r) => {
        const option = document.createElement("option");
        option.value = r.label;
        addressSuggestionsEl.appendChild(option);
      });
    } catch (err) {
      // autocomplete is a nicety — a failed suggestion fetch shouldn't block manual submit
    }
  }, AUTOCOMPLETE_DEBOUNCE_MS);
}

async function onAddressSubmit(event) {
  event.preventDefault();
  const query = addressInput.value.trim();
  if (!query) return;

  locationStatusEl.textContent = "Recherche de l'adresse…";
  try {
    const result = addressSuggestions.get(query) || (await geocode(query));
    if (!result) {
      locationStatusEl.textContent = `Adresse introuvable : "${query}". Merci de préciser.`;
      return;
    }
    if (REMEMBERED_ROLES.includes(pendingRole)) {
      await saveLocation(pendingRole, result);
    }
    addressForm.hidden = true;
    addressInput.value = "";
    addressSuggestionsEl.innerHTML = "";
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
  walkingByPoolId = {};
  routingStatusEl.hidden = true;
  renderPools(); // fast render on crow-flies distance while walking times load
  updateWalkingTimes(location);
}

async function updateWalkingTimes(location) {
  const withCoords = pools.filter((p) => p.lat != null && p.lon != null);
  if (withCoords.length === 0) return;
  try {
    const durations = await getWalkingDurations(location, withCoords);
    const byId = {};
    withCoords.forEach((pool, i) => {
      byId[pool.id] = durations[i];
    });
    // Stale if the location changed while this request was in flight.
    if (currentLocation === location) {
      walkingByPoolId = byId;
      routingStatusEl.hidden = true;
      renderPools();
    }
  } catch (err) {
    if (currentLocation === location) {
      routingStatusEl.hidden = false;
      routingStatusEl.textContent =
        "Temps de trajet à pied indisponible pour le moment — tri par distance à vol d'oiseau.";
    }
  }
}

function renderPools() {
  const sorted = currentLocation ? sortByProximity(pools, currentLocation) : sortByName(pools);

  const departureTime = getEffectiveDepartureTime();
  const isNow = whenMode === "now";
  const withStatus = sorted.map((pool) => ({
    ...pool,
    openStatus: getOpenStatus(pool, departureTime),
    todaySlots: getTodaySlots(pool, departureTime),
  }));
  // Stable sort: groups by status (open first) while preserving the
  // distance/name order already established within each group.
  withStatus.sort((a, b) => STATUS_RANK[a.openStatus] - STATUS_RANK[b.openStatus]);

  poolListEl.innerHTML = "";
  withStatus.forEach((pool) => {
    poolListEl.appendChild(renderPoolItem(pool, departureTime, isNow));
  });
}

function sortByName(list) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

function sortByProximity(list, location) {
  const withMetrics = list.map((pool) => {
    const walking = walkingByPoolId[pool.id];
    const distanceKm =
      pool.lat != null && pool.lon != null ? crowFliesKm(location.lat, location.lon, pool.lat, pool.lon) : null;
    return {
      ...pool,
      distanceKm,
      walkSeconds: walking ? walking.seconds : null,
      walkKm: walking ? walking.km : null,
    };
  });

  const hasWalkingData = withMetrics.some((p) => p.walkSeconds != null);

  return withMetrics.sort((a, b) => {
    if (hasWalkingData) {
      if (a.walkSeconds == null && b.walkSeconds == null) return a.name.localeCompare(b.name);
      if (a.walkSeconds == null) return 1;
      if (b.walkSeconds == null) return -1;
      return a.walkSeconds - b.walkSeconds;
    }
    if (a.distanceKm == null && b.distanceKm == null) return a.name.localeCompare(b.name);
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });
}

function formatDayLabel(date) {
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const pad = (n) => String(n).padStart(2, "0");
  return `${days[date.getDay()]} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

function statusLabel(status, isNow) {
  if (status === "open") return isNow ? "Ouvert maintenant" : "Ouvert à cette heure";
  if (status === "closed") return "Fermé";
  return "Horaires non confirmées";
}

function renderPoolItem(pool, departureTime, isNow) {
  const li = document.createElement("li");
  li.className = `pool pool-${pool.openStatus}`;

  const header = document.createElement("div");
  header.className = "pool-header";

  const name = document.createElement("strong");
  name.textContent = pool.name;
  header.appendChild(name);

  const badge = document.createElement("span");
  badge.className = "status-badge";
  badge.textContent = statusLabel(pool.openStatus, isNow);
  header.appendChild(badge);

  li.appendChild(header);

  const meta = document.createElement("div");
  meta.className = "pool-meta";
  meta.textContent = `${formatProximity(pool)}${pool.address}, ${pool.arrondissement}`;
  li.appendChild(meta);

  const hours = document.createElement("div");
  hours.className = "pool-hours";
  const dayLabel = formatDayLabel(departureTime);
  hours.textContent =
    pool.todaySlots.length > 0
      ? `${dayLabel} : ${pool.todaySlots.map(formatSlot).join(" / ")}`
      : `Fermé ${dayLabel === "Aujourd'hui" ? "aujourd'hui" : dayLabel}`;
  li.appendChild(hours);

  return li;
}

function formatProximity(pool) {
  if (pool.walkSeconds != null) {
    const minutes = Math.round(pool.walkSeconds / 60);
    return `${minutes} min à pied (${pool.walkKm.toFixed(1)} km) — `;
  }
  if (pool.distanceKm != null && currentLocation) {
    return `${pool.distanceKm.toFixed(1)} km à vol d'oiseau — `;
  }
  return "";
}
