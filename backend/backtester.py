import sqlite3
import pandas as pd
import numpy as np
import pytz
from datetime import datetime

DB_PATH = "../data/edgeflow.db"
ET = pytz.timezone('America/New_York')

APEX_150K = {
    'account_size': 150000,
    'trailing_drawdown': 5000,
    'safety_net': 155100,
    'consistency_rule': 0.50,
}

# ES = 2 contracts @ $50/pt = $100/pt total
# NQ = 10 MNQ contracts @ $2/pt = $20/pt total (equivalent to 1 NQ)
CONFIGS = {
    'ES': {'contracts': 2, 'multiplier': 50, 'tick': 0.25, 'min_range': 8.0, 'label': 'ES (2 contracts)'},
    'NQ': {'contracts': 10, 'multiplier': 2, 'tick': 0.25, 'min_range': 50.0, 'label': 'NQ (10 MNQ)'},
}

def round_tick(price, tick=0.25):
    return round(round(price / tick) * tick, 2)

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

def get_levels():
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query('SELECT * FROM key_levels', conn)
    conn.close()
    df['date'] = pd.to_datetime(df['date']).dt.date
    return df

def simulate_trade_scenario_a(entry, stop, target1, target2, day_data, direction, contracts, multiplier):
    """
    Scenario A: After T1, move stop to breakeven and target T2.
    Half contracts close at T1, rest target T2 or close at EOD if T2 not hit.
    Returns full exit details for both contracts.
    """
    half = contracts // 2
    rest = contracts - half
    t1_hit = False
    t2_hit = False
    stop_hit = False
    pnl = 0.0
    current_stop = stop

    # Contract 1 (closes at T1 or stop)
    c1_exit_price = None
    c1_exit_time  = None
    c1_exit_type  = None
    c1_pts        = None
    c1_pnl        = None

    # Contract 2 (closes at T2, BE stop, or EOD)
    c2_exit_price = None
    c2_exit_time  = None
    c2_exit_type  = None
    c2_pts        = None
    c2_pnl        = None

    for ts, bar in day_data.iterrows():
        bar_time = ts.strftime('%H:%M')

        if direction == "LONG":
            # Check stop first
            if bar['low'] <= current_stop:
                if not t1_hit:
                    # Both contracts stopped out
                    loss = abs(entry - current_stop) * contracts * multiplier
                    pnl -= loss
                    c1_exit_price = current_stop
                    c1_exit_time  = bar_time
                    c1_exit_type  = "stop"
                    c1_pts        = round(-(entry - current_stop), 2)
                    c1_pnl        = round(-(abs(entry - current_stop) * half * multiplier), 2)
                    c2_exit_price = current_stop
                    c2_exit_time  = bar_time
                    c2_exit_type  = "stop"
                    c2_pts        = round(-(entry - current_stop), 2)
                    c2_pnl        = round(-(abs(entry - current_stop) * rest * multiplier), 2)
                else:
                    # BE stop on contract 2 — no loss
                    c2_exit_price = current_stop
                    c2_exit_time  = bar_time
                    c2_exit_type  = "be_stop"
                    c2_pts        = 0.0
                    c2_pnl        = 0.0
                stop_hit = True
                break

            # T1 check
            if not t1_hit and bar['high'] >= target1:
                c1_gain = abs(target1 - entry) * half * multiplier
                pnl += c1_gain
                t1_hit = True
                current_stop = entry
                c1_exit_price = target1
                c1_exit_time  = bar_time
                c1_exit_type  = "target1"
                c1_pts        = round(target1 - entry, 2)
                c1_pnl        = round(c1_gain, 2)

            # T2 check
            if t1_hit and not t2_hit and bar['high'] >= target2:
                c2_gain = abs(target2 - entry) * rest * multiplier
                pnl += c2_gain
                t2_hit = True
                c2_exit_price = target2
                c2_exit_time  = bar_time
                c2_exit_type  = "target2"
                c2_pts        = round(target2 - entry, 2)
                c2_pnl        = round(c2_gain, 2)
                break

        else:  # SHORT
            if bar['high'] >= current_stop:
                if not t1_hit:
                    loss = abs(entry - current_stop) * contracts * multiplier
                    pnl -= loss
                    c1_exit_price = current_stop
                    c1_exit_time  = bar_time
                    c1_exit_type  = "stop"
                    c1_pts        = round(-(current_stop - entry), 2)
                    c1_pnl        = round(-(abs(entry - current_stop) * half * multiplier), 2)
                    c2_exit_price = current_stop
                    c2_exit_time  = bar_time
                    c2_exit_type  = "stop"
                    c2_pts        = round(-(current_stop - entry), 2)
                    c2_pnl        = round(-(abs(entry - current_stop) * rest * multiplier), 2)
                else:
                    c2_exit_price = current_stop
                    c2_exit_time  = bar_time
                    c2_exit_type  = "be_stop"
                    c2_pts        = 0.0
                    c2_pnl        = 0.0
                stop_hit = True
                break

            if not t1_hit and bar['low'] <= target1:
                c1_gain = abs(entry - target1) * half * multiplier
                pnl += c1_gain
                t1_hit = True
                current_stop = entry
                c1_exit_price = target1
                c1_exit_time  = bar_time
                c1_exit_type  = "target1"
                c1_pts        = round(entry - target1, 2)
                c1_pnl        = round(c1_gain, 2)

            if t1_hit and not t2_hit and bar['low'] <= target2:
                c2_gain = abs(entry - target2) * rest * multiplier
                pnl += c2_gain
                t2_hit = True
                c2_exit_price = target2
                c2_exit_time  = bar_time
                c2_exit_type  = "target2"
                c2_pts        = round(entry - target2, 2)
                c2_pnl        = round(c2_gain, 2)
                break

    # EOD close — anything not yet closed
    if not stop_hit and len(day_data) > 0:
        last     = day_data.iloc[-1]['close']
        last_time = day_data.index[-1].strftime('%H:%M')

        if t1_hit and not t2_hit:
            # Contract 2 closes at EOD
            c2_gain = (last - entry) * rest * multiplier if direction == "LONG" else (entry - last) * rest * multiplier
            pnl += c2_gain
            c2_exit_price = round_tick(last)
            c2_exit_time  = last_time
            c2_exit_type  = "eod_close"
            c2_pts        = round(last - entry if direction == "LONG" else entry - last, 2)
            c2_pnl        = round(c2_gain, 2)
        elif not t1_hit:
            # Both contracts close at EOD (no breakout happened — rare)
            gain = (last - entry) * contracts * multiplier if direction == "LONG" else (entry - last) * contracts * multiplier
            pnl += gain
            c1_exit_price = round_tick(last)
            c1_exit_time  = last_time
            c1_exit_type  = "eod_close"
            c1_pts        = round(last - entry if direction == "LONG" else entry - last, 2)
            c1_pnl        = round(gain / 2, 2)
            c2_exit_price = round_tick(last)
            c2_exit_time  = last_time
            c2_exit_type  = "eod_close"
            c2_pts        = c1_pts
            c2_pnl        = round(gain / 2, 2)

    result = "win" if pnl > 0 else "loss" if pnl < 0 else "breakeven"
    return (
        round(pnl, 2), result, t1_hit, t2_hit,
        c1_exit_price, c1_exit_time, c1_exit_type, c1_pts, c1_pnl,
        c2_exit_price, c2_exit_time, c2_exit_type, c2_pts, c2_pnl,
    )


