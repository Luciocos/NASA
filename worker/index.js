// publica el build de angular y reenvía /api y /media al backend de django, igual que proxy.conf.json con ng serve
// no tiene login: la app la ve cualquiera que tenga el link

// django corre en una notebook del equipo y el worker le llega por el tunnel lotestigo-backend con workers vpc (binding BACKEND de wrangler.jsonc)
// la notebook no queda expuesta a internet: solo este worker llega a su puerto 8000
// sin una notebook conectada al tunnel, /api responde 502 y el encabezado de la app muestra "Backend sin conexión"

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

async function toBackend(request, env) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  // el Host sale de la url (localhost, que django ya acepta); django puede armar links absolutos con estos dos si se activa USE_X_FORWARDED_HOST
  headers.delete("Host");
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", "https");
  try {
    // el puerto no sale de la url: lo fija el servicio vpc (127.0.0.1:8000 en la notebook)
    const response = await env.BACKEND.fetch(new Request(new URL(url.pathname + url.search, "http://localhost"), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual"
    }));
    return withHeaders(response);
  } catch (error) {
    // workers vpc no llega a la notebook (apagada o sin el tunnel corriendo) y fetch falla
    console.error(JSON.stringify({ message: "backend unreachable", path: url.pathname, error: String(error) }));
    return failure(502, "backend sin conexión");
  }
}

// abrir /mapa, /lotes/1 o /pasaporte/<token> en el navegador: son rutas del router de angular, no archivos
function isNavigation(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  return request.headers.get("Sec-Fetch-Mode") === "navigate" || (request.headers.get("Accept") || "").includes("text/html");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return toBackend(request, env);
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return withHeaders(asset);
    // en /media primero van los archivos del build (los íconos de leaflet) y lo que no esté es evidencia que sirve django
    if (url.pathname.startsWith("/media/")) return toBackend(request, env);
    if (isNavigation(request)) return withHeaders(await env.ASSETS.fetch(new Request(new URL("/", url), request)));
    return withHeaders(asset);
  }
};
