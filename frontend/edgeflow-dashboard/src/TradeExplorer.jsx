import { useState, useEffect, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const COLORS = {
  bg: "#080b0f", bg2: "#0d1117", bg3: "#111820",
  border: "#1e2d3d", accent: "#00d4ff", accent2: "#00ff9d",
  accent3: "#ff6b35", accent4: "#a855f7", text: "#e2e8f0", dim: "#64748b",
};

const TICKER_CONFIG = {
  ES: { contracts: 2, pointValue: 50, label: "2 ES contracts · $50/pt" },
  NQ: { contracts: 10, pointValue: 2, label: "10 MNQ contracts · $2/pt" },
};

// ─── CANDLESTICK CHART ────────────────────────────────────────────────────────
function CandlestickChart({ candles, trade, zoomRange }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!candles.length || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.bg2;
    ctx.fillRect(0, 0, W, H);

    const start = Math.floor(zoomRange[0] / 100 * candles.length);
    const end = Math.ceil(zoomRange[1] / 100 * candles.length);
    const visible = candles.slice(start, end);
    if (!visible.length) return;

    const padding = { top: 40, bottom: 40, left: 60, right: 20 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    const allPrices = visible.flatMap(c => [c.high, c.low]);
    if (trade) allPrices.push(trade.entry, trade.stop, trade.target1, trade.target2);
    const minP = Math.min(...allPrices) - 2;
    const maxP = Math.max(...allPrices) + 2;
    const priceRange = maxP - minP;
    const toY = p => padding.top + chartH * (1 - (p - minP) / priceRange);
    const barW = Math.max(2, chartW / visible.length - 1);

    ctx.strokeStyle = 'rgba(30,45,61,0.8)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const y = padding.top + (chartH / 6) * i;
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(W - padding.right, y); ctx.stroke();
      ctx.fillStyle = COLORS.dim; ctx.font = '9px monospace'; ctx.textAlign = 'right';
      ctx.fillText((maxP - (priceRange / 6) * i).toFixed(1), padding.left - 4, y + 3);
    }

    if (trade) {
      const orbHigh = trade.direction === "LONG" ? trade.entry : trade.stop;
      const orbLow = trade.direction === "LONG" ? trade.stop : trade.entry;
      const orbEndIdx = visible.findIndex(c => c.time > "09:44");
      if (orbEndIdx > 0) {
        ctx.fillStyle = 'rgba(100,116,139,0.1)';
        ctx.fillRect(padding.left, toY(orbHigh), (orbEndIdx / visible.length) * chartW, toY(orbLow) - toY(orbHigh));
      }
    }

    visible.forEach((c, i) => {
      const x = padding.left + (i / visible.length) * chartW + barW / 2;
      const isGreen = c.close >= c.open;
      const bodyTop = toY(Math.max(c.open, c.close));
      const bodyH = Math.max(1, toY(Math.min(c.open, c.close)) - bodyTop);
      ctx.strokeStyle = isGreen ? '#00ff9d' : '#ff6b35';
      ctx.fillStyle = isGreen ? 'rgba(0,255,157,0.8)' : 'rgba(255,107,53,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, toY(c.high)); ctx.lineTo(x, toY(c.low)); ctx.stroke();
      ctx.fillRect(x - barW / 2, bodyTop, barW, bodyH);
    });

    if (trade) {
      [
        { price: trade.entry, color: COLORS.accent, label: `Entry ${trade.entry}`, dash: [6, 3] },
        { price: trade.stop, color: COLORS.accent3, label: `Stop ${trade.stop}`, dash: [4, 4] },
        { price: trade.target1, color: COLORS.accent2, label: `T1 ${trade.target1}`, dash: [4, 4] },
        { price: trade.target2, color: COLORS.accent2, label: `T2 ${trade.target2}`, dash: [] },
      ].forEach(lev => {
        const y = toY(lev.price);
        if (y < padding.top || y > H - padding.bottom) return;
        ctx.strokeStyle = lev.color; ctx.lineWidth = 1.5; ctx.setLineDash(lev.dash);
        ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(W - padding.right, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = lev.color; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
        ctx.fillText(lev.label, W - padding.right + 2, y + 3);
      });
    }

    ctx.fillStyle = COLORS.dim; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    const labelInterval = Math.max(1, Math.floor(visible.length / 8));
    visible.forEach((c, i) => {
      if (i % labelInterval === 0)
        ctx.fillText(c.time, padding.left + (i / visible.length) * chartW + barW / 2, H - 10);
    });
  }, [candles, trade, zoomRange]);

  return <canvas ref={canvasRef} width={580} height={320} style={{ width: "100%", height: 320, borderRadius: 8 }} />;
}

