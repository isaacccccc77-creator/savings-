# ✈️ Miles Apart — Expense Tracker & London Flight Fund

A vibey, animated personal finance app for tracking daily spending in Singapore (while in NS)
and saving up for a yearly flight to London. No sign-up, no server, no dependencies:
it's plain HTML/CSS/JS and your data stays on your own device.

## Features

| | |
|---|---|
| 🟢 **"Left this month" gauge** | Animated semi-circle with a springy needle. Goes green → amber → red as money runs out. Shows spent, saved, and how much you can spend **per day** for the rest of the month. |
| ✈️ **London Fund gauge** | A gradient arc with a plane that flies along it as your fund grows. Tells you exactly how much to save **per week / per month** to hit your goal in time. |
| 🗺️ **Countdown flight path** | SIN → LHR route with animated dashes. The plane moves with *time* (how far through your saving cycle you are), the gauge with *money*, and a pill tells you if you're **on track / behind**. |
| 🌊 **Money flow** | Income flows into Spent / London fund / Left with animated marching arrows, ribbons sized by amount, plus a bouncing ↑/↓ trend arrow vs last month. |
| 📊 **Category bars + daily chart** | Food, Transport, Personal, Phone & Bills, Fun, Dates & Gifts, Other. The daily bar chart has an average line and hover/tap tooltips. |
| 💡 **Insights** | Month-end forecast, biggest spend, "skip 1 bubble tea a day ≈ S$X by trip", daily amount needed for London. |
| 🕐 **Two clocks** | Singapore and London time (handles UK daylight saving) with a "good time to call?" hint. |
| 🎉 **"I booked my flight"** | Pays the ticket out of the fund, logs the trip, and rolls the goal forward **one year** for the next trip. Confetti included. |
| 💾 **Backup** | Export/import JSON in ⚙ Settings. There's also **Load sample data** to try it out. |
| 🌗 **Dark / light theme**, 📱 **installable** as an app, and it works offline. |

## Getting started

1. Open `index.html` in any browser. That's it.
2. Tap ⚙ and set your **monthly income** (NS allowance + anything else), **flight cost**
   (SIN⇄LHR economy return is usually ~S$1,100–1,800), and **target trip date**.
3. Tap the big **＋** to log spending. Quick buttons cover the usual stuff (hawker, MRT, Grab, bubble tea).
   Switch to **✈ Save** when you move money into your flight fund, or **💰 Income** for extras like ang bao.

### Optional: monthly budget
By default, "Left this month" = income − spent − saved to the fund.
If you set a **monthly spending budget** in Settings, the gauge instead shows budget − spent.

## Put it on your phone (free, ~2 minutes)

Use **GitHub Pages** so you get a real link you can open anywhere:

1. On GitHub, go to this repo → **Settings → Pages**.
2. Under *Build and deployment*, choose **Deploy from a branch**, pick the branch (e.g. `main`) and folder `/ (root)`, then **Save**.
3. After a minute it's live at `https://<your-username>.github.io/savings-/`.
4. Open that link on your phone, then:
   - **iPhone (Safari):** Share → *Add to Home Screen*
   - **Android (Chrome):** ⋮ → *Add to Home screen* / *Install app*

It then opens full-screen like a normal app and works offline (handy in camp).

> ⚠️ Data is stored in the browser on **that device only** (localStorage). Clearing Safari/Chrome
> site data will erase it, so use **⚙ → Export backup** now and then (e.g. save to Google Drive).

## Single-file version

`dist/miles-apart.html` is the whole app in **one HTML file** (CSS, JS and icon inlined), handy for
sending to yourself. Regenerate it after editing with `python3 build-single.py`.
It skips the offline service worker, since there is no `sw.js` next to it.

## Files

```
index.html            page structure
styles.css            theme tokens, glassmorphism, animations
app.js                all logic: state, gauges, charts, flow, sheets
sw.js                 offline support (network-first cache)
manifest.webmanifest  "install to home screen" metadata
icon.svg              app icon
build-single.py       bundles everything into dist/miles-apart.html
```
