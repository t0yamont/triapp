# TriFlow — Figma Redesign Brief

A complete design brief to rebuild the TriFlow interface in Figma. **Keep the idea** — a
scientific-instrument training console rendered in dark *glassmorphism* — while you re-lay-out
and refine it. Produce **two frame sets for every screen: Desktop (web) and Mobile.**

> This brief is the source of truth for look & feel. The product logic (what the numbers mean,
> how they're computed) is fixed and described in §1 and §11 — do not change it, only present it.

---

## 0. How to use this brief

1. Set up the **Foundations** (§2–§3) first as Figma **variables/styles**: colors, type, radii,
   effects. Everything else references them.
2. Build the **glass material** and the **aurora background** as reusable components (§3.5, §3.2).
3. Build the **core components** (§4) as Figma components with variants.
4. Lay out each **page** (§6) at **Desktop 1440** and **Mobile 390**, following §5 and §7.
5. Honour the **product truths** in §11 — they constrain what every screen must show.

Keep it a **redesign, not a reskin**: you may re-compose layouts, but preserve the concept,
the data each screen shows, the dark+glass identity, and the accent discipline.

---

## 1. What TriFlow is (product context)

**TriFlow is an adaptive, multi-sport endurance training platform (triathlon / running /
cycling).** Its core is a physiology engine that:

- detects an athlete's physiological **thresholds** from device data (HR, power, pace, HRV),
- builds a periodised **training plan** under hard safety **guardrails**,
- **adapts** that plan daily from **readiness** signals, and
- explains every number and every change in plain language.

**The engine is the product.** Everything in the UI exists to feed it data or present its
output with authority and calm.

**Audience & scene.** Serious age-group triathletes and endurance runners/cyclists (data-literate,
already wearing an HRV/GPS device), and later their coaches. They check the app **on a phone at
~5:45am before a session** ("what am I doing today, and should I?") and **study it on a laptop**
when planning a block. Often tired, often low light → **dark-first is a physical requirement,
not a style choice.**

**Emotional register.** Trust and quiet authority. The app makes a consequential call (train hard
vs ease off) and must always show its reasoning. Never hype, never gamified, never cutesy.

**Two non-negotiable ideas the design must carry:**
1. **A number is never shown without its confidence.** Every physiological value carries a small
   **confidence indicator** (§4.5).
2. **Every plan change is explained** in one athlete-readable sentence.

---

## 2. Design concept — "Instrument glass"

**Thesis:** a calm **mission-console / flight-deck instrument**, not a lifestyle wellness app and
not a flat admin dashboard. Depth comes from **material** (frosted glass floating over a near-black
aurora-lit ground), never from decoration.

**Recognisable with all content removed:** near-black cool ground · a faint hairline instrument
grid · a slow, low-alpha **aurora glow** · frosted-glass panels with thin light-catching top edges ·
one cool **periwinkle-indigo** accent · data set in tabular mono.

**Accent discipline (important).** The **aurora background tint** is the only place colour fills a
large area, and even it is a low-alpha *accent* — it must never wash over panels, text, or controls.
Panels stay neutral glass; the interactive accent stays periwinkle. Semantic colours (ready/caution/
stop) are used only for state, never as decoration.

---

## 3. Foundations

### 3.1 Colour tokens

Define these as Figma variables (a `color/` collection). Values are the production tokens.

**Grounds (near-black, faint indigo bias — a *chosen* neutral, not grey):**

| Token | Hex | Use |
|---|---|---|
| `bg` | `#06070A` | app base ground |
| `bg-elev` | `#0B0D14` | slightly raised ground / rail interior |
| `surface` | `#0E111A` | opaque fallback (rare; prefer glass) |
| `raised` | `#151926` | opaque raised fallback |

**Text:**

| Token | Hex | Use |
|---|---|---|
| `text` | `#EAECF2` | primary text, headings, key numbers |
| `muted` | `#98A2B6` | secondary text, labels |
| `faint` | `#616B7E` | tertiary, captions, disabled, grid |

**Accent (periwinkle-indigo — the single interactive brand colour):**

| Token | Hex | Use |
|---|---|---|
| `accent` | `#6D8BFF` | primary buttons, active nav, focus, links, selection |
| `accent-bright` | `#8AA0FF` | hover, emphasis, "in-range" values |
| `accent-dim` | `#4E63C4` | pressed / low-emphasis accent |

**Aurora gradient (brand-only: brandmark + the readiness ring — never a UI background fill):**
`aurora-from #7C6CF5` → `aurora-via #6D8BFF` → `aurora-to #34E0C8`.

**Semantic state (luminous, dark-tuned — distinct from the accent):**

| Token | Hex | Meaning |
|---|---|---|
| `ok` | `#35D6A4` | ready / good / success |
| `warn` | `#F4B740` | caution / eased / attention |
| `risk` | `#FF6B7A` | stop / breach / overreach |

**Training zones (5-zone easy→max; the 3-zone roll-up S1/S2/S3 borrows z1/z3/z5):**
`z1 #6B7A90` · `z2 #35D6A4` · `z3 #F4B740` · `z4 #FB8B4C` · `z5 #FF6B7A`.

**Sport hues (kept distinct from the accent):**
`run #FB8B4C` · `bike #4CA6FF` · `swim #34E0C8` · `strength #B07CFF`.

**Confidence bands:** `high #35D6A4` · `medium #F4B740` · `low #FB8B4C` · `none #616B7E`.

### 3.2 The readiness "climate" — the adaptive background

The aurora ground **tints to the athlete's current readiness state.** This is a signature feature:
the whole app quietly reflects how the athlete is tracking. It is a **background accent only** — a
low-alpha bloom behind the glass. Build one aurora component with a **Climate** variant.

Each climate = three radial-gradient bloom colours (placed top-left, top-right, bottom) + an
indicator dot colour + a label:

| Climate | Meaning | Bloom colours (rgba) | Dot |
|---|---|---|---|
| **Primed** | fresh, ready for hard work | `rgba(45,214,150,.46)`, `rgba(52,224,200,.30)`, `rgba(70,185,255,.36)` | `#35D6A4` |
| **Steady** | tracking to plan (default) | `rgba(124,108,245,.50)`, `rgba(52,224,200,.30)`, `rgba(109,139,255,.44)` | `#6D8BFF` |
| **Strained** | readiness down, easing load | `rgba(244,183,64,.44)`, `rgba(251,139,76,.28)`, `rgba(236,120,92,.38)` | `#F4B740` |
| **Overreached** | multi-day stress, backing off | `rgba(255,107,122,.48)`, `rgba(214,88,150,.30)`, `rgba(150,80,210,.40)` | `#FF6B7A` |
| **Peaking** | sharpening for a race | `rgba(150,90,245,.50)`, `rgba(210,96,224,.30)`, `rgba(120,110,250,.44)` | `#B07CFF` |

Show the active climate as a small chip (dot + label + one-line hint) in the Today header.

**Build the aurora in Figma:** a base rect `#06070A`; three large **ellipses** with radial
gradient fills (climate colour → transparent), one top-left, one top-right, one bottom-centre;
apply **Layer blur ≈ 90–120** to each; group and set the group to sit **behind everything**. Over
it, a **hairline grid**: 44–46px squares, stroke `rgba(255,255,255,.03)`, 1px, masked with a
top-down gradient so it fades out lower on the page. Keep total bloom subtle — it should read at
the corners and bleed faintly through panels, not dominate.

### 3.3 Typography

- **UI / body:** *Inter* (or a clean neutral grotesk; a system UI stack is acceptable — this is an
  Operate surface, so use a workhorse face, not a trendy display face).
- **Data / numerals:** *JetBrains Mono* (or any clean monospace). **Always `tabular-nums`** wherever
  digits align (times, watts, loads, percentages).

Type scale (size / line-height / tracking / weight):

| Style | Size | LH | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `stat` | 52 | 1.0 | −0.03em | 650 | the big readiness score, hero numbers |
| `display` | 34 | 1.05 | −0.02em | 600 | page titles, today's session name |
| `h1` | 24 | 1.15 | −0.015em | 600 | section headers |
| `h2` | 17 | 1.3 | −0.01em | 600 | card titles |
| `body` | 15 | 1.55 | 0 | 400 | prose, descriptions |
| `label` | 12.5 | 1.4 | 0 | 500 | labels, chips, meta |
| `mono` | 13.5 | 1.4 | 0 | 500 | data values |

**Uppercase micro-labels** (e.g. "TODAY'S SESSION", "THIS WEEK", "ATTENTION") use `label` size,
`faint` colour, **letter-spacing 0.18em**. Give headings `text-wrap: balance`.

### 3.4 Spacing, radii, grid

- **Radii:** control (buttons, inputs, chips) **10px** · card/panel **16px** · large sheet/rail
  **20px** · pill/dot **999px**.
- **Spacing rhythm:** 4 / 8 / 12 / 16 / 20 / 24 / 32. Panels use **24px** internal padding on
  desktop, **16–20px** on mobile. Gaps between panels **24px** (desktop), **16px** (mobile).
- **Layout grid (desktop):** content max-width **1180px**, centred, beside a **248px** nav rail.
  A 12-col grid inside the content area is fine, but most screens use simple flex/auto-layout.
- More space **above** a heading than below it. One rhythm throughout.

### 3.5 The glass material (build this exactly)

Two variants. Recreate in Figma with layered fills + a **Background blur** effect (not Layer blur —
it must blur the aurora *behind* it).

**`glass` (default panel):**
- Fill A (bottom): solid `#0B0D16` at **55% opacity** (the translucent dark base that lets the
  aurora show through).
- Fill B (top): linear gradient, top `rgba(255,255,255,.07)` → bottom `rgba(255,255,255,.015)`.
- Effect: **Background blur 22**, saturation ~140% (approximate with a slight vibrancy).
- Stroke: **1px inside**, `rgba(255,255,255,.09)`.
- Effect: **Drop shadow** `x0 y24 blur50 spread-28`, black **75%** (deep, soft lift).
- Effect: **Inner shadow** `x0 y1 blur0`, white **8%** (the top light-catching edge).
- Corner radius **16**.

**`glass-raised` (hero panels, rail, popovers):** same recipe, but dark base `#0D101A` @ **52%**,
white top-sheen `.09→.02`, **Background blur 26**, stroke white **12%**, drop shadow
`y30 blur60 spread-30` black **85%**, inner top-edge white **12%**.

**Rules:** main surfaces are always glass — never a flat opaque card. Insets *inside* a panel
(e.g. a structure/targets block) may use `rgba(255,255,255,.03)` fills with a `rgba(255,255,255,.06)`
hairline border, no blur.

### 3.6 Elevation & glow

- **Panel lift:** the glass drop shadows above.
- **Accent glow** (primary button, active nav marker, live "today" dot): a soft periwinkle
  outer glow — e.g. drop shadow `rgba(109,139,255,.6) blur 24 spread -8`, plus a 1px accent ring
  for buttons.
- **Confidence / status dots** get a matching coloured glow `0 0 8px <color>@65%`.

### 3.7 Motion (subtle — over-animation reads as generic)

- Aurora bloom: a very slow **22s** drift (translate + scale + gentle opacity breathe).
- Page/section entrance: a 0.5s **fade + 8px rise**.
- Controls: 150–200ms ease on hover/active (`cubic-bezier(0.2,0,0,1)`).
- Respect **reduced-motion**: disable the aurora drift and entrance animations.

### 3.8 Iconography

Thin **line icons**, ~1.6px stroke, rounded caps, ~18–20px, `currentColor`. Draw them in the
instrument grammar (nav: today = target/reticle, calendar = grid, activities = pulse/waveform,
analytics = bars, races = flag, settings = sliders). Avoid emoji and filled/novelty icons.

### 3.9 Accessibility

- Legible contrast in a dark room: body text `#EAECF2`/`#98A2B6` on the dark ground; don't drop
  important text below `faint` on lit corners of the aurora.
- Visible **focus** state: 2px `accent` ring, 2px offset.
- Don't encode meaning by colour alone — pair state colour with a label or icon (e.g. "Below range",
  "HARD", "auto").
