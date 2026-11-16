# market-levels

Daily SPX / NDX options open-interest walls, translated to ES / NQ futures points, plus an ATAS indicator that draws them.

- `levels.json` — updated every trading morning (Israel time). `put_wall` / `call_wall` are futures prices (strike + basis); `index_*` are the raw option strikes.
- `compute_levels.py` — builds `levels.json` from Databento OPRA open-interest files.
- `atas-indicator/` — ATAS custom indicator "Gamma Walls (Put/Call)".

Levels come from the previous session's open interest (expirations in the next ~2 weeks, strikes within ±5% of spot). This is general market information, not investment advice.

## Install the ATAS indicator

1. Install the .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0
2. Download this repo (Code → Download ZIP) and unzip it.
3. Open a terminal in `atas-indicator` and run `dotnet build -c Release`.
   If ATAS is not in `C:\Program Files (x86)\ATAS Platform`, run `dotnet build -c Release -p:AtasPath="<your ATAS folder>"`.
4. In ATAS: Indicators → **Add custom indicator** → pick `bin\Release\net8.0-windows\MarketLevels.dll`.
5. Add "Gamma Walls (Put/Call)" to the chart. In its settings set **Symbol** to `ES` or `NQ`.
