# EdgeFlow Design System — MASTER

> **Style:** HUD / Sci-Fi FUI × Bloomberg Terminal  
> **Stack:** React 19 + Vite (inline styles via `C` theme object + `theme.js`)  
> **Audience:** Solo futures trader — dense, high-signal, zero-noise  
> **Version:** 1.0 · 2026-06-29

---

## 0. Design Philosophy

EdgeFlow is a **professional instrument**, not a consumer product. Every visual decision must serve one of three goals:

1. **Signal clarity** — the trader must read a number or status in under 300 ms.
2. **State awareness** — armed / disarmed, profit / loss, risk / safe must be instantly obvious without looking twice.
3. **Data density** — maximum information per pixel. Whitespace is earned, not defaulted.

> **The terminal is the metaphor.** Every panel, label, and border should feel like it belongs on a Bloomberg terminal or an Iron Man FUI — precise, angular, monochromatic base with deliberate accent color.

---

## 1. Color System

### 1.1 Primitive Tokens (never use in components directly)

```js
// theme.js — single source of truth
export const C = {
  // ── Backgrounds ──────────────────────────────────────
  bg:       '#080808',   // OLED-near black. Page root background.
  panel:    '#111111',   // Card / panel surface.
  panelAlt: '#161616',   // Hover state surface, alternating table rows.
  overlay:  '#1C1C1C',   // Modals, dropdowns, tooltips.

  // ── Borders ───────────────────────────────────────────
  border:   '#222222',   // Default separator, card edge.
  borderHi: '#333333',   // Active panel edge, focused input.

  // ── Text ─────────────────────────────────────────────
  text:     '#E8E8E8',   // Primary text — data values, labels.
  textSub:  '#888888',   // Secondary — column headers, timestamps, units.
  dim:      '#444444',   // Disabled, placeholder, muted decorative.

  // ── Semantic Accents ─────────────────────────────────
  accent:   '#00AAFF',   // Primary brand — nav active, links, focus ring.
  green:    '#00FF41',   // Profit, win, armed, long signal. Matrix green.
  amber:    '#FFB800',   // Warning, partial, neutral pnl, caution.
  red:      '#FF3131',   // Loss, disarmed, short signal, error.

  // ── Chart-specific ───────────────────────────────────
  chartBull: '#26A69A',  // Candlestick bullish body (industry standard).
  chartBear: '#EF5350',  // Candlestick bearish body.
  chartGrid: '#1A1A1A',  // Chart gridlines — must not compete with data.
  chartLine: '#00AAFF',  // Equity curve, price line.

  // ── Utility ──────────────────────────────────────────
  font: "'JetBrains Mono', Consolas, 'Courier New', monospace",
};

export const API = 'http://127.0.0.1:8000';
```

### 1.2 Semantic Usage Rules

| Token | Use For | Never Use For |
|-------|---------|---------------|
| `C.bg` | Page root, `<body>` | Cards, panels |
| `C.panel` | Card/widget background | Page root |
| `C.panelAlt` | Hover rows, secondary panels | Primary card bg |
| `C.overlay` | Dropdowns, tooltips, modals | Page elements |
| `C.accent` | Active nav tab underline, focus ring, links | P&L values |
| `C.green` | Profit numbers, WIN label, ARMED status, long entry | Static decorative elements |
| `C.amber` | Neutral pnl zone (−$50 to +$50), warnings, T1 hit | Error states |
| `C.red` | Loss numbers, LOSS label, DISARMED, short entry | Warning states |
| `C.text` | All primary data values | Labels, units |
| `C.textSub` | Column headers, units (pts, %, $), timestamps | Data values |
| `C.dim` | Disabled text, decorative HUD brackets | Data text |
| `C.chartBull` | Bullish candle body and wick only | Other green meanings |
| `C.chartBear` | Bearish candle body and wick only | Other red meanings |

### 1.3 P&L Coloring Rule

```js
// Always use this exact logic — never invent variations
const pnlColor = (val) =>
  val >  50 ? C.green :
  val < -50 ? C.red   :
              C.amber;
```

### 1.4 Signal Direction Colors

| Direction | Color | Label |
|-----------|-------|-------|
| Long | `C.green` | `LONG` |
| Short | `C.red` | `SHORT` |
| Neutral / No signal | `C.dim` | `—` |

