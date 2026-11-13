"""Lab 01 · Address-order checker on open data.

Runs five address checks on an open OpenStreetMap extract, from text to geometry:
  text      the street name in the address doesn't match the street's own name (case, hyphen, typo,
            a building name in the street field), or the house number carries extra text (floor, courtyard,
            reversed range)
  far       the address sits more than FAR_M from the nearest mapped part of its street
  dup       the same address is tagged on separate buildings or blocks
  side      an odd or even number sits on the other side from the rest of its street
  sequence  a number breaks the running order along its side of the street
Flags are things to review, not verdicts: the street line can be the wrong part as easily as the address.

A planted-error test (plant + score) moves, copies, mistypes and swaps clean addresses on purpose, then
reruns the checks to see how many of those planted errors they catch.

Data: OpenStreetMap extract of central Helsinki (April 2019) bundled with the open-source pyrosm library.
© OpenStreetMap contributors, ODbL 1.0.
Usage: python address_order.py <out_dir>
"""
import os, re, sys, json, difflib, warnings
from types import SimpleNamespace
import numpy as np, pandas as pd, geopandas as gpd
from shapely.geometry import Point, LineString, Polygon
from shapely.affinity import translate
from shapely.ops import linemerge, unary_union, nearest_points
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform
import pyrosm, osmium

warnings.filterwarnings("ignore")
CRS = 3067                    # ETRS-TM35FIN, metres
FAR_M = 120                   # 'far': more than this from the nearest mapped part of its street
DUP_M = 25                    # 'dup': tags of one address on buildings more than this apart (single linkage)
FUZZY = .88                   # name similarity that counts as a likely typo
MIN_GROUP = 4                 # side needs this many other numbers on the street; sequence this many of one parity on one side
MAJORITY = .75                # side check needs a clear majority side
SEQ_TOL = 15                  # a number must sit at least this far (m) outside its stretch to count
STRAIGHT = .2                 # side/sequence skip streets that bend too much for one axis
KINDS = ["text", "far", "dup", "side", "sequence"]
PBF = os.path.join(os.path.dirname(pyrosm.__file__), "data", "Helsinki.osm.pbf")


# ======================================================================= load
def load(pbf=PBF):
    """Address tags T (one row per tagged POI or building), building outlines B, street geometry S."""
    osm = pyrosm.OSM(pbf)
    bld = osm.get_buildings()
    pois = osm.get_pois(custom_filter={"addr:housenumber": True})
    cols = ["addr:street", "addr:housenumber", "geometry"]
    T = pd.concat([f[[c for c in cols if c in f]] for f in (pois, bld) if f is not None], ignore_index=True)
    T = gpd.GeoDataFrame(T.dropna(subset=cols[:2]), geometry="geometry", crs=4326).to_crs(CRS)
    T["geometry"] = T.geometry.representative_point()
    T["raw_street"] = T["addr:street"].astype(str).str.strip()
    T["raw_hn"] = T["addr:housenumber"].astype(str).str.strip()
    T = T[T.raw_hn.str.match(r"\d")][["raw_street", "raw_hn", "geometry"]].reset_index(drop=True)   # needs a house number
    B = bld[["geometry"]].to_crs(CRS).reset_index(drop=True)
    return T, B, load_streets(pbf)


class _Ways(osmium.SimpleHandler):
    def __init__(self): super().__init__(); self.rows = []
    def way(self, w):
        if "highway" not in w.tags or "name" not in w.tags: return
        pts = []
        for n in w.nodes:
            try: pts.append((n.lon, n.lat))
            except osmium.InvalidLocationError: pass                       # node outside the extract
        if len(pts) < 2: return
        area = w.tags.get("area") == "yes" and len(pts) >= 4 and pts[0] == pts[-1]
        self.rows.append({"name": w.tags["name"], "area": area, "geometry": Polygon(pts) if area else LineString(pts)})


