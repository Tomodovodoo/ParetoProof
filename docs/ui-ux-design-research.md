# UI/UX Design Research: Benchmark Platform Reference Analysis

> Research date: 2026-03-14
> Sources: anthropic.com (fetched), artificialanalysis.ai (fetched), openai.com (reference knowledge), medium.com (reference knowledge)

---

## 1. Anthropic (anthropic.com)

### Color Palette

| Role | Value | Notes |
|------|-------|-------|
| Primary text / foreground | `#131314` | Near-black, high contrast |
| Accent / CTA | `#d97757` | Rust/terracotta orange |
| Secondary text | `#87867f` | Muted warm gray |
| Text selection highlight | `rgba(204, 120, 92, 0.5)` | Warm brown transparency |
| Modal backdrop | `color-mix(in srgb, var(--swatch--slate-dark) 80%, transparent)` | Modern CSS color-mix |
| Background | Off-white / cream | Light neutral via `--swatch--cloud-light` |
| Slider inactive | `opacity: 0.3` on cloud-light | Subtle fade technique |

**Palette philosophy:** Warm neutral base with a single bold accent color. Extremely restrained -- no competing colors. The terracotta accent creates distinction without visual noise.

### Typography

| Element | Size | Notes |
|---------|------|-------|
| Display XL (hero) | `clamp(2.5rem, 2.04rem + 1.96vw, 4rem)` | 40-64px fluid |
| Display L | `clamp(2rem, 1.69rem + 1.31vw, 3rem)` | 32-48px fluid |
| Display M | `clamp(1.75rem, 1.67rem + 0.33vw, 2rem)` | 28-32px fluid |
| Paragraph M (body) | `clamp(1.125rem, 1.09rem + 0.16vw, 1.25rem)` | 18-20px fluid |
| Monospace | `clamp(0.875rem, 0.53rem + 1.47vw, 2rem)` | 14-32px fluid |

- **Font family:** System font stack (no custom web fonts loaded -- fast performance)
- **Antialiasing:** `-webkit-font-smoothing: antialiased` enabled
- **Link underlines:** `text-underline-offset: 0.08em` (headings), `0.2em` (rich text); `text-decoration-thickness: 0.06em`
- **Line-height trimming:** Uses `::before/::after` pseudo-elements to remove leading

**Key takeaway:** Fluid typography via `clamp()` eliminates breakpoint jumps. Sizes are generous -- body text starts at 18px minimum, making content highly readable.

### Layout

| Property | Value |
|----------|-------|
| Site margin | `clamp(2rem, 1.08rem + 3.92vw, 5rem)` (32-80px) |
| Grid | 12-column via CSS custom properties |
| Gutter | `var(--site--gutter)` |
| Max-width | `min(var(--site--max-width), 100vw)` |
| Desktop breakpoint | `56em` (896px) |
| Container queries | Used for component-level responsive design |

### Navigation

| Property | Value |
|----------|-------|
| Height (desktop) | `4.25rem` (68px) |
| Height (mobile) | `4.375rem` (70px) |
| Banner height | `2.75rem` (44px) |
| Dropdown animation | `400ms cubic-bezier` transition |
| Dropdown mechanism | `grid-template-rows: 0fr -> 1fr` |
| Mobile menu | `clip-path` animation |
| Search focus | Border color transitions to text color |

### Hero Section

- Background element animates from constrained width to full-width on scroll (GSAP ScrollTrigger, `scrub: 0.8`)
- Elements fade in with staggered timing (`0.6s`, `0.8s`, `0.15s stagger`)
- Supports `prefers-reduced-motion` -- all animations disabled gracefully
- Text reveals use GSAP TextPlugin (word-by-word animation)

### Card Design

- Image hover: `transform: scale(1.05)` with `transition: 0.2s ease`
- Cards activate hover via `:has(a):hover` selector
- Slider dots: `12px x 12px`, `border-radius: 50%`, `6px` margin
- Inactive slides: `opacity: 0.3`

### Premium Feel Techniques