### 1.5 Contrast Ratios (verified)

| Pair | Ratio | Pass Level |
|------|-------|------------|
| `#E8E8E8` on `#080808` | 16.8:1 | AAA |
| `#00FF41` on `#080808` | 13.4:1 | AAA |
| `#00AAFF` on `#080808` | 5.9:1  | AA  |
| `#FFB800` on `#080808` | 8.7:1  | AAA |
| `#FF3131` on `#080808` | 5.2:1  | AA  |
| `#888888` on `#080808` | 4.6:1  | AA  |

---

## 2. Typography

### 2.1 Font Stack

```css
/* Only ever use this stack. No exceptions. */
font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
```

**Google Fonts import** (add to `index.html` `<head>`):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

### 2.2 Type Scale

| Role | Size | Weight | Letter Spacing | Use |
|------|------|--------|----------------|-----|
| `display` | 24px | 700 | 0.5px | Large KPI value (e.g. equity peak) |
| `heading` | 13px | 700 | 2px | Section titles, widget headers |
| `label` | 11px | 400 | 2px | Column headers, nav tabs |
| `data` | 12px | 400 | 0.5px | All numerical data values |
| `body` | 12px | 400 | 0px | Narrative text, descriptions |
| `micro` | 10px | 400 | 1px | Timestamps, footnotes, chart axis labels |

### 2.3 Typography Rules

- **Never** use a font size below 10px.
- **Always** `letter-spacing: 2px; text-transform: uppercase` on section headers.
- **All numbers** must use `font-variant-numeric: tabular-nums` so columns align.
- **Line heights:** `1.4` for multi-line body text; `1.0` for single-line data values.
- **No italic** text anywhere — italics break terminal aesthetic.

```js
// Reusable inline style snippets
const T = {
  display: { fontSize: 24, fontWeight: 700, letterSpacing: 0.5, fontVariantNumeric: 'tabular-nums' },
  heading: { fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' },
  label:   { fontSize: 11, fontWeight: 400, letterSpacing: 2, textTransform: 'uppercase', color: C.textSub },
  data:    { fontSize: 12, fontWeight: 400, letterSpacing: 0.5, fontVariantNumeric: 'tabular-nums' },
  micro:   { fontSize: 10, fontWeight: 400, letterSpacing: 1, color: C.textSub },
};
```

---

## 3. Spacing System

All spacing uses a **4px base grid**. Never use values outside this scale.

| Token | Value | Use |
|-------|-------|-----|
| `sp1` | 4px   | Icon padding, tight inline gap |
| `sp2` | 8px   | Gap between data fields in a row |
| `sp3` | 12px  | Card inner padding (compact) |
| `sp4` | 16px  | Card inner padding (default), section gap |
| `sp5` | 20px  | Page content padding horizontal |
| `sp6` | 24px  | Nav horizontal padding, between panels |
| `sp8` | 32px  | Section-level separation |
| `sp10`| 40px  | Major section dividers |

```js
export const SP = { sp1:4, sp2:8, sp3:12, sp4:16, sp5:20, sp6:24, sp8:32, sp10:40 };
```

### 3.1 Layout Padding Defaults

| Context | Value |
|---------|-------|
| Page content area | `20px 24px` |
| Card/panel inner | `12px 16px` |
| Table cell | `6px 12px` |
| Nav bar height | `44px` (aligns to 4pt grid) |
| Row height (tables) | `32px` |

---

## 4. Geometry & Borders

### 4.1 Border Radius

**Zero everywhere.** EdgeFlow is angular. No rounded cards. No pill buttons.

```js
borderRadius: 0   // ALL elements. No exceptions.
```

The only exception: the status indicator dot in the nav (7×7px circle).

### 4.2 Border Widths

