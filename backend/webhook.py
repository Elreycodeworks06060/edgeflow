import json
import os
from dotenv import load_dotenv
from datetime import datetime
import sqlite3
import pytz
from collections import defaultdict

load_dotenv()
ET = pytz.timezone('America/New_York')
DB_PATH = "../data/edgeflow.db"

# ─── LIVE PRICE FEED (in-memory) ─────────────────────────────────────────────
# Stores real-time bars received from TradingView webhooks
# Structure: { 'ES': [{'time': '09:30', 'open': ..., 'high': ..., 'low': ..., 'close': ..., 'volume': ...}, ...] }
live_bars = defaultdict(list)
live_feed_active = False

def update_live_bar(ticker, bar):
    """
    Called every time TradingView fires a 1-minute bar close.
    Stores the bar in memory for the algo to use.
    """
    global live_feed_active
    live_feed_active = True

    now = datetime.now(ET)
    # Convert bar time to ET — TradingView sends UTC, we need ET
    raw_time = bar.get('time', '')
    try:
        if raw_time and str(raw_time).isdigit():
            from datetime import timezone
            bar_dt = datetime.fromtimestamp(int(raw_time), tz=timezone.utc)
            bar_dt_et = bar_dt.astimezone(ET)
            et_time = bar_dt_et.strftime('%H:%M')
        elif raw_time and len(str(raw_time)) > 5:
            bar_dt = datetime.fromisoformat(str(raw_time).replace('Z', '+00:00'))
            bar_dt_et = bar_dt.astimezone(ET)
            et_time = bar_dt_et.strftime('%H:%M')
        else:
            et_time = now.strftime('%H:%M')
    except:
        et_time = now.strftime('%H:%M')

    bar_entry = {
        'time': et_time,
        'open': float(bar.get('open', 0)),
        'high': float(bar.get('high', 0)),
        'low': float(bar.get('low', 0)),
        'close': float(bar.get('close', 0)),
        'volume': int(bar.get('volume', 0)),
        'datetime': now,
    }

    # Reset bars at start of new session (9:30 AM)
    if now.hour == 9 and now.minute == 30:
        live_bars[ticker] = []
        print(f"[LIVE FEED] {ticker} — New session started, bars reset")

    # Avoid duplicates — replace if same time
    existing = [b for b in live_bars[ticker] if b['time'] != bar_entry['time']]
    existing.append(bar_entry)
    live_bars[ticker] = existing

    print(f"[LIVE FEED] {ticker} {bar_entry['time']} (raw: {raw_time}) — O:{bar_entry['open']} H:{bar_entry['high']} L:{bar_entry['low']} C:{bar_entry['close']} V:{bar_entry['volume']}")

def get_live_bars(ticker):
    """Get all live bars for a ticker"""
    return live_bars.get(ticker, [])

def get_live_orb(ticker):
    """
    Calculate ORB high/low/range from live bars (9:30 - 9:44 AM)
    Returns None if ORB period not complete yet
    """
    bars = get_live_bars(ticker)
    if not bars:
        return None

    orb_bars = [b for b in bars if '09:30' <= b['time'] <= '09:44']
    if len(orb_bars) < 5:
        return None

    orb_high = max(b['high'] for b in orb_bars)
    orb_low = min(b['low'] for b in orb_bars)
    orb_range = orb_high - orb_low

    return {
        'high': round(round(orb_high / 0.25) * 0.25, 2),
        'low': round(round(orb_low / 0.25) * 0.25, 2),
        'range': round(round(orb_range / 0.25) * 0.25, 2),
        'bars': len(orb_bars),
    }

def get_latest_price(ticker):
    """Get most recent close price from live feed"""
    bars = get_live_bars(ticker)
    if not bars:
        return None
    return bars[-1]['close']

def is_live_feed_active():
    """Check if we're receiving live data"""
    return live_feed_active and len(live_bars) > 0

# ─── CONTRACT CONFIG ──────────────────────────────────────────────────────────
TRADE_CONFIG = {
    'ES': {'contracts': 2, 'multiplier': 50},
    'NQ': {'contracts': 10, 'multiplier': 2},
}

