"""Private build step: reads the original thesis layers from E:/SPAV/B.Plan_Thesis (not in the repo).
Vectors + meta for the thesis page. Public sources only; coordinates rounded."""
import json, numpy as np, geopandas as gpd, pandas as pd, rasterio
from shapely.geometry import mapping, Point
from rasterio.transform import from_origin, rowcol
from PIL import Image
from rasterio.features import rasterize
B='E:/SPAV/B.Plan_Thesis/'; OUT='out/'
def rnd(geom, nd):
    def r(c):
        if isinstance(c[0], (float, int)): return [round(c[0], nd), round(c[1], nd)]
        return [r(x) for x in c]
    m = mapping(geom); return {'type': m['type'], 'coordinates': r(m['coordinates'])}
feats = []
def add(geom, props, nd=4): feats.append({'type': 'Feature', 'properties': props, 'geometry': rnd(geom, nd)})
dist = gpd.read_file(B+'Shapefiles/AizawlDistrict.shp').to_crs(4326)
D = dist.geometry.iloc[0]
add(D.simplify(0.0004), {'k': 'district'})
teh = gpd.read_file(B+'Shapefiles/AizawlTehsil.shp').to_crs(4326)
for i, (n, g) in enumerate(zip(teh.NL_NAME_2, teh.geometry)):
    add(g.simplify(0.0004), {'k': 'tehsil', 'name': n, 'id': i+1})
    c = g.representative_point(); add(c, {'k': 'tehsil_lbl', 'name': n.upper()})
mun = gpd.read_file(B+'Aizawl/Shapefiles/AizawlUrbArea.shp').to_crs(4326)
add(mun.geometry.iloc[0].simplify(0.0002), {'k': 'municipal'})
rd = gpd.read_file(B+'Shapefiles/DistrictRoads.shp').to_crs(4326)
rd = rd[rd.intersects(D.buffer(0.03))]
for t, g, ref in zip(rd['type'], rd.geometry, rd['ref']):
    add(g.simplify(0.00025), {'k': 'road', 'c': str(t), 'ref': ref if isinstance(ref, str) else ''})
fl = gpd.read_file(B+'Aizawl/Shapefiles/Faultline.shp').to_crs(4326)
for g in fl.geometry:
    g2 = g.intersection(D.buffer(0.05))
    if not g2.is_empty: add(g2.simplify(0.0003), {'k': 'fault'})
# landslide inventory (GSI) — rounded to ~100 m, year + activity only
ls = gpd.read_file(B+'Aizawl/Shapefiles/LandslidePointAizawlDist.shp').to_crs(4326)
ls['yr'] = ls.SLIDE_NO.str.extract(r'/(\d{4})/')[0]
for g, yr, act, trig in zip(ls.geometry, ls.yr, ls.ACTIVITY, ls.TRIGGERING):
    add(g, {'k': 'slide', 'yr': int(yr) if isinstance(yr, str) else None, 'act': act if isinstance(act, str) else '',
            'rain': 1 if isinstance(trig, str) and 'ain' in trig else 0}, nd=3)
eq = gpd.read_file(B+'Aizawl/Shapefiles/Earthquake.shp').to_crs(4326)
eq = eq[eq.within(D.buffer(0.15))]
for g, m, y in zip(eq.geometry, eq.MW, eq.YR):
    add(g, {'k': 'quake', 'm': round(float(m), 1), 'yr': int(y)}, nd=2)
print('quakes kept', len(eq), 'max', eq.MW.max(), eq.loc[eq.MW.idxmax(), ['YR','LAT','LONG_']].tolist(), 'in district', eq.within(D).sum())
# facilities
h = gpd.read_file(B+'Aizawl/Shapefiles/Hosp_Dist.shp').to_crs(4326)
for g, n in zip(h.geometry, h['name']): add(g, {'k': 'fac', 'c': 'hospital', 'n': n}, nd=4)
gv = gpd.read_file(B+'Aizawl/Shapefiles/Govt.shp').to_crs(4326)
for g, mu in zip(gv.geometry, gv.MapUnit):
    add(g, {'k': 'fac', 'c': 'comms' if mu == 4 else 'govt'}, nd=4)
so = pd.concat([gpd.read_file(B+'Aizawl/Shapefiles/SocialInfraDist.shp'), gpd.read_file(B+'Aizawl/Shapefiles/Landmarks_Dist.shp')]).drop_duplicates('osm_id').to_crs(4326)
for g, t in zip(so.geometry, so['type']):
    add(g, {'k': 'fac', 'c': 'school' if t == 'school' else 'community'}, nd=4)
# 2022 proposal sites, digitised from the final review sheet (indicative)
for p in json.load(open('prop_points.json')):
    add(Point(p['lon'], p['lat']), {'k': 'site', 'c': p['kind']}, nd=4)
json.dump({'type': 'FeatureCollection', 'features': feats}, open(OUT+'context.geojson', 'w'), separators=(',', ':'))
from collections import Counter; print(Counter(f['properties']['k'] for f in feats))
