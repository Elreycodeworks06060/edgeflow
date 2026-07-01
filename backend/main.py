from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import pandas as pd
import pytz
from datetime import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "../data/edgeflow.db"
ET = pytz.timezone('America/New_York')

def get_minute_data(ticker):
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query('''
        SELECT datetime, open, high, low, close, volume
        FROM minute_bars WHERE ticker = ?
        ORDER BY datetime ASC
    ''', conn, params=(ticker,))
    conn.close()
    df['datetime'] = pd.to_datetime(df['datetime'], utc=True)
    df['datetime'] = df['datetime'].dt.tz_convert(ET)
    df = df.set_index('datetime')
    return df

def get_daily_data(ticker):
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query('''
        SELECT date, open, high, low, close, volume
        FROM daily_bars WHERE ticker = ?
        ORDER BY date ASC
    ''', conn, params=(ticker,))
    conn.close()
    df['date'] = pd.to_datetime(df['date'])
    return df

def calc_orb(ticker):
    df = get_minute_data(ticker)
    df = df.between_time('09:30', '16:00')
    trading_days = df.index.normalize().unique()
    results = []

    for day in trading_days:
        day_data = df[df.index.date == day.date()]
        orb_data = day_data.between_time('09:30', '09:44')
        if len(orb_data) < 5: continue
        orb_high = orb_data['high'].max()
        orb_low = orb_data['low'].min()
        orb_range = orb_high - orb_low
        if orb_range < 0.25: continue
        rest = day_data.between_time('09:45', '15:59')
        if len(rest) == 0: continue
        broke_high = bool(rest['high'].max() > orb_high)
        broke_low = bool(rest['low'].min() < orb_low)
        if broke_high and broke_low: day_type = 'double_break'
        elif broke_high: day_type = 'broke_high'
        elif broke_low: day_type = 'broke_low'
        else: day_type = 'no_break'
        ext_high = float((rest['high'].max() - orb_high) / orb_range) if broke_high else 0
        ext_low = float((orb_low - rest['low'].min()) / orb_range) if broke_low else 0

        prev_days = [d for d in trading_days if d < day]
        gap_pct = None
        if prev_days:
            prev_data = df[df.index.date == prev_days[-1].date()]
            if len(prev_data) > 0:
                prev_close = float(prev_data['close'].iloc[-1])
                today_open = float(orb_data['open'].iloc[0])
                gap_pct = ((today_open - prev_close) / prev_close) * 100

        results.append({
            'date': str(day.date()),
            'day_of_week': day.day_name(),
            'orb_range': float(orb_range),
            'broke_high': broke_high,
            'broke_low': broke_low,
            'day_type': day_type,
            'ext_high': ext_high,
            'ext_low': ext_low,
            'gap_pct': gap_pct,
        })

    df_r = pd.DataFrame(results)
    total = len(df_r)
    if total == 0: return {}

    by_day = []
    for day in ['Monday','Tuesday','Wednesday','Thursday','Friday']:
        d = df_r[df_r['day_of_week']==day]
        if len(d) == 0: continue
        by_day.append({
            'day': day[:3],
            'high': round(d['broke_high'].mean()*100, 1),
            'low': round(d['broke_low'].mean()*100, 1),
            'double': round((d['day_type']=='double_break').mean()*100, 1),
            'n': len(d)
        })

    by_gap = []
    for label, mask in [('Gap Up', df_r['gap_pct']>0.1), ('Gap Down', df_r['gap_pct']<-0.1), ('Flat', (df_r['gap_pct']>=-0.1)&(df_r['gap_pct']<=0.1))]:
        g = df_r[mask]
        if len(g) == 0: continue
        by_gap.append({
            'gap': label,
            'high': round(g['broke_high'].mean()*100, 1),
            'low': round(g['broke_low'].mean()*100, 1),
            'n': len(g)
        })

    return {
        'ticker': ticker,
        'totalDays': total,
        'confidence': 'HIGH' if total > 100 else 'MEDIUM' if total > 50 else 'LOW',
        'brokeHigh': round(df_r['broke_high'].mean()*100, 1),
        'brokeLow': round(df_r['broke_low'].mean()*100, 1),
        'doubleBreak': round((df_r['day_type']=='double_break').mean()*100, 1),
        'noBreak': round((df_r['day_type']=='no_break').mean()*100, 1),
        'extHigh': round(df_r[df_r['broke_high']]['ext_high'].mean(), 2),
        'extLow': round(df_r[df_r['broke_low']]['ext_low'].mean(), 2),
        'avgRange': round(df_r['orb_range'].mean(), 2),
        'byDay': by_day,
        'byGap': by_gap,
    }

