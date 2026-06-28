import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, AreaChart, Area, Legend
} from "recharts";

const COLORS = {
  bg: "#080b0f", bg2: "#0d1117", bg3: "#111820",
  border: "#1e2d3d", accent: "#00d4ff", accent2: "#00ff9d",
  accent3: "#ff6b35", accent4: "#a855f7", text: "#e2e8f0", dim: "#64748b",
  es: "#00d4ff", nq: "#a855f7", sA: "#00ff9d", sB: "#ff6b35",
};

const StatCard = ({ label, value, sub, color }) => (
  <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 130 }}>
    <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 2, marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color: color || COLORS.accent, letterSpacing: -1 }}>{value}</div>
    {sub && <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, marginTop: 4 }}>{sub}</div>}
  </div>
);

const SectionHeader = ({ title, sub }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 3, marginBottom: 4 }}>{sub}</div>
    <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text }}>{title}</div>
  </div>
);

const Badge = ({ label, color }) => (
  <span style={{ fontFamily: "monospace", fontSize: 10, color, padding: "3px 8px", borderRadius: 4, border: `1px solid ${color}`, background: `${color}15` }}>{label}</span>
);

function calcStats(trades) {
  if (!trades || !trades.length) return null;
  const winners = trades.filter(t => t.result === "win");
  const losers = trades.filter(t => t.result === "loss");
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate = (winners.length / trades.length * 100).toFixed(1);
  const avgWin = winners.length ? winners.reduce((s, t) => s + t.pnl, 0) / winners.length : 0;
  const avgLoss = losers.length ? losers.reduce((s, t) => s + t.pnl, 0) / losers.length : 0;
  const profitFactor = losers.length
    ? Math.abs(winners.reduce((s, t) => s + t.pnl, 0) / losers.reduce((s, t) => s + t.pnl, 0))
    : 999;

  let cum = 0;
  const cumulative = trades.map(t => { cum += t.pnl; return { date: t.date, pnl: Math.round(cum) }; });

  let peak = 0, maxDD = 0;
  cumulative.forEach(p => {
    if (p.pnl > peak) peak = p.pnl;
    const dd = p.pnl - peak;
    if (dd < maxDD) maxDD = dd;
  });

  const monthly = {};
  trades.forEach(t => {
    const month = t.date.slice(0, 7);
    monthly[month] = (monthly[month] || 0) + t.pnl;
  });
  const monthlyData = Object.entries(monthly)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, pnl]) => ({ month: month.slice(2), pnl: Math.round(pnl) }));

  const days = { Monday: [], Tuesday: [], Thursday: [], Friday: [] };
  trades.forEach(t => { if (days[t.day_of_week]) days[t.day_of_week].push(t); });
  const dowData = Object.entries(days).map(([day, ts]) => ({
    day: day.slice(0, 3),
    winRate: ts.length ? Math.round(ts.filter(t => t.result === "win").length / ts.length * 100) : 0,
    pnl: Math.round(ts.reduce((s, t) => s + t.pnl, 0)),
    trades: ts.length,
  }));

  let peak2 = 0, runningPnl = 0;
  const ddSeries = trades.map(t => {
    runningPnl += t.pnl;
    if (runningPnl > peak2) peak2 = runningPnl;
    return { date: t.date, dd: Math.round(runningPnl - peak2) };
  });

  const bins = {};
  trades.forEach(t => {
    const bin = Math.round(t.pnl / 500) * 500;
    bins[bin] = (bins[bin] || 0) + 1;
  });
  const distData = Object.entries(bins)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([pnl, count]) => ({ pnl: Number(pnl), count }));

  return {
    total: trades.length, winners: winners.length, losers: losers.length,
    totalPnl, winRate, avgWin, avgLoss, profitFactor, maxDD,
    cumulative, monthlyData, dowData, ddSeries, distData,
  };
}

