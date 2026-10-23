# Verdance

A calm, relaxing exploration game. The cities are asleep, the roads are moss, and you drive a little
sci-fi rover through a world that nature has quietly taken back. There is no combat and no timer.
Just drive, look around, and find what the old world left behind.

Built with [three.js](https://threejs.org) and Vite. It runs entirely in the browser, so it can be hosted on GitHub Pages.

## What's out there

- **The Origin Isle:** the hand-made starting island (~4 km) with seven lands: Whispering Meadows,
  Old Pine Woods, the Verdant Deep rainforest, Amber Dunes, Rust Canyons, Silver Peaks and Mirror Marsh.
  - **Ruins of the old world:** the Quiet City, a fallen overpass, a drowned stadium, a crashed airliner in the
    marsh, a broken dam, the last lighthouse, an ivy-wrapped ferris wheel, and more.
  - **Four hidden valleys**, reached through waterfalls, tunnels and narrow gaps.
  - **30 Echoes:** small memory fragments from before. Use the scanner to find them.
- **The endless wilds:** drowned causeways lead off the isle into a world that never ends. It is generated
  as you drive and is the same for everyone.
  - **Five more lands:** Ember Woods, Frostpine Taiga, Golden Savanna, Redwood Giants and Blossom Hills.
    Each is placed by temperature and moisture, with mesa country, lake districts, karst pillars and rivers.
  - **Villages of people who came back:** cottages, log cabins, adobe homes, stilt houses, treehouses and
    waterfall hamlets with water wheels, all linked by dirt trails.
  - **People:** villagers live their days, wave, and tell you about hidden places. They build new
    houses, so villages visibly grow while you play.
  - **Hidden labs** where people from a gentler future build quiet machines. You'll find a hangar inside a
    mountain, a desert array of field rings and tesla coils, and glass domes on the sea floor, with robot
    helpers.
  - **Hollows under the mountains:** caverns lit through a single skylight, and more hidden valleys.
  - **Wonders:** colossal trees, a crashed starship, floating rock islands, glowing mushroom forests,
    petrified forests, salt mirrors and sunken cities.
  - **The sea:** dive in submarine mode to find shipwrecks, drowned towns, kelp forests, coral and glowing
    pathways along the trenches.
- **More to enjoy:** rare sightings, a full day and night cycle, weather, wildlife and a generative radio.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Drive | W A S D / arrows | left stick |
| Boost | Shift | Boost |
| Look around | drag, mouse wheel to zoom | drag |
| Scan for echoes | Q | Scan |
| Hover mode (glide over water and sand) | H | Hover |
| Submarine (in deep water) | B, then E / F to rise and dive | Sub, Rise, Dive |
| Talk to people (stop nearby) | F | Talk |
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

Ground, rock, bark, concrete, wood, roofs and metal use real photo textures in `public/textures/`. They were
fetched with `node tools/fetch-textures.mjs`, which needs curl, unzip and ImageMagick. Village and lab
textures load lazily, the first time one streams in. The lab robot comes from `node tools/fetch-models.mjs`.

Checks: `node tools/physics-check.mjs` (rover physics), `node tools/wilds-check.mjs` (ASCII overview of the
endless world plus seam and timing checks) and `node tools/gen-check.mjs` (chunk generation per site kind).

## Deploy

Push to `main` on GitHub. `.github/workflows/pages.yml` builds the game and publishes it to GitHub Pages.
In the repository, set **Settings → Pages → Source** to **GitHub Actions**.

## Credits

- Photo textures: [ambientCG](https://ambientcg.com), CC0. See `public/textures/CREDITS.md`.
- Robot: RobotExpressive by Tomás Laulhé (Quaternius), with modifications by Don McCurdy, CC0. See `public/models/CREDITS.md`.