def calc_ib(ticker):
    df = get_minute_data(ticker)
    df = df.between_time('09:30', '16:00')
    trading_days = df.index.normalize().unique()
    results = []

    for day in trading_days:
        day_data = df[df.index.date == day.date()]
        ib_data = day_data.between_time('09:30', '10:29')
        if len(ib_data) < 30: continue
        ib_high = ib_data['high'].max()
        ib_low = ib_data['low'].min()
        ib_range = ib_high - ib_low
        if ib_range < 0.25: continue
        first_high_time = ib_data['high'].idxmax()
        first_low_time = ib_data['low'].idxmin()
        high_first = bool(first_high_time < first_low_time)
        rest = day_data.between_time('10:30', '15:59')
        if len(rest) == 0: continue
        broke_high = bool(rest['high'].max() > ib_high)
        broke_low = bool(rest['low'].min() < ib_low)
        if broke_high and broke_low: day_type = 'double_break'
        elif broke_high: day_type = 'single_break_high'
        elif broke_low: day_type = 'single_break_low'
        else: day_type = 'no_break'
        ext_high = float((rest['high'].max() - ib_high) / ib_range) if broke_high else 0
        ext_low = float((ib_low - rest['low'].min()) / ib_range) if broke_low else 0
        results.append({
            'date': str(day.date()),
            'day_of_week': day.day_name(),
            'ib_range': float(ib_range),
            'high_first': high_first,
            'broke_high': broke_high,
            'broke_low': broke_low,
            'day_type': day_type,
            'ext_high': ext_high,
            'ext_low': ext_low,
        })

    df_r = pd.DataFrame(results)
    total = len(df_r)
    if total == 0: return {}

    hf = df_r[df_r['high_first']==True]
    lf = df_r[df_r['high_first']==False]

    by_day = []
    for day in ['Monday','Tuesday','Wednesday','Thursday','Friday']:
        d = df_r[df_r['day_of_week']==day]
        if len(d) == 0: continue
        by_day.append({
            'day': day[:3],
            'high': round(d['broke_high'].mean()*100, 1),
            'low': round(d['broke_low'].mean()*100, 1),
            'double': round((d['day_type']=='double_break').mean()*100, 1),
            'n': len(d)
        })

    return {
        'ticker': ticker,
        'totalDays': total,
        'confidence': 'HIGH' if total > 100 else 'MEDIUM' if total > 50 else 'LOW',
        'singleHigh': round((df_r['day_type']=='single_break_high').mean()*100, 1),
        'singleLow': round((df_r['day_type']=='single_break_low').mean()*100, 1),
        'doubleBreak': round((df_r['day_type']=='double_break').mean()*100, 1),
        'noBreak': round((df_r['day_type']=='no_break').mean()*100, 1),
        'brokeHigh': round(df_r['broke_high'].mean()*100, 1),
        'brokeLow': round(df_r['broke_low'].mean()*100, 1),
        'highFirstBrokeHigh': round(hf['broke_high'].mean()*100, 1) if len(hf) > 0 else 0,
        'highFirstBrokeLow': round(hf['broke_low'].mean()*100, 1) if len(hf) > 0 else 0,
        'lowFirstBrokeHigh': round(lf['broke_high'].mean()*100, 1) if len(lf) > 0 else 0,
        'lowFirstBrokeLow': round(lf['broke_low'].mean()*100, 1) if len(lf) > 0 else 0,
        'extHigh': round(df_r[df_r['broke_high']]['ext_high'].mean(), 2),
        'extLow': round(df_r[df_r['broke_low']]['ext_low'].mean(), 2),
        'avgRange': round(df_r['ib_range'].mean(), 2),
        'byDay': by_day,
    }

