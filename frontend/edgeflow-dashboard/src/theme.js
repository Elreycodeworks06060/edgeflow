// Wentworth Edition — design tokens
export const C = {
  // ── Backgrounds ───────────────────────────────────────
  bg:        '#F8F8F0',   // cool ivory — page root
  panel:     '#FFFFFF',   // card surface
  panelAlt:  '#F5F3EC',   // hover / alternating rows
  overlay:   '#FAFAF8',   // modals, dropdowns

  // ── Borders ───────────────────────────────────────────
  border:    '#E8E3D9',
  borderHi:  '#D4CEC4',

  // ── Text ──────────────────────────────────────────────
  text:      '#2C2C2C',
  textSub:   '#6B6B6B',
  dim:       '#9E9E9E',

  // ── Semantic Accents ──────────────────────────────────
  accent:    '#C9A84C',   // gold — active states & key highlights (sparingly)
  green:     '#1B4332',   // win / profit / armed / long
  amber:     '#C9A84C',   // alias for accent (neutral / caution)
  red:       '#722F37',   // loss / negative / disarmed / short

  // ── Chart-specific ────────────────────────────────────
  chartBull: '#26A69A',   // industry-standard teal (accessibility)
  chartBear: '#EF5350',   // industry-standard red  (accessibility)
  chartGrid: '#F0EDE6',   // barely-there gridlines
  chartLine: '#C9A84C',   // gold equity curve

  // ── Typography ────────────────────────────────────────
  fHeading:  "'Cormorant Garamond', Georgia, serif",
  font:      "'Inter', system-ui, -apple-system, sans-serif",
};

// Shared card surface style — all panels use this
export const CARD = {
  background: '#FFFFFF',
  border: '1px solid #E8E3D9',
  borderRadius: 8,
  boxShadow: '0 1px 4px rgba(44,44,44,0.06)',
};

export const SP = { sp1:4, sp2:8, sp3:12, sp4:16, sp5:20, sp6:24, sp8:32, sp10:40 };
export const API = 'http://127.0.0.1:8000';
