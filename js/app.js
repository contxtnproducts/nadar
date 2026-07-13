import { fetchPools } from "./pools.js";
import { geocode, reverseGeocode, searchAddresses } from "./geocode.js";
import { crowFliesKm } from "./distance.js";
import { saveLocation, loadLocation, clearLocation } from "./storage.js";
import { getOpenStatus, getTodaySlots, findCoveringSlot, getRemainingSlotsToday, formatSlotShort } from "./hours.js";
import { getWalkingDurations } from "./routing.js";

const STATUS_RANK = { open: 0, unknown: 1, closed: 2 };

const REMEMBERED_ROLES = ["home", "work"];
const SPECIFIC_ROLES = ["home", "work", "elsewhere"];
const AUTOCOMPLETE_MIN_LENGTH = 3;
const AUTOCOMPLETE_DEBOUNCE_MS = 300;
const TRAVEL_REFERENCE_MINUTES = 45; // walk time that fills the capped 1/3-width travel segment

const PIN_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>';
const ARROW_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

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
const locationModal = document.getElementById("location-modal");
const timeModal = document.getElementById("time-modal");
const whereSummary = document.getElementById("where-summary");
const whenSummary = document.getElementById("when-summary");

init();

async function init() {
  whereOptions.addEventListener("click", onWhereClick);
  addressForm.addEventListener("submit", onAddressSubmit);
  addressInput.addEventListener("input", onAddressInput);
  changeLocationBtn.addEventListener("click", onChangeLocation);
  whenOptions.addEventListener("click", onWhenClick);
  departureTimeInput.addEventListener("change", renderPools);
  whereSummary.addEventListener("click", () => locationModal.showModal());
  whenSummary.addEventListener("click", () => timeModal.showModal());

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

  if (role === "all") {
    currentRole = null;
    currentLocation = null;
    walkingByPoolId = {};
    routingStatusEl.hidden = true;
    changeLocationBtn.hidden = true;
    addressForm.hidden = true;
    locationStatusEl.textContent = "";
    updateWhereSummary();
    locationModal.close();
    renderPools();
    return;
  }

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
    updateWhenSummary();
    timeModal.close();
  } else {
    departureTimeInput.hidden = false;
    if (!departureTimeInput.value) {
      departureTimeInput.value = toLocalDatetimeValue(new Date());
    }
    updateWhenSummary();
  }
  renderPools();
}

function updateWhereSummary() {
  const kind = currentRole === "here" ? "here" : SPECIFIC_ROLES.includes(currentRole) ? "specific" : "all";
  [...whereSummary.querySelectorAll("button[data-summary-where]")].forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.summaryWhere === kind));
  });
}

function updateWhenSummary() {
  [...whenSummary.querySelectorAll("button[data-summary-when]")].forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.summaryWhen === whenMode));
  });
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
  updateWhereSummary();
  locationModal.close();
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
  const withStatus = sorted.map((pool) => {
    // Arrival = departure + actual walking time when known; falls back
    // to departure itself (v1's original assumption) when it isn't.
    const arrivalTime = pool.walkSeconds != null ? new Date(departureTime.getTime() + pool.walkSeconds * 1000) : departureTime;
    const daySlots = getTodaySlots(pool, arrivalTime);
    const arrivalMinutes = arrivalTime.getHours() * 60 + arrivalTime.getMinutes();
    return {
      ...pool,
      arrivalTime,
      openStatus: getOpenStatus(pool, arrivalTime),
      coveringSlot: findCoveringSlot(daySlots, arrivalMinutes),
    };
  });
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
  if (date.toDateString() === today.toDateString()) return null;
  const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const pad = (n) => String(n).padStart(2, "0");
  return `${days[date.getDay()]} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

function formatClockColon(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function statusBadgeLabel(status) {
  if (status === "open") return "OUVERTE";
  if (status === "closed") return "FERMÉE";
  return "HORAIRES ?";
}

// "Arr. à 07:45, 15mn de nage" — terse in-card format.
function formatArrivalLine(pool) {
  const dayLabel = formatDayLabel(pool.arrivalTime);
  const prefix = dayLabel ? `${dayLabel} — ` : "";
  const arrivalStr = formatClockColon(pool.arrivalTime);

  if (pool.coveringSlot) {
    const arrivalMinutes = pool.arrivalTime.getHours() * 60 + pool.arrivalTime.getMinutes();
    const swimMinutes = pool.coveringSlot.endMinutes - arrivalMinutes;
    return `${prefix}Arr. à ${arrivalStr}, ${swimMinutes}mn de nage`;
  }
  if (pool.openStatus === "unknown") return `${prefix}Arr. à ${arrivalStr}, horaires non confirmées`;
  return `${prefix}Arr. à ${arrivalStr}, fermé à cette heure`;
}

// "6:45-7:45, 13:30-14:45" — every opening left today, from now.
function formatRemainingSlotsLine(pool) {
  const remaining = getRemainingSlotsToday(pool, pool.arrivalTime);
  if (remaining.length === 0) return "Fermé le reste de la journée";
  return remaining.map(formatSlotShort).join(", ");
}

function formatProximity(pool) {
  if (pool.walkSeconds != null) {
    const minutes = Math.round(pool.walkSeconds / 60);
    return `${minutes} min à pied (${pool.walkKm.toFixed(1)} km)`;
  }
  if (pool.distanceKm != null && currentLocation) {
    return `${pool.distanceKm.toFixed(1)} km à vol d'oiseau`;
  }
  return null;
}

