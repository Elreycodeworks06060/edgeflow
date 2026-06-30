import { useState, useEffect, useMemo, useRef } from 'react';
import { createChart, CandlestickSeries, LineStyle } from 'lightweight-charts';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { C, CARD, API } from './theme';

// ── Helpers ────────────────────────────────────────────────────────────────────

function gapDir(pct) {
  if (pct == null) return 'unknown';
  if (pct > 0.1)  return 'up';
  if (pct < -0.1) return 'down';
  return 'flat';
}

const exitLabel = (t) =>
  ({ target1:'T1', target2:'T2', trail_stop:'Trail', eod_close:'EOD', stop:'Stop', be_stop:'BE Stop' }[t] ?? t ?? '—');

const pnlColor = (v) => v > 50 ? C.green : v < -50 ? C.red : C.textSub;

function toChartTime(hhmm, dateStr) {
  if (!hhmm || !dateStr) return null;
  const s = String(hhmm).replace(' ET', '');
  const [h, m] = s.split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);
  if (isNaN(h) || isNaN(y)) return null;
  return Date.UTC(y, mo - 1, d, h, m || 0, 0) / 1000;
}

function orbBucket4(r) {
  if (r == null) return null;
  if (r < 10)  return 'tiny';
  if (r <= 15) return 'small';
  if (r <= 20) return 'medium';
  return 'large';
}

function entryBucket(t) {
  if (!t) return null;
  const [h, m] = String(t).replace(' ET', '').split(':').map(Number);
  if (isNaN(h)) return null;
  return (h * 60 + (m || 0)) < 600 ? 'early' : 'late';
}