def simulate_trade_scenario_b(entry, stop, target1, eod_data, direction, contracts, multiplier):
    """
    Scenario B: After T1, trail stop and let rest run to EOD.
    Half contracts close at T1, rest trail until stopped or 3:55 PM.
    Returns full exit details for both contracts.
    """
    half = contracts // 2
    rest = contracts - half
    t1_hit   = False
    t2_hit   = False
    stop_hit = False
    pnl      = 0.0
    current_stop  = stop
    trail_distance = abs(entry - stop) * 0.5

    c1_exit_price = None
    c1_exit_time  = None
    c1_exit_type  = None
    c1_pts        = None
    c1_pnl        = None

    c2_exit_price = None
    c2_exit_time  = None
    c2_exit_type  = None
    c2_pts        = None
    c2_pnl        = None

    for ts, bar in eod_data.iterrows():
        bar_time = ts.strftime('%H:%M')

        if direction == "LONG":
            if bar['low'] <= current_stop:
                if not t1_hit:
                    loss = abs(entry - current_stop) * contracts * multiplier
                    pnl -= loss
                    c1_exit_price = current_stop
                    c1_exit_time  = bar_time
                    c1_exit_type  = "stop"
                    c1_pts        = round(-(entry - current_stop), 2)
                    c1_pnl        = round(-(abs(entry - current_stop) * half * multiplier), 2)
                    c2_exit_price = current_stop
                    c2_exit_time  = bar_time
                    c2_exit_type  = "stop"
                    c2_pts        = c1_pts
                    c2_pnl        = round(-(abs(entry - current_stop) * rest * multiplier), 2)
                else:
                    c2_gain = (current_stop - entry) * rest * multiplier
                    pnl += c2_gain
                    c2_exit_price = round_tick(current_stop)
                    c2_exit_time  = bar_time
                    c2_exit_type  = "trail_stop"
                    c2_pts        = round(current_stop - entry, 2)
                    c2_pnl        = round(c2_gain, 2)
                stop_hit = True
                break

            if not t1_hit and bar['high'] >= target1:
                c1_gain = abs(target1 - entry) * half * multiplier
                pnl += c1_gain
                t1_hit = True
                current_stop = entry
                c1_exit_price = target1
                c1_exit_time  = bar_time
                c1_exit_type  = "target1"
                c1_pts        = round(target1 - entry, 2)
                c1_pnl        = round(c1_gain, 2)

            if t1_hit:
                new_stop = bar['high'] - trail_distance
                if new_stop > current_stop:
                    current_stop = new_stop

        else:  # SHORT
            if bar['high'] >= current_stop:
                if not t1_hit:
                    loss = abs(entry - current_stop) * contracts * multiplier
                    pnl -= loss
                    c1_exit_price = current_stop
                    c1_exit_time  = bar_time
                    c1_exit_type  = "stop"
                    c1_pts        = round(-(current_stop - entry), 2)
                    c1_pnl        = round(-(abs(entry - current_stop) * half * multiplier), 2)
                    c2_exit_price = current_stop
                    c2_exit_time  = bar_time
                    c2_exit_type  = "stop"
                    c2_pts        = c1_pts
                    c2_pnl        = round(-(abs(entry - current_stop) * rest * multiplier), 2)
                else:
                    c2_gain = (entry - current_stop) * rest * multiplier
                    pnl += c2_gain
                    c2_exit_price = round_tick(current_stop)
                    c2_exit_time  = bar_time
                    c2_exit_type  = "trail_stop"
                    c2_pts        = round(entry - current_stop, 2)
                    c2_pnl        = round(c2_gain, 2)
                stop_hit = True
                break

            if not t1_hit and bar['low'] <= target1:
                c1_gain = abs(entry - target1) * half * multiplier
                pnl += c1_gain
                t1_hit = True
                current_stop = entry
                c1_exit_price = target1
                c1_exit_time  = bar_time
                c1_exit_type  = "target1"
                c1_pts        = round(entry - target1, 2)
                c1_pnl        = round(c1_gain, 2)

            if t1_hit:
                new_stop = bar['low'] + trail_distance
                if new_stop < current_stop:
                    current_stop = new_stop

    # EOD close
    if not stop_hit and len(eod_data) > 0:
        last      = eod_data.iloc[-1]['close']
        last_time = eod_data.index[-1].strftime('%H:%M')

        if t1_hit:
            c2_gain = (last - entry) * rest * multiplier if direction == "LONG" else (entry - last) * rest * multiplier
            pnl += c2_gain
            c2_exit_price = round_tick(last)
            c2_exit_time  = last_time
            c2_exit_type  = "eod_close"
            c2_pts        = round(last - entry if direction == "LONG" else entry - last, 2)
            c2_pnl        = round(c2_gain, 2)
            if c2_gain > 0:
                t2_hit = True
        else:
            gain = (last - entry) * contracts * multiplier if direction == "LONG" else (entry - last) * contracts * multiplier
            pnl += gain
            c1_exit_price = round_tick(last)
            c1_exit_time  = last_time
            c1_exit_type  = "eod_close"
            c1_pts        = round(last - entry if direction == "LONG" else entry - last, 2)
            c1_pnl        = round(gain / 2, 2)
            c2_exit_price = round_tick(last)
            c2_exit_time  = last_time
            c2_exit_type  = "eod_close"
            c2_pts        = c1_pts
            c2_pnl        = round(gain / 2, 2)

    result = "win" if pnl > 0 else "loss" if pnl < 0 else "breakeven"
    return (
        round(pnl, 2), result, t1_hit, t2_hit,
        c1_exit_price, c1_exit_time, c1_exit_type, c1_pts, c1_pnl,
        c2_exit_price, c2_exit_time, c2_exit_type, c2_pts, c2_pnl,
    )