def load_streets(pbf=PBF):
    """Every named highway way, lines and pedestrian areas (e.g. part of Keskuskatu is mapped as an area)."""
    h = _Ways(); h.apply_file(pbf, locations=True)
    W = gpd.GeoDataFrame(h.rows, geometry="geometry", crs=4326).to_crs(CRS)
    lines, anyg, axes = {}, {}, {}
    for name, g in W.groupby("name"):
        ln = [x for x, a in zip(g.geometry, g.area) if not a]
        if ln:
            u = unary_union(ln); lines[name] = linemerge(u) if u.geom_type == "MultiLineString" else u
            # one axis per street (principal direction of its vertices) to measure position along it
            v = np.array([c for part in getattr(lines[name], "geoms", [lines[name]]) for c in part.coords])
            c = v.mean(0); u_ = np.linalg.eigh(np.cov((v - c).T))[1][:, -1]
            along, perp = (v - c) @ u_, (v - c) @ np.array([-u_[1], u_[0]])
            axes[name] = (c, u_, perp.std() / max(1, np.ptp(along)) < STRAIGHT)
        anyg[name] = unary_union(list(g.geometry))
    return SimpleNamespace(lines=lines, any=anyg, axes=axes, by_norm={norm(n): n for n in anyg})


norm = lambda s: re.sub(r"\s+", " ", s.lower().replace("-", " ")).strip()
HN = re.compile(r"^(\d+)\s*([A-Za-z])?(?:\s*[-–]\s*(\d+)\s*([A-Za-z])?)?")


def house(hn):
    """'13 A, 5. krs./Floor 5' -> ('13 A', 13, 'extra text…'); '29-27' -> ('29-27', 29, 'reversed range')"""
    m = HN.match(hn)
    if not m: return None, None, "no number"
    a, la, b, lb = m.groups()
    key = a + (" " + la.upper() if la else "") + ("-" + b + (" " + lb.upper() if lb else "") if b else "")
    rest = hn[m.end():].strip(" ,")
    issue = "extra text in house number" if rest else ("reversed range" if b and int(b) < int(a) else "")
    return key, int(a), issue


def match(raw, where, S):
    """The street an address means, and what is wrong with how it is written."""
    if raw in S.any: return raw, ""
    tail = raw.split(",")[-1].strip()
    if tail != raw and tail in S.any: return tail, "building name in street field"
    for cand in (raw, tail):
        if norm(cand) in S.by_norm: return S.by_norm[norm(cand)], "spelling differs from street name (case or hyphen)"
    best = max(S.any, key=lambda n: difflib.SequenceMatcher(None, norm(tail), norm(n)).ratio())
    if difflib.SequenceMatcher(None, norm(tail), norm(best)).ratio() >= FUZZY and S.any[best].distance(where) <= FAR_M:
        return best, f"likely typo (street is '{best}')"
    return None, ""


def place(p, name, S):
    """Distance to the street, position along its axis, side (+1/-1), and whether side/sequence can use it."""
    d_any = S.any[name].distance(p)
    if name not in S.lines: return d_any, np.nan, 0, False
    geom = S.lines[name]; c, u, straight = S.axes[name]
    if d_any + 5 < geom.distance(p): return d_any, np.nan, 0, False               # nearest part is a pedestrian area
    q = nearest_points(geom, p)[0]
    part = min(getattr(geom, "geoms", [geom]), key=lambda l: l.distance(q))
    s = part.project(q); a, b = part.interpolate(max(0, s - 3)), part.interpolate(min(part.length, s + 3))
    t = np.array([b.x - a.x, b.y - a.y]); t = t if t @ u >= 0 else -t            # local direction, oriented like the axis
    side = 1 if t[0] * (p.y - q.y) - t[1] * (p.x - q.x) > 0 else -1
    end = s < 1 or s > part.length - 1                                            # beyond the end of the line
    return d_any, float((np.array([q.x, q.y]) - c) @ u), side, straight and not end


