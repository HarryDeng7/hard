# Hard Workers' Arcade 🕹️

Turn your to-do list into an arcade. Every task you add becomes a plushie inside a claw machine — play the machine to **grab your next task**, and finishing tasks pays out coins and tickets. Just like Sally and her teddy bear: you'll spend way more time (and coins) than you planned. That's the point.

## How it works

1. **Add a task** (1–3★ difficulty) → it drops into the claw machine as a plushie
2. **Play the arcade** → 1 coin per play. Line up the claw, drop it, and the plushie you grab becomes your **NEXT UP** task
3. **Finish the task** → confetti, retro sound effects, coins + tickets, and a daily streak 🔥
4. **Hit the Prize Wall** → trade tickets for legendary prizes (Tootsie Roll, Golden Claw Trophy, Champion Plushie…) and keep them in your locker

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
- 🖼️ Equippable avatar frames (Classic Neon + animated Golden Legend)
- 🗂️ Add / complete / delete tasks with 1–3 star difficulty
- 🧸 Working claw machine: aim matters, and yes — sometimes the claw "slips"
- 🪙 Coin economy: complete tasks to earn more plays (3–9 coins per task)
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

## Local run

Open `index.html` directly in a browser, or serve it:

```bash
python -m http.server 8080
# visit http://localhost:8080
```

Pure HTML / CSS / JavaScript — no frameworks, no build step.
