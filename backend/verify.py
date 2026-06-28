import sqlite3

DB_PATH = "../data/edgeflow.db"
conn = sqlite3.connect(DB_PATH)

print("=" * 55)
print("EDGEFLOW — Database Verification")
print("=" * 55)

# Tables
tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print(f"\n✅ Tables: {tables}")

# Row counts
print(f"\n--- DATA COUNTS ---")
print(f"ES minute bars:      {conn.execute('SELECT COUNT(*) FROM minute_bars WHERE ticker=\"ES\"').fetchone()[0]:>8,}")
print(f"NQ minute bars:      {conn.execute('SELECT COUNT(*) FROM minute_bars WHERE ticker=\"NQ\"').fetchone()[0]:>8,}")
print(f"ES daily bars:       {conn.execute('SELECT COUNT(*) FROM daily_bars WHERE ticker=\"ES\"').fetchone()[0]:>8,}")
print(f"NQ daily bars:       {conn.execute('SELECT COUNT(*) FROM daily_bars WHERE ticker=\"NQ\"').fetchone()[0]:>8,}")
print(f"ES key levels:       {conn.execute('SELECT COUNT(*) FROM key_levels WHERE ticker=\"ES\"').fetchone()[0]:>8,}")
print(f"NQ key levels:       {conn.execute('SELECT COUNT(*) FROM key_levels WHERE ticker=\"NQ\"').fetchone()[0]:>8,}")
print(f"Backtest ES trades:  {conn.execute('SELECT COUNT(*) FROM backtest_results WHERE ticker=\"ES\"').fetchone()[0]:>8,}")
print(f"Backtest NQ trades:  {conn.execute('SELECT COUNT(*) FROM backtest_results WHERE ticker=\"NQ\"').fetchone()[0]:>8,}")

# Date ranges
es_range = conn.execute('SELECT MIN(date), MAX(date) FROM daily_bars WHERE ticker="ES"').fetchone()
nq_range = conn.execute('SELECT MIN(date), MAX(date) FROM daily_bars WHERE ticker="NQ"').fetchone()
print(f"\n--- DATE RANGES ---")
print(f"ES daily:  {es_range[0]} → {es_range[1]}")
print(f"NQ daily:  {nq_range[0]} → {nq_range[1]}")

es_min = conn.execute('SELECT MIN(datetime), MAX(datetime) FROM minute_bars WHERE ticker="ES"').fetchone()
print(f"ES minute: {es_min[0][:10]} → {es_min[1][:10]}")

# Backtest summary
print(f"\n--- BACKTEST SUMMARY ---")
for ticker in ["ES", "NQ"]:
    rows = conn.execute(f'SELECT COUNT(*), SUM(pnl), AVG(CASE WHEN result="win" THEN 1.0 ELSE 0.0 END) FROM backtest_results WHERE ticker="{ticker}"').fetchone()
    print(f"ORB {ticker}: {rows[0]} trades | Total P&L: ${rows[1]:,.2f} | Win Rate: {rows[2]*100:.1f}%")

# Check for gaps in data
print(f"\n--- DATA QUALITY ---")
es_dates = conn.execute('SELECT COUNT(DISTINCT date) FROM daily_bars WHERE ticker="ES"').fetchone()[0]
nq_dates = conn.execute('SELECT COUNT(DISTINCT date) FROM daily_bars WHERE ticker="NQ"').fetchone()[0]
print(f"ES unique trading days: {es_dates}")
print(f"NQ unique trading days: {nq_dates}")

# Sample recent backtest trades
print(f"\n--- LAST 5 BACKTEST TRADES (ES) ---")
rows = conn.execute('SELECT date, direction, entry, stop, target1, pnl, result FROM backtest_results WHERE ticker="ES" ORDER BY date DESC LIMIT 5').fetchall()
print(f"{'Date':<12} {'Dir':<6} {'Entry':>8} {'Stop':>8} {'Target':>8} {'P&L':>8} {'Result'}")
print("-" * 60)
for r in rows:
    print(f"{r[0]:<12} {r[1]:<6} {r[2]:>8.2f} {r[3]:>8.2f} {r[4]:>8.2f} ${r[5]:>7.2f} {r[6]}")

# Monthly P&L verification
print(f"\n--- MONTHLY P&L VERIFICATION (ES) ---")
rows = conn.execute('''
    SELECT strftime('%Y-%m', date) as month, SUM(pnl) as total, COUNT(*) as trades,
    SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins
    FROM backtest_results WHERE ticker="ES"
    GROUP BY month ORDER BY month
''').fetchall()
for r in rows:
    bar = "✅" if r[1] > 0 else "❌"
    print(f"{r[0]}  ${r[1]:>8,.2f}  {bar}  trades:{r[2]}  wins:{r[3]}")

conn.close()
print(f"\n✅ Verification complete")