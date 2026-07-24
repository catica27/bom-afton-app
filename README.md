# BOM Afton — Costeo de Lubricantes

Aplicación web local que reemplaza el Excel `BOM Afton nuevos Aditivos 2026.xlsx`: catálogo de materias primas, fórmulas de producto, costos indirectos, empaque, márgenes y precio final por presentación — todo editable desde la interfaz, con recálculo en vivo y trazabilidad de cambios.

Ver [ANALISIS_EXCEL.md](ANALISIS_EXCEL.md) para el mapeo detallado del Excel original y la lógica de costeo replicada.

## Cómo abrir la app

**Opción recomendada — abrir directamente:**
Haz doble clic en [`index.html`](index.html) y ábrelo con Chrome o Edge. No necesita instalación ni servidor: los datos migrados del Excel ya están incluidos (`data/seed.js`) y se cargan en IndexedDB (almacenamiento del navegador) la primera vez que abres la app.

**Si tu navegador bloquea algo al abrir por `file://`:** levanta un servidor local simple desde esta carpeta y abre `http://localhost:PUERTO/`. Con PowerShell (Windows, sin instalar nada extra):
```powershell
powershell -File scripts\serve.ps1
```
o, si tienes Python o Node instalados:
```bash
python -m http.server 8420
# o
npx serve .
```

## Estructura del proyecto

```
index.html              Shell de la app (carga todos los scripts en orden)
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

## Backup y restauración

- **Importar/Exportar → Descargar backup JSON**: descarga un archivo con todo (materias primas, fórmulas, costos, márgenes, historial). Guárdalo periódicamente — es tu respaldo fuera del navegador.
- **Importar/Exportar → Restaurar backup**: sube ese archivo para reemplazar todos los datos actuales (pide confirmación porque es destructivo).
- **Importar/Exportar → Reimportar Excel original**: si el `.xlsx` fuente cambia (nueva versión de materias primas o fórmulas), puedes volver a subirlo ahí mismo — reemplaza materias primas/fórmulas/costos/márgenes leyendo las hojas `Fms` y `Principal`, conservando el historial de cambios.
- Los datos viven en IndexedDB del navegador. Si limpias los datos del navegador (o usas otro navegador/perfil), pierdes lo que no hayas respaldado en JSON.

## Notas importantes

- **19 de 25 fórmulas del Excel original no suman exactamente 100%** (ver sección 4bis de ANALISIS_EXCEL.md) — la app lo señala con una advertencia visual en cada producto afectado; no se alteraron los porcentajes originales.
- La hoja `EMA Pricing` del Excel (benchmarking de precios, catálogo y lógica de margen distintos, con fórmulas rotas) se excluyó de la migración, según lo acordado.
- El empaque se modela de forma simplificada (envase + "otros" prorrateado) en vez de replicar la fórmula exacta de reparto por tarima del Excel — el total por presentación coincide con el original.
