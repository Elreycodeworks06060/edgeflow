import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import LivePage from './LivePage';
import JournalPage from './JournalPage';
import BacktestPage from './BacktestPage';
import TradeExplorerPage from './TradeExplorerPage';
import { C, API } from './theme';

const pnlColor = (v) => v > 50 ? C.green : v < -50 ? C.red : C.textSub;

const TABS = [
  { id: 'journal',  label: 'Journal',  path: '/journal'  },
  { id: 'backtest', label: 'Backtest', path: '/backtest' },
  { id: 'explorer', label: 'Explorer', path: '/explorer' },
];

function AppLayout() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const run = () =>
      fetch(`${API}/algo/status`).then(r => r.json()).then(setStatus).catch(() => {});
    run();
    const t = setInterval(run, 15000);
    return () => clearInterval(t);
  }, []);

  const armed = status?.armed;
  const pnl   = status?.daily_pnl ?? 0;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: C.font }}>

      {/* ── Navigation ── */}
      <nav style={{
        background: C.bg,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center',
        height: 64, padding: '0 36px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>

        {/* Brand wordmark */}
        <div style={{ marginRight: 52, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{
            fontFamily: C.fHeading, fontSize: 22, fontWeight: 600,
            color: C.text, lineHeight: 1, letterSpacing: 0.3,
          }}>EdgeFlow</span>
          <span style={{
            fontFamily: C.font, fontSize: 9, fontWeight: 400,
            color: C.dim, letterSpacing: 2.5, textTransform: 'uppercase',
          }}>Precision Trading Analytics</span>
        </div>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
          {TABS.map(({ id, label, path }) => (
            <NavLink
              key={id}
              to={path}
              style={({ isActive }) => ({
                textDecoration: 'none',
                display: 'flex', alignItems: 'center',
                fontFamily: C.font, fontSize: 11, fontWeight: isActive ? 600 : 400,
                letterSpacing: 1.5, textTransform: 'uppercase',
                color: isActive ? C.text : C.dim,
                borderBottom: `2px solid ${isActive ? C.accent : 'transparent'}`,
                padding: '0 18px', height: '100%',
                transition: 'color 0.2s ease, border-color 0.2s ease',
              })}
            >{label}</NavLink>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* ARMED status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 28 }}>
          <span style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: armed == null ? C.dim : armed ? C.green : C.red,
            animation: armed ? 'armPulse 2s infinite' : 'none',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: C.font, fontSize: 10, fontWeight: 500,
            letterSpacing: 1.5, textTransform: 'uppercase',
            color: armed == null ? C.dim : armed ? C.green : C.red,
          }}>
            {armed == null ? 'Connecting' : armed ? 'Armed' : 'Disarmed'}
          </span>
        </div>

        {/* Daily P&L */}
        <span style={{
          fontFamily: C.font, fontSize: 13, fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: pnlColor(pnl),
        }}>
          {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
        </span>
      </nav>

      {/* ── Page content ── */}
      <main style={{ padding: '28px 36px' }}>
        <Routes>
          <Route path="/"         element={<Navigate to="/backtest" replace />} />
          <Route path="/live"     element={<LivePage />} />
          <Route path="/journal"  element={<JournalPage />} />
          <Route path="/backtest" element={<BacktestPage />} />
          <Route path="/explorer" element={<TradeExplorerPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