# ─── FORMAT SIGNAL FOR LOGGING ────────────────────────────────────────────────
def format_trade(signal):
    ticker = signal['ticker']
    cfg = TRADE_CONFIG.get(ticker, {'contracts': 1, 'multiplier': 50})
    contracts = signal.get('contracts', cfg['contracts'])
    multiplier = signal.get('multiplier', cfg['multiplier'])

    entry = signal['entry']
    stop = signal['stop']
    target = signal.get('target2', signal.get('target', 0))
    target1 = signal.get('target1', 0)

    risk_pts = abs(entry - stop)
    reward_pts = abs(target - entry)
    risk_dollars = round(risk_pts * contracts * multiplier, 2)
    reward_dollars = round(reward_pts * contracts * multiplier, 2)
    rr_ratio = round(reward_pts / risk_pts, 2) if risk_pts > 0 else 0

    return {
        'timestamp': signal.get('timestamp', datetime.now(ET).strftime('%Y-%m-%d %H:%M:%S ET')),
        'ticker': ticker,
        'strategy': signal.get('strategy', 'ORB'),
        'direction': signal['direction'],
        'entry': entry,
        'stop': stop,
        'target': target,
        'target1': target1,
        'contracts': contracts,
        'multiplier': multiplier,
        'risk_dollars': risk_dollars,
        'reward_dollars': reward_dollars,
        'rr_ratio': rr_ratio,
        'confluence_score': signal.get('confluence_score', 0),
        'scenario': signal.get('scenario', 'A'),
        'scenario_desc': signal.get('scenario_desc', ''),
        'paper': True,
    }

# ─── PAPER TRADE LOGGING ─────────────────────────────────────────────────────
def simulate_paper_trade(signal):
    """Log a paper trade to the database"""
    trade = format_trade(signal)

    print(f"\n📋 PAPER TRADE — {trade['ticker']} {trade['direction']}")
    print(f"   Strategy:  {trade['strategy']} | Scenario {trade['scenario']}")
    print(f"   Contracts: {trade['contracts']} @ ${trade['multiplier']}/pt")
    print(f"   Entry:     {trade['entry']}")
    print(f"   Stop:      {trade['stop']}  (-${trade['risk_dollars']})")
    print(f"   Target 1:  {trade['target1']}")
    print(f"   Target 2:  {trade['target']}  (+${trade['reward_dollars']})")
    print(f"   R/R:       {trade['rr_ratio']}R")
    print(f"   Score:     {trade['confluence_score']}/5")

    log_trade(trade)
    return trade

def log_trade(trade):
    """Save trade to database"""
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS trade_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            ticker TEXT,
            strategy TEXT,
            direction TEXT,
            entry REAL,
            stop REAL,
            target REAL,
            target1 REAL,
            contracts INTEGER,
            multiplier REAL,
            risk_dollars REAL,
            reward_dollars REAL,
            rr_ratio REAL,
            confluence_score REAL,
            scenario TEXT,
            scenario_desc TEXT,
            paper INTEGER DEFAULT 1,
            result TEXT DEFAULT 'open',
            pnl REAL DEFAULT 0
        )
    ''')
    conn.execute('''
        INSERT INTO trade_log (
            timestamp, ticker, strategy, direction, entry, stop, target, target1,
            contracts, multiplier, risk_dollars, reward_dollars, rr_ratio,
            confluence_score, scenario, scenario_desc, paper
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        trade['timestamp'], trade['ticker'], trade['strategy'],
        trade['direction'], trade['entry'], trade['stop'],
        trade['target'], trade['target1'], trade['contracts'],
        trade['multiplier'], trade['risk_dollars'], trade['reward_dollars'],
        trade['rr_ratio'], trade['confluence_score'],
        trade['scenario'], trade['scenario_desc'], 1
    ))
    conn.commit()
    conn.close()

def get_trade_log():
    """Get all trades from the log"""
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute('''
            SELECT * FROM trade_log ORDER BY timestamp DESC LIMIT 50
        ''').fetchall()
        cols = ['id', 'timestamp', 'ticker', 'strategy', 'direction',
                'entry', 'stop', 'target', 'target1', 'contracts', 'multiplier',
                'risk_dollars', 'reward_dollars', 'rr_ratio', 'confluence_score',
                'scenario', 'scenario_desc', 'paper', 'result', 'pnl']
        trades = []
        for row in rows:
            d = dict(zip(cols, row))
            trades.append(d)
    except Exception as e:
        print(f"Trade log error: {e}")
        trades = []
    conn.close()
    return trades

def update_signal_status(signal, status):
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        UPDATE signals SET status = ?
        WHERE ticker = ? AND strategy = ? AND timestamp = ?
    ''', (status, signal['ticker'], signal['strategy'], signal.get('timestamp', '')))
    conn.commit()
    conn.close()

if __name__ == "__main__":
    print("=" * 55)
    print("EDGEFLOW — Webhook & Live Feed System")
    print("=" * 55)

    # Test with a simulated bar
    print("\nSimulating live bar from TradingView...")
    update_live_bar('ES', {
        'time': '09:30',
        'open': 5415.25,
        'high': 5418.50,
        'low': 5414.75,
        'close': 5417.00,
        'volume': 1243
    })

    print(f"\nLive feed active: {is_live_feed_active()}")
    print(f"ES bars: {len(get_live_bars('ES'))}")
    print(f"Latest ES price: {get_latest_price('ES')}")