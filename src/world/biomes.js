// Biome palette + atmosphere definitions. Index order is used everywhere (weights arrays).
export const MEADOW = 0, FOREST = 1, RAINFOREST = 2, DESERT = 3, CANYON = 4, MOUNTAIN = 5, WETLAND = 6;
export const BIOME_COUNT = 7;

const c = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

export const BIOMES = [
  { name: 'Whispering Meadows', ground: c(0x8fb35a), ground2: c(0xb5c467), rock: c(0x8a8676), fog: c(0xcfe0d8), particles: 'pollen', birds: 1, crickets: 1 },
  { name: 'Old Pine Woods', ground: c(0x5d8a44), ground2: c(0x7a9a4c), rock: c(0x75766a), fog: c(0xb8cdbf), particles: 'leaves', birds: 1, crickets: 1 },
  { name: 'Verdant Deep', ground: c(0x3f8a3a), ground2: c(0x5fa040), rock: c(0x5f6b52), fog: c(0xa9c9b4), particles: 'rain', birds: 1.4, crickets: 1.2 },
  { name: 'Amber Dunes', ground: c(0xe2c287), ground2: c(0xd6ad6e), rock: c(0xb8875a), fog: c(0xf0dcc0), particles: 'dust', birds: 0.15, crickets: 0.3 },
  { name: 'Rust Canyons', ground: c(0xc77d4f), ground2: c(0xb4684a), rock: c(0xa35a3c), fog: c(0xe8c8b0), particles: 'dust', birds: 0.3, crickets: 0.4 },
  { name: 'Silver Peaks', ground: c(0x6f8a5c), ground2: c(0x889a74), rock: c(0x8c8d93), fog: c(0xd5dfe8), particles: 'snow', birds: 0.3, crickets: 0 },
  { name: 'Mirror Marsh', ground: c(0x6c8f4c), ground2: c(0x8a9a58), rock: c(0x6a6a58), fog: c(0xc4d6cc), particles: 'fireflies', birds: 1, crickets: 1.5 },
];

export const SAND = c(0xe8d39a);
export const SNOW = c(0xf4f7fb);
export const ROAD = c(0x5b5f55);
export const MUD = c(0x6d6448);