function reconstructFactors(t) {
  const gap     = gapDir(t.gap_pct);
  const aligned = (t.direction === 'LONG' && gap === 'up') || (t.direction === 'SHORT' && gap === 'down');
  const f1 = { label: 'Gap Direction', max: 2, pts: aligned ? 2 : 0.5, good: aligned,
    text: aligned ? `Gap ${gap} aligned` : `Gap ${gap} — partial` };
  const vwapAligned = t.above_vwap != null
    ? (t.direction === 'LONG' && t.above_vwap) || (t.direction === 'SHORT' && !t.above_vwap) : null;
  const f2 = { label: 'VWAP Alignment', max: 1, pts: vwapAligned ? 1 : vwapAligned === null ? 0.5 : 0,
    good: vwapAligned, text: vwapAligned == null ? 'Unavailable' : vwapAligned ? 'Aligned' : 'Against' };
  const isTue = t.day_of_week === 'Tuesday';
  const f4 = { label: 'Day of Week', max: 0.5, pts: isTue ? 0.5 : 0, good: isTue, text: t.day_of_week };
  const bigRange = (t.orb_range ?? 0) > 12;
  const f5 = { label: 'ORB Range', max: 0.5, pts: bigRange ? 0.5 : 0, good: bigRange, text: `${t.orb_range?.toFixed(2)} pts` };
  const pdhPts = Math.max(0, Math.round((t.score - f1.pts - f2.pts - f4.pts - f5.pts) * 2) / 2);
  const f3 = { label: 'PDH / PDL', max: 1, pts: pdhPts, good: pdhPts >= 1, text: pdhPts >= 1 ? 'Not blocking' : 'Level nearby' };
  return [f1, f2, f3, f4, f5];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const lbl = { fontFamily: C.font, fontSize: 10, fontWeight: 500, letterSpacing: 1.5, textTransform: 'uppercase', color: C.textSub };

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const FILTER_MODES = [
  { id: 'all',     label: 'All Trades' },
  { id: 'winners', label: 'Winners'    },
  { id: 'losers',  label: 'Losers'     },
  { id: 'aplus',   label: 'A+ (3.5+)' },
];

const ORB_BUCKETS = [
  { id: 'all',    label: 'All'   },
  { id: 'tiny',   label: '<10'   },
  { id: 'small',  label: '10-15' },
  { id: 'medium', label: '15-20' },
  { id: 'large',  label: '>20'   },
];

const ENTRY_BUCKETS = [
  { id: 'all',   label: 'All'   },
  { id: 'early', label: '9:45–10' },
  { id: 'late',  label: '10–11'   },
];

const SCORE_MINS = [3.0, 3.5, 4.0, 4.5];

// ── Candlestick Chart (lightweight-charts) ────────────────────────────────────

function CandleChart({ candles, trade, loading }) {
  const containerRef  = useRef(null);
  const chartRef      = useRef(null);
  const seriesRef     = useRef(null);
  const priceLinesRef = useRef([]);

  // Create chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: 420,
      layout: { background: { color: C.bg }, textColor: C.dim, fontFamily: C.font },
      grid:   { vertLines: { visible: false }, horzLines: { color: C.chartGrid } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor:        C.chartBull,
      downColor:      C.chartBear,
      borderUpColor:  C.chartBull,
      borderDownColor: C.chartBear,
      wickUpColor:    C.chartBull,
      wickDownColor:  C.chartBear,
    });
    seriesRef.current = series;

    const ro = new ResizeObserver(([e]) => {
      if (chartRef.current) chartRef.current.applyOptions({ width: e.contentRect.width });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
      seriesRef.current = null;
    };
  }, []);

  // Update data + price lines when candles/trade change
  useEffect(() => {
    if (!seriesRef.current || !candles?.length || !trade?.date) return;

    priceLinesRef.current.forEach(pl => { try { seriesRef.current.removePriceLine(pl); } catch {} });
    priceLinesRef.current = [];

    const data = candles
      .map(c => ({ time: toChartTime(c.time, trade.date), open: c.open, high: c.high, low: c.low, close: c.close }))
      .filter(c => c.time != null)
      .sort((a, b) => a.time - b.time);

    seriesRef.current.setData(data);

    const addLine = (price, color, style, width, title) => {
      if (price == null || !seriesRef.current) return;
      try {
        const pl = seriesRef.current.createPriceLine({ price, color, lineStyle: style, lineWidth: width, title, axisLabelVisible: true });
        priceLinesRef.current.push(pl);
      } catch {}
    };

    addLine(trade.orb_high,  C.chartBull, LineStyle.Dashed, 1, 'ORB H');
    addLine(trade.orb_low,   C.chartBull, LineStyle.Dashed, 1, 'ORB L');
    addLine(trade.entry,     C.accent,    LineStyle.Solid,  2, 'Entry');
    addLine(trade.stop,      C.red,       LineStyle.Dashed, 1, 'Stop');
    addLine(trade.target1,   C.accent,    LineStyle.Dashed, 1, 'T1');
    if (trade.target2 != null) addLine(trade.target2, C.accent, LineStyle.Dashed, 1, 'T2');

    // Entry marker — arrow pointing to entry candle with time label
    const entryTime = toChartTime(trade.entry_time, trade.date);
    try {
      if (entryTime != null && trade.entry != null) {
        seriesRef.current.setMarkers([{
          time:     entryTime,
          position: trade.direction === 'LONG' ? 'belowBar' : 'aboveBar',
          color:    C.accent,
          shape:    trade.direction === 'LONG' ? 'arrowUp' : 'arrowDown',
          text:     String(trade.entry_time ?? '').replace(' ET', ''),
          size:     1,
        }]);
      } else {
        seriesRef.current.setMarkers([]);
      }
    } catch {}

    if (chartRef.current) chartRef.current.timeScale().fitContent();
  }, [candles, trade]);

  const showOverlay = loading || !candles?.length;
  const overlayMsg  = loading ? 'Loading chart…' : `No candle data for ${trade?.date ?? '—'}`;

  return (
    <div style={{ position: 'relative', height: 420 }}>
      <div ref={containerRef} style={{ height: 420, borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }} />
      {showOverlay && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`,
          fontFamily: C.font, fontSize: 13, color: C.dim,
        }}>{overlayMsg}</div>
      )}
    </div>
  );
}

// ── Mini Bar Chart (analysis charts) ──────────────────────────────────────────

function SmallBarChart({ title, data, dataKey, color, colorFn }) {
  return (
    <div style={{ ...CARD, padding: '14px 16px' }}>
      <div style={{ ...lbl, marginBottom: 10 }}>{title}</div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tick={{ fontFamily: C.font, fontSize: 9, fill: C.dim }} tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.font, fontSize: 11 }}
            labelStyle={{ color: C.textSub }}
            itemStyle={{ color: C.text }}
          />
          <Bar dataKey={dataKey} radius={[2, 2, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={colorFn ? colorFn(d[dataKey]) : (color || C.accent)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Chart Legend ───────────────────────────────────────────────────────────────

const LEGEND = [
  { color: C.chartBull, dash: true,  label: 'ORB H/L' },
  { color: C.accent,    dash: false, label: 'Entry'   },
  { color: C.red,       dash: true,  label: 'Stop'    },
  { color: C.accent,    dash: true,  label: 'T1/T2'   },
];

function ChartLegend() {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
      {LEGEND.map(({ color, dash, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width={18} height={10} style={{ flexShrink: 0 }}>
            {dash
              ? <line x1={0} y1={5} x2={18} y2={5} stroke={color} strokeWidth={1.5} strokeDasharray="4 2" />
              : <line x1={0} y1={5} x2={18} y2={5} stroke={color} strokeWidth={2} />
            }
          </svg>
          <span style={{ fontFamily: C.font, fontSize: 10, color: C.textSub }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Trade Timeline ─────────────────────────────────────────────────────────────

function TradeTimeline({ trade }) {
  const steps = [
    { label: 'ORB Starts', time: '9:30 ET', done: true },
    { label: 'ORB Locked',  time: '9:44 ET', done: true },
    { label: 'Entry',       time: trade.entry_time ?? '—', done: trade.entry != null, col: C.text },
    { label: 'T1 Hit',      time: trade.c1_exit_time ?? '—', done: trade.c1_pnl != null, col: C.green },
    { label: 'Exit',        time: trade.c2_exit_time ?? trade.c1_exit_time ?? '—', done: true, col: trade.result === 'win' ? C.green : C.red },
  ];

  return (
    <div style={{ ...CARD, padding: '16px 24px', marginTop: 16, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
      {steps.map((s, i) => {
        const col = s.col ?? (s.done ? C.textSub : C.border);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: s.done ? col : C.border,
                border: `1.5px solid ${col}`, marginBottom: 5,
              }} />
              <div style={{ fontFamily: C.font, fontSize: 10, fontWeight: 500, color: col, textAlign: 'center', lineHeight: 1.3 }}>{s.label}</div>
              <div style={{ fontFamily: C.font, fontSize: 10, color: C.dim, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{s.time}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: C.border, marginBottom: 22 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Trade Detail Panels ────────────────────────────────────────────────────────

function Field({ label, value, color }) {
  return (
    <div>
      <div style={{ ...lbl, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: C.font, fontSize: 14, fontWeight: 600, color: color || C.text, fontVariantNumeric: 'tabular-nums' }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...lbl, marginBottom: 12, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function TradeDetails({ trade, cumPnl }) {
  const dirCol = trade.direction === 'LONG' ? C.green : C.red;
  const resCol = trade.result === 'win' ? C.green : trade.result === 'loss' ? C.red : C.textSub;
  const factors = useMemo(() => reconstructFactors(trade), [trade]);
  const gd      = gapDir(trade.gap_pct);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: C.font, fontSize: 11, color: C.dim, marginBottom: 6, letterSpacing: 0.5 }}>
          {trade.date} · {trade.day_of_week}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontFamily: C.fHeading, fontSize: 26, fontWeight: 500, color: dirCol }}>
            ES {trade.direction}
          </span>
          <span style={{
            fontFamily: C.font, fontSize: 10, fontWeight: 600, letterSpacing: 1,
            color: resCol, border: `1px solid ${resCol}`,
            borderRadius: 4, padding: '3px 8px',
          }}>{trade.result?.toUpperCase()}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ ...CARD, padding: '14px 16px' }}>
            <div style={{ ...lbl, marginBottom: 6 }}>Trade P&L</div>
            <div style={{ fontFamily: C.fHeading, fontSize: 24, fontWeight: 500, color: pnlColor(trade.pnl), fontVariantNumeric: 'tabular-nums' }}>
              {(trade.pnl ?? 0) >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}
            </div>
          </div>
          <div style={{ ...CARD, padding: '14px 16px' }}>
            <div style={{ ...lbl, marginBottom: 6 }}>Cumulative P&L</div>
            <div style={{ fontFamily: C.fHeading, fontSize: 20, fontWeight: 500, color: pnlColor(cumPnl), fontVariantNumeric: 'tabular-nums' }}>
              {(cumPnl ?? 0) >= 0 ? '+' : ''}${Math.round(cumPnl).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <Section title="Opening Range">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Field label="ORB High"  value={trade.orb_high?.toFixed(2)}                                          color={C.green} />
          <Field label="ORB Low"   value={trade.orb_low?.toFixed(2)}                                           color={C.red}   />
          <Field label="ORB Range" value={`${trade.orb_range?.toFixed(2)} pts`}                                color={trade.orb_range >= 8 ? C.text : C.accent} />
          <Field label="Gap Dir"   value={gd.toUpperCase()}                                                    color={gd === 'up' ? C.green : gd === 'down' ? C.red : C.dim} />
          <Field label="Gap %"     value={trade.gap_pct != null ? `${trade.gap_pct >= 0 ? '+' : ''}${trade.gap_pct?.toFixed(2)}%` : '—'} />
          <Field label="Score"     value={`${trade.score?.toFixed(1)} / 5`}                                    color={C.accent} />
        </div>
      </Section>

      <Section title="Trade Levels">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Field label="Entry"  value={trade.entry?.toFixed(2)}    color={C.text}   />
          <Field label="Stop"   value={trade.stop?.toFixed(2)}     color={C.red}    />
          <Field label="T1"     value={trade.target1?.toFixed(2)}  color={C.green}  />
          <Field label="T2/EOD" value={trade.target2?.toFixed(2)}  color={C.accent} />
        </div>
      </Section>

      <Section title="Contract Exits">
        {[
          { name: 'C1 — First Contract', type: trade.c1_exit_type, time: trade.c1_exit_time, pts: trade.c1_pts, cpnl: trade.c1_pnl },
          { name: 'C2 — Trail Contract', type: trade.c2_exit_type, time: trade.c2_exit_time, pts: trade.c2_pts, cpnl: trade.c2_pnl },
        ].map(({ name, type, time, pts, cpnl }) => {
          const ec = (cpnl ?? 0) > 0 ? C.green : (cpnl ?? 0) < 0 ? C.red : C.dim;
          return (
            <div key={name} style={{ ...CARD, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ ...lbl, marginBottom: 8 }}>{name}</div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: C.font, fontSize: 11, fontWeight: 600, color: ec,
                  border: `1px solid ${ec}`, borderRadius: 4, padding: '2px 8px',
                }}>{exitLabel(type)}</span>
                {time  && <span style={{ fontFamily: C.font, fontSize: 11, color: C.dim }}>{time} ET</span>}
                {pts   != null && <span style={{ fontFamily: C.font, fontSize: 12, color: ec, fontVariantNumeric: 'tabular-nums' }}>{pts >= 0 ? '+' : ''}{pts?.toFixed(2)} pts</span>}
                {cpnl  != null && <span style={{ fontFamily: C.font, fontSize: 14, fontWeight: 600, color: ec, fontVariantNumeric: 'tabular-nums' }}>{cpnl >= 0 ? '+' : ''}${cpnl?.toFixed(2)}</span>}
              </div>
            </div>
          );
        })}
      </Section>

      <Section title={`Confluence · ${trade.score?.toFixed(1)} / 5`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {factors.map((f, i) => {
            const col = f.good ? C.green : f.good === false ? C.red : C.accent;
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '120px 1fr 48px',
                alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6,
                background: f.good ? '#1B43320A' : f.good === false ? '#722F370A' : '#C9A84C0A',
                borderLeft: `2px solid ${col}`,
              }}>
                <div style={{ fontFamily: C.font, fontSize: 10, color: C.textSub, letterSpacing: 0.5 }}>{f.label}</div>
                <div style={{ fontFamily: C.font, fontSize: 12, color: col }}>{f.text}</div>
                <div style={{ fontFamily: C.font, fontSize: 13, fontWeight: 600, color: col, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {f.pts > 0 ? `+${f.pts}` : '—'}<span style={{ fontSize: 9, color: C.dim }}>/{f.max}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// ── Explorer Page ──────────────────────────────────────────────────────────────

export default function TradeExplorerPage() {
  const [allTrades,   setAllTrades]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filterMode,  setFilterMode]  = useState('all');
  const [dowFilter,   setDowFilter]   = useState('all');
  const [scoreMin,    setScoreMin]    = useState(3.0);
  const [orbFilter,   setOrbFilter]   = useState('all');
  const [entryFilter, setEntryFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [yearFilter,  setYearFilter]  = useState('all');
  const [expandedDate, setExpandedDate] = useState(null);
  const [resolution,  setResolution]  = useState(1);
  const [candles,     setCandles]     = useState([]);
  const [candleLoad,  setCandleLoad]  = useState(false);

  useEffect(() => {
    fetch(`${API}/backtest/ORB/ES`)
      .then(r => r.json())
      .then(d => { setAllTrades(d.trades || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const availableYears = useMemo(() =>
    [...new Set(allTrades.map(t => t.date?.slice(0, 4)))].filter(Boolean).sort(),
  [allTrades]);

  const availableMonths = useMemo(() => {
    const ms = [...new Set(allTrades.map(t => t.date?.slice(5, 7)))].filter(Boolean).sort();
    return ms.map(m => ({ value: m, label: MONTHS[parseInt(m, 10) - 1] }));
  }, [allTrades]);

  const filtered = useMemo(() => {
    let list = allTrades;
    switch (filterMode) {
      case 'winners': list = list.filter(t => t.result === 'win');      break;
      case 'losers':  list = list.filter(t => t.result === 'loss');     break;
      case 'aplus':   list = list.filter(t => (t.score ?? 0) >= 3.5);  break;
    }
    if (dowFilter    !== 'all') list = list.filter(t => t.day_of_week === dowFilter);
    if (scoreMin > 3.0)         list = list.filter(t => (t.score ?? 0) >= scoreMin);
    if (orbFilter    !== 'all') list = list.filter(t => orbBucket4(t.orb_range) === orbFilter);
    if (entryFilter  !== 'all') list = list.filter(t => entryBucket(t.entry_time) === entryFilter);
    if (monthFilter  !== 'all') list = list.filter(t => t.date?.slice(5, 7) === monthFilter);
    if (yearFilter   !== 'all') list = list.filter(t => t.date?.slice(0, 4) === yearFilter);
    return list;
  }, [allTrades, filterMode, dowFilter, scoreMin, orbFilter, entryFilter, monthFilter, yearFilter]);

  const cumPnlMap = useMemo(() => {
    let cum = 0;
    const m = {};
    for (const t of allTrades) { cum += t.pnl; m[t.date] = cum; }
    return m;
  }, [allTrades]);

  // Analysis charts computed from filtered set
  const monthlyPnlData = useMemo(() => {
    const map = {};
    for (const t of filtered) {
      const key = t.date?.slice(0, 7);
      if (key) map[key] = (map[key] || 0) + t.pnl;
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ label: k.slice(5), pnl: Math.round(v) }));
  }, [filtered]);

  const scoreDistData = useMemo(() => {
    const buckets = [
      { label: '3.0–3.4', min: 3.0, max: 3.45 },
      { label: '3.5–3.9', min: 3.5, max: 3.95 },
      { label: '4.0–4.4', min: 4.0, max: 4.45 },
      { label: '4.5+',    min: 4.5, max: 99    },
    ];
    return buckets.map(b => ({ label: b.label, count: filtered.filter(t => t.score >= b.min && t.score < b.max + 0.001).length }));
  }, [filtered]);

  const entryTimeData = useMemo(() => {
    const slots = [
      { label: '9:45–10', min: 585, max: 600 },
      { label: '10–10:30', min: 600, max: 630 },
      { label: '10:30–11', min: 630, max: 660 },
      { label: '11+',      min: 660, max: 1440 },
    ];
    return slots.map(s => ({
      label: s.label,
      count: filtered.filter(t => {
        if (!t.entry_time) return false;
        const [h, m2] = String(t.entry_time).replace(' ET', '').split(':').map(Number);
        if (isNaN(h)) return false;
        const mins = h * 60 + (m2 || 0);
        return mins >= s.min && mins < s.max;
      }).length,
    }));
  }, [filtered]);

  const fetchCandles = (date, res) => {
    setCandleLoad(true);
    setCandles([]);
    fetch(`${API}/candles/ES/${date}?resolution=${res}`)
      .then(r => r.json())
      .then(d => { setCandles(d.candles || []); setCandleLoad(false); })
      .catch(() => { setCandles([]); setCandleLoad(false); });
  };

  const toggleExpand = (date) => {
    if (expandedDate === date) { setExpandedDate(null); setCandles([]); }
    else { setExpandedDate(date); fetchCandles(date, resolution); }
  };

  const changeResolution = (r) => {
    setResolution(r);
    if (expandedDate) fetchCandles(expandedDate, r);
  };

  const resetFilters = () => {
    setFilterMode('all'); setDowFilter('all'); setScoreMin(3.0);
    setOrbFilter('all'); setEntryFilter('all'); setMonthFilter('all'); setYearFilter('all');
    setExpandedDate(null); setCandles([]);
  };

  const hasActiveFilters = filterMode !== 'all' || dowFilter !== 'all' || scoreMin > 3.0
    || orbFilter !== 'all' || entryFilter !== 'all' || monthFilter !== 'all' || yearFilter !== 'all';

  const pilBtn = (active, label, onClick) => (
    <button key={label} onClick={onClick} style={{
      fontFamily: C.font, fontSize: 11, fontWeight: active ? 500 : 400, letterSpacing: 0.3,
      padding: '5px 14px', borderRadius: 20,
      border: `1px solid ${active ? C.accent : C.border}`,
      background: active ? C.panelAlt : 'transparent',
      color: active ? C.text : C.dim,
      cursor: 'pointer', transition: 'all 0.2s ease',
    }}>{label}</button>
  );

  if (loading) return (
    <div style={{ fontFamily: C.font, fontSize: 13, color: C.dim, padding: 80, textAlign: 'center' }}>
      Loading trades…
    </div>
  );

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: C.fHeading, fontSize: 28, fontWeight: 500, color: C.text, lineHeight: 1 }}>
            Trade Explorer
          </div>
          <div style={{ fontFamily: C.font, fontSize: 11, color: C.dim, marginTop: 5 }}>
            {filtered.length} of {allTrades.length} trades
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ fontFamily: C.font, fontSize: 10, color: C.dim, marginRight: 4, letterSpacing: 1, textTransform: 'uppercase' }}>Chart</span>
          {[1, 5].map(r => pilBtn(resolution === r, `${r} min`, () => changeResolution(r)))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...CARD, padding: '14px 20px', marginBottom: 16 }}>
        {/* Row 1: result mode + day of week */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          {FILTER_MODES.map(({ id, label }) =>
            pilBtn(filterMode === id, label, () => { setFilterMode(id); setExpandedDate(null); setCandles([]); })
          )}
          <div style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />
          {[['all','All Days'],['Monday','Mon'],['Tuesday','Tue'],['Wednesday','Wed'],['Thursday','Thu'],['Friday','Fri']].map(([v, l]) =>
            pilBtn(dowFilter === v, l, () => { setDowFilter(v); setExpandedDate(null); setCandles([]); })
          )}
        </div>
        {/* Row 2: ORB size + entry time + score */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ ...lbl, marginRight: 2 }}>ORB</span>
          {ORB_BUCKETS.map(({ id, label }) =>
            pilBtn(orbFilter === id, label, () => { setOrbFilter(id); setExpandedDate(null); setCandles([]); })
          )}
          <div style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />
          <span style={{ ...lbl, marginRight: 2 }}>Entry</span>
          {ENTRY_BUCKETS.map(({ id, label }) =>
            pilBtn(entryFilter === id, label, () => { setEntryFilter(id); setExpandedDate(null); setCandles([]); })
          )}
          <div style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />
          <span style={{ ...lbl, marginRight: 2 }}>Score≥</span>
          {SCORE_MINS.map(s =>
            pilBtn(scoreMin === s, s.toFixed(1), () => { setScoreMin(s); setExpandedDate(null); setCandles([]); })
          )}
        </div>
        {/* Row 3: year + month + reset */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ ...lbl, marginRight: 2 }}>Year</span>
          {pilBtn(yearFilter === 'all', 'All', () => { setYearFilter('all'); setExpandedDate(null); setCandles([]); })}
          {availableYears.map(y =>
            pilBtn(yearFilter === y, y, () => { setYearFilter(y); setExpandedDate(null); setCandles([]); })
          )}
          <div style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />
          <span style={{ ...lbl, marginRight: 2 }}>Month</span>
          {pilBtn(monthFilter === 'all', 'All', () => { setMonthFilter('all'); setExpandedDate(null); setCandles([]); })}
          {availableMonths.map(({ value, label }) =>
            pilBtn(monthFilter === value, label, () => { setMonthFilter(value); setExpandedDate(null); setCandles([]); })
          )}
          {hasActiveFilters && (
            <button onClick={resetFilters} style={{
              marginLeft: 'auto', fontFamily: C.font, fontSize: 11, color: C.dim,
              background: 'none', border: `1px solid ${C.border}`, borderRadius: 20,
              padding: '4px 12px', cursor: 'pointer',
            }}>Reset</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ ...CARD, overflow: 'hidden', padding: 0 }}>
        {/* Header row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '110px 80px 90px 70px 80px 110px 24px',
          padding: '12px 24px', borderBottom: `1px solid ${C.border}`,
          fontFamily: C.font, fontSize: 10, fontWeight: 500,
          letterSpacing: 1.5, textTransform: 'uppercase', color: C.textSub,
        }}>
          {['Date','Day','Direction','Score','Result','P&L',''].map(h => <span key={h}>{h}</span>)}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', fontFamily: C.font, fontSize: 13, color: C.dim }}>
            No trades match this filter
          </div>
        ) : (
          filtered.map((trade) => {
            const isOpen = trade.date === expandedDate;
            const dirCol = trade.direction === 'LONG' ? C.green : C.red;
            const resCol = trade.result === 'win' ? C.green : trade.result === 'loss' ? C.red : C.textSub;
            const pnlCol = pnlColor(trade.pnl ?? 0);
            return (
              <div key={trade.date} style={{ borderBottom: `1px solid ${C.border}` }}>
                {/* Row */}
                <div
                  onClick={() => toggleExpand(trade.date)}
                  style={{
                    display: 'grid', gridTemplateColumns: '110px 80px 90px 70px 80px 110px 24px',
                    padding: '13px 24px', cursor: 'pointer',
                    background: isOpen ? C.panelAlt : 'transparent',
                    transition: 'background 0.15s ease',
                    borderLeft: `3px solid ${resCol}`,
                  }}
                >
                  <span style={{ fontFamily: C.font, fontSize: 12, color: C.textSub, fontVariantNumeric: 'tabular-nums' }}>{trade.date}</span>
                  <span style={{ fontFamily: C.font, fontSize: 12, color: C.dim }}>{trade.day_of_week?.slice(0, 3)}</span>
                  <span style={{ fontFamily: C.font, fontSize: 12, fontWeight: 500, color: dirCol }}>{trade.direction}</span>
                  <span style={{ fontFamily: C.font, fontSize: 12, color: C.accent, fontVariantNumeric: 'tabular-nums' }}>{trade.score?.toFixed(1)}</span>
                  <span style={{ fontFamily: C.font, fontSize: 12, fontWeight: 500, color: resCol }}>{trade.result?.toUpperCase()}</span>
                  <span style={{ fontFamily: C.font, fontSize: 13, fontWeight: 600, color: pnlCol, fontVariantNumeric: 'tabular-nums' }}>
                    {(trade.pnl ?? 0) >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}
                  </span>
                  <span style={{ fontFamily: C.font, fontSize: 14, color: C.dim, lineHeight: 1 }}>{isOpen ? '−' : '+'}</span>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: '24px', background: C.panelAlt }}>
                    {/* Trade details + candle chart */}
                    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 28, alignItems: 'start' }}>
                      <TradeDetails trade={trade} cumPnl={cumPnlMap[trade.date] ?? 0} />
                      <div>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
                        }}>
                          <span style={{ fontFamily: C.fHeading, fontSize: 17, fontWeight: 500, color: C.text }}>
                            ES · {trade.date} · {resolution}-Min
                          </span>
                          <ChartLegend />
                        </div>
                        <CandleChart trade={trade} candles={candles} loading={candleLoad} />
                      </div>
                    </div>

                    {/* Trade timeline */}
                    <TradeTimeline trade={trade} />

                    {/* Analysis charts */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 20 }}>
                      <SmallBarChart
                        title="Monthly P&L"
                        data={monthlyPnlData}
                        dataKey="pnl"
                        colorFn={v => v >= 0 ? C.green : C.red}
                      />
                      <SmallBarChart
                        title="Score Distribution"
                        data={scoreDistData}
                        dataKey="count"
                        color={C.accent}
                      />
                      <SmallBarChart
                        title="Entry Time"
                        data={entryTimeData}
                        dataKey="count"
                        color={C.chartBull}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