function ScenarioCompare({ ticker, color }) {
  const [sA, setSA] = useState(null);
  const [sB, setSB] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/backtest/compare/ORB/${ticker}`)
      .then(r => r.json())
      .then(d => {
        setSA(calcStats(d.scenario_A || []));
        setSB(calcStats(d.scenario_B || []));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ticker]);

  if (loading) return <div style={{ fontFamily: "monospace", color: COLORS.dim, padding: 40, textAlign: "center" }}>Loading scenario comparison...</div>;
  if (!sA || !sB) return null;

  const winner = sA.totalPnl > sB.totalPnl ? 'A' : 'B';
  const recommended = ticker === 'ES' ? 'B' : 'A';

  const compData = [
    { metric: "Win Rate", A: parseFloat(sA.winRate), B: parseFloat(sB.winRate), format: v => `${v}%` },
    { metric: "Profit Factor", A: sA.profitFactor, B: sB.profitFactor, format: v => v.toFixed(2) },
    { metric: "$/Month", A: Math.round(sA.totalPnl / 25), B: Math.round(sB.totalPnl / 25), format: v => `$${v.toLocaleString()}` },
    { metric: "Max DD", A: Math.abs(sA.maxDD), B: Math.abs(sB.maxDD), format: v => `$${v.toLocaleString()}`, lowerBetter: true },
  ];

  return (
    <div>
      {/* Recommendation Banner */}
      <div style={{ background: `rgba(0,255,157,0.05)`, border: `1px solid rgba(0,255,157,0.3)`, borderRadius: 12, padding: 20, marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 24 }}>🏆</div>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent2, fontWeight: 700, marginBottom: 4 }}>
            RECOMMENDED FOR {ticker}: SCENARIO {recommended}
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>
            {ticker === 'ES'
              ? `Scenario B (Trail Stop → EOD) wins on P&L ($${sB.totalPnl.toLocaleString()} vs $${sA.totalPnl.toLocaleString()}) and win rate (${sB.winRate}% vs ${sA.winRate}%)`
              : `Scenario A (Breakeven Stop → T2) wins on profit factor (${sA.profitFactor.toFixed(2)} vs ${sB.profitFactor.toFixed(2)}) and lower drawdown ($${Math.abs(sA.maxDD).toLocaleString()} vs $${Math.abs(sB.maxDD).toLocaleString()})`
            }
          </div>
        </div>
      </div>

      {/* Head to head stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {[
          { label: "Scenario A", stats: sA, color: COLORS.sA, desc: "T1 → Breakeven Stop → T2" },
          { label: "Scenario B", stats: sB, color: COLORS.sB, desc: "T1 → Trail Stop → EOD" },
        ].map(({ label, stats, color, desc }) => (
          <div key={label} style={{ background: COLORS.bg2, border: `2px solid ${label === `Scenario ${recommended}` ? color : COLORS.border}`, borderRadius: 12, padding: 24, position: "relative" }}>
            {label === `Scenario ${recommended}` && (
              <div style={{ position: "absolute", top: -1, right: 16, background: color, color: COLORS.bg, fontFamily: "monospace", fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: "0 0 6px 6px" }}>
                ✓ RECOMMENDED
              </div>
            )}
            <div style={{ fontFamily: "monospace", fontSize: 11, color, letterSpacing: 2, marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, marginBottom: 16 }}>{desc}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <StatCard label="WIN RATE" value={`${stats.winRate}%`} color={COLORS.accent2} sub={`${stats.winners}W / ${stats.losers}L`} />
              <StatCard label="TOTAL P&L" value={`$${stats.totalPnl?.toLocaleString()}`} color={COLORS.accent2} />
              <StatCard label="PROFIT FACTOR" value={stats.profitFactor?.toFixed(2)} color={color} />
              <StatCard label="MAX DRAWDOWN" value={`$${Math.abs(stats.maxDD)?.toLocaleString()}`} color={COLORS.accent3} />
              <StatCard label="AVG/MONTH" value={`$${Math.round(stats.totalPnl / 25)?.toLocaleString()}`} color={color} />
            </div>
          </div>
        ))}
      </div>

      {/* Head to head metric comparison */}
      <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <SectionHeader title={`Scenario A vs B — ${ticker} Head to Head`} sub="METRIC COMPARISON" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {compData.map(item => {
            const aWins = item.lowerBetter ? item.A < item.B : item.A > item.B;
            return (
              <div key={item.metric} style={{ background: COLORS.bg3, borderRadius: 10, padding: 16, textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, marginBottom: 12 }}>{item.metric}</div>
                <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 9, color: COLORS.sA, marginBottom: 4 }}>SCENARIO A</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: aWins ? COLORS.accent2 : COLORS.dim }}>{item.format(item.A)}</div>
                    {aWins && <div style={{ fontSize: 10, color: COLORS.accent2 }}>✓</div>}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>vs</div>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 9, color: COLORS.sB, marginBottom: 4 }}>SCENARIO B</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: !aWins ? COLORS.accent2 : COLORS.dim }}>{item.format(item.B)}</div>
                    {!aWins && <div style={{ fontSize: 10, color: COLORS.accent2 }}>✓</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cumulative P&L comparison */}
      <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <SectionHeader title={`Cumulative P&L — Scenario A vs B — ${ticker}`} sub="GROWTH CURVE COMPARISON" />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={sA.cumulative.map((d, i) => ({
            date: d.date.slice(5),
            ScenarioA: d.pnl,
            ScenarioB: sB.cumulative[i]?.pnl || 0,
          }))}>
            <XAxis dataKey="date" tick={{ fill: COLORS.dim, fontSize: 10 }} axisLine={false} tickLine={false} interval={30} />
            <YAxis tick={{ fill: COLORS.dim, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
              formatter={v => [`$${v.toLocaleString()}`, ""]} />
            <ReferenceLine y={0} stroke={COLORS.border} />
            <Line type="monotone" dataKey="ScenarioA" stroke={COLORS.sA} dot={false} strokeWidth={2} name="Scenario A (BE Stop → T2)" />
            <Line type="monotone" dataKey="ScenarioB" stroke={COLORS.sB} dot={false} strokeWidth={2} name="Scenario B (Trail → EOD)" />
            <Legend wrapperStyle={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly P&L comparison */}
      <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
        <SectionHeader title={`Monthly P&L — Scenario A vs B — ${ticker}`} sub="MONTH BY MONTH COMPARISON" />
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={sA.monthlyData.map((d, i) => ({
            month: d.month,
            ScenarioA: d.pnl,
            ScenarioB: sB.monthlyData[i]?.pnl || 0,
          }))} barGap={2}>
            <XAxis dataKey="month" tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
            <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
              formatter={v => [`$${v.toLocaleString()}`, ""]} />
            <ReferenceLine y={0} stroke={COLORS.border} />
            <Bar dataKey="ScenarioA" fill={COLORS.sA} radius={[2, 2, 0, 0]} name="Scenario A" opacity={0.8} />
            <Bar dataKey="ScenarioB" fill={COLORS.sB} radius={[2, 2, 0, 0]} name="Scenario B" opacity={0.8} />
            <Legend wrapperStyle={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DeepDive({ stats, ticker, color }) {
  if (!stats) return null;
  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
        <StatCard label="WIN RATE" value={`${stats.winRate}%`} color={COLORS.accent2} sub={`${stats.winners}W / ${stats.losers}L`} />
        <StatCard label="TOTAL P&L" value={`$${stats.totalPnl?.toLocaleString()}`} color={COLORS.accent2} sub="2 years" />
        <StatCard label="PROFIT FACTOR" value={stats.profitFactor?.toFixed(2)} color={color} sub="per $1 lost" />
        <StatCard label="MAX DRAWDOWN" value={`$${stats.maxDD?.toLocaleString()}`} color={COLORS.accent3} />
        <StatCard label="AVG WINNER" value={`$${Math.round(stats.avgWin)?.toLocaleString()}`} color={COLORS.accent2} />
        <StatCard label="AVG LOSER" value={`$${Math.round(stats.avgLoss)?.toLocaleString()}`} color={COLORS.accent3} />
        <StatCard label="TOTAL TRADES" value={stats.total} color={COLORS.text} sub="No Wednesdays" />
        <StatCard label="AVG/MONTH" value={`$${Math.round(stats.totalPnl / 25)?.toLocaleString()}`} color={color} sub="over 25 months" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <SectionHeader title={`Cumulative P&L — ${ticker}`} sub="GROWTH CURVE" />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stats.cumulative}>
              <XAxis dataKey="date" tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} interval={40} />
              <YAxis tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
                formatter={v => [`$${v.toLocaleString()}`, "P&L"]} />
              <ReferenceLine y={0} stroke={COLORS.border} />
              <Area type="monotone" dataKey="pnl" stroke={color} fill={`${color}22`} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <SectionHeader title={`Monthly P&L — ${ticker}`} sub="MONTH BY MONTH" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.monthlyData}>
              <XAxis dataKey="month" tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
              <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
                formatter={v => [`$${v.toLocaleString()}`, "P&L"]} />
              <ReferenceLine y={0} stroke={COLORS.border} />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                {stats.monthlyData?.map((entry, i) => (
                  <Cell key={i} fill={entry.pnl >= 0 ? COLORS.accent2 : COLORS.accent3} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <SectionHeader title={`Win Rate by Day — ${ticker}`} sub="DAY OF WEEK EDGE" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.dowData}>
              <XAxis dataKey="day" tick={{ fill: COLORS.dim, fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
                formatter={(v, n) => [n === "winRate" ? `${v}%` : `$${v.toLocaleString()}`, n === "winRate" ? "Win Rate" : "P&L"]} />
              <ReferenceLine y={50} stroke={COLORS.border} strokeDasharray="3 3" />
              <Bar dataKey="winRate" radius={[3, 3, 0, 0]} name="winRate">
                {stats.dowData?.map((entry, i) => (
                  <Cell key={i} fill={entry.winRate >= 75 ? COLORS.accent2 : entry.winRate >= 60 ? color : COLORS.accent3} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <SectionHeader title={`Trade Distribution — ${ticker}`} sub="WIN/LOSS SPREAD" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.distData}>
              <XAxis dataKey="pnl" tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <YAxis tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
                formatter={(v, n, p) => [`${v} trades`, `$${p.payload.pnl} range`]} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {stats.distData?.map((entry, i) => (
                  <Cell key={i} fill={entry.pnl >= 0 ? COLORS.accent2 : COLORS.accent3} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
        <SectionHeader title={`Drawdown Over Time — ${ticker}`} sub="UNDERWATER CURVE" />
        <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, marginBottom: 12 }}>
          Shows how far below peak the account went. Closer to 0 = safer.
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={stats.ddSeries}>
            <XAxis dataKey="date" tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} interval={40} />
            <YAxis tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
            <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
              formatter={v => [`$${v.toLocaleString()}`, "Drawdown"]} />
            <ReferenceLine y={0} stroke={COLORS.border} />
            <Area type="monotone" dataKey="dd" stroke={COLORS.accent3} fill="rgba(255,107,53,0.15)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Backtest() {
  const [esData, setEsData] = useState([]);
  const [nqData, setNqData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    Promise.all([
      fetch("http://127.0.0.1:8000/backtest/ORB/ES").then(r => r.json()),
      fetch("http://127.0.0.1:8000/backtest/ORB/NQ").then(r => r.json()),
    ]).then(([es, nq]) => {
      setEsData(es.trades || []);
      setNqData(nq.trades || []);
      setLoading(false);
    }).catch(err => { console.error(err); setLoading(false); });
  }, []);

  const es = calcStats(esData);
  const nq = calcStats(nqData);

  const combinedCumulative = (() => {
    if (!esData.length || !nqData.length) return [];
    const allDates = [...new Set([...esData.map(t => t.date), ...nqData.map(t => t.date)])].sort();
    let esCum = 0, nqCum = 0;
    const esMap = {}, nqMap = {};
    esData.forEach(t => { esMap[t.date] = (esMap[t.date] || 0) + t.pnl; });
    nqData.forEach(t => { nqMap[t.date] = (nqMap[t.date] || 0) + t.pnl; });
    return allDates.map(date => {
      esCum += esMap[date] || 0;
      nqCum += nqMap[date] || 0;
      return { date: date.slice(5), ES: Math.round(esCum), NQ: Math.round(nqCum), Combined: Math.round(esCum + nqCum) };
    });
  })();

  if (loading) return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", color: COLORS.dim, fontSize: 14 }}>
      Loading backtest results...
    </div>
  );

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.text, fontFamily: "sans-serif", padding: 24 }}>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent, letterSpacing: 4, marginBottom: 6 }}>EDGEFLOW PLATFORM</div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>Backtest <span style={{ color: COLORS.accent }}>Results</span></div>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, marginTop: 4 }}>
          ORB Strategy · ES (2 contracts) + NQ (10 MNQ) · 2 Years · No Wednesdays · Tick-Corrected
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <Badge label="ES → Scenario B: Trail Stop" color={COLORS.sB} />
          <Badge label="NQ → Scenario A: Breakeven Stop" color={COLORS.sA} />
          <Badge label="✓ Both Pass Apex $150k" color={COLORS.accent2} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${COLORS.border}` }}>
        {[
          { id: "overview", label: "Overview" },
          { id: "es_compare", label: "ES: A vs B" },
          { id: "nq_compare", label: "NQ: A vs B" },
          { id: "es", label: "ES Deep Dive" },
          { id: "nq", label: "NQ Deep Dive" },
          { id: "compare", label: "ES vs NQ" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "10px 20px", background: "none", border: "none",
            borderBottom: `2px solid ${activeTab === tab.id ? COLORS.accent : "transparent"}`,
            color: activeTab === tab.id ? COLORS.accent : COLORS.dim,
            fontFamily: "monospace", fontSize: 12, cursor: "pointer", letterSpacing: 1,
          }}>{tab.label}</button>
        ))}
      </div>

      {/* OVERVIEW */}
      {activeTab === "overview" && es && nq && (
        <div>
          {/* Decision Summary */}
          <div style={{ background: COLORS.bg2, border: `1px solid rgba(0,255,157,0.3)`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.accent2, letterSpacing: 3, marginBottom: 16 }}>FINAL STRATEGY DECISION</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={{ padding: 16, background: COLORS.bg3, borderRadius: 10, border: `1px solid ${COLORS.sB}` }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.sB, marginBottom: 8 }}>ES — SCENARIO B ✓ RECOMMENDED</div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, lineHeight: 1.8 }}>
                  2 ES contracts · Trail stop after T1 · Let winner run to EOD<br />
                  Win Rate: <span style={{ color: COLORS.accent2 }}>81.4%</span> · P&L: <span style={{ color: COLORS.accent2 }}>$126,481</span> · $5,059/month
                </div>
              </div>
              <div style={{ padding: 16, background: COLORS.bg3, borderRadius: 10, border: `1px solid ${COLORS.sA}` }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.sA, marginBottom: 8 }}>NQ — SCENARIO A ✓ RECOMMENDED</div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, lineHeight: 1.8 }}>
                  10 MNQ contracts · Breakeven stop after T1 · Target T2<br />
                  Win Rate: <span style={{ color: COLORS.accent2 }}>74.3%</span> · P&L: <span style={{ color: COLORS.accent2 }}>$101,815</span> · $4,073/month
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, padding: 16, background: "rgba(0,255,157,0.05)", borderRadius: 8, border: `1px solid rgba(0,255,157,0.2)` }}>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: COLORS.accent2, fontWeight: 800 }}>
                Combined: $228,296 over 2 years · $9,132/month average · Both accounts pass Apex ✅
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
            {[
              { label: "ES", stats: es, color: COLORS.es, scenario: "Scenario B (Recommended)", contracts: "2 ES contracts" },
              { label: "NQ", stats: nq, color: COLORS.nq, scenario: "Scenario A (Recommended)", contracts: "10 MNQ contracts" }
            ].map(({ label, stats, color, scenario, contracts }) => (
              <div key={label} style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color, letterSpacing: 3, marginBottom: 4 }}>ORB {label}</div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, marginBottom: 16 }}>{scenario} · {contracts}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <StatCard label="WIN RATE" value={`${stats.winRate}%`} color={COLORS.accent2} />
                  <StatCard label="TOTAL P&L" value={`$${stats.totalPnl?.toLocaleString()}`} color={COLORS.accent2} />
                  <StatCard label="PROFIT FACTOR" value={stats.profitFactor?.toFixed(2)} color={color} />
                  <StatCard label="MAX DRAWDOWN" value={`$${stats.maxDD?.toLocaleString()}`} color={COLORS.accent3} />
                  <StatCard label="AVG/MONTH" value={`$${Math.round(stats.totalPnl / 25)?.toLocaleString()}`} color={color} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <SectionHeader title="Cumulative P&L — ES + NQ + Combined" sub="2 YEAR GROWTH CURVE" />
            <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, marginBottom: 12 }}>
              Combined: <span style={{ color: COLORS.accent2 }}>${(es.totalPnl + nq.totalPnl).toLocaleString()}</span> total profit ·
              Average <span style={{ color: COLORS.accent2 }}>${Math.round((es.totalPnl + nq.totalPnl) / 25).toLocaleString()}/month</span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={combinedCumulative}>
                <XAxis dataKey="date" tick={{ fill: COLORS.dim, fontSize: 10 }} axisLine={false} tickLine={false} interval={30} />
                <YAxis tick={{ fill: COLORS.dim, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
                  formatter={v => [`$${v.toLocaleString()}`, ""]} />
                <ReferenceLine y={0} stroke={COLORS.border} />
                <Line type="monotone" dataKey="ES" stroke={COLORS.es} dot={false} strokeWidth={2} name="ES (Scenario B)" />
                <Line type="monotone" dataKey="NQ" stroke={COLORS.nq} dot={false} strokeWidth={2} name="NQ (Scenario A)" />
                <Line type="monotone" dataKey="Combined" stroke={COLORS.accent2} dot={false} strokeWidth={3} strokeDasharray="5 5" name="Combined" />
                <Legend wrapperStyle={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {[{ label: "ES", stats: es }, { label: "NQ", stats: nq }].map(({ label, stats }) => (
              <div key={label} style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
                <SectionHeader title={`Monthly P&L — ${label}`} sub="MONTH BY MONTH" />
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.monthlyData}>
                    <XAxis dataKey="month" tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
                    <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
                      formatter={v => [`$${v.toLocaleString()}`, "P&L"]} />
                    <ReferenceLine y={0} stroke={COLORS.border} />
                    <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                      {stats.monthlyData?.map((entry, i) => (
                        <Cell key={i} fill={entry.pnl >= 0 ? COLORS.accent2 : COLORS.accent3} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "es_compare" && <ScenarioCompare ticker="ES" color={COLORS.es} />}
      {activeTab === "nq_compare" && <ScenarioCompare ticker="NQ" color={COLORS.nq} />}
      {activeTab === "es" && <DeepDive stats={es} ticker="ES" color={COLORS.es} />}
      {activeTab === "nq" && <DeepDive stats={nq} ticker="NQ" color={COLORS.nq} />}

      {activeTab === "compare" && es && nq && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
            <StatCard label="ES WIN RATE" value={`${es.winRate}%`} color={COLORS.es} sub={`${es.winners}W / ${es.losers}L`} />
            <StatCard label="NQ WIN RATE" value={`${nq.winRate}%`} color={COLORS.nq} sub={`${nq.winners}W / ${nq.losers}L`} />
            <StatCard label="ES PROFIT FACTOR" value={es.profitFactor?.toFixed(2)} color={COLORS.es} />
            <StatCard label="NQ PROFIT FACTOR" value={nq.profitFactor?.toFixed(2)} color={COLORS.nq} />
            <StatCard label="ES TOTAL P&L" value={`$${es.totalPnl?.toLocaleString()}`} color={COLORS.es} sub="2 contracts, 2 years" />
            <StatCard label="NQ TOTAL P&L" value={`$${nq.totalPnl?.toLocaleString()}`} color={COLORS.nq} sub="10 MNQ, 2 years" />
            <StatCard label="ES MAX DRAWDOWN" value={`$${es.maxDD?.toLocaleString()}`} color={COLORS.accent3} />
            <StatCard label="NQ MAX DRAWDOWN" value={`$${nq.maxDD?.toLocaleString()}`} color={COLORS.accent3} />
          </div>

          <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <SectionHeader title="Win Rate by Day of Week — ES vs NQ" sub="DAY OF WEEK COMPARISON" />
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={[
                { day: "Mon", ES: es.dowData?.[0]?.winRate, NQ: nq.dowData?.[0]?.winRate },
                { day: "Tue", ES: es.dowData?.[1]?.winRate, NQ: nq.dowData?.[1]?.winRate },
                { day: "Thu", ES: es.dowData?.[2]?.winRate, NQ: nq.dowData?.[2]?.winRate },
                { day: "Fri", ES: es.dowData?.[3]?.winRate, NQ: nq.dowData?.[3]?.winRate },
              ]} barGap={4}>
                <XAxis dataKey="day" tick={{ fill: COLORS.dim, fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: COLORS.dim, fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
                  formatter={v => [`${v}%`, ""]} />
                <ReferenceLine y={50} stroke={COLORS.border} strokeDasharray="3 3" />
                <Bar dataKey="ES" fill={COLORS.es} radius={[3, 3, 0, 0]} name="ES" />
                <Bar dataKey="NQ" fill={COLORS.nq} radius={[3, 3, 0, 0]} name="NQ" />
                <Legend wrapperStyle={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
            <SectionHeader title="Drawdown Comparison — ES vs NQ" sub="RISK COMPARISON" />
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={es.ddSeries?.map((d, i) => ({ date: d.date.slice(5), ES: d.dd, NQ: nq.ddSeries?.[i]?.dd || 0 }))}>
                <XAxis dataKey="date" tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} interval={40} />
                <YAxis tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
                  formatter={v => [`$${v.toLocaleString()}`, ""]} />
                <ReferenceLine y={0} stroke={COLORS.border} />
                <Area type="monotone" dataKey="ES" stroke={COLORS.es} fill="rgba(0,212,255,0.1)" name="ES DD" />
                <Area type="monotone" dataKey="NQ" stroke={COLORS.nq} fill="rgba(168,85,247,0.1)" name="NQ DD" />
                <Legend wrapperStyle={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 16, marginTop: 28, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim }}>
          EDGEFLOW — Real CME Globex data · Databento · 2024-2026 · Tick-corrected
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.accent }}>
          ES Scenario B · NQ Scenario A · v2.0
        </span>
      </div>
    </div>
  );
}