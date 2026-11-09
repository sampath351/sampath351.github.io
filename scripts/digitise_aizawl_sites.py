"""Digitise the 2022 proposal sites (shelters, refugee parking) from the final review sheet.
The sites were drawn as PowerPoint shapes over an ArcGIS map export, so their positions are read
from the PDF's vector drawings and georeferenced by fitting the AOI-Tlangnuam polygon to the map image.
Positions are indicative (about ±100 m). Output: prop_points.json, used by build_aizawl_vectors.py."""
import json, sys, numpy as np, geopandas as gpd, pymupdf as fitz
from PIL import Image
from scipy import ndimage, optimize
from rasterio.features import rasterize
from affine import Affine
PDF, AOI = sys.argv[1], sys.argv[2]          # "Thesis Review 25-05-2022.pdf", AOI-Tlangnuam.shp
doc = fitz.open(PDF); p = doc[8]
XREF = max(p.get_images(full=True), key=lambda i: i[2] * i[3])[0]   # the map export
r = p.get_image_rects(XREF)[0]
pix = fitz.Pixmap(doc, XREF); im = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)[..., :3].astype(int)
H, W = im.shape[:2]
sat = im.max(2) - im.min(2); col = sat > 28; col[int(H*.79):, int(W*.75):] = False   # drop legend
cl = ndimage.binary_closing(col, iterations=10); lab, n = ndimage.label(cl)
m = ndimage.binary_fill_holes(lab == (np.argmax(ndimage.sum(cl, lab, range(1, n+1))) + 1))
ys, xs = np.where(m); g = gpd.read_file(AOI).to_crs(4326); x0, y0, x1, y1 = g.total_bounds
ds = 4; msm = m[::ds, ::ds]
def iou(q):
    a, b, c, d = q; T = Affine(1/a, 0, x0-b/a, 0, -1/c, y1+d/c) * Affine.scale(ds)
    rr = rasterize([(gg, 1) for gg in g.geometry], out_shape=msm.shape, transform=T, fill=0).astype(bool)
    return -(rr & msm).sum() / (rr | msm).sum()
q = optimize.minimize(iou, [(xs.max()-xs.min())/(x1-x0), xs.min(), (ys.max()-ys.min())/(y1-y0), ys.min()], method='Nelder-Mead').x
print('IoU', -iou(q))
KIND = {(0.93, 0.93, 0.88): 'parking', (1.0, 0.0, 0.0): 'shelter', (1.0, 0.75, 0.0): 'major'}
out = []
for d in p.get_drawings():
    k = KIND.get(tuple(round(c, 2) for c in d['fill'])) if d.get('fill') else None
    if not k or d['rect'].x0 < r.x0: continue          # skip legend symbols
    cx = (d['rect'].x0 + d['rect'].x1) / 2; cy = (d['rect'].y0 + d['rect'].y1) / 2
    px = (cx - r.x0) * W / r.width; py = (cy - r.y0) * H / r.height
    out.append({'kind': k, 'lon': round(x0 + (px - q[1]) / q[0], 4), 'lat': round(y1 - (py - q[3]) / q[2], 4)})
json.dump(out, open('prop_points.json', 'w')); print(len(out), 'sites')
