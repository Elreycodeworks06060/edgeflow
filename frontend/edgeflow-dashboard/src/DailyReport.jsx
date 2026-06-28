import { useState, useEffect } from "react";

const COLORS = {
  bg: "#080b0f", bg2: "#0d1117", bg3: "#111820",
  border: "#1e2d3d", accent: "#00d4ff", accent2: "#00ff9d",
  accent3: "#ff6b35", accent4: "#a855f7", text: "#e2e8f0", dim: "#64748b",
};

export default function DailyReport() {
  const [ticker, setTicker] = useState("ES");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReport = (t) => {
    setLoading(true);
    setError(null);
    fetch(`http://127.0.0.1:8000/daily/report/${t}`)
      .then(r => r.json())
      .then(d => { setReport(d); setLoading(false); })
      .catch(() => { setError("Backend not reachable"); setLoading(false); });
  };

  useEffect(() => { fetchReport(ticker); }, [ticker]);

  const decisionColor = (d) => {
    if (d === "TRADE TAKEN") return COLORS.accent2;
    if (d === "NO TRADE") return COLORS.accent3;
    if (d === "WAITING") return COLORS.accent;
    return COLORS.dim;
  };

  const decisionIcon = (d) => {
    if (d === "TRADE TAKEN") return "🟢";
    if (d === "NO TRADE") return "🔴";
    if (d === "WAITING") return "🟡";
    return "⚪";
  };

  const gapColor = (dir) => {
    if (dir === "up") return COLORS.accent2;
    if (dir === "down") return COLORS.accent3;
    return COLORS.dim;
  };

  if (loading) return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", color: COLORS.dim }}>
      Loading daily report...
    </div>
  );

  if (error) return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", color: COLORS.accent3 }}>
      {error}
    </div>
  );

  if (!report) return null;

  const { orb, confluence, trade_decision, decision_reason, gap_direction, gap_pct, direction, latest_price, bar_count, strategy, trade, is_wednesday, day_of_week, date } = report;

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.text, fontFamily: "sans-serif", padding: 24 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent, letterSpacing: 4, marginBottom: 6 }}>EDGEFLOW PLATFORM</div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>Daily <span style={{ color: COLORS.accent }}>Report</span></div>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, marginTop: 4 }}>
          {day_of_week}, {date} — Full algo decision breakdown
        </div>
      </div>

      {/* Ticker Switch */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {["ES", "NQ"].map(t => (
          <button key={t} onClick={() => setTicker(t)} style={{
            padding: "8px 24px", borderRadius: 8,
            border: `1px solid ${ticker === t ? COLORS.accent : COLORS.border}`,
            background: ticker === t ? "rgba(0,212,255,0.1)" : COLORS.bg2,
            color: ticker === t ? COLORS.accent : COLORS.dim,
            fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>{t}</button>
        ))}
        <button onClick={() => fetchReport(ticker)} style={{
          padding: "8px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
          background: COLORS.bg2, color: COLORS.dim, fontFamily: "monospace", fontSize: 11, cursor: "pointer",
        }}>↻ Refresh</button>
        <div style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 11, color: COLORS.dim, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: report.live_feed_active ? COLORS.accent2 : COLORS.accent3, display: "inline-block" }} />
          {report.live_feed_active ? `Live — ${bar_count} bars` : "Feed offline"}
        </div>
      </div>

      {/* Decision Banner */}
      <div style={{
        background: COLORS.bg2,
        border: `1px solid ${decisionColor(trade_decision)}40`,
        borderRadius: 12, padding: 24, marginBottom: 20,
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: decisionColor(trade_decision) }} />
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 36 }}>{decisionIcon(trade_decision)}</div>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: decisionColor(trade_decision) }}>
              {trade_decision}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 12, color: COLORS.dim, marginTop: 4 }}>
              {decision_reason}
            </div>
          </div>
          {direction && (
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 800, color: direction === "LONG" ? COLORS.accent2 : COLORS.accent3 }}>
                {direction === "LONG" ? "▲ LONG" : "▼ SHORT"}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>
                {strategy.contracts} contracts · ${strategy.multiplier}/pt · Scenario {strategy.scenario}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Wednesday banner */}
      {is_wednesday && (
        <div style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 12, padding: 20, marginBottom: 20, fontFamily: "monospace", fontSize: 13, color: COLORS.accent4, textAlign: "center" }}>
          🚫 Wednesday — No trades today by strategy rule. ORB data is observed only.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* ORB Setup */}
        <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 3, marginBottom: 16 }}>ORB SETUP — 9:30 TO 9:44 AM</div>

          {orb ? (
            <>
              {/* ORB Visual Bar */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent2 }}>HIGH: {orb.high}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent4 }}>RANGE: {orb.range} pts</span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.accent3 }}>LOW: {orb.low}</span>
                </div>

                {/* Visual range bar */}
                <div style={{ position: "relative", height: 48, background: COLORS.bg3, borderRadius: 8, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(168,85,247,0.15)" }} />
                  <div style={{ position: "absolute", top: 4, left: "10%", right: "10%", bottom: 4, background: "rgba(168,85,247,0.3)", borderRadius: 4, border: "1px solid rgba(168,85,247,0.5)" }} />
                  {/* Current price indicator */}
                  {latest_price && orb && (
                    <div style={{
                      position: "absolute",
                      top: 0, bottom: 0, width: 2,
                      background: direction === "LONG" ? COLORS.accent2 : direction === "SHORT" ? COLORS.accent3 : COLORS.accent,
                      left: `${Math.max(5, Math.min(95, ((latest_price - orb.low) / (orb.high - orb.low + orb.range)) * 100))}%`,
                    }} />
                  )}
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 10, color: COLORS.accent4, fontWeight: 700 }}>
                    ORB ZONE — {orb.bars} bars
                  </div>
                </div>

                {latest_price && (
                  <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 11, color: COLORS.accent, textAlign: "center" }}>
                    Current: {latest_price} — {latest_price > orb.high ? `▲ ${(latest_price - orb.high).toFixed(2)} pts ABOVE high` : latest_price < orb.low ? `▼ ${(orb.low - latest_price).toFixed(2)} pts BELOW low` : "Inside ORB range"}
                  </div>
                )}
              </div>

              {/* ORB Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  { label: "ORB HIGH", value: orb.high, color: COLORS.accent2 },
                  { label: "ORB LOW", value: orb.low, color: COLORS.accent3 },
                  { label: "RANGE", value: `${orb.range} pts`, color: orb.range >= strategy.min_range ? COLORS.accent2 : COLORS.accent3 },
                  { label: "BARS", value: orb.bars, color: orb.bars >= 5 ? COLORS.accent2 : COLORS.accent3 },
                  { label: "MIN RANGE", value: `${strategy.min_range} pts`, color: COLORS.dim },
                  { label: "RANGE OK", value: orb.range >= strategy.min_range ? "✅ YES" : "❌ NO", color: orb.range >= strategy.min_range ? COLORS.accent2 : COLORS.accent3 },
                ].map(item => (
                  <div key={item.label} style={{ background: COLORS.bg3, borderRadius: 8, padding: "10px 12px", textAlign: "center", border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontFamily: "monospace", fontSize: 9, color: COLORS.dim, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: 40, fontFamily: "monospace", fontSize: 12, color: COLORS.dim }}>
              ORB not yet formed — forms between 9:30 and 9:44 AM ET
            </div>
          )}
        </div>

        {/* Market Context */}
        <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 3, marginBottom: 16 }}>MARKET CONTEXT</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Gap */}
            <div style={{ background: COLORS.bg3, borderRadius: 8, padding: "12px 16px", border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, marginBottom: 6 }}>GAP DIRECTION</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24 }}>
                  {gap_direction === "up" ? "📈" : gap_direction === "down" ? "📉" : "➡️"}
                </span>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: gapColor(gap_direction) }}>
                    Gap {gap_direction.toUpperCase()} {gap_pct !== 0 ? `${gap_pct > 0 ? "+" : ""}${gap_pct.toFixed(3)}%` : ""}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, marginTop: 2 }}>
                    {direction === "LONG" && gap_direction === "down" && "✅ Aligned with LONG — gap down confirms upside bias (+2pts)"}
                    {direction === "LONG" && gap_direction === "up" && "⚠️ Against LONG — gap up reduces confidence (+0.5pts)"}
                    {direction === "SHORT" && gap_direction === "up" && "✅ Aligned with SHORT — gap up confirms downside bias (+2pts)"}
                    {direction === "SHORT" && gap_direction === "down" && "⚠️ Against SHORT — gap down reduces confidence (+0.5pts)"}
                    {!direction && "Direction not yet determined"}
                  </div>
                </div>
              </div>
            </div>

            {/* Day of week */}
            <div style={{ background: COLORS.bg3, borderRadius: 8, padding: "12px 16px", border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, marginBottom: 6 }}>DAY OF WEEK</div>
              <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: day_of_week === "Tuesday" ? COLORS.accent2 : day_of_week === "Wednesday" ? COLORS.accent4 : COLORS.text }}>
                {day_of_week}
                {day_of_week === "Tuesday" && " ⭐ — Strongest ORB day (+0.5pts bonus)"}
                {day_of_week === "Wednesday" && " 🚫 — No trades today"}
                {!["Tuesday", "Wednesday"].includes(day_of_week) && " — Standard day (+0pts)"}
              </div>
            </div>

            {/* Strategy */}
            <div style={{ background: COLORS.bg3, borderRadius: 8, padding: "12px 16px", border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, marginBottom: 6 }}>STRATEGY</div>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: COLORS.accent }}>
                {ticker} — {strategy.contracts} contracts @ ${strategy.multiplier}/pt
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim, marginTop: 4 }}>
                Scenario {strategy.scenario} — {strategy.scenario === "B" ? "Trail stop after T1 → EOD" : "Breakeven stop after T1 → T2"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confluence Breakdown */}
      <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 3, marginBottom: 16 }}>CONFLUENCE SCORE — ALL 5 FACTORS</div>

        {confluence ? (
          <>
            {/* Score display */}
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 48, fontWeight: 800, color: confluence.score >= 3 ? COLORS.accent2 : COLORS.accent3, fontFamily: "monospace" }}>
                  {confluence.score}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.dim }}>out of 5</div>
              </div>
              <div style={{ flex: 1 }}>
                {/* Score bar */}
                <div style={{ height: 12, background: COLORS.bg3, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{
                    height: "100%",
                    width: `${(confluence.score / 5) * 100}%`,
                    background: confluence.score >= 3 ? COLORS.accent2 : COLORS.accent3,
                    borderRadius: 6,
                    transition: "width 0.5s ease",
                  }} />
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: confluence.score >= 3 ? COLORS.accent2 : COLORS.accent3, fontWeight: 700 }}>
                  {confluence.score >= 3 ? `✅ A+ SETUP — Trade qualifies (min: 3.0)` : `❌ BELOW MINIMUM — Trade skipped (min: 3.0, got: ${confluence.score})`}
                </div>
              </div>
            </div>

            {/* Factor list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {confluence.factors.map((factor, i) => {
                const isPass = factor.startsWith("✅");
                const isWarn = factor.startsWith("⚠️") || factor.startsWith("➡️");
                const isFail = factor.startsWith("❌");
                const borderColor = isPass ? "rgba(0,255,157,0.3)" : isFail ? "rgba(255,107,53,0.3)" : COLORS.border;
                const bgColor = isPass ? "rgba(0,255,157,0.05)" : isFail ? "rgba(255,107,53,0.05)" : COLORS.bg3;
                const textColor = isPass ? COLORS.accent2 : isFail ? COLORS.accent3 : COLORS.dim;

                return (
                  <div key={i} style={{
                    background: bgColor,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 8, padding: "12px 16px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: textColor }}>{factor}</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: 40, fontFamily: "monospace", fontSize: 12, color: COLORS.dim }}>
            {orb ? "No breakout detected — confluence not yet calculated" : "Waiting for ORB to form at 9:44 AM ET"}
          </div>
        )}
      </div>

      {/* Trade Details if fired */}
      {trade && (
        <div style={{ background: COLORS.bg2, border: `1px solid rgba(0,255,157,0.3)`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: COLORS.accent2, borderRadius: "12px 12px 0 0" }} />
          <div style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim, letterSpacing: 3, marginBottom: 16 }}>TRADE FIRED TODAY</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { label: "DIRECTION", value: trade.direction, color: trade.direction === "LONG" ? COLORS.accent2 : COLORS.accent3 },
              { label: "ENTRY", value: trade.entry, color: COLORS.accent },
              { label: "STOP", value: trade.stop, color: COLORS.accent3 },
              { label: "TARGET 1", value: trade.target1, color: COLORS.accent2 },
              { label: "TARGET 2", value: trade.target, color: COLORS.accent2 },
              { label: "CONTRACTS", value: trade.contracts, color: COLORS.accent },
              { label: "RISK", value: `-$${trade.risk_dollars}`, color: COLORS.accent3 },
              { label: "REWARD", value: `+$${trade.reward_dollars}`, color: COLORS.accent2 },
              { label: "R/R", value: `${trade.rr_ratio}R`, color: COLORS.accent4 },
              { label: "SCORE", value: `${trade.confluence_score}/5`, color: COLORS.accent4 },
              { label: "STATUS", value: trade.result?.toUpperCase(), color: trade.result === "open" ? COLORS.accent : COLORS.accent2 },
              { label: "P&L", value: trade.pnl == null ? "open" : `$${trade.pnl}`, color: (trade.pnl || 0) >= 0 ? COLORS.accent2 : COLORS.accent3 },
            ].map(item => (
              <div key={item.label} style={{ background: COLORS.bg3, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: COLORS.dim, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 16, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.dim }}>EDGEFLOW — Daily Report · {ticker} · {date}</span>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: COLORS.accent }}>{strategy.contracts} contracts · ${strategy.multiplier}/pt · Scenario {strategy.scenario}</span>
      </div>
    </div>
  );
}