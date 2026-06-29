import sqlite3
import pandas as pd
import pytz
import json
from datetime import datetime, date

ET = pytz.timezone('America/New_York')
DB_PATH = "../data/edgeflow.db"

# ─── STRATEGY CONFIG ──────────────────────────────────────────────────────────
# ES: 2 contracts, Scenario B (trail stop after T1, run to EOD)
# NQ: 10 MNQ contracts, Scenario A (breakeven stop after T1, target T2)

STRATEGY_CONFIG = {
    'ES': {
        'contracts': 2,
        'multiplier': 50,       # $50 per point per contract
        'tick': 0.25,           # Minimum price increment
        'min_range': 8.0,       # Minimum ORB range in points
        'scenario': 'B',        # Trail stop after T1
        'target1_mult': 0.5,    # T1 at 0.5x ORB range
        'target2_mult': 1.0,    # T2 at 1.0x ORB range
        'label': '2 ES contracts',
    },
    'NQ': {
        'contracts': 10,        # 10 MNQ contracts
        'multiplier': 2,        # $2 per point per MNQ contract
        'tick': 0.25,
        'min_range': 50.0,
        'scenario': 'A',        # Breakeven stop after T1, target T2
        'target1_mult': 0.5,
        'target2_mult': 1.0,
        'label': '10 MNQ contracts',
    },
}

CONFIG = {
    'daily_profit_target': 3000,   # ~2 full winners ES + NQ combined
    'daily_loss_limit': 3200,      # ~2 full losers ES + NQ combined
    'max_consecutive_losses': 2,   # 2 bad days in a row = pause and review
    'min_confluence': 3,
    'min_orb_range_es': 8.0,
    'min_orb_range_nq': 50.0,
    'tickers': ['ES', 'NQ'],
}

# ─── DAILY STATE ──────────────────────────────────────────────────────────────
class DailyState:
    def __init__(self):
        self.reset()

    def reset(self):
        self.daily_pnl = 0.0
        self.trades_taken = 0
        self.consecutive_losses = 0
        self.trades = []
        self.armed = True
        self.disarm_reason = None
        self.date = date.today()

    def add_trade(self, trade):
        self.trades.append(trade)
        self.trades_taken += 1
        self.daily_pnl += trade['pnl']
        if trade['pnl'] < 0:
            self.consecutive_losses += 1
        else:
            self.consecutive_losses = 0
        self._check_limits()

    def _check_limits(self):
        if self.daily_pnl >= CONFIG['daily_profit_target']:
            self.armed = False
            self.disarm_reason = f"Daily profit target hit: ${self.daily_pnl:.2f}"
        elif self.daily_pnl <= -CONFIG['daily_loss_limit']:
            self.armed = False
            self.disarm_reason = f"Daily loss limit hit: ${self.daily_pnl:.2f}"
        elif self.consecutive_losses >= CONFIG['max_consecutive_losses']:
            self.armed = False
            self.disarm_reason = f"Max consecutive losses: {self.consecutive_losses}"

state = DailyState()

# ─── HELPERS ──────────────────────────────────────────────────────────────────
def round_tick(price, tick=0.25):
    """Round price to nearest valid tick increment"""
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

def get_today_data(ticker):
    """
    Get today's price data.
    Uses live feed from TradingView if available,
    falls back to database for paper trading on historical data.
    """
    from webhook import is_live_feed_active, get_live_bars
    import pandas as pd

    if is_live_feed_active():
        # Use live bars from TradingView webhook
        bars = get_live_bars(ticker)
        if bars:
            df = pd.DataFrame(bars)
            df['datetime'] = pd.to_datetime(df['datetime'])
            df = df.set_index('datetime')
            df = df.sort_index()
            log(f"{ticker} using LIVE feed — {len(df)} bars")
            return df

    # Fall back to database (historical/paper trading)
    df = get_minute_data(ticker)
    today = datetime.now(ET).date()
    df = df[df.index.date == today]
    if len(df) > 0:
        log(f"{ticker} using DATABASE — {len(df)} bars for {today}")
    return df

def get_current_time_et():
    return datetime.now(ET)

def log(msg, level="INFO"):
    now = get_current_time_et().strftime('%Y-%m-%d %H:%M:%S ET')
    print(f"[{level}] {now} — {msg}")

def get_gap_direction(ticker):
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query('''
        SELECT date, open, close FROM daily_bars
        WHERE ticker = ? ORDER BY date DESC LIMIT 2
    ''', conn, params=(ticker,))
    conn.close()
    if len(df) < 2:
        return "flat", 0.0
    prev_close = df.iloc[1]['close']
    today_open = df.iloc[0]['open']
    gap_pct = ((today_open - prev_close) / prev_close) * 100
    if gap_pct > 0.1:
        return "up", gap_pct
    elif gap_pct < -0.1:
        return "down", gap_pct
    else:
        return "flat", gap_pct

