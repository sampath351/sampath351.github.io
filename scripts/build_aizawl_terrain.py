"""Private build step: reads the original thesis layers from E:/SPAV/B.Plan_Thesis (not in the repo).
70 m hillshade for the thesis map (grey + alpha, faded at the district edge). Run after build_aizawl_grid.py."""
import numpy as np, rasterio, geopandas as gpd, json, pyproj
from rasterio.warp import reproject, Resampling
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy.ndimage import gaussian_filter
from PIL import Image
B='E:/SPAV/B.Plan_Thesis/'; OUT='out/'; M='EPSG:3857'
dist=gpd.read_file(B+'Shapefiles/AizawlDistrict.shp').to_crs(M)
cell=70.0
x0,y0,x1,y1=dist.buffer(5000).total_bounds
x0=np.floor(x0/cell)*cell; y1=np.ceil(y1/cell)*cell; W=int(np.ceil((x1-x0)/cell)); H=int(np.ceil((y1-y0)/cell))
T=from_origin(x0,y1,cell,cell)
with rasterio.open(B+'Aizawl/Shapefiles/DEM/MosaicClip.tif') as s:
    src=s.read(1).astype('float32'); src[src==s.nodata]=np.nan
    dem=np.full((H,W),np.nan,'float32')
    reproject(src,dem,src_transform=s.transform,src_crs=s.crs,dst_transform=T,dst_crs=M,resampling=Resampling.bilinear,src_nodata=np.nan,dst_nodata=np.nan)
g=cell/1.0935
z=np.where(np.isnan(dem),np.nanmean(dem),dem)*1.8
gy,gx=np.gradient(z,g); slope=np.arctan(np.hypot(gx,gy)); asp=np.arctan2(-gx,gy)
az,alt=np.radians(315),np.radians(42)
hs=np.clip(np.sin(alt)*np.cos(slope)+np.cos(alt)*np.sin(slope)*np.cos(az-asp),0,1)
inn=rasterize([(gg,1) for gg in dist.buffer(4000).geometry],out_shape=(H,W),transform=T,fill=0).astype(float)
fade=np.clip(gaussian_filter(inn,6)*1.6-0.3,0,1); fade[np.isnan(dem)]=0
# shading only: black with alpha where slopes face away from the light, laid over the hazard colours
sh=np.clip((0.70-hs)*1.25,0,0.6)*fade
A=(np.round(sh*40)/40*255).astype('uint8'); L=np.zeros_like(A)
Image.fromarray(np.dstack([L,A]),'LA').save(OUT+'terrain.png',optimize=True)
tr=pyproj.Transformer.from_crs(M,'EPSG:4326',always_xy=True)
xa,yb=x0+W*cell,y1-H*cell
coords=[[round(v,6) for v in tr.transform(x,y)] for x,y in [(x0,y1),(xa,y1),(xa,yb),(x0,yb)]]
m=json.load(open(OUT+'grid_meta.json')); m['terrain']={'w':W,'h':H,'coords':coords}; json.dump(m,open(OUT+'grid_meta.json','w'))
print('terrain',W,H)
