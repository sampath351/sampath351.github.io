# Sampath Kakarla — portfolio

Static site for GitHub Pages. No build step, no framework. All text lives in content files you can edit.

---

## 1. Publish with GitHub Desktop (one-time)

1. **GitHub Desktop → File → Add local repository →** choose `E:\SPAV\portfolio`.
   It will say the folder isn't a repository yet → click **"create a repository"** → **Create repository**.
2. Click **Publish repository**.
   - **Name:** `sampath351.github.io`
   - **Untick "Keep this code private"** (free GitHub Pages needs a public repo; raw data is excluded, see §4)
3. On github.com open the repo → **Settings → Pages** → Source **Deploy from a branch** → Branch **main**, folder **/ (root)** → Save.
4. After ~1–2 minutes the site is live at **https://sampath351.github.io** (the editor is already configured for this repo).

**Every later change:** GitHub Desktop shows the changed files → write a short summary → **Commit to main** → **Push origin**.

---

## 2. Edit text and photos (three ways)

### A. Online editor — from any browser
`https://sampath351.github.io/admin/` → **Sign In Using Access Token**.
Create the token once: github.com → Settings → Developer settings → **Fine-grained tokens** → Generate →
Repository access: *only* `sampath351.github.io` → Permissions: **Contents: Read and write** → copy the token and paste it into the editor.
Every **Save** commits straight to GitHub; the site updates in about a minute. Photos you upload go to `assets/img/uploads/`.

### B. Local editor — on your PC
Run a local server (below), open `http://localhost:8000/admin/` in Chrome or Edge → **Work with Local Repository** → pick `E:\SPAV\portfolio`.
Edits save into the folder; push with GitHub Desktop.

### C. Edit the files directly
| What | File |
|---|---|
| Home page: hero, numbers strip, experience, AI section, skills table, academic, personal, contact | `content/site.json` |
| Planning Saga case study text | `content/work/planning-saga.json` |
| WRI case study text | `content/work/wri-road-safety.json` |
| Thesis case study text | `content/work/aizawl-landslides.json` |
| Colours, spacing, fonts | `assets/css/main.css` (tokens at the top, `:root`) |
| CV download | replace `assets/docs/Sampath_Kakarla_CV.pdf` |

Case-study chapter text is Markdown: `**bold**`, `*italic*`, `- bullet`, `> quote`, `[link](url)`.
Leave the `embed` and `id` fields alone — they position the interactive maps and tools.
On the thesis page, the orange **Show … on the map** buttons are small bits of HTML inside the chapter text (`<button class="jump" …>`). Keep them as they are, or delete the whole line.
Section titles on the home page come from `content/site.json`; the left section rail is built automatically from the sections that are shown. *Field notes* stays hidden until it has at least one note.
Image layout per chapter (`figLayout`): blank = three across, `two`, `one` (full width), `tall` (one portrait map).

## Preview locally
Double-click **`preview.bat`** in this folder. It starts a small local server (Python if installed, otherwise Node) and opens the thesis page in your browser. Close the black window to stop it.

Or by hand:
```
cd E:\SPAV\portfolio
python -m http.server 8000
```
Open http://localhost:8000 (double-clicking the HTML files won't load the content). `preview.bat` is excluded from the public repo by `.gitignore`.

---

## 3. Fonts
- **Archivo** only, self-hosted in `assets/fonts` (SIL Open Font License), variable width: condensed for headings and numbers, normal for text and labels. Two-font rule: no second family is used (the Adobe Acumin kit is not available). The JetBrains Mono files in `assets/fonts` are no longer used.

---

## 4. Data protection — what is and isn't published
GitHub Pages repos are public, and anything a browser can display can in principle be saved. So the rule here is: **record-level data never enters this folder.**

