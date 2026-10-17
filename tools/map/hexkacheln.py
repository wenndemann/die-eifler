"""Stufe 6: Hex-Kacheln (Simulationsdaten, alles Ganzzahl) nach FORMAT.md.

Ablauf: Werte aller Hexe des Gebiets aus den fertigen 10-m-Kacheln rechnen (Welt-Hexfeld liegt im Speicher,
1213×1534), Land je Hex aus den Staatsgrenzen, Ortskerne setzen, Bauplatz und Flags ableiten, dann in
Hex-Kacheln schneiden und schreiben.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import welt
from mosaik import Mosaik
from util import Fortschritt, gz_schreiben

C = welt.C
KREIS = 0.85 * welt.R
HEX_FUER_COVER = np.array([0, 1, 1, 2, 3, 4, 5, 1], np.uint8)   # wasser wiese acker wald heide moor fels siedlung -> Hex-Gelände
RASTER_LAND = 50.0
T_WASSER, T_WIESE, T_WALD, T_HEIDE, T_MOOR, T_STEIN, T_SIEDLUNG = range(7)


def stack_lader(fertig):
    def f(tx, tz):
        d = fertig(tx, tz)
        if d is None:
            return None
        return np.stack([d["hoehe"], d["bedeckung"].astype(np.uint16), d["wasser"], d["steil"].astype(np.uint16),
                         d["lauf"].astype(np.uint16)], axis=-1)
    return f


def hex_werte(mosaik, col0, row0, ncol, nrow):
    """Werte der Hexe (col0.., row0..) aus dem 10-m-Mosaik. Liefert Dict von Arrays [nrow, ncol]."""
    cols, rows = np.meshgrid(np.arange(col0, col0 + ncol), np.arange(row0, row0 + nrow))
    cx, cz = welt.hex_mitte_cr(cols, rows)
    cx, cz = cx.ravel(), cz.ravel()
    ic, jc = np.floor(cx / 10).astype(int), np.floor(cz / 10).astype(int)
    pad = 7
    i0, j0 = int(ic.min()) - pad, int(jc.min()) - pad
    w, h = int(ic.max()) + pad + 1 - i0, int(jc.max()) + pad + 1 - j0
    win, ok = mosaik.fenster(i0, j0, w, h)
    r = np.arange(-6, 7)
    dj, di = np.meshgrid(r, r, indexing="ij")
    jj = jc[:, None, None] + dj[None] - j0
    ii = ic[:, None, None] + di[None] - i0
    dx = (ic[:, None, None] + di[None]) * 10.0 + 5.0 - cx[:, None, None]
    dz = (jc[:, None, None] + dj[None]) * 10.0 + 5.0 - cz[:, None, None]
    inside = dx * dx + dz * dz <= KREIS * KREIS
    vals = win[jj, ii]                      # [K,13,13,5]
    okk = ok[jj, ii]
    gueltig = ~(inside & ~okk).any(axis=(1, 2)) & (inside.sum(axis=(1, 2)) > 0)
    n = np.maximum(inside.sum(axis=(1, 2)), 1)
    cover = vals[..., 1].astype(np.int64)
    anteil = np.stack([((cover == k) & inside).sum(axis=(1, 2)) for k in range(len(welt.COVER))], axis=1) / n[:, None]
    hoehe = (vals[..., 0].astype(np.float64) * inside).sum(axis=(1, 2)) / n
    steil = (vals[..., 3].astype(np.float64) * inside).sum(axis=(1, 2)) / n / 2.0
    lauf = ((vals[..., 4] > 0) & inside).any(axis=(1, 2))
    out = {"gueltig": gueltig, "anteil": anteil, "hoehe": hoehe, "steil": steil, "lauf": lauf}
    return {k: v.reshape((nrow, ncol) + v.shape[1:]) for k, v in out.items()}


def gelaende(anteil, steil):
    """Terrain-Index je Hex (ohne Siedlung): Mehrheit im Kreis 0,85·R wie im früheren Konverter."""
    a = anteil.copy()
    t = np.zeros(a.shape[:-1], np.uint8)
    wasser = a[..., C["wasser"]] >= 0.5
    stein = ~wasser & ((a[..., C["fels"]] >= 0.3) | (steil > 22))
    b = a.copy()
    b[..., C["wiese"]] += b[..., C["acker"]] + b[..., C["siedlung"]]
    b[..., C["acker"]] = 0
    b[..., C["siedlung"]] = 0
    b[..., C["wasser"]] = 0
    t = HEX_FUER_COVER[b.argmax(axis=-1)]
    t = np.where(stein, T_STEIN, t)
    t = np.where(wasser, T_WASSER, t)
    return t.astype(np.uint8)


# ----------------------------------------------------------------- Land
def land_raster(kacheln, arbeit, codes, amtlich_land, grenzen, start_xz):
    """Land je 50-m-Zelle der Welt: Staatsgrenzen rastern, Zusammenhangskomponenten, Land per Mehrheit der
    Höhen-Quelle, sonst Startpunkte. Liefert (uint8[nz, nx], Grenz-Hexe als Menge (q, r))."""
    import dem as demmod
    nx, nz = int(welt.WELT_X / RASTER_LAND), int(welt.WELT_Z / RASTER_LAND)
    img = Image.new("L", (nx, nz), 0)
    dr = ImageDraw.Draw(img)
    for line in grenzen:
        dr.line([(x / RASTER_LAND, z / RASTER_LAND) for x, z in line], fill=1, width=1)
    grenze = np.asarray(img, np.uint8) > 0
    lab, n = ndimage.label(~grenze)           # 4er-Nachbarschaft: 8-zusammenhängende Linie ist dicht
    # Stimmen der Höhenquellen
    code_land = np.zeros(256, np.uint8)
    for i, cid in enumerate(codes):
        code_land[i] = amtlich_land.get(cid, 0)
    votes = np.zeros((n + 1, 5), np.int64)
    sub = int(RASTER_LAND / 10)
    per = welt.N10 // sub
    ql = demmod.quellen_lader(arbeit)
    for tx, tz in kacheln:
        q = ql(tx, tz)
        if q is None:
            continue
        land = code_land[q[sub // 2::sub, sub // 2::sub]]
        l = lab[tz * per:(tz + 1) * per, tx * per:(tx + 1) * per]
        np.add.at(votes, (l.ravel(), land.ravel()), 1)
    comp_land = np.zeros(n + 1, np.uint8)
    v = votes[:, 1:]
    has = v.sum(axis=1) > 0
    comp_land[has] = 1 + v[has].argmax(axis=1)
    # Rückfall: Startpunkte, dann nächster Startpunkt zum Schwerpunkt
    starts = {}
    for land, (x, z) in start_xz.items():
        i, j = int(x / RASTER_LAND), int(z / RASTER_LAND)
        if 0 <= i < nx and 0 <= j < nz and lab[j, i] > 0:
            starts[land] = lab[j, i]
    for land, l in starts.items():
        if not has[l] and comp_land[l] == 0:
            comp_land[l] = land
    rest = np.flatnonzero((comp_land == 0) & (np.arange(n + 1) > 0))
    if rest.size:
        jj, ii = np.indices(lab.shape)
        cnt = np.bincount(lab.ravel(), minlength=n + 1).astype(float)
        cxm = np.bincount(lab.ravel(), weights=ii.ravel(), minlength=n + 1) / np.maximum(cnt, 1)
        czm = np.bincount(lab.ravel(), weights=jj.ravel(), minlength=n + 1) / np.maximum(cnt, 1)
        for l in rest:
            d = {land: math.hypot(cxm[l] * RASTER_LAND - x, czm[l] * RASTER_LAND - z) for land, (x, z) in start_xz.items()}
            comp_land[l] = min(d, key=d.get)
    land = comp_land[lab]
    land[grenze] = 0
    _, (ii, jj) = ndimage.distance_transform_edt(land == 0, return_indices=True)
    land = land[ii, jj]
    # Hexe mit Grenze: Linien verdichten und in Hexe umrechnen
    gh = set()
    for line in grenzen:
        p = np.asarray(line, float)
        if len(p) < 2:
            continue
        d = np.hypot(*np.diff(p, axis=0).T)
        pts = [p[:1]]
        for k in range(len(d)):
            m = max(1, int(math.ceil(d[k] / 25.0)))
            t = (np.arange(1, m + 1) / m)[:, None]
            pts.append(p[k] + (p[k + 1] - p[k]) * t)
        pts = np.concatenate(pts)
        q, r = welt.xz_zu_hex(pts[:, 0], pts[:, 1])
        gh.update(zip(q.tolist(), r.tolist()))
    return land.astype(np.uint8), gh, int(n)


# ----------------------------------------------------------------- Hauptablauf
def bauen(kacheln, arbeit, arbeit_ver, ausgabe, fertig, codes, amtlich_land, orte_roh, grenzen, version, bahn_pts=None):
    """Rechnet alle Hex-Kacheln. Liefert (hexkacheln, orte_liste, statistik)."""
    mos = Mosaik(stack_lader(fertig), np.uint16, 0, cache=12, extra=(5,))
    HC, HR = welt.HEX_COLS, welt.HEX_ROWS
    terrain = np.zeros((HR, HC), np.uint8)
    hoehe = np.zeros((HR, HC), np.uint16)
    steil = np.zeros((HR, HC), np.uint8)
    flags = np.zeros((HR, HC), np.uint8)
    gueltig = np.zeros((HR, HC), bool)
    fluss = np.zeros((HR, HC), bool)

    # 1. Werte aller Hexe, kachelweise
    hk = welt.gebaute_hexkacheln(kacheln)
    fp = Fortschritt("Hex", len(hk))
    for hx, hz in hk:
        c0, r0 = hx * welt.HEX_TILE, hz * welt.HEX_TILE
        nc, nr = min(welt.HEX_TILE, HC - c0), min(welt.HEX_TILE, HR - r0)
        w = hex_werte(mos, c0, r0, nc, nr)
        s = (slice(r0, r0 + nr), slice(c0, c0 + nc))
        gueltig[s] = w["gueltig"]
        terrain[s] = gelaende(w["anteil"], w["steil"])
        hoehe[s] = np.round(w["hoehe"]).astype(np.uint16)
        steil[s] = np.clip(np.round(w["steil"]), 0, 255).astype(np.uint8)
        fluss[s] = w["lauf"]
        fp.schritt(f"Hex-Kachel {hx}_{hz}")
    terrain[~gueltig] = 0
    hoehe[~gueltig] = 0
    steil[~gueltig] = 0

    # 2. Land und Staatsgrenzen
    start_xz = {l: welt.lonlat_zu_xz(*ll) for l, ll in welt.LAND_START.items()}
    start_xz = {l: (float(x), float(z)) for l, (x, z) in start_xz.items()}
    land50, grenz_hexe, ncomp = land_raster(kacheln, arbeit, codes, amtlich_land, grenzen, start_xz)
    cols, rows = np.meshgrid(np.arange(HC), np.arange(HR))
    cx, cz = welt.hex_mitte_cr(cols, rows)
    country = land50[np.clip((cz / RASTER_LAND).astype(int), 0, land50.shape[0] - 1),
                     np.clip((cx / RASTER_LAND).astype(int), 0, land50.shape[1] - 1)].astype(np.uint8)
    country[~gueltig] = 0
    grenzflag = np.zeros((HR, HC), bool)
    for q, r in grenz_hexe:
        c = q + (r - (r & 1)) // 2
        if 0 <= r < HR and 0 <= c < HC:
            grenzflag[r, c] = True

    # 3. Ortskerne
    rang = {"stadt": 0, "dorf": 1, "weiler": 2}
    ortskern = np.zeros((HR, HC), bool)
    place = np.zeros((HR, HC), np.uint16)
    orte = []
    kandidaten = sorted(((rg, dq, dr) for dq in range(-3, 4) for dr in range(-3, 4)
                         for rg in [welt.hex_abstand(0, 0, dq, dr)] if rg <= 3), key=lambda t: t[0])
    for o in orte_roh:
        q0, r0 = (int(v) for v in welt.xz_zu_hex(o["x"], o["z"]))
        c0 = q0 + (r0 - (r0 & 1)) // 2
        if not (0 <= r0 < HR and 0 <= c0 < HC) or not gueltig[r0, c0]:
            continue
        # Kandidaten nach Ring, dann nach Abstand zum Ortspunkt
        cand = []
        for rg, dq, dr in kandidaten:
            q, r = q0 + dq, r0 + dr
            c = q + (r - (r & 1)) // 2
            if not (0 <= r < HR and 0 <= c < HC):
                continue
            hx_, hz_ = welt.hex_mitte(q, r)
            cand.append((rg, math.hypot(hx_ - o["x"], hz_ - o["z"]), q, r, c))
        cand.sort()
        wahl = None
        for rg, _, q, r, c in cand:
            if gueltig[r, c] and terrain[r, c] not in (T_WASSER, T_STEIN) and not ortskern[r, c]:
                wahl = (q, r, c)
                break
        if wahl is None:
            orte.append({**o, "q": q0, "r": r0, "kern": False, "land": int(country[r0, c0])})
            continue
        q, r, c = wahl
        orte.append({**o, "q": q, "r": r, "kern": True, "land": int(country[r, c])})
        ortskern[r, c] = True
        place[r, c] = len(orte)         # Index+1 in der Liste "orte" (Reihenfolge = Ausgabereihenfolge)
        terrain[r, c] = T_SIEDLUNG
        if o["kind"] == "stadt":
            for ncol, nrow in welt.hex_nachbarn_cr(np.array([c]), np.array([r])):
                nc_, nr_ = int(ncol[0]), int(nrow[0])
                if 0 <= nr_ < HR and 0 <= nc_ < HC and gueltig[nr_, nc_] and terrain[nr_, nc_] not in (T_WASSER, T_STEIN):
                    terrain[nr_, nc_] = T_SIEDLUNG
    # 4. Bauplatz
    build = np.zeros((HR, HC), np.uint8)
    maxdh = np.zeros((HR, HC))
    hf = hoehe.astype(np.float64)
    for nc_, nr_ in welt.hex_nachbarn_cr(cols, rows):
        ok = (nr_ >= 0) & (nr_ < HR) & (nc_ >= 0) & (nc_ < HC)
        nci, nri = np.clip(nc_, 0, HC - 1), np.clip(nr_, 0, HR - 1)
        ok &= gueltig[nri, nci]
        d = np.where(ok, np.abs(hf[nri, nci] - hf), 0.0)
        maxdh = np.maximum(maxdh, d)
    winkel = np.degrees(np.arctan2(maxdh / 10.0, welt.HEX_W))
    build = np.where(winkel <= 5, 3, np.where(winkel <= 10, 2, np.where(winkel <= 18, 1, 0))).astype(np.uint8)
    build[(terrain == T_WASSER) | (terrain == T_STEIN)] = 0
    build[terrain == T_MOOR] = np.minimum(build[terrain == T_MOOR], 1)
    build[~gueltig] = 0
    # 5. Flags (Bahnstrecken: Hexe, durch die ein Gleis läuft)
    bahnflag = np.zeros((HR, HC), bool)
    if bahn_pts is not None and len(bahn_pts):
        bq, br_ = welt.xz_zu_hex(bahn_pts[:, 0], bahn_pts[:, 1])
        bc = bq + (br_ - (br_ & 1)) // 2
        m = (br_ >= 0) & (br_ < HR) & (bc >= 0) & (bc < HC)
        bahnflag[br_[m], bc[m]] = True
    bahnflag &= gueltig
    build[bahnflag] = 0
    ufer = np.zeros((HR, HC), bool)
    for nc_, nr_ in welt.hex_nachbarn_cr(cols, rows):
        ok = (nr_ >= 0) & (nr_ < HR) & (nc_ >= 0) & (nc_ < HC)
        nci, nri = np.clip(nc_, 0, HC - 1), np.clip(nr_, 0, HR - 1)
        ufer |= ok & gueltig[nri, nci] & (terrain[nri, nci] == T_WASSER)
    flags = (ortskern.astype(np.uint8) | (fluss.astype(np.uint8) << 1) | (ufer.astype(np.uint8) << 2)
             | (grenzflag.astype(np.uint8) << 3) | ((~gueltig).astype(np.uint8) << 4) | (bahnflag.astype(np.uint8) << 5)).astype(np.uint8)
    flags[~gueltig] = 16
    for a in (terrain, hoehe, steil, build, country, place):
        a[~gueltig] = 0

    # 6. Schreiben
    hexliste = []
    for hx in range(welt.HEX_NTX):
        for hz in range(welt.HEX_NTZ):
            r0, c0 = hz * 64, hx * 64
            feld = {}
            for name, arr, dt, fuell in (("terrain", terrain, "u1", 0), ("height", hoehe, "<u2", 0), ("slope", steil, "u1", 0),
                                         ("build", build, "u1", 0), ("flags", flags, "u1", 16),
                                         ("country", country, "u1", 0), ("place", place, "<u2", 0)):
                blk = np.full((64, 64), fuell, dt)
                sub = arr[r0:r0 + 64, c0:c0 + 64]
                blk[:sub.shape[0], :sub.shape[1]] = sub
                feld[name] = blk
            gv = np.zeros((64, 64), bool)
            sub = gueltig[r0:r0 + 64, c0:c0 + 64]
            gv[:sub.shape[0], :sub.shape[1]] = sub
            if not gv.any():
                continue
            data = b"".join(feld[n].astype(dt).tobytes() for n, dt in (
                ("terrain", "u1"), ("height", "<u2"), ("slope", "u1"), ("build", "u1"), ("flags", "u1"),
                ("country", "u1"), ("place", "<u2")))
            gz_schreiben(os.path.join(ausgabe, "hex", f"{hx}_{hz}.bin.gz"), data)
            hexliste.append([hx, hz])
    stat = {
        "hexe": int(gueltig.sum()),
        "terrain": {welt.HEX_TERRAIN[i]: int(((terrain == i) & gueltig).sum()) for i in range(7)},
        "bauplatz": {n: int(((build == i) & gueltig).sum()) for i, n in enumerate(["keiner", "klein", "mittel", "gross"])},
        "ortskerne": int(ortskern.sum()),
        "orte_ohne_kern": sum(1 for o in orte if not o["kern"]),
        "land": {n: int(((country == v) & gueltig).sum()) for n, v in welt.LAENDER.items()},
        "komponenten": ncomp,
        "grenz_hexe": int((grenzflag & gueltig).sum()),
        "fluss_hexe": int((fluss & gueltig).sum()),
        "bahn_hexe": int(bahnflag.sum()),
    }
    return hexliste, orte, stat, dict(terrain=terrain, hoehe=hoehe, steil=steil, build=build, flags=flags,
                                      country=country, place=place, gueltig=gueltig)
