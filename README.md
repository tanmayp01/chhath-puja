# Chhath Ghat Online

Can't go home for Chhath? Live all four days of Chhath Puja 2026 (13–16 Nov) on a 3D ghat in the browser.

- Play as a vratin (female) or vrati (male), with your name
- Din 1 Nahay Khay: holy dip, buy lauki, cook kaddu-bhaat
- Din 2 Kharna: mango wood, gur and chawal, cook rasiya-kheer, share prasad with neighbours
- Din 3 Sandhya Arghya: fry thekua, pack the daura, arghya to the setting sun, light a kosi, float a diya
- Din 4 Usha Arghya: arghya to the rising sun, paran
- Cooking mini-game, chatty neighbours, "send wishes home" via WhatsApp, progress saved in the browser
- Chhath geet (Sharda Sinha and more) streamed from the labels' official YouTube uploads; no audio is bundled
- Support panel with a UPI QR
- Festival guide: the four days with 2026 dates, arghya timings, soop contents, ghat etiquette, live countdown
- Desktop (WASD + drag to look + E) and phone (joystick + tap button) controls
- Synthesised ambient sound (river, drone, bells, shankh), no audio files

## Run locally
It's a static site with no build step. Serve the folder with any static server:

    npx serve .        # or: python3 -m http.server

then open http://localhost:3000 (or :8000).

## Deploy to Vercel
- With the CLI: `npx vercel` from this folder (accept the defaults; framework = Other, no build command), then `npx vercel --prod`.
- Or push the folder to a GitHub repo and import it at vercel.com/new.

Three.js r169 is bundled as `three.module.min.js` (MIT licence).
