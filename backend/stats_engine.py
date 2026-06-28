import sqlite3
import pandas as pd
import pytz
from datetime import time

# Database path
DB_PATH = "../data/edgeflow.db"

# Eastern timezone — all our calculations run in ET
ET = pytz.timezone('America/New_York')

def get_minute_data(ticker):
    """Load minute bars and convert to Eastern Time"""
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query('''
        SELECT datetime, open, high, low, close, volume
        FROM minute_bars
        WHERE ticker = ?
        ORDER BY datetime ASC
    ''', conn, params=(ticker,))
    conn.close()
    
    # Convert to Eastern Time properly
    df['datetime'] = pd.to_datetime(df['datetime'], utc=True)
    df['datetime'] = df['datetime'].dt.tz_convert(ET)
    df = df.set_index('datetime')
    return df

def get_daily_data(ticker):
    """Load daily bars from database"""
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query('''
        SELECT date, open, high, low, close, volume
        FROM daily_bars
        WHERE ticker = ?
        ORDER BY date ASC
    ''', conn, params=(ticker,))
    conn.close()
    df['date'] = pd.to_datetime(df['date'])
    return df

def calculate_orb(ticker, orb_minutes=15):
    """Calculate ORB statistics with proper ET timezone"""
    print(f"\nCalculating ORB stats for {ticker} ({orb_minutes}-min range)...")
    
    df = get_minute_data(ticker)
    
    # Regular trading hours only — 9:30 to 16:00 ET
    df = df.between_time('09:30', '16:00')
    
    trading_days = df.index.normalize().unique()
    results = []
    
    for day in trading_days:
        day_data = df[df.index.date == day.date()]
        
        # Opening range window
        orb_end = f"{9}:{30 + orb_minutes:02d}" if orb_minutes < 30 else f"{10}:{orb_minutes - 30:02d}"
        orb_data = day_data.between_time('09:30', orb_end)
        
        if len(orb_data) < (orb_minutes // 2):
            continue
        
        orb_high = orb_data['high'].max()
        orb_low = orb_data['low'].min()
        orb_range = orb_high - orb_low
        
        if orb_range < 0.25:
            continue
        
        # Rest of day
        after_orb_start = f"09:{30 + orb_minutes:02d}" if orb_minutes < 30 else f"10:{orb_minutes - 30:02d}"
        rest = day_data.between_time(after_orb_start, '15:59')
        
        if len(rest) == 0:
            continue
        
        broke_high = rest['high'].max() > orb_high
        broke_low = rest['low'].min() < orb_low

        if broke_high and broke_low:
            day_type = 'double_break'
        elif broke_high:
            day_type = 'broke_high'
        elif broke_low:
            day_type = 'broke_low'
        else:
            day_type = 'no_break'

        ext_high = (rest['high'].max() - orb_high) / orb_range if broke_high else 0
        ext_low = (orb_low - rest['low'].min()) / orb_range if broke_low else 0

        # Gap calculation
        prev_days = [d for d in trading_days if d < day]
        gap_pct = None
        if len(prev_days) > 0:
            prev_close_data = df[df.index.date == prev_days[-1].date()]
            if len(prev_close_data) > 0:
                prev_close = prev_close_data['close'].iloc[-1]
                today_open = orb_data['open'].iloc[0]
                gap_pct = ((today_open - prev_close) / prev_close) * 100

        results.append({
            'date': day,
            'day_of_week': day.day_name(),
            'orb_high': orb_high,
            'orb_low': orb_low,
            'orb_range': orb_range,
            'broke_high': broke_high,
            'broke_low': broke_low,
            'day_type': day_type,
            'ext_high': ext_high,
            'ext_low': ext_low,
            'gap_pct': gap_pct,
        })

    df_results = pd.DataFrame(results)
    total = len(df_results)

    if total == 0:
        print("No data found")
        return None

    print(f"\n{'='*55}")
    print(f"ORB STATISTICS — {ticker} ({orb_minutes}-min range)")
    print(f"{'='*55}")
    print(f"Trading days analyzed: {total}")
    print(f"Confidence: {'HIGH ✅' if total > 100 else 'MEDIUM ⚠️' if total > 50 else 'LOW ❌'}")

    print(f"\n--- BREAKOUT PROBABILITIES ---")
    print(f"Broke High:    {df_results['broke_high'].mean()*100:.1f}%  (n={df_results['broke_high'].sum()})")
    print(f"Broke Low:     {df_results['broke_low'].mean()*100:.1f}%  (n={df_results['broke_low'].sum()})")
    print(f"Double Break:  {(df_results['day_type']=='double_break').mean()*100:.1f}%  (n={(df_results['day_type']=='double_break').sum()})")
    print(f"No Break:      {(df_results['day_type']=='no_break').mean()*100:.1f}%  (n={(df_results['day_type']=='no_break').sum()})")

    print(f"\n--- EXTENSIONS (in ORB multiples) ---")
    print(f"Avg extension above high: {df_results[df_results['broke_high']]['ext_high'].mean():.2f}x")
    print(f"Avg extension below low:  {df_results[df_results['broke_low']]['ext_low'].mean():.2f}x")

    print(f"\n--- BY DAY OF WEEK ---")
    for day in ['Monday','Tuesday','Wednesday','Thursday','Friday']:
        d = df_results[df_results['day_of_week']==day]
        if len(d) == 0: continue
        print(f"{day:<12} High: {d['broke_high'].mean()*100:.1f}%  Low: {d['broke_low'].mean()*100:.1f}%  Double: {(d['day_type']=='double_break').mean()*100:.1f}%  (n={len(d)})")

    print(f"\n--- BY GAP DIRECTION ---")
    gap_up = df_results[df_results['gap_pct'] > 0.1] if 'gap_pct' in df_results else None
    gap_down = df_results[df_results['gap_pct'] < -0.1] if 'gap_pct' in df_results else None
    flat = df_results[(df_results['gap_pct'] >= -0.1) & (df_results['gap_pct'] <= 0.1)] if 'gap_pct' in df_results else None

    if gap_up is not None and len(gap_up) > 0:
        print(f"Gap Up   ({len(gap_up):>3} days) — Broke High: {gap_up['broke_high'].mean()*100:.1f}%  Broke Low: {gap_up['broke_low'].mean()*100:.1f}%")
    if gap_down is not None and len(gap_down) > 0:
        print(f"Gap Down ({len(gap_down):>3} days) — Broke High: {gap_down['broke_high'].mean()*100:.1f}%  Broke Low: {gap_down['broke_low'].mean()*100:.1f}%")
    if flat is not None and len(flat) > 0:
        print(f"Flat     ({len(flat):>3} days) — Broke High: {flat['broke_high'].mean()*100:.1f}%  Broke Low: {flat['broke_low'].mean()*100:.1f}%")

    print(f"\n--- ORB RANGE SIZE ---")
    print(f"Average: {df_results['orb_range'].mean():.2f} pts  Median: {df_results['orb_range'].median():.2f} pts")

    return df_results


def calculate_ib(ticker):
    """Calculate Initial Balance statistics with proper ET timezone"""
    print(f"\nCalculating IB stats for {ticker}...")

    df = get_minute_data(ticker)
    df = df.between_time('09:30', '16:00')
    trading_days = df.index.normalize().unique()
    results = []

    for day in trading_days:
        day_data = df[df.index.date == day.date()]

        ib_data = day_data.between_time('09:30', '10:29')
        if len(ib_data) < 30:
            continue

        ib_high = ib_data['high'].max()
        ib_low = ib_data['low'].min()
        ib_range = ib_high - ib_low

        if ib_range < 0.25:
            continue

        first_high_time = ib_data['high'].idxmax()
        first_low_time = ib_data['low'].idxmin()
        high_first = first_high_time < first_low_time

        rest = day_data.between_time('10:30', '15:59')
        if len(rest) == 0:
            continue

        broke_high = rest['high'].max() > ib_high
        broke_low = rest['low'].min() < ib_low

        if broke_high and broke_low:
            day_type = 'double_break'
        elif broke_high:
            day_type = 'single_break_high'
        elif broke_low:
            day_type = 'single_break_low'
        else:
            day_type = 'no_break'

        ext_high = (rest['high'].max() - ib_high) / ib_range if broke_high else 0
        ext_low = (ib_low - rest['low'].min()) / ib_range if broke_low else 0

        results.append({
            'date': day,
            'day_of_week': day.day_name(),
            'ib_high': ib_high,
            'ib_low': ib_low,
            'ib_range': ib_range,
            'high_first': high_first,
            'broke_high': broke_high,
            'broke_low': broke_low,
            'day_type': day_type,
            'ext_high': ext_high,
            'ext_low': ext_low,
        })

    df_results = pd.DataFrame(results)
    total = len(df_results)

    if total == 0:
        print("No data found")
        return None

    print(f"\n{'='*55}")
    print(f"IB STATISTICS — {ticker}")
    print(f"{'='*55}")
    print(f"Trading days analyzed: {total}")
    print(f"Confidence: {'HIGH ✅' if total > 100 else 'MEDIUM ⚠️' if total > 50 else 'LOW ❌'}")

    print(f"\n--- BREAK PROBABILITIES ---")
    print(f"Single Break High: {(df_results['day_type']=='single_break_high').mean()*100:.1f}%  (n={(df_results['day_type']=='single_break_high').sum()})")
    print(f"Single Break Low:  {(df_results['day_type']=='single_break_low').mean()*100:.1f}%  (n={(df_results['day_type']=='single_break_low').sum()})")
    print(f"Double Break:      {(df_results['day_type']=='double_break').mean()*100:.1f}%  (n={(df_results['day_type']=='double_break').sum()})")
    print(f"No Break:          {(df_results['day_type']=='no_break').mean()*100:.1f}%  (n={(df_results['day_type']=='no_break').sum()})")
    print(f"\nBroke High (total): {df_results['broke_high'].mean()*100:.1f}%")
    print(f"Broke Low (total):  {df_results['broke_low'].mean()*100:.1f}%")

    print(f"\n--- BY REJECTION (which side printed first) ---")
    hf = df_results[df_results['high_first']==True]
    lf = df_results[df_results['high_first']==False]
    if len(hf) > 0:
        print(f"HIGH printed first ({len(hf)} days) → Broke High: {hf['broke_high'].mean()*100:.1f}%  Broke Low: {hf['broke_low'].mean()*100:.1f}%")
    if len(lf) > 0:
        print(f"LOW printed first  ({len(lf)} days) → Broke High: {lf['broke_high'].mean()*100:.1f}%  Broke Low: {lf['broke_low'].mean()*100:.1f}%")

    print(f"\n--- EXTENSIONS ---")
    print(f"Avg extension above IB high: {df_results[df_results['broke_high']]['ext_high'].mean():.2f}x IB range")
    print(f"Avg extension below IB low:  {df_results[df_results['broke_low']]['ext_low'].mean():.2f}x IB range")

    print(f"\n--- BY DAY OF WEEK ---")
    for day in ['Monday','Tuesday','Wednesday','Thursday','Friday']:
        d = df_results[df_results['day_of_week']==day]
        if len(d) == 0: continue
        print(f"{day:<12} High: {d['broke_high'].mean()*100:.1f}%  Low: {d['broke_low'].mean()*100:.1f}%  Double: {(d['day_type']=='double_break').mean()*100:.1f}%  (n={len(d)})")

    print(f"\n--- IB RANGE SIZE ---")
    print(f"Average: {df_results['ib_range'].mean():.2f} pts  Median: {df_results['ib_range'].median():.2f} pts")

    return df_results


if __name__ == "__main__":
    # Install pytz if needed
    print("Running EdgeFlow Stats Engine...")
    print("Timezone: America/New_York (ET)\n")
    
    calculate_orb("ES", orb_minutes=15)
    calculate_orb("NQ", orb_minutes=15)
    calculate_ib("ES")
    calculate_ib("NQ")