import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const destination = resolve('public/ocr');
await mkdir(destination, { recursive: true });
await copyFile('node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt', `${destination}/worker.min.js.LICENSE.txt`);
await copyFile('node_modules/tesseract.js-core/LICENSE', `${destination}/core-LICENSE`);
await copyFile('node_modules/tesseract.js/dist/worker.min.js', `${destination}/worker.min.js`);
await copyFile('node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz', `${destination}/eng.traineddata.gz`);
for (const name of await readdir('node_modules/tesseract.js-core')) {
  if (/^tesseract-core.*lstm\.(?:wasm|wasm\.js)$/.test(name)) await copyFile(`node_modules/tesseract.js-core/${name}`, `${destination}/${name}`);
}
