"""Build levels.json from Databento OPRA open-interest files (statistics schema, CSV, map_symbols=True).

usage: python compute_levels.py --date 2026-11-16 --oi-date 2026-11-13 \
         --spx-oi spx.csv.zst --spx-spot 7561.67 --es-basis 23 \
         --ndx-oi ndx.csv.zst --ndx-spot 27950 --nq-basis 100
Any index whose --*-oi file is missing is written as null.
"""
import argparse, json, os
import pandas as pd

def walls(path, spot, basis, oi_date, horizon_days=14, band=0.05):
    df = pd.read_csv(path)
    df = df[df.stat_type == 9].sort_values("ts_event").groupby("symbol").last().reset_index()
    sym = df.symbol.str.rstrip()
    df["exp"] = pd.to_datetime(sym.str[-15:-9], format="%y%m%d")
    df["cp"] = sym.str[-9]
    df["k"] = sym.str[-8:].astype(int) / 1000
    d0 = pd.Timestamp(oi_date)
    w = df[(df.exp >= d0) & (df.exp <= d0 + pd.Timedelta(days=horizon_days)) & df.k.between(spot * (1 - band), spot * (1 + band))]
    g = w.groupby(["cp", "k"]).quantity.sum()
    puts, calls = g["P"].nlargest(2), g["C"].nlargest(2)
    r = lambda x: round(float(x) + basis, 2)
    return {
        "put_wall": r(puts.index[0]), "call_wall": r(calls.index[0]),
        "put_2": r(puts.index[1]), "call_2": r(calls.index[1]),
        "index_put_wall": float(puts.index[0]), "index_call_wall": float(calls.index[0]),
        "put_wall_oi": int(puts.iloc[0]), "call_wall_oi": int(calls.iloc[0]),
        "pc_oi_ratio": round(float(g["P"].sum() / g["C"].sum()), 2),
        "basis": basis, "index_spot": spot,
    }

p = argparse.ArgumentParser()
for a in ["date", "oi-date", "spx-oi", "ndx-oi"]: p.add_argument("--" + a)
for a in ["spx-spot", "es-basis", "ndx-spot", "nq-basis"]: p.add_argument("--" + a, type=float)
a = p.parse_args()
out = {"date": a.date, "oi_date": a.oi_date, "source": "Databento OPRA open interest; futures level = strike + basis",
       "ES": walls(a.spx_oi, a.spx_spot, a.es_basis, a.oi_date) if a.spx_oi and os.path.exists(a.spx_oi) else None,
       "NQ": walls(a.ndx_oi, a.ndx_spot, a.nq_basis, a.oi_date) if a.ndx_oi and os.path.exists(a.ndx_oi) else None}
json.dump(out, open("levels.json", "w"), indent=2)
print(json.dumps(out, indent=2))
