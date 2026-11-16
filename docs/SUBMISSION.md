# NASA Space Apps Challenge 2026: project submission

Ready-to-paste text for the team's Project page on spaceappschallenge.org, plus the compliance checklist from the Project Submission Guide (November 13, 2026).

Everything on the Project page and in linked materials must be in English. Text in `[BRACKETS]` must be completed by the team.

**Deadline:** click "Submit for Judging" before Sunday, November 15, 2026, 11:59 p.m. (Rosario local time). Saving is not submitting.

---

## 1. Project Name

```
LoTestigo
```

Suggested tagline: *The field's logbook, written by satellite.*

## 2. High-Level Project Summary

```
LoTestigo ("the witness lot") is a web app that turns NASA open data into a management logbook for a single farm field. A grower, or the agronomist who advises them, only has to draw the field boundary on a map. From that polygon the app shows what satellites observed: surface changes detected with NISAR L-band radar, greenness from MODIS, rainfall and soil moisture from NASA POWER, land cover since 2020, and the list of NISAR and HLS passes over the field.

It addresses the challenge by making NISAR change detection readable for a non-specialist: each detected event appears on a timeline with its date, uncertainty, sensor and a radar-versus-optical image comparison. In our test field in Casilda, Argentina, NISAR HH backscatter dropped 1.78 dB against the surrounding landscape between September 1 and 13, 2026, which the app logs as a sowing event.

It matters because small and mid-size soybean growers are increasingly asked to show how their grain was produced, and today the only tools available rely on what the grower types in. LoTestigo starts from what was observed from space and lets the grower confirm or correct it. Every value is labelled as verified (observed by a satellite), declared (entered by the grower) or estimated (regional or model value). It is a 48-hour proof of concept, not a certification, and detection has not been validated in the field.
```

## 3. Link to Project Demo

```
https://lotestigo.1mj0t4h.workers.dev/landing/demo-en-subs.mp4
```

Rules: at most 7 slides (title and intro slides included) or a video of 30 seconds or less. Exceeding either limit makes the project ineligible for Global Judging. Slides must be in English. A video may be spoken in Spanish only if it has English subtitles. The link must open without login, password or permission request. Content for both formats is in section 9.

## 4. Link to Final Project

```
https://github.com/Luciocos/NASA
```

Live app (no account needed for the example field): https://lotestigo.1mj0t4h.workers.dev/ejemplos

The repository must be public before submitting. See the checklist in section 10.

## 5. Detailed Project Description