- Minimum touch target 44px on mobile.

---

## 4. Core components (build as Figma components with variants)

### 4.1 Panel / Card
Glass (§3.5). Variants: `default` / `raised`. Optional uppercase micro-label header row.

### 4.2 Button
- **Primary:** `accent` fill, white text, periwinkle glow + faint top-highlight. Hover → `accent-bright`.
- **Secondary:** frosted glass (`rgba(255,255,255,.06)` fill, white 12% stroke, small blur). Hover lighter.
- **Ghost:** text-only `muted` → `text`, faint hover wash.
- Radius 10, height ~40 (desktop) / 44 (mobile), `label` weight 500.

### 4.3 Input / Select / Field
Glass field: `rgba(255,255,255,.04)` fill, white 10% stroke, radius 10, `body` text, `faint`
placeholder. Focus → `accent` border + accent ring, slightly lighter fill. Field = label (`label`
`muted`) + control + optional hint (`faint`) / error (`risk`).

### 4.4 Chips & badges
- **Sport chip:** coloured dot (sport hue) + label, on a faint `rgba(255,255,255,.05)` pill.
- **Zone badge:** `S1 · Aerobic` / `S2 · Threshold` / `S3 · VO₂`, tinted border+fill in the zone
  hue (z1/z3/z5), text in the zone hue.
