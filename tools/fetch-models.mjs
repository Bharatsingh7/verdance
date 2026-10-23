// Downloads the CC0 robot used in the future labs into public/models/.
// Usage: node tools/fetch-models.mjs   (needs curl)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = new URL('../public/models/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const MODELS = {
  'RobotExpressive.glb': 'https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
};
for (const [file, url] of Object.entries(MODELS)) {
  execFileSync('curl', ['-sL', '--max-time', '120', '-o', out + file, url]);
  console.log(file, '<-', url);
}
writeFileSync(out + 'CREDITS.md', '# Model credits\n\n- `RobotExpressive.glb`: model by Tomás Laulhé (Quaternius), modifications by Don McCurdy. **CC0 1.0**. From the three.js examples.\n');