```
WHAT IT DOES

LoTestigo keeps a per-field record of management events detected from space and builds a few practical tools on top of it:

- Field logbook: a timeline of events (sowing today; the data model also covers harvest, tillage, cover crop, flooding, burning and land-use change). Each event stores its date and uncertainty in days, the real sensor, its origin label and two evidence images.
- Radar versus optical: for each event, the NISAR false-color image (HH, HV, HH/HV ratio) next to the HLS natural-color image of the same area, side by side or with a slider.
- Live satellite view: for any polygon, including one the user has just drawn, the browser queries open NASA services and shows MODIS NDVI over time, rainfall and soil moisture from NASA POWER, MODIS land cover by year since 2020, and the latest NISAR and HLS passes from the Earthdata CMR catalog.
- Estimated carbon footprint: kg CO2e per tonne of grain, with a per-component breakdown and the origin of each input. Emission factors come from published sources and are stored with their citation.
- Practices score and simulator: a provisional, transparent score, and a what-if simulator for adding a cover crop. The simulator never stores anything.
- Fertilization: management zones from MODIS NDVI and a variable-rate nitrogen worksheet filled in by the grower.
- Gross margin: per hectare and per field, with the field area taken from the polygon.
- Watershed and flow: for the test field, the contributing watershed, a history of heavy-rain events since 2020 and a rainfall simulator.
- Territorial checks: indicative overlap of the field with public layers (distance to urban areas, native forest zoning).
- Field passport: a read-only public page the grower can share by link and print.

HOW IT WORKS

Radar and optical processing runs offline in Python scripts. NISAR L2 GCOV scenes (L-band, HH and HV, 20 m pixels, one pass every 12 days) are read only over a window around each field. For each date we compute the mean backscatter of the field in dB and subtract the median of the surrounding landscape, which separates what happened in the field from what happened to the whole area, such as rain. A change is logged as an event when it exceeds three standard deviations of the changes seen in reference fields and persists on the next pass. Dates where the whole landscape shifts are excluded: on October 7, 2026 all fields rose 3 to 6 dB at once and NASA POWER reports 46 mm of rain that day. HLS NDVI is used to interpret the event. The output is one JSON file per field plus small PNG evidence images, loaded into the database with a management command. The backend never processes satellite imagery during a request.

The live data path is separate: the browser calls NASA POWER, the ORNL DAAC MODIS web service, Earthdata CMR and GIBS directly, with no login. Nothing is interpolated: when a value is missing, the app says "No data" and why. Responses are cached on the device, and the app works offline through a service worker; a field drawn without signal is queued and uploaded when the connection returns.

BENEFITS

- Minimal effort: one polygon is enough to get a result. No spreadsheets.
- Works through clouds: L-band radar sees the soil surface regardless of cloud cover.
- Transparent: every value shows where it comes from and how confident it is.
- The data belongs to the grower: each field is private and is shared only through the passport link the owner creates.
- One advisor or cooperative can follow many fields from a single account.

WHAT WE HOPE TO ACHIEVE

We want a grower with 80 hectares to have a record of their field that they did not have to type, so they know where they stand before approaching markets and schemes where sustainability is a requirement. LoTestigo does not certify anything; it is the step before. Next steps are validating detection against field records from growers, detecting more event types, running the radar pipeline automatically for growers' own fields, extending the watershed model beyond the test field, and adding data from harvesters and field sensors.

LIMITATIONS

This is a 48-hour proof of concept. Detection accuracy has not been measured or validated in the field, and the detection threshold is a proposal by the team. The pipeline has detected a single event (sowing in the test field). Nine of the ten NISAR scenes used are provisional products. Emission factors are US averages and IPCC defaults, not local factors. Watershed and flow results are unvalidated simulations because there are no measured flows in the basin. The app interface is in English; the detailed guide to every screen and calculation in the repository (INFO.md) is in Spanish.

TOOLS

Backend: Python 3.13, Django 6.1, Django REST Framework, PostgreSQL 17, NumPy, Shapely, pyproj, PyYAML.
Frontend: Angular 22, TypeScript, Leaflet, a custom isometric canvas renderer, Angular service worker.
Satellite pipeline: Python with asf_search, h5py, rasterio, pystac-client, fsspec, aiohttp, Pillow, requests.
Infrastructure: Docker Compose, Cloudflare Workers, Railway, GitHub Actions.
Testing and quality: pytest, Vitest, ruff, ESLint, Prettier.
```

## 6. Use of Super Intelligence (SI)

The guide requires a description of how SI tools were used, a visible watermark on SI-generated images and videos, and an acknowledgment in descriptive text and metadata for SI-generated code and data. This answer is not shown to judges, but the indicators inside the project are.

```
Yes. We used Claude Code (Anthropic), a large-language-model coding assistant, to help write, refactor, test and document code across the backend, the frontend and the satellite pipeline, and to draft documentation, including this submission text. The team defined the idea, chose the challenge approach, selected the data sources, set the detection method and reviewed the generated code. SI-assisted code is acknowledged in the repository README ("Use of SI tools") and the assistant's project instructions are in CLAUDE.md.

[LIST ANY OTHER SI TOOL USED AND FOR WHAT: image generation for the logo or slides, video or voice generation, translation, etc. SI-GENERATED IMAGES AND VIDEOS MUST CARRY A VISIBLE WATERMARK.]

No satellite data, events, evidence images, emission factors or metrics were generated by SI. All of them come from the sources listed below.
```

## 7. NASA Data

