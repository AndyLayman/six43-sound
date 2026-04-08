# Design System — Baseball Apps

## Mode
- **Dark mode only** (for now)

---

## Colors

### Baseball Palette

| Name             | Token            | Hex       | Usage                              |
|------------------|------------------|-----------|------------------------------------|
| Chalk            | `--chalk`        | `#F7F7F7` | Primary text, high-contrast whites |
| Night Game       | `--night-game`   | `#111111` | Primary background, text on accent |
| Infield Clay     | `--clay`         | `#E9D7B4` | Primary accent, active states      |
| Wet Dirt         | `--dirt`         | `#574F3D` | Secondary accent, muted warm       |
| Stitch Red       | `--stitch-red`   | `#B93C3C` | Error states, destructive muted    |
| High Heat        | `--high-heat`    | `#FA4D4D` | Error accents, danger emphasis     |
| Outfield Wall    | `--outfield`     | `#50684C` | Success states, muted              |
| Fresh Cut Field  | `--fresh-cut`    | `#71A368` | Success accents, confirmations     |

> **Red/green are reserved for success and failure states only.** Never use them as decorative accents.

### Neutrals

| Token        | Hex       | Usage                          |
|--------------|-----------|--------------------------------|
| `--black`    | `#111111` | Primary background (Night Game)|
| `--gray-950` | `#181818` | Deep/sunken backgrounds        |
| `--gray-900` | `#1E1E1E` | Card backgrounds               |
| `--gray-800` | `#2A2A2A` | Elevated surfaces, inputs      |
| `--gray-700` | `#3A3A3A` | Borders, dividers              |
| `--gray-600` | `#5A5A5A` | Muted icons, disabled states   |
| `--gray-400` | `#8A8A8A` | Muted/secondary text           |
| `--gray-200` | `#B0B0B0` | Subtext, labels                |
| `--white`    | `#F7F7F7` | Primary text (Chalk)           |

---

## Semantic Tokens

| Role                 | Token          | Value                             |
|----------------------|----------------|-----------------------------------|
| Page background      | `--bg`         | `--black` (`#111111`)             |
| Deep background      | `--bg-deep`    | `--gray-950` (`#181818`)          |
| Card background      | `--bg-card`    | `--gray-900` (`#1E1E1E`)         |
| Input background     | `--bg-input`   | `--gray-800` (`#2A2A2A`)         |
| Primary text         | `--text`       | `--white` (`#F7F7F7`)            |
| Secondary text       | `--text-muted` | `--gray-400` (`#8A8A8A`)         |
| Dim text             | `--text-dim`   | `--gray-600` (`#5A5A5A`)         |
| Border               | `--border`     | `--gray-700` (`#3A3A3A`)         |
| Hover background     | `--hover`      | `--gray-800` (`#2A2A2A`)         |
| Primary accent       | `--accent`     | `--clay` (`#E9D7B4`)             |
| Accent hover         | `--accent-hover`| `#D4C29F`                        |
| Text on accent       | `--accent-on`  | `--black` (`#111111`)            |
| Danger               | `--danger`     | `--high-heat` (`#FA4D4D`)        |
| Success              | `--success`    | `--fresh-cut` (`#71A368`)        |

---

## Typography

- **Font:** Montserrat (Google Fonts)
- **Weight:** 300 (Light) — used globally for now

### Type Scale

| Token        | Size   | Usage                         |
|--------------|--------|-------------------------------|
| `--text-xs`  | 10px   | Captions, timestamps          |
| `--text-sm`  | 12px   | Labels, helper text           |
| `--text-base`| 14px   | Body text, inputs, buttons    |
| `--text-lg`  | 16px   | Section titles                |
| `--text-xl`  | 20px   | Page headings                 |
| `--text-2xl` | 24px   | Hero/display text             |

---

## Spacing Scale (8px base)

| Token    | Value  | Usage                          |
|----------|--------|--------------------------------|
| `--sp-1` | `4px`  | Tight inner padding, icon gaps |
| `--sp-2` | `8px`  | Default gap, small padding     |
| `--sp-3` | `16px` | Card padding, section gaps     |
| `--sp-4` | `24px` | Page padding, large gaps       |
| `--sp-5` | `32px` | Section margins                |
| `--sp-6` | `48px` | Major section breaks           |
| `--sp-8` | `64px` | Page-level spacing             |

