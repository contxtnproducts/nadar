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

// Each case exercises one distinct rendering branch in app.js, so all
// possible card states are always visible regardless of the real clock.
function buildCases(now) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayKey = DAY_KEYS[now.getDay()];
  const coveringPeriod = periodCoveringToday(now);

  return [
    {
      name: "Piscine Démo — ouverte, large créneau",
      todaySlot: slotString([nowMin - 30, nowMin + 180]),
      period: coveringPeriod,
    },
    {
      name: "Piscine Démo — ferme bientôt",
      todaySlot: slotString([nowMin - 60, nowMin + 6]),
      period: coveringPeriod,
    },
    {
      name: "Piscine Démo — rouvre plus tard",
      todaySlot: slotString([nowMin + 60, nowMin + 180]),
      period: coveringPeriod,
    },
    {
      name: "Piscine Démo — fermée pour la journée",
      todaySlot: slotString([nowMin - 240, nowMin - 30]),
      period: coveringPeriod,
    },
    {
      name: "Piscine Démo — horaires non confirmées",
      todaySlot: slotString([nowMin - 30, nowMin + 120]),
      period: periodNotCoveringToday(),
    },
    {
      name: "Piscine Démo — plusieurs créneaux",
      todaySlot: slotString([nowMin + 15, nowMin + 45], [nowMin + 90, nowMin + 150]),
      period: coveringPeriod,
    },
    {
      name: "Piscine Démo — ouverte tard",
      todaySlot: slotString([nowMin - 400, 1380]),
      period: coveringPeriod,
    },
    {
      name: "Piscine Démo — aucun horaire aujourd'hui",
      todaySlot: null,
      period: coveringPeriod,
    },
  ];
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
      horaires,
    };
  });
}
