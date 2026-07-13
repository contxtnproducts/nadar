import { fetchPools } from "./pools.js";
import { generateDummyPools } from "./dummyPools.js";
import { getOpenStatus, getTodaySlots, findCoveringSlot, getRemainingSlotsToday, formatSlotShort } from "./hours.js";

const STATUS_RANK = { open: 0, unknown: 1, closed: 2 };

// Decoupled from the real API for now so every card state (open/closed/
// unknown, single/multiple slots, etc.) is visible regardless of the
// real clock. Flip to false to go back to fetchPools() — that logic
// is untouched, just not the current data source.
const USE_DUMMY_DATA = true;

const PIN_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>';
const ARROW_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

let pools = [];

const poolListEl = document.getElementById("pool-list");
const poolStatusEl = document.getElementById("pool-status");

init();

async function init() {
  try {
    pools = USE_DUMMY_DATA ? generateDummyPools() : await fetchPools();
    poolStatusEl.textContent = "";
    renderPools();
  } catch (err) {
    poolStatusEl.textContent = "Impossible de charger les piscines : " + err.message;
  }
}

function renderPools() {
  const now = new Date();
  const sorted = [...pools].sort((a, b) => a.name.localeCompare(b.name));

  const withStatus = sorted.map((pool) => {
    const daySlots = getTodaySlots(pool, now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return {
      ...pool,
      arrivalTime: now,
      openStatus: getOpenStatus(pool, now),
      coveringSlot: findCoveringSlot(daySlots, nowMinutes),
    };
  });
  withStatus.sort((a, b) => STATUS_RANK[a.openStatus] - STATUS_RANK[b.openStatus]);

  poolListEl.innerHTML = "";
  withStatus.forEach((pool) => {
    poolListEl.appendChild(renderPoolItem(pool));
  });
}

function formatClockColon(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function statusBadgeLabel(status) {
  if (status === "open") return "OUVERTE";
  if (status === "closed") return "FERMÉE";
  return "HORAIRES ?";
}

// "Arr. à 07:45, 15mn de nage"
function formatArrivalLine(pool) {
  const arrivalStr = formatClockColon(pool.arrivalTime);
  if (pool.openStatus === "unknown") return `Arr. à ${arrivalStr}, horaires non confirmées`;
  if (pool.coveringSlot) {
    const nowMinutes = pool.arrivalTime.getHours() * 60 + pool.arrivalTime.getMinutes();
    const swimMinutes = pool.coveringSlot.endMinutes - nowMinutes;
    return `Arr. à ${arrivalStr}, ${swimMinutes}mn de nage`;
  }
  return `Arr. à ${arrivalStr}, fermé à cette heure`;
}

// "6:45-7:45, 13:30-14:45"
function formatRemainingSlotsLine(pool) {
  if (pool.openStatus === "unknown") return "Horaires non confirmées pour aujourd'hui";
  const remaining = getRemainingSlotsToday(pool, pool.arrivalTime);
  if (remaining.length === 0) return "Fermé le reste de la journée";
  return remaining.map(formatSlotShort).join(", ");
}

function renderPoolItem(pool) {
  const li = document.createElement("li");
  li.className = "pool";

  li.appendChild(renderPhoto(pool));
  li.appendChild(renderContent(pool));

  return li;
}

function renderPhoto(pool) {
  const wrap = document.createElement("div");
  wrap.className = "pool-photo";
  if (pool.photoUrl) {
    wrap.style.backgroundImage = `url("${pool.photoUrl}")`;
  }
  const badge = document.createElement("span");
  badge.className = "pool-badge";
  badge.textContent = statusBadgeLabel(pool.openStatus);
  wrap.appendChild(badge);
  return wrap;
}

function renderContent(pool) {
  const content = document.createElement("div");
  content.className = "pool-content";

  const body = document.createElement("div");
  body.className = "pool-body";

  const name = document.createElement("p");
  name.className = "pool-name";
  name.textContent = pool.name;
  body.appendChild(name);

  const arrLine = document.createElement("p");
  arrLine.className = "pool-arrival";
  arrLine.textContent = formatArrivalLine(pool);
  body.appendChild(arrLine);

  const slotsLine = document.createElement("p");
  slotsLine.className = "pool-slots";
  slotsLine.textContent = formatRemainingSlotsLine(pool);
  body.appendChild(slotsLine);

  body.appendChild(renderDayBar(pool));

  content.appendChild(body);
  content.appendChild(renderActionRow(pool));

  return content;
}

// bike icon + dash + day open/closed segments
function renderDayBar(pool) {
  const row = document.createElement("div");
  row.className = "day-bar-row";

  const icon = document.createElement("span");
  icon.className = "day-bar-icon";
  icon.textContent = "🚶";
  icon.setAttribute("aria-hidden", "true");
  row.appendChild(icon);

  const dash = document.createElement("span");
  dash.className = "day-bar-dash";
  row.appendChild(dash);

  const track = document.createElement("span");
  track.className = "day-bar-track";
  row.appendChild(track);

  if (pool.openStatus === "unknown") {
    track.appendChild(daySegment(1, "unknown"));
    return row;
  }

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

  return row;
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
