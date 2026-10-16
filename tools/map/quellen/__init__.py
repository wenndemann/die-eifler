"""Amtliche Höhenmodelle (DGM ohne Bäume/Häuser) der Länder, die die Eifel abdecken.

Jede Quelle: id, name, land, credit, lizenz, kacheln(bounds), laden(kachel_id, ziel_dir), groesse_mb(kachel_id).
`AMTLICH` in Prioritätsreihenfolge (beste/offenste zuerst). Copernicus (copernicus.py) gehört nicht hierher.
"""
from .lux import LUX
from .nrw import NRW
from .rlp import RLP
from .wal import WAL

AMTLICH = [NRW(), RLP(), LUX(), WAL()]

__all__ = ["AMTLICH", "NRW", "RLP", "LUX", "WAL"]