# ─── API ROUTES ───────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "EdgeFlow API running", "version": "1.0"}

@app.get("/stats/orb/{ticker}")
def orb_stats(ticker: str):
    return calc_orb(ticker.upper())

@app.get("/stats/ib/{ticker}")
def ib_stats(ticker: str):
    return calc_ib(ticker.upper())

@app.get("/stats/all/{ticker}")
def all_stats(ticker: str):
    return {
        "orb": calc_orb(ticker.upper()),
        "ib": calc_ib(ticker.upper()),
    }

@app.get("/algo/status")
def algo_status():
    from algo_engine import get_status
    return get_status()

@app.get("/algo/scan")
def algo_scan():
    from algo_engine import scan_for_signals
    signals = scan_for_signals()
    return {"signals": signals, "count": len(signals)}

@app.get("/signals/latest")
def signals_latest():
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT * FROM signals ORDER BY id DESC LIMIT 1"
    ).fetchone()
    conn.close()
    if row is None:
        return {"signal": None}
    cols = ["id", "timestamp", "strategy", "ticker", "direction",
            "entry", "stop", "target", "confluence_score", "confluence_factors", "status"]
    return {"signal": dict(zip(cols, row))}

@app.get("/trades/log")
def trade_log():
    from webhook import get_trade_log
    return {"trades": get_trade_log()}

@app.post("/webhook")
async def receive_webhook(request: Request):
    body = await request.json()
    from webhook import update_live_bar, simulate_paper_trade, is_live_feed_active

    if body.get('type') == 'bar':
        ticker = body.get('ticker', '').upper()
        if ticker in ['ES', 'NQ']:
            update_live_bar(ticker, body)
            print(f"📊 Live bar received — {ticker} {body.get('time')} C:{body.get('close')}")
        return {"status": "bar_received", "ticker": ticker}

    print(f"🔔 Signal webhook received: {body}")
    simulate_paper_trade(body)
    return {"status": "received", "signal": body}

@app.get("/feed/status")
def feed_status():
    from webhook import is_live_feed_active, get_live_bars, get_live_orb
    es_bars = get_live_bars('ES')
    nq_bars = get_live_bars('NQ')
    return {
        "live": is_live_feed_active(),
        "es_bars": len(es_bars),
        "nq_bars": len(nq_bars),
        "es_latest": es_bars[-1]['close'] if es_bars else None,
        "nq_latest": nq_bars[-1]['close'] if nq_bars else None,
        "es_orb": get_live_orb('ES'),
        "nq_orb": get_live_orb('NQ'),
    }