# ─── CONFLUENCE SCORING ───────────────────────────────────────────────────────
def score_confluence_orb(ticker, direction, gap_dir, orb_range):
    score = 0.0
    factors = []
    cfg = STRATEGY_CONFIG[ticker]

    # Factor 1 — Gap direction (worth 2 points if aligned)
    if direction == "LONG" and gap_dir == "down":
        score += 2
        factors.append("✅✅ Gap down + long breakout (+2)")
    elif direction == "SHORT" and gap_dir == "up":
        score += 2
        factors.append("✅✅ Gap up + short breakout (+2)")
    else:
        score += 0.5
        factors.append("⚠️ Gap neutral (+0.5)")

    # Factor 2 — VWAP alignment (approximate using key levels)
    conn = sqlite3.connect(DB_PATH)
    today_str = get_current_time_et().strftime('%Y-%m-%d')
    lev = conn.execute(
        'SELECT price_above_vwap, pdh_nearby, pdl_nearby FROM key_levels WHERE ticker=? AND date=?',
        (ticker, today_str)
    ).fetchone()
    conn.close()

    if lev:
        price_above_vwap, pdh_nearby, pdl_nearby = lev
        if price_above_vwap is not None:
            aligned = (direction == "LONG" and price_above_vwap) or \
                      (direction == "SHORT" and not price_above_vwap)
            if aligned:
                score += 1
                factors.append("✅ VWAP aligned with direction (+1)")
            else:
                factors.append("❌ VWAP against direction (0)")

        # Factor 3 — PDH/PDL not blocking target
        if direction == "LONG" and not pdh_nearby:
            score += 1
            factors.append("✅ PDH not blocking upside (+1)")
        elif direction == "SHORT" and not pdl_nearby:
            score += 1
            factors.append("✅ PDL not blocking downside (+1)")
        else:
            factors.append("⚠️ Key level nearby — reduced target")
    else:
        score += 0.5
        factors.append("➡️ Key levels not available (+0.5)")

    # Factor 4 — Day of week
    day = get_current_time_et().strftime('%A')
    if day == "Tuesday":
        score += 0.5
        factors.append("✅ Tuesday — strongest ORB day (+0.5)")
    else:
        factors.append(f"➡️ {day} — standard day")

    # Factor 5 — Range size
    min_range = cfg['min_range']
    if orb_range > min_range * 1.5:
        score += 0.5
        factors.append(f"✅ Range {orb_range:.2f} pts — above 1.5x minimum (+0.5)")
    else:
        factors.append(f"➡️ Range {orb_range:.2f} pts — standard")

    return {'score': round(score, 1), 'factors': factors}

