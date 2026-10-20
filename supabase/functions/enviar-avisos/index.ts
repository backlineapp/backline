// backline — función "enviar-avisos" (Supabase Edge Function).
//
// La llama la tarea programada de Supabase cada 5 minutos, solo cuando hay
// algo que enviar (ver supabase/4-avisos.sql). Hace esto:
//   1. Comprueba la clave de las tareas: nadie más puede ponerla en marcha.
//   2. Pide a la base de datos los avisos que tocan ahora (avisos_preparar
//      ya aplica las reglas: 10 minutos de espera, uno por grupo y día,
//      nada de 23:00 a 9:00).
//   3. Escribe el texto: "Dry River · Nueva gira: 6 fechas",
//      "Dry River · Concierto en Castellón, 14 nov", "Dry River · Nuevo disco: …",
//      "Dry River · Nuevo vídeo: …" o "Dry River · …" (título de la noticia).
//   4. Lo cifra para cada móvil (solo ese móvil puede leerlo) y lo envía.
//   5. Además, avisa al móvil del administrador de cada solicitud nueva:
//      "Backline · Dry River quiere gestionar su ficha" o "… pide retirar su
//      ficha" (avisos_preparar_admin: sin espera ni límite, nunca de noche).
//   6. Borra los móviles que ya no aceptan avisos.
//
// Se pega entero en el editor de funciones de Supabase. No necesita nada más.
// Secretos que usa (Edge Functions > Secrets), NUNCA en el repositorio:
//   VAPID_PUBLICA, VAPID_PRIVADA, CLAVE_TAREAS
// y los que Supabase pone solo: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

const APP = "https://backlineapp.github.io/backline/";
const GRUPOS_JSON = APP + "grupos.json";
const ESPANA = "España";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// Si un móvil está apagado, el aviso le espera hasta 1 día.
const CADUCIDAD_SEGUNDOS = 24 * 3600;
// Avisos que se envían a la vez.
const A_LA_VEZ = 10;

type Fecha = { id: string; fecha: string; ciudad: string; pais: string | null; sala: string };
type Publicacion = {
  id: string;
  tipo: string;
  titulo: string | null;
  formato?: string | null;
  salida?: string | null;
  texto?: string | null;
  fechas: Fecha[] | null;
};
type Suscripcion = { endpoint: string; p256dh: string; auth: string };
type Lote = { grupo_id: string; publicaciones: Publicacion[]; suscripciones: Suscripcion[] };
type Solicitud = { id: string; grupo_id: string; tipo: string };
type LoteAdmin = { solicitudes: Solicitud[]; suscripciones: Suscripcion[] };
export type Aviso = { titulo: string; texto: string; ruta: string; etiqueta: string };

// ---------- Utilidades de bytes ----------

const codificador = new TextEncoder();

function aBase64url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64url(texto: string) {
  let b = texto.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  const binario = atob(b);
  const salida = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) salida[i] = binario.charCodeAt(i);
  return salida;
}

function unir(...partes: Uint8Array[]) {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const salida = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    salida.set(p, i);
    i += p.length;
  }
  return salida;
}

// ---------- Firma VAPID (dice a Google/Apple/Mozilla que el aviso es nuestro) ----------

let clavePrivadaVapid: CryptoKey | null = null;

async function clavePrivada(publica: string, privada: string): Promise<CryptoKey> {
  if (clavePrivadaVapid) return clavePrivadaVapid;
  const pub = deBase64url(publica);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLICA no es válida");
  clavePrivadaVapid = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: aBase64url(pub.slice(1, 33)),
      y: aBase64url(pub.slice(33, 65)),
      d: privada,
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return clavePrivadaVapid;
}

export async function cabeceraVapid(endpoint: string, publica: string, privada: string): Promise<string> {
  const destino = new URL(endpoint).origin;
  const cabecera = aBase64url(codificador.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const datos = aBase64url(codificador.encode(JSON.stringify({
    aud: destino,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: APP,
  })));
  const firma = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await clavePrivada(publica, privada),
    codificador.encode(cabecera + "." + datos),
  ));
  return `vapid t=${cabecera}.${datos}.${aBase64url(firma)}, k=${publica}`;
}

// ---------- Cifrado del aviso (RFC 8291, "aes128gcm") ----------