1. **Fluid everything** -- typography, spacing, margins all use `clamp()` for seamless scaling
2. **Warm, restrained palette** -- single accent color against warm neutrals feels intentional
3. **Scroll-linked animations** -- parallax and reveal effects tied to scroll position
4. **Micro-interactions** -- hamburger rotation, dropdown grid animation, image scale on hover
5. **Line-height trimming** -- removes optical spacing artifacts for precise vertical rhythm
6. **Accessibility-first** -- `prefers-reduced-motion`, `focus-visible`, `aria-hidden` throughout
7. **Custom scrollbars** -- `6px` thin, `rgba` semi-transparent thumbs on code blocks

### CSS Approach

- **Framework:** Webflow (classes prefixed `w-*`) + GSAP animation library
- **Design tokens:** Extensive CSS custom properties organized by namespace:
  - `--site--*` (layout), `--swatch--*` (colors), `--container--*` (sizing)
  - `--_theme---*` (theme), `--_typography---*` (text)
- **Utilities:** `u-margin-trim`, `u-line-clamp-*`, `u-sr-only`
- **Modern CSS:** `color-mix()`, `clamp()`, `container queries`, `:has()` selector

---

## 2. OpenAI (openai.com)

> Note: openai.com returned 403 on all fetch attempts. Analysis based on documented design system knowledge.

### Color Palette

| Role | Value | Notes |
|------|-------|-------|
| Background (dark) | `#000000` / `#0d0d0d` | Pure or near-black |
| Background (light) | `#ffffff` | Clean white |
| Primary text (dark theme) | `#ececec` / `#f7f7f8` | Off-white for reduced eye strain |
| Primary text (light theme) | `#0d0d0d` / `#1a1a1a` | Near-black |
| Accent / brand green | `#10a37f` | GPT green, used sparingly |
| Secondary accent | `#ab68ff` | Purple for premium/API |
| Link / interactive | `#10a37f` | Consistent with brand |
| Border (dark) | `rgba(255,255,255,0.1)` | Subtle white at 10% |
| Border (light) | `rgba(0,0,0,0.1)` | Subtle black at 10% |
| Card surface (dark) | `#1a1a2e` / `#202123` | Elevated surface |
| Gradient (hero) | Multiple stops blending black to deep purple to teal | Dramatic mesh gradients |

**Palette philosophy:** Primarily monochromatic (black/white) with a single brand accent. Dark theme dominates the marketing site. Color is used extremely sparingly -- when it appears, it commands attention.

### Typography

| Element | Approximate Size | Weight |
|---------|-----------------|--------|
| Hero heading | 64-80px | 600 (Semi-bold) |
| Section heading (H2) | 40-48px | 600 |
| Sub-heading (H3) | 24-32px | 500 (Medium) |
| Body | 16-18px | 400 (Regular) |
| Nav items | 14-15px | 500 |
| Caption/meta | 12-14px | 400 |

- **Font family:** Custom "Sohne" font (proprietary), falls back to system sans-serif
- **Heading font:** "Sohne" or similar geometric sans-serif
- **Letter-spacing:** Tight on headings (-0.02em to -0.04em)
- **Line-height:** ~1.2 for headings, ~1.6 for body

### Layout

- **Max-width:** ~1280px content container
- **Padding:** 80-120px vertical section padding, 24-40px horizontal
- **Grid:** 12-column CSS grid, auto-fill for card grids
- **Section height:** Many sections designed to fill or nearly fill the viewport
- **Spacing scale:** 8px base unit (8, 16, 24, 32, 48, 64, 80, 96, 120)

### Navigation

- **Style:** Fixed/sticky, transparent on dark backgrounds
- **Height:** ~64px
- **Items:** Logo, Products, Research, Safety, Company, Search, Login/Try
- **Desktop:** Clean horizontal links, dropdown menus with animation
- **Mobile:** Hamburger with slide-in panel
- **Transition:** Background opacity changes on scroll (transparent -> solid)

### Landing Page Structure

1. **Hero:** Full-viewport, dark background with animated gradient/mesh, large headline, single CTA
2. **Product showcase:** Cards or feature blocks showing ChatGPT, API, Enterprise
3. **Capabilities:** Visual demos with screenshots/videos
4. **Research highlights:** Cards linking to papers/blog posts
5. **Safety/values:** Mission-oriented messaging
6. **CTA footer:** Final conversion section
7. **Footer:** Comprehensive link grid

