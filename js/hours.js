const DAY_KEY_BY_INDEX = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

// Only well-formed "HHhMM - HHhMM" pairs match — a dangling truncated
// trailing fragment (the dataset caps horaires_* at 50 chars) has no
// closing time, so it never matches and is silently dropped.
const SLOT_RE = /(\d{2})h(\d{2})\s*-\s*(\d{2})h(\d{2})/g;

function parseSlots(rawDayValue) {
  if (!rawDayValue) return [];
  const slots = [];
  let match;
  SLOT_RE.lastIndex = 0;
  while ((match = SLOT_RE.exec(rawDayValue)) !== null) {
    const [, startHour, startMinute, endHour, endMinute] = match;
    slots.push({
      startMinutes: Number(startHour) * 60 + Number(startMinute),
      endMinutes: Number(endHour) * 60 + Number(endMinute),
    });
  }
  return slots;
}

function parsePeriod(rawPeriode) {
  if (!rawPeriode) return null;

  let m = rawPeriode.match(/du (\d{2})\/(\d{2})\/(\d{2}) au (\d{2})\/(\d{2})\/(\d{2})/);
  if (m) {
    const [, d1, m1, y1, d2, m2, y2] = m;
    return {
      start: new Date(2000 + Number(y1), Number(m1) - 1, Number(d1)),
      end: new Date(2000 + Number(y2), Number(m2) - 1, Number(d2), 23, 59, 59),
    };
  }

  m = rawPeriode.match(/à partir du (\d{2})\/(\d{2})\/(\d{2})/);
  if (m) {
    const [, d1, m1, y1] = m;
    return { start: new Date(2000 + Number(y1), Number(m1) - 1, Number(d1)), end: null };
  }

  return null;
}

// Returns "open", "closed", or "unknown" (period doesn't cover `now`,
// or is unparseable — parked decision: don't guess, say so honestly).
export function getOpenStatus(pool, now = new Date()) {
  const period = parsePeriod(pool.horaires.periode);
  if (!period || now < period.start || (period.end && now > period.end)) {
    return "unknown";
  }

  const slots = getTodaySlots(pool, now);
  if (slots.length === 0) return "closed";

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return findCoveringSlot(slots, nowMinutes) ? "open" : "closed";
}

export function getTodaySlots(pool, now = new Date()) {
  const dayKey = DAY_KEY_BY_INDEX[now.getDay()];
  return parseSlots(pool.horaires[dayKey]);
}

// The one slot a given minute-of-day actually falls inside, if any —
// "current slot" in the opening-hours sense, not an API/data-field sense.
export function findCoveringSlot(slots, minutesOfDay) {
  return slots.find((slot) => minutesOfDay >= slot.startMinutes && minutesOfDay < slot.endMinutes) || null;
}

// All of today's slots that haven't fully ended yet — the "big picture"
// of today's remaining openings, not just the one covering `now`.
export function getRemainingSlotsToday(pool, now = new Date()) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return getTodaySlots(pool, now).filter((slot) => slot.endMinutes > nowMinutes);
}

// "6:45-7:45" — no leading zero on the hour, matching the design's
// terser in-card format (formatSlot's "06h45 - 07h45" is used elsewhere).
export function formatSlotShort(slot) {
  const short = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  return `${short(slot.startMinutes)}-${short(slot.endMinutes)}`;
}

export function formatSlot(slot) {
  return `${formatMinutes(slot.startMinutes)} - ${formatMinutes(slot.endMinutes)}`;
}

export function formatMinutes(totalMinutes) {
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const m = String(totalMinutes % 60).padStart(2, "0");
  return `${h}h${m}`;
}