- **Climate chip:** glowing dot (climate colour) + label + one-line hint.
- **Status chip:** "Guardrails clear" (ok) / "Needs attention" (risk) — dot + label on a tinted pill.

### 4.5 ConfidenceDot (critical, appears everywhere a number does)
A small (6px) dot with a coloured glow + a short label, e.g. "● from your threshold estimate".
Colour by band: high `#35D6A4`, medium `#F4B740`, low `#FB8B4C`, none `#616B7E`. **A physiological
number without a confidence indicator is a bug.**

### 4.6 Readiness ring (hero instrument)
A circular **gauge**: a faint full track (`rgba(255,255,255,.07)`, ~11px) + a progress arc from the
top, length = score/100, **stroked with a gradient that reads state**:
- below → `#F4B740 → #FF6B7A` (amber→coral)
- in range → aurora `#7C6CF5 → #34E0C8`
- above → `#35D6A4 → #6D8BFF` (mint→periwinkle)

Centre: the **score** in `stat` (coloured by state) + "READINESS" micro-label. Rounded arc cap, a
soft outer glow.

### 4.7 Component band-gauge (readiness breakdown)
Per signal (HRV, Resting HR, Sleep, Wellness, Completion): a row of `label` name · a thin track with
a **central smallest-worthwhile-change band** (a lighter segment ±one step around a centre tick) and
a **glowing marker dot** positioned by the signal's standardised deviation · a right-aligned band
label ("Below range" warn / "In range" accent / "Above range" ok). **Never show the score alone.**

