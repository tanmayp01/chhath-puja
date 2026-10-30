# Chhath Ghat Online

A walkable 3D Chhath Puja ghat in the browser, with a festival guide for Chhath 2026 (13–16 Nov).

- Offer Sandhya Arghya at sunset, keep jaagran through the night, offer Usha Arghya at dawn
- Float diyas, light the kosi, collect thekua, sugarcane and a soop from the stalls
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
