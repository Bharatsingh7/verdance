# Verdance

A calm, relaxing exploration game. The cities are asleep, the roads are moss, and you drive a little
sci-fi rover through a world that nature has quietly taken back. There is no combat and no timer.
Just drive, look around, and find what the old world left behind.

Built with [three.js](https://threejs.org) and Vite. It runs entirely in the browser, so it can be hosted on GitHub Pages.

## What's out there

- **Seven lands:** Whispering Meadows, Old Pine Woods, the Verdant Deep rainforest, Amber Dunes,
  Rust Canyons, Silver Peaks and Mirror Marsh. They are spread across a ~4 km island streamed in real time.
- **Ruins of the old world:**
  - The Quiet City
  - A fallen overpass
  - A drowned stadium
  - A crashed airliner in the marsh
  - A broken dam
  - The last lighthouse
  - An ivy-wrapped ferris wheel
  - …and more.
- **Four hidden valleys**, reached through waterfalls, tunnels and narrow gaps.
- **30 Echoes:** small memory fragments from before. Use the scanner to find them.
- **Rare sightings**, a full day and night cycle, weather, wildlife, and a generative radio.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Drive | W A S D / arrows | left stick |
| Boost | Shift | Boost |
| Look around | drag, mouse wheel to zoom | drag |
| Scan for echoes | Q | Scan |
| Hover mode (glide over water and sand) | H | Hover |
| Drone camera | C (E / Q to rise and sink) | Drone |
| Map / Journal | Tab / J | Map / Journal |
| Radio | M | Radio |
| Let time pass | hold T | Time |
| Headlights / photo mode | L / P | – |
| Reset rover | R | – |
| Graphics quality | G (auto by default) | – |

Progress saves automatically in your browser.

## Develop

```sh
npm install
npm run dev       # local dev server
npm run build     # production build in dist/
npm run preview   # serve the build
```

The world is generated from a fixed seed in Web Workers (`src/world/chunkgen.js`). Trees, plants and the
leaf textures are generated procedurally at startup.

Ground, rock, bark and concrete use real photo textures in `public/textures/`. They were fetched with
`node tools/fetch-textures.mjs`, which needs curl, unzip and ImageMagick.

## Deploy

Push to `main` on GitHub. `.github/workflows/pages.yml` builds the game and publishes it to GitHub Pages.
In the repository, set **Settings → Pages → Source** to **GitHub Actions**.

## Credits

- Photo textures: [ambientCG](https://ambientcg.com), CC0. See `public/textures/CREDITS.md`.
