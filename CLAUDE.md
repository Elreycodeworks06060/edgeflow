# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## PROJECT OVERRIDES — READ FIRST

1. **Owner:** el rey
2. **Focus:** ES ORB only. NQ and IB code stays in repo but is archived and inactive — never runs.
3. **Backtest stays at Apex $150K rules.** Do not refit to $50K.
4. **Chosen scenario:** ES Scenario B — trail stop after T1, run to EOD. Backtest result: 81.4% win rate, $126,481 over 2 years. This is the locked production scenario.
5. **First build priority:** Exit management in `algo_engine.py` for ES only — track open positions, execute T1 partial close, activate trail stop, close at EOD.
6. **Known bugs (do not paper over):**
   - `key_levels` is not populated at signal time during live trading — VWAP and PDH/PDL are blind live; confluence scoring silently degrades.
   - No exit management exists after entry — the algo detects and logs signals but does not track or manage open positions.
   - `daily_bars` may be stale, causing gap scoring to use outdated prev-close data.
7. **Day-of-week scoring bug:** Thursday scores 0 on the day factor in `score_confluence_orb` — only Tuesday gets +0.5. Backtest shows Thursday is actually the strongest day at 81.4%. Known misalignment between scoring model and observed data.
8. **Decision process:** All major architecture or strategy decisions go through a 7-voice committee before implementation: Advocate, Devil's Advocate, Skeptic, Data, Probability, Risk, Strong in Favor. No exceptions.

## What This Project Is

EdgeFlow is a futures trading analytics and algo engine for ES (S&P 500) and NQ (Nasdaq) futures. It ingests historical and live price data, runs statistical analysis on intraday patterns (ORB and IB), backtests strategies, and exposes results through a FastAPI backend consumed by a React dashboard.

## Commands

### Backend (run from `backend/`)

```bash
# Start the API server
uvicorn main:app --reload

# Build the SQLite database (requires DATABENTO_API_KEY in .env)
python data_client.py

# Calculate key levels (PDH, PDL, VWAP) — must run after data_client.py
python levels.py

# Run the backtester (writes to backtest_results table)
python backtester.py

# Run stats scripts directly
python stats_engine.py
python orb_stats.py
python ib_stats.py

# Verify the database is populated correctly
python verify.py

# Run the algo engine standalone (checks for live signals)
python algo_engine.py
```

### Frontend (run from `frontend/edgeflow-dashboard/`)

```bash
npm install
npm run dev       # Dev server (Vite)
npm run build     # Production build
npm run lint      # ESLint
npm run preview   # Preview production build
```

## Architecture

### Data Flow

```
Databento API → data_client.py → SQLite (../data/edgeflow.db)
                                       ↓
                              levels.py (key_levels table)
                                       ↓
                              backtester.py (backtest_results table)
                                       ↓
                              main.py (FastAPI) → React dashboard
```

Live path: TradingView fires webhooks to `POST /webhook` → `webhook.py` stores bars in memory → `algo_engine.py` reads them for real-time signal detection.

### Database (`../data/edgeflow.db`)

All paths in backend scripts use `DB_PATH = "../data/edgeflow.db"` — the `data/` folder sits at the repo root, one level above `backend/`.

Tables:
- `minute_bars` — 1-minute OHLCV for ES and NQ (stored in UTC, converted to ET on read)
- `daily_bars` — daily OHLCV
- `key_levels` — pre-computed PDH, PDL, PDC, VWAP, gap data per day
- `backtest_results` — per-trade backtest output with full per-contract exit detail
- `trade_log` — paper trades logged from webhooks
- `signals` — algo signal history

### Backend Modules

- **`data_client.py`** — Databento API ingestion; fetches daily + minute bars into SQLite. Requires `DATABENTO_API_KEY` in `.env`.
- **`levels.py`** — Calculates PDH, PDL, PDC, session VWAP, gap, and IB-context flags per day; stores in `key_levels`.
- **`stats_engine.py`** — Canonical ORB/IB stat calculations with timezone-correct ET handling and gap direction breakdown. Supersedes older `orb_stats.py` and `ib_stats.py`.
- **`backtester.py`** — Full two-scenario backtester. Scenario A: breakeven stop after T1, target T2 or EOD. Scenario B: trail stop after T1, run to EOD. Tracks per-contract (C1/C2) exit price, time, type, and P&L. Includes Apex $150K eval simulation and Monte Carlo.
- **`algo_engine.py`** — Signal detection engine. `scan_for_signals()` runs ORB (9:45–11:00 ET) and IB (10:30–12:00 ET) detection. Has a `DailyState` singleton that arms/disarms based on daily P&L, loss limits, and consecutive losses. No Wednesday trades (hardcoded rule).
- **`webhook.py`** — Handles live TradingView bar webhooks; stores bars in `live_bars` dict (in-memory, not persisted). `algo_engine.get_today_data()` prefers the live feed over the DB.
- **`main.py`** — FastAPI app. Key endpoints: `/stats/orb/{ticker}`, `/stats/ib/{ticker}`, `/stats/all/{ticker}`, `/algo/scan`, `/algo/status`, `/candles/{ticker}/{date}`, `/daily/report/{ticker}`, `/backtest/{strategy}/{ticker}`, `/webhook`.

### Frontend

React 19 + Vite + Recharts + Axios. Entry: `src/main.jsx` → `src/App.jsx`. All API calls go to the FastAPI backend (port 8000 by default). No router — single-page app.

### Strategy Config

ES and NQ configs are defined in `algo_engine.STRATEGY_CONFIG` and duplicated in `backtester.CONFIGS`:
- ES: 2 contracts, $50/pt, min ORB range 8 pts, Scenario B (trail stop)
- NQ: 10 MNQ contracts, $2/pt, min ORB range 50 pts, Scenario A (breakeven stop)

Confluence scoring (`score_confluence_orb`) awards up to 5 points across: gap direction alignment (2 pts), VWAP alignment (1 pt), PDH/PDL not blocking target (1 pt), Tuesday bonus (0.5 pt), large range bonus (0.5 pt). Minimum score to take a trade is 3.

### Setup Order

1. Add `DATABENTO_API_KEY` to `backend/.env`
2. Run `python data_client.py` to build the DB
3. Run `python levels.py` to populate `key_levels`
4. Run `python backtester.py` to populate `backtest_results`
5. Start `uvicorn main:app --reload` from `backend/`
6. Start `npm run dev` from `frontend/edgeflow-dashboard/`
