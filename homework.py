"""Morning homework for ES and NQ: the numbers a day trader's levels come from, computed from Databento futures data.

usage: python homework.py [--date YYYY-MM-DD] [--out homework.json]

For each of ES and NQ (front month, continuous):
  prev_rth   the last complete New York cash session (09:30-16:00 ET): open, high, low, close, VWAP,
             volume profile POC / VAH / VAL (70% value area), initial balance (first hour) high / low
  overnight  the Globex session since that close, as far as the data goes: high, low, last, and the time of the last bar
  week/month high and low, ATR(14) and the average daily range of the last 20 days
  base_rates conditional statistics from 10 years of daily bars, for days that followed a day like the last one
             (same bucket of daily % change): how often the next day closed up, broke the previous high / low,
             and its average range. Plus the same after a streak of the same length and direction.
Costs about $0.02 a run (1-minute bars for 6 days, daily bars for 10 years). The API key comes from the proxy.
Not investment advice: these are base rates, not forecasts.
"""
import argparse, json, datetime as dt
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd
import databento

NY = ZoneInfo("America/New_York")
SYMS = {"ES": "ES.c.0", "NQ": "NQ.c.0"}
TICK = {"ES": 0.25, "NQ": 0.25}


def profile(bars, tick):
    """Volume profile from 1-minute bars: each bar's volume spread evenly over its high-low range."""
    lo, hi = bars.low.min(), bars.high.max()
    edges = np.arange(np.floor(lo / tick) * tick, hi + tick, tick)
    vol = np.zeros(len(edges))
    for h, l, v in zip(bars.high.values, bars.low.values, bars.volume.values):
        i0, i1 = int(round((l - edges[0]) / tick)), int(round((h - edges[0]) / tick))
        vol[i0:i1 + 1] += v / (i1 - i0 + 1)
    poc = int(vol.argmax())
    lo_i = hi_i = poc
    total, acc = vol.sum(), vol[poc]
    while acc < 0.7 * total and (lo_i > 0 or hi_i < len(vol) - 1):
        up = vol[hi_i + 1] if hi_i < len(vol) - 1 else -1
        dn = vol[lo_i - 1] if lo_i > 0 else -1
        if up >= dn: hi_i += 1; acc += up
        else: lo_i -= 1; acc += dn
    return float(edges[poc]), float(edges[hi_i]), float(edges[lo_i])


def bucket(pct):
    for lim, name in ((-2, "≤-2%"), (-0.5, "-2%..-0.5%"), (0.5, "-0.5%..+0.5%"), (2, "+0.5%..+2%")):
        if pct <= lim: return name
    return "≥+2%"