@app.get("/candles/{ticker}/{date}")
def get_candles(ticker: str, date: str, resolution: int = 5):
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query('''
        SELECT datetime, open, high, low, close, volume
        FROM minute_bars
        WHERE ticker = ? AND datetime LIKE ?
        ORDER BY datetime ASC
    ''', conn, params=(ticker.upper(), f"{date}%"))
    conn.close()

    if len(df) == 0:
        return {"candles": []}

    df['datetime'] = pd.to_datetime(df['datetime'], utc=True)
    df['datetime'] = df['datetime'].dt.tz_convert(ET)
    df = df[df['datetime'].dt.hour.between(9, 15)]
    df = df[~((df['datetime'].dt.hour == 9) & (df['datetime'].dt.minute < 30))]

    if resolution > 1:
        df = df.set_index('datetime')
        df_resampled = df.resample(f'{resolution}min').agg({
            'open': 'first', 'high': 'max', 'low': 'min',
            'close': 'last', 'volume': 'sum'
        }).dropna()
        df_resampled = df_resampled.reset_index()
        df = df_resampled

    candles = []
    for _, row in df.iterrows():
        dt = row['datetime'] if isinstance(row['datetime'], str) else row['datetime'].strftime('%H:%M')
        candles.append({
            'time': dt,
            'open': round(float(row['open']), 2),
            'high': round(float(row['high']), 2),
            'low': round(float(row['low']), 2),
            'close': round(float(row['close']), 2),
            'volume': int(row['volume']),
        })

    return {"candles": candles, "date": date, "ticker": ticker, "resolution": resolution}

@app.get("/daily/report/{ticker}")
def daily_report(ticker: str):
    from webhook import get_live_orb, get_live_bars, is_live_feed_active
    from algo_engine import score_confluence_orb, get_gap_direction, STRATEGY_CONFIG

    now = datetime.now(ET)
    t = ticker.upper()
    cfg = STRATEGY_CONFIG[t]

    day_name = now.strftime('%A')
    date_str = now.strftime('%Y-%m-%d')
    is_wednesday = day_name == "Wednesday"

    orb = get_live_orb(t)
    bars = get_live_bars(t)
    latest_price = bars[-1]['close'] if bars else None
    gap_dir, gap_pct = get_gap_direction(t)

    direction = None
    confluence = None
    trade_decision = "NO SIGNAL"
    decision_reason = ""

    if is_wednesday:
        trade_decision = "NO TRADE"
        decision_reason = "Wednesday — algo skips all Wednesdays by rule"
    elif orb:
        orb_range = orb['range']
        if latest_price:
            if latest_price > orb['high']:
                direction = "LONG"
            elif latest_price < orb['low']:
                direction = "SHORT"

        if direction and orb_range >= cfg['min_range']:
            confluence = score_confluence_orb(t, direction, gap_dir, orb_range)
            score = confluence['score']
            if score >= 3:
                trade_decision = "TRADE TAKEN"
                decision_reason = f"Score {score}/5 — A+ setup, all filters passed"
            else:
                trade_decision = "NO TRADE"
                decision_reason = f"Score {score}/5 — below minimum threshold of 3.0"
        elif orb_range < cfg['min_range']:
            trade_decision = "NO TRADE"
            decision_reason = f"ORB range {orb_range} pts below minimum {cfg['min_range']} pts"
        else:
            trade_decision = "WAITING"
            decision_reason = "No breakout detected yet"
    else:
        trade_decision = "WAITING"
        decision_reason = "ORB not yet formed — market opens at 9:30 AM ET"

    conn = sqlite3.connect(DB_PATH)
    try:
        today_trades = pd.read_sql_query('''
            SELECT * FROM trade_log
            WHERE ticker = ? AND timestamp LIKE ?
            ORDER BY timestamp DESC LIMIT 1
        ''', conn, params=(t, f"{date_str}%"))
        trade = today_trades.to_dict(orient="records")[0] if len(today_trades) > 0 else None
    except:
        trade = None
    conn.close()

    return {
        "date": date_str,
        "day_of_week": day_name,
        "ticker": t,
        "is_wednesday": is_wednesday,
        "live_feed_active": is_live_feed_active(),
        "latest_price": latest_price,
        "bar_count": len(bars),
        "gap_direction": gap_dir,
        "gap_pct": round(gap_pct, 3),
        "orb": orb,
        "direction": direction,
        "confluence": confluence,
        "trade_decision": trade_decision,
        "decision_reason": decision_reason,
        "trade": trade,
        "strategy": {
            "contracts": cfg['contracts'],
            "multiplier": cfg['multiplier'],
            "scenario": cfg['scenario'],
            "min_range": cfg['min_range'],
        }
    }