### 4.8 Bars & mini-charts
- **Week load bars:** per day, a faint planned "track" bar (`rgba(255,255,255,.06)`) with a filled
  "completed" bar over it (`rgba(255,255,255,.25)`, or `accent` + glow for *today*).
- **Distribution bar:** a thin stacked bar S1/S2/S3 in z1/z3/z5, with the target shown numerically.
- Give real charts (CTL/ATL/TSB, decoupling) the same care: faint grid, area fill, emphasized
  endpoint, tabular axis labels.

### 4.9 Session chip (calendar)
Small glass tile: sport dot + title (e.g. "Threshold Run", may wrap 2 lines) · second line
`45m · S2` (mono, zone-coloured code) · an **amber left edge bar** if it's a hard/key session ·
draggable affordance; **selected** = accent ring.

### 4.10 Adaptation / feedback banner
A tinted glass strip: an icon (warn triangle / ok check / info) + one athlete-readable sentence +
(for edits) small "move" badges like `Run Thu → Sat · you` / `Bike Sat → Mon · auto` + **Undo**.
Tone by outcome: eased/adjusted = `warn`, repaired-ok = `ok`, breach = `risk`.

### 4.11 Navigation
- **Desktop rail** (248px, `glass-raised`, full height, floating with 12px margin): brandmark
  (aurora-gradient tile + "TRIFLOW" tracked caps) · nav items (line icon + label; **active** = faint
  glass pill + `accent` text + a 3px accent glow bar on the left) · footer athlete chip.
