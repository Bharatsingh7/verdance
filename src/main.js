import './ui/style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Input } from './core/input.js';
import { loadSave, writeSave } from './core/save.js';
import { Quality, PRESETS } from './core/quality.js';
import { World } from './world/chunks.js';
import { Water } from './world/water.js';
import { buildRuins } from './world/ruins.js';
import { Secrets } from './world/secrets.js';
import { shared } from './world/models.js';
import { preloadPhotos, texProgress, terrainMaterial } from './world/surfaces.js';
import { heightAt, weightsAt, valleyAt, WATER_LEVEL } from './world/terrain.js';
import { BIOMES, BIOME_COUNT, RAINFOREST, WETLAND } from './world/biomes.js';
import { SPAWN, WORLD_HALF } from './world/features.js';
import { Atmosphere } from './fx/sky.js';
import { Particles } from './fx/particles.js';
import { Wildlife } from './fx/wildlife.js';
import { Tracks } from './fx/tracks.js';
import { Audio, STATIONS } from './fx/audio.js';
import { Vehicle } from './vehicle/physics.js';
import { Truck } from './vehicle/truck.js';
import { CameraRig } from './vehicle/camera.js';
import { HUD, MapView, Journal } from './ui/hud.js';
import { isTouchDevice, setupTouch } from './ui/touch.js';

const save = loadSave();
const touch = isTouchDevice();

// --- Renderer / scene ------------------------------------------------------------------
// Reversed depth (where supported) gives far more depth precision: no flickering between distant surfaces.
const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance', reversedDepthBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
preloadPhotos();
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 3500);
// Subtle bloom on the High preset only.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.35, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let useBloom = false;
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const world = new World(scene);
const atmos = new Atmosphere(scene, renderer);
atmos.time = save?.time ?? 0.31;
const water = new Water(scene);
const ruins = buildRuins(scene, world);
const secrets = new Secrets(scene, save);
const particles = new Particles(scene);
const wildlife = new Wildlife(scene);
const tracks = new Tracks(scene);

const start = save?.pos ?? { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading };
const vehicle = new Vehicle(start.x, start.z, start.heading);
vehicle.hover = !!save?.hover;
vehicle.hoverT = vehicle.hover ? 1 : 0;
vehicle.distance = save?.distance ?? 0;
const truck = new Truck(scene);
const rig = new CameraRig(camera);
const input = new Input(renderer.domElement);
const audio = new Audio();
audio.station = save?.station ?? 1;
const hud = new HUD();
const map = new MapView(WORLD_HALF);
map.loadExplored(save?.explored);
const journal = new Journal();
if (touch) setupTouch(input);

const biomesVisited = new Set(save?.biomes ?? []);
const sightings = save?.sightings ?? [];
for (const s of sightings) wildlife.seen.add(s.id);
let playTime = save?.playTime ?? 0;

const quality = new Quality(save?.quality ?? (touch ? 0 : 1), applyQuality);
function applyQuality(p) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, p.pixel));
  composer.setPixelRatio(Math.min(devicePixelRatio, p.pixel));
  useBloom = p.shadows >= 2;
  world.setTerrainMaterial(terrainMaterial(p.shadows > 0));
  particles.pixel.value = Math.min(devicePixelRatio, p.pixel);
  world.viewRadius = p.view; world.vegRadius = p.veg; world.nearRadius = p.near;
  world.shadows = p.shadows > 0;
  atmos.setShadowQuality(p.shadows);
  if (world.density !== p.density) { world.density = p.density; world.resetVegetation(); }
}
applyQuality(quality.preset);

// --- Persistence ---------------------------------------------------------------------------
function persist() {
  writeSave({
    pos: { x: vehicle.pos.x, z: vehicle.pos.z, heading: vehicle.heading },
    time: atmos.time, hover: vehicle.hover, distance: vehicle.distance, playTime,
    echoes: [...secrets.collected], discovered: [...secrets.discovered], sightings, biomes: [...biomesVisited],
    explored: map.serializeExplored(), quality: quality.auto ? undefined : quality.level, station: audio.station,
  });
}
addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// --- Title / loading ---------------------------------------------------------------------
let started = false;
const beginBtn = document.getElementById('begin');
const loadbar = document.querySelector('#loadbar i');
beginBtn.addEventListener('click', begin);
addEventListener('keydown', (e) => { if (!started && !beginBtn.disabled && (e.code === 'Enter' || e.code === 'Space')) begin(); });
let mapRequested = false;
let compileState = null;

