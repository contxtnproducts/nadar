# CLAUDE.md — Nadar

## What this is
Nadar helps Parisians find a municipal pool for an impromptu swim. The three scenarios it must answer:
1. Where can I swim **now** for 1h, from my current location?
2. Where can I swim **after work** for 2h, leaving place X at time T?
3. Where can I swim **50m laps**?

This is also a learning project: the owner (Thomas) wants to understand decisions, not just receive code. Explain trade-offs when they matter.

## Architecture (decided, do not revisit without asking)
- **No-build static site**: `index.html` + vanilla JS files, served directly from `main` via GitHub Pages. No bundler, no framework, no CI.
- **UI**: DSFR (Système de Design de l'État) loaded via CDN. Respect its 8px grid and color tokens.
- **Data**: fetched live in the browser from the Paris Open Data Explore API v2.1, dataset `ilots-de-fraicheur-equipements-activites`, filtered on pools. Hours are synced daily by the city from paris.fr — no local data pipeline needed.
- **Geocoding** (manual address entry): api-adresse.data.gouv.fr (BAN), no API key.
- **Storage**: home/work locations are device-only. Use `localStorage` behind a small adapter (`saveLocation()/loadLocation()`), so code also runs in Claude artifacts (`window.storage`) via feature detection.
- **Privacy**: nothing leaves the browser except open-data API calls. Never add analytics or send positions anywhere.

## v1 matching rule (the core logic)
A pool qualifies if a public opening slot fully covers `[arrival, arrival + duration]`:
- `duration` = user's total time on site, changing included (this absorbs the ~30min basin evacuation before closing — do NOT add a separate buffer in v1).
- `arrival` = departure time (v1 ignores travel time).
- Sorting: crow-flies distance when a position is known, displayed honestly (e.g. "1.2 km"); alphabetical by name otherwise.

## Filters (v1 spec)
- When: now / later today / another day at time T (= departure time).
- Where: here (geolocation, with manual address/arrondissement fallback), work (remembered), home (remembered), somewhere else.
- Default view: all pools, sorted by name.
- Pool card: name, photo, and the timetable slots surrounding the chosen time.

## Known data caveats (verify before building on them)
- Hours in the dataset appear **period-based** (`horaires_periode`: school term vs holidays) and possibly semi-structured text. Parseability was NOT yet verified — the data spike must happen before filter logic is written.
- CORS from a third-party origin: expected to work, not yet verified.
- **Not in the dataset** (needs a small hand-curated attribute layer): basin length (50m filter), photos.

## Roadmap
- v1: crow-flies distance, fixed 30min buffer assumption, curated 50m attribute.
- v2: real transit travel time (routing API), refined closing buffers.

## Workflow rules
- Data spike → functional build → DSFR/Figma polish. In that order.
- The old 15-pool hardcoded prototype is visual reference only; do not reuse its data model.
- When Thomas says "take note", write a dated journal entry (context, decisions, learnings) to the Notion teamspace **Nadar** → page **Journal**, as a new sub-page titled `YYYY-MM-DD — <topic>`. Requires the Notion MCP; if unavailable, write the entry to `journal/YYYY-MM-DD.md` in the repo instead and say so.
- Attribution: pool data is ODbL — keep the Ville de Paris / opendata.paris.fr attribution in the README and app footer.