def backtest_orb(ticker, scenario='A'):
    cfg        = CONFIGS[ticker]
    contracts  = cfg['contracts']
    multiplier = cfg['multiplier']
    tick       = cfg['tick']
    min_range  = cfg['min_range']

    print(f"\n{'='*60}")
    print(f"ORB BACKTEST — {cfg['label']} — Scenario {scenario}")
    print(f"{'='*60}")

    df     = get_minute_data(ticker)
    df     = df.between_time('09:30', '16:00')
    levels = get_levels()
    levels = levels[levels['ticker'] == ticker]
    trading_days = df.index.normalize().unique()
    trades = []

    for day in trading_days:
        day_name = day.day_name()
        if day_name == "Wednesday":
            continue

        day_data = df[df.index.date == day.date()]
        orb_data = day_data.between_time('09:30', '09:44')
        if len(orb_data) < 5:
            continue

        orb_high  = round_tick(orb_data['high'].max(), tick)
        orb_low   = round_tick(orb_data['low'].min(),  tick)
        orb_range = round_tick(orb_high - orb_low,     tick)

        if orb_range < min_range:
            continue

        day_levels = levels[levels['date'] == day.date()]
        if len(day_levels) == 0:
            continue
        lev = day_levels.iloc[0]

        rest_data = day_data.between_time('09:45', '11:00')
        if len(rest_data) == 0:
            continue

        for ts, bar in rest_data.iterrows():
            direction = None
            entry     = None

            if bar['close'] > orb_high:
                direction = "LONG"
                entry = round_tick(orb_high, tick)
            elif bar['close'] < orb_low:
                direction = "SHORT"
                entry = round_tick(orb_low, tick)

            if direction is None:
                continue

            # Confluence scoring
            score = 0
            if direction == "LONG" and lev['gap_pts'] < 0:
                score += 2
            elif direction == "SHORT" and lev['gap_pts'] > 0:
                score += 2
            else:
                score += 0.5

            if lev['price_above_vwap'] is not None:
                if (direction == "LONG" and lev['price_above_vwap']) or \
                   (direction == "SHORT" and not lev['price_above_vwap']):
                    score += 1

            if direction == "LONG" and not lev['pdh_nearby']:
                score += 1
            elif direction == "SHORT" and not lev['pdl_nearby']:
                score += 1

            if day_name == "Tuesday":
                score += 0.5

            if orb_range > min_range * 1.5:
                score += 0.5

            if score < 3:
                break

            stop    = round_tick(orb_low  if direction == "LONG" else orb_high, tick)
            target1 = round_tick(entry + (orb_range * 0.5) if direction == "LONG" else entry - (orb_range * 0.5), tick)
            target2 = round_tick(entry + (orb_range * 1.0) if direction == "LONG" else entry - (orb_range * 1.0), tick)

            after_entry = rest_data[rest_data.index > ts]
            full_after  = day_data[day_data.index > ts]
            full_after  = full_after.between_time('09:45', '15:55')

            if scenario == 'A':
                (pnl, result, t1_hit, t2_hit,
                 c1_exit_price, c1_exit_time, c1_exit_type, c1_pts, c1_pnl,
                 c2_exit_price, c2_exit_time, c2_exit_type, c2_pts, c2_pnl) = simulate_trade_scenario_a(
                    entry, stop, target1, target2, after_entry, direction, contracts, multiplier
                )
            else:
                (pnl, result, t1_hit, t2_hit,
                 c1_exit_price, c1_exit_time, c1_exit_type, c1_pts, c1_pnl,
                 c2_exit_price, c2_exit_time, c2_exit_type, c2_pts, c2_pnl) = simulate_trade_scenario_b(
                    entry, stop, target1, full_after, direction, contracts, multiplier
                )

            trades.append({
                'date':         str(day.date()),
                'day_of_week':  day_name,
                'ticker':       ticker,
                'strategy':     'ORB',
                'direction':    direction,
                'entry':        entry,
                'stop':         stop,
                'target1':      target1,
                'target2':      target2,
                'orb_range':    orb_range,
                'score':        score,
                'pnl':          pnl,
                'result':       result,
                't1_hit':       t1_hit,
                't2_hit':       t2_hit,
                'gap_pct':      lev['gap_pct'],
                'above_vwap':   lev['price_above_vwap'],
                'contracts':    contracts,
                'multiplier':   multiplier,
                'scenario':     scenario,
                # ── Per-contract exit detail ──────────────────────────
                'c1_exit_price': c1_exit_price,
                'c1_exit_time':  c1_exit_time,
                'c1_exit_type':  c1_exit_type,
                'c1_pts':        c1_pts,
                'c1_pnl':        c1_pnl,
                'c2_exit_price': c2_exit_price,
                'c2_exit_time':  c2_exit_time,
                'c2_exit_type':  c2_exit_type,
                'c2_pts':        c2_pts,
                'c2_pnl':        c2_pnl,
            })
            break

    return pd.DataFrame(trades)