def keep_run(v):
    """Positions of a longest non-decreasing run (O(n²); streets are short)."""
    n = len(v); L, prev = [1] * n, [-1] * n
    for i in range(n):
        for j in range(i):
            if v[j] <= v[i] and L[j] + 1 > L[i]: L[i], prev[i] = L[j] + 1, j
    i, keep = int(np.argmax(L)), set()
    while i != -1: keep.add(i); i = prev[i]
    return keep


# ======================================================================= check
def check(T, B, S):
    """One row per address with its flags: list of (kind, reason)."""
    T = T.copy()
    T[["hn", "num", "hn_issue"]] = T.raw_hn.apply(lambda h: pd.Series(house(h)))
    T = T.dropna(subset=["num"])
    mm = [match(r.raw_street, r.geometry, S) for r in T.itertuples()]
    T["street"] = [m[0] for m in mm]; T["name_issue"] = [m[1] for m in mm]
    # for the duplicate check each tag stands for the building it sits in: shops spread through one mall are one place
    hit = gpd.sjoin(T[["geometry"]], B, how="left", predicate="within")
    hit = hit[~hit.index.duplicated()]
    T["shape"] = [B.geometry[int(j)] if j == j else p for j, p in zip(hit.index_right, T.geometry)]

    rows = []
    for (st, hn), g in T.groupby([T.street.fillna("~" + T.raw_street), "hn"]):
        xy = np.c_[g.geometry.x, g.geometry.y]
        if len(g) > 1:
            sh = list(g["shape"]); D = np.array([[a.distance(b) for b in sh] for a in sh])
            lab = fcluster(linkage(squareform(D, checks=False), "single"), DUP_M, "distance")
        else: lab = np.array([1])
        sizes = pd.Series(lab).value_counts()
        c = xy[lab == sizes.index[0]].mean(0)
        rows.append({"street": None if st.startswith("~") else st, "written": g.raw_street.iloc[0] if st.startswith("~") else st,
                     "hn": hn, "num": int(g.num.iloc[0]), "x": c[0], "y": c[1], "tags": len(g),
                     "twins": [xy[lab == k].mean(0).tolist() for k in sizes.index[1:]],
                     "text": "; ".join(sorted({i for i in list(g.name_issue) + list(g.hn_issue) if i})),
                     "written_as": sorted(set(g.raw_street + " " + g.raw_hn))})
    A = gpd.GeoDataFrame(pd.DataFrame(rows), geometry=gpd.points_from_xy([r["x"] for r in rows], [r["y"] for r in rows]), crs=CRS)
    P = [place(r.geometry, r.street, S) if isinstance(r.street, str) else (np.nan, np.nan, 0, False) for r in A.itertuples()]
    A[["dist", "pos", "side", "usable"]] = pd.DataFrame(P, index=A.index)
    A["usable"] = A.usable.astype(bool)
    A["fl"] = [[] for _ in range(len(A))]
    add = lambda i, k, why: A.at[i, "fl"].append((k, why))

    for i in A.index[A.text != ""]: add(i, "text", A.at[i, "text"])
    far = A.street.notna() & (A.dist > FAR_M)
    for i in A.index[far]: add(i, "far", f"{A.at[i, 'dist']:.0f} m from the nearest mapped part of {A.at[i, 'street']}")
    for i in A.index[A.twins.str.len() > 0]: add(i, "dup", f"tagged on {1 + len(A.at[i, 'twins'])} separate buildings or blocks")

    A["parity"] = A.num % 2
    base = A[A.street.notna() & ~far & A.usable]
    # side: on most streets odd numbers keep to one side and even to the other. Each address is compared with
    # what the rest of its street says (both parities vote for which side the odd numbers are on).
    sided = set(); A["side_ok"] = False; A["seq_ok"] = False
    for st, g in base[base.dist >= 2].groupby("street"):                       # points on the line itself have no side
        vote = g.side * np.where(g.parity == 1, 1, -1)
        for i in g.index:
            others = vote.drop(i)
            if len(others) < MIN_GROUP: continue
            A.at[i, "side_ok"] = True
            major = 1 if (others > 0).mean() >= .5 else -1
            if (others == major).mean() >= MAJORITY and vote[i] != major:
                par = g.at[i, "parity"]
                add(i, "side", f"{'odd' if par else 'even'} number on the side of {st} that has its {'even' if par else 'odd'} numbers"); sided.add(i)

    rest = base[~base.index.isin(sided) & ~base.hn.str.contains("-")]       # ranges (4-6) overlap their own numbers
    for (st, side, par), g in rest.groupby(["street", "side", "parity"]):
        if len(g) < MIN_GROUP: continue
        g = g.sort_values("pos"); v = list(g.num); pos = list(g.pos); A.loc[g.index, "seq_ok"] = True
        up, down = keep_run(v), keep_run([-x for x in v])
        inc = len(up) >= len(down); keep = sorted(up if inc else down)
        for k, i in enumerate(g.index):
            if k in keep: continue
            n = v[k]
            lo = [j for j in keep if v[j] <= n]; hi = [j for j in keep if v[j] >= n]
            lo = max(lo, key=lambda j: v[j]) if lo else None; hi = min(hi, key=lambda j: v[j]) if hi else None
            span = [pos[j] for j in (lo, hi) if j is not None]
            a, b = (min(span), max(span)) if len(span) == 2 else ((-np.inf, span[0]) if (lo is None) == inc else (span[0], np.inf))
            off = max(a - pos[k], pos[k] - b, 0)
            if off <= SEQ_TOL: continue
            if lo is not None and hi is not None: why = f"belongs between {v[lo]} and {v[hi]}, sits {off:.0f} m outside that stretch of {st}"
            elif lo is None: why = f"lower than {v[hi]} but sits {off:.0f} m past it along {st}"
            else: why = f"higher than {v[lo]} but sits {off:.0f} m short of it along {st}"
            add(i, "sequence", why)

    ORDER = ["dup", "far", "side", "sequence", "text"]
    A["f"] = [("unchecked" if not isinstance(st, str) else next((o for o in ORDER if o in [x[0] for x in fl]), "ok"))
              for fl, st in zip(A["fl"], A.street)]
    return A