### Model Capabilities Presentation

- Feature cards with icon + headline + short description
- Side-by-side comparison layouts
- Interactive demos embedded in-page
- Metric highlights in large typography (e.g., "100M+ users")
- Dark cards on slightly lighter dark backgrounds for depth

### Dark Theme Approach

- Default is dark for marketing presence (premium, tech-forward feel)
- Depth created via layered surfaces (`#000` -> `#0d0d0d` -> `#1a1a2e` -> `#202123`)
- Borders at `rgba(255,255,255,0.08-0.15)` for subtle separation
- Gradients: mesh/radial gradients with purples, teals, blues for visual interest
- Hover states: `rgba(255,255,255,0.05)` background shift

### Premium Feel Techniques

1. **Dramatic dark theme** -- black backgrounds make content feel cinematic
2. **Mesh gradients** -- colorful, abstract gradients in hero create visual depth
3. **Generous whitespace** -- large vertical padding between sections (80-120px)
4. **Typography scale** -- massive hero text contrasted with measured body text
5. **Subtle borders** -- near-invisible borders with very low opacity
6. **Animation** -- smooth scroll-triggered reveals, parallax effects
7. **Monochromatic restraint** -- color only where it matters (CTAs, brand moments)

---

## 3. Artificial Analysis (artificialanalysis.ai)

### Color Palette

| Role | Value | Notes |
|------|-------|-------|
| Background (light) | `#ffffff` | Clean white |
| Background (dark) | `#1f1f1f` | Dark mode option |
| Text (light mode) | Black / `#1a1a1a` | Standard high contrast |
| Borders | `#e5e7eb` | Tailwind gray-200 |
| Meta blue | `#0089f4` | Brand color for Meta models |
| Google green | `#34A853` | Brand color for Google models |
| Anthropic rust | `#cc785c` | Brand color for Anthropic models |
| OpenAI dark | `#1f1f1f` | Brand color for OpenAI models |
| xAI purple | `#736cd3` | Brand color for xAI models |
| Mistral orange | `#fd6f00` | Brand color for Mistral models |
| DeepSeek blue | `#2243e6` | Brand color for DeepSeek models |

**Palette philosophy:** Neutral white base with brand-matched data colors. Each AI company gets its own recognizable color for charts and tables. This is crucial for a benchmark/comparison platform.

### Typography

| Element | Size | Weight |
|---------|------|--------|
| Section headings | 24-32px | Bold (700) |
| Sub-headings | 18-20px | Semi-bold (600) |
| Body / descriptions | 14-16px | Regular (400) |
| Data labels | 12-14px | Medium (500) |
| Table headers | 14px | Bold (700) |
| Table cells | 14px | Regular (400) |

- **Font family:** System sans-serif (likely Tailwind default: Inter or system stack)
- **Data-focused:** Smaller text sizes maximize information density

### Layout

- **Max-width:** ~1400px container
- **Section spacing:** 40-60px vertical gaps
- **Content density:** High -- multiple visualization sections stacked
- **Grid:** 3-4 column layouts on desktop for comparative data
- **Card padding:** ~20px internal

### Navigation

- **Items:** Logo | Models | Speech, Image, Video | Hardware | Leaderboards | Arenas | AI Trends | About
- **Keyboard shortcut:** `Cmd+K` for search
- **Login:** Top right
- **Tab-based filtering** within sections (by model type, provider, region)

### Benchmark Data Display Patterns

**Three primary visualization formats:**

1. **Leaderboard tables:**
   - Ranked model listings with Intelligence Index scores
   - Provider logos left-aligned with model name
   - Numeric scores right-aligned
   - Lightbulb icons for reasoning models
   - Pagination: "28 of 410 models"
   - Sortable columns

2. **Scatter plots:**
   - Intelligence vs. Cost axes
   - Brand-colored data points
   - Quadrant labels ("Most attractive quadrant")
   - Subtle gray grid lines
   - Provider legend as filter

