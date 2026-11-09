"""Private build step: reads the original thesis layers from E:/SPAV/B.Plan_Thesis (not in the repo).

Build public, consolidated web layers for the B.Plan thesis case study.
Inputs: original 2022 ArcGIS Pro layers (private, E:\\SPAV\\B.Plan_Thesis).
Outputs (data/thesis/):
  grid.png      RGBA packed class layers on a 110 m Web-Mercator grid
                R = slope_cw<<4 | structure_cw   (15 = no data)
                G = litho_cw<<4 | landcover_cw
                B = drainage_cw<<4 | aspect_cw
                A = 255 inside district, 0 outside
  grid2.png     RGB:  R = eq2022<<4 | combined2022 ; G = tehsil id<<4 | municipal flag ; B = 0
  terrain.png   built by build_aizawl_terrain.py (70 m hillshade, faded edge)
  meta.json     grid geometry, legends, inventory points (rounded), stats
"""
import json, numpy as np, rasterio, geopandas as gpd
from rasterio.warp import reproject, Resampling
from rasterio.features import rasterize
from rasterio.transform import from_origin
from PIL import Image
from shapely.geometry import box
B = 'E:/SPAV/B.Plan_Thesis/'
OUT = 'out/'
M = 'EPSG:3857'
dist = gpd.read_file(B+'Shapefiles/AizawlDistrict.shp').to_crs(M)
teh = gpd.read_file(B+'Shapefiles/AizawlTehsil.shp').to_crs(M)
mun = gpd.read_file(B+'Aizawl/Shapefiles/AizawlUrbArea.shp').to_crs(M)

def make_grid(cell):
    x0,y0,x1,y1 = dist.total_bounds
    x0 = np.floor(x0/cell)*cell - cell; y1 = np.ceil(y1/cell)*cell + cell
    x1 = np.ceil(x1/cell)*cell + cell; y0 = np.floor(y0/cell)*cell - cell
    W = int(round((x1-x0)/cell)); H = int(round((y1-y0)/cell))
    return from_origin(x0, y1, cell, cell), H, W

def onto(path, T, H, W, rs):
    with rasterio.open(path) as s:
        src = s.read(1).astype('float32')
        if s.nodata is not None: src[src == s.nodata] = np.nan
        src[src < -1e30] = np.nan
        out = np.full((H, W), np.nan, 'float32')
        reproject(src, out, src_transform=s.transform, src_crs=s.crs, dst_transform=T, dst_crs=M,
                  resampling=rs, src_nodata=np.nan, dst_nodata=np.nan)
    return out

CELL = 110.0
T, H, W = make_grid(CELL)
inside = rasterize([(g, 1) for g in dist.geometry], out_shape=(H, W), transform=T, fill=0).astype(bool)
tid = rasterize([(g, i+1) for i, g in enumerate(teh.geometry)], out_shape=(H, W), transform=T, fill=0).astype('uint8')
mflag = rasterize([(g, 1) for g in mun.geometry], out_shape=(H, W), transform=T, fill=0).astype('uint8')
print('grid', H, W, 'inside', inside.sum())

lay = {}
for k in ['Slop', 'Strctre', 'Litho', 'Lulc', 'DraiDen', 'Aspect']:
    # coarse (~250 m) inputs are upsampled with nearest; finer ones aggregated with mode
    rs = Resampling.nearest if k in ('Strctre', 'Litho', 'DraiDen') else Resampling.mode
    lay[k] = onto(B+f'Aizawl/Shapefiles/RC{k}W.tif', T, H, W, rs)
eq = onto(B+'Aizawl/EQHazardWeightedReso.tif', T, H, W, Resampling.mode)
cb = onto(B+'Aizawl/EQLSHWeiOveReso.tif', T, H, W, Resampling.mode)
ls = onto(B+'Aizawl/LSHazardWeightedReso.tif', T, H, W, Resampling.mode)

def nib(a):
    v = np.where(np.isnan(a) | ~inside, 15, a).astype('uint8'); return v
R = (nib(lay['Slop']) << 4) | nib(lay['Strctre'])
G = (nib(lay['Litho']) << 4) | nib(lay['Lulc'])
Bc = (nib(lay['DraiDen']) << 4) | nib(lay['Aspect'])
A = np.where(inside, 255, 0).astype('uint8')
R[~inside] = G[~inside] = Bc[~inside] = 0
Image.fromarray(np.dstack([R, G, Bc, A]), 'RGBA').save(OUT+'grid.png', optimize=True)
e = np.where(np.isnan(eq) | ~inside, 0, eq).astype('uint8'); c = np.where(np.isnan(cb) | ~inside, 0, cb).astype('uint8')
l2 = np.where(np.isnan(ls) | ~inside, 0, ls).astype('uint8')
R2 = (e << 4) | c; G2 = (np.where(inside, tid, 0) << 4) | np.where(inside, mflag, 0)
Image.fromarray(np.dstack([R2, G2.astype('uint8'), np.zeros_like(R2)]), 'RGB').save(OUT+'grid2.png', optimize=True)
np.savez_compressed(OUT+'grid_arrays.npz', **{k: v for k, v in lay.items()}, eq=eq, cb=cb, ls=ls, inside=inside, tid=tid, mflag=mflag)


def corners(T, H, W):
    import pyproj
    tr = pyproj.Transformer.from_crs(M, 'EPSG:4326', always_xy=True)
    x0, y1 = T * (0, 0); x1, y0 = T * (W, H)
    tl = tr.transform(x0, y1); tr_ = tr.transform(x1, y1); br = tr.transform(x1, y0); bl = tr.transform(x0, y0)
    return [[round(p[0], 6), round(p[1], 6)] for p in (tl, tr_, br, bl)], [x0, y1, CELL]
coords, origin = corners(T, H, W)
json.dump({'w': W, 'h': H, 'coords': coords, 'origin': origin, 'cell': CELL,
           'tehsils': list(teh.NL_NAME_2)}, open(OUT+'grid_meta.json', 'w'))
print('done', coords)