def print_results(df, strategy, ticker, scenario):
    if len(df) == 0:
        print("No trades found")
        return

    cfg        = CONFIGS[ticker]
    total      = len(df)
    winners    = len(df[df['result'] == 'win'])
    losers     = len(df[df['result'] == 'loss'])
    breakevens = len(df[df['result'] == 'breakeven'])
    win_rate   = winners / total * 100
    total_pnl  = df['pnl'].sum()
    avg_win    = df[df['pnl'] > 0]['pnl'].mean() if winners > 0 else 0
    avg_loss   = df[df['pnl'] < 0]['pnl'].mean() if losers  > 0 else 0
    profit_factor = abs(df[df['pnl'] > 0]['pnl'].sum() / df[df['pnl'] < 0]['pnl'].sum()) if losers > 0 else float('inf')

    cumulative  = df['pnl'].cumsum()
    rolling_max = cumulative.cummax()
    drawdown    = cumulative - rolling_max
    max_drawdown = drawdown.min()

    print(f"\n{'─'*60}")
    print(f"RESULTS — {strategy} {ticker} — Scenario {scenario} — {cfg['label']}")
    print(f"{'─'*60}")
    print(f"Total Trades:     {total}")
    print(f"Win Rate:         {win_rate:.1f}%")
    print(f"Winners:          {winners}")
    print(f"Losers:           {losers}")
    print(f"Breakevens:       {breakevens}")
    print(f"Total P&L:        ${total_pnl:,.2f}")
    print(f"Avg Winner:       ${avg_win:,.2f}")
    print(f"Avg Loser:        ${avg_loss:,.2f}")
    print(f"Profit Factor:    {profit_factor:.2f}")
    print(f"Max Drawdown:     ${max_drawdown:,.2f}")
    print(f"Avg P&L/Month:    ${total_pnl/25:,.2f}")

    print(f"\n--- BY DAY OF WEEK ---")
    for day in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']:
        d = df[df['day_of_week'] == day]
        if len(d) == 0:
            continue
        wr  = len(d[d['result'] == 'win']) / len(d) * 100
        pnl = d['pnl'].sum()
        print(f"{day:<12} Trades: {len(d):>3}  Win: {wr:>5.1f}%  P&L: ${pnl:>8,.2f}")

    print(f"\n--- MONTHLY P&L ---")
    df['month'] = pd.to_datetime(df['date']).dt.to_period('M')
    monthly = df.groupby('month')['pnl'].sum()
    for month, pnl in monthly.items():
        print(f"{month}  ${pnl:>8,.2f}  {'✅' if pnl > 0 else '❌'}")

    print(f"\n--- APEX $150K SIMULATION ---")
    account        = APEX_150K['account_size']
    peak           = account
    drawdown_limit = account - APEX_150K['trailing_drawdown']
    safety_net_hit = False
    failed         = False
    profit         = 0
    warmup_days    = 20
    trade_num      = 0

    for _, trade in df.iterrows():
        trade_num += 1
        adjusted_pnl = trade['pnl'] * 0.1 if trade_num <= warmup_days else trade['pnl']
        profit  += adjusted_pnl
        account  = APEX_150K['account_size'] + profit
        if not safety_net_hit:
            if account > peak:
                peak = account
                drawdown_limit = peak - APEX_150K['trailing_drawdown']
            if account >= APEX_150K['safety_net']:
                safety_net_hit = True
                drawdown_limit = APEX_150K['account_size'] + 100
                print(f"  🎯 Safety net hit on {trade['date']} — drawdown locked at ${drawdown_limit:,}")
        if account < drawdown_limit:
            failed = True
            print(f"  ❌ Account failed on {trade['date']} — balance ${account:,.2f} below limit ${drawdown_limit:,.2f}")
            break

    if not failed:
        print(f"  ✅ Account PASSED evaluation!")
        print(f"  Final balance: ${account:,.2f}")
        print(f"  Total profit:  ${profit:,.2f}")
        print(f"  Safety net:    {'HIT ✅' if safety_net_hit else 'NOT HIT'}")

    return df