function begin() {
  if (started) return;
  started = true;
  audio.init();
  document.getElementById('title').classList.add('gone');
  setTimeout(() => (document.getElementById('title').hidden = true), 1300);
  hud.show();
  const b = currentBiome;
  hud.showBanner(BIOMES[b].name, save ? 'welcome back' : 'the world, after');
  if (!save) setTimeout(() => hud.toast('info', 'A note', 'Take your time.', 'There is nowhere you need to be. Follow the old roads, or don\'t. Press Q to listen for echoes nearby.', 10), 5000);
}

// --- Overlays -------------------------------------------------------------------------------
function closeOverlays() { map.toggle(false); journal.toggle(false); }
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => (b.dataset.close === 'map' ? map.toggle(false) : journal.toggle(false)));
for (const o of document.querySelectorAll('.overlay')) o.addEventListener('pointerdown', (e) => { if (e.target === o) closeOverlays(); });

function mapState() {
  return { places: secrets.places, discovered: secrets.discovered, items: secrets.items, collected: secrets.collected, px: vehicle.pos.x, pz: vehicle.pos.z, heading: vehicle.heading };
}
function journalState() {
  return { places: secrets.places, discovered: secrets.discovered, collected: secrets.collected, sightings, biomes: biomesVisited, distance: vehicle.distance, playTime };
}

// --- Main loop --------------------------------------------------------------------------------
const W = new Float32Array(BIOME_COUNT);
const fogCol = new THREE.Color();
const tmpC = new THREE.Color();
const camDir = new THREE.Vector3();
let currentBiome = 0, biomeHold = 0, lastValley = null;
let photo = false, timeScale = 1;
let last = performance.now(), t = 0;
let saveTimer = 0, hudTimer = 0, slowTimer = 0, mapTimer = 0, waterNear = 0;
let steerSmooth = 0;

function handleKeys() {
  const overlay = map.open || journal.open;
  if (input.hit('Tab')) { journal.toggle(false); map.toggle(); if (map.open) map.draw(mapState()); audio.click(); }
  if (input.hit('KeyJ')) { map.toggle(false); journal.toggle(); if (journal.open) journal.render(journalState()); audio.click(); }
  if (input.hit('Escape')) { closeOverlays(); if (photo) { photo = false; hud.setPhoto(false); } }
  if (overlay) return;
  const drone = rig.mode === 'drone';
  if (input.hit('KeyQ') && !drone) { if (secrets.scan(vehicle.pos)) audio.scan(); }
  if (input.hit('KeyH')) {
    vehicle.hover = !vehicle.hover; audio.hover(vehicle.hover);
    hud.toast('info', 'Rover', vehicle.hover ? 'Hover mode' : 'Wheels down', vehicle.hover ? 'Wheels fold away. Glide over water and sand.' : '', 3);
  }
  if (input.hit('KeyC')) { const m = rig.toggleDrone(vehicle); document.body.classList.toggle('drone', m === 'drone'); audio.click(); if (m === 'drone') hud.toast('info', 'Drone', 'Drone camera', touch ? 'Stick to fly, Up/Down to climb. Drone again to return.' : 'WASD to fly, E / Q to rise and sink, C to return.', 4); }
  if (input.hit('KeyP')) { photo = !photo; hud.setPhoto(photo); }
  if (input.hit('KeyL')) { truck.headOn = !truck.headOn; audio.click(); }
  if (input.hit('KeyM')) { const s = audio.nextStation(); hud.toast('info', 'Radio', s, '', 2.5); }
  if (input.hit('Space') && !drone) { audio.honk(); wildlife.startle(vehicle.pos); }
  if (input.hit('KeyR')) vehicle.reset();
  if (input.hit('KeyG')) { quality.set(quality.level + 1, true); hud.toast('info', 'Graphics', PRESETS[quality.level].name + ' quality', '', 2.5); }
  if (input.hit('KeyN')) { audio.setMuted(!audio.muted); hud.toast('info', 'Sound', audio.muted ? 'Muted' : 'Sound on', '', 2); }
}