# ======================================================================= planted-error test
def plant(T, A, S, n=10, seed=7):
    """Copy of T with n planted errors of each kind on clean addresses, and the list of what was planted."""
    rng = np.random.default_rng(seed)
    T = T.copy(); truth = []
    T[["hn"]] = T.raw_hn.apply(lambda h: pd.Series(house(h)[:1]))
    clean = A[(A.f == "ok") & (A.tags == 1) & ~A.hn.str.contains("-")]
    used = set()
    def rows_of(a): return T.index[(T.raw_street == a.street) & (T.hn == a.hn)]
    def pick(pool):
        pool = [i for i in pool if i not in used]
        if not pool: return None
        i = pool[rng.integers(len(pool))]; used.add(i); return i
    # text: drop one letter from the middle of the street name
    for _ in range(n):
        i = pick([i for i in clean.index if len(clean.at[i, "street"]) >= 9]);  a = A.loc[i]
        if i is None: break
        s = a.street; k = int(rng.integers(3, len(s) - 3)); T.loc[rows_of(a), "raw_street"] = s[:k] + s[k + 1:]
        truth.append(("text", a.street, a.hn))
    # far: move the address 250 m away in a random direction (and check it really is far from its street)
    for _ in range(n):
        for _try in range(20):
            i = pick(list(clean.index)); a = A.loc[i]
            ang = rng.uniform(0, 2 * np.pi); p = translate(a.geometry, 250 * np.cos(ang), 250 * np.sin(ang))
            if S.any[a.street].distance(p) > FAR_M + 30: break
            used.discard(i)
        T.loc[rows_of(a), "geometry"] = p; truth.append(("far", a.street, a.hn))
    # dup: copy the address onto another address's location at least 150 m away
    for _ in range(n):
        i = pick(list(clean.index)); a = A.loc[i]
        far_ = A[(A.geometry.distance(a.geometry) > 150) & A.street.notna()]
        other = far_.iloc[int(rng.integers(len(far_)))]
        T.loc[len(T)] = {"raw_street": a.street, "raw_hn": a.hn, "geometry": other.geometry, "hn": a.hn}
        truth.append(("dup", a.street, a.hn))
    # side: mirror the address across its street
    side_pool = [i for i in clean.index if clean.at[i, "side_ok"] and clean.at[i, "dist"] >= 4]   # where the side check applies
    for _ in range(n):
        i = pick(side_pool); a = A.loc[i]
        q = nearest_points(S.lines[a.street], a.geometry)[0]
        T.loc[rows_of(a), "geometry"] = Point(2 * q.x - a.geometry.x, 2 * q.y - a.geometry.y)
        truth.append(("side", a.street, a.hn))
    # sequence: swap two numbers on the same side of a street that sit at least 40 m apart
    grp = clean[clean.seq_ok].groupby(["street", "side", "parity"])
    pairs = []
    for _, g in grp:
        g = g.sort_values("pos")
        if len(g) < MIN_GROUP + 2: continue
        for x in range(len(g)):
            for y in range(x + 2, len(g)):
                if g.pos.iloc[y] - g.pos.iloc[x] >= 40: pairs.append((g.index[x], g.index[y]))
    rng.shuffle(pairs); done = 0
    for x, y in pairs:
        if done >= n: break
        if x in used or y in used: continue
        used.update([x, y]); a, b = A.loc[x], A.loc[y]
        ra, rb = rows_of(a), rows_of(b)
        T.loc[ra, "geometry"], T.loc[rb, "geometry"] = b.geometry, a.geometry
        truth.append(("sequence", a.street, a.hn, b.hn)); done += 1
    return T.drop(columns=["hn"]), truth


