# Nadar 🏊

**Find a Paris municipal pool you can actually swim in — now, after work, or for 50m laps.**

Paris pool timetables are famously funky: hours change between school terms and holidays, lanes close for clubs, and basins are evacuated 30 minutes before closing. Nadar answers three simple questions the official site makes hard:

- Where can I swim **now** for 1 hour, from where I'm standing?
- Where can I swim **after work** for 2 hours, leaving the office at 18h30?
- Where can I swim **50m laps**?

## How it works

A fully static, client-side web app — no backend, no build step.

- **Data**: fetched live in the browser from the [Paris Open Data Explore API](https://opendata.paris.fr/api/explore/v2.1/) (dataset: `ilots-de-fraicheur-equipements-activites`, filtered on pools). Opening hours are synced daily by the city from paris.fr, so the app is always current.
- **UI**: [DSFR](https://www.systeme-de-design.gouv.fr/) (Système de Design de l'État), loaded via CDN.
- **Geocoding**: [Base Adresse Nationale](https://adresse.data.gouv.fr/) for manual address entry.
- **Privacy**: home/work locations are stored on-device only (`localStorage`). Nothing leaves your browser except the open-data API calls.
- **Hosting**: GitHub Pages, served straight from `main`.

## v1 matching rule

A pool qualifies if a public opening slot covers `[arrival, arrival + duration]`, where duration is your total time on site (changing included — which also absorbs the 30-minute basin evacuation before closing). Distance shown is crow-flies; transit time is on the v2 roadmap.

## Status

🚧 Work in progress — currently in the data-validation phase.

## Data license & attribution

Pool data: **Ville de Paris**, via [opendata.paris.fr](https://opendata.paris.fr), published under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).

Source dataset: [Ilots de fraîcheur - Equipements / Activités](https://opendata.paris.fr/explore/dataset/ilots-de-fraicheur-equipements-activites/).
