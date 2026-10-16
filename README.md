<h1 align="center">GRAND FORTUNE PUSHER</h1>

<p align="center">
  <b>English</b> · <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <b>Authentic Arcade-Grade 3D Medal Pusher Game in the Web Browser.<br>
  Built with Three.js & Rapier3D (WASM 60Hz Physics) — Complete Implementation of Specification [DOC-MP-EV-02].</b>
</p>

<p align="center">
  <a href="https://futurecortexlabs.github.io/FCTX-Web-Medal-Pusher/"><b>▶ Play in Browser</b></a>
  &nbsp;·&nbsp;
  <a href="#core-mechanics">Core Mechanics</a>
  &nbsp;·&nbsp;
  <a href="#controls">Controls</a>
  &nbsp;·&nbsp;
  <a href="#two-stage-lottery--jackpot">Lottery & JP</a>
  &nbsp;·&nbsp;
  <a href="#physics--tuning">Physics Tuning</a>
</p>

---

## Overview

**GRAND FORTUNE PUSHER** brings the immersive thrills of large-scale arcade coin pushers (e.g., *Fortune Trinity*) directly into your web browser. Featuring a real-time **Progressive Jackpot**, dynamic **50-Coin Medal Tower avalanches**, high-mass **Crystal Color Balls**, a 45-second **Fever Mode with 100% Side-Wall Defense**, moving **2x Multiplier Gates**, strategic **Machine Tilt/Shake**, and a **2-Stage Physical Croun Roulette**.

All visual effects, sound synthesizers, and physics steps run locally with zero external network asset dependencies.

---

## Core Mechanics

| Mechanic | Trigger / Condition | Player Experience & Role |
| :--- | :--- | :--- |
| 🔮 **Color Ball Drop** | Digital Roulette Ball win (15%) | Drops an oversized, high-mass crystal sphere onto the playfield. Pushing 3 balls off the front edge directly triggers the **Physical Croun Jackpot Challenge**. |
| 🏰 **Medal Tower Collapse** | Roulette Tower square / Croun Yellow Pocket | Summons a majestic castle of 50 vertically-stacked coins. The pusher pushes it from behind until its center of mass collapses in a thrilling avalanche. |
| 📈 **Progressive Jackpot** | Real-time side gutter losses | Every medal confiscated by the left/right gutters adds **+0.5 medals** in real-time to the Grand Jackpot counter (Base: 300.0). Winning the JP unleashes a massive waterfall of coins! |
| 🔥 **Fever Time** | 10 Misses accumulated (Gauge MAX) | Golden fences rise from the side gutters for **45 seconds**, reducing medal loss to **0%**. Pusher cycle speed accelerates to **2×**, accompanied by an upbeat trance soundtrack. |
| 🎯 **Moving 2x Gate** | Mechanical timing obstacle | An oscillating gate moves horizontally mid-field. Timing drops to shoot medals through the gate causes them to **physically split into 2 medals (+1 bonus spawn)**. |
| 💥 **Machine Shake (Tilt)** | 3-minute cooldown action | Applies a forward impulse vector across the playfield to dislodge coins on the edge. Repeated rapid shaking triggers a loud alarm and a temporary **TILT lock penalty**. |

---

## Controls

Supports desktop mouse/keyboard and mobile touch swipe / continuous rapid fire.

| Action | Desktop (Mouse / Keyboard) | Smartphone (Touch) |
| :--- | :--- | :--- |
| **Aim Shooter (X-Axis)** | Drag bottom aim track / `A` & `D` / Arrow Keys | Swipe bottom aim track / Tap screen position |
| **Drop Medal** | Hold "メダル投入" Button / `Space` / Click Canvas | Hold "メダル投入" Button / Tap Canvas |
| **Rapid Auto-Fire** | Press and hold drop button | Press and hold drop button |
| **Table Shake (Tilt)** | "台揺らし" Button / `S` Key | "台揺らし" Button |
| **Audio Toggle** | Click `🔊` Button | Tap `🔊` Button |
| **Replenish Medals** | Click `🪙+50` Button | Tap `🪙+50` Button |
| **Tower Summon Test** | Click `🏰` Button | Tap `🏰` Button |

---

## Two-Stage Lottery & Progressive Jackpot

```
[Stage 1] Digital Roulette (Center Chucker Sensor, Max 8 Stock)
  ├── 💀 Miss (45%)             ➔ Fever Gauge +1 (10 Misses = Fever Mode!)
  ├── 🪙 Small Win 15 (25%)     ➔ 15 Medals Payout
  ├── 🏰 Tower Summon (5%)      ➔ 50-Coin Tower Summoned on Field
  ├── 🔮 Ball Drop (15%)        ➔ 1 Crystal Color Ball Dropped
  └── 🔥 JP Challenge (10%)     ➔ Direct Entry to Stage 2 Physical Croun!

[Stage 2] Physical Croun Roulette (Triggered by 3 Balls OR 10% Roulette Win)
  ├── 🟦 50 Medals (3 Pockets - 50%)
  ├── 🟨 100 Medals + 🏰 Tower (2 Pockets - 33.3%)
  └── 🌈 GRAND JACKPOT (1 Pocket - 16.7%) ➔ Full progressive payout & coin waterfall!
```

---

## Physics & Advanced Object Tuning

All rigid bodies and colliders are tuned to specification `DOC-MP-EV-02` using Rapier3D:

| Object | Mass | Restitution / Friction | Special Behavior & Logic |
| :--- | :--- | :--- | :--- |
| **Standard Medal** | 1.0 kg | Restitution 0.05 / Friction 0.50 | Rendered efficiently via `THREE.InstancedMesh`. High performance for hundreds of simultaneous coins. |
| **Color Ball** | 4.5 kg | Restitution 0.15 / Friction 0.30 | Oversized transparent crystal sphere with inner emissive core. Plows through surrounding coins. |
| **Medal Tower** | 50.0 kg (Total) | Restitution 0.02 / Friction 0.60 | 50 cylinder stack spawned in sleeping state. Instantly collapses into an avalanche once pusher makes contact. |
| **Pusher Plate** | Kinematic | Top Friction 0.85 | Oscillates smoothly via sine wave; forward stroke powerfully pushes medals forward. Speeds up 2× in Fever mode. |
| **Fever Side Walls** | Kinematic | Restitution 0.10 | Rises from below playfield to Y=0.45 during Fever mode, physically blocking side drop losses. |
| **Moving 2x Gate** | Sensor | Non-physical trigger | Sensor crossing trigger; instantaneously clones passing coin with forward trajectory. |

---

## Sound & LocalStorage Persistence

- **Synthesized Web Audio Engine**: Zero MP3/WAV downloads required. Procedural sound synthesis generates authentic arcade clicks, metallic coin clinks, fanfare chimes, chucker chimes, and trance Fever BGM.
- **Continuous 5-Second Auto-Save**: Player credit balance, progressive jackpot counter, fever gauge count, collected balls, and **exact coordinates of all field coins and balls** are automatically stored in `localStorage` and restored on reload.

---

## Local Development

```bash
# Clone the repository
git clone https://github.com/futurecortexlabs/FCTX-Web-Medal-Pusher.git
cd FCTX-Web-Medal-Pusher

# Install dependencies
npm install

# Start local dev server (default: http://localhost:3000)
npm run dev

# Run production build & verify
npm run build
npm run preview
```

---

## License & Reference

- **Document Specification**: `DOC-MP-EV-02` (Web-Browser Medal Pusher Game Specification - Evolution Edition)
- **Engine Stack**: Three.js, `@dimforge/rapier3d-compat`, TypeScript, Vite