@app.get("/backtest/wednesday/ES")
def backtest_wednesday_es():
    from algo_engine import round_tick

    df = get_minute_data('ES')
    df = df.between_time('09:30', '16:00')

    conn = sqlite3.connect(DB_PATH)
    levels_df = pd.read_sql_query("SELECT * FROM key_levels WHERE ticker='ES'", conn)
    conn.close()
    levels_df['date'] = pd.to_datetime(levels_df['date']).dt.date

    trading_days = df.index.normalize().unique()
    wednesdays   = [d for d in trading_days if d.day_name() == 'Wednesday']

    tick      = 0.25
    min_range = 8.0
    results   = []

    for day in wednesdays:
        day_data = df[df.index.date == day.date()]
        orb_data = day_data.between_time('09:30', '09:44')
        if len(orb_data) < 5:
            continue

        orb_high  = round_tick(orb_data['high'].max(), tick)
        orb_low   = round_tick(orb_data['low'].min(),  tick)
        orb_range = round_tick(orb_high - orb_low,     tick)
        if orb_range < min_range:
            continue

        day_levels = levels_df[levels_df['date'] == day.date()]
        if len(day_levels) == 0:
            continue
        lev = day_levels.iloc[0]

        # First bar where CLOSE crosses ORB — matches detect_orb_signal() and backtester
        signal_bars = day_data.between_time('09:45', '11:00')
        direction, entry, entry_idx = None, None, None
        for idx, row in signal_bars.iterrows():
            if row['close'] > orb_high:
                direction, entry, entry_idx = 'LONG',  round_tick(orb_high, tick), idx; break
            elif row['close'] < orb_low:
                direction, entry, entry_idx = 'SHORT', round_tick(orb_low,  tick), idx; break

        if not direction:
            continue

        # Confluence scoring — mirrors score_confluence_orb() with per-day key_levels
        score = 0.0
        if   direction == 'LONG'  and lev['gap_pts'] < 0: score += 2
        elif direction == 'SHORT' and lev['gap_pts'] > 0: score += 2
        else: score += 0.5

        if lev['price_above_vwap'] is not None:
            if (direction == 'LONG'  and     lev['price_above_vwap']) or \
               (direction == 'SHORT' and not lev['price_above_vwap']):
                score += 1

        if   direction == 'LONG'  and not lev['pdh_nearby']: score += 1
        elif direction == 'SHORT' and not lev['pdl_nearby']: score += 1

        # Wednesday never earns Tuesday +0.5 (correct per scoring model)
        if orb_range > min_range * 1.5: score += 0.5

        if score < 3:
            continue

        stop    = round_tick(orb_low  if direction == 'LONG' else orb_high, tick)
        target1 = round_tick(entry + orb_range * 0.5 if direction == 'LONG' else entry - orb_range * 0.5, tick)
        target2 = round_tick(entry + orb_range       if direction == 'LONG' else entry - orb_range,       tick)

        # Scenario B — matches simulate_trade_scenario_b() in backtester.py exactly
        trail_distance = abs(entry - stop) * 0.5
        current_stop   = stop
        all_bars  = day_data.between_time('09:45', '15:55')
        eod_close = round_tick(float(all_bars['close'].iloc[-1])) if len(all_bars) > 0 else entry
        all_bars  = all_bars.loc[entry_idx:]
        pnl      = 0.0
        stop_hit = False
        t1_hit   = False

        for _, row in all_bars.iterrows():
            if direction == 'LONG':
                if row['low'] <= current_stop:
                    if not t1_hit:
                        pnl = (current_stop - entry) * 2 * 50
                    else:
                        pnl = round((target1 - entry) * 50 + (current_stop - entry) * 50, 2)
                    stop_hit = True; break
                if not t1_hit and row['high'] >= target1:
                    t1_hit       = True
                    current_stop = entry
                if t1_hit:
                    new_stop = row['high'] - trail_distance
                    if new_stop > current_stop:
                        current_stop = new_stop
            else:  # SHORT
                if row['high'] >= current_stop:
                    if not t1_hit:
                        pnl = (entry - current_stop) * 2 * 50
                    else:
                        pnl = round((entry - target1) * 50 + (entry - current_stop) * 50, 2)
                    stop_hit = True; break
                if not t1_hit and row['low'] <= target1:
                    t1_hit       = True
                    current_stop = entry
                if t1_hit:
                    new_stop = row['low'] + trail_distance
                    if new_stop < current_stop:
                        current_stop = new_stop

        if stop_hit:
            result = 'win' if pnl > 0 else 'loss'
        elif t1_hit:
            c1  = (target1   - entry) * 50 if direction == 'LONG' else (entry - target1)   * 50
            c2  = (eod_close - entry) * 50 if direction == 'LONG' else (entry - eod_close) * 50
            pnl = round(c1 + c2, 2)
            result = 'win' if pnl > 0 else 'loss'
        else:
            pnl    = (eod_close - entry) * 2 * 50 if direction == 'LONG' else (entry - eod_close) * 2 * 50
            result = 'win' if pnl > 0 else 'loss'

        results.append({
            'date':        str(day.date()),
            'day_of_week': 'Wednesday',
            'direction':   direction,
            'entry':       round(entry,     2),
            'stop':        round(stop,      2),
            'target1':     round(target1,   2),
            'target2':     round(target2,   2),
            'orb_high':    round(orb_high,  2),
            'orb_low':     round(orb_low,   2),
            'orb_range':   round(orb_range, 2),
            'score':       score,
            'pnl':         round(pnl, 2),
            'result':      result,
            't1_hit':      t1_hit,
            'stop_hit':    stop_hit,
            'eod_close':   round(eod_close, 2),
            'gap_pct':     round(float(lev['gap_pct']), 3) if lev['gap_pct'] is not None else None,
        })

    if not results:
        return {'trades': [], 'summary': None}

    wins      = [r for r in results if r['result'] == 'win']
    total_pnl = sum(r['pnl'] for r in results)
    return {
        'trades': results,
        'summary': {
            'total':    len(results),
            'wins':     len(wins),
            'losses':   len(results) - len(wins),
            'winRate':  round(len(wins) / len(results) * 100, 1),
            'totalPnl': round(total_pnl, 2),
        },
    }


