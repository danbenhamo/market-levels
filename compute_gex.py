"""Build gex.json for the "Options GEX" ATAS indicator from Databento OPRA files.

Inputs per index (CSV from `c.timeseries.get_range(...).to_df().to_csv(path, index=False)`):
  --spx-oi   statistics at <day>T11:30 UTC for SPXW.OPT + SPX.OPT   (open interest, stat_type 9)
  --spx-q    cbbo-1m at the previous close minute (20:58–20:59 UTC in US winter) for SPXW.OPT + SPX.OPT
  --ndx-oi / --ndx-q   the same for NDX.OPT + NDXP.OPT
  --spx-spot / --ndx-spot   index close at the quote time; --es-basis / --nq-basis   futures minus index
  --quote-time   UTC time of the quotes, e.g. 2026-11-18T21:00

usage: python compute_gex.py --date 2026-11-20 --quote-time 2026-11-18T21:00 \
         --spx-oi spx_oi.csv --spx-q spx_q.csv --spx-spot 7323.63 --es-basis 16 \
         --ndx-oi ndx_oi.csv --ndx-q ndx_q.csv --ndx-spot 27116.26 --nq-basis 74

The indicator recomputes gamma live from the current chart price, so this file only has to hold, for every
contract near the money: strike, expiry, call/put open interest and implied volatility.
"""
import argparse, json, math
import numpy as np
import pandas as pd

R = 0.04            # risk-free rate used for implied vol and gamma
AM_ROOTS = {"SPX", "NDX"}   # monthly AM-settled roots expire at the open; weeklies/PM roots at the close


def parse(df):
    s = df.symbol.str.rstrip()
    out = pd.DataFrame({
        "root": s.str[:6].str.strip(),
        "exp": pd.to_datetime(s.str[-15:-9], format="%y%m%d"),
        "cp": s.str[-9],
        "k": s.str[-8:].astype(int) / 1000,
    })
    return pd.concat([df.reset_index(drop=True), out], axis=1)


def expiry_utc(row_exp, root):
    return row_exp + pd.Timedelta(hours=14, minutes=30) if root in AM_ROOTS else row_exp + pd.Timedelta(hours=21)


def bs_price(S, K, T, v, call):
    d1 = (math.log(S / K) + (R + v * v / 2) * T) / (v * math.sqrt(T))
    d2 = d1 - v * math.sqrt(T)
    N = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))
    return S * N(d1) - K * math.exp(-R * T) * N(d2) if call else K * math.exp(-R * T) * N(-d2) - S * N(-d1)


def implied_vol(price, S, K, T, call):
    intrinsic = max(0.0, (S - K * math.exp(-R * T)) if call else (K * math.exp(-R * T) - S))
    if price <= intrinsic + 1e-6 or T <= 0:
        return None
    lo, hi = 0.01, 3.0
    if bs_price(S, K, T, hi, call) < price:
        return None
    for _ in range(60):
        mid = (lo + hi) / 2
        if bs_price(S, K, T, mid, call) > price: hi = mid
        else: lo = mid
    return (lo + hi) / 2


def gamma(S, K, T, v):
    if T <= 0 or v <= 0: return 0.0
    d1 = (math.log(S / K) + (R + v * v / 2) * T) / (v * math.sqrt(T))
    return math.exp(-d1 * d1 / 2) / math.sqrt(2 * math.pi) / (S * v * math.sqrt(T))


