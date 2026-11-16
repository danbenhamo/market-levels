# market-levels

Daily SPX / NDX options open-interest walls, translated to ES / NQ futures points, plus an ATAS indicator that draws them.

- `levels.json` — updated every trading morning (Israel time). `put_wall` / `call_wall` are futures prices (strike + basis); `index_*` are the raw option strikes.
- `compute_levels.py` — builds `levels.json` from Databento OPRA open-interest files.
- The ATAS drawing lives in the "Quarters & Sessions" indicator (Gamma walls settings group).

Levels come from the previous session's open interest (expirations in the next ~2 weeks, strikes within ±5% of spot). This is general market information, not investment advice.