async function hkdf(sal: BufferSource, material: BufferSource, info: BufferSource, largo: number) {
  const clave = await crypto.subtle.importKey("raw", material, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sal, info }, clave, largo * 8);
  return new Uint8Array(bits);
}

export async function cifrar(texto: string, sus: Suscripcion) {
  const movilPublica = deBase64url(sus.p256dh);
  const secretoAuth = deBase64url(sus.auth);
  if (movilPublica.length !== 65 || secretoAuth.length < 16) throw new Error("claves del móvil no válidas");

  // Par de claves de un solo uso para este aviso.
  const nuestro = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const nuestraPublica = new Uint8Array(await crypto.subtle.exportKey("raw", nuestro.publicKey));
  const claveMovil = await crypto.subtle.importKey("raw", movilPublica, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: claveMovil }, nuestro.privateKey, 256));

  const infoClave = unir(codificador.encode("WebPush: info\0"), movilPublica, nuestraPublica);
  const ikm = await hkdf(secretoAuth, compartido, infoClave, 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, codificador.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sal, ikm, codificador.encode("Content-Encoding: nonce\0"), 12);

  const claveAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // Un solo bloque: el texto y el byte 2 que marca el final.
  const claro = unir(codificador.encode(texto), new Uint8Array([2]));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, claveAes, claro));

  const tamanoBloque = new Uint8Array([0, 0, 16, 0]); // 4096
  return unir(sal, tamanoBloque, new Uint8Array([nuestraPublica.length]), nuestraPublica, cifrado);
}

// Envía un aviso a un móvil. Devuelve el código de respuesta del servicio.
export async function enviarUno(sus: Suscripcion, aviso: Aviso, publica: string, privada: string): Promise<number> {
  const cuerpo = await cifrar(JSON.stringify(aviso), sus);
  const r = await fetch(sus.endpoint, {
    method: "POST",
    headers: {
      "Authorization": await cabeceraVapid(sus.endpoint, publica, privada),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": String(CADUCIDAD_SEGUNDOS),
      "Urgency": "normal",
    },
    body: cuerpo,
  });
  await r.body?.cancel();
  return r.status;
}

// ---------- Texto de los avisos ----------

// "2026-11-14" -> "14 nov"
function diaCorto(fecha: string): string {
  const [, m, d] = fecha.split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
}

function lugar(f: Fecha): string {
  return f.pais && f.pais !== ESPANA ? `${f.ciudad} (${f.pais})` : f.ciudad;
}

function mayuscula(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Hoy en Madrid, como "2026-10-19".
function hoyMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
}

// Principio del texto en una sola línea, para el cuerpo del aviso.
function extracto(texto: string | null | undefined, largo = 120): string {
  const t = (texto || "").replace(/\s+/g, " ").trim();
  return t.length > largo ? t.slice(0, largo - 1).trimEnd() + "…" : t;
}

// "a", "a y b", "a, b y c"
function enumerar(partes: string[]): string {
  return partes.length < 2 ? partes.join("") : partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1];
}

// Disco, vídeo o noticia: un aviso que abre esa publicación en la app.
function avisoNovedad(nombre: string, p: Publicacion, etiqueta: string): Aviso {
  const ruta = "#/novedad/" + p.id;
  const titulo = p.titulo || "";
  if (p.tipo === "disco") {
    const que = p.formato === "single" ? "Nuevo single" : "Nuevo disco";
    const saldra = p.salida && p.salida > hoyMadrid();
    return {
      titulo: `${nombre} · ${que}: ${titulo}`,
      texto: saldra ? `Sale el ${diaCorto(p.salida as string)}.` : extracto(p.texto) || "Toca para escucharlo.",
      ruta,
      etiqueta,
    };
  }
  if (p.tipo === "video") {
    return { titulo: `${nombre} · Nuevo vídeo: ${titulo}`, texto: extracto(p.texto) || "Toca para verlo.", ruta, etiqueta };
  }
  return { titulo: `${nombre} · ${titulo}`, texto: extracto(p.texto) || "Toca para leerla.", ruta, etiqueta };
}

const NOVEDADES = ["disco", "video", "noticia"];

