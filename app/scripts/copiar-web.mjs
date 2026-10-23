// Copia la web de Backline (la carpeta de arriba) a app/www, que es lo que
// va dentro de la app de App Store y Google Play. No copia lo que no hace
// falta en el móvil (Supabase, la propia carpeta app, documentos).
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = dirname(dirname(fileURLToPath(import.meta.url)));
const web = dirname(app);
const destino = join(app, 'www');

const ARCHIVOS = [
  'index.html', 'privacidad.html', 'condiciones.html',
  'estilos.css', 'manifest.json', 'grupos.json',
  'nativa.js', 'seguidos.js', 'nube.js', 'denuncias.js', 'conciertos.js', 'novedades.js',
  'panel.js', 'kit.js', 'sobre.js', 'instalar.js', 'avisos.js', 'app.js',
  'logo.svg', 'icono.svg', 'icono-192.png', 'icono-512.png', 'apple-touch-icon.png'
];
const CARPETAS = ['libs', 'fuentes', 'kit', 'portadas'];

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
for (const a of ARCHIVOS) {
  if (!existsSync(join(web, a))) throw new Error('Falta ' + a);
  cpSync(join(web, a), join(destino, a));
}
for (const c of CARPETAS) cpSync(join(web, c), join(destino, c), { recursive: true });
console.log('Web copiada en app/www (' + ARCHIVOS.length + ' archivos y ' + CARPETAS.length + ' carpetas).');