def run_monte_carlo(df, n_simulations=1000):
    if len(df) == 0:
        return
    print(f"\n--- MONTE CARLO — {n_simulations} simulations ---")
    pnl_series   = df['pnl'].values
    final_pnls   = []
    max_drawdowns = []
    for _ in range(n_simulations):
        shuffled   = np.random.permutation(pnl_series)
        cumulative = np.cumsum(shuffled)
        final_pnls.append(cumulative[-1])
        rolling_max = np.maximum.accumulate(cumulative)
        drawdowns   = cumulative - rolling_max
        max_drawdowns.append(drawdowns.min())
    final_pnls    = np.array(final_pnls)
    max_drawdowns = np.array(max_drawdowns)
    print(f"Final P&L — Best:    ${np.percentile(final_pnls,   95):>10,.2f}")
    print(f"Final P&L — Median:  ${np.percentile(final_pnls,   50):>10,.2f}")
    print(f"Final P&L — Worst:   ${np.percentile(final_pnls,    5):>10,.2f}")
    print(f"Max Drawdown — Avg:  ${np.mean(max_drawdowns):>10,.2f}")
    print(f"Max Drawdown — Worst:${np.percentile(max_drawdowns, 95):>10,.2f}")
    print(f"Risk of Ruin (<-$5k):{(max_drawdowns < -5000).mean()*100:>9.1f}%")
    print(f"Profitable (>$0):    {(final_pnls > 0).mean()*100:>9.1f}%")


