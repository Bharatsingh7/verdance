// Hand-placed world data: biome seed points, terrain features, roads, landmarks, hidden valleys.
// Coordinates are metres; the playable island spans roughly x,z in [-1900, 1900]. North is -z.
import { MEADOW, FOREST, RAINFOREST, DESERT, CANYON, MOUNTAIN, WETLAND } from './biomes.js';

export const WORLD_HALF = 2048;
export const SPAWN = { x: 30, z: 60, heading: Math.PI * 0.82 };

export const BIOME_SEEDS = [
  [MEADOW, 0, 0], [MEADOW, 450, -250], [MEADOW, -250, 450],
  [FOREST, -1000, -650], [FOREST, -350, -850], [FOREST, -1550, -250], [FOREST, -1300, -1150], [FOREST, 250, -950], [FOREST, 780, -980], [MEADOW, -120, -480],
  [MOUNTAIN, -650, -1650], [MOUNTAIN, 250, -1620], [MOUNTAIN, 1050, -1600], [MOUNTAIN, -1500, -1650], [MOUNTAIN, -100, -1400],
  [WETLAND, 1150, -600], [WETLAND, 1550, -150],
  [RAINFOREST, 1300, 450], [RAINFOREST, 900, 950], [RAINFOREST, 1650, 1000],
  [DESERT, -1000, 750], [DESERT, -1550, 350], [DESERT, -600, 1400],
  [CANYON, 200, 1150], [CANYON, 100, 1650], [CANYON, 600, 1500],
];

// Carved river gorge through the canyonlands, ending in the southern sea.
export const GORGE = [[-350, 750], [-80, 980], [220, 1120], [480, 1380], [640, 1700], [720, 2050]];

// Hidden valleys: a walled basin with one way in. floor height is derived from terrain at the entrance mouth.
export const VALLEYS = [
  { id: 'lantern', name: 'Lantern Grove', x: 1600, z: 1050, r: 105, wall: 55, angle: Math.PI * 1.05, gate: 'waterfall',
    text: 'A bowl of moss where the trees learned to glow. Nobody planted them.' },
  { id: 'starfield', name: 'Starfield Valley', x: -150, z: -1420, r: 120, wall: 60, angle: Math.PI * 0.5, gate: 'gap',
    text: 'An observatory still pointed at the sky, knee-deep in wildflowers.' },
  { id: 'crystal', name: 'Crystal Hollow', x: 760, z: 1250, r: 85, wall: 50, angle: Math.PI * 0.95, gate: 'tunnel',
    text: 'Quartz grew through the old mine until the mine became the quartz.' },
  { id: 'glass', name: 'The Glass Garden', x: -1450, z: -1000, r: 95, wall: 50, angle: -Math.PI * 0.15, gate: 'tunnel',
    text: 'A greenhouse dome where the plants finally outgrew the glass.' },
];

// Landmarks: ruins of the old world. `flat` flattens terrain under them (radius in m).
export const LANDMARKS = [
  { id: 'city', name: 'The Quiet City', kind: 'city', x: -650, z: -330, flat: 175,
    text: 'Towers that used to hum with traffic. Now the loudest thing here is the wind in the ferns.' },
  { id: 'overpass', name: 'The Fallen Overpass', kind: 'overpass', x: 60, z: -40, flat: 0,
    text: 'A highway that once carried a million commutes. Half of it lay down to rest.' },
  { id: 'village', name: 'Hollyhock Lane', kind: 'village', x: 320, z: 330, flat: 80,
    text: 'Little houses with their doors open, as if everyone just stepped out for a moment.' },
  { id: 'turbines', name: 'The Turning Hills', kind: 'turbines', x: 520, z: -380, flat: 0,
    text: 'One turbine still turns, slowly, for no one. It seems content.' },
  { id: 'fuel', name: 'Last Stop Fuel', kind: 'fuel', x: -930, z: 640, flat: 45,
    text: '"OPEN 24 HOURS" says the sign. It kept its promise longer than anyone expected.' },
  { id: 'dishes', name: 'The Listening Array', kind: 'dishes', x: -1480, z: 470, flat: 90,
    text: 'Great dishes that listened to the stars. Some still face up, patiently.' },
  { id: 'giant', name: 'The Sleeping Giant', kind: 'giant', x: -480, z: 1150, flat: 40,
    text: 'A statue whose name was lost. The dunes are slowly tucking it in.' },
  { id: 'train', name: 'The Long Train', kind: 'train', x: -1150, z: 180, flat: 0,
    text: 'It stopped between stations and never left. Lizards have the timetable now.' },
  { id: 'stadium', name: 'The Drowned Stadium', kind: 'stadium', x: 1260, z: 470, flat: 120,
    text: 'The crowd is gone. The jungle took every seat and the field became a pond.' },
  { id: 'plane', name: 'Flight Seven', kind: 'plane', x: 1130, z: -520, flat: 75,
    text: 'It landed softly in the marsh. Herons nest in the wings.' },
  { id: 'dam', name: 'Ochre Dam', kind: 'dam', x: 220, z: 1120, flat: 0,
    text: 'The dam broke long ago. The river chose its own way and carved a better one.' },
  { id: 'lighthouse', name: 'The Last Lighthouse', kind: 'lighthouse', x: 1640, z: -880, flat: 30, pad: 6,
    text: 'Its lamp still catches the sunset. Ships stopped coming; the light did not stop caring.' },
  { id: 'park', name: 'Lantern Fair', kind: 'park', x: -1180, z: -720, flat: 70,
    text: 'A ferris wheel tangled in ivy. Children once screamed here, happily.' },
  { id: 'relay', name: 'Skyward Relay', kind: 'relay', x: 420, z: -1240, flat: 22,
    text: 'The highest voice of the old world. It says nothing now, beautifully.' },
];

// Old roads (polylines). Coloured into the terrain as mossy asphalt; they gently guide you between landmarks.
export const ROADS = [
  [[-1450, 470], [-1200, 560], [-930, 640], [-600, 520], [-300, 300], [-120, 80], [60, -40], [280, -160], [520, -380], [800, -470], [1130, -520], [1450, -700], [1640, -880]],
  [[60, -40], [-200, -180], [-650, -330], [-950, -550], [-1180, -720]],
  [[60, -40], [180, 170], [320, 330], [650, 380], [1000, 420], [1260, 470]],
  [[-930, 640], [-700, 900], [-480, 1150]],
  [[320, 330], [260, 700], [220, 1000]],
  [[-200, -180], [100, -600], [300, -950], [420, -1240]],
];

// Train track: straight run across the western plains.
export const TRACK = [[-1700, -60], [-1150, 180], [-600, 420]];

// Small lakes (basins below sea level fill with water automatically).
export const LAKES = [
  { x: -330, z: -560, r: 110, depth: 7 },
  { x: 700, z: 60, r: 80, depth: 5 },
  { x: -1250, z: -380, r: 70, depth: 5 },
  { x: 950, z: -1050, r: 90, depth: 8 },
];