// ─── PER CONTRACT BREAKDOWN ───────────────────────────────────────────────────
// Uses exact exit data from database — no recalculation, always accurate
function PerContractBreakdown({ trade, ticker }) {
  const { contracts } = TICKER_CONFIG[ticker];

  const c1ExitType  = trade.c1_exit_type;
  const c1ExitPrice = trade.c1_exit_price;
  const c1ExitTime  = trade.c1_exit_time;
  const c1Pts       = trade.c1_pts;
  const c1Pnl       = trade.c1_pnl;

  const c2ExitType  = trade.c2_exit_type;
  const c2ExitPrice = trade.c2_exit_price;
  const c2ExitTime  = trade.c2_exit_time;
  const c2Pts       = trade.c2_pts;
  const c2Pnl       = trade.c2_pnl;

  const total = Math.round(((c1Pnl || 0) + (c2Pnl || 0)) * 100) / 100;
  const match = Math.abs(total - trade.pnl) < 0.01;

  const exitLabel = (type) => ({
    target1:    "T1 hit",
    target2:    "T2 hit",
    trail_stop: "Trail stop hit",
    be_stop:    "Breakeven stop",
    stop:       "Stopped out",
    eod_close:  "EOD close (3:55 PM)",
  }[type] || type);

  const isLoss  = trade.result === "loss";
  const bg      = isLoss ? "rgba(255,107,53,0.05)" : "rgba(0,255,157,0.05)";
  const border  = isLoss ? "1px solid rgba(255,107,53,0.2)" : "1px solid rgba(0,255,157,0.2)";
  const c1Color = (c1Pnl || 0) >= 0 ? COLORS.accent2 : COLORS.accent3;
  const c2Color = c2ExitType === "be_stop" ? COLORS.accent : (c2Pnl || 0) >= 0 ? COLORS.accent2 : COLORS.accent3;

  return (
    <div style={{ marginTop: 12, padding: "12px 16px", background: bg, borderRadius: 8, border }}>
      <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 2, marginBottom: 8 }}>PER CONTRACT BREAKDOWN</div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, padding: "6px 8px", background: COLORS.bg3, borderRadius: 6 }}>
        <div>
          <span style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim }}>Contract 1 — </span>
          <span style={{ fontFamily: "monospace", fontSize: 10, color: c1Color }}>{exitLabel(c1ExitType)}</span>
          <span style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim }}> @ {c1ExitPrice} ({c1ExitTime})</span>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: c1Color }}>
          {(c1Pts || 0) > 0 ? "+" : ""}{c1Pts?.toFixed(2)} pts = <strong>{(c1Pnl || 0) >= 0 ? "+" : ""}${(c1Pnl || 0).toLocaleString()}</strong>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "6px 8px", background: COLORS.bg3, borderRadius: 6 }}>
        <div>
          <span style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim }}>Contract 2 — </span>
          <span style={{ fontFamily: "monospace", fontSize: 10, color: c2Color }}>{exitLabel(c2ExitType)}</span>
          <span style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim }}> @ {c2ExitPrice} ({c2ExitTime})</span>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: c2Color }}>
          {(c2Pts || 0) > 0 ? "+" : ""}{c2Pts?.toFixed(2)} pts = <strong>{(c2Pnl || 0) >= 0 ? "+" : ""}${(c2Pnl || 0).toLocaleString()}</strong>
        </div>
      </div>

      <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 800, borderTop: `1px solid ${COLORS.border}`, paddingTop: 6, color: match ? (isLoss ? COLORS.accent3 : COLORS.accent2) : COLORS.accent4 }}>
        Total: {total >= 0 ? "+" : ""}${total.toLocaleString()} {match ? "✅" : `⚠️ DB: $${trade.pnl}`}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function TradeExplorer() {
  const [trades, setTrades] = useState([]);
  const [index, setIndex] = useState(0);
  const [ticker, setTicker] = useState("ES");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [candles, setCandles] = useState([]);
  const [resolution, setResolution] = useState(5);
  const [zoomRange, setZoomRange] = useState([0, 100]);
  const [candleLoading, setCandleLoading] = useState(false);

  const cfg = TICKER_CONFIG[ticker];
  const { contracts, pointValue } = cfg;
  const half = contracts / 2;

  useEffect(() => {
    setLoading(true);
    fetch(`http://127.0.0.1:8000/backtest/ORB/${ticker}`)
      .then(r => r.json())
      .then(d => { setTrades(d.trades || []); setIndex(0); setLoading(false); })
      .catch(() => setLoading(false));
  }, [ticker]);

  const filtered = trades.filter(t => {
    if (filter === "win") return t.result === "win";
    if (filter === "loss") return t.result === "loss";
    if (filter === "aplus") return t.score >= 3;
    return true;
  });

  const trade = filtered[index];

  useEffect(() => {
    if (!trade) return;
    setCandleLoading(true);
    fetch(`http://127.0.0.1:8000/candles/${ticker}/${trade.date}?resolution=${resolution}`)
      .then(r => r.json())
      .then(d => { setCandles(d.candles || []); setCandleLoading(false); })
      .catch(() => setCandleLoading(false));
  }, [trade, resolution, ticker]);

  const totalPnl = filtered.reduce((s, t) => s + t.pnl, 0);
  const winRate = filtered.length ? (filtered.filter(t => t.result === "win").length / filtered.length * 100).toFixed(1) : 0;

  const buildSimChart = (t) => {
    if (!t) return [];
    const orb_range = t.orb_range || 10;
    const entry = t.entry;
    const points = [];
    for (let i = 0; i <= 10; i++) points.push({ time: `9:${30 + i}`, price: ((entry + t.stop) / 2) + (Math.random() - 0.5) * orb_range * 0.3 });
    points.push({ time: "9:45", price: entry });
    if (t.result === "win") {
      const dest = t.t2_hit ? t.target2 : t.target1;
      const steps = t.t2_hit ? 15 : 10;
      for (let i = 0; i <= steps; i++) {
        const p = t.direction === "LONG" ? entry + (dest - entry) * (i / steps) : entry - (entry - dest) * (i / steps);
        points.push({ time: `10:${i * 2}`, price: p + (Math.random() - 0.5) * orb_range * 0.1 });
      }
    } else {
      for (let i = 0; i <= 12; i++) {
        const p = t.direction === "LONG" ? entry - (entry - t.stop) * (i / 12) : entry + (t.stop - entry) * (i / 12);
        points.push({ time: `10:${i * 2}`, price: p + (Math.random() - 0.5) * orb_range * 0.05 });
      }
    }
    return points;
  };

  const getFactors = (t) => {
    if (!t) return [];
    const factors = [];
    const gap = t.gap_pct || 0;
    if (t.direction === "LONG") {
      if (gap < -0.1) factors.push({ text: `Gap down ${gap.toFixed(3)}% → Long bias confirmed`, pts: 2, pass: true });
      else if (gap > 0.1) factors.push({ text: `Gap up ${gap.toFixed(3)}% → Against long direction`, pts: 0, pass: false });
      else factors.push({ text: `Flat gap ${gap.toFixed(3)}%`, pts: 0.5, pass: null });
    } else {
      if (gap > 0.1) factors.push({ text: `Gap up ${gap.toFixed(3)}% → Short bias confirmed`, pts: 2, pass: true });
      else if (gap < -0.1) factors.push({ text: `Gap down ${gap.toFixed(3)}% → Against short direction`, pts: 0, pass: false });
      else factors.push({ text: `Flat gap ${gap.toFixed(3)}%`, pts: 0.5, pass: null });
    }
    if (t.above_vwap !== null && t.above_vwap !== undefined) {
      const aligned = (t.direction === "LONG" && t.above_vwap) || (t.direction === "SHORT" && !t.above_vwap);
      factors.push({ text: `Price ${t.above_vwap ? "above" : "below"} VWAP → ${aligned ? "Aligned" : "Against"} direction`, pts: aligned ? 1 : 0, pass: aligned });
    }
    factors.push(t.day_of_week === "Tuesday"
      ? { text: `${t.day_of_week} — strongest ORB day (+0.5)`, pts: 0.5, pass: true }
      : { text: `${t.day_of_week} — standard day`, pts: 0, pass: null });
    factors.push(t.orb_range > 12
      ? { text: `Range ${t.orb_range?.toFixed(2)} pts — above 1.5x minimum (+0.5)`, pts: 0.5, pass: true }
      : { text: `Range ${t.orb_range?.toFixed(2)} pts — standard`, pts: 0, pass: null });
    return factors;
  };

  if (loading) return <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", color: COLORS.dim }}>Loading trades...</div>;
  if (!trade) return <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", color: COLORS.dim }}>No trades found</div>;

  const factors = getFactors(trade);
  const riskDollars = (trade.orb_range * pointValue * contracts).toFixed(0);
  const maxReward = (trade.orb_range * pointValue * contracts * 1.5).toFixed(0);
  const simData = buildSimChart(trade);

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.text, fontFamily: "sans-serif", padding: 24 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent, letterSpacing: 4, marginBottom: 6 }}>EDGEFLOW PLATFORM</div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>Trade <span style={{ color: COLORS.accent }}>Explorer</span></div>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, marginTop: 4 }}>Click through every ORB trade — see exactly how each decision was made</div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {["ES", "NQ"].map(t => (
          <button key={t} onClick={() => setTicker(t)} style={{
            padding: "8px 20px", borderRadius: 8, border: `1px solid ${ticker === t ? COLORS.accent : COLORS.border}`,
            background: ticker === t ? "rgba(0,212,255,0.1)" : COLORS.bg2,
            color: ticker === t ? COLORS.accent : COLORS.dim,
            fontFamily: "monospace", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>{t}</button>
        ))}
        <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, padding: "4px 10px", background: COLORS.bg3, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
          {cfg.label}
        </div>
        <div style={{ width: 1, height: 24, background: COLORS.border }} />
        {[{ id: "all", label: "All Trades" }, { id: "win", label: "Winners" }, { id: "loss", label: "Losers" }, { id: "aplus", label: "A+ Only" }].map(f => (
          <button key={f.id} onClick={() => { setFilter(f.id); setIndex(0); }} style={{
            padding: "8px 16px", borderRadius: 8, border: `1px solid ${filter === f.id ? COLORS.accent4 : COLORS.border}`,
            background: filter === f.id ? "rgba(168,85,247,0.1)" : COLORS.bg2,
            color: filter === f.id ? COLORS.accent4 : COLORS.dim,
            fontFamily: "monospace", fontSize: 11, cursor: "pointer",
          }}>{f.label}</button>
        ))}
        <div style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>
          <span style={{ color: COLORS.accent }}>{filtered.length}</span> trades ·
          <span style={{ color: COLORS.accent2 }}> {winRate}% win</span> ·
          <span style={{ color: totalPnl >= 0 ? COLORS.accent2 : COLORS.accent3 }}> ${totalPnl.toLocaleString()}</span>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <button onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.bg2, color: index === 0 ? COLORS.dim : COLORS.text, fontFamily: "monospace", fontSize: 13, cursor: index === 0 ? "default" : "pointer" }}>← Prev</button>
        <div style={{ fontFamily: "monospace", fontSize: 12, color: COLORS.dim, flex: 1, textAlign: "center" }}>
          Trade <span style={{ color: COLORS.accent }}>{index + 1}</span> of <span style={{ color: COLORS.accent }}>{filtered.length}</span>
        </div>
        <button onClick={() => setIndex(Math.min(filtered.length - 1, index + 1))} disabled={index === filtered.length - 1} style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.bg2, color: index === filtered.length - 1 ? COLORS.dim : COLORS.text, fontFamily: "monospace", fontSize: 13, cursor: index === filtered.length - 1 ? "default" : "pointer" }}>Next →</button>
      </div>

      {/* Trade Header Card */}
      <div style={{ background: COLORS.bg2, border: `1px solid ${trade.result === "win" ? "rgba(0,255,157,0.3)" : "rgba(255,107,53,0.3)"}`, borderRadius: 12, padding: 24, marginBottom: 20, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: trade.result === "win" ? COLORS.accent2 : COLORS.accent3 }} />

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, marginBottom: 8 }}>{trade.date} · {trade.day_of_week} · ORB {ticker}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: trade.direction === "LONG" ? COLORS.accent2 : COLORS.accent3 }}>
              {trade.direction === "LONG" ? "▲ LONG" : "▼ SHORT"}
            </span>
            <span style={{ fontFamily: "monospace", fontSize: 14, color: COLORS.accent4, padding: "4px 12px", background: "rgba(168,85,247,0.1)", borderRadius: 6, border: `1px solid rgba(168,85,247,0.3)` }}>
              Score: {trade.score}/5 {trade.score >= 3 ? "✓ A+" : ""}
            </span>
            <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 800, color: trade.result === "win" ? COLORS.accent2 : COLORS.accent3 }}>
              {trade.result === "win" ? "WIN" : "LOSS"} · ${trade.pnl.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Stat Cards */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "CONTRACTS", value: contracts, color: COLORS.accent },
            { label: "ORB RANGE", value: `${trade.orb_range?.toFixed(2)} pts` },
            { label: "ENTRY", value: trade.entry?.toFixed(2), color: COLORS.accent },
            { label: "STOP", value: trade.stop?.toFixed(2), color: COLORS.accent3 },
            { label: "TARGET 1", value: trade.target1?.toFixed(2), color: trade.t1_hit ? COLORS.accent2 : COLORS.dim },
            { label: "TARGET 2", value: trade.target2?.toFixed(2), color: trade.t2_hit ? COLORS.accent2 : COLORS.dim },
            { label: "RISK $", value: `-$${riskDollars}`, color: COLORS.accent3 },
            { label: "MAX REWARD", value: `+$${maxReward}`, color: COLORS.accent2 },
            { label: "P&L", value: `$${trade.pnl.toLocaleString()}`, color: trade.pnl >= 0 ? COLORS.accent2 : COLORS.accent3 },
          ].map(item => (
            <div key={item.label} style={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: COLORS.dim, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: item.color || COLORS.text }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Per Contract Breakdown */}
        <PerContractBreakdown trade={trade} ticker={ticker} />

        {/* Timeline */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 3, marginBottom: 12 }}>FULL TRADE TIMELINE</div>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
            {[
              { time: "9:30 AM", label: "ORB Starts", color: COLORS.dim, desc: "15-min range begins" },
              { time: "9:44 AM", label: "ORB Locked", color: COLORS.accent, desc: `${trade.orb_range?.toFixed(2)} pt range` },
              { time: "9:45-11:00", label: "Scanning", color: COLORS.dim, desc: "Watching for breakout" },
              { time: "~10:00 AM", label: "Entry", color: COLORS.accent, desc: `${trade.direction} @ ${trade.entry?.toFixed(2)}` },
              trade.t1_hit
                ? { time: "~10:20 AM", label: "T1 Hit ✅", color: COLORS.accent2, desc: `${trade.target1?.toFixed(2)} — ${half} contract(s) off` }
                : { time: "—", label: "T1 Missed", color: COLORS.dim, desc: "Not reached" },
              trade.t2_hit
                ? { time: "~10:40 AM", label: "T2 Hit ✅", color: COLORS.accent2, desc: `${trade.target2?.toFixed(2)} — ${half} contract(s) exit` }
                : trade.result === "loss"
                  ? { time: "—", label: "Stopped ❌", color: COLORS.accent3, desc: `${trade.stop?.toFixed(2)} — all ${contracts} out` }
                  : { time: "—", label: "BE Exit", color: COLORS.accent, desc: "Remaining closed at entry" },
            ].map((item, i, arr) => (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ textAlign: "center", minWidth: 90 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 9, color: COLORS.dim, marginBottom: 4 }}>{item.time}</div>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, margin: "0 auto 4px" }} />
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: item.color, fontWeight: 700 }}>{item.label}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 9, color: COLORS.dim, marginTop: 2 }}>{item.desc}</div>
                </div>
                {i < arr.length - 1 && <div style={{ width: 30, height: 1, background: COLORS.border, margin: "0 4px", marginBottom: 20 }} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* Candlestick */}
        <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 3, marginBottom: 4 }}>REAL PRICE DATA — {trade.date}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Candlestick Chart</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[1, 5].map(r => (
                <button key={r} onClick={() => setResolution(r)} style={{
                  padding: "4px 12px", borderRadius: 6, border: `1px solid ${resolution === r ? COLORS.accent : COLORS.border}`,
                  background: resolution === r ? "rgba(0,212,255,0.1)" : COLORS.bg3,
                  color: resolution === r ? COLORS.accent : COLORS.dim,
                  fontFamily: "monospace", fontSize: 10, cursor: "pointer",
                }}>{r}m</button>
              ))}
            </div>
          </div>
          {candleLoading
            ? <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>Loading candles...</div>
            : <CandlestickChart candles={candles} trade={trade} zoomRange={zoomRange} />
          }
          <div style={{ marginTop: 12 }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, marginBottom: 6 }}>
              ZOOM: {candles.length ? `${Math.floor(zoomRange[0]/100*candles.length)} - ${Math.ceil(zoomRange[1]/100*candles.length)} of ${candles.length} candles` : "—"}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: COLORS.dim }}>Start</span>
              <input type="range" min={0} max={80} value={zoomRange[0]} onChange={e => setZoomRange([Number(e.target.value), zoomRange[1]])} style={{ flex: 1, accentColor: COLORS.accent }} />
              <input type="range" min={20} max={100} value={zoomRange[1]} onChange={e => setZoomRange([zoomRange[0], Number(e.target.value)])} style={{ flex: 1, accentColor: COLORS.accent }} />
              <span style={{ fontFamily: "monospace", fontSize: 9, color: COLORS.dim }}>End</span>
              <button onClick={() => setZoomRange([0, 100])} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.bg3, color: COLORS.dim, fontFamily: "monospace", fontSize: 9, cursor: "pointer" }}>Reset</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
            {[
              { color: COLORS.accent, label: "Entry", dash: true },
              { color: COLORS.accent3, label: "Stop", dash: true },
              { color: COLORS.accent2, label: "T1 (0.5x)", dash: true },
              { color: COLORS.accent2, label: "T2 (1.0x)", dash: false },
              { color: "rgba(100,116,139,0.3)", label: "ORB Zone", box: true },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {item.box ? <div style={{ width: 14, height: 10, background: item.color, borderRadius: 2 }} /> : <div style={{ width: 16, height: 1.5, background: item.color, borderStyle: item.dash ? "dashed" : "solid" }} />}
                <span style={{ fontFamily: "monospace", fontSize: 9, color: COLORS.dim }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Simulated Chart */}
        <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 3, marginBottom: 4 }}>SIMULATED PRICE PATH</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>Illustrative Outcome</div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={simData}>
              <XAxis dataKey="time" tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false} interval={8} />
              <YAxis tick={{ fill: COLORS.dim, fontSize: 9 }} axisLine={false} tickLine={false}
                domain={[Math.min(trade.stop, trade.target2) - trade.orb_range * 0.5, Math.max(trade.stop, trade.target2) + trade.orb_range * 0.5]}
                tickFormatter={v => v.toFixed(1)} />
              <Tooltip contentStyle={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }} formatter={v => [v.toFixed(2), "Price"]} />
              <ReferenceLine y={trade.entry} stroke={COLORS.accent} strokeDasharray="4 4" label={{ value: "Entry", fill: COLORS.accent, fontSize: 9, fontFamily: "monospace" }} />
              <ReferenceLine y={trade.stop} stroke={COLORS.accent3} strokeDasharray="4 4" label={{ value: "Stop", fill: COLORS.accent3, fontSize: 9, fontFamily: "monospace" }} />
              <ReferenceLine y={trade.target1} stroke={COLORS.accent2} strokeDasharray="4 4" label={{ value: "T1", fill: COLORS.accent2, fontSize: 9, fontFamily: "monospace" }} />
              <ReferenceLine y={trade.target2} stroke={COLORS.accent2} label={{ value: "T2", fill: COLORS.accent2, fontSize: 9, fontFamily: "monospace" }} />
              <Area type="monotone" dataKey="price" stroke={trade.result === "win" ? COLORS.accent2 : COLORS.accent3} fill={trade.result === "win" ? "rgba(0,255,157,0.1)" : "rgba(255,107,53,0.1)"} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 16, padding: 16, background: COLORS.bg3, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 2, marginBottom: 10 }}>TRADE SUMMARY</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Contracts", value: contracts, color: COLORS.accent },
                { label: "Point Value", value: `$${pointValue}/pt`, color: COLORS.dim },
                { label: "T1 Hit", value: trade.t1_hit ? "✅ Yes" : "❌ No", color: trade.t1_hit ? COLORS.accent2 : COLORS.accent3 },
                { label: "T2 Hit", value: trade.t2_hit ? "✅ Yes" : "❌ No", color: trade.t2_hit ? COLORS.accent2 : COLORS.accent3 },
                { label: "Risk", value: `-$${riskDollars}`, color: COLORS.accent3 },
                { label: "Result", value: `$${trade.pnl.toLocaleString()}`, color: trade.pnl >= 0 ? COLORS.accent2 : COLORS.accent3 },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>{item.label}:</span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: item.color, fontWeight: 700 }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* How Algo Decided */}
      <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 3, marginBottom: 16 }}>HOW THE ALGO DECIDED</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            {[
              { n: 1, title: "9:30 AM — ORB Formation Begins", body: "Market opens. Algo watches every candle from 9:30 to 9:44 AM, tracking the highest high and lowest low." },
              { n: 2, title: "9:44 AM — ORB Range Locked", body: `ORB High: ${(trade.direction === "LONG" ? trade.entry : trade.stop)?.toFixed(2)} · ORB Low: ${(trade.direction === "LONG" ? trade.stop : trade.entry)?.toFixed(2)} · Range: ${trade.orb_range?.toFixed(2)} pts ${trade.orb_range >= 8 ? "✅" : "❌"}` },
              { n: 3, title: "9:45-11:00 AM — Scanning for Breakout", body: `Watching for a close ${trade.direction === "LONG" ? "above ORB High" : "below ORB Low"}. Breakout detected — price closed ${trade.direction === "LONG" ? "above" : "below"} ${trade.entry?.toFixed(2)}.` },
              { n: 5, title: "Trade Placed", body: `${trade.direction} · ${contracts} contracts · Entry ${trade.entry?.toFixed(2)} · Stop ${trade.stop?.toFixed(2)} · T1 ${trade.target1?.toFixed(2)} · T2 ${trade.target2?.toFixed(2)}` },
            ].map(step => (
              <div key={step.n} style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: COLORS.bg, flexShrink: 0 }}>{step.n}</div>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: COLORS.text, fontWeight: 700, marginBottom: 4 }}>{step.title}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, lineHeight: 1.6 }}>{step.body}</div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: COLORS.bg, flexShrink: 0 }}>4</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: COLORS.text, fontWeight: 700, marginBottom: 12 }}>Confluence Check — Score {trade.score}/5</div>
                {factors.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, padding: "8px 10px", background: COLORS.bg3, borderRadius: 6, border: `1px solid ${f.pass === true ? "rgba(0,255,157,0.2)" : f.pass === false ? "rgba(255,107,53,0.2)" : COLORS.border}` }}>
                    <span style={{ fontSize: 12, flexShrink: 0 }}>{f.pass === true ? "✅" : f.pass === false ? "❌" : "➡️"}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: f.pass === true ? COLORS.accent2 : f.pass === false ? COLORS.accent3 : COLORS.dim, lineHeight: 1.5 }}>
                      {f.text} <span style={{ color: COLORS.accent }}>+{f.pts}</span>
                    </span>
                  </div>
                ))}
                <div style={{ fontFamily: "monospace", fontSize: 11, color: trade.score >= 3 ? COLORS.accent2 : COLORS.accent3, marginTop: 8, padding: "6px 10px", background: COLORS.bg3, borderRadius: 6 }}>
                  {trade.score >= 3 ? `✅ Score ${trade.score}/5 — A+ setup. Trade taken.` : `❌ Score ${trade.score}/5 — Below minimum. Trade skipped.`}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: trade.result === "win" ? COLORS.accent2 : COLORS.accent3, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: COLORS.bg, flexShrink: 0 }}>6</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: COLORS.text, fontWeight: 700, marginBottom: 8 }}>Result</div>
                <div style={{ padding: "12px 16px", background: trade.result === "win" ? "rgba(0,255,157,0.05)" : "rgba(255,107,53,0.05)", borderRadius: 8, border: `1px solid ${trade.result === "win" ? "rgba(0,255,157,0.2)" : "rgba(255,107,53,0.2)"}` }}>
                  {trade.result === "win" ? (
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent2, lineHeight: 1.8 }}>
                      {trade.t1_hit && <div>✅ T1 hit at {trade.target1?.toFixed(2)} — {half} contract(s) closed</div>}
                      {trade.t2_hit && <div>✅ T2 hit at {trade.target2?.toFixed(2)} — {half} contract(s) closed</div>}
                      {trade.t1_hit && !trade.t2_hit && <div>➡️ Remaining {half} contract(s) moved to BE — closed at entry</div>}
                      <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800 }}>Final P&L: +${trade.pnl.toLocaleString()} · {contracts} contracts</div>
                    </div>
                  ) : (
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent3, lineHeight: 1.8 }}>
                      <div>❌ Price reversed and hit stop at {trade.stop?.toFixed(2)}</div>
                      <div>{trade.orb_range?.toFixed(2)} pts × ${pointValue} × {contracts} contracts</div>
                      <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800 }}>Final P&L: ${trade.pnl.toLocaleString()}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Running P&L */}
      <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 3, marginBottom: 12 }}>RUNNING P&L UP TO THIS TRADE</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {(() => {
            const upToHere = filtered.slice(0, index + 1);
            const runningPnl = upToHere.reduce((s, t) => s + t.pnl, 0);
            const runningWins = upToHere.filter(t => t.result === "win").length;
            return [
              { label: "P&L SO FAR", value: `$${runningPnl.toLocaleString()}`, color: runningPnl >= 0 ? COLORS.accent2 : COLORS.accent3 },
              { label: "WIN RATE", value: `${(runningWins / upToHere.length * 100).toFixed(1)}%`, color: COLORS.accent },
              { label: "TRADES", value: upToHere.length, color: COLORS.text },
              { label: "WINS", value: runningWins, color: COLORS.accent2 },
              { label: "LOSSES", value: upToHere.length - runningWins, color: COLORS.accent3 },
              { label: "CONTRACTS", value: contracts, color: COLORS.accent },
              { label: "POINT VALUE", value: `$${pointValue}/pt`, color: COLORS.dim },
            ].map(item => (
              <div key={item.label} style={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px", textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: COLORS.dim, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: item.color }}>{item.value}</div>
              </div>
            ));
          })()}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 16, marginTop: 28, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim }}>EDGEFLOW — Trade Explorer · Real CME Data · {ticker} ORB</span>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.accent }}>{cfg.label}</span>
      </div>
    </div>
  );
}