| Published (safe) | Kept private (outside the repo) |
|---|---|
| Ward-level counts by year / time / road user / age, all-crash counts, month profiles (`data/wri/agg.json`) | Individual crash records with attributes |
| Smoothed density + ~35 m cell counts as encoded images (`data/wri/layers/`) | Exact coordinates, record IDs, dates |
| Public boundaries (BMC wards), OSM roads and rail | Original Excel files, shapefiles, map packages |
| 2021 report maps (already published) | |
| Thesis: class layers only, packed in images on a 100 m grid (`data/aizawl/grid*.png`), a shading image, public boundaries, OSM roads and hospitals, GSI landslide points rounded to ~100 m (year and activity only), catalogue earthquakes, facility categories, digitised 2022 proposal sites | Thesis rasters (DEM, slope, land cover, index outputs), shapefiles, ArcGIS projects, full GSI inventory attributes |
| 2022 thesis maps and sheets as images (`assets/img/thesis/`) | |

Raw processed points are in `E:\SPAV\portfolio_private\` (not part of the repo; also blocked by `.gitignore`).
To rebuild the public layers: `scripts/build_wri.py` (private step) → `scripts/build_wri_public.py` → `scripts/build_wri_public_extra.py` (public outputs).
Thesis layers: `scripts/digitise_aizawl_sites.py` → `scripts/build_aizawl_grid.py` → `scripts/build_aizawl_terrain.py` → `scripts/build_aizawl_vectors.py` (they read `E:\SPAV\B.Plan_Thesis`, write to `out/`; copy the outputs to `data/aizawl/`).
Planning Saga real-town data: drop the file into `E:\SPAV\portfolio_private\ps_town\` (see the README there). It is processed into a public layer only after you confirm permission.
The Planning Saga demos use generated, fictional data only.
Hero contours: 192×108 heightmaps in `assets/terrain/` (settings in `terrain.json`: interval, labels, sources). Public elevation data only.
Basemap on the map pages: OpenStreetMap standard tiles (no API key), shown as inverted greyscale; keep the "© OpenStreetMap contributors" attribution.

---

## Structure
```
index.html                  home
work/planning-saga.html     case study 01 (pipeline demo, capacity & deadline model, ops system)
work/wri-road-safety.html   case study 02 (aggregated interactive map)
work/aizawl-landslides.html case study 03 (B.Plan thesis: live multi-criteria hazard model)
admin/                      online/local editor (Sveltia CMS) + its field config
content/site.json           all home-page content
content/work/*.json         case-study content
assets/css, assets/js       design system and scripts (rail.js = section rail on every page, terrain.js = real-terrain contours behind heroes)
assets/terrain              small heightmaps for the hero contours: Vijayawada, Mumbai (SRTM-based Terrain Tiles, Mapzen/AWS Open Data) and Aizawl (thesis DEM)
assets/vendor               MapLibre GL 4.7.1 (BSD-3), marked 18.1.1 (MIT)
data/wri                    aggregated public map layers
data/aizawl                 thesis class layers and context (public, consolidated)
scripts                     data-processing scripts (Python)
```

Files left over from v1 that you can delete: `content/site.js`, `assets/docs/README.txt`, `assets/img/personal/`, `data/wri/crashes.geojson` (all ignored by git anyway).

## Home page contour backdrop (11 Nov 2026)
- `assets/js/bg-terrain.js` draws real contours of the Eastern Ghats (Kondapalli hills) north-west of Vijayawada behind the whole home page: right side only, fading towards the middle (CSS mask on `#bg-terrain`), drifting up far slower than the page scroll, with a gentle swell under the pointer.
- Heightmap: `assets/terrain/eastern-ghats.png` (220 × 316, 16-bit in R,G; bbox 80.33–80.73 E, 16.50–17.05 N), metadata in `assets/terrain/terrain.json`. Source: SRTM-based Terrain Tiles (Mapzen / AWS Open Data), lightly smoothed.
- Case-study pages still use `terrain.js` for their hero contours.
