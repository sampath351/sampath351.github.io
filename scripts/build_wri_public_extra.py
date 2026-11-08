"""
Step 3 (PUBLIC): additional aggregated layers for the WRI map.
  - all reported crashes 2018–20 (all severities): ward counts, fatal share, encoded density rasters
  - month-of-year profiles (all crashes 2018–20, fatal crashes 2017–20)
  - one consolidated context layer (rail + stations, metro/monorail, express highways, national park, rivers, airport)
Only counts and smoothed surfaces are written; no individual records.
"""
import json, math, os, sys, warnings
import numpy as np, geopandas as gpd, pandas as pd
from PIL import Image
from scipy.ndimage import gaussian_filter
warnings.filterwarnings('ignore')

SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/wri/wards_mpk/commondata/'
FATAL = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/wri/Shapefiles2017-2020/'
OUT = '/home/claude/portfolio/data/wri/'
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

agg = json.load(open(OUT + 'agg.json'))
meta = agg['meta']
wards = gpd.read_file(OUT + 'wards.geojson')[['name', 'geometry']]

# ---------- all crashes 2018–20 ----------
rows = []
for yi, y in enumerate([2018, 2019, 2020]):
    a = gpd.read_file(f'{SRC}shape2020/Allcrashes{y}.shp')
    fids = set(gpd.read_file(f'{FATAL}Shapefile{y}.shp')['Record_ID'])
    a['fatal'] = a['Record_ID'].isin(fids).astype(int)
    a['pk'] = a['Peak_NonPe'].fillna('').str.lower().map(lambda s: 1 if ('peak' in s and 'non' not in s) else 0)
    a['m'] = a['Monthwise'].map(lambda s: MONTHS.index(s) if s in MONTHS else -1)
    a['y'] = y
    rows.append(a[['y', 'fatal', 'pk', 'm', 'geometry']])
A = gpd.GeoDataFrame(pd.concat(rows, ignore_index=True), crs=4326)
ok = A.geometry.notna() & A.geometry.x.between(72.6, 73.2) & A.geometry.y.between(18.7, 19.5)
print('records with invalid / out-of-city coordinates (kept in totals as unlocated):', int((~ok).sum()), A[~ok].groupby('y').size().to_dict())
A['located'] = ok
A = gpd.sjoin(A, wards, how='left', predicate='intersects')  # unlocated records fall into '_none'
A = A[~A.index.duplicated(keep='first')]
A['w'] = A['name'].fillna('_none')

allc = {}
for w, g in A.groupby('w'):
    n = [0] * 6; f = [0] * 6
    for _, r in g.iterrows():
        i = (r['y'] - 2018) * 2 + int(r['pk'])
        n[i] += 1; f[i] += int(r['fatal'])
    allc[w] = {'n': n, 'f': f}

months = {'all': {}, 'fatal': {}}
for y in [2018, 2019, 2020]:
    s = A[A['y'] == y]
    months['all'][str(y)] = [int(((s['m'] == k)).sum()) for k in range(12)]
    months['fatal'][str(y)] = [int(((s['m'] == k) & (s['fatal'] == 1)).sum()) for k in range(12)]
m17 = gpd.read_file(f'{SRC}shape2020/MonthFatali2017.shp')
months['fatal']['2017'] = [int((m17['Monthwise'] == mo).sum()) for mo in MONTHS]

# ---------- encoded all-crash rasters (same grid as the fatal layers) ----------
R = 6378137.0
merc = lambda lon, lat: (math.radians(lon) * R, math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R)
c = meta['image']['coords']; W, H = meta['image']['w'], meta['image']['h']
x0, y1 = merc(c[0][0], c[0][1]); x1, y0 = merc(c[2][0], c[2][1])
cell = (x1 - x0) / W
dens = {}; cnts = {}
for y in [2018, 2019, 2020]:
    for pk in (0, 1):
        d = np.zeros((H, W)); k = np.zeros((H, W), np.int32)
        for geom in A[(A['y'] == y) & (A['pk'] == pk) & A['located']].geometry:
            mx, my = merc(geom.x, geom.y); col = int((mx - x0) / cell); row = int((y1 - my) / cell)
            if 0 <= col < W and 0 <= row < H: d[row, col] += 1; k[row, col] += 1
        dens[(y, pk)] = gaussian_filter(d, sigma=250 / cell); cnts[(y, pk)] = k