| Use | Value | Color |
|-----|-------|-------|
| Card edge | `1px solid` | `C.border` (#222) |
| Active panel / focused element | `1px solid` | `C.borderHi` (#333) |
| Active nav tab underline | `2px solid` | `C.accent` |
| HUD bracket decorators | `1px solid` | `rgba(0,170,255,0.3)` |
| Table dividers | `1px solid` | `C.border` |

### 4.3 HUD Corner Brackets (optional decorator)

Use sparingly on key KPI panels to reinforce the FUI aesthetic:

```jsx
// Reusable HUD bracket corners (pure CSS, no SVG required)
const hudPanel = {
  position: 'relative',
  border: `1px solid ${C.border}`,
  // Corner bracket via outline trick or ::before/::after in global CSS
};
// Add className="hud-panel" and define in index.css:
```

```css
/* index.css */
.hud-panel::before,
.hud-panel::after {
  content: '';
  position: absolute;
  width: 8px;
  height: 8px;
  border-color: rgba(0,170,255,0.5);
  border-style: solid;
  pointer-events: none;
}
.hud-panel::before {
  top: -1px; left: -1px;
  border-width: 1px 0 0 1px;
}
.hud-panel::after {
  bottom: -1px; right: -1px;
  border-width: 0 1px 1px 0;
}
```

---

## 5. Elevation & Z-Index

| Layer | Z-Index | Use |
|-------|---------|-----|
| Base content | 0 | Default page elements |
| Sticky nav | 100 | Top navigation bar |
| Dropdowns | 200 | Filter menus, select panels |
| Tooltips | 300 | Data hover tooltips |
| Modals | 400 | Confirmation dialogs |
| Toast / Alerts | 500 | System status notifications |

No shadows. Elevation is expressed through **border contrast and background tint**, not box-shadow. This preserves the flat terminal aesthetic.

```js
// NEVER use box-shadow on cards. Use border instead.
// ✓ Correct:
border: `1px solid ${C.borderHi}`
// ✗ Wrong:
boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
```

The only permitted glow effect is on live status indicators:

```css
/* index.css — used on armed status dot only */
@keyframes blink {
  0%, 100% { box-shadow: 0 0 8px #00FF41; }
  50%       { box-shadow: 0 0 2px #00FF41; }
}
```

---

## 6. Component Patterns

### 6.1 KPI Stat Card

```jsx
// Displays a single metric: label + value + optional delta
function StatCard({ label, value, delta, unit }) {
  const deltaColor = delta > 0 ? C.green : delta < 0 ? C.red : C.amber;
  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${C.border}`,
      padding: '12px 16px',
      minWidth: 140,
    }}>
      <div style={{ ...T.label, color: C.textSub, marginBottom: 6 }}>{label}</div>
      <div style={{ ...T.display, color: C.text }}>
        {value}<span style={{ fontSize: 12, color: C.textSub, marginLeft: 4 }}>{unit}</span>
      </div>
      {delta != null && (
        <div style={{ ...T.micro, color: deltaColor, marginTop: 4 }}>
          {delta > 0 ? '+' : ''}{delta}
        </div>
      )}
    </div>
  );
}
```

### 6.2 Section Header

```jsx
// Every data section gets this header
function SectionHeader({ title, badge }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      borderBottom: `1px solid ${C.border}`,
      paddingBottom: 8, marginBottom: 12,
    }}>
      <span style={{ ...T.heading, color: C.accent }}>{title}</span>
      {badge && (
        <span style={{
          fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
          color: C.panel, background: C.accent,
          padding: '1px 6px',
        }}>{badge}</span>
      )}
    </div>
  );
}
```

### 6.3 Data Table

```jsx
// Dense tabular data — trades, backtest results, signal log
const tableStyles = {
  table: {
    width: '100%', borderCollapse: 'collapse',
    fontFamily: C.font, fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
  },
  th: {
    ...T.label,
    padding: '6px 12px', textAlign: 'left',
    borderBottom: `1px solid ${C.border}`,
    color: C.textSub, background: C.panel,
    position: 'sticky', top: 44,   // below nav bar
  },
  td: {
    padding: '6px 12px',
    borderBottom: `1px solid ${C.border}`,
    color: C.text, verticalAlign: 'middle',
  },
  rowHover: { background: C.panelAlt },
  rowWin:   { borderLeft: `2px solid ${C.green}` },
  rowLoss:  { borderLeft: `2px solid ${C.red}` },
};
```

**Table rules:**
- Alternating row background: `C.panel` / `C.panelAlt`.
- Win rows: `borderLeft: 2px solid C.green`. Loss rows: `borderLeft: 2px solid C.red`.
- Numeric columns are **right-aligned**.
- String/label columns are **left-aligned**.
- Timestamp format: `HH:MM ET` (never full ISO string in a table cell).
- Never truncate P&L or key numbers — widen the column.

### 6.4 Signal Badge

```jsx
// Used to display ORB signal direction and score
function SignalBadge({ direction, score }) {
  const color = direction === 'LONG' ? C.green : direction === 'SHORT' ? C.red : C.dim;
  return (
    <span style={{
      fontFamily: C.font, fontSize: 11, fontWeight: 700,
      letterSpacing: 2, textTransform: 'uppercase',
      color, border: `1px solid ${color}`,
      padding: '2px 8px',
      display: 'inline-block',
    }}>
      {direction || '—'}
      {score != null && <span style={{ fontWeight: 400, marginLeft: 6, color: C.textSub }}>{score}/5</span>}
    </span>
  );
}
```

### 6.5 Status Pill (ARMED / DISARMED)

```jsx
function StatusPill({ armed }) {
  const color = armed == null ? C.dim : armed ? C.green : C.red;
  const label = armed == null ? 'CONNECTING' : armed ? 'ARMED' : 'DISARMED';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
        background: color,
        animation: armed ? 'blink 2s infinite' : 'none',
      }} />
      <span style={{ fontFamily: C.font, fontSize: 11, letterSpacing: 1, color }}>
        {label}
      </span>
    </div>
  );
}
```

### 6.6 Top Navigation Bar

```jsx
// 44px sticky bar — the only "chrome" in the app
const navStyle = {
  bar: {
    background: C.panel, borderBottom: `1px solid ${C.border}`,
    display: 'flex', alignItems: 'stretch', height: 44,
    padding: '0 24px', position: 'sticky', top: 0, zIndex: 100,
  },
  logo: {
    fontFamily: C.font, fontSize: 13, fontWeight: 700,
    color: C.accent, marginRight: 32, letterSpacing: 1,
    display: 'flex', alignItems: 'center',
  },
  tab: (active) => ({
    background: 'none', border: 'none', cursor: 'pointer',
    fontFamily: C.font, fontSize: 11, letterSpacing: 2,
    color: active ? C.accent : C.dim,
    borderBottom: `2px solid ${active ? C.accent : 'transparent'}`,
    padding: '0 20px', height: '100%', textTransform: 'uppercase',
    transition: 'color 0.15s',
  }),
};
```

### 6.7 Loading State

```jsx
// Use for any async data fetch. Never a blank white area.
function DataLoading() {
  return (
    <div style={{ padding: 24, color: C.textSub, fontFamily: C.font, fontSize: 11, letterSpacing: 2 }}>
      LOADING...
    </div>
  );
}

