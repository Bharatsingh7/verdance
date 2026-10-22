// Downloads CC0 PBR texture sets from ambientCG (https://ambientcg.com) and keeps only
// colour + OpenGL normal maps, recompressed to 1K JPG, in public/textures/.
// Usage: node tools/fetch-textures.mjs   (needs curl, unzip and ImageMagick's `magick`)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SETS = {
  grass: 'Grass004', dirt: 'Ground037', sand: 'Ground054', rock: 'Rock051', snow: 'Snow006',
  bark: 'Bark014', bark2: 'Bark012', concrete: 'Concrete042A', asphalt: 'Asphalt031', rust: 'Metal041B',
};
const out = new URL('../public/textures/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
for (const [name, id] of Object.entries(SETS)) {
  const dir = mkdtempSync(join(tmpdir(), 'acg-'));
  const zip = join(dir, 'set.zip');
  execFileSync('curl', ['-sL', '--max-time', '120', '-o', zip, `https://ambientcg.com/get?file=${id}_1K-JPG.zip`]);
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  const files = readdirSync(dir);
  const color = files.find((f) => /_Color\.jpg$/i.test(f));
  const normal = files.find((f) => /_NormalGL\.jpg$/i.test(f));
  if (!color || !normal) throw new Error(`${id}: missing maps in ${files.join(', ')}`);
  execFileSync('magick', [join(dir, color), '-resize', '1024x1024', '-strip', '-quality', '82', join(out, `${name}_albedo.jpg`)]);
  execFileSync('magick', [join(dir, normal), '-resize', '1024x1024', '-strip', '-quality', '88', join(out, `${name}_normal.jpg`)]);
  rmSync(dir, { recursive: true, force: true });
  console.log(name, '<-', id);
}
writeFileSync(join(out, 'CREDITS.md'), `# Texture credits\n\nAll textures are from [ambientCG](https://ambientcg.com) and licensed **CC0 1.0** (public domain).\n\n` +
  Object.entries(SETS).map(([n, id]) => `- \`${n}\`: [${id}](https://ambientcg.com/view?id=${id})`).join('\n') + '\n');
