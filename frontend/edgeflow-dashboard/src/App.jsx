import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import Backtest from "./Backtest";
import TradeExplorer from "./TradeExplorer";
import DailyReport from "./DailyReport";

const COLORS = {
  bg: "#080b0f", bg2: "#0d1117", bg3: "#111820",
  border: "#1e2d3d", accent: "#00d4ff", accent2: "#00ff9d",
  accent3: "#ff6b35", accent4: "#a855f7", text: "#e2e8f0", dim: "#64748b",
};

const StatCard = ({ label, value, sub, color }) => (
  <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 120 }}>
    <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, letterSpacing: 2, marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 800, color: color || COLORS.accent, letterSpacing: -1 }}>{value}</div>
    {sub && <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, marginTop: 4 }}>{sub}</div>}
  </div>
);

const SectionHeader = ({ title, sub }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 3, marginBottom: 4 }}>{sub}</div>
    <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text }}>{title}</div>
  </div>
);

const ProbBar = ({ label, value, color, n }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ fontFamily: "monospace", fontSize: 12, color: COLORS.dim }}>{label}</span>
      <span style={{ fontFamily: "monospace", fontSize: 12, color: color || COLORS.text }}>
        {value?.toFixed(1)}% <span style={{ color: COLORS.dim }}>(n={n})</span>
      </span>
    </div>
    <div style={{ height: 6, background: COLORS.bg3, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${value}%`, background: color || COLORS.accent, borderRadius: 3, transition: "width 0.8s ease" }} />
    </div>
  </div>
);

const AlgoStatusPanel = ({ algoStatus, signals }) => {
  if (!algoStatus) return null;
  const armed = algoStatus.armed;
  return (
    <div style={{ background: COLORS.bg2, border: `1px solid ${armed ? 'rgba(0,255,157,0.3)' : 'rgba(255,107,53,0.3)'}`, borderRadius: 12, padding: 24, marginBottom: 28, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: armed ? COLORS.accent2 : COLORS.accent3 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 3, marginBottom: 6 }}>ALGO ENGINE STATUS</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: armed ? COLORS.accent2 : COLORS.accent3, boxShadow: `0 0 8px ${armed ? COLORS.accent2 : COLORS.accent3}` }} />
            <span style={{ fontSize: 22, fontWeight: 800, color: armed ? COLORS.accent2 : COLORS.accent3 }}>
              {armed ? "ARMED — READY TO TRADE" : "DISARMED"}
            </span>
          </div>
          {!armed && algoStatus.disarm_reason && (
            <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent3, marginTop: 6 }}>Reason: {algoStatus.disarm_reason}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "DAILY P&L", value: `$${algoStatus.daily_pnl?.toFixed(2)}`, color: algoStatus.daily_pnl >= 0 ? COLORS.accent2 : COLORS.accent3 },
            { label: "TRADES TODAY", value: algoStatus.trades_taken, color: COLORS.text },
            { label: "CONSEC LOSSES", value: algoStatus.consecutive_losses, color: algoStatus.consecutive_losses > 1 ? COLORS.accent3 : COLORS.text },
            { label: "PROFIT TARGET", value: `$${algoStatus.config?.daily_profit_target}`, color: COLORS.dim },
            { label: "LOSS LIMIT", value: `$${algoStatus.config?.daily_loss_limit}`, color: COLORS.dim },
          ].map(item => (
            <div key={item.label} style={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px", textAlign: "center" }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, marginBottom: 6 }}>PROFIT PROGRESS — ${algoStatus.daily_pnl?.toFixed(2)} / ${algoStatus.config?.daily_profit_target}</div>
          <div style={{ height: 8, background: COLORS.bg3, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, (algoStatus.daily_pnl / algoStatus.config?.daily_profit_target) * 100))}%`, background: COLORS.accent2, borderRadius: 4 }} />
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, marginBottom: 6 }}>LOSS EXPOSURE — ${Math.abs(Math.min(0, algoStatus.daily_pnl))?.toFixed(2)} / ${algoStatus.config?.daily_loss_limit}</div>
          <div style={{ height: 8, background: COLORS.bg3, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, (Math.abs(Math.min(0, algoStatus.daily_pnl)) / algoStatus.config?.daily_loss_limit) * 100))}%`, background: COLORS.accent3, borderRadius: 4 }} />
          </div>
        </div>
      </div>
      {signals && signals.length > 0 && (
        <div style={{ marginTop: 20, borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.accent, letterSpacing: 3, marginBottom: 12 }}>🎯 LIVE SIGNALS</div>
          {signals.map((s, i) => (
            <div key={i} style={{ background: COLORS.bg3, border: `1px solid ${s.direction === 'LONG' ? 'rgba(0,255,157,0.3)' : 'rgba(255,107,53,0.3)'}`, borderRadius: 8, padding: "12px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent4 }}>{s.strategy}</span>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, margin: "0 8px" }}>·</span>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.text }}>{s.ticker}</span>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, margin: "0 8px" }}>·</span>
                <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: s.direction === 'LONG' ? COLORS.accent2 : COLORS.accent3 }}>{s.direction}</span>
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>Entry: <span style={{ color: COLORS.text }}>{s.entry}</span></span>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>Stop: <span style={{ color: COLORS.accent3 }}>{s.stop}</span></span>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>Target: <span style={{ color: COLORS.accent2 }}>{s.target}</span></span>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>Confluence: <span style={{ color: COLORS.accent }}>{s.confluence_score}/5</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TradeLog = ({ trades }) => {
  if (!trades || trades.length === 0) return (
    <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, marginBottom: 28 }}>
      <SectionHeader title="Trade Log" sub="PAPER TRADING" />
      <div style={{ fontFamily: "monospace", fontSize: 12, color: COLORS.dim, textAlign: "center", padding: 24 }}>No trades yet — algo will log trades here during market hours</div>
    </div>
  );

  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const winners = trades.filter(t => t.pnl > 0).length;
  const losers = trades.filter(t => t.pnl < 0).length;
  const winRate = trades.length > 0 ? (winners / trades.length * 100).toFixed(1) : 0;

  return (
    <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <SectionHeader title="Trade Log" sub="PAPER TRADING" />
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "TOTAL P&L", value: `$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? COLORS.accent2 : COLORS.accent3 },
            { label: "WIN RATE", value: `${winRate}%`, color: COLORS.accent },
            { label: "TRADES", value: trades.length, color: COLORS.text },
            { label: "WINNERS", value: winners, color: COLORS.accent2 },
            { label: "LOSERS", value: losers, color: COLORS.accent3 },
          ].map(item => (
            <div key={item.label} style={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: COLORS.dim, marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              {["TIME", "TICKER", "STRATEGY", "DIRECTION", "ENTRY", "STOP", "TARGET", "CONTRACTS", "RISK", "REWARD", "R/R", "CONFLUENCE", "STATUS", "P&L"].map(h => (
                <th key={h} style={{ padding: "8px 12px", color: COLORS.dim, fontWeight: 600, letterSpacing: 1, fontSize: 10, textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                <td style={{ padding: "10px 12px", color: COLORS.dim }}>{t.timestamp?.split(' ')[1]}</td>
                <td style={{ padding: "10px 12px", color: COLORS.accent, fontWeight: 700 }}>{t.ticker}</td>
                <td style={{ padding: "10px 12px", color: COLORS.accent4 }}>{t.strategy}</td>
                <td style={{ padding: "10px 12px", color: t.direction === 'LONG' ? COLORS.accent2 : COLORS.accent3, fontWeight: 700 }}>{t.direction}</td>
                <td style={{ padding: "10px 12px", color: COLORS.text }}>{t.entry}</td>
                <td style={{ padding: "10px 12px", color: COLORS.accent3 }}>{t.stop}</td>
                <td style={{ padding: "10px 12px", color: COLORS.accent2 }}>{t.target}</td>
                <td style={{ padding: "10px 12px", color: COLORS.text }}>{t.contracts}</td>
                <td style={{ padding: "10px 12px", color: COLORS.accent3 }}>${t.risk_dollars}</td>
                <td style={{ padding: "10px 12px", color: COLORS.accent2 }}>${t.reward_dollars}</td>
                <td style={{ padding: "10px 12px", color: COLORS.accent }}>{t.rr_ratio}R</td>
                <td style={{ padding: "10px 12px", color: COLORS.accent }}>{t.confluence_score}/5</td>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{ background: t.paper ? 'rgba(168,85,247,0.15)' : 'rgba(0,255,157,0.15)', color: t.paper ? COLORS.accent4 : COLORS.accent2, padding: "2px 8px", borderRadius: 4, fontSize: 10 }}>
                    {t.paper ? "PAPER" : "LIVE"}
                  </span>
                </td>
                <td style={{ padding: "10px 12px", color: (t.pnl ?? 0) > 0 ? COLORS.accent2 : t.pnl < 0 ? COLORS.accent3 : COLORS.dim, fontWeight: 700 }}>
                  {t.pnl == null ? "open" : `$${t.pnl.toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [ticker, setTicker] = useState("ES");
  const [activeTab, setActiveTab] = useState("orb");
  const [stats, setStats] = useState(null);
  const [algoStatus, setAlgoStatus] = useState(null);
  const [signals, setSignals] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  useEffect(() => {
    setLoading(true);
    fetch(`http://127.0.0.1:8000/stats/all/${ticker}`)
      .then(r => r.json())
      .then(data => { setStats(data); setLoading(false); })
      .catch(err => { console.error(err); setLoading(false); });
  }, [ticker]);

  useEffect(() => {
    const fetchLiveData = () => {
      fetch("http://127.0.0.1:8000/algo/status")
        .then(r => r.json()).then(setAlgoStatus).catch(console.error);
      fetch("http://127.0.0.1:8000/algo/scan")
        .then(r => r.json()).then(d => setSignals(d.signals || [])).catch(console.error);
      fetch("http://127.0.0.1:8000/trades/log")
        .then(r => r.json()).then(d => setTrades(d.trades || [])).catch(console.error);
    };
    fetchLiveData();
    const interval = setInterval(fetchLiveData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (page === "daily") {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100vh" }}>
        <div style={{ padding: "12px 24px", background: COLORS.bg2, borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => setPage("dashboard")} style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent, background: "none", border: "none", cursor: "pointer" }}>
            ← Back to Dashboard
          </button>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>EDGEFLOW · Daily Report</span>
        </div>
        <DailyReport />
      </div>
    );
  }
  if (page === "explorer") {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100vh" }}>
        <div style={{ padding: "12px 24px", background: COLORS.bg2, borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => setPage("dashboard")} style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent, background: "none", border: "none", cursor: "pointer" }}>
            ← Back to Dashboard
          </button>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>EDGEFLOW · Trade Explorer</span>
        </div>
        <TradeExplorer />
      </div>
    );
  }
  if (page === "backtest") {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100vh" }}>
        <div style={{ padding: "12px 24px", background: COLORS.bg2, borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => setPage("dashboard")} style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent, background: "none", border: "none", cursor: "pointer" }}>
            ← Back to Dashboard
          </button>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>EDGEFLOW · Backtest Results</span>
        </div>
        <Backtest />
      </div>
    );
  }

  const data = stats?.[activeTab];

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.text, fontFamily: "sans-serif", padding: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent, letterSpacing: 4, marginBottom: 6 }}>EDGEFLOW PLATFORM</div>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>Trading <span style={{ color: COLORS.accent }}>Statistics</span></div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, marginTop: 4 }}>{today}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
         <button onClick={() => setPage("daily")} style={{
            padding: "10px 20px", borderRadius: 8, border: `1px solid ${COLORS.accent3}`,
            background: "rgba(255,107,53,0.1)", color: COLORS.accent3,
            fontFamily: "monospace", fontSize: 12, cursor: "pointer", fontWeight: 700,
          }}>📋 Daily Report</button>
         <button onClick={() => setPage("explorer")} style={{
            padding: "10px 20px", borderRadius: 8, border: `1px solid ${COLORS.accent2}`,
            background: "rgba(0,255,157,0.1)", color: COLORS.accent2,
            fontFamily: "monospace", fontSize: 12, cursor: "pointer", fontWeight: 700,
          }}>🔍 Trade Explorer</button>
          <button onClick={() => setPage("backtest")} style={{
            padding: "10px 20px", borderRadius: 8, border: `1px solid ${COLORS.accent4}`,
            background: "rgba(168,85,247,0.1)", color: COLORS.accent4,
            fontFamily: "monospace", fontSize: 12, cursor: "pointer", fontWeight: 700,
          }}>📊 Backtest Results</button>
          {["ES", "NQ"].map(t => (
            <button key={t} onClick={() => setTicker(t)} style={{
              padding: "10px 24px", borderRadius: 8, border: `1px solid ${ticker === t ? COLORS.accent : COLORS.border}`,
              background: ticker === t ? "rgba(0,212,255,0.1)" : COLORS.bg2,
              color: ticker === t ? COLORS.accent : COLORS.dim,
              fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Algo Status */}
      <AlgoStatusPanel algoStatus={algoStatus} signals={signals} />

      {/* Trade Log */}
      <TradeLog trades={trades} />

      {/* Strategy Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${COLORS.border}` }}>
        {[{ id: "orb", label: "ORB — Opening Range Breakout" }, { id: "ib", label: "IB — Initial Balance" }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "10px 20px", background: "none", border: "none",
            borderBottom: `2px solid ${activeTab === tab.id ? COLORS.accent : "transparent"}`,
            color: activeTab === tab.id ? COLORS.accent : COLORS.dim,
            fontFamily: "monospace", fontSize: 12, cursor: "pointer", letterSpacing: 1,
          }}>{tab.label}</button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 80, fontFamily: "monospace", color: COLORS.dim }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⟳</div>
          Calculating stats from database...
        </div>
      )}

      {!loading && activeTab === "orb" && data && (
        <div>
          <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
            <StatCard label="BROKE HIGH" value={`${data.brokeHigh}%`} color={COLORS.accent2} sub={`n=${Math.round(data.totalDays * data.brokeHigh / 100)}`} />
            <StatCard label="BROKE LOW" value={`${data.brokeLow}%`} color={COLORS.accent3} sub={`n=${Math.round(data.totalDays * data.brokeLow / 100)}`} />
            <StatCard label="DOUBLE BREAK" value={`${data.doubleBreak}%`} color={COLORS.accent4} sub={`n=${Math.round(data.totalDays * data.doubleBreak / 100)}`} />
            <StatCard label="NO BREAK" value={`${data.noBreak}%`} color={COLORS.dim} sub="rare" />
            <StatCard label="EXT ABOVE" value={`${data.extHigh}x`} color={COLORS.accent} sub="avg ORB multiples" />
            <StatCard label="EXT BELOW" value={`${data.extLow}x`} color={COLORS.accent} sub="avg ORB multiples" />
            <StatCard label="AVG RANGE" value={`${data.avgRange}`} color={COLORS.text} sub="points" />
            <StatCard label="SAMPLE SIZE" value={data.totalDays} color={COLORS.accent2} sub={`${data.confidence} confidence ✅`} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
            <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
              <SectionHeader title="Breakout by Day of Week" sub="WEEKLY PATTERN" />
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.byDay} barGap={2}>
                  <XAxis dataKey="day" tick={{ fill: COLORS.dim, fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: COLORS.dim, fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }} />
                  <Bar dataKey="high" name="Broke High" fill={COLORS.accent2} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="low" name="Broke Low" fill={COLORS.accent3} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
              <SectionHeader title="Breakout by Gap Direction" sub="GAP ANALYSIS" />
              {data.byGap?.map(g => (
                <div key={g.gap} style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, marginBottom: 6 }}>{g.gap} <span style={{ color: COLORS.accent }}>n={g.n}</span></div>
                  <ProbBar label="Broke High" value={g.high} color={COLORS.accent2} n={Math.round(g.n * g.high / 100)} />
                  <ProbBar label="Broke Low" value={g.low} color={COLORS.accent3} n={Math.round(g.n * g.low / 100)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === "ib" && data && (
        <div>
          <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
            <StatCard label="SINGLE BREAK HIGH" value={`${data.singleHigh}%`} color={COLORS.accent2} sub={`n=${Math.round(data.totalDays * data.singleHigh / 100)}`} />
            <StatCard label="SINGLE BREAK LOW" value={`${data.singleLow}%`} color={COLORS.accent3} sub={`n=${Math.round(data.totalDays * data.singleLow / 100)}`} />
            <StatCard label="DOUBLE BREAK" value={`${data.doubleBreak}%`} color={COLORS.accent4} sub={`n=${Math.round(data.totalDays * data.doubleBreak / 100)}`} />
            <StatCard label="NO BREAK" value={`${data.noBreak}%`} color={COLORS.dim} sub={`n=${Math.round(data.totalDays * data.noBreak / 100)}`} />
            <StatCard label="EXT ABOVE" value={`${data.extHigh}x`} color={COLORS.accent} sub="IB range multiples" />
            <StatCard label="EXT BELOW" value={`${data.extLow}x`} color={COLORS.accent} sub="IB range multiples" />
            <StatCard label="AVG IB RANGE" value={`${data.avgRange}`} color={COLORS.text} sub="points" />
            <StatCard label="SAMPLE SIZE" value={data.totalDays} color={COLORS.accent2} sub={`${data.confidence} confidence ✅`} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
            <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
              <SectionHeader title="By Rejection — Which Side Printed First" sub="KEY EDGE" />
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent3, marginBottom: 10, letterSpacing: 1 }}>HIGH PRINTED FIRST</div>
                <ProbBar label="→ Broke High" value={data.highFirstBrokeHigh} color={COLORS.accent2} n={Math.round(data.totalDays * 0.46 * data.highFirstBrokeHigh / 100)} />
                <ProbBar label="→ Broke Low" value={data.highFirstBrokeLow} color={COLORS.accent3} n={Math.round(data.totalDays * 0.46 * data.highFirstBrokeLow / 100)} />
              </div>
              <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent2, marginBottom: 10, letterSpacing: 1 }}>LOW PRINTED FIRST</div>
                <ProbBar label="→ Broke High" value={data.lowFirstBrokeHigh} color={COLORS.accent2} n={Math.round(data.totalDays * 0.54 * data.lowFirstBrokeHigh / 100)} />
                <ProbBar label="→ Broke Low" value={data.lowFirstBrokeLow} color={COLORS.accent3} n={Math.round(data.totalDays * 0.54 * data.lowFirstBrokeLow / 100)} />
              </div>
            </div>
            <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
              <SectionHeader title="IB Break by Day of Week" sub="WEEKLY PATTERN" />
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.byDay} barGap={2}>
                  <XAxis dataKey="day" tick={{ fill: COLORS.dim, fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: COLORS.dim, fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }} />
                  <Bar dataKey="high" name="Broke High" fill={COLORS.accent2} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="low" name="Broke Low" fill={COLORS.accent3} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="double" name="Double Break" fill={COLORS.accent4} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim }}>
          EDGEFLOW — Live data from Databento CME Globex · {stats?.[activeTab]?.confidence} confidence · n={stats?.[activeTab]?.totalDays}
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.accent }}>ES + NQ · ORB + IB · v1.0</span>
      </div>
    </div>
  );
}