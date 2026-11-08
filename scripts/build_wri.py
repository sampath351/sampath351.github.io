"""Build web-ready GeoJSON for the WRI Mumbai crash case study."""
import json, geopandas as gpd, pandas as pd
src = '/home/claude/wri/wards_mpk/commondata/'
shp = '/home/claude/wri/Shapefiles2017-2020/'
out = '/home/claude/portfolio/data/wri/'
PRIVATE = '/home/claude/wri/private/'   # e.g. E:/SPAV/portfolio_private/
import os; os.makedirs(out, exist_ok=True)

wards = gpd.read_file(src+'boundries/MumbaiWards.shp')[['gid','name','geometry']]
wards['geometry'] = wards.geometry.simplify(0.0004, preserve_topology=True)

def n(v):
    try: return int(float(v))
    except: return 0

rows = []
for y in [2017, 2018, 2019, 2020]:
    g = gpd.read_file(f'{shp}Shapefile{y}.shp')
    g = g[g.geometry.notna() & ~g.geometry.is_empty]
    peakcol = 'Peak__Non' if y == 2017 else 'Peak_NonPe'
    for _, r in g.iterrows():
        p = dict(y=y, f=max(n(r['NumFatalit']), 1),
                 pk=1 if 'peak' in str(r[peakcol]).lower() and 'non' not in str(r[peakcol]).lower() else 0,
                 sc=1 if 'non' not in str(r['School_Pea']).lower() else 0)
        # accused vehicle (vehicle responsible)
        acc = {'auto': 'Auto_Ricks', 'bus': 'Buses', 'car': 'Cars_Vans_', 'hv': 'Heavy_Vehi', 'tw': 'Two_Wheele'}
        p['a'] = [k for k, c in acc.items() if n(r.get(c, 0)) > 0]
        # road user killed (2018-20 only)
        if y > 2017:
            vic = {'ped': 'Pedestrian', 'tw': 'Two_Whee_1', 'car': 'Cars_Vans1', 'hv': 'Heavy_Ve_1',
                   'bus': 'Buses_1', 'cyc': 'Bicycle_1', 'auto': 'Auto_Ric_1'}
            p['v'] = {k: n(r.get(c, 0)) for k, c in vic.items() if n(r.get(c, 0)) > 0}
        ages = {'0_18': 'FAge_0_18', '18_35': 'FAge_18_35', '35_60': 'FAge_35_60', '60': 'FAge_60'}
        p['ag'] = {k: n(r.get(c, 0)) for k, c in ages.items() if n(r.get(c, 0)) > 0}
        rows.append((p, r.geometry))

pts = gpd.GeoDataFrame([p for p, _ in rows], geometry=[gm for _, gm in rows], crs=4326)
pts = gpd.sjoin(pts, wards[['name', 'geometry']], how='left', predicate='intersects').drop(columns='index_right')
pts = pts[~pts.index.duplicated(keep='first')]
pts = pts.rename(columns={'name': 'w'})
print(pts.groupby('y').agg(crashes=('f', 'size'), fat=('f', 'sum')))
print('unmatched ward:', pts.w.isna().sum())

feats = [{'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(gm.x, 5), round(gm.y, 5)]},
          'properties': {k: v for k, v in p.items() if not (isinstance(v, float) and pd.isna(v))}}
         for p, gm in zip(pts.drop(columns='geometry').to_dict('records'), pts.geometry)]
json.dump({'type': 'FeatureCollection', 'features': feats}, open(PRIVATE+'crashes.geojson', 'w'), separators=(',', ':'))  # private

wards.to_file(out+'wards.geojson', driver='GeoJSON', COORDINATE_PRECISION=5)
rail = gpd.read_file(src+'railways/Railways.shp')[['name', 'geometry']]
rail['geometry'] = rail.simplify(0.0002); rail.to_file(out+'rail.geojson', driver='GeoJSON', COORDINATE_PRECISION=5)
roads = gpd.read_file(src+'roads/roads.shp')
roads = roads[roads['type'].isin(['motorway', 'trunk', 'primary'])][['name', 'type', 'geometry']]
roads['geometry'] = roads.simplify(0.0002); roads.to_file(out+'roads.geojson', driver='GeoJSON', COORDINATE_PRECISION=5)
for f in os.listdir(out): print(f, os.path.getsize(out+f)//1024, 'KB')