# ─── ORB SIGNAL DETECTION ─────────────────────────────────────────────────────
def detect_orb_signal(ticker):
    now = get_current_time_et()
    day_name = now.strftime('%A')

    # NO WEDNESDAY TRADES
    if day_name == "Wednesday":
        return None

    # Only scan 9:45 AM - 11:00 AM
    bar_mins = now.hour * 60 + now.minute
    if bar_mins < 9 * 60 + 45 or bar_mins > 11 * 60:
        return None

    df = get_today_data(ticker)
    if len(df) == 0:
        return None

    cfg = STRATEGY_CONFIG[ticker]
    tick = cfg['tick']

    # Get ORB range
    orb_data = df.between_time('09:30', '09:44')
    if len(orb_data) < 5:
        return None

    orb_high = round_tick(orb_data['high'].max(), tick)
    orb_low = round_tick(orb_data['low'].min(), tick)
    orb_range = round_tick(orb_high - orb_low, tick)

    if orb_range < cfg['min_range']:
        log(f"{ticker} ORB range too small ({orb_range:.2f} pts) — skipping", "WARN")
        return None

    # Current price
    current_price = df.iloc[-1]['close']
    gap_dir, gap_pct = get_gap_direction(ticker)

    direction = None
    entry = None

    if current_price > orb_high:
        direction = "LONG"
        entry = round_tick(orb_high, tick)
    elif current_price < orb_low:
        direction = "SHORT"
        entry = round_tick(orb_low, tick)

    if direction is None:
        return None

    confluence = score_confluence_orb(ticker, direction, gap_dir, orb_range)

    if confluence['score'] < CONFIG['min_confluence']:
        log(f"{ticker} ORB score too low ({confluence['score']}) — skipping")
        return None

    # Calculate targets — tick corrected
    stop = round_tick(orb_low if direction == "LONG" else orb_high, tick)
    target1 = round_tick(
        entry + (orb_range * cfg['target1_mult']) if direction == "LONG"
        else entry - (orb_range * cfg['target1_mult']), tick
    )
    target2 = round_tick(
        entry + (orb_range * cfg['target2_mult']) if direction == "LONG"
        else entry - (orb_range * cfg['target2_mult']), tick
    )

    risk_pts = abs(entry - stop)
    risk_dollars = round(risk_pts * cfg['contracts'] * cfg['multiplier'], 2)
    reward_dollars = round(abs(target2 - entry) * cfg['contracts'] * cfg['multiplier'], 2)

    signal = {
        'strategy': 'ORB',
        'ticker': ticker,
        'direction': direction,
        'entry': entry,
        'stop': stop,
        'target': target2,   # Dashboard shows T2 as main target
        'target1': target1,
        'target2': target2,
        'orb_high': orb_high,
        'orb_low': orb_low,
        'orb_range': orb_range,
        'contracts': cfg['contracts'],
        'multiplier': cfg['multiplier'],
        'scenario': cfg['scenario'],
        'scenario_desc': 'Trail stop → EOD' if cfg['scenario'] == 'B' else 'Breakeven stop → T2',
        'gap_direction': gap_dir,
        'gap_pct': round(gap_pct, 3),
        'risk_dollars': risk_dollars,
        'reward_dollars': reward_dollars,
        'rr_ratio': round(reward_dollars / risk_dollars, 1) if risk_dollars > 0 else 0,
        'confluence_score': confluence['score'],
        'confluence_factors': confluence['factors'],
        'timestamp': now.strftime('%Y-%m-%d %H:%M:%S ET'),
    }

    log(f"🎯 ORB SIGNAL — {ticker} {direction} | Entry: {entry} | Stop: {stop} | T1: {target1} | T2: {target2} | {cfg['label']} | Score: {confluence['score']}/5 | Scenario {cfg['scenario']}")
    return signal

# ─── IB SIGNAL DETECTION ──────────────────────────────────────────────────────
def detect_ib_signal(ticker):
    now = get_current_time_et()
    day_name = now.strftime('%A')

    # NO WEDNESDAY TRADES
    if day_name == "Wednesday":
        return None

    # Only after 10:30 AM
    if now.hour < 10 or (now.hour == 10 and now.minute < 30):
        return None

    df = get_today_data(ticker)
    if len(df) == 0:
        return None

    cfg = STRATEGY_CONFIG[ticker]
    tick = cfg['tick']

    ib_data = df.between_time('09:30', '10:29')
    if len(ib_data) < 30:
        return None

    ib_high = round_tick(ib_data['high'].max(), tick)
    ib_low = round_tick(ib_data['low'].min(), tick)
    ib_range = round_tick(ib_high - ib_low, tick)

    min_ib = CONFIG[f'min_orb_range_{ticker.lower()}'] * 2
    if ib_range < min_ib:
        return None

    first_high_time = ib_data['high'].idxmax()
    first_low_time = ib_data['low'].idxmin()
    high_first = first_high_time < first_low_time

    expected_dir = "SHORT" if high_first else "LONG"

    rest_data = df.between_time('10:30', '15:59')
    if len(rest_data) == 0:
        return None

    current_price = rest_data.iloc[-1]['close']

    if expected_dir == "LONG" and current_price <= ib_high:
        return None
    if expected_dir == "SHORT" and current_price >= ib_low:
        return None

    entry = round_tick(ib_high if expected_dir == "LONG" else ib_low, tick)
    stop = round_tick(ib_low if expected_dir == "LONG" else ib_high, tick)
    target1 = round_tick(
        entry + (ib_range * 0.5) if expected_dir == "LONG"
        else entry - (ib_range * 0.5), tick
    )
    target2 = round_tick(
        entry + (ib_range * 0.7) if expected_dir == "LONG"
        else entry - (ib_range * 0.7), tick
    )

    signal = {
        'strategy': 'IB',
        'ticker': ticker,
        'direction': expected_dir,
        'entry': entry,
        'stop': stop,
        'target': target2,
        'target1': target1,
        'target2': target2,
        'ib_high': ib_high,
        'ib_low': ib_low,
        'ib_range': ib_range,
        'high_first': high_first,
        'contracts': cfg['contracts'],
        'multiplier': cfg['multiplier'],
        'confluence_score': 3,
        'confluence_factors': [f"{'HIGH' if high_first else 'LOW'} printed first → {expected_dir}"],
        'timestamp': now.strftime('%Y-%m-%d %H:%M:%S ET'),
    }

    log(f"🎯 IB SIGNAL — {ticker} {expected_dir} | Entry: {entry} | Stop: {stop} | T1: {target1} | T2: {target2}")
    return signal

