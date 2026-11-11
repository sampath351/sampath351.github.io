"""Remove per-cell crash counts from the public WRI layer PNGs (run after build_wri_public*.py).
Fatal layers (YYYY_p.png): the blue channel becomes presence only, on ~105 m squares (3 x 3 of the 35 m cells):
  B = 1 at the centre pixel of each square that holds at least one fatal crash, 0 everywhere else.
All-crash layers (all_YYYY_p.png): blue channel cleared. Density (R, G) is unchanged.
Usage: python coarsen_wri_locations.py data/wri/layers
"""
import sys, glob, os
import numpy as np
from PIL import Image

K = 3
for f in sorted(glob.glob(os.path.join(sys.argv[1], "*.png"))):
    a = np.array(Image.open(f).convert("RGB"))
    b = a[:, :, 2]
    out = np.zeros_like(b)
    if not os.path.basename(f).startswith("all_"):
        h, w = b.shape
        for i in range(0, h, K):
            for j in range(0, w, K):
                if b[i:i + K, j:j + K].any():
                    out[min(i + K // 2, h - 1), min(j + K // 2, w - 1)] = 1
    a[:, :, 2] = out
    Image.fromarray(a).save(f, optimize=True)
    print(os.path.basename(f), "squares:", int(out.sum()))