3. **Line charts (frontier trends):**
   - Multi-colored lines per company
   - Date x-axis, performance y-axis
   - Smooth curves with data point markers
   - Light background grid

### Chart Styling

- Data points use **company brand colors** consistently
- Axis labels: small, gray, sans-serif
- Grid lines: subtle, light gray (`#e5e7eb` or lighter)
- Background: white
- Legends: clickable/filterable
- Clear axis titles with units

### Comparison Tables

- Left-aligned model names with provider logo icons
- Right-aligned numeric values
- Bold headers on slightly darker background
- Row hover highlights (subtle background change)
- Sortable column indicators
- Alternating subtle row colors for readability

### Filter / Control UI

- **Toggle pills:** "Open Weights" / "Proprietary", "Reasoning" / "Non-Reasoning"
- **Geographic buttons:** "By Country" tab
- **Provider color pills:** Clickable, color-matched to brand
- **Model count indicator:** "28 of 410 models"
- **"+ Add model"** buttons for custom comparison

### Card / Panel Design

- Minimal borders (`#e5e7eb`)
- Rounded corners: 8-12px estimated
- White background with subtle shadow
- Title + subtitle above visualization
- Consistent internal padding (~20px)

### What Makes It Effective for Data

1. **Brand color consistency** -- same color = same company everywhere
2. **Multiple visualization modes** -- tables for detail, charts for trends, scatter for comparison
3. **Dense but organized** -- lots of data with clear hierarchy
4. **Interactive filtering** -- explore without page reloads
5. **Clear quadrant labeling** -- tells users where to look on scatter plots
6. **Model count context** -- "28 of 410" anchors expectations

---

## 4. Medium (medium.com)

> Note: medium.com returned 403 on all fetch attempts. Analysis based on documented design system knowledge.

### Color Palette

| Role | Value | Notes |
|------|-------|-------|
| Background | `#ffffff` | Pure white |
| Primary text | `#242424` | Near-black, softer than pure black |
| Secondary text | `#6b6b6b` | Medium gray for metadata |
| Accent / brand green | `#1a8917` / `#029e02` | Green for follows, claps |
| Link text | `#242424` | Links styled via underline, not color |
| Border / divider | `#e6e6e6` / `rgba(0,0,0,0.08)` | Very subtle |
| Tag/chip background | `#f2f2f2` | Light gray pills |
| Hover background | `#f2f2f2` | Subtle hover state |
| Yellow (highlight) | `#fffd54` | Text highlight feature |

**Palette philosophy:** Near-monochromatic. Content is king -- the interface disappears. Green accent used only for engagement actions (follow, clap).

### Typography

| Element | Size | Family | Weight | Line-height |
|---------|------|--------|--------|-------------|
| Article title (feed) | 20-24px | `sohne` (sans-serif) | 700 (Bold) | 1.2 |
| Article title (reading) | 32-42px | `source-serif-pro` / `Georgia` (serif) | 700 | 1.2 |
| Body text (reading) | 20-21px | `source-serif-pro` / `Georgia` (serif) | 400 | 1.58 |
| Byline / author | 14px | `sohne` (sans-serif) | 400 | 1.4 |
| Date / read time | 13-14px | `sohne` (sans-serif) | 400 | 1.4 |
| Nav text | 14px | `sohne` (sans-serif) | 400-500 | - |
| Tag pills | 13px | `sohne` (sans-serif) | 400 | - |

**Typography philosophy:**
- **Feed/UI:** Sans-serif (`sohne`) for navigation, metadata, author info
- **Reading:** Serif (`source-serif-pro` or `Georgia`) for article titles and body -- optimized for long-form reading
- **Line-height 1.58** for body text is specifically chosen for optimal readability (Golden Ratio adjacent)
- **20px body text** -- generous, reduces eye strain for long articles
- **Letter-spacing:** Default or very slightly tightened on headings

### Reading Experience

| Property | Value |
|----------|-------|
| Content max-width | 680px |
| Characters per line | ~65-75 |
| Paragraph spacing | 2em (equivalent to one blank line) |
| Image max-width | 680px (can expand to 1000px for featured) |
| Heading spacing | 1.5-2em above headings |
| Code block padding | 20px with light gray background |

