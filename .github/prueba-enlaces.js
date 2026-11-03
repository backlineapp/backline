// Conecta con la app (WebView en modo depuración) y pulsa los botones.
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const CONCIERTO = '#/concierto/cb8e0149-422f-42ff-abda-0b5dada5f365';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const captura = (n) => execSync(`adb exec-out screencap -p > prueba/${n}.png`);
const volver = () => { execSync('adb shell am start -n io.github.backlineapp/.MainActivity'); };

(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const page = b.contexts()[0].pages()[0];
  console.log('URL:', page.url());
  await page.evaluate((h) => { location.hash = h; }, CONCIERTO);
  await espera(6000);
  captura('1-concierto');
  console.log('Botones:', await page.$$eval('button, a', (els) => els.map((e) => e.textContent.trim()).filter((t) => /llegar|calendario/i.test(t))));

  execSync('adb logcat -c');
  await page.click('text=Cómo llegar');
  await espera(6000);
  captura('2-como-llegar');
  console.log('Tras Cómo llegar:\n' + execSync('adb logcat -d | grep -E "START u0|ActivityNotFound" || true').toString());
  volver(); await espera(4000);

  execSync('adb logcat -c');
  await page.click('text=Añadir al calendario');
  await espera(6000);
  captura('3-calendario');
  console.log('Tras calendario:\n' + execSync('adb logcat -d | grep -E "START u0|ActivityNotFound|Capacitor" | tail -20 || true').toString());
  await b.close();
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