---

## Border Radius Scale (8px base)

| Token      | Value    | Usage                        |
|------------|----------|------------------------------|
| `--r-1`    | `4px`    | Inputs, small elements       |
| `--r-2`    | `8px`    | Cards, buttons (default)     |
| `--r-3`    | `16px`   | Large cards, modals          |
| `--r-4`    | `24px`   | Pills, tags, chips           |
| `--r-full` | `9999px` | Circles, fully rounded       |

---

## Depth & Effects

### Glow Effects

```css
/* Warm clay glow (primary accent) */
--glow-clay: 0 0 12px rgba(233, 215, 180, 0.3);

/* Combined warm glow (active/playing states) */
--glow-accent: 0 0 20px rgba(233, 215, 180, 0.25), 0 0 40px rgba(87, 79, 61, 0.15);

/* Status glows — use sparingly, only for status indicators */
--glow-danger: 0 0 12px rgba(250, 77, 77, 0.4);
--glow-success: 0 0 12px rgba(113, 163, 104, 0.4);
```

Cards and surfaces use **background color contrast** for hierarchy — no shadows.

---

## Buttons

### Primary Action
- **Background:** Infield Clay (`#E9D7B4`)
- **Text:** Night Game (`#111111`)
- **Border radius:** `--r-2` (8px)
- **Hover:** Add `--glow-accent` box-shadow
- **Active/pressed:** Scale down slightly (`transform: scale(0.97)`)

### Secondary Action
- **Background:** `--gray-800` (`#2A2A2A`)
- **Text:** Chalk (`#F7F7F7`)
- **Border:** 1px solid `--gray-700`
- **Hover:** Border brightens to `--gray-600`

### Destructive / Danger
- **Background:** High Heat (`#FA4D4D`)
- **Text:** Night Game (`#111111`)
- **Hover:** `box-shadow: var(--glow-danger)`

---

## Status Colors

| Token          | Hex       | Usage                          |
|----------------|-----------|--------------------------------|
| `--danger`     | `#FA4D4D` | Destructive actions, errors    |
| `--stitch-red` | `#B93C3C` | Error states, muted danger     |
| `--success`    | `#71A368` | Success, confirmations         |
| `--outfield`   | `#50684C` | Muted success, completed       |

---

## CSS Variables Template