**Key reading UX decisions:**
- Optimal line length (65-75 chars) reduces eye fatigue
- Large body text (20px) with generous line-height (1.58)
- Serif fonts for the reading experience (proven for long-form)
- No sidebars during reading -- single column focus
- Minimal chrome -- just the content

### Content Density

- **Feed view:** 3-5 article cards visible per viewport
- **Article cards:** Title + 2-line excerpt + author + date + read time + thumbnail
- **Reading view:** ~3-4 paragraphs visible per viewport
- **Whitespace ratio:** ~40% whitespace on reading pages
- **Feed whitespace:** ~30% (denser)

### Layout

- **Feed:** Single column, max-width ~728px for main feed
- **Grid:** Sometimes 2-column for recommendations sidebar on larger screens
- **Article page:** Single column, centered, max-width 680px
- **Navigation:** Full-width with centered content
- **Footer:** Minimal

### Navigation

- **Height:** ~57px
- **Style:** Fixed top, white background, subtle bottom border
- **Items:** Logo (left), Search (center-left), Write (right), User avatar (right)
- **Feed tabs:** "For you", "Following", topic tags as horizontal scrollable pills
- **Minimal:** Very few navigation elements visible at once

### Article Card Design

- **Layout:** Horizontal -- text left, thumbnail right (small ~100px square)
- **Title:** Bold, sans-serif, 20px
- **Excerpt:** 2 lines, regular weight, lighter color
- **Metadata:** Author name + publication + date + read time (e.g., "5 min read")
- **Bottom:** Topic tag pill + save/bookmark icon
- **Divider:** Very subtle `1px` bottom border between cards
- **No shadows, no explicit card borders** -- separation via whitespace and dividers only

### Premium Feel Techniques

1. **Invisible interface** -- the design disappears so content shines
2. **Serif body text** -- instantly signals "quality reading experience"
3. **Generous text sizing** -- 20px body text feels luxurious
4. **Controlled line length** -- 680px max-width is research-backed for readability
5. **1.58 line-height** -- meticulously chosen, not a round number
6. **Near-monochromatic** -- no color competition with content
7. **Minimal dividers** -- whitespace does the separation work
8. **Consistent metadata pattern** -- author + pub + date + read time is predictable and scannable

---

## Cross-Site Analysis & Actionable Recommendations

### Color Strategy

```css
/* Recommended benchmark platform palette */
:root {
  /* Base - inspired by all four sites' restraint */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f8f8f7;        /* Warm off-white (Anthropic influence) */
  --color-bg-dark: #0d0d0d;             /* For dark sections (OpenAI influence) */
  --color-bg-surface: #ffffff;           /* Card/panel surface */
  --color-bg-surface-dark: #1a1a2e;     /* Dark mode surface */

  /* Text */
  --color-text-primary: #1a1a1a;        /* Near-black, not pure black (Medium) */
  --color-text-secondary: #6b6b6b;      /* Medium gray for metadata */
  --color-text-tertiary: #87867f;       /* Warm gray (Anthropic) */
  --color-text-on-dark: #ececec;        /* Off-white on dark (OpenAI) */

  /* Accent - pick ONE strong accent */
  --color-accent: #d97757;              /* Warm terracotta (Anthropic-inspired) */
  --color-accent-hover: #c4654a;        /* Darker on hover */
  --color-accent-subtle: rgba(217, 119, 87, 0.1); /* For backgrounds */

  /* Borders */
  --color-border: #e5e7eb;             /* Light gray (Artificial Analysis) */
  --color-border-subtle: rgba(0,0,0,0.08); /* Near-invisible (Medium) */
  --color-border-dark: rgba(255,255,255,0.1); /* On dark backgrounds */

  /* Data visualization - brand colors (Artificial Analysis pattern) */
  --color-data-1: #0089f4;             /* Blue */
  --color-data-2: #34A853;             /* Green */
  --color-data-3: #cc785c;             /* Terracotta */
  --color-data-4: #736cd3;             /* Purple */
  --color-data-5: #fd6f00;             /* Orange */
  --color-data-6: #2243e6;             /* Deep blue */
  --color-data-7: #1f1f1f;             /* Near-black */

  /* Feedback */
  --color-success: #34A853;
  --color-warning: #fd6f00;
  --color-error: #dc3545;
}
```