function renderPoolItem(pool) {
  const li = document.createElement("li");
  li.className = `pool pool-${pool.openStatus}`;

  li.appendChild(renderPhoto(pool));

  const content = document.createElement("div");
  content.className = "pool-content";

  const name = document.createElement("h3");
  name.className = "pool-name";
  name.textContent = pool.name;
  content.appendChild(name);

  const arrLine = document.createElement("p");
  arrLine.className = "pool-arrival";
  arrLine.textContent = formatArrivalLine(pool);
  content.appendChild(arrLine);

  const slotsLine = document.createElement("p");
  slotsLine.className = "pool-slots";
  slotsLine.textContent = formatRemainingSlotsLine(pool);
  content.appendChild(slotsLine);

  content.appendChild(renderDayBar(pool));

  const proximity = formatProximity(pool);
  if (proximity) {
    const proxLine = document.createElement("p");
    proxLine.className = "pool-proximity";
    proxLine.textContent = proximity;
    content.appendChild(proxLine);
  }

  content.appendChild(renderActionRow(pool));

  li.appendChild(content);
  return li;
}

function renderPhoto(pool) {
  const wrap = document.createElement("div");
  wrap.className = "pool-photo";
  const badge = document.createElement("span");
  badge.className = `pool-badge pool-badge-${pool.openStatus}`;
  badge.textContent = statusBadgeLabel(pool.openStatus);
  wrap.appendChild(badge);
  return wrap;
}

// Icon (mode of travel) + a dash capped at 1/3 width + the day's
// open/closed blocks from now to midnight — the "big picture" of today.
function renderDayBar(pool) {
  const wrap = document.createElement("div");
  wrap.className = "day-bar";

  if (pool.walkSeconds != null) {
    const icon = document.createElement("span");
    icon.className = "day-bar-icon";
    icon.textContent = "🚶";
    icon.setAttribute("aria-hidden", "true");
    wrap.appendChild(icon);

    const dash = document.createElement("span");
    dash.className = "day-bar-dash";
    const walkMinutes = pool.walkSeconds / 60;
    const travelFraction = Math.min(0.33, (walkMinutes / TRAVEL_REFERENCE_MINUTES) * 0.33);
    dash.style.flex = `0 0 ${(travelFraction * 100).toFixed(1)}%`;
    wrap.appendChild(dash);
  }

  const track = document.createElement("span");
  track.className = "day-bar-track";
  wrap.appendChild(track);

  const nowMinutes = pool.arrivalTime.getHours() * 60 + pool.arrivalTime.getMinutes();
  const dayEnd = 24 * 60;
  const span = Math.max(dayEnd - nowMinutes, 1);
  const remaining = getRemainingSlotsToday(pool, pool.arrivalTime);

  let cursor = nowMinutes;
  remaining.forEach((slot) => {
    const start = Math.max(slot.startMinutes, nowMinutes);
    if (start > cursor) {
      track.appendChild(daySegment((start - cursor) / span, "closed"));
      cursor = start;
    }
    track.appendChild(daySegment((slot.endMinutes - cursor) / span, "open"));
    cursor = slot.endMinutes;
  });
  if (cursor < dayEnd) {
    track.appendChild(daySegment((dayEnd - cursor) / span, "closed"));
  }

  return wrap;
}

function daySegment(fraction, kind) {
  const el = document.createElement("span");
  el.className = `day-segment day-segment-${kind}`;
  el.style.flex = `${Math.max(fraction, 0.001)} 0 0`;
  return el;
}

function renderActionRow(pool) {
  const row = document.createElement("div");
  row.className = "pool-actions";

  if (pool.lat != null && pool.lon != null) {
    const mapLink = document.createElement("a");
    mapLink.href = `https://www.google.com/maps/search/?api=1&query=${pool.lat},${pool.lon}`;
    mapLink.target = "_blank";
    mapLink.rel = "noopener";
    mapLink.className = "pool-action-icon";
    mapLink.title = "Voir sur Google Maps";
    mapLink.setAttribute("aria-label", `${pool.name} sur Google Maps`);
    mapLink.innerHTML = PIN_ICON_SVG;
    row.appendChild(mapLink);
  }

  // Interim: a paris.fr search link until pool pages are matched by ID
  // (names don't line up exactly with the lieux-municipaux dataset).
  const infoLink = document.createElement("a");
  infoLink.href = `https://www.paris.fr/recherche?q=${encodeURIComponent(pool.name)}`;
  infoLink.target = "_blank";
  infoLink.rel = "noopener";
  infoLink.className = "pool-action-icon";
  infoLink.title = "Voir sur paris.fr";
  infoLink.setAttribute("aria-label", `${pool.name} sur paris.fr`);
  infoLink.innerHTML = ARROW_ICON_SVG;
  row.appendChild(infoLink);

  return row;
}