```
- NISAR L2 GCOV (NASA/ISRO), L-band SAR, HH and HV, 20 m, via ASF DAAC and Earthdata. Descending track 111, frame 105, ten dates from 2026-06-21 to 2026-10-31. Used to detect surface changes and to produce the radar evidence images.
  https://nisar.jpl.nasa.gov/ and https://search.asf.alaska.edu/
- Harmonized Landsat and Sentinel-2 (HLS) v2.0, L30 and S30, 30 m, via LP DAAC. Used for NDVI to interpret radar changes and for the optical evidence images.
  https://lpdaac.usgs.gov/data/get-started-data/collection-overview/missions/harmonized-landsat-sentinel-2-hls-overview/
- MODIS MOD13Q1 v6.1 (NDVI, 250 m, 16-day) and MCD12Q1 v6.1 (land cover, 500 m, yearly), through the ORNL DAAC MODIS/VIIRS subsets web service, queried live per polygon.
  https://modis.ornl.gov/data/modis_webservice.html
- NASA POWER (MERRA-2 / GEOS-IT reanalysis): daily precipitation and soil wetness, queried live.
  https://power.larc.nasa.gov/
- NASA Earthdata Common Metadata Repository (CMR): catalog search for NISAR and HLS granules over the field.
  https://cmr.earthdata.nasa.gov/search/
- NASA GIBS: HLS Landsat imagery tiles used for the landing page background.
  https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api
- GPM IMERG V07 (daily and half-hourly, Final and Late), via GES DISC: rainfall events since 2020 for the watershed module.
  https://gpm.nasa.gov/data/imerg
- SMAP L3 Enhanced (SPL3SMP_E, 9 km), via NSIDC DAAC: antecedent soil moisture, shown as context in the watershed module.
  https://smap.jpl.nasa.gov/
- MODIS MOD16A2 / MOD16A2GF (evapotranspiration, 500 m, 8-day), via ORNL DAAC: context in the watershed module.
- NASA Earthdata Login, for authenticated access in the offline pipeline.
  https://urs.earthdata.nasa.gov/
```

## 8. Space Agency Partner Data and Other References

```
SPACE AGENCY PARTNER DATA
- ISRO (Indian Space Research Organisation): NISAR is a joint NASA-ISRO mission.
- ESA (European Space Agency) / Copernicus: Sentinel-2 L2A image of 2026-11-08, used as the backdrop to draw the example fields; Sentinel-2 data inside HLS S30; Copernicus DEM GLO-30, used for terrain in the watershed module (accessed through AWS Open Data).

OTHER DATA
- Esri World Imagery (Esri, Maxar, Earthstar Geographics): basemap for drawing fields.
- OpenStreetMap contributors (ODbL): street basemap, waterways, residential areas; Nominatim for place search.
- ISRIC SoilGrids 2.0: soil texture, 0-30 cm.
- Argentina, Ministry of Environment, IDE Ambiental: native forest zoning (OTBN) of Santa Fe province.
- Santa Fe provincial law 11.273: distances for the urban-proximity check.
- MAGyP (Argentina), "Informe de Margenes y Resultados", September 2026: reference yields for the Zona Nucleo Norte.
- Matba Rofex (A3 Mercados), Primary API through pyRofex: suggested soybean price.

EMISSION FACTORS AND METHODS
- IPCC, 2019 Refinement to the 2006 Guidelines, Vol. 4, Ch. 11, Table 11.1 (direct N2O from managed soils).
- US EPA, GHG Emission Factors Hub (January 2025), Tables 2 and 5; IPCC AR5 100-year GWPs.
- Field to Market, Fieldprint Platform Metric Methods 5.0: impact factors for fertilizers, crop protectants and seed.
- USDA NRCS, TR-55 and National Engineering Handbook Part 630 (chapters 10, 15, 16): SCS curve number, lag and unit hydrograph.
- Barnes, Lehman and Mulla (2014), Priority-Flood depression filling.
- Beven and Kirkby (1979), topographic wetness index.

SOFTWARE (open source)
- Django, Django REST Framework, psycopg, NumPy, Shapely, pyproj, PyYAML, python-dotenv, pyRofex, pytest, ruff.
- Angular, RxJS, Leaflet, TypeScript, Vitest, ESLint, Prettier.
- asf_search, h5py, rasterio, pystac-client, fsspec, aiohttp, Pillow, requests.
- PostgreSQL, Docker, Cloudflare Workers (Wrangler), Railway, GitHub Actions.

PRODUCT REFERENCE
- ucrop.it was used as a product reference for the "crop story" concept. No code, text, design or branding was copied.

SI TOOLS
- Claude Code (Anthropic). [ADD OTHERS IF USED.]
```

---

## 9. Project demo content

