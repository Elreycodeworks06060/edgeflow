import os
import sqlite3
import databento as db
import pandas as pd
from dotenv import load_dotenv
from datetime import datetime, timedelta

# Load API key from .env file
load_dotenv()
API_KEY = os.getenv("DATABENTO_API_KEY")

# Database path
DB_PATH = "../data/edgeflow.db"

def get_client():
    return db.Historical(API_KEY)

def init_database():
    """Create the database and tables if they don't exist"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Daily bars table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS daily_bars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            date TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            volume INTEGER,
            UNIQUE(ticker, date)
        )
    ''')
    
    # Minute bars table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS minute_bars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            datetime TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            volume INTEGER,
            UNIQUE(ticker, datetime)
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ Database initialized")

def fetch_and_store_daily(ticker, start, end):
    """Fetch daily bars for a ticker and store in database"""
    client = get_client()
    print(f"Fetching daily bars for {ticker} from {start} to {end}...")
    
    data = client.timeseries.get_range(
        dataset="GLBX.MDP3",
        schema="ohlcv-1d",
        symbols=[f"{ticker}.c.0"],
        start=start,
        end=end,
        stype_in="continuous",
    )
    
    df = data.to_df()
    
    if len(df) == 0:
        print(f"⚠️ No data returned for {ticker}")
        return
    
    # Clean up the dataframe
    df = df.reset_index()
    df['date'] = df['ts_event'].dt.strftime('%Y-%m-%d')
    df['ticker'] = ticker
    
    # Store in database
    conn = sqlite3.connect(DB_PATH)
    stored = 0
    for _, row in df.iterrows():
        try:
            conn.execute('''
                INSERT OR IGNORE INTO daily_bars (ticker, date, open, high, low, close, volume)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (ticker, row['date'], row['open'], row['high'], row['low'], row['close'], row['volume']))
            stored += 1
        except Exception as e:
            pass
    conn.commit()
    conn.close()
    print(f"✅ {ticker} daily bars stored: {stored} days")

def fetch_and_store_minutes(ticker, start, end):
    """Fetch minute bars for a ticker and store in database"""
    client = get_client()
    print(f"Fetching minute bars for {ticker} from {start} to {end}...")
    
    data = client.timeseries.get_range(
        dataset="GLBX.MDP3",
        schema="ohlcv-1m",
        symbols=[f"{ticker}.c.0"],
        start=start,
        end=end,
        stype_in="continuous",
    )
    
    df = data.to_df()
    
    if len(df) == 0:
        print(f"⚠️ No data returned for {ticker}")
        return
    
    df = df.reset_index()
    df['datetime'] = df['ts_event'].dt.strftime('%Y-%m-%d %H:%M:%S')
    df['ticker'] = ticker
    
    conn = sqlite3.connect(DB_PATH)
    stored = 0
    for _, row in df.iterrows():
        try:
            conn.execute('''
                INSERT OR IGNORE INTO minute_bars (ticker, datetime, open, high, low, close, volume)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (ticker, row['datetime'], row['open'], row['high'], row['low'], row['close'], row['volume']))
            stored += 1
        except Exception as e:
            pass
    conn.commit()
    conn.close()
    print(f"✅ {ticker} minute bars stored: {stored} rows")

def build_database():
    """Pull 2 years of ES and NQ data and store it all"""
    print("=" * 50)
    print("EDGEFLOW — Building Data Foundation")
    print("=" * 50)
    
    init_database()
    
    # 2 years back from today
    end = datetime.today().strftime('%Y-%m-%d')
    start = (datetime.today() - timedelta(days=730)).strftime('%Y-%m-%d')
    
    print(f"\nDate range: {start} to {end}")
    print("Tickers: ES, NQ\n")
    
    # Daily bars — both tickers
    fetch_and_store_daily("ES", start, end)
    fetch_and_store_daily("NQ", start, end)
    
    # Minute bars — last 6 months only (keeps cost down)
    minute_start = (datetime.today() - timedelta(days=730)).strftime('%Y-%m-%d')
    print(f"\nFetching minute bars from {minute_start} to {end}")
    fetch_and_store_minutes("ES", minute_start, end)
    fetch_and_store_minutes("NQ", minute_start, end)
    
    print("\n" + "=" * 50)
    print("✅ Database build complete!")
    print(f"Location: {DB_PATH}")
    print("=" * 50)

if __name__ == "__main__":
    build_database()