def base_rates(d):
    d = d.copy()
    d["ret"] = d.close.pct_change() * 100
    d["rng"] = (d.high - d.low) / d.close.shift(1) * 100
    d["n_up"] = (d.close.shift(-1) > d.close)
    d["n_hi"] = (d.high.shift(-1) > d.high)
    d["n_lo"] = (d.low.shift(-1) < d.low)
    d["n_rng"] = d.rng.shift(-1)
    d["n_ret"] = d.ret.shift(-1)
    sign = np.sign(d.ret)
    streak = []
    s = 0
    for x, p in zip(sign, sign.shift(1)):
        s = s + 1 if (x == p and x != 0) else 1
        streak.append(s)
    d["streak"] = np.array(streak) * sign
    hist = d.iloc[:-1].dropna(subset=["ret", "n_ret"])
    last = d.iloc[-1]
    def stats(sub, label):
        if len(sub) < 15: return {"condition": label, "days": int(len(sub)), "note": "too few days"}
        return {"condition": label, "days": int(len(sub)),
                "next_up_pct": round(100 * sub.n_up.mean()), "next_breaks_high_pct": round(100 * sub.n_hi.mean()),
                "next_breaks_low_pct": round(100 * sub.n_lo.mean()), "next_avg_range_pct": round(sub.n_rng.mean(), 2),
                "next_avg_change_pct": round(sub.n_ret.mean(), 2)}
    b = bucket(last.ret)
    out = [stats(hist, "all days (10y)"),
           stats(hist[hist.ret.apply(bucket) == b], f"after a {b} day (yesterday {last.ret:+.2f}%)")]
    k = int(last.streak)
    out.append(stats(hist[hist.streak == k], f"after {abs(k)} {'up' if k > 0 else 'down'} day(s) in a row"))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=dt.date.today().isoformat())
    ap.add_argument("--out", default="homework.json")
    a = ap.parse_args()
    c = databento.Historical(key="db-" + "x" * 29)
    end = pd.Timestamp(c.metadata.get_dataset_range(dataset="GLBX.MDP3")["end"])
    day = pd.Timestamp(a.date)
    m = c.timeseries.get_range(dataset="GLBX.MDP3", symbols=list(SYMS.values()), stype_in="continuous", schema="ohlcv-1m",
                               start=(day - pd.Timedelta(days=7)).strftime("%Y-%m-%d"), end=end).to_df()
    dly = c.timeseries.get_range(dataset="GLBX.MDP3", symbols=list(SYMS.values()), stype_in="continuous", schema="ohlcv-1d",
                                 start=(day - pd.Timedelta(days=3700)).strftime("%Y-%m-%d"), end=min(day.tz_localize("UTC"), end)).to_df()
    res = {"date": a.date, "data_until_utc": str(end)[:16], "note": "Futures prices. Base rates are history, not a forecast."}
    for name, sym in SYMS.items():
        b = m[m.symbol == sym].copy()
        b["ny"] = b.index.tz_convert(NY)
        b["nyd"] = b.ny.dt.date
        t = b.ny.dt.hour * 60 + b.ny.dt.minute
        rth = b[(t >= 570) & (t < 960)]
        days = [d for d, g in rth.groupby("nyd") if len(g) > 300]          # complete cash sessions only
        prev = days[-1]
        r = rth[rth.nyd == prev]
        poc, vah, val = profile(r, TICK[name])
        ib = r[(r.ny.dt.hour * 60 + r.ny.dt.minute) < 630]
        typ = (r.high + r.low + r.close) / 3
        close_ts = r.index.max()
        on = b[b.index > close_ts]
        dd = dly[dly.symbol == sym][["open", "high", "low", "close"]].copy()
        tr = pd.concat([dd.high - dd.low, (dd.high - dd.close.shift()).abs(), (dd.low - dd.close.shift()).abs()], axis=1).max(axis=1)
        wk = b[b.ny >= pd.Timestamp(prev).tz_localize(NY) - pd.Timedelta(days=pd.Timestamp(prev).weekday())]
        res[name] = {
            "prev_rth": {"date": str(prev), "open": float(r.open.iloc[0]), "high": float(r.high.max()), "low": float(r.low.min()),
                         "close": float(r.close.iloc[-1]), "vwap": round(float((typ * r.volume).sum() / r.volume.sum()), 2),
                         "poc": poc, "vah": vah, "val": val, "ib_high": float(ib.high.max()), "ib_low": float(ib.low.min()),
                         "range": float(r.high.max() - r.low.min())},
            "overnight": ({"high": float(on.high.max()), "low": float(on.low.min()), "last": float(on.close.iloc[-1]),
                           "last_bar_utc": str(on.index.max())[:16]} if len(on) else None),
            "week_high": float(wk.high.max()), "week_low": float(wk.low.min()),
            "month_high": float(dd.high.iloc[-22:].max()), "month_low": float(dd.low.iloc[-22:].min()),
            "atr14": round(float(tr.iloc[-14:].mean()), 2), "avg_range_20d": round(float((dd.high - dd.low).iloc[-20:].mean()), 2),
            "base_rates": base_rates(dd),
        }
    json.dump(res, open(a.out, "w"), indent=1, ensure_ascii=False)
    for name in SYMS:
        x = res[name]; p = x["prev_rth"]
        print(f"{name} prev RTH {p['date']}: H {p['high']} L {p['low']} C {p['close']} VWAP {p['vwap']} POC {p['poc']} VAH {p['vah']} VAL {p['val']} IB {p['ib_low']}-{p['ib_high']}")
        print(f"   overnight {x['overnight']}  ATR14 {x['atr14']}  week {x['week_low']}-{x['week_high']}")
        for s in x["base_rates"]: print("  ", s)


if __name__ == "__main__":
    main()
