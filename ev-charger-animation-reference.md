# EV Charger Charging Animation — Reference Guide

This document describes all the techniques used to build a live animated EV charging visualization. The animation shows a charger connected to a battery via a cable, with the battery filling up, numbers fluctuating realistically, and visual cues indicating active charging. Use this as a reference to implement the same effect anywhere.

---

## What it looks like

```
[  CHARGER UNIT  ]   ← small box showing current kW output
        |
   flowing cable     ← dashed SVG line with scrolling animation (electricity moving)
        |
  ┌──────────────┐   ← battery terminal cap
  │              │
  │    74%       │   ← SOC number overlaid in center
  │  ▓▓▓▓▓▓▓▓▓▓ │   ← green fill rising from the bottom
  │  ▓▓▓▓▓▓▓▓▓▓ │
  │  ▓▓▓▓▓▓▓▓▓▓ │
  │              │
  └──────────────┘   ← border glows and pulses when charging

  48.0 kW            ← fluctuating kW readout below
  ● Charging         ← blinking status pill
```

---

## Technique 1 — Battery fill (CSS overflow + absolute positioning)

The battery is two nested divs. The outer div clips its contents with `overflow: hidden`. The inner div (`battery-fill`) sits at the bottom with `position: absolute; bottom: 0` and its `height` is set to the SOC percentage. A `transition` makes the height change animate smoothly every time JavaScript updates it.

```css
.battery-body {
  width: 110px;
  height: 170px;
  border: 3px solid #47a141;
  border-radius: 6px;
  overflow: hidden;          /* clips the fill so it doesn't spill out */
  position: relative;
  background: #0f1117;
}

.battery-fill {
  position: absolute;
  bottom: 0;                 /* anchors the fill to the bottom */
  left: 0;
  right: 0;
  height: 10%;               /* JavaScript sets this to the SOC percentage */
  background: linear-gradient(to top, #47a141, #47a14199);
  transition: height 0.9s ease;  /* smooth animation when % changes */
}
```

```html
<div class="battery-body">
  <div class="battery-fill" id="fill"></div>

  <!-- SOC number overlaid on top of the fill -->
  <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
    <span id="soc-number" style="font-size:28px; font-weight:800; color:#fff;">72%</span>
  </div>
</div>
```

---

## Technique 2 — Pulsing glow (CSS @keyframes on box-shadow)

A CSS animation cycles the `box-shadow` between a dim glow and a bright glow every 2 seconds. Applied directly to the battery border div — no JavaScript needed.

```css
@keyframes chargePulse {
  0%, 100% {
    box-shadow: 0 0 8px #47a141aa, inset 0 0 6px #47a14122;
  }
  50% {
    box-shadow: 0 0 24px #47a141, 0 0 48px #47a14155, inset 0 0 16px #47a14133;
  }
}

.battery-body {
  animation: chargePulse 2s ease-in-out infinite;
}
```

To make the glow color match the charge level (green when high, blue when mid, amber when low), swap the color in the keyframes:
- High SOC (≥80%): `#47a141` (green)
- Mid SOC (20–79%): `#3b82f6` (blue)
- Low SOC (<20%): `#f59e0b` (amber)

---

## Technique 3 — Animated energy cable (SVG stroke-dashoffset)

An SVG `<line>` with `stroke-dasharray` creates a dashed line. A CSS animation scrolls the `stroke-dashoffset` from a positive number down to 0, which makes the dashes appear to travel along the line — simulating electricity flowing from the charger into the battery.

```html
<svg width="4" height="80" style="display:block; overflow:visible;">
  <line
    x1="2" y1="0"
    x2="2" y2="80"
    stroke="#47a141"
    stroke-width="3"
    stroke-dasharray="8 5"
    style="animation: cableFlow 0.55s linear infinite;"
  />
</svg>
```

```css
@keyframes cableFlow {
  from { stroke-dashoffset: 26; }   /* dashes start offset */
  to   { stroke-dashoffset: 0; }    /* dashes scroll to position — looks like movement */
}
```

- **Positive to zero** = energy flows downward (charger → battery)
- **Zero to positive** = energy flows upward (if you want to show it differently)
- Adjust `stroke-dasharray: 8 5` to control dash length and gap size
- Slower animation duration = slower-looking current; faster = more intense

---

## Technique 4 — Realistic flickering numbers (Math.sin + setInterval)

`Math.random()` makes numbers jump erratically. Two overlapping sine waves produce smooth, realistic-looking variance — like actual sensor readings from a charger.

```js
let tick = 0;
const RATED_KW = 48; // set this to the charger's rated output

function update() {
  tick += 0.45; // controls how fast the number drifts

  // kW fluctuates around the rated value — looks like real charger variance
  const kw = RATED_KW
    - 1.5
    + Math.sin(tick)       * 1.8   // primary wave
    + Math.cos(tick * 1.7) * 0.9;  // secondary wave for irregularity

  // SOC climbs from 20% to 95%, then resets and repeats
  const soc = 20 + ((tick * 1.4) % 75);

  // Update the DOM
  document.getElementById('fill').style.height      = soc.toFixed(1) + '%';
  document.getElementById('soc-number').textContent = Math.round(soc) + '%';
  document.getElementById('kw-display').textContent = kw.toFixed(1) + ' kW';
}

update(); // run once immediately so there's no blank flash on load
setInterval(update, 1500); // then update every 1.5 seconds
```

**Key parameters to adjust:**
| Variable | What it controls |
|---|---|
| `RATED_KW` | Center point the kW fluctuates around |
| `* 1.8` and `* 0.9` | Size of the fluctuation (larger = more variance) |
| `tick += 0.45` | How fast the drift moves (larger = faster changes) |
| `setInterval(update, 1500)` | How often numbers refresh (ms) |
| `((tick * 1.4) % 75)` | How fast SOC climbs and how wide the loop is |

---

## Technique 5 — Blinking status indicator

A simple dot that fades in and out using `@keyframes opacity`.

```css
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3b82f6;
  animation: blink 1.2s ease-in-out infinite;
}
```

```html
<div style="display:flex; align-items:center; gap:6px;">
  <div class="status-dot"></div>
  <span style="font-size:11px; font-weight:700; color:#3b82f6; text-transform:uppercase; letter-spacing:.07em;">
    Charging
  </span>
</div>
```

---

## How all five techniques connect

```
setInterval (every 1.5s)
  └── Math.sin(tick) → calculates kW and SOC values
        ├── sets fill div height   → CSS transition animates the change smoothly
        ├── updates kW text node   → number drifts realistically
        └── updates SOC text node  → percentage updates

CSS @keyframes (running continuously, no JS needed)
  ├── chargePulse → battery border glows and breathes
  ├── cableFlow   → SVG dash offset scrolls, looks like current flowing
  └── blink       → status dot fades in/out
```

---

## Colors used (swap to match your brand)

```
Green  #47a141  — charging / high SOC
Blue   #3b82f6  — active session / status indicator
Amber  #f59e0b  — low SOC warning
Dark bg  #0f1117  — battery interior background
Card bg  #1a1d27  — card / panel background
Border   #2e3347  — inactive borders and separators
```
