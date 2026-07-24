# BOM Afton — Costeo de Lubricantes

Aplicación web que reemplaza el Excel `BOM Afton nuevos Aditivos 2026.xlsx`: catálogo de materias primas, fórmulas de producto, costos indirectos, empaque, márgenes y precio final por presentación — todo editable desde la interfaz, con recálculo en vivo y trazabilidad de cambios. Instalable como app (PWA) en Windows, Android e iOS/iPadOS, con soporte offline.

**App en vivo:** https://catica27.github.io/bom-afton-app/

Ver [ANALISIS_EXCEL.md](ANALISIS_EXCEL.md) para el mapeo detallado del Excel original y la lógica de costeo replicada.

## Cómo abrir la app

**Opción recomendada — la URL en vivo:** https://catica27.github.io/bom-afton-app/ — funciona en cualquier navegador, no necesita instalación, y se puede instalar como app (ver sección de abajo). El Service Worker que permite el uso offline **solo funciona sobre HTTPS o `localhost`**, así que esta es la única forma de tener la app instalable y disponible sin conexión.

**Abrir directamente desde el disco (sin instalar, sin PWA):**
Haz doble clic en [`index.html`](index.html) y ábrelo con Chrome o Edge. Los datos migrados del Excel ya están incluidos (`data/seed.js`) y se cargan en IndexedDB (almacenamiento del navegador) la primera vez que abres la app. El Service Worker no se activa por `file://` (limitación del navegador, no de la app), así que esta opción no funciona offline ni es instalable — para eso usa la URL en vivo o el servidor local de abajo.

**Servidor local (para desarrollo/pruebas, sí habilita PWA vía `localhost`):**
```powershell
powershell -File scripts\serve.ps1
```
o, si tienes Python o Node instalados:
```bash
python -m http.server 8420
# o
npx serve .
```

## Instalar como app

Entra a **https://catica27.github.io/bom-afton-app/** desde el dispositivo donde quieras instalarla:

**Windows (Edge o Chrome):**
1. Abre la URL en el navegador.
2. Haz clic en el ícono de "Instalar" (⊕ o una pantalla con flecha) en la barra de direcciones, a la derecha.
3. Confirma "Instalar". Queda como app de escritorio, con su propio ícono y ventana, y funciona sin conexión.

**Android (Chrome):**
1. Abre la URL.
2. Chrome muestra un banner "Agregar a pantalla de inicio" (o ve al menú ⋮ → "Instalar app" / "Agregar a pantalla de inicio").
3. Confirma. Queda un ícono en el launcher como cualquier otra app.

**iOS / iPadOS (obligatorio usar Safari — Chrome en iOS no puede instalar PWAs):**
1. Abre la URL en **Safari**.
2. Toca el botón "Compartir" (el cuadrado con flecha hacia arriba).
3. Baja y toca **"Agregar a pantalla de inicio"**.
4. Confirma el nombre y toca "Agregar". No hay instalación automática ni banner — este paso manual es la única forma en iOS.

**Importante para iOS:** Safari puede borrar los datos guardados (IndexedDB) de una PWA si no se abre por un tiempo prolongado (política de borrado por inactividad de Apple). Por eso el backup en JSON (**Importar/Exportar → Descargar backup JSON**) no es opcional en iOS — es la única red de seguridad. Haz un backup después de cargar datos importantes y guárdalo fuera de la app (correo, nube, etc.).

## Desplegar cambios futuros

El repo tiene un workflow de GitHub Actions (`.github/workflows/deploy.yml`) que publica automáticamente en GitHub Pages cada vez que se hace push a `main`. Para publicar un cambio:

```bash
git add -A
git commit -m "Describe el cambio"
git push
```

Eso dispara el workflow "Deploy to GitHub Pages" — revísalo en **https://github.com/catica27/bom-afton-app/actions**. Tarda entre 15 y 30 segundos, y la URL en vivo se actualiza sola al terminar.

**Si cambias archivos del app shell (HTML/CSS/JS/íconos)** y quieres que los usuarios que ya instalaron la PWA reciban la versión nueva, sube el número en `sw.js`:
```js
const CACHE_VERSION = "v2"; // subir en cada release que cambie archivos del shell
```
Con `cache-first`, un Service Worker no vuelve a pedir un archivo ya cacheado hasta que cambia el nombre de la caché — subir `CACHE_VERSION` fuerza la actualización.

## Estructura del proyecto