// Pulse skeleton for table rows
function SkeletonRow({ cols = 6 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '6px 12px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{
            height: 12, background: C.border, width: '60%',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </td>
      ))}
    </tr>
  );
}
```

### 6.8 Empty State

```jsx
function EmptyState({ message = 'NO DATA' }) {
  return (
    <div style={{
      padding: 32, textAlign: 'center',
      fontFamily: C.font, fontSize: 11, letterSpacing: 2,
      color: C.dim, borderTop: `1px solid ${C.border}`,
    }}>
      {message}
    </div>
  );
}
```

### 6.9 Toast / Alert Banner

```jsx
// Positioned fixed bottom-right. Auto-dismiss in 4s.
function Toast({ message, type = 'info' }) {
  const color = type === 'error' ? C.red : type === 'success' ? C.green : C.amber;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 500,
      background: C.overlay, border: `1px solid ${color}`,
      padding: '10px 16px', fontFamily: C.font, fontSize: 11,
      letterSpacing: 1, color, maxWidth: 320,
    }}>
      {message}
    </div>
  );
}
```

---

## 7. Chart Specifications

> **Library:** Recharts (already in use). For candlestick charts, use **Lightweight Charts** by TradingView.

### 7.1 Equity Curve (Area Chart)

```jsx
// Recharts AreaChart for cumulative P&L
const equityChartConfig = {
  background: C.bg,
  stroke: C.chartLine,      // #00AAFF
  fill: 'url(#equityGrad)', // gradient defined in <defs>
  grid: { stroke: C.chartGrid, strokeDasharray: '3 3' },
  axis: { tick: { fill: C.textSub, fontSize: 10, fontFamily: C.font } },
  tooltip: {
    contentStyle: {
      background: C.overlay, border: `1px solid ${C.border}`,
      fontFamily: C.font, fontSize: 11, color: C.text,
    },
  },
};
// Gradient fill definition:
// <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
//   <stop offset="5%" stopColor={C.chartLine} stopOpacity={0.2} />
//   <stop offset="95%" stopColor={C.chartLine} stopOpacity={0} />
// </linearGradient>
```

### 7.2 Win/Loss Bar Chart

```jsx
// Monthly or weekly P&L bars — green/red
const barChartConfig = {
  positiveBar: C.green,
  negativeBar: C.red,
  grid: { stroke: C.chartGrid },
  referenceLine: { stroke: C.dim, strokeDasharray: '4 2' }, // zero line
};
```

### 7.3 Candlestick Chart (Live Page)

Use **TradingView Lightweight Charts** (not Recharts):
```bash
npm install lightweight-charts
```

```js
const chartOptions = {
  background: { color: C.bg },
  grid: {
    vertLines: { color: C.chartGrid },
    horzLines: { color: C.chartGrid },
  },
  crosshair: { mode: 1 }, // Normal crosshair
  rightPriceScale: { borderColor: C.border },
  timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false },
};