### Typography System

```css
:root {
  /* Font families */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-serif: 'Source Serif Pro', Georgia, 'Times New Roman', serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;

  /* Fluid type scale (Anthropic approach) */
  --text-display: clamp(2.5rem, 2rem + 2vw, 4rem);       /* 40-64px */
  --text-h1: clamp(2rem, 1.7rem + 1.3vw, 3rem);           /* 32-48px */
  --text-h2: clamp(1.5rem, 1.3rem + 0.8vw, 2rem);         /* 24-32px */
  --text-h3: clamp(1.25rem, 1.15rem + 0.4vw, 1.5rem);     /* 20-24px */
  --text-body: clamp(1rem, 0.95rem + 0.2vw, 1.125rem);     /* 16-18px */
  --text-body-lg: clamp(1.125rem, 1.05rem + 0.3vw, 1.25rem); /* 18-20px, for reading */
  --text-small: 0.875rem;                                    /* 14px */
  --text-xs: 0.8125rem;                                      /* 13px */
  --text-data: 0.875rem;                                     /* 14px, for tables */

  /* Line heights */
  --leading-tight: 1.2;       /* Headings */
  --leading-normal: 1.5;      /* UI text */
  --leading-relaxed: 1.58;    /* Long-form reading (Medium's magic number) */
  --leading-loose: 1.75;      /* Spacious paragraphs */

  /* Font weights */
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;

  /* Letter spacing */
  --tracking-tight: -0.02em;  /* Display/headings */
  --tracking-normal: 0;
  --tracking-wide: 0.02em;    /* All-caps labels */
}

/* Usage examples */
h1 {
  font-family: var(--font-sans);
  font-size: var(--text-h1);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
}

.article-body {
  font-family: var(--font-serif);          /* Serif for long-form (Medium) */
  font-size: var(--text-body-lg);
  line-height: var(--leading-relaxed);      /* 1.58 */
  max-width: 680px;                         /* Optimal line length */
}

.data-table td {
  font-family: var(--font-sans);
  font-size: var(--text-data);
  font-variant-numeric: tabular-nums;       /* Aligned numbers in tables */
}
```

### Layout System

```css
:root {
  /* Spacing scale (8px base, OpenAI pattern) */
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */
  --space-32: 8rem;     /* 128px */

  /* Container widths */
  --container-sm: 680px;     /* Reading/article content (Medium) */
  --container-md: 960px;     /* Standard content */
  --container-lg: 1200px;    /* Wide content */
  --container-xl: 1400px;    /* Full-width data views (Artificial Analysis) */

  /* Site margins (Anthropic fluid approach) */
  --site-margin: clamp(1rem, 0.5rem + 3vw, 5rem);  /* 16-80px */

  /* Grid */
  --grid-columns: 12;
  --grid-gutter: var(--space-6);  /* 24px */

  /* Section padding */
  --section-padding: clamp(3rem, 2rem + 4vw, 7rem);  /* 48-112px */

  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;    /* Pills/badges */
}

/* Container utility */
.container {
  width: 100%;
  max-width: var(--container-lg);
  margin-inline: auto;
  padding-inline: var(--site-margin);
}

.container--reading { max-width: var(--container-sm); }
.container--wide { max-width: var(--container-xl); }

/* Section spacing */
section {
  padding-block: var(--section-padding);
}
```

### Navigation Pattern

```css
/* Sticky transparent-to-solid nav (OpenAI + Anthropic hybrid) */
.nav {
  position: sticky;
  top: 0;
  z-index: 100;
  height: 4rem;                           /* 64px */
  padding-inline: var(--site-margin);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--color-border-subtle);
  transition: background 0.3s ease;
}

.nav--scrolled {
  background: rgba(255, 255, 255, 0.95);
}

/* Nav items */
.nav-link {
  font-size: var(--text-small);
  font-weight: var(--weight-medium);
  color: var(--color-text-primary);
  text-decoration: none;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.nav-link:hover {
  background: var(--color-bg-secondary);
}
```