```
index.html              Shell de la app (carga todos los scripts en orden)
manifest.webmanifest     Manifest de la PWA (nombre, íconos, colores, display standalone)
sw.js                    Service Worker (cache-first del app shell, habilita uso offline)
icons/                   Íconos de la PWA (192, 512, 512 maskable, apple-touch-icon, favicon)
.github/workflows/deploy.yml  Publica en GitHub Pages automáticamente en cada push a main
data/seed.json           Datos migrados del Excel (legible, para inspección)
data/seed.js              Mismos datos envueltos como script clásico (lo que carga la app)
src/calc-engine.js        Motor de cálculo puro (sin dependencias) — ver tests
src/calc-engine.test.js   Tests unitarios del motor de cálculo
src/db.js                 Capa de IndexedDB
src/seed-loader.js        Carga/reimporta datos "crudos" (forma de seed.json) a IndexedDB
src/store.js              Estado reactivo en memoria + historial + snapshots de costo
src/excel-import.js        Reimportar el Excel original desde el navegador (SheetJS)
src/import-export.js       Backup JSON, exportar a Excel/CSV
src/router.js              Router por hash
src/views/*.js             Una vista por pantalla (dashboard, materias primas, producto, etc.)
vendor/                    SheetJS y Chart.js (empaquetados localmente, sin CDN)
scripts/migrate.ps1        Script de migración Excel → seed.json/seed.js (PowerShell + Excel COM)
scripts/serve.ps1          Servidor estático simple para pruebas locales
test-runner.html           Corre los tests unitarios del motor de cálculo en el navegador
```

No hay paso de `npm run build`: todo es HTML/CSS/JS plano (scripts clásicos, no ES modules) para que abrir `index.html` funcione en cualquier navegador sin bloqueos de CORS entre archivos `file://`.

## Correr los tests del motor de cálculo

Abre [`test-runner.html`](test-runner.html) en el navegador (o `http://localhost:PUERTO/test-runner.html` si usas el servidor). Corre 50 casos: cálculo de materia prima (aceites base y aditivos), costos indirectos, empaque, margen, detección de fórmula que no suma 100%, y verificación cruzada contra 6 productos reales del Excel (30 combinaciones producto×presentación) con tolerancia de centavos.

## Verificación de la PWA

Se verificó manualmente en la URL en vivo (HTTPS) cada requisito de instalabilidad: manifest válido con el content-type correcto, íconos 192/512/512-maskable/apple-touch-icon accesibles (200), Service Worker registrado y activo con el scope correcto, y la app cargando completa **con el servidor apagado** (offline real, sin caché de navegador de por medio). No se pudo correr la auditoría de Lighthouse de Chrome DevTools en este entorno (sin acceso a la UI de DevTools ni al CLI de `lighthouse`) — si quieres el puntaje formal, abre `chrome://lighthouse` o el panel Lighthouse de DevTools sobre la URL en vivo y corre la categoría "PWA"; con los puntos ya verificados arriba, debería pasar sin hallazgos de instalabilidad.

## Backup y restauración

- **Importar/Exportar → Descargar backup JSON**: descarga un archivo con todo (materias primas, fórmulas, costos, márgenes, historial). Guárdalo periódicamente — es tu respaldo fuera del navegador.
- **Importar/Exportar → Restaurar backup**: sube ese archivo para reemplazar todos los datos actuales (pide confirmación porque es destructivo).
- **Importar/Exportar → Reimportar Excel original**: si el `.xlsx` fuente cambia (nueva versión de materias primas o fórmulas), puedes volver a subirlo ahí mismo — reemplaza materias primas/fórmulas/costos/márgenes leyendo las hojas `Fms` y `Principal`, conservando el historial de cambios.
- Los datos viven en IndexedDB del navegador. Si limpias los datos del navegador (o usas otro navegador/perfil), pierdes lo que no hayas respaldado en JSON.

## Notas importantes

- **19 de 25 fórmulas del Excel original no suman exactamente 100%** (ver sección 4bis de ANALISIS_EXCEL.md) — la app lo señala con una advertencia visual en cada producto afectado; no se alteraron los porcentajes originales.
- La hoja `EMA Pricing` del Excel (benchmarking de precios, catálogo y lógica de margen distintos, con fórmulas rotas) se excluyó de la migración, según lo acordado.
- El empaque se modela de forma simplificada (envase + "otros" prorrateado) en vez de replicar la fórmula exacta de reparto por tarima del Excel — el total por presentación coincide con el original.