def save_results_to_db(df, strategy, ticker, scenario):
    if len(df) == 0:
        return
    conn = sqlite3.connect(DB_PATH)

    # Drop and recreate table with new columns
    conn.execute('''
        CREATE TABLE IF NOT EXISTS backtest_results (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            strategy     TEXT,
            ticker       TEXT,
            date         TEXT,
            day_of_week  TEXT,
            direction    TEXT,
            entry        REAL,
            stop         REAL,
            target1      REAL,
            target2      REAL,
            pnl          REAL,
            result       TEXT,
            score        REAL,
            gap_pct      REAL,
            above_vwap   INTEGER,
            t1_hit       INTEGER,
            t2_hit       INTEGER,
            orb_range    REAL,
            contracts    INTEGER,
            multiplier   REAL,
            scenario     TEXT,
            c1_exit_price REAL,
            c1_exit_time  TEXT,
            c1_exit_type  TEXT,
            c1_pts        REAL,
            c1_pnl        REAL,
            c2_exit_price REAL,
            c2_exit_time  TEXT,
            c2_exit_type  TEXT,
            c2_pts        REAL,
            c2_pnl        REAL,
            UNIQUE(strategy, ticker, date, scenario)
        )
    ''')

    conn.execute("DELETE FROM backtest_results WHERE strategy=? AND ticker=? AND scenario=?",
                 (strategy, ticker, scenario))

    for _, row in df.iterrows():
        try:
            conn.execute('''
                INSERT OR IGNORE INTO backtest_results
                (strategy, ticker, date, day_of_week, direction, entry, stop,
                 target1, target2, pnl, result, score, gap_pct, above_vwap,
                 t1_hit, t2_hit, orb_range, contracts, multiplier, scenario,
                 c1_exit_price, c1_exit_time, c1_exit_type, c1_pts, c1_pnl,
                 c2_exit_price, c2_exit_time, c2_exit_type, c2_pts, c2_pnl)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''', (
                strategy, ticker, row['date'], row['day_of_week'],
                row['direction'], row['entry'], row['stop'],
                row['target1'], row['target2'], row['pnl'], row['result'],
                row['score'], row['gap_pct'], row.get('above_vwap', None),
                int(row['t1_hit']), int(row['t2_hit']), row.get('orb_range', 0),
                row.get('contracts', 1), row.get('multiplier', 50), scenario,
                row.get('c1_exit_price'), row.get('c1_exit_time'), row.get('c1_exit_type'),
                row.get('c1_pts'), row.get('c1_pnl'),
                row.get('c2_exit_price'), row.get('c2_exit_time'), row.get('c2_exit_type'),
                row.get('c2_pts'), row.get('c2_pnl'),
            ))
        except Exception as e:
            print(f"  ⚠️ Row insert error: {e}")

    conn.commit()
    conn.close()
    print(f"✅ Saved {len(df)} {strategy} {ticker} Scenario {scenario} trades to database")


