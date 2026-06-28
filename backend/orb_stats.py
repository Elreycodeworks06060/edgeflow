import sqlite3
import pandas as pd
from datetime import time

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

def calculate_orb_stats(ticker):
    """Calculate Opening Range Breakout statistics"""
    print(f"\nCalculating ORB stats for {ticker}...")
    
    df = get_minute_data(ticker)
    
    # Filter to regular trading hours 9:30 AM - 4:00 PM ET
    df = df.between_time('09:30', '16:00')
    
    # Get unique trading days
    trading_days = df.index.normalize().unique()
    
    results = []
    
    for day in trading_days:
        day_data = df[df.index.normalize() == day]
        
        # Get the opening range — first 15 minutes (9:30 to 9:44)
        orb_data = day_data.between_time('09:30', '09:44')
        
        if len(orb_data) < 5:  # Skip days with insufficient data
            continue
            
        orb_high = orb_data['high'].max()
        orb_low = orb_data['low'].min()
        orb_range = orb_high - orb_low
        
        if orb_range == 0:
            continue
        
        # Get rest of day data (after 9:45)
        rest_of_day = day_data.between_time('09:45', '16:00')
        
        if len(rest_of_day) == 0:
            continue
        
        # Did price break above ORB high?
        broke_high = rest_of_day['high'].max() > orb_high
        # Did price break below ORB low?
        broke_low = rest_of_day['low'].min() < orb_low
        
        # Classify the day
        if broke_high and broke_low:
            day_type = 'double_break'
        elif broke_high:
            day_type = 'broke_high'
        elif broke_low:
            day_type = 'broke_low'
        else:
            day_type = 'no_break'
        
        # How far did it extend beyond the ORB?
        if broke_high:
            extension_high = (rest_of_day['high'].max() - orb_high) / orb_range
        else:
            extension_high = 0
            
        if broke_low:
            extension_low = (orb_low - rest_of_day['low'].min()) / orb_range
        else:
            extension_low = 0

        results.append({
            'date': day,
            'day_of_week': day.day_name(),
            'orb_high': orb_high,
            'orb_low': orb_low,
            'orb_range': orb_range,
            'broke_high': broke_high,
            'broke_low': broke_low,
            'day_type': day_type,
            'extension_high': extension_high,
            'extension_low': extension_low,
        })
    
    results_df = pd.DataFrame(results)
    total_days = len(results_df)
    
    if total_days == 0:
        print("No data found")
        return
    
    print(f"\n{'='*50}")
    print(f"ORB STATISTICS — {ticker}")
    print(f"{'='*50}")
    print(f"Total trading days analyzed: {total_days}")
    print(f"Sample size confidence: {'HIGH' if total_days > 100 else 'MEDIUM' if total_days > 50 else 'LOW'}")
    
    print(f"\n--- BREAKOUT PROBABILITIES ---")
    broke_high_pct = results_df['broke_high'].mean() * 100
    broke_low_pct = results_df['broke_low'].mean() * 100
    double_break_pct = (results_df['day_type'] == 'double_break').mean() * 100
    no_break_pct = (results_df['day_type'] == 'no_break').mean() * 100
    
    print(f"Broke ORB High:     {broke_high_pct:.1f}%  (n={results_df['broke_high'].sum()})")
    print(f"Broke ORB Low:      {broke_low_pct:.1f}%  (n={results_df['broke_low'].sum()})")
    print(f"Double Break:       {double_break_pct:.1f}%  (n={(results_df['day_type'] == 'double_break').sum()})")
    print(f"No Break:           {no_break_pct:.1f}%  (n={(results_df['day_type'] == 'no_break').sum()})")
    
    print(f"\n--- AVERAGE EXTENSIONS (in ORB multiples) ---")
    print(f"Avg extension above ORB high: {results_df[results_df['broke_high']]['extension_high'].mean():.2f}x")
    print(f"Avg extension below ORB low:  {results_df[results_df['broke_low']]['extension_low'].mean():.2f}x")
    
    print(f"\n--- BREAKOUT BY DAY OF WEEK ---")
    days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    for day in days_order:
        day_df = results_df[results_df['day_of_week'] == day]
        if len(day_df) == 0:
            continue
        high_pct = day_df['broke_high'].mean() * 100
        low_pct = day_df['broke_low'].mean() * 100
        print(f"{day:<12} Broke High: {high_pct:.1f}%  Broke Low: {low_pct:.1f}%  (n={len(day_df)})")
    
    print(f"\n--- ORB RANGE SIZE (points) ---")
    print(f"Average ORB range: {results_df['orb_range'].mean():.2f} points")
    print(f"Median ORB range:  {results_df['orb_range'].median():.2f} points")
    print(f"Small range (<10): {(results_df['orb_range'] < 10).sum()} days")
    print(f"Medium range (10-25): {((results_df['orb_range'] >= 10) & (results_df['orb_range'] < 25)).sum()} days")
    print(f"Large range (>25): {(results_df['orb_range'] > 25).sum()} days")
    
    return results_df

if __name__ == "__main__":
    es_stats = calculate_orb_stats("ES")
    nq_stats = calculate_orb_stats("NQ")