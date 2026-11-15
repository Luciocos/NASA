# Cómo funciona LoTestigo

Guía para el equipo y para quien lea el repositorio: cómo se usa la app, de dónde sale cada dato y cómo se calcula cada número. Describe la app tal como está en el repositorio el 15/11/2026. El modelo de datos, la API y el contrato de importación están en [CLAUDE.md](CLAUDE.md), y el método del radar, en [pipeline/README.md](pipeline/README.md).

## Contenido

1. [Qué es LoTestigo](#1-qué-es-lotestigo)
2. [Cómo se usa](#2-cómo-se-usa)
3. [De dónde salen los datos](#3-de-dónde-salen-los-datos)
4. [Cómo se calcula cada cosa](#4-cómo-se-calcula-cada-cosa)
5. [Qué significa cada etiqueta](#5-qué-significa-cada-etiqueta)
6. [Privacidad, cuentas y modo sin conexión](#6-privacidad-cuentas-y-modo-sin-conexión)
7. [Preguntas frecuentes del jurado](#7-preguntas-frecuentes-del-jurado)
8. [Limitaciones conocidas](#8-limitaciones-conocidas)

## 1. Qué es LoTestigo

LoTestigo es una bitácora de manejo de un lote agrícola, detectada por satélite. El productor (o su asesor) crea su cuenta, marca el perímetro de su lote y ve lo que observan los satélites, su huella de carbono estimada, una planilla de fertilización, su margen bruto y unos chequeos territoriales indicativos. En la zona del Lote 3 de ejemplo suma la pestaña Cuenca y Caudal. Es una prueba de concepto del NASA Space Apps Challenge 2026 (sede Rosario): usa datos abiertos de la NASA, con el radar NISAR como sensor principal, y no es una certificación.

**Para tener presente al responder:**

- Es una prueba de concepto. La detección por radar no está validada en campo.
- Cada dato dice de dónde sale: VERIFICADO (lo observó un satélite), DECLARADO (lo cargó el productor) o ESTIMADO (valor regional, por defecto o de un modelo).
- Si falta algo, la app dice "Sin dato" con el motivo. No inventa ni rellena.
- Usa datos abiertos de la NASA. No es una certificación ni reemplaza a VISEC, RTRS ni 2BSvs.

## 2. Cómo se usa

Para empezar alcanza con marcar el perímetro del lote. Todo lo demás es opcional. Para mostrar con imágenes qué tocar en cada pantalla está la guía "Cómo cargar tus datos", en `/ayuda` (se ve sin cuenta). También la abre el botón "?" de ayuda: en la barra de la app (con la sesión abierta) y en el encabezado del popup del lote, donde arranca en el paso de la pestaña abierta.

### Guion de la demo

1. **Inicio (`/`).** Arriba dice "Para productores agrícolas, ganaderos y asesores" y el título "Ecosistema que facilita y potencia a los productores y asesores en monitorear datos de la NASA simplificados, huellas, fertilización y rentabilidad". Al lado del título (debajo en el celular) va el video del recorrido de la app: arranca solo cuando se ve, sin sonido y en bucle, con subtítulos, un botón para pausarlo ("Pausar el recorrido") y capítulos para saltar a cada parte. La página invita a crear una cuenta: "Crear cuenta gratis" o "Ya tengo cuenta". El enlace "Ver un lote de ejemplo" lleva a los ejemplos sin cuenta. Con la sesión abierta, el botón dice "Ir a mi campo".
2. **Crear la cuenta (`/registrarse`).** El productor carga nombre (opcional), mail y contraseña (al menos 8 caracteres, que no sean solo números). Queda con la sesión abierta y pasa a Mi campo. En la barra de la app quedan Mi campo y Marcar lote (abajo en el celular), el botón "?" de ayuda y la cuenta.
3. **Mi campo, sin lotes.** Aparece "Marcá tu primer lote" con "Usar mi ubicación" (no se guarda) o "Buscar en el mapa".
4. **Marcar el lote (`/mapa/nuevo`).**
   - Busca su localidad ("Buscá tu localidad") o usa su ubicación.
   - Toca las esquinas del lote, una por una, sobre la imagen satelital. Hay que estar cerca (zoom 12 o más). Una esquina se puede arrastrar, y están "Deshacer" y "Empezar de nuevo".
   - Una indicación arriba del mapa dice qué falta, por ejemplo "Bien: tocá 2 esquinas más" o "Listo: ya podés guardar". Hacen falta 3 esquinas o más, sin lados cruzados, y una superficie de entre ½ ha y 20.000 ha.
   - Opcional: el nombre (vacío, se guarda como "Lote N") y, en "Más datos (opcional)", localidad, provincia y RENSPA.
   - Toca "Guardar lote". El lote se abre en el popup, en la pestaña Satélite.
   - En "Opciones avanzadas" están "Pintar hectáreas" (recuadros de 1 ha o ¼ ha sobre una grilla que se puede girar) y el "Ajuste fino de coordenadas".
   - La primera vez aparece el instructivo "Tu lote en tres pasos". Si se corta, al volver aparece "Retomamos el lote que dejaste a medias en este dispositivo."
5. **Mi campo, con lotes (`/mapa`).**
   - Muestra la maqueta isométrica de los lotes y, al costado (abajo en el celular), la lista "Tus lotes".
   - La maqueta es una ilustración, no una foto: cada bloque es un lote, su textura ilustra el último evento y el borde del globo dice el origen ("Cómo leer la maqueta").
   - Tocar una tarjeta de "Tus lotes" o un bloque de la maqueta marca el lote. La lupa de la tarjeta lo abre en el popup. En la maqueta también lo abre el doble clic sobre el bloque (o Enter con el lote marcado).
   - Con un lote elegido, la barra de la maqueta suma accesos a Datos (pestaña Satélite), Huella, Fertilización y Rentabilidad. Bitácora y Prácticas quedan en "Más". Cuenca y Caudal no tiene acceso en la barra: se abre desde el popup.
   - El botón NDVI pinta cada bloque con el verdor actual de MODIS. También hay una vista "Satélite".
6. **El popup del lote.** En la compu ocupa casi toda la pantalla; en el celular, la pantalla entera. Arriba muestra el nombre, las hectáreas y el lugar. A la derecha están el botón "?" de ayuda (abre la guía en el paso de la pestaña abierta), ⋯ (solo en lotes propios) y la X. Se cierra con la X, con Escape, tocando afuera o con "atrás". Tiene siete pestañas: Satélite, Bitácora, Prácticas, Huella, Fertilización, Rentabilidad y Cuenca y Caudal (tabla de abajo). Cuenca y Caudal aparece en todos los lotes, pero solo tiene análisis en la zona procesada alrededor del Lote 3.
7. **Compartir el pasaporte.** En ⋯, "Compartir pasaporte" crea un enlace público y lo copia ("Enlace copiado. Pegalo en un mensaje para compartir el pasaporte."). También ofrece "Abrir el pasaporte". Quien lo abre no necesita cuenta.
8. **Los lotes de ejemplo (`/ejemplos`).** Se ven sin cuenta. Son cuatro lotes reales de Casilda (Santa Fe), procesados con datos abiertos de la NASA. "Ver su historia" abre el lote en el mismo popup, de solo lectura.

### Qué se mira y qué se carga en cada pestaña

| Pestaña | Qué se mira | Qué se carga | Dónde queda |
|---|---|---|---|
| Satélite | Verdor (NDVI de MODIS), lluvia en 30 días y humedad del suelo (NASA POWER), y el verdor en el tiempo con los eventos marcados. En "Más datos" (plegado en el celular), seis tarjetas: lluvia por mes, uso del suelo desde 2020, pasadas de NISAR, imágenes HLS, verdor y humedad, y fuentes y opciones. | Nada. "Historial desde 2020" pide el verdor desde 2020. | No va a la base. Queda una copia en el dispositivo. |
| Bitácora | Los eventos con tipo, fecha, margen (± días), sensor y origen. El detalle muestra la evidencia de radar contra óptico, lado a lado o con un deslizador. | En un lote propio: "Corregir" (tipo, fecha, margen y notas) y, si el evento es ESTIMADO, "Confirmar". | En la base. El evento pasa a DECLARADO (cambiar solo las notas no lo cambia). |
| Prácticas | El "Puntaje provisional", "Qué conviene hacer", "Cómo está cada práctica", "Cómo se calcula", la tarjeta "Uso del suelo desde 2020" con lo que vio MODIS y la tarjeta "Chequeos territoriales": distancia a zonas urbanas, bosque nativo (OTBN) y Buenas Prácticas (BPA). | En un lote propio: "No cambié el uso" o "Sí, hubo un cambio" (después, "Cambiar"), que cuenta en el puntaje y en la huella. En el chequeo de BPA ("Declarar"): Sí, No o Sin declarar, con el N.º de inscripción opcional, y "Guardar declaración". | En la base, como DECLARADO con fecha. |
| Huella | La huella en kg CO2e/t o "Todavía no se puede calcular", qué falta y la confianza. Vistas Resumen, Desglose, Simulador y Tus datos. | En un lote propio, "Cargar rinde e insumos" abre "Tus datos": campaña, cultivo, rinde (t/ha), nitrógeno (kg N/ha), fósforo (kg P2O5/ha), gasoil (l/ha), fitosanitarios (kg p. a./ha) y semilla (kg/ha). Se guarda con "Guardar datos". En el Simulador, "Sumar cultivo de cobertura" y "Simular". | "Tus datos", en la base, como DECLARADO. El Simulador no guarda nada. |
| Fertilización | Los ambientes por NDVI (alto, medio y bajo) en un mapa recortado al borde del lote, con un degradado entre los cuadros de 250 m y una tarjeta por ambiente. Los píxeles mixtos se ven más claros. | "Armar dosis" (en la página, "Armar dosis variable"): una dosis de nitrógeno en kg N/ha por ambiente. | Solo en el dispositivo. |
| Rentabilidad | El margen bruto por hectárea y del lote, "De dónde sale el margen" y "Ver detalle". | Precio del grano (US$/t), a mano o, en soja, con "Usar precio sugerido de Rofex"; rinde (t/ha, opcional) y, en "Costos y gastos", flete y comercialización (US$/t) y siete costos (US$/ha). | Solo en el dispositivo, con el precio de Rofex si se usó. |
| Cuenca y Caudal | En la zona del Lote 3, cuatro secciones con mapa: A · Cuenca aportante, B · Historial hidrológico, C · Simulador de lluvia y D · Impacto sobre el lote. Fuera de esa zona, un aviso. | Nada que se guarde. Un clic en el mapa elige otro punto de salida. El simulador pide una lluvia (mm) y su duración (h). | No va a la base: lo calcula el servidor en cada pedido. |

En un lote de ejemplo se puede mirar todo y usar el Simulador de la Huella, Rentabilidad (también el precio de Rofex), la planilla de Fertilización y Cuenca y Caudal con su simulador. No se puede Confirmar, Corregir, cargar "Tus datos", declarar el uso del suelo ni la adhesión a BPA, ni compartir el pasaporte.

### Antes de la demo

- **El evento para mostrar es el del Lote 3 de ejemplo:** la siembra detectada por NISAR, con su evidencia de radar contra óptico. Es el único evento de todo el sistema. Un lote recién marcado arranca con la bitácora vacía ("Todavía no hay eventos").
- **Confirmar y Corregir no se pueden mostrar en vivo.** El único evento está en un lote de ejemplo, que es de solo lectura. Además, "Confirmar" solo aparece en eventos ESTIMADO, y la siembra del Lote 3 es VERIFICADO.
- **Para mostrar una huella por tonelada, usar un lote propio.** Con una campaña de maíz, soja o trigo, el nitrógeno, el fósforo y el gasoil en "Tus datos" y "No cambié el uso" en Prácticas, la huella llega a un total: el rinde, la semilla y los fitosanitarios pueden quedar de referencia. Los lotes de ejemplo siguen en "Todavía no se puede calcular", porque no se puede declarar en ellos.
- **Ningún lote muestra un puntaje numérico.** En un lote propio faltan eventos para siembra directa, cobertura y quema; en el Lote 3, la rotación. "Todavía no se puede calcular" y "Sin calcular" son la regla de no inventar datos, no un error. Lo que falta se explica con la ayuda "Qué falta para calcularla".
- **Simular en el Lote 3 de ejemplo.** Ahí "Sumar cultivo de cobertura" cambia solo "Cobertura invernal", de "No cumple" a "Cumple"; el puntaje sigue "Sin número" porque falta la rotación. En un lote sin eventos (uno recién marcado) también cambia solo la cobertura: el evento hipotético no cuenta como bitácora, así que siembra directa y quema siguen "Sin dato", y el cambio de uso también, salvo que el productor lo haya declarado.
- **Abrir antes las pestañas Satélite y Fertilización de cada lote**, en el dispositivo de la demo. La primera consulta a MODIS puede tardar más de un minuto. Después queda la copia guardada.
- **Fertilización cuenta cada píxel que toca el lote.** Cada píxel mide unas 5,4 ha y pesa por las hectáreas que caen adentro. Hacen falta 3 válidos. Los que tienen menos de la mitad adentro son píxeles mixtos: se pintan más claros y la leyenda dice cuántas hectáreas son ("… ha de píxeles mixtos, menos seguras").
- **Un solo lote de ejemplo: el Lote de prueba.** Para la presentación, /ejemplos muestra solo el "Lote de prueba", que es el Lote 3 del pipeline (maíz, con la siembra detectada por NISAR y la pestaña Cuenca y Caudal). Los lotes 1, 2 y 4 se sacaron de la demo pública: sus JSON están en `data/demo-extra/` y la migración `lots/0005_lote_de_prueba` los deja como no públicos, sin borrarlos. En este documento, "Lote 3" es el Lote de prueba.
- **El precio de Rofex solo se ofrece en soja o sin campaña.** En el Lote de prueba (maíz) no aparece el botón: para mostrarlo, usar un lote propio sin campaña o con una campaña de soja. Si el servidor no tiene las credenciales de Matba Rofex, dice "Sin precio de Rofex" y el precio se carga a mano. Si usa el entorno de prueba reMarkets, el precio lleva "Precio de prueba". Probarlo antes en la demo publicada.
- **Cuenca y Caudal: mostrarla en el Lote 3.** Anda en los cuatro lotes de ejemplo, que caen dentro de la zona procesada. Los datos del pipeline del Lote 3 (`terrain`, `forcing.json` con lluvia, humedad y evapotranspiración, y `landcover.npz` con la cobertura MODIS) están en `data/hydrology/lote3`. Abrirla antes en el dispositivo de la demo.

## 3. De dónde salen los datos

Los datos llegan por dos caminos:

- **En vivo, desde el navegador.** Para cualquier polígono, también uno recién marcado, el navegador consulta servicios abiertos de la NASA que no piden login: NASA POWER, el ORNL DAAC (MODIS) y el catálogo CMR de Earthdata. Cada dato se muestra con su fuente y su origen. No se interpola, no se guarda en la base y no genera eventos. Queda una copia en el dispositivo para usarla sin conexión.
- **Procesado aparte, en el pipeline.** El radar NISAR y el óptico HLS se procesan offline con scripts de Python (`pipeline/`) y una cuenta gratuita de Earthdata Login. La salida, un JSON por lote más las imágenes PNG de evidencia, se carga en la base con el comando `import_events`. El backend nunca procesa imágenes satelitales dentro de una petición.

| Fuente | Qué es, en palabras simples | Resolución y frecuencia | Para qué lo usamos | Cómo llega | Etiqueta |
|---|---|---|---|---|---|
| **NISAR** (NASA e ISRO) | Un radar en banda L: manda su propia señal y mide el eco que vuelve del suelo, así que ve a través de las nubes. | Píxel de 20 m. Una pasada cada 12 días por órbita. | Detectar los eventos de la bitácora. Listar las pasadas sobre el lote. | Pipeline (eventos). Catálogo CMR en vivo (pasadas). | VERIFICADO (los eventos) |
| **HLS** (NASA) | Imágenes ópticas, como fotos, de Landsat y Sentinel-2 armonizadas. Con nubes, se ven las nubes. | 30 m. Una pasada cada 2 o 3 días, combinando satélites. | El NDVI que ayuda a interpretar el radar y la imagen óptica de evidencia. Listar las escenas recientes. | Pipeline (NDVI y evidencia). Catálogo CMR en vivo (escenas). | VERIFICADO |
| **MODIS NDVI** (MOD13Q1, satélite Terra) | El verdor de la vegetación. | 250 m (unas 5,4 ha por píxel). Un compuesto cada 16 días. | El verdor de la pestaña Satélite, la capa NDVI de Mi campo y los ambientes de Fertilización. | En vivo, por el ORNL DAAC. | VERIFICADO |
| **MODIS cobertura** (MCD12Q1, Terra y Aqua) | Un mapa de cobertura del suelo: cultivos, bosques, pastizales, zonas urbanas o agua. | 500 m (unas 21 ha por píxel). Un mapa por año. | El uso del suelo desde 2020. | En vivo, por el ORNL DAAC. | VERIFICADO, orientativo |
| **NASA POWER** | Un modelo de clima (reanálisis), no un satélite que mira el lote. | Grilla de unos 50 km. Datos diarios. | La lluvia y la humedad del suelo de la zona. | En vivo. | ESTIMADO |
| **CMR de Earthdata** | El catálogo de datos de la NASA. | No aplica. | Saber qué pasadas de NISAR y qué escenas HLS cruzan el lote, sin bajar las imágenes. | En vivo. | No aplica: es un listado, no una medición del lote. |
| **GIBS** | Imágenes de la NASA ya pintadas, por fecha. Sirven para mirar, no para medir. | Según la capa. | Hoy, solo la foto satelital del inicio, que se repite en Ingresar y Crear cuenta. | Archivo fijo de la app, armado con teselas de GIBS. | No aplica |
| **GPM IMERG, SMAP y MODIS MOD16** (NASA) | Lluvia satelital cada media hora, humedad del suelo y evapotranspiración. | IMERG, celdas de 0,1° (unos 10 km). SMAP, 9 km. MOD16, 500 m cada 8 días. | Cuenca y Caudal: las lluvias del historial, la humedad previa y la evapotranspiración, como contexto. | Pipeline (`data/hydrology/lote3/forcing.json`). | No aplica: entra a un modelo sin validar. |
| **Sentinel-1** (ESA) | Un radar en banda C. No es dato NASA. | No aplica. | Respaldo previsto si no hay escenas NISAR de la zona. Hoy no se usa. | No llega. | Se rotula "no es dato NASA". |

### Detalle por fuente

**NISAR**

- Producto L2 GCOV, con escenas de unos 240 km. Mide dos polarizaciones, HH y HV. Una baja de HH se lee como un cambio de rugosidad del suelo (sembradora o labranza). Una suba de HV, como la estructura del cultivo que crece. Que el radar la vea antes que el óptico es una hipótesis del equipo, sin confirmar en campo.
- En el pipeline: 10 fechas de la órbita descendente 111, frame 105, del 21/06/2026 al 31/10/2026. Son 9 escenas *provisional* y 1 *validated* (la del 31/10/2026). Se lee solo la ventana de cada lote más 1000 m alrededor, sin bajar la escena completa.
- En la app: la tarjeta "Pasadas de NISAR" lista las 3 más recientes, con su fecha y su órbita, de las colecciones validada y provisional. Las provisionales pueden cambiar cuando se validen.

**HLS**

- Productos L30 (Landsat) y S30 (Sentinel-2), versión 2.0.
- En el pipeline: escenas del 01/06/2026 al 13/11/2026 con hasta 80 % de nubes. La máscara Fmask descarta nubes, píxeles junto a nubes, sombras de nube y nieve. Solo se usan las fechas con al menos 90 % del lote despejado.
- En la app: la tarjeta "Imágenes HLS" lista las 3 escenas más recientes de los últimos 120 días, con su sensor y su porcentaje de nubes. "Última despejada" es la más reciente con 20 % de nubes o menos, medido sobre toda la escena de unos 110 km, no sobre el lote.

**MODIS NDVI**

- Producto MOD13Q1 v6.1. El píxel mide 231,66 m de lado (250 m nominales). Hay 23 compuestos por año. Cada uno se fecha por su día de inicio y se publica unas 2 o 3 semanas después.
- Solo cuentan los píxeles con confiabilidad buena o marginal. Se descartan los nublados, con nieve o sin dato.
- Por defecto se piden los últimos 12 meses. "Historial desde 2020" pide desde el 01/01/2020 y puede tardar varios minutos: cada pedido al ORNL DAAC tarda cerca de un minuto.

**MODIS cobertura**

- Producto MCD12Q1 v6.1, con la clasificación IGBP de 17 clases. El píxel mide 463,31 m de lado. El mapa de cada año se publica durante el año siguiente: hoy el último es el de 2025.
- Es orientativo. Cada píxel mezcla el lote con lo que lo rodea. Muestra cambios grandes (un desmonte, un bañado que pasa a cultivo) y no los chicos. No sirve para identificar el cultivo.

**NASA POWER**

- Reanálisis MERRA-2 y GEOS-IT. Se piden la lluvia corregida (PRECTOTCORR, en mm por día), la temperatura máxima y mínima a 2 m (hoy no se muestran) y la humedad del suelo superficial (GWETTOP) y de la zona de raíces (GWETROOT), de 0 (seco) a 1 (saturado).
- Se pide en el centroide del lote redondeado a 0,01°, así los lotes vecinos comparten la copia.
- Los últimos días llegan sin dato: POWER los publica con demora.

**CMR de Earthdata**

- La copia del catálogo dura 3 horas. Si una colección no responde, la tarjeta avisa que la consulta falló en parte.

**GIBS**

- La foto del inicio es un archivo propio armado con teselas de HLS Landsat (L30) del 31/10/2026, un día despejado, sin retocar los colores.
- El código tiene 7 capas de GIBS configuradas (color real de HLS y de MODIS, NDVI de MODIS de 8 días, humedad SMAP L4 y dos capas de OPERA), pero ninguna pantalla las muestra todavía.

**Sentinel-1**

- CLAUDE.md lo prevé como respaldo si no hay escenas NISAR de la zona. Hoy ningún código lo consulta. Si un evento viniera de Sentinel-1, la interfaz ya lo rotula "Sentinel-1 (radar, banda C, ESA: no es dato NASA)".

### Otras fuentes, que no son de la NASA

| Fuente | Para qué |
|---|---|
| Esri World Imagery (Esri, Maxar, Earthstar Geographics) | La imagen satelital para marcar el lote, la vista "Satélite" de Mi campo y el mapa de ambientes de Fertilización. |
| OpenStreetMap | Las calles de la vista "Satélite" de Mi campo y el mapa del pasaporte. |
| Nominatim (OpenStreetMap) | El buscador "Buscá tu localidad", limitado a Argentina. |
| Sentinel-2 L2A (ESA) | La imagen del 08/11/2026 sobre la que el equipo dibujó los 4 lotes de ejemplo. |
| MAGyP, Informe de Márgenes y Resultados (septiembre 2026) | Los rindes de referencia de la Zona Núcleo Norte. |
| Field to Market (Metric Methods 5.0), US EPA (GHG Emission Factors Hub) e IPCC (2019 Refinement) | Los factores de emisión y las dosis de referencia de semilla y fitosanitarios. |
| OTBN de Santa Fe (Ministerio de Ambiente de la Nación, IDE Ambiental, capa `bosques:SF_2022_OTBN`) | El chequeo de bosque nativo. |
| Ley provincial de Santa Fe N° 11.273 y OpenStreetMap (`landuse=residential`) | El chequeo de distancia a zonas urbanas: las distancias de la norma y las áreas urbanas aproximadas. |
| Matba Rofex (A3 Mercados), API de Primary vía pyRofex | El precio sugerido de soja en Rentabilidad. |
| Copernicus DEM GLO-30 (ESA, vía AWS Open Data), OpenStreetMap (cursos de agua) e ISRIC SoilGrids 2.0 | El relieve, los canales y arroyos y la textura del suelo de Cuenca y Caudal. |
| USDA NRCS (TR-55 y NEH Parte 630) | Los números de curva, el retardo y el hidrograma unitario de Cuenca y Caudal. |

## 4. Cómo se calcula cada cosa

### Pestaña Satélite

- **Verdor del lote:** el promedio del NDVI de los píxeles válidos de MODIS que tocan el polígono, pesado por las hectáreas de cada píxel que caen dentro del lote. Un píxel que apenas roza el borde pesa poco. Si ningún píxel toca el lote, se usa el más cercano al centro y la app lo avisa.
- **Huecos:** un compuesto sin píxeles válidos queda como hueco, con su motivo ("nublado" o "sin dato"). Nunca se interpola.
- **Tendencia del verdor:** compara el último valor con el de la misma época del año anterior (± 8 días) o, si no lo hay, con el compuesto anterior.
- **Lluvia en 30 días:** la suma de los 30 días que terminan en el último día con dato de POWER. Avisa si faltan días.
- **Humedad del suelo:** la de la zona de raíces de POWER (o, si falta, la superficial), en porcentaje: 100 es saturado.
- **Lluvia por mes:** los últimos 12 meses, en mm. El mes en curso va con asterisco.
- Los eventos de la bitácora se marcan sobre la curva del verdor.

### Bitácora: cómo se detecta un evento

Los eventos no se calculan en la app. Salen del pipeline, que se corre aparte, y se cargan con `import_events`. Hoy el pipeline procesó los 4 lotes de ejemplo y detectó un solo evento: la siembra del Lote 3. El método es una prueba de concepto sin validar en campo.

| Paso | Qué hace |
|---|---|
| 1. Señal del lote | Promedia el backscatter del radar (gamma0, en potencia lineal) sobre los píxeles válidos del polígono y lo pasa a dB (10 · log10). |
| 2. Anomalía | Resta la mediana del paisaje en la misma fecha (los recortes de los 4 lotes, cada uno con 1 km alrededor). Así separa lo que le pasa al lote de lo que le pasa a toda la zona, como la lluvia. |
| 3. Fechas excluidas | Saca las fechas en que el HH de todo el paisaje se aparta de su mediana en el tiempo más de 5 veces el desvío absoluto mediano. Quedó afuera el 07/10/2026: los 4 lotes subieron entre 3 y 6 dB a la vez y NASA POWER, consultado aparte, registra 46 mm de lluvia ese día (suelo mojado, no manejo). |
| 4. Umbral | 3 veces el desvío estándar de los cambios de anomalía en HH entre fechas consecutivas de los lotes de referencia (lotes 2 y 4, sin cambios visibles en NDVI). Hoy da 1,03 dB. |
| 5. Regla | Hay evento si el cambio de anomalía en HH entre dos fechas consecutivas supera el umbral y se mantiene en la fecha siguiente. Se registra solo el primer cambio persistente de cada lote, y nunca en los lotes de referencia. |
| 6. Fecha | El punto medio entre las dos pasadas, con un margen de la mitad del intervalo: ± 6 días con pasadas cada 12 días. |
| 7. Tipo | La lectura del método es que un cambio de superficie seguido de una suba de HV, y después de NDVI, es una siembra. El código registra como siembra cualquier detección y no comprueba esa secuencia. La nota del evento aclara que no se puede descartar una labranza previa. |
| 8. Cultivo | Con una siembra detectada se asigna maíz, ESTIMADO: la del Lote 3 cayó a principios de septiembre, que en la Zona Núcleo suele ser maíz temprano. El código no mira la fecha. Sin evento, pero con NDVI de 0,6 o más (vegetación densa, según USGS), se registra "Otro", VERIFICADO, sin identificar la especie. |

Cada evento guarda:

- El sensor (NISAR), el origen (VERIFICADO), la confianza ("Sin dato": el procesamiento no la informa) y la marca `threshold_validated: false`.
- Las métricas: el cambio de HH y de HV frente al paisaje, el umbral, las fechas comparadas y el NDVI antes y después.
- Dos imágenes de evidencia de 600 × 600 px con el mismo encuadre: el lote con 600 m de margen y su contorno en amarillo. Una es el radar en falso color (rojo, HH; verde, HV; azul, el cociente HH/HV). La otra es el óptico HLS en color natural. La bitácora las muestra lado a lado o con una línea que se mueve.

**Resultados actuales:**

| Lote | Radar NISAR | NDVI HLS | En la app |
|---|---|---|---|
| Lote 1 (23 ha) | Sin cambio brusco. HV sube de a poco desde agosto. | 0,3 en junio, 0,85 en agosto y 0,76 a fines de octubre. | Campaña 2026/27 con cultivo "Otro", VERIFICADO: un cultivo de invierno sin identificar. Sin eventos. |
| Lote 2 (37 ha) | Estable. | Entre 0,24 y 0,30. | Sin campañas ni eventos (barbecho). Es lote de referencia. |
| Lote 3 (87 ha) | HH bajó 1,78 dB frente al paisaje entre el 01/09/2026 y el 13/09/2026, y se mantuvo. HV subió 0,81 dB. | De 0,23 (28/08/2026) a 0,34 (31/10/2026). | Siembra, NISAR, VERIFICADO, 07/09/2026 ± 6 días. Campaña 2026/27 de maíz, ESTIMADO. |
| Lote 4 (39 ha) | Estable. | Entre 0,23 y 0,34. | Sin campañas ni eventos (barbecho). Es lote de referencia. |

**Confirmar y corregir** (solo el dueño, en su lote):

- Corregir el tipo, la fecha o el margen con otro valor pasa el evento a DECLARADO. Confirmar uno ESTIMADO, también.
- Confirmar uno VERIFICADO o DECLARADO no cambia nada. Cambiar solo las notas no toca el origen.
- Se conservan el sensor, la confianza, la evidencia y las métricas originales. Un evento simulado sigue marcado como simulado.
- Como el puntaje se calcula con los eventos, corregir uno puede cambiar un criterio.

**Tipos de evento.** El modelo admite siete: siembra, cosecha, remoción de suelo, cultivo de cobertura, anegamiento, quema y cambio de uso del suelo. Hoy el pipeline solo registra siembras. El campo sensor siempre dice el sensor real.

**Carga.** El JSON de cada lote sigue el contrato de [CLAUDE.md, sección 8](CLAUDE.md). La carga es atómica: si algo no cumple, no se guarda nada. Lo importado queda como lote de ejemplo público, sin dueño y de solo lectura. Los lotes de los productores nunca se tocan.

### Huella de carbono

Es una estimación en kg CO2e por tonelada de grano, para una campaña del lote: la elegida o, si no se elige ninguna, la última. Siempre es provisional. El descargo dice: "Estimación con respaldo satelital. Prueba de concepto: no es una calculadora auditada ni reemplaza a VISEC, RTRS o 2BSvs."

```
huella (kg CO2e/t) = suma de (dato de actividad por ha × factor de emisión) ÷ rinde (t/ha)
```

Cada componente da primero kg CO2e/ha (cantidad × factor) y después kg CO2e/t (÷ rinde).

| Componente | Dato de actividad, por ha | Factor | Fuente del factor |
|---|---|---|---|
| Producción de fertilizante nitrogenado | kg de N, como nutriente | 1,772 kg CO2e/kg N | Field to Market, Metric Methods 5.0, Impact Factors of Fertilizers, Table 5 (promedio de EE.UU., de la cuna a la puerta de planta) |
| Producción de fertilizante fosforado | kg de P2O5, como nutriente | 1,975 kg CO2e/kg P2O5 | Field to Market, Impact Factors of Fertilizers, Table 5 |
| Emisiones de N2O del suelo | kg de N aplicado | 4,164 kg CO2e/kg N | IPCC 2019 Refinement, Vol. 4, Cap. 11, Table 11.1: 0,010 kg N2O-N por kg de N × 44/28 × 265. Solo emisiones directas |
| Gasoil de labores | litros | 2,781 kg CO2e/l | US EPA, GHG Emission Factors Hub (15/01/2025), Tables 2 y 5. Solo combustión |
| Fitosanitarios | kg de principio activo | 20,71 kg CO2e/kg | Field to Market, Impact Factors of Crop Protectants and Inoculants, Table 2 (herbicidas). Se usa para todos los fitosanitarios |
| Semilla | kg | Maíz 0,370; soja 0,463; trigo 0,949 kg CO2e/kg | Field to Market, Impact Factors of Seed Production, Table 3. El cultivo "Otro" no tiene factor |
| Cambio de uso del suelo (desde 2020) | Sale de la bitácora o, si no hay evento, de la declaración del productor | Sin factor | Ninguna fuente cargada |

- Los gases se pasan a CO2e con los potenciales a 100 años de IPCC AR5 que publica US EPA: CH4 = 28 y N2O = 265.
- Los factores están en `backend/carbon/factors.yaml`, cada uno con su fuente y, en un comentario, la cuenta que da el valor. Ninguno es un dato satelital: son constantes publicadas que cargó el equipo.
- Un factor solo se usa si tiene valor, unidad y fuente y está validado. Si no, el componente queda "Sin dato" con el motivo.
- El nitrógeno alimenta dos componentes: la producción del fertilizante y el N2O del suelo.
- Varios registros de una misma categoría se suman, y el componente toma el origen menos respaldado.

**Valores de referencia.** Si el productor no declaró un dato, el backend lo completa con una referencia, con origen ESTIMADO. Una referencia nunca pisa un dato declarado.

| Dato | Maíz | Soja de primera | Trigo | Fuente |
|---|---|---|---|---|
| Rinde (t/ha) | 7,85 | 3,46 | 3,32 | MAGyP, Informe de Márgenes y Resultados (septiembre 2026), Zona Núcleo Norte |
| Fitosanitarios (kg p. a./ha) | 0,39 | 0,48 | 0,13 | Field to Market, Crop Protectants and Inoculants, Table 3 (dosis de EE.UU.) |
| Semilla (kg/ha) | 34 | 187 | 176 | Field to Market, Seed Production, Table 1 (densidad de EE.UU.) |

Nitrógeno, fósforo y gasoil no tienen referencia con fuente: los tiene que declarar el productor. El cultivo "Otro" no tiene ninguna referencia.

**Cuándo hay un total.** Solo si los 7 componentes están calculados y hay un rinde mayor que cero. No hay totales parciales: sumar solo lo que hay subestimaría la huella. Si falta algo, la pestaña dice "Todavía no se puede calcular" y la ayuda, por ejemplo, "Faltan 4 de 7 componentes" o "Faltan 7 de 7 componentes y falta el rendimiento". Sin rinde, los componentes con dato se muestran por hectárea.

**Cambio de uso del suelo, en orden de prioridad** (`backend/carbon/footprint.py`):

1. Con algún evento de cambio de uso desde el 01/01/2020 en la bitácora: manda el evento. Hace falta un factor por hectárea que hoy no existe, así que queda "Sin dato".
2. Sin ese evento, pero con la declaración del productor (pestaña Prácticas): "No cambié el uso" aporta 0, con origen DECLARADO ("dato declarado, no observado por satélite"). "Sí, hubo un cambio" queda "Sin dato", porque falta el factor.
3. Sin evento ni declaración, pero con otros eventos en la bitácora: aporta 0, con origen ESTIMADO. La ausencia es inferida, no una observación directa.
4. Sin evento, sin declaración y sin bitácora: queda "Sin dato". Los eventos hipotéticos del Simulador no cuentan como bitácora.

Por eso un lote propio con "No cambié el uso" y los insumos cargados ya llega a una huella total. Lo que vio MODIS no entra en la cuenta: es orientativo.

**Confianza.** Cuenta los orígenes de los datos del lote: el rinde, cada insumo usado y el dato de cambio de uso. Los factores no cuentan, porque son constantes con fuente.

- **ALTO:** los VERIFICADO más los DECLARADO superan a los ESTIMADO.
- **BAJO:** los ESTIMADO son iguales o más.
- **SIN DATOS:** no hay ningún dato del lote.

**Ejemplo, con números ficticios de una prueba (no es un lote real).** Maíz con 100 kg de N, 20 kg de P2O5, 40 l de gasoil y 9 t/ha declarados, semilla y fitosanitarios de referencia y un evento en la bitácora que no es de cambio de uso:

| Componente | Cálculo | kg CO2e/ha |
|---|---|---|
| Producción de N | 100 × 1,772 | 177,2 |
| Producción de P | 20 × 1,975 | 39,5 |
| N2O del suelo | 100 × 4,164 | 416,4 |
| Gasoil | 40 × 2,781 | 111,24 |
| Fitosanitarios (referencia) | 0,39 × 20,71 | 8,08 |
| Semilla (referencia) | 34 × 0,370 | 12,58 |
| Cambio de uso | sin evento de cambio | 0 |
| **Total** | | **765,0** |

Huella = 765,0 ÷ 9 = **85,0 kg CO2e/t**. El N2O del suelo es el 54 %. La confianza es ALTO: 4 datos declarados y 3 estimados.

**En los lotes de ejemplo.** El Lote 3 usa el rinde de referencia (7,85 t/ha) y los fitosanitarios y la semilla de referencia, que aportan 1,03 y 1,60 kg CO2e/t. El cambio de uso aporta 0. Le faltan el nitrógeno, el fósforo, el N2O y el gasoil: "faltan 4 de 7 componentes". Los lotes 1, 2 y 4 dicen que faltan los 7 componentes y el rendimiento.

**Cómo se ve en la pestaña Huella:**

- Arriba: el valor o "Todavía no se puede calcular", los chips de lo que falta (por ejemplo, Rinde o Insumos) y la confianza. La ayuda "Qué falta para calcularla" dice quién completa cada cosa.
- **Resumen:** "Qué pesa más" (los 4 componentes que más aportan), "Rinde" y "De dónde salen los datos" (cuántos datos son verificados, declarados y estimados).
- **Desglose:** una fila por componente con "Calculado" o "Sin dato" y el motivo. Al tocarla se ven el dato, el factor y su fuente.
- **Tus datos:** el formulario del productor. El nitrógeno y el fósforo se cargan como nutriente, no como producto: 100 kg de urea son 46 kg de N y 100 kg de MAP son 52 kg de P2O5. Un campo vacío borra lo declarado: vuelve la referencia si existe y, si no, queda "Sin dato". Tiene topes para frenar errores de tipeo (por ejemplo, rinde hasta 30 t/ha o N hasta 500 kg/ha), que no son datos agronómicos.

**Simulador.**

- Solo prueba sumar o quitar un cultivo de cobertura. Trabaja sobre una copia en memoria: agrega un evento hipotético de cobertura con la fecha de hoy y devuelve la huella y el puntaje antes y después, con los criterios que cambian.
- No guarda nada ("Simulación: no modifica los datos del lote."). Por eso anda también en los lotes de ejemplo, sin cuenta.
- La cobertura no cambia ningún componente de la huella: su posible efecto sobre el carbono del suelo no está modelado, porque no hay un factor con fuente. Solo mueve el criterio de cobertura invernal del puntaje.
- El evento hipotético no cuenta como bitácora: en un lote sin eventos no permite inferir "sin labranza", "sin quema" ni "sin cambio de uso".

### Puntaje de buenas prácticas

Va de 0 a 100 y es provisional. Tiene 5 criterios de 20 puntos cada uno. Los pesos son una decisión del equipo (14/11/2026): pesos iguales, la regla más simple y transparente. No salen de una fuente.

```
puntaje = 100 × (suma de los pesos de los criterios que cumplen) ÷ (suma de todos los pesos)
```

Con pesos iguales solo puede valer 0, 20, 40, 60, 80 o 100. Solo hay número si ningún criterio está "Sin dato". Si no, dice "Sin calcular" con el motivo.

| Criterio | Cumple si... | De dónde sale |
|---|---|---|
| Sin cambio de uso del suelo desde 2020 | No hay eventos de cambio de uso desde el 01/01/2020. Sin esos eventos, vale la declaración del productor: "No cambié el uso" cumple y "Sí, hubo un cambio" no cumple, con origen DECLARADO. | Bitácora o declaración |
| Siembra directa | No hay eventos de remoción de suelo, en ninguna fecha. | Bitácora |
| Cobertura invernal | Hay algún evento de cultivo de cobertura. No mira la estación ni la campaña. | Bitácora |
| Rotación de cultivos | Hay al menos dos campañas y, entre todas, más de un cultivo distinto. | Campañas |
| Sin quema | No hay eventos de quema. | Bitácora |

Los criterios de la bitácora tienen tres casos:

1. **Hay eventos de ese tipo:** el estado sale de su presencia, con el origen más respaldado de esos eventos y la lista de evidencia.
2. **El lote tiene eventos, pero ninguno de ese tipo:** la ausencia se informa como ESTIMADO. Es inferida, no observada.
3. **El lote no tiene ningún evento:** el criterio queda "Sin dato". Los eventos hipotéticos del Simulador no cuentan.

El de cambio de uso mira antes la declaración del productor: un evento de la bitácora manda y, sin él, vale lo declarado (tabla de arriba).

- El puntaje mira toda la historia del lote. La huella, en cambio, es de una sola campaña.
- La confianza del puntaje usa la misma regla que la huella, sobre el origen de cada criterio.
- "Qué conviene hacer" muestra hasta 3 consejos de una frase, primero lo que no cumple y después lo que falta medir, con enlaces como "Simular en Huella", "Ir a Fertilización" o "Revisar en Bitácora". No llevan números, porque ninguno tendría fuente.
- **En los lotes de ejemplo:** el Lote 3 queda "Sin calcular", porque la rotación necesita dos campañas. Sin cambio de uso, siembra directa y sin quema cumplen por ausencia (ESTIMADO), y cobertura no cumple. La confianza es BAJO.

### Uso del suelo desde 2020

Hay dos datos que se comparan: lo que declara el productor y lo que vio MODIS.

**Lo que declara el productor** (pestaña Prácticas, solo en un lote propio):

- Responde "¿Cambió el uso del suelo desde 2020?" con "No cambié el uso" o "Sí, hubo un cambio".
- Se guarda en el lote como DECLARADO, con la fecha. Declarar otra vez pisa la declaración anterior.
- No genera eventos, pero cuenta en el puntaje (criterio "Sin cambio de uso del suelo desde 2020") y en la huella (componente de cambio de uso), salvo que la bitácora tenga un evento de cambio de uso, que manda. En ese caso la pantalla lo aclara: "Tu declaración del … no cuenta acá: manda el cambio de uso que registra la bitácora."
- Cuando cuenta, la ayuda de la fila en "Cómo está cada práctica" dice "El puntaje provisional y la huella usan tu declaración."
- También la usa el chequeo de bosque nativo: con superposición de categoría I o II y un cambio declarado, da la alerta de posible desmonte.

**Lo que vio MODIS** (MCD12Q1, en vivo, orientativo):

- **Píxeles del lote:** los que tienen el centro dentro del polígono. Si no hay ninguno, el que contiene el centro del lote, y se aclara que el dato abarca también lo que lo rodea.
- **Grupos:** Agrícola (cultivo, y mosaico de cultivo y vegetación natural, juntos porque la clasificación salta entre los dos), Natural (bosques, matorrales, sabanas, pastizal y humedal), Urbano, y Agua, nieve o suelo desnudo.
- **"Sin cambios grandes":** el grupo dominante de 2020 sigue hasta el último año con dato y ningún cambio que se sostenga llega a un cuarto de los píxeles.
- **"Posible cambio":** en 2020 no hubo un grupo dominante (empate), o el dominante cambió, o un cuarto o más de los píxeles cambió de grupo respecto de 2020. El cambio tiene que seguir al año siguiente con dato (o caer en el último año).
- **"Sin dato para comparar":** no hay píxeles, ni clase válida, ni mapa de 2020, o no hay un año posterior.
- Un cambio de un solo año que después vuelve, o uno de menos de un cuarto de los píxeles, no cambia el veredicto: el texto lo menciona como posible error de clasificación.
- Ejemplo real (consulta del 14/11/2026): el píxel que contiene el centro del Lote 3 figura como cultivo todos los años de 2020 a 2025.

**La comparación**, en una línea: "Respaldado por lo que vio MODIS", "No coincide con MODIS: revisalo" (aclara que puede ser un error de clasificación), "MODIS no alcanza para confirmarlo" (en 2020 no hubo un uso dominante), "Con un cambio, la práctica no se cumple" o "Sin dato de MODIS para comparar". El texto nunca acusa. Ninguna de estas líneas cambia el puntaje ni la huella: lo que vio MODIS no entra en la cuenta.

### Fertilización

**Ambientes por NDVI:**

- Usa el NDVI de MODIS (MOD13Q1, 250 m), pedido en vivo. Toma un solo compuesto de 16 días: el último publicado con algún píxel válido dentro del lote. La fecha que muestra es la de inicio de ese compuesto.
- Un píxel cuenta si alguna parte cae dentro del polígono y su dato es bueno o marginal (sin nubes ni nieve). Pesa por las hectáreas que tiene adentro.
- Un píxel con menos de la mitad adentro es un píxel mixto: su NDVI refleja sobre todo lo que hay alrededor. Se pinta más claro y la leyenda dice "… ha de píxeles mixtos, menos seguras".
- El mapa se recorta al borde del lote y pasa suave de un ambiente a otro con un degradado entre cuadros vecinos. El degradado es solo visual: las hectáreas, los porcentajes y las dosis salen de cada cuadro.
- Toma el NDVI mínimo y el máximo de esos píxeles y parte el rango en tres tramos iguales: bajo, medio y alto. No hay umbrales fijos.
- Sin ambientes si hay menos de 3 píxeles válidos ("Hacen falta al menos 3 píxeles de 250 m válidos dentro del lote para separar ambientes.") o si todos valen lo mismo ("El NDVI es parejo en todo el lote.").
- La superficie de cada ambiente es su parte de las hectáreas válidas dentro del lote (no la cuenta de píxeles) por la superficie del lote. Es aproximada.

**Planilla de dosis variable de nitrógeno** ("La decidís vos: no es una recomendación agronómica."):

| Cálculo | Fórmula |
|---|---|
| Nitrógeno de cada ambiente | dosis (kg N/ha) × hectáreas del ambiente |
| Total con dosis variable | suma de los tres ambientes, cuando los tres tienen dosis, en kg de N (DECLARADO) |
| Promedio | total ÷ superficie del lote, en kg N/ha |
| Total con dosis uniforme | nitrógeno declarado en la Huella para la última campaña × superficie del lote |
| Diferencia | kg de N variable − kg de N uniforme |
| Emisiones (ESTIMADO) | kg de N × 5,936 kg CO2e/kg N, en kg CO2e del lote entero |

- El factor de 5,936 es la suma de los dos factores de la huella para el nitrógeno: producción (1,772) y N2O del suelo (4,164). Si falta alguno, las emisiones quedan "Sin dato".
- Sin nitrógeno declarado en la Huella, la dosis uniforme dice "Sin dato" y ofrece declararla. No hay nitrógeno de referencia.
- "Ver detalle técnico" muestra el factor con sus fuentes y el fósforo declarado, con lo que emite su producción. El fósforo no entra en la planilla.
- Ejemplo de una prueba, con números ficticios: 6 píxeles con NDVI de 0,2 a 0,9 en un lote de 10 ha dan cortes en 0,433 y 0,667 y tres ambientes de 33 %. Con 100, 80 y 60 kg N/ha suman 800 kg de N, con un promedio de 80 kg N/ha. Con el factor de 5,936 serían unos 4.749 kg CO2e.
- Las dosis se guardan solo en el dispositivo, una por lote. Sin sesión no se guardan.

### Rentabilidad

```
ingreso bruto (US$/ha)    = rinde × precio del grano
margen bruto (US$/ha)     = rinde × precio − rinde × flete y comercialización − suma de los costos directos
margen bruto del lote (US$) = margen bruto por ha × superficie del lote
rinde de indiferencia (t/ha) = costos directos ÷ (precio − flete y comercialización por t)
```

- **Lo que carga el productor:** el precio del grano en US$/t, antes del flete; su rinde en t/ha (opcional); y, en "Costos y gastos", el flete y comercialización en US$/t y siete costos en US$/ha: semilla, fertilizantes, fitosanitarios, labores (siembra y pulverizaciones), cosecha, arrendamiento y otros costos. La superficie sale del polígono.
- **Precio sugerido de Matba Rofex (solo soja).** "Usar precio sugerido de Rofex" lo pide al backend (`backend/market/rofex.py`) y lo carga en el campo. Es el futuro de soja Rosario en la posición mayo de la cosecha: para la campaña 2026/27, `SOJ.ROS/MAY27`; sin campaña, la próxima posición mayo. Toma el precio de ajuste o, si no hay, el último operado o el de cierre. El servidor lo guarda 10 minutos y espera a Rofex hasta 10 segundos. Solo aparece si la campaña es de soja o no hay campaña.
- **Su etiqueta:** mientras no se cambie, el precio es ESTIMADO y dice "Sugerido por Matba Rofex" con la fecha. Si el productor lo cambia, pasa a DECLARADO. La (i) dice el contrato, el tipo de precio, la fuente ("Matba Rofex (A3 Mercados), API de Primary vía pyRofex") y "Precio sugerido de mercado, para tomar como referencia: no es una cotización en firme ni una recomendación comercial. Podés cambiarlo."
- **Si no hay precio:** sin credenciales en el servidor dice "Sin precio de Rofex" y la (i) explica "El precio sugerido de Rofex todavía no está disponible: el servidor no tiene configurada la conexión con Matba Rofex. Podés cargar el precio a mano." Si Rofex falla o tarda, también dice "Sin precio de Rofex", con "Reintentar". Si el servidor usa el entorno de prueba reMarkets, el precio lleva "Precio de prueba": "no es un precio real de mercado".
- **No hay costos de referencia.** Los costos son siempre DECLARADO.
- **El rinde:** el que escribe el productor o, si lo deja vacío, el de la huella: el declarado en "Cargar rinde e insumos" o la referencia regional de MAGyP. Con la referencia, el margen lleva ESTIMADO ("Con el rinde de referencia"). Con el precio de Rofex, también ("Con el precio de Rofex", "Con el precio de prueba de Rofex" o "Con rinde de referencia y precio de Rofex"). Si no, DECLARADO ("Con tus datos"). El rinde escrito en Rentabilidad no vuelve a la huella.
- **Si falta algo:** sin precio o sin rinde no hay margen, y la tarjeta dice "Sin dato" con el motivo. Un costo vacío suma 0, pero queda como faltante: "Falta 1 costo por cargar: el margen real es menor." El rinde de indiferencia solo existe si el precio supera al flete y comercialización.
- **Sensibilidad:** una tabla de 5 × 5 que recalcula el margen por hectárea con el rinde y el precio a −20 %, −10 %, actual, +10 % y +20 %. Las celdas negativas van en rojo.
- **Margen y huella** (ESTIMADO): huella (kg CO2e/t) × rinde da kg CO2e por hectárea. Con margen positivo, dividido por el margen da kg CO2e por dólar. Mientras el lote no tenga una huella total (los de ejemplo no la tienen), ofrece "Completala en la huella".
- **Cómo se escriben los números:** con coma decimal y sin puntos de miles: 1200 o 1200,50.
- **Ejemplo de una prueba, con números ficticios:** 3 t/ha × 300 US$/t = 900 US$/ha. Menos 60 de flete (20 US$/t) y 370 de costos (semilla 100, fertilizantes 150, labores 120) da 470 US$/ha, o 18.800 US$ en 40 ha. El rinde de indiferencia es 370 ÷ 280, unas 1,32 t/ha.
- **Dónde queda:** solo en el dispositivo, por lote y campaña. Sin sesión, solo mientras la app está abierta ("Sin cuenta no se guardan: se borran al cerrar.").

### Pasaporte

- **Cómo se genera:** en un lote propio, ⋯ y "Compartir pasaporte". Crea un enlace `/pasaporte/<token>` con un código único (UUID) y lo copia. En un lote de ejemplo no se puede.
- **Qué muestra:** nombre, localidad y provincia, hectáreas (calculadas del polígono), el RENSPA si se cargó, el polígono sobre un mapa de OpenStreetMap, las campañas con cultivo, rinde y origen, la bitácora (6 eventos en pantalla, todos al imprimir), la huella de la última campaña, el puntaje provisional con sus criterios, el descargo "Estimación con respaldo satelital. Prueba de concepto. Vista pública de solo lectura." y "Usa datos abiertos de la NASA."
- **Qué no muestra:** quién es el dueño. Tampoco Rentabilidad ni Fertilización, que viven solo en el dispositivo.
- **Siempre al día:** se recalcula cada vez que alguien lo abre. Si el productor carga datos nuevos, el mismo enlace los muestra. "Generado el" es el momento en que se abrió la página.
- **Vencimiento:** la app lo crea sin vencimiento. La API acepta uno (`expires_in_days`), y un pasaporte vencido responde "Este pasaporte venció y ya no está disponible."
- Se abre sin cuenta, tiene el botón "Imprimir" y no aparece en buscadores.

### Superficie del lote

La que se ve al marcar es aproximada: la calcula el navegador. La que queda guardada la calcula el backend sobre el elipsoide WGS84 (área geodésica) cada vez que se guarda el lote. Al marcar y en Rentabilidad se muestra como DECLARADO; en Rentabilidad, con la leyenda "Del polígono que marcaste."

### Chequeos territoriales

Están en la pestaña Prácticas, en la tarjeta "Chequeos territoriales" ("Cruce indicativo con capas públicas."). El backend (`backend/territory/`) cruza el polígono del lote con capas públicas que el equipo bajó y guardó en `data/layers/` con `pipeline/scripts/build_layer_*.py`. No se consultan en vivo. Cada chequeo es una fila con su estado ("Sin conflicto detectado", "Posible conflicto" o "Sin dato") y su origen ("Capa pública" o DECLARADO). Al abrirla muestra el resumen, el detalle y la fuente. El descargo dice: "Cruce con capas públicas, indicativo. No reemplaza asesoramiento legal ni constituye una auditoría."

| Chequeo | Qué cruza | Qué responde | De dónde sale |
|---|---|---|---|
| Distancia a zonas urbanas (periurbano) | El área urbana de las localidades cercanas, ampliada 500 m (aplicación terrestre) y 3.000 m (aplicación aérea). | Las hectáreas y el porcentaje del lote dentro de cada franja, la distancia al área urbana y un mapa con las franjas. Con alguna superposición, "Posible conflicto": ahí la norma restringe aplicar fitosanitarios de clase toxicológica A y B. | Ley provincial de Santa Fe N° 11.273, arts. 33 (aérea) y 34 (terrestre), leída en el texto oficial. Las áreas urbanas son aproximadas con OpenStreetMap (`landuse=residential`, bajado el 15/11/2026) para Casilda, Chabás, Fuentes, Los Molinos, Pujato y Sanford. |
| Bosque nativo (OTBN) | El Ordenamiento Territorial de Bosques Nativos de Santa Fe (Ley 26.331): categorías I (rojo) y II (amarillo), que no admiten desmonte. | Las hectáreas y el porcentaje superpuestos por categoría y la distancia al polígono protegido más cercano. Con superposición, "Posible conflicto". Si además la bitácora tiene un cambio de uso o el productor declaró uno, "Posible desmonte: revisalo con la autoridad provincial." | Capa oficial `bosques:SF_2022_OTBN` del Ministerio de Ambiente de la Nación (IDE Ambiental), aprobada por la Ley provincial 13.372 y actualizada por el Decreto 1.690/2022. Recortada al sur de Santa Fe: 1.510 polígonos. |
| Buenas Prácticas (BPA) | Nada: muestra lo que declaró el productor sobre su adhesión al programa provincial de Buenas Prácticas Agropecuarias de Santa Fe. | Adherido: "Sin conflicto detectado". No adherido: "Posible conflicto", que "No implica un incumplimiento: es un punto para revisar." Sin declaración: "Sin declarar". | El productor, como DECLARADO. No se contrasta con ningún registro ("No se verificó contra el registro provincial."). |

- **Qué no responde:** no dice si una aplicación fue legal ni reemplaza la consulta a la autoridad provincial. El área urbana no es el límite oficial de la planta urbana, que fija cada municipio por ordenanza. No se encontró una ordenanza de Casilda con distancias propias, así que se usa la ley provincial. La inscripción en BPA no se verifica.
- **"Sin dato":** si falta la capa, si la localidad más cercana no tiene una distancia leída en la norma, o si el lote queda fuera del recorte del OTBN (latitud −33,8 a −32,3 y longitud −62,3 a −60,3).
- **En los lotes de ejemplo** (cálculo aproximado para este documento; mirar antes el resultado en la app): los cuatro están cerca de Casilda. Los lotes 1, 2 y 3 quedan dentro de la franja de 3.000 m y fuera de la de 500 m, así que dan "Posible conflicto" por la aplicación aérea. El Lote 4 queda a unos 3 km, justo en el borde de esa franja. Ninguno se superpone con bosque nativo de categoría I o II: el polígono protegido más cercano queda a más de 1 km. BPA dice "Sin declarar".

### Cuenca y Caudal

Es la séptima pestaña del popup: "De dónde viene el agua que llega al lote, cuánto escurre con una lluvia y dónde se junta." Está configurada para el Lote 3 de ejemplo y su entorno: una ventana de 0,18° de latitud por 0,20° de longitud (unos 20 × 19 km) que incluye a los cuatro lotes de ejemplo. Un lote fuera de esa ventana muestra "El análisis de Cuenca y Caudal está configurado para el Lote 3 (Casilda) y su entorno. Este lote queda fuera de la zona procesada." Arriba siempre dice: "Estimaciones de un modelo físico con datos satelitales, sin validar: en esta cuenca no hay caudales ni niveles medidos."

**De dónde salen los datos.** El pipeline los procesa aparte (`pipeline/scripts/hydrology_terrain.py` y `hydrology_forcing.py`). El backend (`backend/hydrology/`) solo los lee de `data/hydrology/lote3/` y calcula en cada pedido.

- **Terreno:** el Copernicus DEM GLO-30 (ESA, 30 m). Es un modelo de superficie: incluye árboles, edificios y terraplenes. Se rellenan los bajos (Priority-Flood+ε) y se calcula la dirección de flujo D8, hacia la celda vecina más baja.
- **Acumulación de flujo:** cuánta superficie drena a cada celda. Los canales y arroyos de OpenStreetMap se "queman" 3 m en el DEM para que el flujo los siga. Es un criterio de modelado, no una profundidad. La cuenca también se calcula sin ellos ("Sin canales OSM").
- **TWI:** el índice topográfico de humedad, ln(a / tan β) (Beven y Kirkby 1979). Es alto donde el flujo converge y hay poca pendiente.
- **Lluvia, humedad y cobertura:** NASA GPM IMERG V07 (eventos desde 2020), SMAP L3 (humedad previa, como contexto), MODIS MOD16 (evapotranspiración), MODIS MCD12Q1 (cobertura) y la textura de ISRIC SoilGrids. Van en `data/hydrology/lote3/forcing.json` y `landcover.npz`.
- **Caudal:** la escorrentía sale del número de curva SCS-CN (USDA NRCS TR-55), según la cobertura y el grupo de suelo. El caudal, del hidrograma unitario SCS (NEH 630, factor de pico 484) con el retardo de Mockus. Los parámetros y su fuente están en `backend/hydrology/parameters.yaml`.

| Sección | Qué muestra |
|---|---|
| A · Cuenca aportante | "Toda la superficie aguas arriba, también fuera del lote." El mapa, "Qué le llega al lote", "Cuenca al punto de salida" (superficie, pendiente, desnivel y largo) y "Cobertura del suelo". Un clic en el mapa elige otro punto de salida; "Volver a la salida del lote" lo devuelve. |
| B · Historial hidrológico | "Lluvias fuertes desde 2020 y lo que el modelo estima que escurrió en cada una." Eventos de 20 mm o más en un día, con la lámina escurrida, el volumen y el caudal pico en condición media (ARC II), y el rango de seco a húmedo. |
| C · Simulador de lluvia | "Escenarios hipotéticos: no son pronósticos meteorológicos." Con una lluvia (mm), su "Duración", la "Humedad previa", el "Grupo hidrológico del suelo" y si hay rastrojo (siembra directa), devuelve la lámina escurrida, el volumen, el caudal pico y el hidrograma. No guarda nada en la base. |
| D · Impacto sobre el lote | "Por dónde entra y sale el agua y dónde tiende a juntarse." "Qué revisar en el campo" (sectores con TWI en el 10 % más alto de la zona o bajos de 10 cm o más) y "Salidas de agua". |

- No pide cuenta en los lotes de ejemplo y no guarda nada.
- No hay caudales ni niveles medidos en la cuenca: ningún resultado está validado y no se entrenó un modelo de aprendizaje automático. Las zonas de acumulación son susceptibilidad relativa, no una simulación de anegamiento.

## 5. Qué significa cada etiqueta

| Etiqueta | Qué quiere decir | Ejemplos |
|---|---|---|
| **VERIFICADO** | Lo observó un satélite. No quiere decir que esté validado en campo ni que sea exacto. | La siembra del Lote 3 (NISAR), el NDVI de MODIS, el uso del suelo de MODIS (orientativo), el cultivo "Otro" del Lote 1. |
| **DECLARADO** | Lo cargó, corrigió o confirmó el productor. | "Tus datos" de la Huella, la declaración de uso del suelo, la adhesión a BPA, un evento corregido, el precio escrito a mano y los costos de Rentabilidad, las dosis de Fertilización, la superficie del polígono. |
| **ESTIMADO** | Un valor regional, por defecto, de un modelo o inferido. No es una observación directa del lote. | NASA POWER, los rindes de MAGyP, la semilla y los fitosanitarios de referencia, el maíz del Lote 3, la ausencia de un evento, las emisiones de Fertilización, el precio sugerido de Rofex mientras no se cambie. |
| **Capa pública** | El dato sale de una capa pública (un organismo u OpenStreetMap), no de un satélite. Solo en los chequeos territoriales. | Bosque nativo (OTBN) y distancia a zonas urbanas. |
| **Precio de prueba** | El precio sugerido viene del entorno de prueba reMarkets de Rofex: no es un precio real de mercado. | El precio de Rentabilidad si el servidor usa reMarkets. |
| **Dato simulado para la demostración** | El dato tiene `is_simulated: true` en la base. | Hoy ningún dato de los lotes de ejemplo es simulado. |
| **Sin dato** | Falta el dato o algo para calcularlo. Siempre va con el motivo. Nunca se rellena ni se interpola. | "Falta el factor de emisión", "El compuesto vino nublado sobre el lote", "NASA POWER publica los últimos días con demora". |

- La etiqueta siempre lleva el texto: el significado no depende solo del color.
- En la maqueta de Mi campo, el borde del globo de cada lote dice el origen: llena, verificado; doble, declarado; punteada, estimado; discontinua, simulado.
- La **confianza** (ALTO, BAJO o SIN DATOS) resume los orígenes de la huella y del puntaje: ALTO si los verificados y declarados superan a los estimados.
- El "Después (hipotético)" del Simulador no es un dato: es un cálculo que no se guarda.

## 6. Privacidad, cuentas y modo sin conexión

### Cuentas

- Cuenta con mail y contraseña. El nombre es opcional y el mail no se puede repetir.
- La contraseña pide al menos 8 caracteres, que no sean solo números, y pasa los validadores de Django (que no se parezca al mail ni al nombre y que no sea una contraseña común). Se guarda solo su hash (PBKDF2 con SHA256 y 1.500.000 iteraciones).
- Un ingreso fallido dice "Mail o contraseña incorrectos." sin revelar si el mail tiene cuenta.
- Registro e ingreso aceptan hasta 20 intentos por minuto por IP.
- La sesión es un token, uno por cuenta, que no vence hasta salir. "Salir" lo borra: cierra la sesión en todos los dispositivos y borra de este lo guardado de esa cuenta.
- No hay recuperación de contraseña, borrado de cuenta, ingreso con cuentas de terceros ni roles.

### Quién ve qué

| Qué | Quién lo ve | Quién lo cambia |
|---|---|---|
| Un lote propio, con su bitácora, huella, puntaje y simulador | Solo el dueño | Solo el dueño |
| Un lote de ejemplo | Cualquiera, sin cuenta | Nadie: es de solo lectura |
| Un pasaporte | Cualquiera que tenga el enlace | Nadie: se recalcula con los datos del lote |

- Un lote ajeno responde igual que uno que no existe, para no revelar que existe.
- La lista de lotes nunca dice quién es el dueño.
- "Privado" quiere decir privado frente a otros usuarios de la app. Quien administra la base puede ver los datos.

### Qué sale del dispositivo

- **A la NASA** (POWER, ORNL DAAC y CMR): las coordenadas o el polígono del lote, para pedir sus datos. Nunca la cuenta ni el token.
- **A Esri y OpenStreetMap:** los pedidos de las imágenes del mapa. **A Nominatim:** el texto buscado, solo al apretar Enter o "Buscar".
- **La ubicación del dispositivo:** se pide una sola vez y solo para llevar el mapa. No se guarda ni en el backend ni en el dispositivo: solo viaja en la dirección de la pantalla de Marcar lote.
- **El token** solo viaja al backend de LoTestigo.
- **A Matba Rofex:** el pedido lo hace el backend, solo con el contrato (por ejemplo, `SOJ.ROS/MAY27`). No viaja nada del lote ni de la cuenta.

### Dónde queda cada dato

| Dato | Dónde queda |
|---|---|
| Cuenta (mail, nombre y hash de la contraseña), token, lotes (polígono, área, nombre, RENSPA, localidad, provincia y declaración de uso del suelo), declaración de BPA, campañas, insumos declarados, eventos con sus correcciones y pasaportes | En la base PostgreSQL del backend |
| Sesión, copias de lo que respondió el backend, lotes sin subir, Rentabilidad (con el precio de Rofex que se usó), dosis de Fertilización, borrador del lote que se está marcando | En el navegador. Al salir se borra todo lo personal. |
| Respuestas de los servicios de la NASA | En el navegador. No se guardan nunca en la base. |

### Modo sin conexión

- **La interfaz:** un service worker guarda la app, las imágenes que se van viendo y la evidencia de los eventos. La app tiene que haberse abierto una vez con conexión. Se puede instalar en el celular o en la compu.
- **Lo que respondió el backend:** cada lectura de lotes, ejemplos y pasaportes queda copiada a nombre de quien la pidió. Si no se llega al backend, se muestra la última copia. Un error real (por ejemplo, un lote que no existe o un pasaporte vencido) nunca se tapa con una copia vieja.
- **Lo de la NASA:** sin red se usa la copia, aunque esté vencida, con el aviso "Copia guardada: no se pudo actualizar". Sin copia, el motivo es "Sin conexión y sin una copia guardada en este dispositivo". Cuando vuelve la red, la pestaña Satélite vuelve a pedir sola.
- **Marcar un lote sin red:** queda en una cola del dispositivo y se sube solo cuando vuelve la conexión. En Mi campo se ve como "Sin sincronizar", sin lupa. El encabezado muestra los lotes por sincronizar y "Sincronizar ahora". Si el backend rechaza uno, queda "Rechazado" con el motivo.
- **Necesitan red:** ingresar, crear la cuenta, "Tus datos", declarar el uso del suelo y la adhesión a BPA, Confirmar y Corregir, compartir el pasaporte, el Simulador, el simulador de Cuenca y Caudal, el precio de Rofex y el buscador.
- **El chip de conexión** del encabezado dice "Conectando…", "Conectado", "Sin conexión con el servidor" o "Sin conexión a internet", y agrega "mostrando datos guardados del …" cuando lo que se ve es una copia.

La demo está publicada en https://lotestigo.1mj0t4h.workers.dev: un Worker de Cloudflare sirve la app y reenvía la API al backend Django en Railway, con PostgreSQL. Ni la app ni los pasaportes aparecen en buscadores. El detalle está en el [README](README.md#despliegue).

## 7. Preguntas frecuentes del jurado

### ¿Qué es NISAR y por qué banda L?

NISAR es un radar de la NASA y la ISRO. Manda su propia señal y mide el eco que vuelve del suelo, así que ve a través de las nubes. La banda L atraviesa la canopia de los cultivos bajos. Con sus dos polarizaciones, una baja de HH se lee como un cambio de rugosidad del suelo (sembradora o labranza), y una suba de HV, como la estructura del cultivo que crece. Que el radar la vea antes que el óptico es una hipótesis del equipo, sin confirmar en campo.

### ¿Qué tan preciso es?

No está medido: la detección es una prueba de concepto sin validar en campo. El umbral (hoy 1,03 dB) y los lotes de referencia son una propuesta del equipo, y por eso cada evento lleva la confianza "Sin dato". Los datos en vivo tienen la resolución de su fuente: MODIS mira en píxeles de 5 a 21 ha y POWER describe una zona de unos 50 km.

### ¿Los datos son reales?

Sí. Las escenas de NISAR y HLS de los lotes de ejemplo son reales, y lo de la pestaña Satélite se pide en vivo a la NASA para cada polígono. Los lotes de ejemplo son cuatro campos reales de Casilda, dibujados por el equipo sobre una imagen Sentinel-2, sin titular ni RENSPA. Lo que no es satelital (factores, rindes de referencia) cita su fuente.

### ¿Qué es simulado?

Hoy, nada de los lotes de ejemplo: la siembra del Lote 3 no es simulada. Un dato simulado llevaría `is_simulated: true` en la base y la leyenda "Dato simulado para la demostración". El Simulador de la Huella es otra cosa: calcula un "después" hipotético y no guarda nada.

### ¿Por qué no es una certificación?

Porque la huella es una estimación con respaldo satelital, no una calculadora auditada, con factores promedio de EE.UU. y del IPCC. El puntaje es una regla del equipo, no una norma. No reemplaza a VISEC, RTRS ni 2BSvs.

### ¿Funciona sin internet?

En parte. Lo que ya se abrió con conexión en ese dispositivo se ve sin red, con un aviso de copia guardada, y un lote marcado sin señal queda en cola y se sube solo. Ingresar, crear la cuenta, declarar datos, compartir el pasaporte y el Simulador necesitan red.

### ¿Los datos son privados?

Cada lote lo ve solo su dueño: un lote ajeno responde igual que uno que no existe. Se comparte solo si el dueño genera un pasaporte, que ve cualquiera con el enlace. Privado quiere decir frente a otros usuarios: quien administra la base puede ver los datos.

### ¿Qué datos se mandan afuera?

El navegador manda las coordenadas o el polígono del lote a NASA POWER, ORNL DAAC y CMR para pedir sus datos, pide las imágenes del mapa a Esri y OpenStreetMap y manda a Nominatim el texto que se busca. A ninguno le manda la cuenta ni el token. El precio de Rofex lo pide el backend, solo con el contrato.

### ¿Cómo escala?

Los datos en vivo los pide cada navegador directo a la NASA, sin pasar por el backend, y quedan guardados en el dispositivo. Los lotes vecinos comparten pedidos. El pipeline lee solo la ventana de cada lote, sin bajar escenas completas. Lo que hoy no escala: el pipeline se corre a mano, solo para los 4 lotes de ejemplo, y los lotes de los productores no reciben eventos.

### ¿Qué falta para producción?

Validar en campo la detección y su umbral, y detectar los otros tipos de evento. Correr el pipeline para los lotes de los productores. Factores locales, carbono del suelo y un factor para el cambio de uso. Que Rentabilidad y Fertilización se guarden en el servidor. Medir caudales para validar Cuenca y Caudal y procesar otras zonas. El límite oficial de cada planta urbana y un registro de BPA consultable. Anular pasaportes, editar y borrar lotes, recuperar la contraseña y borrar la cuenta.

### ¿En qué se diferencia de otras plataformas?

Las plataformas existentes calculan con lo que declara el productor. La idea de LoTestigo es registrar lo que se observó desde el espacio, con o sin nubes, y que el productor confirme o corrija. Hoy es una prueba de concepto con un solo evento detectado.

### ¿La imagen sobre la que se marca el lote es de la NASA?

No. Es Esri World Imagery (Esri, Maxar, Earthstar Geographics), igual que la vista "Satélite" de Mi campo y el mapa de ambientes. Lo de la NASA va encima: el NDVI de MODIS, el clima de POWER y las pasadas de NISAR y HLS. La foto de la página de inicio sí sale de la NASA (GIBS, HLS Landsat).

### ¿Por qué el verdor en vivo es de MODIS (250 m) y no de HLS (30 m)?

Porque el navegador solo usa servicios que no piden login, y el ORNL DAAC entrega MODIS ya recortado así. El NDVI de HLS necesita leer los archivos con una cuenta de Earthdata, y eso se hace en el pipeline.

### ¿Por qué la huella dice "Todavía no se puede calcular"?

Porque falta algún componente o el rinde, y la app no suma totales parciales: sumar solo lo que hay subestimaría la huella. Los lotes de ejemplo no llegan a un total. En un lote propio se completa con el nitrógeno, el fósforo y el gasoil en "Tus datos" y "No cambié el uso" en Prácticas.

### ¿Sumar un cultivo de cobertura baja la huella?

No en este modelo. El carbono del suelo no está modelado, porque no hay un factor con fuente. La cobertura solo suma los 20 puntos de su criterio en el puntaje.

### ¿Por qué cada práctica vale 20 puntos?

Es una decisión del equipo: pesos iguales, la regla más simple y transparente. No sale de una fuente, y por eso el puntaje se muestra como provisional.

### ¿NASA POWER mide el lote?

No. Es un modelo de reanálisis en una grilla de unos 50 km que describe la zona. Por eso la lluvia y la humedad del suelo llevan ESTIMADO. La humedad es la del modelo, no la del satélite SMAP.

### ¿Qué es el NDVI?

Un índice de verdor que sale de la luz roja y del infrarrojo cercano: (NIR − Rojo) ÷ (NIR + Rojo). En la app va de 0 a 1: cuanto más alto, más verde.

### ¿La dosis variable es una recomendación?

No. La dosis la escribe el productor. La app arma los ambientes por NDVI, multiplica por las hectáreas y compara con la dosis uniforme. No usa análisis de suelo ni rinde objetivo, y no exporta un mapa para la máquina.

### ¿Detecta quemas, cosechas o anegamientos?

Todavía no. El modelo admite esos tipos de evento, pero hoy el pipeline solo registra siembras con NISAR. FIRMS, VIIRS y Sentinel-1 figuran como fuentes previstas, pero ningún código los consulta.

### ¿Qué pasa si el satélite se equivoca?

El dueño puede corregir el tipo, la fecha o el margen de un evento de su lote o, si es ESTIMADO, confirmarlo. Pasa a DECLARADO y se conservan el sensor y la evidencia originales. Hoy no se puede mostrar en vivo, porque el único evento está en un lote de ejemplo.

### ¿Por qué el Lote 3 es maíz?

El cultivo no se observó. El pipeline asigna maíz a toda siembra detectada, sin mirar la fecha. En este caso coincide con el calendario regional: en la Zona Núcleo, una siembra a principios de septiembre suele ser maíz temprano. Por eso dice ESTIMADO.

### ¿Por qué tarda?

El ORNL DAAC, que entrega MODIS, tarda cerca de un minuto por pedido, y el historial desde 2020 puede tardar varios minutos. Lo que llega queda guardado en el dispositivo.

### ¿El productor tiene que cargar todo?

No. Alcanza con el perímetro. Lo que no carga se completa con referencias marcadas como ESTIMADO o queda "Sin dato".

### ¿Cuenta la declaración del productor?

Sí. "No cambié el uso" o "Sí, hubo un cambio", en la pestaña Prácticas, cuenta en el puntaje (criterio "Sin cambio de uso del suelo desde 2020") y en la huella (componente de cambio de uso), con origen DECLARADO. Si la bitácora tiene un cambio de uso detectado por satélite, manda el evento. No se verifica: solo se compara con lo que vio MODIS, que es orientativo y no entra en la cuenta. La adhesión a BPA también es una declaración, que no se verifica contra ningún registro.

### ¿Qué son los chequeos territoriales?

Son cruces indicativos del lote con capas públicas, en la pestaña Prácticas. Distancia a zonas urbanas: qué parte del lote cae a menos de 500 m (terrestre) o 3.000 m (aérea) del área urbana, donde la Ley 11.273 de Santa Fe restringe los fitosanitarios de clase A y B. Bosque nativo: si el lote se superpone con las categorías I o II del OTBN, que no admiten desmonte. BPA: lo que declaró el productor. No son un dictamen legal ni una auditoría.

### ¿De dónde salen las capas territoriales?

El OTBN es la capa oficial de Santa Fe del Ministerio de Ambiente de la Nación (IDE Ambiental), recortada al sur de la provincia. Las distancias son las de la Ley provincial 11.273, leídas en el texto oficial. Las áreas urbanas son aproximadas con OpenStreetMap, porque el límite oficial de la planta urbana no está publicado como capa. Las bajó el equipo el 15/11/2026 y viven en `data/layers/`.

### ¿Qué quiere decir "Posible desmonte"?

Que el lote se superpone con bosque nativo de categoría I o II y, además, la bitácora tiene un cambio de uso del suelo o el productor declaró uno. Es una alerta para revisar con la autoridad provincial, no una prueba.

### ¿De dónde sale el precio?

Del futuro de soja Rosario en Matba Rofex, en la posición mayo de la cosecha (para la campaña 2026/27, `SOJ.ROS/MAY27`). El backend lo pide con la API de Primary (pyRofex) y toma el precio de ajuste o, si no hay, el último operado o el de cierre. Es una sugerencia: queda ESTIMADO y, si el productor lo cambia, pasa a DECLARADO. Solo hay contrato para soja.

### ¿Por qué dice "Sin precio de Rofex" o "Precio de prueba"?

"Sin precio de Rofex" aparece si el servidor no tiene las credenciales de Matba Rofex o si Rofex falla o tarda más de 10 segundos. El precio se carga a mano igual. "Precio de prueba" aparece si el servidor está conectado al entorno de prueba reMarkets: el precio es simulado, no de mercado.

### ¿Qué es Cuenca y Caudal?

La séptima pestaña del lote. Con el relieve (Copernicus DEM de 30 m) y los canales de OpenStreetMap, arma la cuenca que aporta agua al lote, la acumulación de flujo y el índice de humedad (TWI). Con la lluvia de NASA IMERG estima cuánto escurrió en cada lluvia fuerte desde 2020, y tiene un simulador de lluvia hipotética. Está procesada solo para la zona del Lote 3 de Casilda, que incluye los cuatro lotes de ejemplo.

### ¿Qué tan confiable es el caudal?

No está validado: en esa cuenca no hay caudales ni niveles medidos. Es un modelo físico con métodos de USDA (número de curva y hidrograma unitario) pensados para cuencas de EE.UU. En la llanura, el error del DEM es del orden de los desniveles, y el factor de pico 484 probablemente sobreestima el caudal. La pantalla lo dice arriba.

### ¿Por qué el mapa de ambientes tiene partes más claras?

Son píxeles mixtos: más de la mitad del cuadro de 250 m queda fuera del lote, así que su NDVI refleja sobre todo lo de alrededor y su ambiente es menos seguro. El paso suave de un color a otro es solo visual: las hectáreas salen de cada cuadro.

### ¿Dónde está la ayuda?

En el botón "?" de la barra de la app y del encabezado del popup del lote, que abre la guía "Cómo cargar tus datos" con imágenes. También está en `/ayuda`, sin cuenta.

## 8. Limitaciones conocidas

**Detección y bitácora**

- Es una prueba de concepto sin validar en campo. El umbral (3 desvíos), la regla de exclusión (5 desvíos absolutos medianos) y los lotes de referencia son una propuesta que el equipo todavía tiene que validar.
- Hay un solo evento en todo el sistema: la siembra del Lote 3. Ningún script detecta cosechas, labranzas, coberturas, anegamientos, quemas ni cambios de uso.
- El código registra como siembra cualquier detección. Pudo haber sido una labranza previa.
- 9 de las 10 escenas NISAR son *provisional*. Se mezcla una sola *validated*, al final de la serie.
- Los lotes de los productores no reciben eventos: `import_events` solo crea lotes de ejemplo.
- Los resultados intermedios del pipeline no están en el repositorio. Recalcular los números necesita volver a correrlo con una cuenta de Earthdata.

**Huella y puntaje**

- Los factores son promedios de EE.UU. y valores por defecto del IPCC, no factores argentinos. Las dosis de referencia de semilla y fitosanitarios también son de EE.UU. Solo los rindes de referencia son de la Zona Núcleo.
- El alcance es parcial. El N2O es solo directo, sin las emisiones indirectas ni el N de los rastrojos. El gasoil cuenta solo la combustión y los fertilizantes llegan hasta la puerta de fábrica. No incluye el CO2 de la urea, ni el potasio, ni otros fertilizantes. El factor de herbicidas se usa para todos los fitosanitarios.
- El carbono del suelo no está modelado: la cobertura y la siembra directa no bajan la huella.
- El cambio de uso no tiene factor: con un evento de cambio de uso, la huella queda "Sin dato". El cultivo "Otro" no tiene factor de semilla, así que su huella nunca se calcula.
- Los lotes de ejemplo no llegan a una huella total y ningún lote llega a un puntaje numérico. Un lote propio llega a una huella total gracias a la declaración de uso del suelo, que no se verifica.
- Los criterios de la bitácora se apoyan en la ausencia de eventos, que es una inferencia. Salvo el cambio de uso, no filtran por fecha ni por campaña. La cobertura no se verifica como invernal y la rotación solo mira si hubo más de un cultivo.
- El Simulador solo prueba la cobertura, y su evento hipotético no cuenta como bitácora.

**Uso del suelo**

- La declaración del productor cuenta en el puntaje y en la huella sin verificarse: solo se compara con MODIS, que es orientativo. Un evento de cambio de uso de la bitácora la pisa.
- MODIS es orientativo: cada píxel cubre unas 21 ha y mezcla el lote con lo que lo rodea. Un "No coincide" puede ser un error de clasificación, no una prueba de desmonte. El último mapa es el de 2025.

**Fertilización**

- Los ambientes salen de un solo compuesto de 16 días. Si cae en barbecho o con el cultivo recién nacido, muestran la cobertura de ese momento, no la productividad del suelo.
- Son tercios del rango, no grupos con la misma cantidad de píxeles, y no hay una diferencia mínima: un rango de 0,60 a 0,61 también se parte en tres. Un píxel raro (un camino, un monte o un borde) estira el rango.
- Los píxeles mixtos (menos de la mitad adentro) entran en los ambientes con su NDVI, que mezcla el borde con lo de alrededor. Se marcan más claros, pero no se descartan. Si el último compuesto tiene 1 o 2 píxeles válidos por nubes, no se buscan compuestos anteriores.
- Las emisiones son parciales: el factor de producción es un promedio de EE.UU. que no distingue entre fertilizantes (urea, UAN o MAP), y el N2O es solo directo. Se dan en kg CO2e del lote entero, no por hectárea ni por tonelada.
- La dosis uniforme siempre sale de la última campaña. En los lotes de ejemplo siempre dice "Sin dato", porque ahí no se puede declarar.

**Rentabilidad**

- Es el margen bruto, no el resultado neto: no incluye gastos de estructura, impuestos, retenciones, intereses ni amortizaciones, salvo que se sumen en "Otros costos". Todo va en dólares, sin tipo de cambio. El único precio de mercado es el sugerido de Rofex: solo para soja y solo si el servidor tiene las credenciales.
- No se conecta con Fertilización: el costo de fertilizantes se escribe a mano.
- La carga no acepta puntos de miles: "1.200" se lee como 1,2. Hay que escribir 1200.
- Si el rinde escrito en Rentabilidad difiere del de la huella, "Margen y huella" escala la huella con ese rinde.
- La superficie es la de todo el polígono, con las partes no productivas incluidas.

**Chequeos territoriales**

- Son indicativos. Las áreas urbanas son una aproximación con OpenStreetMap, no el límite legal de la planta urbana. Se aplica la ley provincial, sin ordenanzas municipales ni fallos judiciales que fijaron distancias mayores.
- Las capas cubren solo el sur de Santa Fe y seis localidades. Fuera de eso, el chequeo dice "Sin dato".
- BPA es solo lo declarado: no hay un registro oficial consultable.

**Cuenca y Caudal**

- Solo está procesada la zona del Lote 3. Fuera de ella, la pestaña muestra un aviso.
- No hay caudales medidos para validar. El DEM de 30 m tiene un error del orden de los desniveles de la llanura, y los caminos, terraplenes y alcantarillas que no están en OpenStreetMap no están en el modelo.
- IMERG tiene celdas de unos 10 km y su versión Late es preliminar. El factor de pico 484 probablemente sobreestima el caudal en la llanura.

**Datos en el dispositivo, cuentas y pasaporte**

- Rentabilidad y Fertilización viven solo en el navegador donde se cargaron. No pasan a otro dispositivo ni al pasaporte, y se borran al salir de la cuenta.
- El token no vence y vive en el navegador. Salir en un dispositivo cierra la sesión en todos.
- El límite de intentos de ingreso se cuenta en la memoria de cada proceso del backend y se reinicia en cada arranque.
- El pasaporte no vence y la interfaz no tiene cómo anularlo. Compartir de nuevo en otra visita al lote crea otro enlace, y los anteriores siguen andando. Muestra el polígono exacto, el nombre, la localidad, la provincia y el RENSPA si se cargó.
- Un lote guardado no se puede editar, redibujar ni borrar.
- La copia de los datos de la NASA no se separa por usuario ni se borra al salir.
- Sin conexión solo se ve lo que ya se abrió con conexión en ese dispositivo. Las imágenes de Esri no se guardan: marcar un lote sin señal solo funciona si el navegador ya las tenía.

**Datos en vivo**

- El ORNL DAAC es lento y a veces corta a los 60 s. El historial desde 2020 puede tardar varios minutos.
- La app no descarga ni analiza en vivo las escenas de NISAR o HLS: solo lista lo que informa el catálogo. Lista también órbitas que el pipeline no procesó.
- La nubosidad de HLS es la de toda la escena: "Última despejada" no garantiza que el lote estuviera despejado.
- POWER publica los últimos días con demora. La temperatura se pide, pero no se muestra.