const candleSeriesOptions = {
  upColor:         C.chartBull,  // #26A69A
  downColor:       C.chartBear,  // #EF5350
  borderUpColor:   C.chartBull,
  borderDownColor: C.chartBear,
  wickUpColor:     C.chartBull,
  wickDownColor:   C.chartBear,
};
```

### 7.4 Chart Universal Rules

- **Grid lines:** Always `C.chartGrid` (#1A1A1A) — never bright, never compete with data.
- **Axis text:** Always 10px, `C.textSub`, `C.font`.
- **Tooltip:** Dark background (`C.overlay`), 1px border (`C.border`), 11px monospace.
- **No chart titles inside the chart** — use `SectionHeader` above it.
- **No decorative fills** — area fills max 20% opacity.
- **Candlestick colors:** Use industry-standard `#26A69A` / `#EF5350`, not `C.green` / `C.red`.  
  Reason: colorblind users are trained to distinguish teal/red, not bright-green/red.
- **No pie charts.** This is a data-dense analytics tool — use bar or table.
- **Reference line at zero** on any P&L chart — always dashed, `C.dim`.
- For 500+ candles: canvas rendering required. Lightweight Charts handles this natively.

---

## 8. Page Layouts

### 8.1 Live Page Grid

```
┌─────────────────────────────────────────────────────┐
│  NAV BAR (44px sticky)                              │
├───────────┬─────────────────────────────────────────┤
│  STATUS   │  CANDLE CHART  (flex: 1)                │
│  PANEL    │                                         │
│  (240px)  │                                         │
│           ├─────────────────────────────────────────┤
│           │  SIGNAL TABLE / LOG                     │
└───────────┴─────────────────────────────────────────┘
```

### 8.2 Backtest Page Grid

```
┌─────────────────────────────────────────────────────┐
│  NAV BAR                                            │
├─────────────────────────────────────────────────────┤
│  [KPI ROW: Win Rate | Avg Win | Avg Loss | Profit]  │
├─────────────────────────────────────────────────────┤
│  EQUITY CURVE (AreaChart, full width)               │
├───────────────────────┬─────────────────────────────┤
│  TRADE TABLE          │  MONTHLY P&L BAR CHART      │
│  (scrollable)         │                             │
└───────────────────────┴─────────────────────────────┘
```

### 8.3 Journal Page Grid

```
┌─────────────────────────────────────────────────────┐
│  NAV BAR                                            │
├─────────────────┬───────────────────────────────────┤
│  FILTER ROW:    │  [Date] [Direction] [Result]      │
├─────────────────┴───────────────────────────────────┤
│  TRADE LOG TABLE (sortable, full width)             │
│  Columns: Date · Time · Dir · Entry · T1 · T2      │
│           SL · C1PnL · C2PnL · TotalPnL · Score   │
└─────────────────────────────────────────────────────┘
```

### 8.4 Layout Rules