```css
:root {
  /* Baseball Palette */
  --chalk: #F7F7F7;
  --night-game: #111111;
  --clay: #E9D7B4;
  --dirt: #574F3D;
  --stitch-red: #B93C3C;
  --high-heat: #FA4D4D;
  --outfield: #50684C;
  --fresh-cut: #71A368;

  /* Neutrals */
  --black: #111111;
  --gray-950: #181818;
  --gray-900: #1E1E1E;
  --gray-800: #2A2A2A;
  --gray-700: #3A3A3A;
  --gray-600: #5A5A5A;
  --gray-400: #8A8A8A;
  --gray-200: #B0B0B0;
  --white: #F7F7F7;

  /* Legacy aliases (map old names → new palette) */
  --teal: var(--clay);
  --green: var(--fresh-cut);
  --purple: var(--dirt);

  /* Semantic */
  --bg: var(--black);
  --bg-deep: var(--gray-950);
  --bg-card: var(--gray-900);
  --bg-input: var(--gray-800);
  --text: var(--white);
  --text-muted: var(--gray-400);
  --text-dim: var(--gray-600);
  --border: var(--gray-700);
  --hover: var(--gray-800);
  --accent: var(--clay);
  --accent-hover: #D4C29F;
  --accent-on: var(--black);

  /* Status */
  --danger: var(--high-heat);
  --success: var(--fresh-cut);

  /* Spacing (8px base) */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 16px;
  --sp-4: 24px;
  --sp-5: 32px;
  --sp-6: 48px;
  --sp-8: 64px;

  /* Radius (8px base) */
  --r-1: 4px;
  --r-2: 8px;
  --r-3: 16px;
  --r-4: 24px;
  --r-full: 9999px;

  /* Typography */
  --text-xs: 10px;
  --text-sm: 12px;
  --text-base: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --font: 'Montserrat', sans-serif;
  --font-weight: 300;

  /* Glows */
  --glow-clay: 0 0 12px rgba(233, 215, 180, 0.3);
  --glow-accent: 0 0 20px rgba(233, 215, 180, 0.25), 0 0 40px rgba(87, 79, 61, 0.15);
  --glow-danger: 0 0 12px rgba(250, 77, 77, 0.4);
  --glow-success: 0 0 12px rgba(113, 163, 104, 0.4);

  /* Legacy glow aliases */
  --glow-teal: var(--glow-clay);
  --glow-green: var(--glow-success);
  --glow-purple: 0 0 12px rgba(87, 79, 61, 0.3);

  /* Motion */
  --duration-fast: 120ms;
  --duration-base: 250ms;
  --duration-slow: 500ms;
  --duration-xslow: 800ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

---

## Icons

- **Library:** Iconoir (CDN) / Lucide
- **Default size:** 16px (small), 20px (medium), 24px (large)
- **Stroke:** Default (2px)
- **Color:** Inherits from parent `color`

---

## Motion & Animation

The app should feel **dynamic and alive** — smooth transitions, playful micro-interactions, and polished state changes.

### Timing Tokens

| Token            | Value    | Easing                          | Usage                            |
|------------------|----------|---------------------------------|----------------------------------|
| `--duration-fast`| `120ms`  | `cubic-bezier(0.4, 0, 0.2, 1)` | Hover states, toggles, opacity   |
| `--duration-base`| `250ms`  | `cubic-bezier(0.4, 0, 0.2, 1)` | Page transitions, card reveals   |
| `--duration-slow`| `500ms`  | `cubic-bezier(0.16, 1, 0.3, 1)` | Loading, modals, entrance anims |
| `--duration-xslow`| `800ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Staggered list items, hero anims|

### Easing Curves

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);      /* Smooth deceleration — entrances */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);     /* Standard — general transitions */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* Bouncy overshoot — playful interactions */
```

### Micro-Interactions

| Element               | Trigger       | Animation                                               |
|-----------------------|---------------|----------------------------------------------------------|
| Buttons               | Hover         | Scale up 1.03, glow fades in                             |
| Buttons               | Press         | Scale down 0.97, glow intensifies                        |
| Sound buttons         | Playing       | Pulse glow + equalizer animation                         |
| Cards                 | Page load     | Fade up + stagger (each card 50ms delay)                 |
| Page transitions      | Tab switch    | Crossfade with slight slide                              |
| Nav tabs              | Active        | Clay underline slides to active tab                      |
| Toggle/bench          | State change  | Smooth opacity + icon swap with rotation                 |
| Upload                | File added    | Card slides in from bottom with spring easing            |
| Remove                | Delete        | Card collapses height + fades out                        |
| Now playing bar       | Song starts   | Slides up from bottom                                   |
| Progress bar          | Playing       | Clay-to-dirt gradient fill                               |
| Drag & drop           | Dragging      | Card lifts (scale 1.02) + glow appears                   |
| Player photo          | Hover         | Subtle scale 1.05                                        |

### Stagger Pattern for Lists

```css
.stagger-enter > * {
  opacity: 0;
  transform: translateY(12px);
  animation: fadeUp var(--duration-base) var(--ease-out) forwards;
}
.stagger-enter > *:nth-child(1) { animation-delay: 0ms; }
.stagger-enter > *:nth-child(2) { animation-delay: 50ms; }
.stagger-enter > *:nth-child(3) { animation-delay: 100ms; }
/* ...etc */

@keyframes fadeUp {
  to { opacity: 1; transform: translateY(0); }
}
```

### Gradient Progress Bar

```css
#progress-bar {
  background: linear-gradient(90deg, var(--clay), var(--dirt));
  background-size: 200% 100%;
  animation: gradientShift 3s ease-in-out infinite;
}
@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```