export function componer(nombre: string, grupoId: string, pubs: Publicacion[]): Aviso {
  const etiqueta = "grupo-" + grupoId;
  if (pubs.length === 1 && NOVEDADES.includes(pubs[0].tipo)) return avisoNovedad(nombre, pubs[0], etiqueta);
  if (pubs.length === 1) {
    const p = pubs[0];
    const fechas = p.fechas || [];
    const primera = fechas[0];
    if (p.tipo === "gira") {
      const n = fechas.length;
      return {
        titulo: `${nombre} · Nueva gira: ${n} ${n === 1 ? "fecha" : "fechas"}`,
        texto: p.titulo || "Toca para ver las fechas.",
        ruta: "#/concierto/" + primera.id,
        etiqueta,
      };
    }
    return {
      titulo: `${nombre} · Concierto en ${lugar(primera)}, ${diaCorto(primera.fecha)}`,
      texto: primera.sala,
      ruta: "#/concierto/" + primera.id,
      etiqueta,
    };
  }
  // Varias cosas a la vez: un solo aviso que lleva a la ficha del grupo.
  const cuantas = (fn: (p: Publicacion) => boolean) => pubs.filter(fn).length;
  const giras = cuantas((p) => p.tipo === "gira");
  const conciertos = cuantas((p) => p.tipo === "concierto");
  const singles = cuantas((p) => p.tipo === "disco" && p.formato === "single");
  const discos = cuantas((p) => p.tipo === "disco") - singles;
  const videos = cuantas((p) => p.tipo === "video");
  const noticias = cuantas((p) => p.tipo === "noticia");
  const soloFechas = giras + conciertos === pubs.length;
  if (soloFechas) {
    const partes: string[] = [];
    if (giras) partes.push(giras === 1 ? "nueva gira" : `${giras} giras nuevas`);
    if (conciertos) partes.push(conciertos === 1 ? "1 concierto nuevo" : `${conciertos} conciertos nuevos`);
    return {
      titulo: `${nombre} · ${mayuscula(enumerar(partes))}`,
      texto: "Toca para ver las fechas.",
      ruta: "#/grupo/" + grupoId,
      etiqueta,
    };
  }
  // "Dry River · Novedades: disco, 2 conciertos y vídeo"
  const partes: string[] = [];
  const contar = (n: number, una: string, varias: string) => {
    if (n) partes.push(n === 1 ? una : `${n} ${varias}`);
  };
  contar(discos, "disco", "discos");
  contar(singles, "single", "singles");
  contar(giras, "gira", "giras");
  contar(conciertos, "concierto", "conciertos");
  contar(videos, "vídeo", "vídeos");
  contar(noticias, "noticia", "noticias");
  return {
    titulo: `${nombre} · Novedades: ${enumerar(partes)}`,
    texto: "Toca para verlo todo.",
    ruta: "#/grupo/" + grupoId,
    etiqueta,
  };
}

// Solicitud nueva: un aviso para el administrador que abre Mi panel en las
// solicitudes. Cada solicitud tiene su propio aviso (no se sustituyen).
export function componerSolicitud(nombre: string, s: Solicitud): Aviso {
  const que = s.tipo === "retirar" ? "pide retirar su ficha" : "quiere gestionar su ficha";
  return {
    titulo: `Backline · ${nombre} ${que}`,
    texto: "Toca para revisarla en Mi panel.",
    ruta: "#/panel/solicitudes",
    etiqueta: "solicitud-" + s.id,
  };
}

// Nombres de los grupos, de grupos.json (la misma lista que usa la app).
async function nombresDeGrupos(): Promise<Record<string, string>> {
  try {
    const r = await fetch(GRUPOS_JSON, { headers: { "Cache-Control": "no-cache" } });
    if (!r.ok) throw new Error(String(r.status));
    const datos = await r.json();
    const nombres: Record<string, string> = {};
    for (const g of datos.grupos || []) nombres[g.id] = g.nombre;
    return nombres;
  } catch (_) {
    return {};
  }
}

function nombrePorDefecto(id: string): string {
  return id.split("-").map(mayuscula).join(" ");
}

// ---------- Base de datos ----------

function claveServicio(): string {
  const clave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (clave) return clave;
  // Proyectos con las claves nuevas: SUPABASE_SECRET_KEYS = {"default": "sb_secret_..."}
  try {
    const claves: Record<string, string> = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return claves.default || Object.values(claves)[0] || "";
  } catch (_) {
    return "";
  }
}

