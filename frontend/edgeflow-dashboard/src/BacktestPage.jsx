import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, LabelList,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { C, CARD, API } from './theme';

// ── Helpers ────────────────────────────────────────────────────────────────────

function gapDir(pct) {
  if (pct == null) return 'unknown';
  if (pct > 0.1)  return 'up';
  if (pct < -0.1) return 'down';
  return 'flat';
}

function orbBucket(r) {
  if (r < 10)  return 'small';
  if (r <= 15) return 'medium';
  return 'large';
}

function applyFilters(trades, f) {
  return trades.filter(t => {
    if (f.dow !== 'all'    && t.day_of_week !== f.dow) return false;
    if (f.gapDir !== 'all' && gapDir(t.gap_pct) !== f.gapDir) return false;
    if (f.result !== 'all' && t.result !== f.result) return false;
    if (f.orbSize !== 'all' && orbBucket(t.orb_range) !== f.orbSize) return false;
    if (t.score < f.scoreMin) return false;
    if (f.vwap !== 'all') {
      const above = t.above_vwap === 1 || t.above_vwap === true;
      if (f.vwap === 'above' && !above) return false;
      if (f.vwap === 'below' && above)  return false;
    }
    return true;
  });
}

function calcStats(trades) {
  if (!trades.length) return null;
  const winners  = trades.filter(t => t.result === 'win');
  const losers   = trades.filter(t => t.result === 'loss');
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate  = winners.length / trades.length * 100;
  const avgWin   = winners.length ? winners.reduce((s, t) => s + t.pnl, 0) / winners.length : 0;
  const avgLoss  = losers.length  ? losers.reduce((s, t) => s + t.pnl, 0) / losers.length  : 0;
  const grossW   = winners.reduce((s, t) => s + t.pnl, 0);
  const grossL   = losers.reduce((s, t) => s + t.pnl, 0);
  const pf       = losers.length && grossL !== 0 ? Math.abs(grossW / grossL) : 999;

  let cum = 0, peak = 0, maxDD = 0;
  const cumulative = trades.map(t => {
    cum += t.pnl;
    if (cum > peak) peak = cum;
    const dd = cum - peak;
    if (dd < maxDD) maxDD = dd;
    return { date: t.date?.slice(5) ?? '', pnl: Math.round(cum) };
  });

  return { total: trades.length, winners: winners.length, losers: losers.length,
           totalPnl, winRate, avgWin, avgLoss, pf, maxDD, cumulative };
}

function groupWinRate(trades, keyFn, groups) {
  return groups.map(({ key, label }) => {
    const subset = trades.filter(t => keyFn(t) === key);
    const wins   = subset.filter(t => t.result === 'win').length;
    return {
      label,
      winRate: subset.length ? Math.round(wins / subset.length * 100) : 0,
      n: subset.length,
      pnl: Math.round(subset.reduce((s, t) => s + t.pnl, 0)),
    };
  });
}

// ── Typography helpers ─────────────────────────────────────────────────────────

const label11 = { fontFamily: C.font, fontSize: 10, fontWeight: 500, letterSpacing: 1.5, textTransform: 'uppercase', color: C.textSub };
const data13  = { fontFamily: C.font, fontSize: 13, fontVariantNumeric: 'tabular-nums' };

// ── Tooltip ────────────────────────────────────────────────────────────────────

const TT = {
  contentStyle: {
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 8, fontFamily: C.font, fontSize: 12, color: C.text,
    boxShadow: '0 4px 16px rgba(44,44,44,0.08)',
  },
  itemStyle:  { color: C.text },
  labelStyle: { color: C.textSub, fontSize: 11 },
  cursor:     { fill: 'rgba(232,227,217,0.25)' },
};

// ── Filter bar ─────────────────────────────────────────────────────────────────

const INIT = { dow: 'all', gapDir: 'all', result: 'all', orbSize: 'all', scoreMin: 0, vwap: 'all' };