### Card & Component Patterns

```css
/* Content card (Anthropic style) */
.card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.card img {
  transition: transform 0.2s ease;
}

.card:hover img {
  transform: scale(1.05);               /* Anthropic's image hover */
}

/* Data panel (Artificial Analysis style) */
.data-panel {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
}

.data-panel__title {
  font-size: var(--text-h3);
  font-weight: var(--weight-bold);
  margin-bottom: var(--space-2);
}

.data-panel__subtitle {
  font-size: var(--text-small);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-6);
}

/* Stat card - large number display */
.stat-card {
  text-align: center;
  padding: var(--space-8) var(--space-6);
}

.stat-card__value {
  font-size: var(--text-display);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-tight);
  color: var(--color-accent);
}

.stat-card__label {
  font-size: var(--text-small);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  margin-top: var(--space-2);
}
```

### Benchmark Data Table

```css
/* Leaderboard/comparison table (Artificial Analysis pattern) */
.benchmark-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-data);
}

.benchmark-table th {
  font-weight: var(--weight-bold);
  text-align: left;
  padding: var(--space-3) var(--space-4);
  border-bottom: 2px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  position: sticky;
  top: 4rem;                            /* Below sticky nav */
  background: var(--color-bg-primary);
  z-index: 10;
  cursor: pointer;                       /* Sortable indicator */
}

.benchmark-table td {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  font-variant-numeric: tabular-nums;
  vertical-align: middle;
}

.benchmark-table tr:hover td {
  background: var(--color-bg-secondary);
}

/* Model name cell with brand color indicator */
.model-name {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.model-name__indicator {
  width: 3px;
  height: 24px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

/* Score cell with bar visualization */
.score-cell {
  position: relative;
}

.score-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  opacity: 0.08;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

/* Filter pills (Artificial Analysis pattern) */
.filter-pills {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-6);
}

.filter-pill {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-pill--active {
  background: var(--color-text-primary);
  color: var(--color-bg-primary);
  border-color: var(--color-text-primary);
}

.filter-pill:hover:not(.filter-pill--active) {
  border-color: var(--color-text-secondary);
}

/* Model count context */
.result-count {
  font-size: var(--text-small);
  color: var(--color-text-secondary);
}
```

### Chart Styling Recommendations

```css
/* Chart container */
.chart-wrapper {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
}

/* Chart title area */
.chart-header {
  margin-bottom: var(--space-6);
}

.chart-header__title {
  font-size: var(--text-h3);
  font-weight: var(--weight-semibold);
}

.chart-header__description {
  font-size: var(--text-small);
  color: var(--color-text-secondary);
  margin-top: var(--space-1);
}

/*
  Chart.js / D3 / Recharts styling tokens:

  Axis labels: var(--text-xs), var(--color-text-tertiary)
  Grid lines: var(--color-border) at 0.5 opacity
  Tick marks: none (clean look)
  Tooltip:
    background: var(--color-bg-dark)
    color: var(--color-text-on-dark)
    border-radius: var(--radius-md)
    padding: var(--space-3) var(--space-4)
    font-size: var(--text-small)
    box-shadow: 0 4px 12px rgba(0,0,0,0.15)

  Data colors (consistent across all charts):
    Use --color-data-1 through --color-data-7
*/
```

### Hero Section Pattern

