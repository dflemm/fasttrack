// Bundles the rules engine and inlines it into the preview page.
import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = buildSync({
  entryPoints: [join(root, 'engine/src/engine.ts')], bundle: true, format: 'iife', globalName: 'FT',
  minify: true, write: false, target: 'es2019',
});
const esc = (x) => x.replace(/<\/script/g, '<\\/script');
const js = esc(out.outputFiles[0].text);
// PeerJS (MIT) makes the direct browser-to-browser connection for games with friends.
const peer = esc(buildSync({
  stdin: { contents: "import { Peer } from 'peerjs'; window.Peer = Peer;", resolveDir: root }, bundle: true, format: 'iife',
  minify: true, write: false, target: 'es2019', legalComments: 'none',
}).outputFiles[0].text);
const html = readFileSync(join(root, 'preview/template.html'), 'utf8').replace('/*ENGINE*/', () => js).replace('/*PEER*/', () => peer);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
writeFileSync(join(root, 'index.html'), html); // the copy GitHub Pages serves
console.log('dist/index.html', (html.length / 1024).toFixed(1) + ' KB');
