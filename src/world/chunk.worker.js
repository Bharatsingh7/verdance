import { buildTerrain, buildVegetation, buildMap } from './chunkgen.js';

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'terrain') {
    const r = buildTerrain(m.cx, m.cz, m.segs);
    self.postMessage({ type: 'terrain', id: m.id, ...r }, [r.pos.buffer, r.nor.buffer, r.clr.buffer, r.idx.buffer, r.spl.buffer, r.spl2.buffer]);
  } else if (m.type === 'veg') {
    const r = buildVegetation(m.cx, m.cz, m.density);
    self.postMessage({ type: 'veg', id: m.id, veg: r }, Object.values(r).map((a) => a.buffer));
  } else if (m.type === 'map') {
    const img = buildMap(m.size, m.half, m.ox, m.oz);
    self.postMessage({ type: 'map', id: m.id, img }, [img.buffer]);
  }
};