```css
/* Hero (OpenAI cinematic + Anthropic animation hybrid) */
.hero {
  position: relative;
  min-height: 80vh;                     /* Near-full viewport */
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--space-32) var(--site-margin);
  overflow: hidden;
}

/* Option A: Dark dramatic hero (OpenAI style) */
.hero--dark {
  background: var(--color-bg-dark);
  color: var(--color-text-on-dark);
}

.hero--dark::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 0%,
    rgba(115, 108, 211, 0.15) 0%,
    transparent 60%
  );
  pointer-events: none;
}

/* Option B: Light warm hero (Anthropic style) */
.hero--light {
  background: var(--color-bg-secondary);
}

.hero__title {
  font-size: var(--text-display);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  max-width: 14ch;                      /* Constrain for readability */
  margin-inline: auto;
}

.hero__subtitle {
  font-size: var(--text-body-lg);
  color: var(--color-text-secondary);
  max-width: 50ch;
  margin: var(--space-6) auto 0;
  line-height: var(--leading-relaxed);
}

/* CTA button */
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
  padding: var(--space-3) var(--space-6);
  background: var(--color-accent);
  color: #ffffff;
  border: none;
  border-radius: var(--radius-full);    /* Pill shape */
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
  text-decoration: none;
}

.btn-primary:hover {
  background: var(--color-accent-hover);
  transform: translateY(-1px);
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
  padding: var(--space-3) var(--space-6);
  background: transparent;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: border-color 0.15s ease;
  text-decoration: none;
}

.btn-secondary:hover {
  border-color: var(--color-text-primary);
}
```

### Section Transition Patterns

```css
/* Alternating section backgrounds (clean separation without dividers) */
section:nth-child(odd) {
  background: var(--color-bg-primary);
}

section:nth-child(even) {
  background: var(--color-bg-secondary);
}

/* Dark feature section (for emphasis) */
.section--dark {
  background: var(--color-bg-dark);
  color: var(--color-text-on-dark);
}

/* Subtle gradient transition between sections */
.section--gradient-top::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 120px;
  background: linear-gradient(
    to bottom,
    var(--color-bg-secondary),
    transparent
  );
  pointer-events: none;
}
```

### Scroll Animation (Minimal)

```css
/* Lightweight scroll reveal (no GSAP needed for simple cases) */
@media (prefers-reduced-motion: no-preference) {
  .reveal {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }

  .reveal.is-visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* Staggered children */
  .reveal-stagger > * {
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 0.4s ease, transform 0.4s ease;
  }

  .reveal-stagger.is-visible > *:nth-child(1) { transition-delay: 0s; opacity: 1; transform: none; }
  .reveal-stagger.is-visible > *:nth-child(2) { transition-delay: 0.1s; opacity: 1; transform: none; }
  .reveal-stagger.is-visible > *:nth-child(3) { transition-delay: 0.2s; opacity: 1; transform: none; }
  .reveal-stagger.is-visible > *:nth-child(4) { transition-delay: 0.3s; opacity: 1; transform: none; }
}

/* Always respect user preference */
@media (prefers-reduced-motion: reduce) {
  .reveal,
  .reveal-stagger > * {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

---

## Design Principles Summary

### From Anthropic:
- **Fluid `clamp()` typography** eliminates breakpoint-based jumps
- **Single warm accent** color against neutrals creates premium feel
- **Line-height trimming** for precise vertical rhythm
- **CSS custom property architecture** for maintainable design tokens

### From OpenAI:
- **Dramatic dark hero** sections for impact
- **Generous whitespace** (80-120px section padding) makes pages breathe
- **Monochromatic restraint** with single brand accent
- **Large headings** contrasted with modest body text

### From Artificial Analysis:
- **Brand-consistent data colors** across all visualizations
- **Multiple visualization modes** for the same data (table + chart + scatter)
- **Interactive filter pills** for data exploration
- **Dense but hierarchical** information presentation with clear titles/subtitles

### From Medium:
- **Serif fonts** for long-form reading, sans-serif for UI
- **680px max-width** for optimal reading line length
- **1.58 line-height** for body text (research-backed)
- **Invisible interface** -- let content be the design
- **20px body text** for comfortable reading

### Critical "Polish" Checklist:
1. Use `-webkit-font-smoothing: antialiased` on all text
2. Use `font-variant-numeric: tabular-nums` in data tables
3. Use `text-underline-offset` for readable link underlines
4. Borders should be `rgba()` based, not solid hex colors
5. Hover transitions should be 0.15-0.2s (fast but noticeable)
6. Use `backdrop-filter: blur()` for frosted glass nav
7. Respect `prefers-reduced-motion` for all animations
8. Use `prefers-color-scheme` for dark mode support
9. Text selection color should match brand accent
10. Scrollbars should be styled thin and subtle on WebKit
