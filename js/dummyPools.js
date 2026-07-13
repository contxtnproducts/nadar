import { formatMinutes } from "./hours.js";

// Real, freely-licensed photos of public swimming pools (Wikimedia
// Commons), used only until Nadar has a real photo source per pool.
const PHOTO_URLS = [
  "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Kirkcudbright_Swimming_Pool_-_geograph.org.uk_-_3873995.jpg/960px-Kirkcudbright_Swimming_Pool_-_geograph.org.uk_-_3873995.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Public_Swimming_Pool_in_Melbourne_VIC_Australia.jpg/960px-Public_Swimming_Pool_in_Melbourne_VIC_Australia.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Swimming_pool%2C_Maikammer_%28P1180480%29.jpg/960px-Swimming_pool%2C_Maikammer_%28P1180480%29.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Swimming_pool_01653.JPG/960px-Swimming_pool_01653.JPG",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/An_swimming_pool.jpg/960px-An_swimming_pool.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Elektrostal._Pool_%C2%ABKristall%C2%BB_-_school_of_the_Olympic_reserve._img-02.jpg/960px-Elektrostal._Pool_%C2%ABKristall%C2%BB_-_school_of_the_Olympic_reserve._img-02.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Elektrostal._Pool_%C2%ABKristall%C2%BB_-_school_of_the_Olympic_reserve._img-06.jpg/960px-Elektrostal._Pool_%C2%ABKristall%C2%BB_-_school_of_the_Olympic_reserve._img-06.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Swimming_Pool_Covering.jpeg/960px-Swimming_Pool_Covering.jpeg",
];

const ARRONDISSEMENTS = ["75001", "75004", "75005", "75010", "75011", "75013", "75015", "75018", "75019", "75020"];
const DAY_KEYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function pad(n) {
  return String(n).padStart(2, "0");
}

function periodCoveringToday(now) {
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  const end = new Date(now);
  end.setDate(end.getDate() + 30);
  const fmt = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
  return `du ${fmt(start)} au ${fmt(end)}`;
}

function periodNotCoveringToday() {
  return "du 01/01/20 au 01/02/20";
}

function clamp(minutes) {
  return Math.max(0, Math.min(1439, Math.round(minutes)));
}

function slotString(...ranges) {
  return ranges.map(([s, e]) => `${formatMinutes(clamp(s))} - ${formatMinutes(clamp(e))}`).join(" / ");
}

function randomAddress() {
  const streets = ["rue de la Piscine", "avenue des Nageurs", "quai des Baigneurs", "rue du Bassin", "boulevard Aquatique"];
  const num = 1 + Math.floor(Math.random() * 150);
  return `${num} ${streets[Math.floor(Math.random() * streets.length)]}`;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Each case exercises one distinct rendering branch in app.js. Slots are
// anchored to that case's own arrival (now + walkMinutes), not raw "now"
// — app.js computes status/slots from arrival, so anchoring on "now"
// would silently misalign a case once its walk time is added (e.g. a
// "closing soon" case could arrive after closing and just look closed).
// walkMinutes is fixed per case (not randomized) so the set is legible
// and reproducible: dash length increases case over case.
function buildCases(now) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const coveringPeriod = periodCoveringToday(now);

  const specs = [
    { name: "Piscine Démo — ouverte, large créneau", walkMinutes: 5, slot: (a) => slotString([a - 30, a + 180]) },
    { name: "Piscine Démo — ferme bientôt", walkMinutes: 10, slot: (a) => slotString([a - 60, a + 6]) },
    { name: "Piscine Démo — rouvre plus tard", walkMinutes: 15, slot: (a) => slotString([a + 60, a + 180]) },
    { name: "Piscine Démo — fermée pour la journée", walkMinutes: 20, slot: (a) => slotString([a - 240, a - 30]) },
    {
      name: "Piscine Démo — horaires non confirmées",
      walkMinutes: 25,
      slot: (a) => slotString([a - 30, a + 120]),
      period: periodNotCoveringToday(),
    },
    {
      name: "Piscine Démo — plusieurs créneaux",
      walkMinutes: 30,
      slot: (a) => slotString([a + 15, a + 45], [a + 90, a + 150]),
    },
    { name: "Piscine Démo — ouverte tard", walkMinutes: 40, slot: (a) => slotString([a - 400, 1380]) },
    { name: "Piscine Démo — aucun horaire aujourd'hui", walkMinutes: 50, slot: null },
  ];

  return specs.map((s) => {
    const arrivalMin = nowMin + s.walkMinutes;
    return {
      name: s.name,
      walkMinutes: s.walkMinutes,
      todaySlot: s.slot ? s.slot(arrivalMin) : null,
      period: s.period || coveringPeriod,
    };
  });
}

export function generateDummyPools(now = new Date()) {
  const cases = buildCases(now);
  const photos = shuffle(PHOTO_URLS);
  const todayKey = DAY_KEYS[now.getDay()];

  return cases.map((c, i) => {
    const horaires = {
      periode: c.period,
      dimanche: null,
      lundi: null,
      mardi: null,
      mercredi: null,
      jeudi: null,
      vendredi: null,
      samedi: null,
    };
    horaires[todayKey] = c.todaySlot;

    return {
      id: `dummy-${i}`,
      name: c.name,
      address: randomAddress(),
      arrondissement: ARRONDISSEMENTS[Math.floor(Math.random() * ARRONDISSEMENTS.length)],
      lat: 48.85 + (Math.random() - 0.5) * 0.08,
      lon: 2.35 + (Math.random() - 0.5) * 0.1,
      photoUrl: photos[i % photos.length],
      walkMinutes: c.walkMinutes,
      horaires,
    };
  });
}
