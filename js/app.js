import { fetchPools } from "./pools.js";
import { generateDummyPools } from "./dummyPools.js";
import { getOpenStatus, getTodaySlots, findCoveringSlot, getRemainingSlotsToday, formatSlotShort } from "./hours.js";

const STATUS_RANK = { open: 0, unknown: 1, closed: 2 };

// Decoupled from the real API for now so every card state (open/closed/
// unknown, single/multiple slots, etc.) is visible regardless of the
// real clock. Flip to false to go back to fetchPools() — that logic
// is untouched, just not the current data source.
const USE_DUMMY_DATA = true;

const ARROW_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
// Simple pictogram in DSFR's line-icon style (thin stroke, currentColor).
const WALK_ICON_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="4" r="1.6" fill="currentColor" stroke="none"/><path d="M10.5 22l1.3-6-1.8-1.5.4-4.5 2.8-1.3 2 2.6h2.8M9.2 15l-2.7 1.8M15.3 13.2l2.7 1.8 1.3 4"/></svg>';

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
    // Arrival = departure ("now") + walk time, so the day-bar's dash
    // (trip) and track (rest of the day) share one consistent scale.
    const arrivalTime = pool.walkMinutes != null ? new Date(now.getTime() + pool.walkMinutes * 60000) : now;
    const daySlots = getTodaySlots(pool, arrivalTime);
    const arrivalMinutes = arrivalTime.getHours() * 60 + arrivalTime.getMinutes();
    return {
      ...pool,
      departureTime: now,
      arrivalTime,
      openStatus: getOpenStatus(pool, arrivalTime),
      coveringSlot: findCoveringSlot(daySlots, arrivalMinutes),
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
  const overlay = document.createElement("span");
  overlay.className = "pool-photo-overlay";
  wrap.appendChild(overlay);
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
  name.title = pool.name;
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

// walk icon + dash (trip) + track (rest of the day). Dash and track
// together always span the same total on every card — "now" to
// midnight — so a card's trip and remaining day are always shown to
// scale against each other and against every other card.
function renderDayBar(pool) {
  const row = document.createElement("div");
  row.className = "day-bar-row";

  const icon = document.createElement("span");
  icon.className = "day-bar-icon";
  icon.innerHTML = WALK_ICON_SVG;
  icon.setAttribute("aria-hidden", "true");
  row.appendChild(icon);

  const dash = document.createElement("span");
  dash.className = "day-bar-dash";
  row.appendChild(dash);

  const track = document.createElement("span");
  track.className = "day-bar-track";
  row.appendChild(track);

  const dayEnd = 24 * 60;
  const departureMinutes = pool.departureTime.getHours() * 60 + pool.departureTime.getMinutes();
  const totalSpan = Math.max(dayEnd - departureMinutes, 1);
  // Clamped only for the visual split — if the walk itself runs past
  // midnight, the dash simply fills the whole bar and the track is empty.
  const walkMinutes = Math.min(pool.walkMinutes ?? 0, totalSpan);
  const dashFraction = walkMinutes / totalSpan;
  dash.style.flex = `${Math.max(dashFraction, 0.001)} 0 0`;
  track.style.flex = `${Math.max(1 - dashFraction, 0.001)} 0 0`;

  if (pool.openStatus === "unknown") {
    track.appendChild(daySegment(1, "unknown"));
    return row;
  }

  const arrivalMinutes = pool.arrivalTime.getHours() * 60 + pool.arrivalTime.getMinutes();
  const trackSpan = Math.max(dayEnd - arrivalMinutes, 1);
  const remaining = getRemainingSlotsToday(pool, pool.arrivalTime);

  let cursor = arrivalMinutes;
  remaining.forEach((slot) => {
    const start = Math.max(slot.startMinutes, arrivalMinutes);
    if (start > cursor) {
      track.appendChild(daySegment((start - cursor) / trackSpan, "closed"));
      cursor = start;
    }
    track.appendChild(daySegment((slot.endMinutes - cursor) / trackSpan, "open"));
    cursor = slot.endMinutes;
  });
  if (cursor < dayEnd) {
    track.appendChild(daySegment((dayEnd - cursor) / trackSpan, "closed"));
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

  // Interim: a paris.fr search link until pool pages are matched by ID
  // (names don't line up exactly with the lieux-municipaux dataset).
  const infoLink = document.createElement("a");
  infoLink.href = `https://www.paris.fr/recherche?q=${encodeURIComponent(pool.name)}`;
  infoLink.className = "pool-action-icon";
  infoLink.title = "Voir sur paris.fr";
  infoLink.setAttribute("aria-label", `${pool.name} sur paris.fr`);
  infoLink.innerHTML = ARROW_ICON_SVG;
  row.appendChild(infoLink);

  return row;
}
