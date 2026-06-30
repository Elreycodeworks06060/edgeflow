import { useState, useEffect } from 'react';
import { C, CARD, API } from './theme';

// ── Helpers ────────────────────────────────────────────────────────────────────

const lbl = { fontFamily: C.font, fontSize: 10, fontWeight: 500, letterSpacing: 1.5, textTransform: 'uppercase', color: C.textSub };

const exitMap = { target1:'T1', target2:'T2', trail_stop:'Trail', eod_close:'EOD', stop:'Stop', be_stop:'BE Stop' };

// ── Trade Card ─────────────────────────────────────────────────────────────────

function TradeCard({ trade }) {
  const [open, setOpen] = useState(false);

  // trade_log schema may vary — be defensive
  const dir      = trade.direction ?? trade.signal_direction;
  const entry    = trade.entry     ?? trade.entry_price;
  const pnl      = trade.pnl       ?? trade.total_pnl;
  const result   = trade.result    ?? (pnl != null ? (pnl > 0 ? 'win' : 'loss') : null);
  const score    = trade.confluence_score ?? trade.score;
  const ts       = trade.timestamp ?? trade.date ?? '';
  const status   = trade.status;

  const dirCol = dir === 'LONG' ? C.green : dir === 'SHORT' ? C.red : C.dim;
  const resCol = result === 'win' ? C.green : result === 'loss' ? C.red : C.textSub;
  const pnlCol = pnl != null ? (pnl > 50 ? C.green : pnl < -50 ? C.red : C.textSub) : C.dim;

  return (
    <div style={{ ...CARD, padding: 0, marginBottom: 8, overflow: 'hidden', borderLeft: `3px solid ${resCol}` }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 20, padding: '14px 20px',
          cursor: 'pointer', background: open ? C.panelAlt : 'transparent',
          transition: 'background 0.15s ease',
        }}
      >
        <span style={{ fontFamily: C.font, fontSize: 12, color: C.textSub, minWidth: 100, fontVariantNumeric: 'tabular-nums' }}>
          {ts.slice(0, 10)}
        </span>
        <span style={{ fontFamily: C.font, fontSize: 13, fontWeight: 500, color: dirCol, minWidth: 60 }}>
          {dir ?? '—'}
        </span>
        {score != null && (
          <span style={{ fontFamily: C.font, fontSize: 12, color: C.accent, minWidth: 50, fontVariantNumeric: 'tabular-nums' }}>
            {score.toFixed(1)}/5
          </span>
        )}
        {result && (
          <span style={{
            fontFamily: C.font, fontSize: 10, fontWeight: 600, letterSpacing: 1,
            color: resCol, border: `1px solid ${resCol}`, borderRadius: 4, padding: '2px 8px',
          }}>{result.toUpperCase()}</span>
        )}
        {pnl != null && (
          <span style={{ fontFamily: C.font, fontSize: 14, fontWeight: 600, color: pnlCol, fontVariantNumeric: 'tabular-nums' }}>
            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
          </span>
        )}
        {status && (
          <span style={{ fontFamily: C.font, fontSize: 11, color: C.dim, marginLeft: 'auto' }}>
            {status}
          </span>
        )}
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 20px', background: C.bg }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { label: 'Entry',  val: entry?.toFixed(2), col: C.text   },
              { label: 'Stop',   val: trade.stop?.toFixed(2),   col: C.red    },
              { label: 'Target 1', val: trade.target1?.toFixed(2), col: C.green },
              { label: 'Target 2', val: trade.target2?.toFixed(2), col: C.accent },
            ].map(({ label, val, col }) => (
              <div key={label}>
                <div style={{ ...lbl, marginBottom: 5 }}>{label}</div>
                <div style={{ fontFamily: C.font, fontSize: 14, fontWeight: 600, color: col, fontVariantNumeric: 'tabular-nums' }}>
                  {val ?? '—'}
                </div>
              </div>
            ))}
          </div>
          {trade.confluence_factors && (
            <div style={{ marginTop: 14 }}>
              <div style={{ ...lbl, marginBottom: 8 }}>Confluence Factors</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Array.isArray(trade.confluence_factors)
                  ? trade.confluence_factors
                  : JSON.parse(trade.confluence_factors || '[]')
                ).map((f, i) => (
                  <span key={i} style={{
                    fontFamily: C.font, fontSize: 11, color: C.textSub,
                    border: `1px solid ${C.border}`, borderRadius: 4, padding: '3px 9px',
                  }}>{f}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── JournalPage ────────────────────────────────────────────────────────────────

export default function JournalPage() {
  const [trades,  setTrades]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/trades/log`)
      .then(r => r.json())
      .then(d => { setTrades((d.trades || []).slice().reverse()); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ fontFamily: C.font, fontSize: 13, color: C.dim, padding: 80, textAlign: 'center' }}>
      Loading journal…
    </div>
  );

  const winners  = trades.filter(t => t.result === 'win' || (t.pnl ?? 0) > 0).length;
  const totalPnl = trades.reduce((s, t) => s + (t.pnl ?? t.total_pnl ?? 0), 0);

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: C.fHeading, fontSize: 28, fontWeight: 500, color: C.text, lineHeight: 1 }}>
            Trade Journal
          </div>
          <div style={{ fontFamily: C.font, fontSize: 11, color: C.dim, marginTop: 5 }}>
            Live algo signals · ES ORB
          </div>
        </div>
        {trades.length > 0 && (
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <div>
              <div style={{ ...lbl, marginBottom: 3 }}>Win Rate</div>
              <div style={{ fontFamily: C.fHeading, fontSize: 20, fontWeight: 500, color: C.green }}>
                {(winners / trades.length * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ ...lbl, marginBottom: 3 }}>Total P&L</div>
              <div style={{ fontFamily: C.fHeading, fontSize: 20, fontWeight: 500, color: totalPnl >= 0 ? C.green : C.red, fontVariantNumeric: 'tabular-nums' }}>
                {totalPnl >= 0 ? '+' : ''}${Math.round(totalPnl).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ ...lbl, marginBottom: 3 }}>Trades</div>
              <div style={{ fontFamily: C.fHeading, fontSize: 20, fontWeight: 500, color: C.text }}>
                {trades.length}
              </div>
            </div>
          </div>
        )}
      </div>

      {trades.length === 0 ? (
        /* ── Elegant empty state ── */
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '80px 0', textAlign: 'center',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', border: `1.5px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.border }} />
          </div>
          <div style={{ fontFamily: C.fHeading, fontSize: 26, fontWeight: 500, color: C.text, marginBottom: 12 }}>
            No trades logged yet
          </div>
          <div style={{ fontFamily: C.font, fontSize: 14, color: C.textSub, lineHeight: 1.7, maxWidth: 360 }}>
            EdgeFlow begins capturing live signals tomorrow.
            <br />
            Each trade will appear here as the algo fires.
          </div>
        </div>
      ) : (
        <div>
          {/* Column headers */}
          <div style={{
            display: 'flex', gap: 20, padding: '0 20px 10px',
            fontFamily: C.font, fontSize: 10, fontWeight: 500,
            letterSpacing: 1.5, textTransform: 'uppercase', color: C.dim,
          }}>
            <span style={{ minWidth: 100 }}>Date</span>
            <span style={{ minWidth: 60 }}>Direction</span>
            <span style={{ minWidth: 50 }}>Score</span>
            <span>Result</span>
            <span>P&L</span>
          </div>
          {trades.map((t, i) => <TradeCard key={t.id ?? i} trade={t} />)}
        </div>
      )}
    </div>
  );
}