Pick one format. Both must name the team, its members and the challenge.

### Option A: 7-slide deck (English)

| # | Slide | Content |
| --- | --- | --- |
| 1 | Title | LoTestigo. "The field's logbook, written by satellite." Team `[TEAM NAME]`. Members: `[NAMES]`. Challenge: `[OFFICIAL CHALLENGE TITLE]`. NASA Space Apps Challenge 2026, Rosario. |
| 2 | The problem | Growers are asked to show how their grain was produced. Existing tools rely on what the grower types in. Small growers have no time, no advisor on call, no paperwork. |
| 3 | The idea | Draw your field. The satellite tells you what happened. You confirm and share. Three steps, one picture each. |
| 4 | NASA data makes it possible | NISAR L-band radar sees through clouds and detects surface change. HLS, MODIS, NASA POWER, IMERG and SMAP add greenness, weather and context. NISAR is a NASA-ISRO mission. |
| 5 | The app | Screenshot of the logbook: sowing event, September 7, 2026 (plus or minus 6 days), radar next to optical. Caption: HH dropped 1.78 dB against the landscape. |
| 6 | More than a logbook | Four small screenshots: carbon footprint with data origin labels, NDVI management zones, watershed and rainfall simulator, shareable passport. |
| 7 | What comes next | Honest status: 48-hour proof of concept, one event detected, not yet validated in the field. Next: validation with growers' records, more event types, watershed for any field, harvester and sensor data. Live demo URL. |

### Option B: 30-second video

| Time | Picture | Narration (English, or Spanish with English subtitles) |
| --- | --- | --- |
| 0:00 | Team name on screen | "We are `[TEAM NAME]`, from Rosario, Argentina." |
| 0:02 | Challenge title | "We took the NISAR challenge: making radar change detection useful on the ground." |
| 0:05 | App logo and tagline | "This is LoTestigo: the field's logbook, written by satellite." |
| 0:10 | Screen recording: draw a field, open the logbook, move the radar-optical slider | "A grower draws their field. NASA's NISAR radar, built with ISRO, shows what changed, even through clouds. Here it logged a sowing before the optical image turned green." |
| 0:20 | Footprint, zones, watershed, passport in quick cuts | "From there: a carbon estimate, fertilizer zones, a rainfall simulator, and a passport to share. Any grower, one polygon, no paperwork." |
| 0:28 | Live URL | "LoTestigo." |

The existing walkthrough video on the landing page cannot be used as is: it would need to be 30 seconds or less and carry English subtitles.

---

## 10. Compliance checklist

**Blocking**

- [ ] The GitHub repository is public. On November 15 at 1:15 p.m. it was **private**: judges cannot open it.
- [ ] Demo link created, public, and within the limit (7 slides or 30 seconds).
- [ ] All required fields completed in English.
- [ ] "Terms and Conditions" and "Confirm All Work is Original" boxes checked.
- [ ] "Submit for Judging" clicked before 11:59 p.m., and the confirmation banner seen.

**Eligibility**

- [ ] All team members are confirmed participants of the same Local Event (Rosario). At most six members.
- [ ] No images, video, audio or likeness of anyone under 18 in the demo or the project.
- [ ] At least one NASA data source used (met: see section 7).

**SI rules**

- [ ] Every SI-generated image or video in the deck, the video and the app carries a visible watermark.
- [x] No SI-generated content uses or modifies NASA branding or design elements. The app icon (`frontend/public/lotestigo-mark-*.png`, `icon-*.png`, `favicon*`, `apple-touch-icon.png`, `assets/lotestigo.png`) was replaced on November 15 by a flat geometric mark drawn with code (`assets/draw-logo.py`), with no stars or swoosh, and the landing video was updated to show it.
- [ ] SI-assisted code acknowledged in the README (done: "Use of SI tools").

**Links**

- [ ] Every link tested in a private browser window.
- [ ] Optional: request a FortiGuard Web Filter Classification for `lotestigo.1mj0t4h.workers.dev` so judges on filtered networks can open it (category "Web-based Applications", company name "N/A").
- [ ] The example field opens without an account at `/ejemplos`.

**Language**

- [ ] Linked materials are in English. The repository README is in English (`README.md`), with a Spanish version in `README.es.md`. The app interface is in English.
