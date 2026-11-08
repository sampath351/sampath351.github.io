"""
Step 2 (PUBLIC): build the aggregated, non-reversible layers for the WRI case study map.

Input  (private, never published): crash points with attributes (from build_wri.py)
Output (public):
  data/wri/agg.json          ward x year x time-of-day x road-user/age aggregates (counts only)
  data/wri/layers/<y>_<p>.png  encoded rasters per year & peak/off-peak:
                               R,G = 16-bit smoothed density (Gaussian, ~250 m), B = crash count per ~35 m cell
No individual record, coordinate or attribute leaves this script.
"""
import json, math, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/wri/private/crashes.geojson'
WARDS = '/home/claude/portfolio/data/wri/wards.geojson'
OUT = '/home/claude/portfolio/data/wri/'
os.makedirs(OUT + 'layers', exist_ok=True)

YEARS = [2017, 2018, 2019, 2020]
WHO = [None, 'v:ped', 'v:tw', 'v:hv', 'v:cyc', 'ag:0_18', 'ag:18_35', 'ag:35_60', 'ag:60']

feats = json.load(open(SRC))['features']
wards = json.load(open(WARDS))
ward_names = [f['properties']['name'] for f in wards['features']]


def weight(p, who):
    if who is None:
        return p['f']
    dim, key = who.split(':')
    return (p.get(dim) or {}).get(key, 0)


# ---------- aggregate cube ----------
# index = ((yi * 2) + pk) * len(WHO) + wi
size = len(YEARS) * 2 * len(WHO)
cube = {w: {'d': [0] * size, 'n': [0] * size} for w in ward_names + ['_none']}
for f in feats:
    p = f['properties']
    w = p.get('w') or '_none'
    yi = YEARS.index(p['y'])
    for wi, who in enumerate(WHO):
        v = weight(p, who)
        if v:
            i = (yi * 2 + p['pk']) * len(WHO) + wi
            cube[w]['d'][i] += v
            cube[w]['n'][i] += 1

# ---------- raster grid in Web Mercator ----------
R = 6378137.0
merc = lambda lon, lat: (math.radians(lon) * R, math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R)
inv = lambda x, y: (math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2))

xs, ys = [], []
def walk(c):
    if isinstance(c[0], (int, float)):
        x, y = merc(*c); xs.append(x); ys.append(y)
    else:
        for k in c: walk(k)
for f in wards['features']: walk(f['geometry']['coordinates'])
pad = 1500
x0, x1, y0, y1 = min(xs) - pad, max(xs) + pad, min(ys) - pad, max(ys) + pad
CELL = 35.0  # metres (mercator) per pixel
W, H = int(math.ceil((x1 - x0) / CELL)), int(math.ceil((y1 - y0) / CELL))
print('grid', W, H)

dens = {}
pts = {}
for y in YEARS:
    for pk in (0, 1):
        d = np.zeros((H, W), np.float64); c = np.zeros((H, W), np.int32)
        for f in feats:
            p = f['properties']
            if p['y'] != y or p['pk'] != pk: continue
            mx, my = merc(*f['geometry']['coordinates'])
            col = int((mx - x0) / CELL); row = int((y1 - my) / CELL)
            if 0 <= col < W and 0 <= row < H:
                d[row, col] += p['f']; c[row, col] += 1
        dens[(y, pk)] = gaussian_filter(d, sigma=250 / CELL)
        pts[(y, pk)] = c

total = sum(dens.values())
scale = 65000.0 / total.max()          # all 8 layers summed still fit in 16 bits
for (y, pk), d in dens.items():
    q = np.clip(np.round(d * scale), 0, 65535).astype(np.uint16)
    rgb = np.zeros((H, W, 3), np.uint8)
    q = (q // 16) * 16                    # 12-bit precision is plenty for a blurred surface
    rgb[..., 0] = q >> 8; rgb[..., 1] = q & 255
    rgb[..., 2] = np.clip(pts[(y, pk)], 0, 255)
    Image.fromarray(rgb, 'RGB').save(f'{OUT}layers/{y}_{pk}.png', optimize=True)

nw = inv(x0, y1); se = inv(x1, y0)
meta = {
    'years': YEARS, 'who': [w or 'all' for w in WHO],
    'index': '((yearIndex*2)+peak)*len(who)+whoIndex',
    'image': {'w': W, 'h': H, 'coords': [[nw[0], nw[1]], [se[0], nw[1]], [se[0], se[1]], [nw[0], se[1]]],
              'encoding': 'R,G = uint16 density; B = crash count per cell', 'cell_m': CELL},
    'source': 'Mumbai Traffic Police fatal crash records via WRI India (2021). Aggregated; no individual records published.'
}
json.dump({'meta': meta, 'wards': cube}, open(OUT + 'agg.json', 'w'), separators=(',', ':'))

# sanity: totals must match published figures
for yi, y in enumerate(YEARS):
    d = sum(cube[w]['d'][(yi * 2 + pk) * len(WHO)] for w in cube for pk in (0, 1))
    n = sum(cube[w]['n'][(yi * 2 + pk) * len(WHO)] for w in cube for pk in (0, 1))
    print(y, 'crashes', n, 'fatalities', d)
for f in sorted(os.listdir(OUT + 'layers')): print(f, os.path.getsize(OUT + 'layers/' + f) // 1024, 'KB')
print('agg.json', os.path.getsize(OUT + 'agg.json') // 1024, 'KB')