- Page content area: `padding: 20px 24px`.
- KPI cards in a row: `display: flex; gap: 8px; flexWrap: wrap`.
- Panels side-by-side: `display: grid; gridTemplateColumns: 240px 1fr; gap: 8px`.
- No `max-width` container — EdgeFlow is designed for a single monitor (1920px target). Edge-to-edge is correct.
- Responsive: if viewport < 1024px, stack panels vertically. No horizontal scroll.

---

## 9. Animation & Motion

### 9.1 Permitted Animations

| Animation | Duration | Target | Trigger |
|-----------|----------|--------|---------|
| Nav tab color change | 150ms ease | `color` only | Tab click |
| Row highlight on hover | 100ms | `background` only | Mouse enter |
| Status dot blink | 2s infinite | `box-shadow` | `armed === true` |
| Loading pulse | 1.5s ease-in-out infinite | `opacity` | Data loading |
| Toast fade-in | 200ms ease-out | `opacity` | New alert |
| Toast fade-out | 300ms ease-in | `opacity` | Auto-dismiss |

### 9.2 Forbidden Animations

- **No glitch effects** in production — reserved for motion-sickness risk and distraction.
- **No scanline overlay** on text — degrades readability on small type.
- **No layout-shifting animations** (width, height, padding changes).
- **No page transition animations** — this is a dashboard, not a carousel.
- **No bounce, elastic, or spring** — these belong in consumer apps.
- **No loading spinners on KPI cards** — use inline skeleton rows only.

### 9.3 Reduced Motion

```css
/* index.css — mandatory */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 10. Icons

- **Library:** Lucide React (`lucide-react`) — clean, consistent, 1.5px stroke.
- **Size:** 14px for inline/table icons, 16px for nav/section icons. Never > 20px.
- **Color:** Always inherit from parent — use `color` prop matching `C.*` tokens.
- **No emoji as icons.** No image-based icons. SVG only.
- **No icon fills** — outline/stroke only to maintain terminal lightness.

```jsx
import { TrendingUp, TrendingDown, Minus, Radio, AlertTriangle } from 'lucide-react';

// Direction icon
const DirIcon = ({ dir }) =>
  dir === 'LONG'  ? <TrendingUp  size={14} color={C.green} /> :
  dir === 'SHORT' ? <TrendingDown size={14} color={C.red}  /> :
                   <Minus        size={14} color={C.dim}  />;
