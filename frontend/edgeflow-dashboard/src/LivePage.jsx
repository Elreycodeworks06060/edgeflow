import { useState, useEffect, useCallback } from 'react';
import { C, CARD, API } from './theme';

// ── Helpers ────────────────────────────────────────────────────────────────────

const lbl = { fontFamily: C.font, fontSize: 10, fontWeight: 500, letterSpacing: 1.5, textTransform: 'uppercase', color: C.textSub };

function pnlColor(v) { return v > 50 ? C.green : v < -50 ? C.red : C.textSub; }

function timeToEOD() {
  const now = new Date(), eod = new Date();
  eod.setHours(15, 55, 0, 0);
  const ms = eod - now;
  if (ms <= 0) return 'Closed';
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Shared card ────────────────────────────────────────────────────────────────

function Card({ children, style = {}, accent }) {
  return (
    <div style={{
      ...CARD,
      ...(accent ? { borderTop: `2px solid ${accent}` } : {}),
      padding: '20px 22px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return <div style={{ ...lbl, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>{children}</div>;
}

function Field({ label, value, color }) {
  return (
    <div>
      <div style={{ ...lbl, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: C.font, fontSize: 15, fontWeight: 600, color: color || C.text, fontVariantNumeric: 'tabular-nums' }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

// ── Status Strip ───────────────────────────────────────────────────────────────

function StatusStrip({ status }) {
  if (!status) return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: C.font, fontSize: 13, color: C.dim }}>Connecting to algo engine…</div>
    </Card>
  );

  const { armed, disarm_reason, daily_pnl = 0, trades_taken = 0, consecutive_losses = 0, config = {} } = status;
  const col = armed ? C.green : C.red;

  return (
    <Card accent={col} style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
          background: col, animation: armed ? 'armPulse 2s infinite' : 'none', flexShrink: 0,
        }} />
        <span style={{ fontFamily: C.fHeading, fontSize: 20, fontWeight: 500, color: col }}>
          {armed ? 'Armed' : 'Disarmed'}
        </span>
        {!armed && disarm_reason && (
          <span style={{ fontFamily: C.font, fontSize: 12, color: C.textSub, marginLeft: 4 }}>— {disarm_reason}</span>
        )}
      </div>

      {[
        { label: 'Daily P&L',   val: `${daily_pnl >= 0 ? '+' : ''}$${daily_pnl.toFixed(2)}`, col: pnlColor(daily_pnl) },
        { label: 'Trades',      val: trades_taken,                                             col: C.text    },
        { label: 'Consec Loss', val: consecutive_losses,                                        col: consecutive_losses >= 2 ? C.red : C.dim },
        { label: 'Profit Tgt',  val: config.daily_profit_target ? `$${config.daily_profit_target.toLocaleString()}` : '—', col: C.dim },
        { label: 'Loss Limit',  val: config.daily_loss_limit    ? `$${config.daily_loss_limit.toLocaleString()}` : '—',    col: C.dim },
      ].map(({ label, val, col: c }) => (
        <div key={label}><Field label={label} value={val} color={c} /></div>
      ))}
    </Card>
  );
}

// ── ORB Panel ──────────────────────────────────────────────────────────────────

function ORBPanel({ report }) {
  const orb = report?.orb;
  return (
    <Card style={{ minWidth: 200 }}>
      <SectionTitle>ORB · 9:30–9:44 ET</SectionTitle>
      {orb ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
          <Field label="High"    value={orb.high?.toFixed(2)}           color={C.green} />
          <Field label="Low"     value={orb.low?.toFixed(2)}            color={C.red}   />
          <Field label="Range"   value={`${orb.range?.toFixed(2)} pts`} color={orb.range >= 8 ? C.text : C.accent} />
          <Field label="Min Req" value="8.0 pts"                        color={C.dim}   />
        </div>
      ) : (
        <div style={{ fontFamily: C.font, fontSize: 13, color: C.dim }}>
          {report?.is_wednesday ? 'Wednesday — no trade day' : 'ORB forms at 9:30 ET'}
        </div>
      )}
    </Card>
  );
}

// ── Signal Status Panel ────────────────────────────────────────────────────────

function SignalStatusPanel({ report, latestSignal }) {
  const decision = report?.trade_decision;

  let col   = C.accent;
  let label = 'Waiting';
  let anim  = 'goldPulse';

  if (latestSignal) {
    col = C.green; label = 'Signal Fired'; anim = 'armPulse';
  } else if (decision === 'NO TRADE') {
    col = C.dim; label = 'No Trade'; anim = 'none';
  }

  return (
    <Card style={{ flex: 1 }} accent={col}>
      <SectionTitle>Signal · ORB Window 9:45–11:00</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', display: 'inline-block',
          background: col,
          animation: label === 'Waiting' ? `${anim} 2s infinite` : 'none',
          flexShrink: 0,
        }} />
        <span style={{ fontFamily: C.fHeading, fontSize: 24, fontWeight: 500, color: col }}>
          {label}
        </span>
      </div>
      {report?.decision_reason && (
        <div style={{ fontFamily: C.font, fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>
          {report.decision_reason}
        </div>
      )}
      {latestSignal && (
        <div style={{ marginTop: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: C.font, fontSize: 13, fontWeight: 600, color: latestSignal.direction === 'LONG' ? C.green : C.red }}>
            {latestSignal.direction}
          </span>
          <span style={{ fontFamily: C.font, fontSize: 13, color: C.textSub }}>Entry {latestSignal.entry}</span>
          <span style={{ fontFamily: C.font, fontSize: 13, color: C.accent, fontVariantNumeric: 'tabular-nums' }}>
            {latestSignal.confluence_score}/5
          </span>
        </div>
      )}
    </Card>
  );
}

// ── Context Panel ──────────────────────────────────────────────────────────────

function ContextPanel({ report }) {
  const gapDir = report?.gap_direction;
  const gapPct = report?.gap_pct;
  const day    = report?.day_of_week;
  const live   = report?.live_feed_active;
  const dir    = report?.direction;
  const pdh    = report?.pdh;
  const pdl    = report?.pdl;

  const gapColor = gapDir === 'up' ? C.green : gapDir === 'down' ? C.red : C.dim;
  const gapLabel = gapDir === 'up' ? 'Gap Up' : gapDir === 'down' ? 'Gap Down' : 'Flat';

  return (
    <Card style={{ minWidth: 180 }}>
      <SectionTitle>Context</SectionTitle>
      <div style={{ display: 'grid', rowGap: 14 }}>
        <Field label="Gap" value={gapDir ? `${gapLabel}  ${gapPct != null ? Math.abs(gapPct).toFixed(2) + '%' : ''}` : '—'} color={gapColor} />
        <Field label="Day" value={day || '—'} color={{ Tuesday: C.green, Thursday: C.accent }[day] || C.text} />
        <Field label="Breakout" value={dir ? dir : 'No break'} color={dir === 'LONG' ? C.green : dir === 'SHORT' ? C.red : C.dim} />
        <Field label="PDH" value={pdh?.toFixed(2)} color={C.textSub} />
        <Field label="PDL" value={pdl?.toFixed(2)} color={C.textSub} />
        <Field label="Feed" value={live ? 'Live' : 'Historical'} color={live ? C.green : C.accent} />
      </div>
    </Card>
  );
}

// ── Confluence Panel ───────────────────────────────────────────────────────────

const FACTOR_LABELS = ['Gap Direction','VWAP Alignment','PDH / PDL','Day of Week','ORB Range'];

function ConfluencePanel({ report, latestSignal }) {
  const conf = latestSignal
    ? { score: latestSignal.confluence_score, factors: latestSignal.confluence_factors }
    : report?.confluence;

  const score = conf?.score;
  let factors = conf?.factors;
  if (!Array.isArray(factors)) {
    try { factors = JSON.parse(factors ?? '[]'); } catch { factors = []; }
  }

  if (!score || !factors.length) return (
    <Card style={{ marginBottom: 16 }}>
      <SectionTitle>Confluence Scoring</SectionTitle>
      <div style={{ fontFamily: C.font, fontSize: 13, color: C.dim }}>
        Scoring available after breakout detected (9:45+)
      </div>
    </Card>
  );

  const passes = score >= 3.0;

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ ...lbl }}>Confluence Scoring</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: C.font, fontSize: 12, color: C.dim }}>threshold 3.0</span>
          <span style={{ fontFamily: C.fHeading, fontSize: 26, fontWeight: 500, color: passes ? C.green : C.red, fontVariantNumeric: 'tabular-nums' }}>
            {score} <span style={{ fontSize: 14, color: C.textSub, fontFamily: C.font, fontWeight: 400 }}>/ 5</span>
          </span>
          <span style={{
            fontFamily: C.font, fontSize: 10, fontWeight: 600, letterSpacing: 1,
            color: passes ? C.green : C.red,
            border: `1px solid ${passes ? C.green : C.red}`,
            borderRadius: 4, padding: '3px 9px',
          }}>
            {passes ? 'Passes' : 'Below Min'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {factors.map((f, i) => {
          const ptMatch = typeof f === 'string' ? f.match(/\(\+(\d+\.?\d*)\)/) : null;
          const pts     = ptMatch ? parseFloat(ptMatch[1]) : 0;
          const isGood  = typeof f === 'string' ? f.startsWith('✅') : null;
          const isBad   = typeof f === 'string' ? f.startsWith('❌') : null;
          const col     = isGood ? C.green : isBad ? C.red : C.accent;

          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '150px 1fr 44px',
              alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 6,
              background: isGood ? '#1B43320A' : isBad ? '#722F370A' : '#C9A84C0A',
              borderLeft: `2px solid ${col}`,
            }}>
              <div style={{ fontFamily: C.font, fontSize: 10, color: C.textSub, letterSpacing: 0.5 }}>
                {FACTOR_LABELS[i] ?? `Factor ${i + 1}`}
              </div>
              <div style={{ fontFamily: C.font, fontSize: 12, color: col }}>{f}</div>
              <div style={{ fontFamily: C.font, fontSize: 13, fontWeight: 600, color: col, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {pts > 0 ? `+${pts}` : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Score bar */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <div style={{ height: 3, background: C.border, borderRadius: 3, position: 'relative' }}>
          <div style={{ height: '100%', width: `${(score / 5) * 100}%`, background: passes ? C.green : C.red, borderRadius: 3, transition: 'width 0.4s ease' }} />
          <div style={{ position: 'absolute', top: -4, left: '60%', width: 2, height: 11, background: C.accent, borderRadius: 1 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ ...lbl }}>0</span>
          <span style={{ fontFamily: C.font, fontSize: 10, color: C.accent }}>3.0 min</span>
          <span style={{ ...lbl }}>5.0</span>
        </div>
      </div>
    </Card>
  );
}

// ── Active Trade Card ──────────────────────────────────────────────────────────

function ActiveTradeCard({ signal }) {
  const [eod, setEod] = useState(timeToEOD());
  useEffect(() => { const t = setInterval(() => setEod(timeToEOD()), 30000); return () => clearInterval(t); }, []);

  if (!signal) return null;

  const { direction, entry, stop, target1, target2, orb_range, contracts, multiplier, risk_dollars, timestamp } = signal;
  const trailDist = Math.abs((entry ?? 0) - (stop ?? 0)) * 0.5;
  const dirColor  = direction === 'LONG' ? C.green : C.red;

  return (
    <Card accent={dirColor} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: C.fHeading, fontSize: 22, fontWeight: 500, color: dirColor }}>ES {direction}</span>
          <span style={{
            fontFamily: C.font, fontSize: 10, fontWeight: 600, letterSpacing: 1,
            color: dirColor, border: `1px solid ${dirColor}`, borderRadius: 4, padding: '3px 8px',
          }}>Signal Active</span>
          <span style={{ fontFamily: C.font, fontSize: 11, color: C.dim }}>Scenario B · Trail → EOD</span>
        </div>
        <span style={{ fontFamily: C.font, fontSize: 11, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>{timestamp}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Entry',       val: entry?.toFixed(2),              col: C.text    },
          { label: 'Stop',        val: stop?.toFixed(2),               col: C.red     },
          { label: 'T1',          val: target1?.toFixed(2),            col: C.green   },
          { label: 'T2/EOD',      val: target2?.toFixed(2),            col: C.accent  },
          { label: 'Trail Dist',  val: `${trailDist.toFixed(2)} pts`,  col: C.accent  },
          { label: 'EOD Close',   val: eod,                            col: eod === 'Closed' ? C.dim : C.text },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ ...CARD, padding: '12px 14px' }}>
            <div style={{ ...lbl, marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: C.font, fontSize: 15, fontWeight: 600, color: col, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 24, fontFamily: C.font, fontSize: 12, color: C.textSub, flexWrap: 'wrap' }}>
        <span>{contracts} contracts · ${multiplier}/pt</span>
        <span>Risk: <span style={{ color: C.red }}>${risk_dollars?.toLocaleString()}</span></span>
        {target1 && entry && contracts && multiplier && (
          <span>T1 reward: <span style={{ color: C.green }}>
            ${Math.round(Math.abs(target1 - entry) * contracts * multiplier).toLocaleString()}
          </span></span>
        )}
        <span>ORB: {orb_range?.toFixed(2)} pts</span>
      </div>

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontFamily: C.font, fontSize: 11, color: C.accent }}>
        Exit management not yet live — trail stop is first build priority
      </div>
    </Card>
  );
}