- **Mobile bottom tab bar** (`glass-raised`, floating, fixed bottom): the same items as icon +
  tiny label; active in `accent-bright`.

---

## 5. Deliverables & Figma setup

**For every screen, deliver two frames:**

- **Desktop / Web** — frame **1440 × 1024** (also sanity-check a 1280-wide variant). Left nav rail
  248px; content centred, max 1180px, generous 24px gaps.
- **Mobile** — frame **390 × 844** (iPhone-class). No rail; **bottom tab bar**. Single column,
  16px page padding, 16px gaps. Sticky page title.

Setup: one **aurora background** component (Climate variant) behind each frame · **variables** for
all colours/type/radii · **components** for §4 · **auto-layout** everywhere (so panels reflow) ·
wide content (calendar week, wide tables, charts) gets a **horizontal-scroll container** on mobile,
never a sideways-scrolling page.

Recommended default climate for library frames: **Steady** (periwinkle). Also produce **one** Today
frame in **Strained** (amber) to show the adaptive background, and swatch the other three climates.

---

## 6. Page-by-page instructions

Order reflects the athlete's journey. Each page: **Purpose · Shows · Web · Mobile · States.**
Nav order in the app: Today · Calendar · Activities · Analytics · Races · Settings.

### 6.1 Welcome / Auth (`/`, `/signin`, `/signup`)