def score(A2, truth):
    """How many planted errors of each kind the checks caught (and under which flag)."""
    key = {(r.street, r.hn): [k for k, _ in r.fl] for r in A2.itertuples() if isinstance(r.street, str)}
    out = {k: {"planted": 0, "caught": 0} for k in KINDS}
    for t in truth:
        k = t[0]; out[k]["planted"] += 1
        hns = t[2:]
        got = any(k in key.get((t[1], h), []) for h in hns)
        if k == "text":   # a typo is caught if the address is flagged as text under its real street
            got = any("text" in key.get((t[1], h), []) for h in hns)
        out[k]["caught"] += int(got)
    return out


# ======================================================================= export
class _Roads(osmium.SimpleHandler):
    def __init__(self): super().__init__(); self.rows = []
    def way(self, w):
        hw = w.tags.get("highway")
        if not hw or w.tags.get("area") == "yes": return
        pts = []
        for n in w.nodes:
            try: pts.append((round(n.lon, 6), round(n.lat, 6)))
            except osmium.InvalidLocationError: pass
        if len(pts) >= 2 and hw not in ("footway", "path", "steps", "cycleway", "corridor", "elevator", "platform", "construction"):
            k = "major" if hw.split("_")[0] in ("primary", "secondary", "tertiary", "trunk") else "minor"
            self.rows.append({"k": k, "geometry": LineString(pts).simplify(0.000005)})