scale = 65000.0 / sum(dens.values()).max()
os.makedirs(OUT + 'layers', exist_ok=True)
for (y, pk), d in dens.items():
    q = np.clip(np.round(d * scale), 0, 65535).astype(np.uint16); q = (q // 16) * 16
    rgb = np.zeros((H, W, 3), np.uint8); rgb[..., 0] = q >> 8; rgb[..., 1] = q & 255; rgb[..., 2] = np.clip(cnts[(y, pk)], 0, 255)
    Image.fromarray(rgb, 'RGB').save(f'{OUT}layers/all_{y}_{pk}.png', optimize=True)

agg['all'] = allc
agg['months'] = months
meta['all'] = {'years': [2018, 2019, 2020], 'index': '((year-2018)*2)+peak', 'note': 'All reported crashes (fatal + grievous + minor). Fatal flag joined by record ID.'}
json.dump(agg, open(OUT + 'agg.json', 'w'), separators=(',', ':'))

# ---------- consolidated context layer ----------
feats = []
def add(gdf, kind, name_col=None, simp=0.0002):
    gdf = gdf.to_crs(4326)
    for _, r in gdf.iterrows():
        g = r.geometry.simplify(simp) if simp and r.geometry.geom_type != 'Point' else r.geometry
        feats.append({'type': 'Feature', 'properties': {'k': kind, 'n': (str(r[name_col]) if name_col and pd.notna(r.get(name_col)) else '')},
                      'geometry': json.loads(gpd.GeoSeries([g]).to_json())['features'][0]['geometry']})
add(gpd.read_file(SRC + 'railways/Railway_Stations.shp'), 'rail_stn', 'name')
add(gpd.read_file(SRC + 'metro/Metro.shp'), 'metro', 'Name')
add(gpd.read_file(SRC + 'metro/MonoRail.shp'), 'metro', 'Name')
add(gpd.read_file(SRC + 'metro/MetroStations.shp'), 'metro_stn', 'Name')
roads = gpd.read_file(SRC + 'roads/roads.shp')
ex = roads[roads['name'].fillna('').isin(['Western Express Highway', 'Eastern Express Highway', 'BKC - Eastern Express Highway Road'])].copy()
ex['n'] = ex['name'].str.replace('BKC - ', '').str.replace(' Road', '')
ex = ex.dissolve(by='n').reset_index()
add(ex, 'expressway', 'n')
add(gpd.read_file(SRC + 'national_park/National_Park.shp'), 'park', None, 0.0005)
add(gpd.read_file(SRC + 'waterbodies/River.shp'), 'river', 'name')
add(gpd.read_file(SRC + 'airport/Airport.shp'), 'airport', None)

def rnd(o):
    if isinstance(o, float): return round(o, 5)
    if isinstance(o, list): return [rnd(v) for v in o]
    if isinstance(o, dict): return {k: rnd(v) for k, v in o.items()}
    return o
json.dump({'type': 'FeatureCollection', 'features': rnd(feats)}, open(OUT + 'context.geojson', 'w'), separators=(',', ':'))

print('all crashes per year:', A.groupby('y').size().to_dict(), 'fatal:', A.groupby('y')['fatal'].sum().to_dict())
print('months all 2019:', months['all']['2019'])
print('fatal months 2017 sum:', sum(months['fatal']['2017']))
for f in sorted(os.listdir(OUT)) + ['layers/' + x for x in sorted(os.listdir(OUT + 'layers'))]:
    p = OUT + f
    if os.path.isfile(p): print(f, os.path.getsize(p) // 1024, 'KB')