// Cap at ~60 fps: high-refresh monitors would otherwise render 120-240 frames a second for no visible gain.
const FRAME_MS = 1000 / 61;
function frame(now) {
  requestAnimationFrame(frame);
  if (now - last < FRAME_MS) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  shared.time.value = t;

  if (started) { handleKeys(); playTime += dt; }
  const overlay = map.open || journal.open;
  const driving = started && rig.mode === 'chase' && !overlay;
  const throttle = driving ? input.throttle() : 0;
  const steer = driving ? input.steer() : 0;
  steerSmooth += (steer - steerSmooth) * (1 - Math.exp(-8 * dt));
  vehicle.update(dt, { throttle, steer, boost: driving && input.down('ShiftLeft', 'ShiftRight') }, world);
  if (vehicle.bump > 0.25) audio.thump(vehicle.bump);
  truck.update(dt, vehicle, atmos.isNight, steerSmooth);
  tracks.update(dt, vehicle);

  if (started) {
    if (!overlay) rig.update(dt, vehicle, input, world);
  } else {
    // Attract mode: slow orbit around the rover.
    const a = t * 0.06 + 2.2, r = 26;
    const x = vehicle.pos.x + Math.sin(a) * r, z = vehicle.pos.z + Math.cos(a) * r;
    camera.position.set(x, Math.max(heightAt(x, z), WATER_LEVEL) + 9, z);
    camera.lookAt(vehicle.pos.x, vehicle.pos.y + 2, vehicle.pos.z);
  }

  const focus = rig.mode === 'drone' ? camera.position : vehicle.pos;
  world.update(focus);

  // Biome mood.
  weightsAt(focus.x, focus.z, W);
  let b = 0; for (let i = 1; i < BIOME_COUNT; i++) if (W[i] > W[b]) b = i;
  if (b !== currentBiome && W[b] > 0.62) {
    biomeHold += dt;
    if (biomeHold > 1.5) {
      currentBiome = b; biomeHold = 0;
      if (started) { hud.showBanner(BIOMES[b].name, biomesVisited.has(b) ? '' : 'new lands'); biomesVisited.add(b); }
    }
  } else biomeHold = 0;
  if (started) biomesVisited.add(currentBiome);

  slowTimer -= dt;
  let valley = lastValley;
  if (slowTimer <= 0) {
    slowTimer = 0.4;
    valley = valleyAt(vehicle.pos.x, vehicle.pos.z);
    if (valley && valley !== lastValley && started && secrets.discovered.has(valley.id)) hud.showBanner(valley.name, 'hidden valley');
    lastValley = valley;
    let wn = 0;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; if (heightAt(vehicle.pos.x + Math.cos(a) * 30, vehicle.pos.z + Math.sin(a) * 30) < WATER_LEVEL) wn++; }
    waterNear = Math.max(wn / 6, vehicle.floating || vehicle.hover && heightAt(vehicle.pos.x, vehicle.pos.z) < 0 ? 1 : 0);
    if (started) map.reveal(vehicle.pos.x, vehicle.pos.z, 260);
  }

  fogCol.setRGB(0, 0, 0);
  for (let i = 0; i < BIOME_COUNT; i++) if (W[i] > 0) fogCol.add(tmpC.setRGB(...BIOMES[i].fog).multiplyScalar(W[i]));
  atmos.biomeFog.lerp(fogCol, 1 - Math.exp(-1.5 * dt));
  const mist = W[RAINFOREST] * 0.45 + W[WETLAND] * 0.3 + particles.raining * 0.25 + (valley?.id === 'lantern' ? 0.3 : 0);
  atmos.fogDensity += (Math.max(0.15, 1 - mist) - atmos.fogDensity) * (1 - Math.exp(-0.7 * dt));

  timeScale = started && !overlay && input.down('KeyT') ? 90 : 1;
  atmos.update(dt * timeScale, camera, focus, world.viewRadius);
  water.update(camera, atmos.daylight, t);
  const env = { daylight: atmos.daylight, valley };
  // Sun direction in view space + colour, for light shining through leaves.
  shared.sunView.value.copy(atmos.sun.position).sub(atmos.sun.target.position).normalize().transformDirection(camera.matrixWorldInverse);
  shared.sunColor.value.copy(atmos.sun.color).multiplyScalar(atmos.sun.intensity * 0.35);
  particles.update(dt, camera, W, env);
  shared.wind.value = 1 + particles.raining * 0.8;
  for (const f of ruins.animated) f(dt, env);

  if (started) {
    let pings = 0;
    for (const e of secrets.update(dt, t, vehicle.pos)) {
      if (e.type === 'echo') { audio.chime(); hud.toast('echo', `Echo ${secrets.collected.size} of ${secrets.total}`, e.item.title, e.item.text, 10); persist(); }
      else if (e.type === 'place') {
        audio.discover();
        const label = { landmark: 'Discovered', valley: 'Hidden valley found', viewpoint: 'Viewpoint' }[e.place.kind];
        hud.showBanner(e.place.name, label);
        hud.toast('place', label, e.place.name, e.place.text, 9);
        persist();
      } else if (e.type === 'ping') pings++;
    }
    if (pings) { audio.ping(); hud.toast('info', 'Scanner', `${pings} echo${pings > 1 ? 'es' : ''} nearby`, 'Follow the ◆ on your compass, or the beams of light.', 4); }
    for (const e of wildlife.update(dt, t, vehicle, env)) {
      sightings.push(e); audio.discover();
      hud.toast('place', 'Sighting', e.name, e.text, 9);
      persist();
    }
  } else wildlife.update(dt, t, vehicle, env);

  audio.update(dt, {
    speed: rig.mode === 'drone' ? 0 : vehicle.speed, altitude: Math.max(0, camera.position.y), drone: rig.mode === 'drone', hover: vehicle.hoverT,
    rain: particles.raining, water: waterNear, daylight: atmos.daylight,
    birds: W.reduce((s, w, i) => s + w * BIOMES[i].birds, 0), crickets: W.reduce((s, w, i) => s + w * BIOMES[i].crickets, 0),
  });

  hudTimer -= dt;
  if (started && hudTimer <= 0) {
    hudTimer = 1 / 20;
    camera.getWorldDirection(camDir);
    hud.update(1 / 20, {
      hours: atmos.hours, speed: rig.mode === 'drone' ? 0 : vehicle.speed,
      mode: rig.mode === 'drone' ? 'drone' : vehicle.hover ? 'hover' : vehicle.floating ? 'floating' : timeScale > 1 ? 'time passing' : '',
      radio: audio.station ? '♪ ' + STATIONS[audio.station] : '',
      echoes: secrets.collected.size, echoTotal: secrets.total, places: secrets.discovered.size, placeTotal: secrets.placeTotal,
      yaw: Math.atan2(camDir.x, -camDir.z), px: camera.position.x, pz: camera.position.z, markers: secrets.markers(),
    });
  }
  mapTimer -= dt;
  if (map.open && mapTimer <= 0) { mapTimer = 0.25; map.draw(mapState()); }

  if (!started) {
    const total = 34, missing = Math.min(total, world.missingNear(vehicle.pos.x, vehicle.pos.z, 260) + world.missingNear(vehicle.pos.x, vehicle.pos.z, 140, true));
    loadbar.style.width = `${Math.round((1 - missing / total) * 100)}%`;
    if (!texProgress.done) loadbar.style.width = `${Math.round(Math.min(1 - missing / total, texProgress.loaded / Math.max(1, texProgress.total)) * 100)}%`;
    // Pre-compile every shader in parallel before letting the player in (avoids a frozen first frame).
    if (missing === 0 && texProgress.done && !compileState) {
      compileState = 'busy';
      beginBtn.textContent = 'Warming up…';
      renderer.compileAsync(scene, camera).catch(() => {}).then(() => (compileState = 'done'));
    }
    if (compileState === 'done' && beginBtn.disabled) { beginBtn.disabled = false; beginBtn.textContent = save ? 'Continue' : 'Begin'; }
  }
  if (!mapRequested && world.missingNear(vehicle.pos.x, vehicle.pos.z, 260) === 0) {
    mapRequested = true;
    world.requestMap(512, WORLD_HALF).then((img) => map.setBase(img, 512));
  }

  quality.sample(dt);
  saveTimer += dt;
  if (started && saveTimer > 15) { saveTimer = 0; persist(); }

  if (useBloom) composer.render(dt); else renderer.render(scene, camera);
  input.endFrame();
}
requestAnimationFrame(frame);

// Debug hook for automated checks.
window.__verdance = { vehicle, world, atmos, secrets, rig, quality, camera, begin, input, bloom, renderer, scene };
