// Abre un concierto en la app y pulsa los botones como lo haría una persona
// (toques reales en la pantalla), guardando capturas y qué app se abre.
const { execSync } = require('child_process');
const CONCIERTO = '#/concierto/cb8e0149-422f-42ff-abda-0b5dada5f365';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (c) => execSync(c, { maxBuffer: 1 << 26 }).toString();
const captura = (n) => execSync(`adb exec-out screencap -p > prueba/${n}.png`);

async function cdp(expr) {
  const lista = await (await fetch('http://localhost:9222/json')).json();
  const ws = new WebSocket(lista.find((p) => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const res = await new Promise((r) => {
    ws.addEventListener('message', (m) => r(JSON.parse(m.data)));
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  });
  ws.close();
  return res.result && res.result.result && res.result.result.value;
}

function posicion(texto) {
  sh('adb shell uiautomator dump /sdcard/ui.xml');
  const xml = sh('adb shell cat /sdcard/ui.xml');
  const re = new RegExp('(?:text|content-desc)="' + texto + '"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"');
  const m = xml.match(re);
  return m ? [(+m[1] + +m[3]) >> 1, (+m[2] + +m[4]) >> 1] : null;
}

function tocar(texto) {
  sh('adb shell uiautomator dump /sdcard/ui.xml');
  const xml = sh('adb shell cat /sdcard/ui.xml');
  const re = new RegExp('(?:text|content-desc)="' + texto + '"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"');
  const m = xml.match(re);
  if (!m) { console.log('No encuentro en pantalla:', texto); return false; }
  const x = (+m[1] + +m[3]) >> 1, y = (+m[2] + +m[4]) >> 1;
  console.log('Toco', texto, 'en', x, y);
  sh(`adb shell input tap ${x} ${y}`);
  return true;
}

(async () => {
  console.log('URL:', await cdp('location.href'));
  await cdp(`location.hash = ${JSON.stringify(CONCIERTO)}`);
  await espera(7000);
  await cdp(`(function(){var b=[].slice.call(document.querySelectorAll('a,button')).filter(function(e){return /llegar/i.test(e.textContent)})[0]; if(b) b.scrollIntoView({block:'center'}); return !!b})()`);
  await espera(1500);
  captura('1-concierto');

  sh('adb logcat -c');
  if (!tocar('Cómo llegar')) {
    // El enlace no siempre sale en el árbol de accesibilidad: se toca a la
    // altura que le corresponde respecto al botón del calendario.
    const cal = posicion('Añadir al calendario');
    const d = await cdp(`(function(){var t=[].slice.call(document.querySelectorAll('a,button'));function r(x){return t.filter(function(e){return e.textContent.trim()===x})[0].getBoundingClientRect().top}return (r('Añadir al calendario')-r('Cómo llegar'))*devicePixelRatio})()`);
    console.log('Toco Cómo llegar (calculado) en', cal[0], Math.round(cal[1] - d));
    sh(`adb shell input tap ${cal[0]} ${Math.round(cal[1] - d)}`);
  }
  await espera(7000);
  captura('2-como-llegar');
  console.log('Tras Cómo llegar:\n' + sh('adb logcat -d | grep -E "START u0|ActivityNotFound" || true'));
  sh('adb shell am start -n io.github.backlineapp/.MainActivity');
  await espera(5000);

  sh('adb logcat -c');
  tocar('Añadir al calendario');
  await espera(7000);
  captura('3-calendario');
  console.log('Tras calendario:\n' + sh('adb logcat -d | grep -E "START u0|ActivityNotFound|Capacitor" | tail -25 || true'));
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