@app.get("/backtest/{strategy}/{ticker}")
def backtest_results(strategy: str, ticker: str, scenario: str = None):
    conn = sqlite3.connect(DB_PATH)
    if scenario:
        df = pd.read_sql_query('''
            SELECT * FROM backtest_results
            WHERE strategy = ? AND ticker = ? AND scenario = ?
            ORDER BY date ASC
        ''', conn, params=(strategy.upper(), ticker.upper(), scenario.upper()))
    else:
        default_scenario = 'B' if ticker.upper() == 'ES' else 'A'
        df = pd.read_sql_query('''
            SELECT * FROM backtest_results
            WHERE strategy = ? AND ticker = ? AND scenario = ?
            ORDER BY date ASC
        ''', conn, params=(strategy.upper(), ticker.upper(), default_scenario))
    conn.close()
    return {"trades": df.to_dict(orient="records")}

@app.get("/backtest/compare/{strategy}/{ticker}")
def backtest_compare(strategy: str, ticker: str):
    conn = sqlite3.connect(DB_PATH)
    results = {}
    for scenario in ['A', 'B']:
        df = pd.read_sql_query('''
            SELECT * FROM backtest_results
            WHERE strategy = ? AND ticker = ? AND scenario = ?
            ORDER BY date ASC
        ''', conn, params=(strategy.upper(), ticker.upper(), scenario))
        results[f'scenario_{scenario}'] = df.to_dict(orient="records")
    conn.close()
    return results