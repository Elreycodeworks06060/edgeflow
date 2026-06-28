import sqlite3
import pandas as pd

# Database path
DB_PATH = "../data/edgeflow.db"

def get_minute_data(ticker):
    """Load minute bars from database"""
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query('''
        SELECT datetime, open, high, low, close, volume
        FROM minute_bars
        WHERE ticker = ?
        ORDER BY datetime ASC
    ''', conn, params=(ticker,))
    conn.close()
    df['datetime'] = pd.to_datetime(df['datetime'])
    df = df.set_index('datetime')
    return df

def calculate_ib_stats(ticker):
    """Calculate Initial Balance statistics"""
    print(f"\nCalculating IB stats for {ticker}...")
    
    df = get_minute_data(ticker)
    
    # Filter to regular trading hours
    df = df.between_time('09:30', '16:00')
    
    # Get unique trading days
    trading_days = df.index.normalize().unique()
    
    results = []
    
    for day in trading_days:
        day_data = df[df.index.normalize() == day]
        
        # Initial Balance = first 60 minutes (9:30 to 10:29)
        ib_data = day_data.between_time('09:30', '10:29')
        
        if len(ib_data) < 30:  # Skip days with insufficient data
            continue
        
        ib_high = ib_data['high'].max()
        ib_low = ib_data['low'].min()
        ib_range = ib_high - ib_low
        
        if ib_range == 0:
            continue
        
        # Which side printed first — high or low of IB?
        first_high_time = ib_data['high'].idxmax()
        first_low_time = ib_data['low'].idxmin()
        high_first = first_high_time < first_low_time
        
        # Rest of day after IB
        rest_of_day = day_data.between_time('10:30', '16:00')
        
        if len(rest_of_day) == 0:
            continue
        
        # Did price break above IB high?
        broke_high = rest_of_day['high'].max() > ib_high
        # Did price break below IB low?
        broke_low = rest_of_day['low'].min() < ib_low
        
        # Classify the day
        if broke_high and broke_low:
            day_type = 'double_break'
        elif broke_high:
            day_type = 'single_break_high'
        elif broke_low:
            day_type = 'single_break_low'
        else:
            day_type = 'no_break'
        
        # Extension levels
        if broke_high:
            ext_high = (rest_of_day['high'].max() - ib_high) / ib_range
        else:
            ext_high = 0
            
        if broke_low:
            ext_low = (ib_low - rest_of_day['low'].min()) / ib_range
        else:
            ext_low = 0
        
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
    
    results_df = pd.DataFrame(results)
    total_days = len(results_df)
    
    if total_days == 0:
        print("No data found")
        return
    
    print(f"\n{'='*50}")
    print(f"IB STATISTICS — {ticker}")
    print(f"{'='*50}")
    print(f"Total trading days analyzed: {total_days}")
    print(f"Sample size confidence: {'HIGH' if total_days > 100 else 'MEDIUM' if total_days > 50 else 'LOW'}")
    
    print(f"\n--- BREAK PROBABILITIES ---")
    single_high = (results_df['day_type'] == 'single_break_high').mean() * 100
    single_low = (results_df['day_type'] == 'single_break_low').mean() * 100
    double = (results_df['day_type'] == 'double_break').mean() * 100
    none = (results_df['day_type'] == 'no_break').mean() * 100
    broke_high_total = results_df['broke_high'].mean() * 100
    broke_low_total = results_df['broke_low'].mean() * 100
    
    print(f"Single Break High only: {single_high:.1f}%  (n={(results_df['day_type'] == 'single_break_high').sum()})")
    print(f"Single Break Low only:  {single_low:.1f}%  (n={(results_df['day_type'] == 'single_break_low').sum()})")
    print(f"Double Break:           {double:.1f}%  (n={(results_df['day_type'] == 'double_break').sum()})")
    print(f"No Break:               {none:.1f}%  (n={(results_df['day_type'] == 'no_break').sum()})")
    print(f"\nBroke High (total):     {broke_high_total:.1f}%")
    print(f"Broke Low (total):      {broke_low_total:.1f}%")
    
    print(f"\n--- BY REJECTION (which side printed first) ---")
    high_first_df = results_df[results_df['high_first'] == True]
    low_first_df = results_df[results_df['high_first'] == False]
    
    if len(high_first_df) > 0:
        hf_broke_high = high_first_df['broke_high'].mean() * 100
        hf_broke_low = high_first_df['broke_low'].mean() * 100
        print(f"When HIGH printed first ({len(high_first_df)} days):")
        print(f"  → Broke High: {hf_broke_high:.1f}%  Broke Low: {hf_broke_low:.1f}%")
    
    if len(low_first_df) > 0:
        lf_broke_high = low_first_df['broke_high'].mean() * 100
        lf_broke_low = low_first_df['broke_low'].mean() * 100
        print(f"When LOW printed first ({len(low_first_df)} days):")
        print(f"  → Broke High: {lf_broke_high:.1f}%  Broke Low: {lf_broke_low:.1f}%")
    
    print(f"\n--- EXTENSION LEVELS ---")
    print(f"Avg extension above IB high: {results_df[results_df['broke_high']]['ext_high'].mean():.2f}x IB range")
    print(f"Avg extension below IB low:  {results_df[results_df['broke_low']]['ext_low'].mean():.2f}x IB range")
    
    print(f"\n--- BY DAY OF WEEK ---")
    days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    for day in days_order:
        day_df = results_df[results_df['day_of_week'] == day]
        if len(day_df) == 0:
            continue
        bh = day_df['broke_high'].mean() * 100
        bl = day_df['broke_low'].mean() * 100
        db = (day_df['day_type'] == 'double_break').mean() * 100
        print(f"{day:<12} High: {bh:.1f}%  Low: {bl:.1f}%  Double: {db:.1f}%  (n={len(day_df)})")
    
    print(f"\n--- IB RANGE SIZE (points) ---")
    print(f"Average IB range: {results_df['ib_range'].mean():.2f} points")
    print(f"Median IB range:  {results_df['ib_range'].median():.2f} points")
    
    return results_df

if __name__ == "__main__":
    es_stats = calculate_ib_stats("ES")
    nq_stats = calculate_ib_stats("NQ")