# ─── SIGNAL LOG ───────────────────────────────────────────────────────────────
def log_signal(signal):
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT, strategy TEXT, ticker TEXT, direction TEXT,
            entry REAL, stop REAL, target REAL, confluence_score REAL,
            confluence_factors TEXT, status TEXT DEFAULT 'pending',
            UNIQUE(ticker, timestamp, direction)
        )
    ''')
    conn.execute('''
        CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_unique
        ON signals(ticker, timestamp, direction)
    ''')
    conn.execute('''
        INSERT OR IGNORE INTO signals (timestamp, strategy, ticker, direction, entry, stop,
        target, confluence_score, confluence_factors)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        signal['timestamp'], signal['strategy'], signal['ticker'],
        signal['direction'], signal['entry'], signal['stop'], signal['target'],
        signal['confluence_score'], json.dumps(signal['confluence_factors'])
    ))
    conn.commit()
    conn.close()

# ─── MAIN SCAN ────────────────────────────────────────────────────────────────
def scan_for_signals():
    if not state.armed:
        log(f"Algo DISARMED — {state.disarm_reason}", "WARN")
        return []

    now = get_current_time_et()
    day_name = now.strftime('%A')

    # NO WEDNESDAY TRADES
    if day_name == "Wednesday":
        log("Wednesday — no trades today")
        return []

    signals = []
    bar_mins = now.hour * 60 + now.minute

    for ticker in CONFIG['tickers']:
        # ORB window: 9:45 AM - 11:00 AM
        if 9 * 60 + 45 <= bar_mins <= 11 * 60:
            orb = detect_orb_signal(ticker)
            if orb:
                signals.append(orb)
                log_signal(orb)

        # IB window: 10:30 AM - 12:00 PM
        if 10 * 60 + 30 <= bar_mins <= 12 * 60:
            ib = detect_ib_signal(ticker)
            if ib:
                signals.append(ib)
                log_signal(ib)

    if signals:
        log(f"✅ Found {len(signals)} signal(s)")
    else:
        log("No signals this scan")

    return signals

# ─── STATUS ───────────────────────────────────────────────────────────────────
def get_status():
    return {
        'armed': state.armed,
        'disarm_reason': state.disarm_reason,
        'daily_pnl': state.daily_pnl,
        'trades_taken': state.trades_taken,
        'consecutive_losses': state.consecutive_losses,
        'date': str(state.date),
        'config': CONFIG,
        'strategy_config': {
            'ES': {'contracts': 2, 'scenario': 'B', 'desc': 'Trail stop → EOD', 'label': '2 ES contracts'},
            'NQ': {'contracts': 10, 'scenario': 'A', 'desc': 'Breakeven stop → T2', 'label': '10 MNQ contracts'},
        }
    }

def run_premarket_checklist():
    log("Running pre-market checklist...")
    now = get_current_time_et()
    day_name = now.strftime('%A')

    if day_name == "Wednesday":
        state.armed = False
        state.disarm_reason = "Wednesday — no trades"
        log("Wednesday — algo disarmed for today")
        return {'day_of_week': day_name, 'armed': False}

    if state.consecutive_losses >= CONFIG['max_consecutive_losses']:
        state.armed = False
        state.disarm_reason = f"Consecutive losses: {state.consecutive_losses}"
        log(f"DISARMED — {state.consecutive_losses} consecutive losses", "WARN")

    if state.armed:
        log(f"✅ Pre-market checklist PASSED — Algo ARMED for {day_name}")
        log(f"   ES: 2 contracts, Scenario B (trail stop)")
        log(f"   NQ: 10 MNQ contracts, Scenario A (breakeven stop)")

    return {'day_of_week': day_name, 'armed': state.armed}

if __name__ == "__main__":
    print("=" * 55)
    print("EDGEFLOW — Algo Engine v2")
    print("ES: 2 contracts | Scenario B (Trail Stop)")
    print("NQ: 10 MNQ     | Scenario A (Breakeven Stop)")
    print("No Wednesdays  | Tick-corrected")
    print("=" * 55)
    checklist = run_premarket_checklist()
    print(f"\nStatus: {'ARMED ✅' if state.armed else 'DISARMED ❌'}")
    signals = scan_for_signals()
    if signals:
        print(f"\n{len(signals)} signal(s) found:")
        for s in signals:
            print(f"  → {s['strategy']} {s['ticker']} {s['direction']} | {s.get('label', '')} | Score: {s['confluence_score']}/5")
    else:
        print("No signals — market not in session or no qualifying setups")
    print(f"\nDaily P&L: ${state.daily_pnl:.2f}")