def export_base(B, out, pbf=PBF):
    """Context for the map, from the same 2019 extract: building outlines and every highway line."""
    os.makedirs(out, exist_ok=True)
    h = _Roads(); h.apply_file(pbf, locations=True)
    R = gpd.GeoDataFrame(h.rows, geometry="geometry", crs=4326)
    Bd = gpd.GeoDataFrame({"k": ["b"] * len(B)}, geometry=B.to_crs(4326).geometry.simplify(0.000006), crs=4326)
    G = pd.concat([Bd, R], ignore_index=True)
    gj = json.loads(G.to_json(drop_id=True))
    rnd = lambda c: [round(c[0], 6), round(c[1], 6)] if isinstance(c[0], float) else [rnd(x) for x in c]
    for f in gj["features"]: f["geometry"]["coordinates"] = rnd(f["geometry"]["coordinates"])
    json.dump(gj, open(os.path.join(out, "base.geojson"), "w"), separators=(",", ":"))


def export(A, S, out, extra=None):
    os.makedirs(out, exist_ok=True)
    G = A.to_crs(4326)
    to4 = lambda xy: gpd.GeoSeries([Point(*xy)], crs=CRS).to_crs(4326).iloc[0]
    feats = []
    for p, r in zip(G.geometry, A.itertuples()):
        props = {"a": f"{r.written} {r.hn}", "f": r.f}
        if r.fl: props["why"] = [f"{k}: {w}" for k, w in r.fl]
        if r.text: props["as"] = r.written_as[:4]
        if r.twins: props["t"] = [[round(q.x, 6), round(q.y, 6)] for q in map(to4, r.twins)]
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(p.x, 6), round(p.y, 6)]}, "properties": props})
    json.dump({"type": "FeatureCollection", "features": feats}, open(os.path.join(out, "addresses.geojson"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    used = sorted(set(A.street.dropna()))
    def lines_of(n):
        ln = [g.boundary if g.geom_type == "Polygon" else g for g in getattr(S.any[n], "geoms", [S.any[n]])]
        m = linemerge(unary_union(ln)) if len(ln) > 1 else ln[0]
        return list(getattr(m, "geoms", [m]))
    parts = [(n, g) for n in used for g in lines_of(n)]
    L = gpd.GeoDataFrame({"name": [n for n, _ in parts]}, geometry=[g for _, g in parts], crs=CRS).to_crs(4326)
    L["geometry"] = L.geometry.simplify(0.00001)                     # lines only: pedestrian areas as their outline
    json.dump(json.loads(L.to_json(drop_id=True)), open(os.path.join(out, "streets.geojson"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    s = {"addresses": int(len(A)), "checked": int(A.street.notna().sum()), "streets": len(used),
         "flagged": int((~A.f.isin(["ok", "unchecked"])).sum()),
         "primary": {k: int((A.f == k).sum()) for k in KINDS + ["ok", "unchecked"]},
         "any": {k: int(sum(any(x[0] == k for x in fl) for fl in A["fl"])) for k in KINDS},
         "coverage": {"side": round(float(A.side_ok.sum() / A.street.notna().sum()), 3), "sequence": round(float(A.seq_ok.sum() / A.street.notna().sum()), 3)},
         "bbox": [round(v, 5) for v in G.total_bounds], "snapshot": "April 2019",
         "thresholds": {"far_m": FAR_M, "dup_m": DUP_M, "fuzzy": FUZZY, "min_group": MIN_GROUP, "majority": MAJORITY, "seq_tol_m": SEQ_TOL}}
    s.update(extra or {})
    json.dump(s, open(os.path.join(out, "summary.json"), "w"), indent=1)
    return s


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "out"
    T, B, S = load()
    A = check(T, B, S)
    test = {k: {"planted": 0, "caught": 0} for k in KINDS}
    for seed in range(1, 6):                                            # 5 rounds × 10 planted errors of each kind
        T2, truth = plant(T, A, S, n=10, seed=seed)
        for k, v in score(check(T2, B, S), truth).items():
            test[k]["planted"] += v["planted"]; test[k]["caught"] += v["caught"]
    s = export(A, S, out, {"tags": int(A.tags.sum()), "planted_test": test})
    export_base(B, out)
    print(json.dumps(s, indent=1))