// ── LivePage ───────────────────────────────────────────────────────────────────

export default function LivePage() {
  const [report,      setReport]      = useState(null);
  const [status,      setStatus]      = useState(null);
  const [latestSignal, setLatestSignal] = useState(null);
  const [lastUpdate,  setLastUpdate]  = useState(null);
  const [scanning,    setScanning]    = useState(false);
  const [err,         setErr]         = useState(false);

  // Passive reads — no side effects
  const fetchPassive = useCallback(() => {
    setErr(false);
    Promise.all([
      fetch(`${API}/daily/report/ES`).then(r => r.json()).catch(() => null),
      fetch(`${API}/algo/status`).then(r => r.json()).catch(() => null),
      fetch(`${API}/signals/latest`).then(r => r.json()).catch(() => null),
    ]).then(([rep, stat, sig]) => {
      if (!rep && !stat) { setErr(true); return; }
      if (rep)  setReport(rep);
      if (stat) setStatus(stat);
      setLatestSignal(sig?.signal ?? null);
      setLastUpdate(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }));
    });
  }, []);

  useEffect(() => {
    fetchPassive();
    const t = setInterval(fetchPassive, 15000);
    return () => clearInterval(t);
  }, [fetchPassive]);

  // Active scan — only on button press
  const runScan = async () => {
    setScanning(true);
    try {
      await fetch(`${API}/algo/scan`);
      await fetchPassive();
    } finally {
      setScanning(false);
    }
  };

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: C.fHeading, fontSize: 28, fontWeight: 500, color: C.text, lineHeight: 1 }}>
            Live Dashboard
          </div>
          <div style={{ fontFamily: C.font, fontSize: 11, color: C.dim, marginTop: 5 }}>
            ES · ORB · Today's Setup
            {lastUpdate && <span style={{ marginLeft: 12 }}>Updated {lastUpdate} ET</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchPassive} style={{
            fontFamily: C.font, fontSize: 11, color: C.textSub,
            background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 20, padding: '6px 16px', cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}>Refresh</button>
          <button onClick={runScan} disabled={scanning} style={{
            fontFamily: C.font, fontSize: 11, fontWeight: 500, color: C.panel,
            background: scanning ? C.dim : C.text,
            border: `1px solid ${scanning ? C.dim : C.text}`,
            borderRadius: 20, padding: '6px 18px', cursor: scanning ? 'default' : 'pointer',
            transition: 'all 0.2s ease',
          }}>{scanning ? 'Scanning…' : 'Scan Now'}</button>
        </div>
      </div>

      {err && (
        <Card accent={C.red} style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: C.font, fontSize: 13, color: C.red }}>
            Cannot reach API at {API} — start backend: <code>uvicorn main:app --reload</code>
          </div>
        </Card>
      )}

      {report?.is_wednesday && (
        <Card accent={C.accent} style={{ marginBottom: 16, textAlign: 'center' }}>
          <span style={{ fontFamily: C.fHeading, fontSize: 18, fontWeight: 500, color: C.accent }}>
            Wednesday — no trades per algo rules
          </span>
        </Card>
      )}

      <StatusStrip status={status} />

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <ORBPanel report={report} />
        <SignalStatusPanel report={report} latestSignal={latestSignal} />
        <ContextPanel report={report} />
      </div>

      <ConfluencePanel report={report} latestSignal={latestSignal} />
      <ActiveTradeCard signal={latestSignal} />
    </div>
  );
}