function FilterBar({ filters, setFilters, total, filtered }) {
  const pill = (key, val, label) => {
    const on = filters[key] === val;
    return (
      <button key={val} onClick={() => setFilters(f => ({ ...f, [key]: val }))} style={{
        fontFamily: C.font, fontSize: 11, fontWeight: on ? 500 : 400, letterSpacing: 0.3,
        padding: '4px 13px', borderRadius: 20,
        border: `1px solid ${on ? C.accent : C.border}`,
        background: on ? C.panelAlt : 'transparent',
        color: on ? C.text : C.dim,
        cursor: 'pointer', transition: 'all 0.2s ease',
      }}>{label}</button>
    );
  };

  return (
    <div style={{ ...CARD, padding: '14px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ ...label11, marginRight: 4 }}>Day</span>
          {[['all','All'],['Monday','Mon'],['Tuesday','Tue'],['Wednesday','Wed'],['Thursday','Thu'],['Friday','Fri']].map(([v,l]) => pill('dow', v, l))}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ ...label11, marginRight: 4 }}>Gap</span>
          {[['all','All'],['up','Up'],['down','Down'],['flat','Flat']].map(([v,l]) => pill('gapDir', v, l))}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ ...label11, marginRight: 4 }}>Result</span>
          {[['all','All'],['win','Win'],['loss','Loss']].map(([v,l]) => pill('result', v, l))}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ ...label11, marginRight: 4 }}>ORB</span>
          {[['all','All'],['small','<10'],['medium','10-15'],['large','>15']].map(([v,l]) => pill('orbSize', v, l))}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ ...label11, marginRight: 4 }}>Score≥</span>
          {[[0,'All'],[3,'3.0'],[3.5,'3.5'],[4,'4.0'],[4.5,'4.5']].map(([v,l]) => pill('scoreMin', v, l))}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ ...label11, marginRight: 4 }}>VWAP</span>
          {[['all','All'],['above','Above'],['below','Below']].map(([v,l]) => pill('vwap', v, l))}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          <span style={{ ...label11 }}>{filtered} / {total} trades</span>
          <button onClick={() => setFilters(INIT)} style={{
            fontFamily: C.font, fontSize: 11, color: C.dim,
            background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 20, padding: '4px 12px', cursor: 'pointer',
          }}>Reset</button>
        </div>
      </div>
    </div>
  );
}