async function rpc(nombre: string, argumentos: Record<string, unknown> = {}): Promise<unknown> {
  const clave = claveServicio();
  const cabeceras: Record<string, string> = { "apikey": clave, "Content-Type": "application/json" };
  if (clave.startsWith("eyJ")) cabeceras["Authorization"] = "Bearer " + clave;
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/${nombre}`, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify(argumentos),
  });
  if (!r.ok) throw new Error(`${nombre}: ${r.status} ${await r.text()}`);
  return await r.json();
}

// ---------- La función ----------

function iguales(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

function respuesta(datos: unknown, estado = 200): Response {
  return new Response(JSON.stringify(datos), { status: estado, headers: { "Content-Type": "application/json" } });
}

export async function atender(peticion: Request): Promise<Response> {
  if (!iguales(peticion.headers.get("x-clave-tareas") || "", Deno.env.get("CLAVE_TAREAS") || "")) {
    return respuesta({ error: "no autorizado" }, 401);
  }
  const publica = Deno.env.get("VAPID_PUBLICA") || "";
  const privada = Deno.env.get("VAPID_PRIVADA") || "";
  if (!publica || !privada) return respuesta({ error: "faltan las claves VAPID" }, 500);

  const lotes = (await rpc("avisos_preparar")) as Lote[];
  // Si falla lo del administrador (por ejemplo, aún no se ha ejecutado
  // 7-avisos-admin.sql), los avisos de los grupos salen igual.
  let admin: LoteAdmin = { solicitudes: [], suscripciones: [] };
  try {
    admin = (await rpc("avisos_preparar_admin")) as LoteAdmin;
  } catch (e) {
    console.warn("avisos del administrador:", e instanceof Error ? e.message : e);
  }
  const resumen = { grupos: lotes.length, solicitudes: admin.solicitudes.length, enviados: 0, fallidos: 0, borrados: 0 };
  if (!lotes.length && !admin.solicitudes.length) {
    console.log("avisos:", JSON.stringify(resumen));
    return respuesta(resumen);
  }

  const nombres = await nombresDeGrupos();
  const nombre = (id: string) => nombres[id] || nombrePorDefecto(id);
  const caducados: string[] = [];
  const tareas: (() => Promise<void>)[] = [];

  // Cada aviso, a cada uno de sus móviles.
  const encargos: { aviso: Aviso; suscripciones: Suscripcion[] }[] = [];
  for (const lote of lotes) {
    encargos.push({ aviso: componer(nombre(lote.grupo_id), lote.grupo_id, lote.publicaciones), suscripciones: lote.suscripciones });
  }
  for (const s of admin.solicitudes) {
    encargos.push({ aviso: componerSolicitud(nombre(s.grupo_id), s), suscripciones: admin.suscripciones });
  }

  for (const { aviso, suscripciones } of encargos) {
    for (const sus of suscripciones) {
      tareas.push(async () => {
        try {
          const estado = await enviarUno(sus, aviso, publica, privada);
          if (estado >= 200 && estado < 300) resumen.enviados++;
          else {
            resumen.fallidos++;
            // 404 / 410: el móvil canceló la suscripción. Se borra.
            if (estado === 404 || estado === 410) caducados.push(sus.endpoint);
            else console.warn(`aviso no aceptado (${estado}) en ${new URL(sus.endpoint).host}`);
          }
        } catch (e) {
          resumen.fallidos++;
          console.warn("error al enviar un aviso:", e instanceof Error ? e.message : e);
          // Claves del móvil estropeadas: esa suscripción no sirve.
          if (e instanceof Error && e.message === "claves del móvil no válidas") caducados.push(sus.endpoint);
        }
      });
    }
  }

  // De A_LA_VEZ en A_LA_VEZ.
  let siguiente = 0;
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, tareas.length) }, async () => {
    while (siguiente < tareas.length) await tareas[siguiente++]();
  }));

  if (caducados.length) resumen.borrados = (await rpc("avisos_quitar", { p_endpoints: caducados })) as number;
  console.log("avisos:", JSON.stringify(resumen));
  return respuesta(resumen);
}

Deno.serve((peticion) => atender(peticion).catch((e) => {
  console.error(e);
  return respuesta({ error: e instanceof Error ? e.message : String(e) }, 500);
}));