- **Purpose:** get the athlete in with minimal friction and immediate credibility.
- **Shows:** brandmark + one-line value prop ("Adaptive endurance training, anchored to your
  measured physiological thresholds"), email + Google + Apple auth, a link to sign in/up.
- **Web:** a single centred `glass-raised` card (~440px) on the aurora ground; brandmark above,
  auth buttons stacked, legal/medical microcopy in `faint` below. No nav rail on auth.
- **Mobile:** same card, full-width minus 20px gutters, vertically centred.
- **States:** loading, invalid email (Field error), "auth provider unavailable".

### 6.2 Onboarding — About + consent (`/onboarding/about`)

- **Purpose:** capture identity basics and **health-data consent + medical disclaimer** (required).
- **Shows:** name/DOB/sex/units; consent checkboxes for health data; a clear, non-scary medical
  disclaimer ("TriFlow provides training guidance, not medical advice. Seek medical clearance
  before starting a programme."); primary "Continue".
- **Web:** one centred glass card, a stepper/progress hint (About → Availability → Plan). Fields in a
  tidy 1–2 col auto-layout.
- **Mobile:** single column, sticky "Continue" at the bottom.
- **States:** consent-not-given disables Continue with an inline reason.

### 6.3 Onboarding — Availability (`/onboarding/availability`)

- **Purpose:** capture training availability — a **hard input** to the planner (don't make it skippable).
- **Shows:** which days they can train + minutes per day; which days they can swim; the long-ride day;
  weekly hours ceiling; primary sport.
- **Web:** a 7-day row of day toggles with minute inputs; long-ride day picker; hours ceiling
  slider/stepper. Glass card.
- **Mobile:** a vertical list of days with a minutes stepper each; grouped sections.
- **States:** zero available days blocks Continue; show the resulting weekly hours total live.

### 6.4 Onboarding — Plan generation

- **Purpose:** turn inputs into a plan while building trust by **showing the real stages** (not a fake
  spinner).
- **Shows:** sequential stages — *Building athlete model → Laying out phases → Placing key sessions →
  Checking safety limits → Done* — each ticking to complete. Then a first-run panel: "Here's what we
  know, here's what we don't, and here's the first test we've scheduled."
- **Web/Mobile:** a centred glass card with a vertical checklist that animates through the stages;
  finish → CTA into Today.

### 6.5 Today (default) (`/today`) — **the flagship**

- **Purpose:** the athlete grasps **today's decision and its reason** in seconds, and trusts it.
- **Shows (four regions):**
  1. **Header:** "Today" (`display`) + date/phase ("Thursday, Build week 3") + the **climate chip**
     (dot + label + hint). A "Preview · sample athlete" pill until real data is connected.
  2. **Today's session** (hero, `glass-raised`): sport chip; big session **name** (`display`) + a
     **zone badge** for the *effective* zone; duration pill + one-line **"why this session"**; if the
     session was adapted, an **adaptation banner** (e.g. "Adjusted — eased S3 to S2 …" with the
     reason); a **Structure / Targets** inset (targets in mono + a **ConfidenceDot**); actions
     **Start session** (primary) + **Move to another day** (secondary).
  3. **Readiness** (`glass`): the **ring** (§4.6) with the score, then the **component band-gauges**
     (§4.7) for HRV / Resting HR / Sleep / Wellness / Completion, each against its own band; footnote
     "Scored against your own 60-day baseline … never a single day."
  4. **This week** (`glass`): 7-day **load bars** (completed vs planned, today highlighted) + total
     "304 / 855 load · 36%"; a **distribution bar** S1/S2/S3 vs target.
  5. **Attention** (`glass`): appears **only when something is true** — a scheduled test, a confidence
     gate, a pending plan change. Tinted left-edge items with icon + text.
- **Web:** two-column grid — left (wider, ~1.45fr): Session then Week; right (~1fr): Readiness then
  Attention. 24px gaps.
- **Mobile:** single column in priority order: Session → Week → Readiness → Attention. The ring scales
  down but stays the hero of its card.
- **States:** no device/plan yet → the "Preview" pill + component empty-states ("Connect a wearable or
  log daily wellness"); adapted vs not-adapted (banner shows/hides); Attention empty → the whole card
  is omitted.

### 6.6 Calendar (`/calendar`)

- **Purpose:** view and rearrange the week; **drag a session to another day** and watch the engine keep
  the week safe.
- **Shows:** the training week as **7 day columns**, each with its **session chips** (§4.9), rest days
  as a dashed "Rest" placeholder, today's column accented, a **"Guardrails clear / Needs attention"**
  status chip, and phase label. On a move: a **feedback banner** (§4.10) — "Moved your run to Saturday.
  To keep your hard days spaced out, I moved your bike from Saturday to Monday." — with per-edit badges
  and **Undo**.
- **Interaction:** **drag-and-drop** on desktop; **tap-to-pick then tap-a-day** on mobile (show a
  "Move here" affordance on droppable days and a selected ring on the picked chip). Every move is
  validated + auto-repaired by the engine; show what moved before commit.
- **Web:** 7 columns across the content width (~120–150px each). Optional Month/Week toggle (Week is
  primary). Feedback banner spans below the board.
- **Mobile:** the 7-column board in a **horizontal-scroll** container (columns ~120px), or an
  alternative **vertical day list** — pick one and keep drag/tap working. Feedback banner sticky above
  the tab bar.
- **States:** clean move (no repair) → simple "Moved …"; repaired → "…also moved …"; **couldn't
  rebalance** → risk-toned banner listing the breach; Undo available after any change.

### 6.7 Activities (`/activities`) — list + detail

- **Purpose:** review completed sessions; open one for full analysis.
- **Shows (list):** a scannable list of activities — date, sport, title, duration, distance, the
  **three load figures** (TSS / TRIMP / sRPE) side by side (flag disagreement past threshold), and a
  completion tick. **Never load activity streams in the list view** (performance rule) — list renders
  from summaries only.
- **Shows (detail):** header (sport, date, duration, distance, the three loads); a **map** with a
  metric-coloured route; an **overlay chart** (any two of HR, pace/GAP, power, cadence, altitude,
  temperature, DFA-a1) with a shared crosshair, lap markers, drag-to-zoom, selection stats; a **zone
  distribution** (5-zone bar + the S1/S2/S3 roll-up); a **decoupling** panel for sessions ≥75 min
  (first-half vs second-half).
- **Web:** list = rows in a glass panel (or a virtualised table); detail = a two-column layout (map +
  key stats left, charts right) or stacked sections.
- **Mobile:** list = compact cards; detail = stacked sections, chart full-width with horizontal-scroll
  for the timeline, pinch/drag to zoom.
- **States:** streams still loading (skeleton on the chart only, list already shown); load figures
  disagree (a small warn flag); no map data (hide the map).

### 6.8 Analytics (`/analytics`)

- **Purpose:** the training-state overview — fitness, fatigue, form, and the durability edge.
- **Shows:** **CTL / ATL / TSB** trend chart (fitness/fatigue/form over time); a **rolling 3-week
  distribution** vs target (are they too polarised / too grey-zone?); **decoupling** trend (>5% flags
  a durability limiter); **durability index** trend; and any **weekly re-planning** flags (under- or
  over-completion, apparent fitness change → test scheduled, body-mass change). Every metric shows its
  confidence/trend, not just a value.
- **Web:** a grid of glass "stat + chart" tiles; the CTL/ATL/TSB chart wide across the top; smaller
  tiles below. Give charts an area fill, faint grid, emphasized latest point.
- **Mobile:** stacked full-width tiles; charts scroll horizontally inside their tile.
- **States:** insufficient history → "Not enough data yet — keep logging"; a metric out of tolerance →
  a warn/risk accent on that tile + a one-line explanation.

### 6.9 Races (`/races`)

- **Purpose:** manage the race calendar that drives the whole plan.
- **Shows:** upcoming races as cards — name, date, distance/type, **priority (A/B/C)** clearly marked,
  expected conditions; the **A race** visually dominant (it owns the macrocycle); countdown/weeks-out;
  add/edit a race. Show how each race maps to plan structure (A = drives phases; B = local taper; C =
  trained through).
- **Web:** a timeline or a list of race cards, A race featured (larger, accent-framed); "Add race" CTA.
- **Mobile:** stacked race cards, A race pinned at top.
- **States:** no races → an empty state inviting the first race; two A races <12 weeks apart → a warn
  note ("we'll treat the second as a B race for planning").

### 6.10 Settings (`/settings`)

- **Purpose:** manage profile, availability, connected devices, thresholds, and preferences.
- **Shows:** sections — **Profile** (name, units, timezone), **Availability** (reuse §6.3 controls),
  **Devices & connections** (connect Garmin/Strava/Apple Health; connection status), **Thresholds**
  (current LT1/LT2/CP/zones, each with a **ConfidenceDot** and "last tested" + a "schedule a test"
  action), **Notifications**, **Account**. Data/privacy controls for health data.
- **Web:** a settings layout — a left sub-nav of sections + a right content panel (both glass), or
  stacked sections with sticky section headers.
- **Mobile:** a grouped list; each section opens a sub-screen.
- **States:** device connecting/failed; a threshold with low confidence surfaces a "test recommended"
  hint.

---

## 7. Web vs Mobile — adaptation rules

- **Navigation:** Web = the 248px **glass rail** (persistent, active-item glow). Mobile = a floating
  **glass bottom tab bar**; the rail is hidden. Give mobile pages a sticky title area if useful.
- **Columns:** Web uses 2-column dashboards (Today, Analytics) and wide boards (Calendar). Mobile is
  **single column**, in the priority order given per page.
- **Wide content:** calendar week, wide tables, and timeline charts get a **horizontal-scroll
  container** on mobile — the page body never scrolls sideways.
- **Touch:** ≥44px targets; drag interactions must have a **tap-based equivalent** (Calendar).
- **Density:** panel padding 24 → 16–20 on mobile; type scale holds (don't shrink the hero numbers —
  the readiness score and session name stay prominent).
- **The aurora + glass are identical** across web and mobile; only layout and nav change.

---

## 8. Voice & copy

Write from the athlete's side of the screen. Name things by what people recognise ("today's session",
"readiness", not "workout entity" or "HRV z-score"). Active voice; a control says exactly what
happens ("Start session", "Move to another day"). Every adaptation/repair message is **one plain
sentence with the reason** ("Made today easy and trimmed this week 10% — your HRV has been below your
normal range for two days."). Errors say what went wrong and how to fix it. No hype, no exclamation
marks, no gamification.

---

## 9. Anti-patterns to avoid

- Colour washing panels or text with the climate/aurora — it is a **background accent only**.
- A second bright colour competing with the periwinkle accent (semantic colours are for state).
- Flat opaque cards on the main surfaces (they must be glass).
- Showing any physiological number **without** its confidence indicator.
- Trendy display serifs / novelty fonts / emoji section markers / gamified streaks & confetti.
- Over-animation. One slow aurora drift + subtle entrances + control transitions is the budget.
- A dominant grid: the instrument grid is a faint, masked texture, not a visible blueprint.

---

## 10. Suggested Figma file structure

```
TriFlow — Instrument Glass
├── 0 · Cover & this brief
├── 1 · Foundations        (colour, type, radii, effects as variables/styles; glass + aurora demo)
├── 2 · Components         (Panel, Button, Input, Chips, ConfidenceDot, Ring, Gauge, Bars,
│                           SessionChip, Banner, NavRail, TabBar, Icons)
├── 3 · Web                (1440 frames: Auth, Onboarding×3, Today, Calendar, Activities list+detail,
│                           Analytics, Races, Settings)  — Today also in Strained climate
├── 4 · Mobile             (390 frames: same screens)
└── 5 · Climates           (Today shown in Primed / Steady / Strained / Overreached / Peaking)
```

---

## 11. Product truths the design must not break

1. **The engine is the product** — surfaces present its output; they never invent numbers.
2. **A number always travels with its confidence** (ConfidenceDot everywhere).
3. **Every plan change is one audited, athlete-readable sentence** with a reason.
4. **Dark-first** (pre-dawn, post-session, low light).
5. **Semantic colour ≠ accent colour** — ready/caution/stop are state, periwinkle is brand.
6. **Availability and readiness are real inputs** — the plan adapts to them, and the UI shows why.
7. **Performance:** list views never load activity streams; heavy charts lazy-load in detail only.
8. **Climate tint is a background accent**, reflecting readiness, never a colour takeover.

---

*Keep the idea: a trustworthy scientific instrument, rendered as calm dark glass over a living aurora
that breathes with the athlete's readiness. Redesign the layout freely — protect the concept, the
data, and the discipline.*
