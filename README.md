# Hard Workers' Arcade 🕹️

Turn your to-do list into an arcade. Every task you add becomes a plushie inside a claw machine — play the machine to **grab your next task**, and finishing tasks pays out coins and tickets. Just like Sally and her teddy bear: you'll spend way more time (and coins) than you planned. That's the point.

## How it works

1. **Add a task** (0–3★ difficulty) → it drops into the claw machine as a plushie
2. **Play the arcade** → 1 coin per play. Line up the claw, drop it, and the plushie you grab becomes your **NEXT UP** task
3. **Finish the task** → confetti, retro sound effects, coins + tickets, and a daily streak 🔥
4. **Hit the Prize Wall** → trade tickets for legendary prizes (Tootsie Roll, Golden Claw Trophy, Champion Plushie…) and keep them in your locker
5. **Play the Runner** → 100 tickets per run. Dash through 5-minute levels across 3 chapters (❄️ Snow Mountain, 🏜️ Scorching Desert, 🌋 Burning Volcano), 18 levels each — clear a chapter to earn its exclusive avatar frame

## Daily check-in

Come back once a day, tap **Check in**, and keep the streak alive:

- **One check-in per day** — the button locks itself until tomorrow
- **Streaks build up** — each check-in grows your 🔥 streak; miss a day and it resets to 1
- **Coins every day** — every check-in pays **+2 coins** for the claw machine
- **The golden prize** — check in **7 days in a row** to unlock the **Golden Legend** avatar frame, a rotating golden ring that shows on your avatar everywhere (header, profile, player select)
- **Frames are forever** — once unlocked, they stay in your locker and can be equipped or swapped anytime

The profile page shows your last 7 days as a strip of circles, so you always know how close the golden frame is.

## Features

- 👤 Local player accounts — each player keeps their own tasks, coins, tickets and prizes
- 📅 Daily check-in — 7 days in a row unlocks the **Golden Legend** avatar frame; every check-in pays +2 coins
- 🖼️ Equippable avatar frames (Classic Neon + animated Golden Legend) and 🏷️ name tags
- 🗂️ Add / complete / delete tasks with 0–3 star difficulty
- 🧸 Working claw machine: aim matters, and yes — sometimes the claw "slips"
- 🎁 Prize Claw — a second machine (coins, not tickets) stocked with visible avatar frames & name tags — grab the one you aim at; duplicates refund as tickets
- 🏃 Runner — a Mario-style 2D side-scroller below the machine: 100 tickets per run, 5-minute time limit per level, 3 chapters (Snow Mountain / Desert / Volcano) × 18 levels, each chapter with an exclusive avatar frame
- 🪙 Coin economy: complete tasks to earn more plays (1–4 coins per task)
- 🎟️ Ticket system + prize wall with collectible locker badges
- 🔥 Daily completion streak tracking
- 🏅 Hall of Fame of completed tasks
- 🎵 Retro synth sound effects (Web Audio API — no audio files)
- 🎉 Canvas confetti celebrations
- 💾 Everything persists in `localStorage`
- 📱 Responsive neon-arcade design, keyboard + touch controls

## Controls

| Action | Keyboard | Buttons |
| --- | --- | --- |
| Move claw | ← → or A D | ◀ ▶ |
| Drop claw | Space / Enter | ⬇ DROP |
| Runner: jump | Space / ↑ / W | ⬆ button |

## Local run

Open `index.html` directly in a browser, or serve it:

```bash
python -m http.server 8080
# visit http://localhost:8080
```

Pure HTML / CSS / JavaScript — no frameworks, no build step.
