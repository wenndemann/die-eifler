#!/usr/bin/env python3
"""Welt-Pipeline „Die Eifeler“: Rohdaten laden, Datenversion nach FORMAT.md rechnen, unter welt-daten/ ablegen.

    python3 tools/map/setup.py [--gebiet welt|nordeifel|nideggen] [--version NAME] [Optionen]

Läuft beim Entwickler/Server, nie beim Spieler. Setzt fort, wenn unterbrochen (fertige Stufen und Kacheln
werden übersprungen). Stufen: WorldCover, Höhe, OSM, Wasser, Kacheln, Hex-Kacheln, Übersicht/Orte, Manifest.
Siehe tools/map/README.md und tools/map/FORMAT.md.
"""
import argparse
import datetime
import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import util  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gebiet", default="welt", choices=["welt", "nordeifel", "nideggen"],
                    help="welt = alle 21×23 Kacheln, nordeifel = tx 5..10/tz 0..7, nideggen = tx 8..10/tz 3..5")
    ap.add_argument("--version", help="Versionsname (Standard eifel-JJJJ.MM, bei Teilgebiet mit -<gebiet>)")
    ap.add_argument("--daten", default=os.path.join(ROOT, "welt-daten"), help="Ausgabeordner (Standard welt-daten/)")
    ap.add_argument("--arbeit", default=os.path.join(HERE, "arbeit"), help="Arbeitsordner (Standard tools/map/arbeit/)")
    ap.add_argument("--archiv", help="Rohdaten nach Gebrauch dorthin verschieben statt löschen")
    ap.add_argument("--osm", default="auto", choices=["auto", "geofabrik", "overpass"])
    ap.add_argument("--nur-copernicus", action="store_true", help="amtliche Höhenmodelle auslassen")
    ap.add_argument("--jobs", type=int, default=4, help="parallele Downloads (Standard 4)")
    ap.add_argument("--neu", action="store_true", help="Neuberechnung erzwingen (heruntergeladene OSM-Rohdaten bleiben)")
    args = ap.parse_args()

    util.umgebung_proxy()
    import dem
    import bahn
    import hexkacheln
    import kacheln as kmod
    import osm_welt
    import uebersicht
    import wasser
    import welt
    import worldcover

    t_start = time.time()
    kach = welt.gebiet_kacheln(args.gebiet)
    heute = datetime.date.today()
    version = args.version or (f"eifel-{heute.year}.{heute.month:02d}" + ("" if args.gebiet == "welt" else f"-{args.gebiet}"))
    daten = os.path.abspath(args.daten)
    arbeit = os.path.abspath(args.arbeit)
    arbeit_ver = os.path.join(arbeit, version)
    ausgabe = os.path.join(daten, version)
    util.Roh.archiv = os.path.abspath(args.archiv) if args.archiv else None
    util.Roh.version = version
    os.makedirs(arbeit, exist_ok=True)
    print(f"== Die Eifeler: Weltdaten {version} ==  Gebiet {args.gebiet} ({len(kach)} Kacheln)\n"
          f"   Ausgabe {ausgabe}\n   Arbeit  {arbeit}", flush=True)
    if args.neu:
        for p in (arbeit_ver, ausgabe):
            util.loeschen(p)
        for sub in ("dem10", "wc10"):
            util.loeschen(os.path.join(arbeit, sub))
    zeiten = {}

    def stufe(name):
        class _S:
            def __enter__(s):
                s.t = time.time()
                print(f"\n-- {name}", flush=True)

            def __exit__(s, typ, *a):
                zeiten[name] = time.time() - s.t
                if typ is None:   # Fortschritt für Menschen und zum Nachsehen nach Abbruch
                    util.json_schreiben(os.path.join(arbeit, "status.json"),
                                        {"version": version, "gebiet": args.gebiet, "fertig": False,
                                         "letzte_stufe": name, "zeiten": zeiten}, indent=1)
        return _S()

    # Signatur der Version: ändert sich Gebiet oder Höhenquellen, sind abgeleitete Kachelstufen ungültig
    amtlich = [] if args.nur_copernicus else dem.amtliche_quellen()
    sig = {"gebiet": args.gebiet, "kacheln": [list(min(kach)), list(max(kach)), len(kach)], "quellen": dem.quellen_codes(amtlich), "format": 1}
    alt = util.json_lesen(os.path.join(arbeit_ver, "signatur.json"))
    if alt is not None and alt != sig:
        print("Einstellungen haben sich geändert: Kachelstufen dieser Version werden neu gerechnet")
        util.loeschen(arbeit_ver)
        util.loeschen(ausgabe)
    util.json_schreiben(os.path.join(arbeit_ver, "signatur.json"), sig)

    # 2. WorldCover, 1. Höhe
    with stufe("WorldCover (Bedeckung, 10 m)"):
        worldcover.bauen(kach, arbeit)
    with stufe("Höhe (amtlich + Copernicus, 10 m)"):
        fehler, codes = dem.bauen(kach, arbeit, lambda tx, tz: worldcover.mit_rand(arbeit, tx, tz), args.nur_copernicus, args.jobs)
    if fehler:
        sys.exit(f"{len(fehler)} Höhenkacheln unvollständig ({fehler[:5]} ...). Bitte erneut starten.")

    # 3. OSM
    with stufe("OpenStreetMap"):
        elems = osm_welt.lade(kach, arbeit, args.osm)
        proj = welt.WeltProjektor()
        wege_elems = None
        if not any(e["type"] == "relation" and e.get("tags", {}).get("route") == "hiking" for e in elems):
            # Overpass-Weg: Wanderrouten extra holen (Geofabrik-Auszug enthält sie schon)
            wege_elems = osm_welt.lade_wege_overpass(kach, arbeit) if args.osm != "geofabrik" else []
        print(f"{len(elems)} OSM-Elemente")
        from shapely.ops import unary_union
        from shapely.geometry import box as _box
        gebiet_box = unary_union([_box(*welt.kachel_grenzen(*k)) for k in kach])

    # 4. Wasser am Stück
    dem_mos = kmod.Mosaik(dem.lader(arbeit), np.float32, np.nan, cache=16)
    with stufe("Wasser (Seen, Flussketten für das ganze Gebiet)"):
        if os.path.exists(wasser.pfad(arbeit_ver)):
            print("schon berechnet")
        else:
            wasser.bauen(elems, proj, dem_mos, arbeit_ver)
    wd = wasser.laden(arbeit_ver)

    # 5. Kacheln
    stufen_marker = os.path.join(arbeit_ver, "stufen.json")
    with stufe("Kacheln (r10, r40, vec)"):
        wk = kmod.WeltKacheln(arbeit, arbeit_ver, ausgabe, kach, elems, proj, wd)
        todo = [k for k in kach if args.neu or not wk.fertig(*k)]
        print(f"{len(kach) - len(todo)} Kacheln fertig, {len(todo)} zu rechnen")
        fp = util.Fortschritt("Kacheln", len(todo))
        for tx, tz in todo:
            st = wk.bauen(tx, tz)
            fp.schritt(f"Kachel {tx}_{tz}  Höhe {st['min']:.0f}–{st['max']:.0f} m")
        if todo:
            util.loeschen(stufen_marker)
    marker = util.json_lesen(stufen_marker, {})

    # 5b. Bahnstrecken
    with stufe("Bahnstrecken (rails in vec, Hex-Flag)"):
        if "bahn" in marker and os.path.exists(os.path.join(arbeit_ver, "bahn.pkl")):
            ketten = bahn.laden(arbeit_ver)
            print("schon berechnet")
        else:
            bahn_elems = elems
            if not any(e["type"] == "way" and e.get("tags", {}).get("railway") for e in elems):
                bahn_elems = osm_welt.lade_bahn_overpass(kach, arbeit) if args.osm != "geofabrik" else elems
            ketten = bahn.bauen(bahn_elems, proj, arbeit_ver, wd["fluesse"])
            nr = bahn.vec_ergaenzen(ausgabe, kach, ketten)
            marker["bahn"] = nr
            marker.pop("hex", None)
            marker.pop("uebersicht", None)
            util.json_schreiben(stufen_marker, marker)
        je = {}
        for c in ketten:
            je[c["n"] or "(ohne Name)"] = je.get(c["n"] or "(ohne Name)", 0.0) + c["laenge"]
        print(f"{len(ketten)} Gleisketten, {sum(je.values()) / 1000:.1f} km")
        for n_, l_ in sorted(je.items(), key=lambda t: -t[1])[:15]:
            print(f"   {n_}  {l_ / 1000:.1f} km")

    # Quellen je Kachel
    quellen = {}
    ql = dem.quellen_lader(arbeit)
    for tx, tz in kach:
        q = ql(tx, tz)
        ids = [codes[c] for c in sorted(set(np.unique(q).tolist()) - {0})]
        ids = [i for i in ids if i != "cop"] + (["cop"] if "cop" in ids else [])
        quellen[f"{tx}_{tz}"] = ids

    # 6. Hex-Kacheln
    fertig = kmod.fertig_lader(arbeit_ver)
    orte_roh = osm_welt.orte(elems, proj)
    grenzlinien = osm_welt.grenzlinien(elems, proj)
    with stufe("Hex-Kacheln (Simulationsdaten)"):
        erg = util.json_lesen(os.path.join(arbeit_ver, "hex_ergebnis.json"))
        if erg is None or "hex" not in marker:
            land = {}
            for q in amtlich:
                l = welt.LAENDER.get(str(q.land).upper()) if q.land else None
                if l:
                    land[q.id] = l
            hexliste, orte, hstat, _ = hexkacheln.bauen(kach, arbeit, arbeit_ver, ausgabe, fertig, codes, land,
                                                        orte_roh, grenzlinien, version, bahn.hex_punkte(ketten))
            erg = {"hex": hexliste, "orte": orte, "stat": hstat}
            util.json_schreiben(os.path.join(arbeit_ver, "hex_ergebnis.json"), erg)
            marker["hex"] = True
            marker.pop("uebersicht", None)
            util.json_schreiben(stufen_marker, marker)
        else:
            print("schon berechnet")
        hexliste, orte, hstat = erg["hex"], erg["orte"], erg["stat"]

    # 7. Übersicht und Orte
    with stufe("Übersicht und Orte"):
        if "uebersicht" in marker and os.path.exists(os.path.join(ausgabe, "uebersicht", "wanderwege.json")):
            print("schon berechnet")
            hr = marker["uebersicht"]
        else:
            lo, hi = uebersicht.hoehe_und_relief(kach, fertig, ausgabe)
            ng = uebersicht.grenzen(grenzlinien, ausgabe)
            no, ngw = uebersicht.orte_json(orte, orte_roh, wd["labels"], kach, ausgabe)
            wege = osm_welt.wanderwege(wege_elems or elems, proj, gebiet_box)
            nw = uebersicht.wanderwege(wege, ausgabe)
            marker["wege"] = [[w["n"] or w["ref"], w["netz"], w["laenge"]] for w in wege]
            hr = [lo, hi, ng, no, ngw, nw]
            marker["uebersicht"] = hr
            util.json_schreiben(stufen_marker, marker)
        print(f"Höhe {hr[0]:.0f}–{hr[1]:.0f} m, {hr[2]} Grenzlinien, {hr[3]} Orte, {hr[4]} Gewässernamen, "
              f"{hr[5]} Wanderrouten")
        for n_, netz_, l_ in marker.get("wege", [])[:40]:
            print(f"   {netz_}  {n_}  {l_ / 1000:.1f} km im Gebiet")

    # 8. Manifest
    with stufe("Manifest"):
        used = sorted({i for v in quellen.values() for i in v})
        credits = []
        if "cop" in used:
            credits.append(dem.kopernikus().credit)
        credits.append(worldcover.CREDIT)
        credits.append(osm_welt.CREDIT)
        credits += [q.credit for q in amtlich if q.id in used]
        files = {}
        for sub in ("r10", "r40", "vec", "hex", "uebersicht"):
            d = os.path.join(ausgabe, sub)
            for fn in sorted(os.listdir(d)) if os.path.isdir(d) else []:
                files[f"{sub}/{fn}"] = util.sha256_entpackt(os.path.join(d, fn))
        files["orte.json"] = util.sha256_entpackt(os.path.join(ausgabe, "orte.json"))
        erstellt = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        manifest = {
            "format": 1, "version": version, "gebiet": args.gebiet, "erstellt": erstellt,
            "crs": "EPSG:25832", "origin": [welt.E0, welt.N0], "size": [welt.WELT_X, welt.WELT_Z],
            "tile": welt.KACHEL, "tiles": [welt.NTX, welt.NTZ], "kacheln": [list(k) for k in kach],
            "hex": {"size": int(welt.R), "tile": welt.HEX_TILE, "tiles": [welt.HEX_NTX, welt.HEX_NTZ],
                    "cols": welt.HEX_COLS, "rows": welt.HEX_ROWS, "terrain": welt.HEX_TERRAIN,
                    "fields": welt.HEX_FIELDS, "kacheln": hexliste},
            "cover": welt.COVER, "heightRange": [round(hr[0], 1), round(hr[1], 1)],
            "quellen": quellen, "files": files, "credits": credits,
        }
        util.json_schreiben(os.path.join(ausgabe, "manifest.json"), manifest, indent=1)
        vpfad = os.path.join(daten, "versions.json")
        v = util.json_lesen(vpfad, {"aktuell": version, "versionen": []})
        v["versionen"] = [x for x in v.get("versionen", []) if x.get("id") != version]
        v["versionen"].append({"id": version, "gebiet": args.gebiet, "erstellt": erstellt})
        v["aktuell"] = version
        util.json_schreiben(vpfad, v, indent=1)
        print(f"{len(files)} Dateien im Manifest, versions.json: aktuell = {version}")

    # Zusammenfassung
    gross = 0
    for dp, _, fns in os.walk(ausgabe):
        gross += sum(os.path.getsize(os.path.join(dp, f)) for f in fns)
    print("\n== Zusammenfassung ==")
    print(f"Version {version}, Gebiet {args.gebiet}: {len(kach)} Kacheln, {len(hexliste)} Hex-Kacheln, "
          f"{gross / 1e6:.1f} MB unter {ausgabe}")
    t = hstat["terrain"]
    print("Hexe: " + ", ".join(f"{k} {v}" for k, v in t.items()) + f"  (gesamt {hstat['hexe']})")
    print("Bauplatz: " + ", ".join(f"{k} {v}" for k, v in hstat["bauplatz"].items()) +
          f";  Ortskerne {hstat['ortskerne']} (Orte ohne Kern: {hstat['orte_ohne_kern']})")
    print("Land: " + ", ".join(f"{k} {v}" for k, v in hstat["land"].items()))
    print("Zeiten: " + ", ".join(f"{k.split(' (')[0]} {v:.0f} s" for k, v in zeiten.items()) +
          f";  gesamt {time.time() - t_start:.0f} s")
    if util.Roh.archiv:
        print(f"Rohdaten archiviert unter {util.Roh.archiv}")
    util.json_schreiben(os.path.join(arbeit, "status.json"),
                        {"version": version, "gebiet": args.gebiet, "fertig": manifest["erstellt"], "zeiten": zeiten},
                        indent=1)
    # Arbeitsordner aufräumen: leere Rohordner
    shutil.rmtree(os.path.join(arbeit, "roh"), ignore_errors=True) if not util.Roh.archiv else None


if __name__ == "__main__":
    main()
