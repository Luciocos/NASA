// publica el build de angular y reenvía /api y /media al backend de django, igual que proxy.conf.json con ng serve
// no tiene login propio: las cuentas las maneja django, y el encabezado Authorization se reenvía tal cual

// django y postgres corren en railway: API_ORIGIN (vars de wrangler.jsonc) es la dirección https del backend
// si el backend no responde, /api devuelve 502 y el encabezado de la app muestra "Sin conexión con el servidor"

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  // la app se comparte por link: que los buscadores no la indexen, tampoco los pasaportes
  "X-Robots-Tag": "noindex, nofollow"
};

function withHeaders(response) {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(HEADERS)) secured.headers.set(name, value);
  return secured;
}

function failure(status, error) {
  return withHeaders(Response.json({ error }, { status }));
}

function backendOrigin(env) {
  try {
    const url = new URL(env.API_ORIGIN);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

async function toBackend(request, env) {
  const origin = backendOrigin(env);
  if (!origin) return failure(503, "backend no configurado");
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  // el Host lo pone fetch con el dominio de railway, que es el que acepta django (DJANGO_ALLOWED_HOSTS);
  // django puede armar links absolutos con estos dos si se activa USE_X_FORWARDED_HOST
  headers.delete("Host");
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", "https");
  try {
    const response = await fetch(new URL(url.pathname + url.search, origin), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual"
    });
    return withHeaders(response);
  } catch (error) {
    // railway no responde (caído o en pleno deploy) y fetch falla
    console.error(JSON.stringify({ message: "backend unreachable", path: url.pathname, error: String(error) }));
    return failure(502, "backend sin conexión");
  }
}

// abrir /mapa, /lotes/1 o /pasaporte/<token> en el navegador: son rutas del router de angular, no archivos
function isNavigation(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  return request.headers.get("Sec-Fetch-Mode") === "navigate" || (request.headers.get("Accept") || "").includes("text/html");
}

// safari en el iphone pide el video de la landing por partes (Range) y sin un 206 no lo reproduce
const VIDEO = /^\/landing\/[\w.-]+\.(mp4|webm)$/;

async function withRange(request, response) {
  const match = /^bytes=(\d*)-(\d*)$/.exec((request.headers.get("Range") || "").trim());
  if (!match || response.status !== 200) return response;
  const body = await response.arrayBuffer();
  const size = body.byteLength;
  const start = match[1] === "" ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = match[1] === "" || match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (!(start <= end && start < size)) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return toBackend(request, env);
    const asset = await env.ASSETS.fetch(request);
    if (VIDEO.test(url.pathname) && request.headers.has("Range")) return withHeaders(await withRange(request, asset));
    if (asset.status !== 404) return withHeaders(asset);
    // en /media primero van los archivos del build (los íconos de leaflet y la evidencia de data/evidence) y lo que no esté se le pide a django
    if (url.pathname.startsWith("/media/")) return toBackend(request, env);
    if (isNavigation(request)) return withHeaders(await env.ASSETS.fetch(new Request(new URL("/", url), request)));
    return withHeaders(asset);
  }
};