def build(oi_path, q_path, spot, basis, run_date, quote_time, horizon_days, band):
    oi = parse(pd.read_csv(oi_path))
    oi = oi[oi.stat_type == 9].sort_values("ts_event").groupby("symbol").last().reset_index()
    oi = parse(oi[["symbol", "quantity"]].rename(columns={"quantity": "oi"}))
    q = parse(pd.read_csv(q_path)[["symbol", "bid_px_00", "ask_px_00"]].dropna().groupby("symbol").last().reset_index())
    q = q[(q.bid_px_00 > 0) & (q.ask_px_00 > q.bid_px_00)]
    q["mid"] = (q.bid_px_00 + q.ask_px_00) / 2

    d0 = pd.Timestamp(run_date)
    keep = (oi.exp >= d0) & (oi.exp <= d0 + pd.Timedelta(days=horizon_days)) & oi.k.between(spot * (1 - band), spot * (1 + band))
    oi = oi[keep]
    m = oi.merge(q[["symbol", "mid"]], on="symbol", how="left")
    qt = pd.Timestamp(quote_time)

    ivs = []
    for r in m.itertuples():
        T = (expiry_utc(r.exp, r.root) - qt).total_seconds() / (365 * 86400)
        ivs.append(implied_vol(r.mid, spot, r.k, T, r.cp == "C") if r.mid == r.mid and T > 0 else None)
    m["iv"] = ivs

    rows, expiries = [], sorted({e for e in m.exp})
    for (exp, root), g in m.groupby(["exp", "root"]):
        # one volatility per strike: the out-of-the-money side is the reliable quote
        per_k = {}
        for k, gk in g.groupby("k"):
            c = gk[gk.cp == "C"]; p = gk[gk.cp == "P"]
            otm = c if k >= spot else p
            itm = p if k >= spot else c
            v = otm.iv.dropna().mean() if otm.iv.notna().any() else (itm.iv.dropna().mean() if itm.iv.notna().any() else np.nan)
            per_k[k] = (int(c.oi.sum()), int(p.oi.sum()), v)
        ks = np.array(sorted(per_k))
        vs = np.array([per_k[k][2] for k in ks], dtype=float)
        ok = ~np.isnan(vs)
        if ok.sum() == 0:
            continue
        vs = np.interp(ks, ks[ok], vs[ok])          # fill strikes without a usable quote
        for k, v in zip(ks, vs):
            coi, poi, _ = per_k[k]
            if coi + poi == 0: continue
            exp_utc = expiry_utc(exp, root)
            rows.append([float(k), exp_utc.strftime("%Y-%m-%dT%H:%M"), coi, poi, round(float(v), 4)])

    # summary at the reference spot (the indicator recomputes all of this live)
    now = pd.Timestamp(run_date) + pd.Timedelta(hours=13, minutes=30)   # one hour before the US open
    def net_gex(S):
        tot = {}
        for k, e, coi, poi, v in rows:
            sec = (pd.Timestamp(e) - now).total_seconds()
            if sec <= 0: continue
            T = max(sec, 1800) / (365 * 86400)
            gm = gamma(S, k, T, v) * 100 * S * S * 0.01
            tot[k] = tot.get(k, 0.0) + gm * (coi - poi)
        return tot
    g = net_gex(spot)
    ks = sorted(g)
    call_wall = max((k for k in ks if k >= spot), key=lambda k: g[k], default=None)
    put_wall = min((k for k in ks if k <= spot), key=lambda k: g[k], default=None)
    grid = np.linspace(spot * 0.95, spot * 1.05, 81)
    tots = [sum(net_gex(S).values()) for S in grid]
    flip = None
    for a, b, ta, tb in zip(grid[:-1], grid[1:], tots[:-1], tots[1:]):
        if ta * tb < 0:
            flip = float(a + (b - a) * (-ta) / (tb - ta)); break
    first_exp = min((e for _, e, *_ in rows), default=None)
    mp = None
    if first_exp:
        near = [r for r in rows if r[1] == first_exp]
        strikes = sorted({r[0] for r in near})
        pain = {s: sum(max(0, s - k) * c + max(0, k - s) * p for k, _, c, p, _ in near) for s in strikes}
        mp = min(pain, key=pain.get) if pain else None
    total_c = sum(r[2] for r in rows); total_p = sum(r[3] for r in rows)
    return {
        "index_spot": spot, "basis": basis,
        "summary": {
            "call_wall": call_wall, "put_wall": put_wall, "zero_gamma": round(flip, 1) if flip else None,
            "max_pain": mp, "max_pain_expiry": first_exp, "pcr_oi": round(total_p / total_c, 2) if total_c else None,
            "net_gex_musd": round(sum(g.values()) / 1e6, 1),
        },
        "rows": rows,   # [index strike, expiry UTC, call OI, put OI, implied vol]
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    for a in ["date", "quote-time", "spx-oi", "spx-q", "ndx-oi", "ndx-q", "out"]: p.add_argument("--" + a)
    for a in ["spx-spot", "es-basis", "ndx-spot", "nq-basis"]: p.add_argument("--" + a, type=float)
    p.add_argument("--days", type=int, default=14)
    p.add_argument("--band", type=float, default=0.06)
    a = p.parse_args()
    out = {"date": a.date, "quote_time": a.quote_time, "r": R,
           "note": "Gamma exposure: dealers assumed long calls / short puts. Rows: [index strike, expiry UTC, call OI, put OI, IV].",
           "ES": build(a.spx_oi, a.spx_q, a.spx_spot, a.es_basis, a.date, a.quote_time, a.days, a.band) if a.spx_oi else None,
           "NQ": build(a.ndx_oi, a.ndx_q, a.ndx_spot, a.nq_basis, a.date, a.quote_time, a.days, a.band) if a.ndx_oi else None}
    with open(a.out or "gex.json", "w") as f:
        json.dump(out, f, separators=(",", ":"))
    for s in ("ES", "NQ"):
        if out[s]: print(s, len(out[s]["rows"]), "rows", out[s]["summary"])