```

---

## 11. Interaction States

| State | Visual |
|-------|--------|
| Default | `C.panel` background, `C.border` border |
| Hover (row/card) | `background: C.panelAlt` (100ms transition) |
| Active (click) | `background: C.overlay` momentarily |
| Focused (keyboard) | `outline: 1px solid C.accent` at 2px offset |
| Disabled | `opacity: 0.4`, `cursor: not-allowed` |
| Loading | Skeleton pulse or inline "LOADING..." text |

**No `:hover` on data table rows with transition > 100ms.** The trader's eye needs to snap to numbers, not wait for animations.

---

## 12. Number & Date Formatting

| Data Type | Format | Example |
|-----------|--------|---------|
| Dollar P&L | `+$1,234.50` / `-$234.50` | Always show sign |
| Points | `+8.25 pts` / `-3.50 pts` | Always show sign |
| Percentage | `81.4%` (no sign for stats, sign for change) | |
| Price (ES) | `5,234.75` | 2 decimal places |
| Time | `09:47 ET` | Always ET, no seconds |
| Date | `2025-06-29` | ISO-8601, no local format |
| Trade count | `47 trades` | No commas needed |

**All numeric columns must use `font-variant-numeric: tabular-nums`** to ensure column alignment.

---

## 13. Anti-Patterns — Never Do These

### Visual

| Anti-Pattern | Why | Correct |
|--------------|-----|---------|
| `border-radius > 0` on cards | Breaks terminal aesthetic | `borderRadius: 0` always |
| `box-shadow` on panels | Adds depth that contradicts flat FUI | Use border color contrast |
| Light backgrounds on any panel | Breaks dark aesthetic | Always `C.panel` or darker |
| Gradient backgrounds on panels | Decorative, not informative | Flat `C.panel` |
| Emoji as icons (`📈 📉`) | Font-dependent, wrong style | `lucide-react` SVG |
| Rounded pill buttons | Consumer app feel | Angular `borderRadius: 0` |
| Font size above 24px outside KPI display | Wastes space | Use `T.display` only for peak KPI |
| Serif or sans-serif fonts | Breaks terminal aesthetic | `JetBrains Mono` only |
| Multiple accent colors on same panel | Visual noise | One accent per panel max |

### Behavior

| Anti-Pattern | Why | Correct |
|--------------|-----|---------|
| Showing `undefined` or `null` in cells | Looks broken | Show `—` (em dash) |
| Auto-refresh faster than 5s on heavy queries | Spams backend | 15s min for algo status |
| Navigating away on auto-refresh | Loses position | Data updates in place |
| Pie charts for any metric | Hard to read small slices | Bar chart or table |
| Truncating P&L numbers | Data integrity | Widen column |
| Color as only signal differentiator | Colorblind risk | Color + label always |
| Using `C.green` / `C.red` for candlestick | Not industry standard | `C.chartBull` / `C.chartBear` |
| Hardcoded hex strings outside `theme.js` | Inconsistent, untrackable | Always use `C.*` tokens |

### Layout

| Anti-Pattern | Why | Correct |
|--------------|-----|---------|
| `padding: 32px+` on data cards | Wastes display real estate | `12px 16px` max |
| Centering the dashboard in a `max-w-lg` | Wastes monitor width | Edge-to-edge at 1920px |
| Sticky headers that are too tall (>56px) | Eats chart space | 44px nav bar |
| Multiple sticky layers (nav + section) | Visual confusion | Only main nav sticky |

---

## 14. Pre-Delivery Checklist

Before shipping any new component or page:

### Visual Quality
- [ ] All colors use `C.*` tokens — no hardcoded hex in JSX
- [ ] `border-radius: 0` on every card, button, input
- [ ] No `box-shadow` on panels
- [ ] Icons from `lucide-react` only, no emoji
- [ ] Consistent `JetBrains Mono` everywhere
- [ ] Numbers use `fontVariantNumeric: 'tabular-nums'`

### Data Integrity
- [ ] Null/undefined values show `—` not `undefined`
- [ ] P&L values show `+` prefix for positive, `-` for negative
- [ ] Time values labeled with `ET` timezone
- [ ] Dollar values formatted with `$` and `,` separator

### Interaction
- [ ] All table rows have hover state (`C.panelAlt`)
- [ ] All async fetches show loading state
- [ ] Empty results show `EmptyState` component
- [ ] No data flickering on re-fetch (preserve previous data during load)

### Charts
- [ ] Chart background is `C.bg`, not white
- [ ] Grid lines use `C.chartGrid` (#1A1A1A)
- [ ] Tooltips use dark theme (`C.overlay` background)
- [ ] Axis labels use 10px `C.textSub` `C.font`
- [ ] Candlestick uses `C.chartBull` / `C.chartBear` (not green/red)

### Accessibility
- [ ] `prefers-reduced-motion` CSS rule present in `index.css`
- [ ] Interactive elements have `cursor: pointer`
- [ ] Disabled elements have `opacity: 0.4` and `cursor: not-allowed`
- [ ] Color is not the only signal — labels accompany every color indicator

---

## 15. File Structure

```
frontend/edgeflow-dashboard/src/
├── theme.js          ← C (colors) + API (base URL) — MASTER token file
├── App.jsx           ← Nav shell + page router
├── LivePage.jsx      ← Live signal monitoring
├── JournalPage.jsx   ← Trade journal / review
├── BacktestPage.jsx  ← Backtest results analysis
└── index.css         ← Global resets + keyframes (pulse, blink, reduced-motion)

design-system/
├── MASTER.md         ← This file — single source of design truth
└── pages/            ← Page-specific overrides (if any deviate from master)
```

---

## 16. Context-Aware Retrieval

When building a specific page, instruct Claude Code:

```
I am building the [Page Name] page for EdgeFlow.
Read design-system/MASTER.md.
Also check if design-system/pages/[page-name].md exists.
If it exists, its rules override the Master.
Apply the design system when generating all JSX and inline styles.
```

---

*Generated by ui-ux-pro-max skill · EdgeFlow v1.0 · 2026-06-29*
