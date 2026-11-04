#!/usr/bin/env node
// Review stills of a live page: drives window.LIVE through a list of states and screenshots each at 1600 x 900.
//   node review-live.mjs teardown-out/dist/mech-live.html teardown-out/review
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {CHROMIUM, CHROMIUM_ARGS, playwright} from './paths.mjs';

const [page_ = 'teardown-out/dist/mech-live.html', out = 'teardown-out/review'] = process.argv.slice(2);
fs.mkdirSync(out, {recursive: true});
const SHOTS = [
  ['cine', 'LIVE.takeOver(); LIVE.setSpeed(4.5); LIVE.act("cine")', 4],
  ['leg-xray', 'LIVE.act("leg"); LIVE.act("xray")', 3],
  ['side', 'LIVE.act("xray"); LIVE.act("side")', 3],
  ['front-trace', 'LIVE.act("trace"); LIVE.act("front")', 4],
  ['core', 'LIVE.act("core")', 3.5],
  ['top', 'LIVE.act("core"); LIVE.act("top")', 3.5],
  ['stand', 'LIVE.act("trace"); LIVE.act("cine"); LIVE.setSpeed(0)', 5],
];
const browser = await playwright().chromium.launch({executablePath: CHROMIUM, args: [...CHROMIUM_ARGS, '--use-angle=metal'], headless: !process.env.HEADED});
const page = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(pathToFileURL(path.resolve(page_)).href + '?tier=0');
await page.waitForFunction(() => window.SIM_SHOWN && window.LIVE, null, {timeout: 30000});
console.log('gpu:', await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
}));
for (const [name, js, wait] of SHOTS) {
  await page.evaluate(js);
  await page.waitForTimeout(wait * 1000);
  await page.screenshot({path: path.join(out, `${name}.png`)});
  console.log(name, 'tier', await page.evaluate(() => LIVE.tier));
}
await browser.close();