if __name__ == "__main__":
    print("=" * 60)
    print("EDGEFLOW — ORB Backtester v3")
    print("ES (2 contracts) + NQ (10 MNQ) | Full exit tracking")
    print("Scenario A: T1 → breakeven stop → T2 or EOD")
    print("Scenario B: T1 → trail stop → EOD")
    print("=" * 60)

    all_results = {}

    for ticker in ["ES", "NQ"]:
        for scenario in ['A', 'B']:
            trades = backtest_orb(ticker, scenario=scenario)
            if len(trades) > 0:
                print_results(trades, "ORB", ticker, scenario)
                run_monte_carlo(trades)
                save_results_to_db(trades, "ORB", ticker, scenario)
                all_results[f'ORB_{ticker}_S{scenario}'] = trades

    print(f"\n{'='*60}")
    print("SCENARIO COMPARISON")
    print(f"{'='*60}")
    print(f"{'Strategy':<18} {'Trades':>8} {'Win%':>7} {'Total P&L':>12} {'PF':>8} {'Max DD':>10} {'$/Month':>10}")
    print("─" * 75)

    for key, df in all_results.items():
        if len(df) == 0:
            continue
        wr          = len(df[df['result']=='win'])/len(df)*100
        pnl         = df['pnl'].sum()
        losers_pnl  = df[df['pnl']<0]['pnl'].sum()
        winners_pnl = df[df['pnl']>0]['pnl'].sum()
        pf          = abs(winners_pnl/losers_pnl) if losers_pnl != 0 else float('inf')
        cumulative  = df['pnl'].cumsum()
        max_dd      = (cumulative - cumulative.cummax()).min()
        monthly     = pnl / 25
        print(f"{key:<18} {len(df):>8} {wr:>6.1f}% ${pnl:>11,.2f} {pf:>8.2f} ${max_dd:>9,.2f} ${monthly:>9,.2f}")

    print(f"\n✅ All results saved — check dashboard for visual comparison")