// ── KPI Cards ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, color, sub }) {
  return (
    <div style={{ ...CARD, padding: '20px 22px', flex: 1, minWidth: 110 }}>
      <div style={{ ...label11, marginBottom: 10 }}>{label}</div>
      <div style={{
        fontFamily: C.fHeading, fontSize: 28, fontWeight: 500, lineHeight: 1,
        color: color || C.text, fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      {sub && <div style={{ fontFamily: C.font, fontSize: 11, color: C.dim, marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

// ── Chart panels ───────────────────────────────────────────────────────────────

const AXIS = {
  axisLine: false, tickLine: false,
  tick: { fill: C.textSub, fontSize: 10, fontFamily: C.font },
};

function ChartCard({ title, sub, height = 200, children }) {
  return (
    <div style={{ ...CARD, padding: '20px 24px' }}>
      {sub && <div style={{ ...label11, marginBottom: 4 }}>{sub}</div>}
      <div style={{ fontFamily: C.fHeading, fontSize: 18, fontWeight: 500, color: C.text, marginBottom: 16 }}>{title}</div>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function barColor(wr) {
  if (wr >= 75) return C.green;
  if (wr >= 60) return C.accent;
  if (wr >= 45) return C.textSub;
  return C.red;
}

// ── BacktestPage ───────────────────────────────────────────────────────────────

export default function BacktestPage() {
  const [trades,  setTrades]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters,    setFilters]    = useState(INIT);
  const [wedData,    setWedData]    = useState(null);
  const [wedLoading, setWedLoading] = useState(false);

  const loadWednesday = () => {
    setWedLoading(true);
    fetch(`${API}/backtest/wednesday/ES`)
      .then(r => r.json())
      .then(d => { setWedData(d); setWedLoading(false); })
      .catch(() => setWedLoading(false));
  };

  useEffect(() => {
    fetch(`${API}/backtest/ORB/ES`)
      .then(r => r.json())
      .then(d => { setTrades(d.trades || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => applyFilters(trades, filters), [trades, filters]);
  const stats    = useMemo(() => calcStats(filtered), [filtered]);

  const dowData = useMemo(() => groupWinRate(filtered, t => t.day_of_week, [
    { key: 'Monday', label: 'Mon' }, { key: 'Tuesday', label: 'Tue' },
    { key: 'Wednesday', label: 'Wed' }, { key: 'Thursday', label: 'Thu' }, { key: 'Friday', label: 'Fri' },
  ]), [filtered]);

  const gapData = useMemo(() => groupWinRate(filtered, t => gapDir(t.gap_pct), [
    { key: 'up', label: 'Gap Up' }, { key: 'down', label: 'Gap Dn' }, { key: 'flat', label: 'Flat' },
  ]), [filtered]);

  const orbData = useMemo(() => groupWinRate(filtered, t => orbBucket(t.orb_range), [
    { key: 'small', label: '<10 pts' }, { key: 'medium', label: '10–15' }, { key: 'large', label: '>15' },
  ]), [filtered]);

  const vwapData = useMemo(() => groupWinRate(filtered,
    t => (t.above_vwap === 1 || t.above_vwap === true) ? 'above' : 'below',
    [{ key: 'above', label: 'Above' }, { key: 'below', label: 'Below' }]
  ), [filtered]);

  // ── New analytical memos ───────────────────────────────────────────────────

  const scoreBucketData = useMemo(() => {
    const buckets = [
      { label: '3.0–3.4', min: 3.0, max: 3.5 },
      { label: '3.5–3.9', min: 3.5, max: 4.0 },
      { label: '4.0–4.4', min: 4.0, max: 4.5 },
      { label: '4.5+',    min: 4.5, max: 99   },
    ];
    return buckets.map(b => {
      const sub  = filtered.filter(t => t.score >= b.min && t.score < b.max);
      const wins = sub.filter(t => t.result === 'win').length;
      return { label: b.label, winRate: sub.length ? Math.round(wins / sub.length * 100) : 0, n: sub.length };
    });
  }, [filtered]);

  const drawdownData = useMemo(() => {
    let cum = 0, peak = 0;
    return filtered.map(t => {
      cum += t.pnl;
      if (cum > peak) peak = cum;
      return { date: t.date?.slice(5) ?? '', dd: Math.round(cum - peak) };
    });
  }, [filtered]);

  const minDD = useMemo(() =>
    drawdownData.reduce((mn, d) => d.dd < mn ? d.dd : mn, 0),
  [drawdownData]);

  const allMonths = useMemo(() => {
    if (!trades.length) return [];
    const first = trades[0].date?.slice(0, 7) ?? '2024-01';
    const last  = trades[trades.length - 1].date?.slice(0, 7) ?? first;
    const months = [];
    let [y, m] = first.split('-').map(Number);
    const [ey, em] = last.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
      m++; if (m > 12) { m = 1; y++; }
    }
    return months;
  }, [trades]);

  const monthlyStats = useMemo(() => {
    const pnlMap = {};
    for (const t of filtered) {
      const k = t.date?.slice(0, 7);
      if (k) pnlMap[k] = (pnlMap[k] || 0) + t.pnl;
    }
    const entries = allMonths.map(m => ({ month: m, pnl: Math.round(pnlMap[m] || 0) }));
    const withPnl = entries.filter(e => e.pnl !== 0);
    const best    = withPnl.length ? withPnl.reduce((b, e) => e.pnl > b.pnl ? e : b) : null;
    const worst   = withPnl.length ? withPnl.reduce((w, e) => e.pnl < w.pnl ? e : w) : null;
    const maxAbs  = entries.reduce((mx, e) => Math.abs(e.pnl) > mx ? Math.abs(e.pnl) : mx, 1);
    return { entries, best, worst, maxAbs };
  }, [allMonths, filtered]);

  const dayAvgData = useMemo(() =>
    ['Monday','Tuesday','Thursday','Friday'].map(day => {
      const sub  = filtered.filter(t => t.day_of_week === day);
      const wins = sub.filter(t => t.result === 'win');
      const lose = sub.filter(t => t.result === 'loss');
      return {
        label:   day.slice(0, 3),
        avgWin:  wins.length ? Math.round(wins.reduce((s, t) => s + t.pnl, 0) / wins.length) : 0,
        avgLoss: lose.length ? Math.round(lose.reduce((s, t) => s + t.pnl, 0) / lose.length) : 0,
        n: sub.length,
      };
    }),
  [filtered]);

  const entryTimeData = useMemo(() => {
    const slots = [
      { label: 'Early', sub: '9:45–10:00', lo: 585, hi: 600 },
      { label: 'Late',  sub: '10:00–11:00', lo: 600, hi: 660 },
    ];
    return slots.map(s => {
      const sub  = filtered.filter(t => {
        if (!t.entry_time) return false;
        const [h, m2] = String(t.entry_time).replace(' ET', '').split(':').map(Number);
        if (isNaN(h)) return false;
        const mins = h * 60 + (m2 || 0);
        return mins >= s.lo && mins < s.hi;
      });
      const wins = sub.filter(t => t.result === 'win').length;
      return { label: s.label, sub: s.sub, winRate: sub.length ? Math.round(wins / sub.length * 100) : 0, n: sub.length };
    });
  }, [filtered]);

  if (loading) return (
    <div style={{ fontFamily: C.font, fontSize: 13, color: C.dim, padding: 80, textAlign: 'center' }}>
      Loading performance data…
    </div>
  );

  const s = stats;
  const pnlCol = s && s.totalPnl >= 0 ? C.green : C.red;

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: C.fHeading, fontSize: 28, fontWeight: 500, color: C.text, lineHeight: 1 }}>
            Performance Analysis
          </div>
          <div style={{ fontFamily: C.font, fontSize: 11, color: C.dim, marginTop: 5, letterSpacing: 0.5 }}>
            ES · ORB · Scenario B · 2-Year Backtest
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['Trail Stop → EOD', '2 ES Contracts', 'Apex $150K', 'Scenario B'].map(tag => (
            <span key={tag} style={{
              fontFamily: C.font, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
              color: C.textSub, border: `1px solid ${C.border}`, borderRadius: 4, padding: '3px 9px',
            }}>{tag}</span>
          ))}
        </div>
      </div>

      <FilterBar filters={filters} setFilters={setFilters} total={trades.length} filtered={filtered.length} />

      {!s ? (
        <div style={{ ...CARD, padding: 48, textAlign: 'center', color: C.dim, fontFamily: C.font, fontSize: 14 }}>
          No trades match this filter
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <KPICard label="Total Trades"  value={s.total}                                               sub={`${s.winners}W · ${s.losers}L`} />
            <KPICard label="Win Rate"      value={`${s.winRate.toFixed(1)}%`}                            color={C.green} />
            <KPICard label="Total P&L"     value={`${s.totalPnl >= 0 ? '+' : ''}$${Math.round(s.totalPnl).toLocaleString()}`} color={pnlCol} />
            <KPICard label="Avg Winner"    value={`+$${Math.round(s.avgWin).toLocaleString()}`}          color={C.green} />
            <KPICard label="Avg Loser"     value={`−$${Math.abs(Math.round(s.avgLoss)).toLocaleString()}`} color={C.red} />
            <KPICard label="Profit Factor" value={s.pf === 999 ? '∞' : s.pf.toFixed(2)}                 color={C.accent} />
            <KPICard label="Max Drawdown"  value={`−$${Math.abs(Math.round(s.maxDD)).toLocaleString()}`} color={C.red} />
          </div>

          {/* Cumulative P&L */}
          <div style={{ marginBottom: 20 }}>
            <ChartCard title="Cumulative P&L" sub="Growth Curve" height={260}>
              <AreaChart data={s.cumulative}>
                <defs>
                  <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.chartLine} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={C.chartLine} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" {...AXIS} interval={Math.floor(s.cumulative.length / 8)} />
                <YAxis {...AXIS} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...TT} formatter={v => [`$${v.toLocaleString()}`, 'Cumulative P&L']} />
                <ReferenceLine y={0} stroke={C.border} strokeDasharray="4 2" />
                <Area type="monotone" dataKey="pnl"
                  stroke={C.chartLine} fill="url(#goldGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ChartCard>
          </div>

          {/* Win rate charts — 2×2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <ChartCard title="Win Rate by Day" sub="Day Edge" height={200}>
              <BarChart data={dowData} margin={{ top: 18 }}>
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip {...TT}
                  formatter={(v, n) => [n === 'winRate' ? `${v}%` : `$${v.toLocaleString()}`, n === 'winRate' ? 'Win Rate' : 'P&L']} />
                <ReferenceLine y={50} stroke={C.border} strokeDasharray="3 3" />
                <Bar dataKey="winRate" name="winRate" radius={[3,3,0,0]}>
                  {dowData.map((d, i) => <Cell key={i} fill={barColor(d.winRate)} />)}
                  <LabelList dataKey="winRate" position="top" formatter={v => v > 0 ? `${v}%` : ''} style={{ fontFamily: C.font, fontSize: 10, fill: C.textSub }} />
                </Bar>
              </BarChart>
            </ChartCard>

            <ChartCard title="Win Rate by Gap Direction" sub="Gap Alignment" height={200}>
              <BarChart data={gapData} margin={{ top: 18 }}>
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip {...TT}
                  formatter={(v, n) => [n === 'winRate' ? `${v}%` : `$${v.toLocaleString()}`, n === 'winRate' ? 'Win Rate' : 'P&L']} />
                <ReferenceLine y={50} stroke={C.border} strokeDasharray="3 3" />
                <Bar dataKey="winRate" name="winRate" radius={[3,3,0,0]}>
                  {gapData.map((d, i) => <Cell key={i} fill={barColor(d.winRate)} />)}
                  <LabelList dataKey="winRate" position="top" formatter={v => v > 0 ? `${v}%` : ''} style={{ fontFamily: C.font, fontSize: 10, fill: C.textSub }} />
                </Bar>
              </BarChart>
            </ChartCard>

            <ChartCard title="Win Rate by ORB Size" sub="Range Bucket" height={200}>
              <BarChart data={orbData} margin={{ top: 18 }}>
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip {...TT}
                  formatter={(v, n) => [n === 'winRate' ? `${v}%` : `$${v.toLocaleString()}`, n === 'winRate' ? 'Win Rate' : 'P&L']} />
                <ReferenceLine y={50} stroke={C.border} strokeDasharray="3 3" />
                <Bar dataKey="winRate" name="winRate" radius={[3,3,0,0]}>
                  {orbData.map((d, i) => <Cell key={i} fill={barColor(d.winRate)} />)}
                  <LabelList dataKey="winRate" position="top" formatter={v => v > 0 ? `${v}%` : ''} style={{ fontFamily: C.font, fontSize: 10, fill: C.textSub }} />
                </Bar>
              </BarChart>
            </ChartCard>

            <ChartCard title="Win Rate by VWAP Position" sub="VWAP Context" height={200}>
              <BarChart data={vwapData} margin={{ top: 18 }}>
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip {...TT}
                  formatter={(v, n) => [n === 'winRate' ? `${v}%` : `$${v.toLocaleString()}`, n === 'winRate' ? 'Win Rate' : 'P&L']} />
                <ReferenceLine y={50} stroke={C.border} strokeDasharray="3 3" />
                <Bar dataKey="winRate" name="winRate" radius={[3,3,0,0]}>
                  {vwapData.map((d, i) => <Cell key={i} fill={barColor(d.winRate)} />)}
                  <LabelList dataKey="winRate" position="top" formatter={v => v > 0 ? `${v}%` : ''} style={{ fontFamily: C.font, fontSize: 10, fill: C.textSub }} />
                </Bar>
              </BarChart>
            </ChartCard>
          </div>

          {/* P&L by Day */}
          <ChartCard title="Total P&L by Day of Week" sub="Day P&L" height={180}>
            <BarChart data={dowData}>
              <XAxis dataKey="label" {...AXIS} />
              <YAxis {...AXIS} tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
              <Tooltip {...TT} formatter={v => [`$${v.toLocaleString()}`, 'P&L']} />
              <ReferenceLine y={0} stroke={C.border} />
              <Bar dataKey="pnl" radius={[3,3,0,0]}>
                {dowData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? C.green : C.red} />)}
              </Bar>
            </BarChart>
          </ChartCard>

          {/* ── Section divider ──────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, margin: '32px 0 24px' }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{ fontFamily: C.fHeading, fontSize: 13, color: C.dim, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Analytical Deep Dive
            </span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          {/* ── Section A — Win Rate by Score Bucket ─────────────────────── */}
          <div style={{ ...CARD, padding: '20px 24px', marginBottom: 16 }}>
            <div style={{ ...label11, marginBottom: 4 }}>Score Edge — Most Actionable</div>
            <div style={{ fontFamily: C.fHeading, fontSize: 18, fontWeight: 500, color: C.text, marginBottom: 16 }}>
              Win Rate by Confluence Score
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreBucketData} margin={{ top: 26 }}>
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip {...TT}
                  formatter={(v, n) => [n === 'winRate' ? `${v}%` : v, n === 'winRate' ? 'Win Rate' : 'Trades']}
                  labelFormatter={l => {
                    const d = scoreBucketData.find(x => x.label === l);
                    return `Score ${l} · n=${d?.n ?? 0}`;
                  }}
                />
                <ReferenceLine y={50} stroke={C.border} strokeDasharray="3 3" />
                <Bar dataKey="winRate" name="winRate" radius={[3,3,0,0]}>
                  {scoreBucketData.map((d, i) => <Cell key={i} fill={barColor(d.winRate)} />)}
                  <LabelList dataKey="winRate" position="top" formatter={v => v > 0 ? `${v}%` : ''}
                    style={{ fontFamily: C.font, fontSize: 11, fontWeight: 600, fill: C.textSub }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', marginTop: 4 }}>
              {scoreBucketData.map(d => (
                <div key={d.label} style={{ flex: 1, textAlign: 'center', fontFamily: C.font, fontSize: 10, color: C.dim }}>
                  n={d.n}
                </div>
              ))}
            </div>
          </div>

          {/* ── Section B — Drawdown Curve ───────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <ChartCard title="Running Drawdown" sub="Equity Risk" height={220}>
              <AreaChart data={drawdownData}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.red} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={C.red} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" {...AXIS} interval={Math.max(Math.floor(drawdownData.length / 8), 1)} />
                <YAxis {...AXIS} domain={[minDD * 1.18, Math.max(-minDD * 0.08, 500)]}
                  tickFormatter={v => v < 0 ? `−$${Math.abs(v / 1000).toFixed(0)}k` : '$0'} />
                <Tooltip {...TT} formatter={v => [`${v <= 0 ? '−' : '+'}$${Math.abs(v).toLocaleString()}`, 'Drawdown']} />
                <ReferenceLine y={0} stroke={C.border} />
                {minDD < 0 && (
                  <ReferenceLine y={minDD} stroke={C.red} strokeDasharray="4 2" strokeWidth={1}
                    label={{ value: `Max DD: −$${Math.abs(minDD).toLocaleString()}`, position: 'insideTopRight', fill: C.red, fontSize: 10, fontFamily: C.font }} />
                )}
                <Area type="monotone" dataKey="dd"
                  stroke={C.red} fill="url(#ddGrad)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ChartCard>
          </div>

          {/* ── Section C — Monthly P&L Calendar ─────────────────────────── */}
          <div style={{ ...CARD, padding: '20px 24px', marginBottom: 16 }}>
            <div style={{ ...label11, marginBottom: 4 }}>Month by Month</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
              <div style={{ fontFamily: C.fHeading, fontSize: 18, fontWeight: 500, color: C.text }}>
                Monthly P&L
              </div>
              <div style={{ display: 'flex', gap: 16, fontFamily: C.font, fontSize: 11 }}>
                {monthlyStats.best && (
                  <span style={{ color: C.green }}>
                    Best: {monthlyStats.best.month} +${monthlyStats.best.pnl.toLocaleString()}
                  </span>
                )}
                {monthlyStats.worst && (
                  <span style={{ color: C.red }}>
                    Worst: {monthlyStats.worst.month} −${Math.abs(monthlyStats.worst.pnl).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
              {monthlyStats.entries.map(({ month, pnl }) => {
                const [y, m] = month.split('-');
                const mnLabel = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m,10)-1];
                const isBest  = monthlyStats.best?.month === month;
                const isWorst = monthlyStats.worst?.month === month;
                const a = Math.min(Math.abs(pnl) / monthlyStats.maxAbs, 1);
                const bg = pnl > 0
                  ? `rgba(27,67,50,${0.09 + a * 0.78})`
                  : pnl < 0
                    ? `rgba(114,47,55,${0.09 + a * 0.78})`
                    : C.panelAlt;
                const textCol = a > 0.42 ? '#F8F8F0' : C.text;
                const subCol  = a > 0.42 ? 'rgba(248,248,240,0.7)' : C.dim;
                return (
                  <div key={month} style={{
                    background: bg, borderRadius: 6, padding: '10px 12px',
                    border: (isBest || isWorst) ? `1.5px solid ${pnl >= 0 ? C.green : C.red}` : `1px solid transparent`,
                    position: 'relative',
                  }}>
                    <div style={{ fontFamily: C.font, fontSize: 10, color: subCol, marginBottom: 4 }}>
                      {mnLabel} {y}
                    </div>
                    <div style={{ fontFamily: C.fHeading, fontSize: 15, fontWeight: 500, color: textCol, fontVariantNumeric: 'tabular-nums' }}>
                      {pnl === 0 ? '—' : `${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toLocaleString()}`}
                    </div>
                    {(isBest || isWorst) && (
                      <div style={{ fontFamily: C.font, fontSize: 8, color: subCol, marginTop: 3, letterSpacing: 1, textTransform: 'uppercase' }}>
                        {isBest ? 'Best' : 'Worst'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Sections D + E side by side ──────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

            {/* Section D — Avg Winner vs Loser by Day */}
            <div style={{ ...CARD, padding: '20px 24px' }}>
              <div style={{ ...label11, marginBottom: 4 }}>Risk Sizing by Day</div>
              <div style={{ fontFamily: C.fHeading, fontSize: 18, fontWeight: 500, color: C.text, marginBottom: 8 }}>
                Avg Winner vs Loser by Day
              </div>
              <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
                {[{ col: C.green, label: 'Avg Win' }, { col: C.red, label: 'Avg Loss' }].map(({ col, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: col }} />
                    <span style={{ fontFamily: C.font, fontSize: 10, color: C.textSub }}>{label}</span>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dayAvgData} barGap={3} barCategoryGap="28%">
                  <XAxis dataKey="label" {...AXIS} />
                  <YAxis {...AXIS} tickFormatter={v => `${v >= 0 ? '' : '−'}$${Math.abs(v / 1000).toFixed(1)}k`} />
                  <Tooltip {...TT}
                    formatter={(v, n) => [`${v >= 0 ? '+' : ''}$${v.toLocaleString()}`, n === 'avgWin' ? 'Avg Winner' : 'Avg Loser']}
                  />
                  <ReferenceLine y={0} stroke={C.border} />
                  <Bar dataKey="avgWin"  name="avgWin"  fill={C.green} radius={[3,3,0,0]}>
                    <LabelList dataKey="avgWin" position="top"
                      formatter={v => v > 0 ? `+$${(v/1000).toFixed(1)}k` : ''}
                      style={{ fontFamily: C.font, fontSize: 9, fill: C.textSub }} />
                  </Bar>
                  <Bar dataKey="avgLoss" name="avgLoss" fill={C.red} radius={[0,0,3,3]}>
                    <LabelList dataKey="avgLoss" position="bottom"
                      formatter={v => v < 0 ? `−$${(Math.abs(v)/1000).toFixed(1)}k` : ''}
                      style={{ fontFamily: C.font, fontSize: 9, fill: C.red }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Section E — Entry Time Analysis */}
            <div style={{ ...CARD, padding: '20px 24px' }}>
              <div style={{ ...label11, marginBottom: 4 }}>Timing Edge</div>
              <div style={{ fontFamily: C.fHeading, fontSize: 18, fontWeight: 500, color: C.text, marginBottom: 16 }}>
                Win Rate by Entry Time
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={entryTimeData} margin={{ top: 26 }} barCategoryGap="40%">
                  <XAxis dataKey="label" {...AXIS} />
                  <YAxis {...AXIS} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip {...TT}
                    formatter={(v, n) => [`${v}%`, 'Win Rate']}
                    labelFormatter={l => {
                      const d = entryTimeData.find(x => x.label === l);
                      return `${l} (${d?.sub}) · n=${d?.n ?? 0}`;
                    }}
                  />
                  <ReferenceLine y={50} stroke={C.border} strokeDasharray="3 3" />
                  <Bar dataKey="winRate" name="winRate" radius={[3,3,0,0]}>
                    {entryTimeData.map((d, i) => <Cell key={i} fill={barColor(d.winRate)} />)}
                    <LabelList dataKey="winRate" position="top" formatter={v => v > 0 ? `${v}%` : ''}
                      style={{ fontFamily: C.font, fontSize: 13, fontWeight: 600, fill: C.textSub }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', marginTop: 4 }}>
                {entryTimeData.map(d => (
                  <div key={d.label} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: C.font, fontSize: 10, color: C.dim }}>{d.sub}</div>
                    <div style={{ fontFamily: C.font, fontSize: 10, color: C.dim }}>n={d.n}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Wednesday Research ──────────────────────────────────────────────── */}
      <div style={{ marginTop: 40, borderTop: `2px dashed ${C.border}`, paddingTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: C.fHeading, fontSize: 22, fontWeight: 500, color: C.textSub }}>
              Wednesday Research
            </div>
            <div style={{ fontFamily: C.font, fontSize: 11, color: C.dim, marginTop: 4, letterSpacing: 0.5 }}>
              Excluded from proven edge · These are simulation results only — all marked NO TRADE
            </div>
          </div>
          {!wedData && (
            <button
              onClick={loadWednesday}
              disabled={wedLoading}
              style={{
                fontFamily: C.font, fontSize: 12, fontWeight: 500,
                padding: '9px 20px', borderRadius: 6,
                border: `1px solid ${C.border}`,
                background: wedLoading ? C.panelAlt : C.panel,
                color: wedLoading ? C.dim : C.textSub,
                cursor: wedLoading ? 'default' : 'pointer',
              }}
            >
              {wedLoading ? 'Loading…' : 'Load Wednesday Simulation'}
            </button>
          )}
        </div>

        {wedData && wedData.summary && (
          <>
            {/* Summary KPIs */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              {[
                { label: 'Simulated Trades', value: wedData.summary.total },
                { label: 'Sim Wins',         value: wedData.summary.wins,    color: C.textSub },
                { label: 'Sim Losses',       value: wedData.summary.losses,  color: C.textSub },
                { label: 'Sim Win Rate',     value: `${wedData.summary.winRate}%`, color: C.textSub },
                { label: 'Sim Total P&L',    value: `${wedData.summary.totalPnl >= 0 ? '+' : ''}$${Math.round(wedData.summary.totalPnl).toLocaleString()}`, color: wedData.summary.totalPnl >= 0 ? C.textSub : C.textSub },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ ...CARD, padding: '16px 20px', flex: 1, minWidth: 100, opacity: 0.75 }}>
                  <div style={{ ...label11, marginBottom: 8 }}>{label}</div>
                  <div style={{ fontFamily: C.fHeading, fontSize: 22, fontWeight: 500, color: color || C.dim, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Trade list */}
            <div style={{ ...CARD, overflow: 'hidden', padding: 0 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '110px 80px 80px 90px 90px 90px 100px',
                padding: '10px 20px', borderBottom: `1px solid ${C.border}`,
                fontFamily: C.font, fontSize: 10, fontWeight: 500,
                letterSpacing: 1.5, textTransform: 'uppercase', color: C.dim,
              }}>
                {['Date','Dir','Range','Entry','Stop','T1','Sim P&L'].map(h => <span key={h}>{h}</span>)}
              </div>
              {wedData.trades.slice(0, 30).map((t, i) => {
                const pCol = t.pnl >= 0 ? C.textSub : C.textSub;
                return (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '110px 80px 80px 90px 90px 90px 100px',
                    padding: '11px 20px', borderBottom: `1px solid ${C.border}`,
                    borderLeft: `3px solid ${C.border}`,
                    opacity: 0.7,
                  }}>
                    <span style={{ fontFamily: C.font, fontSize: 12, color: C.textSub, fontVariantNumeric: 'tabular-nums' }}>{t.date}</span>
                    <span style={{ fontFamily: C.font, fontSize: 12, color: C.dim }}>{t.direction}</span>
                    <span style={{ fontFamily: C.font, fontSize: 12, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>{t.orb_range?.toFixed(1)} pts</span>
                    <span style={{ fontFamily: C.font, fontSize: 12, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>{t.entry?.toFixed(2)}</span>
                    <span style={{ fontFamily: C.font, fontSize: 12, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>{t.stop?.toFixed(2)}</span>
                    <span style={{ fontFamily: C.font, fontSize: 12, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>{t.target1?.toFixed(2)}</span>
                    <span style={{ fontFamily: C.font, fontSize: 12, fontWeight: 500, color: pCol, fontVariantNumeric: 'tabular-nums' }}>
                      {t.pnl >= 0 ? '+' : ''}${t.pnl?.toFixed(2)}
                    </span>
                  </div>
                );
              })}
              {wedData.trades.length > 30 && (
                <div style={{ padding: '12px 20px', fontFamily: C.font, fontSize: 11, color: C.dim, textAlign: 'center' }}>
                  +{wedData.trades.length - 30} more rows · simulation only
                </div>
              )}
            </div>
          </>
        )}

        {wedData && !wedData.summary && (
          <div style={{ ...CARD, padding: 32, textAlign: 'center', fontFamily: C.font, fontSize: 13, color: C.dim }}>
            No Wednesday ORB setups found in data range
          </div>
        )}
      </div>
    </div>
  );
}
