# Análisis de `BOM Afton nuevos Aditivos 2026.xlsx`

Análisis realizado inspeccionando el archivo original con Excel COM automation (no había Python/Node instalados en la máquina, así que se usó PowerShell + Excel para leer valores y fórmulas celda por celda). Última actualización del archivo: **22/07/2026, versión 18** (celda `Principal!D4`/`D5`).

## 1. Mapa de hojas

| Hoja | Rol | Núcleo del costeo |
|---|---|---|
| **Fms** | Motor de cálculo real. Cada producto (26 fórmulas base) ocupa 4 columnas (Estañón/Cubeta/Galón/Cuarto — a veces menos). Filas = materias primas con su % de dosificación, más filas calculadas de peso, volumen, densidad, costo. | ✅ Sí — es la fuente de verdad |
| **Principal** | Panel de configuración + tablero de resultados. Contiene las tarifas de costos indirectos, empaque, precios de materias primas, factores de margen, y tablas de resultados por familia de producto (que solo hacen `HLOOKUP` a `Fms`). | ✅ Sí — aquí viven los parámetros configurables |
| **Listado** | Lista plana de todos los productos con Código/Costo/Precio — es un espejo de `Principal` (mismos valores, vía referencia directa). | Solo lectura/reporte |
| **Precio actualizado** | Lista de precios por familia (PCMO's, HDEO's, AGO's&ATF's, TO-4's, Hy's&THF), fecha 05/01/2026 — **desactualizada respecto a Principal (22/07/2026)**, son valores pegados, no fórmulas vivas. | Solo lectura/reporte, con drift de fecha |
| **EMA Pricing** | Hoja de benchmarking de precios FOB competencia (referencias "55GA") con margen objetivo ~25-33%. **No usa los mismos códigos de producto** que Fms/Principal, y tiene celdas rotas (`#REF!`, `#VALUE!`) por referencias perdidas. | ❌ No — es un análisis paralelo, no alimenta el costeo de Fms |
| Demand by Product, AFton-Base Oil (AV/SK), BAse Oil purchase, First order guide, Amount to purchase | Planeación de demanda y compras 2023, mayoría con `#REF!`. | ❌ Fuera de alcance — logística/compras, no costeo |

**Decisión:** la app se construye a partir de `Fms` + `Principal`. `Listado` y `Precio actualizado` se usan solo para la verificación final (paso 6). `EMA Pricing` y las hojas de demanda/compra quedan fuera del alcance (documentado, no se migran).

## 2. Lógica de costeo confirmada celda por celda

Verifiqué la fórmula exacta en `Fms` (ejemplo: producto "5W-20 SP", columna Estañón = C):

```
Fms!C63 (Total reactivos) = SUM(C42:C45)*C28 + SUM(C46:C62)*C28*C32
                             └─ aceites base ─┘  └─ aditivos ────────┘
donde:
  C28 = volumen de la presentación (L)     → Fms!fila 28 "Volumen x presentación"
  C32 = densidad del producto (kg/L)       → Fms!fila 32 "Densidad"
  C42:C45 = Σ(%aceite_i × $/L_i)           → filas "Costo unitario" × % (fila 5-9 aprox.)
  C46:C62 = Σ(%aditivo_i × $/kg_i)         → ídem para aditivos
```

Esto es **exactamente** la lógica descrita en el prompt:
- `costo_aceites_base = Σ(%_i × $/L_i) × volumen_L`
- `costo_aditivos = Σ(%_i × $/kg_i) × volumen_L × densidad_kg/L`
- Los aditivos SÍ requieren el factor de densidad (dosificados en peso); los aceites base NO (dosificados en volumen). Confirmado numéricamente: `HiTEC 11455 (7.00% × $6.93/kg = $0.485/L)` sin densidad, pero al multiplicar por volumen×densidad en el total sí se aplica correctamente.

**Costo total por presentación** (`Fms!C66 "Actualizado"`):
```
Fms!C66 = Fms!C63 (materia prima) + Principal!$E$201 (indirectos + empaque, ya sumados, para Estañón)
```
Es decir: **el costo de indirectos+empaque es GLOBAL por tipo de presentación, no varía por producto.** Todos los productos que se venden en "Estañón" cargan la misma tarifa indirecta+empaque; solo cambia el costo de materia prima según la fórmula.

**Costos indirectos** (`Principal` filas ~37-44, tabla `$/L`):
```
total_indirecto_presentación = Σ(tarifa_$/L_rubro × volumen_L_presentación)
Rubros: Consumo Energía, Agua, Alquiler, Depreciación, Mano de obra
Tarifas actuales: 0.0124, 0.004, 0.0628, 0.0374, 0.1282 $/L → total 0.2448 $/L
Presentaciones con volumen definido: Cuarto (0.946L), Galón (3.785L), Cubeta (18.927L), Estañón (208.17L)
⚠️ NO hay tarifa definida para "Tote" ni para "Tanqueta" (1000L, usado solo por UNITRAK THF) — vacío en el Excel.
```

**Empaque** (`Principal` filas ~68-85): por presentación, ya viene pre-calculado sumando envase unitario + prorrateo de tarima (según cuántas unidades caben por tarima: 4 estañones, 36 cubetas, 216 galones, 1296 cuartos) + cajas + cinta + etiquetas. Ejemplo Estañón: `F68 = D68(envase) + D75(tarima)/4 + D77(etiqueta) + D82(fleje) + D83(esquinero) + D84(plástico)`.
Encontré una inconsistencia menor en el Excel: la fórmula de "Totes" reutiliza `D77` ("Etiquetas estañón") en vez de una etiqueta propia de Tote — parece un copy-paste, lo documento pero no lo "corrijo" sin confirmarlo con el usuario.

**Margen / Precio de venta** (`Principal!AE5` y `E135:E137`):
```
Precio = SI(origen_aceite_base = "BO local", Costo × 1.35, Costo × 1.20)
BO local → margen 35% (factor 1.35)
BO imp   → margen 20% (factor 1.20)
```
Coincide exactamente con lo descrito en el prompt. El origen (`BO local`/`BO imp`) está escrito manualmente por producto en `Principal`, no se deriva automáticamente de qué aceite base domina la fórmula — en la app lo haré configurable por producto, tal como pediste.

## 3. Datos maestros encontrados

**Aceites base (4)** — `Principal!B127:D130`, costo en $/L:
MetaPlus 120 ($1.00), MetaPlus 240 ($1.00), CHEMLUBE BS150 ($1.35), BASE OIL 600N group II ($1.92).

**Aditivos (17)** — `Principal!B159:F175`, con Costo/kg y Densidad: HiTEC 11455, HITEC 12220M, HiTEC 12161, HiTEC 12204, HiTEC 2260, HiTEC 2030, HiTEC 3421 DRUM, HiTEC 33321 DRUM, HiTEC 397 DRUM, HiTEC 8703, HiTEC 8888F DRUM, HiTEC 521F, HiTEC 3301 DRUM, HiTEC 008 DRUM, HiTEC 5754A, HiTEC 5748A, HITEC 672.
⚠️ `DYE` aparece en las fórmulas de `Fms` (fila 26, usado al 0.03% en un producto) pero **no tiene costo unitario** en la tabla de Principal — gap de datos del propio Excel, lo dejo con costo $0 y una advertencia visual en la app (falta costo de materia prima usada en una fórmula, tal como pediste en la sección de validaciones).

**Presentaciones (5)**: Cuarto (0.946L), Galón (3.785L), Cubeta (18.927L), Estañón (208.17L), y Tanqueta/Tote (~1000L, solo aparece en 1 producto, sin tarifas indirectas definidas).

**Familias de producto (8)**, cada una con varias fórmulas (26 fórmulas base × hasta 4 presentaciones = ~96 combinaciones producto×presentación):
Passenger Car Motor Oil (PCMO), Heavy Duty Engines Oil (HDEO), Motorcycle Oil (4T), Transmission Oil (TO-4), Hydraulic Oil (AW), Truck Hydraulic Fluid (THF), Automatic Transmission Oil (ATF/PSF), Gear Oil (GL4/GL5).

## 4. Discrepancias / decisiones de diseño a confirmar contigo

1. **`EMA Pricing`** usa una lista de productos y una lógica de margen (~25-33% objetivo, benchmarking contra FOB competencia) totalmente distinta y con fórmulas rotas. Propongo **no migrarla** como catálogo activo — la dejo fuera, ¿de acuerdo?
2. **Tote/Tanqueta** no tiene tarifas de costos indirectos definidas en el Excel. La app lo mostrará con una advertencia ("falta tarifa de costo indirecto para esta presentación") en vez de inventar un número.
3. **Empaque**: en vez de replicar la fórmula exacta de "unidades por tarima" (divisor 4/36/216/1296), voy a modelarlo como una lista editable de rubros **por presentación** con el total ya calculado igual al Excel (mismo resultado, estructura más simple de editar). Si prefieres que sea exactamente igual a Excel (con el prorrateo por tarima como una regla explícita), dímelo y lo ajusto.
4. **Origen del aceite base por producto** (BO local/imp, que determina el margen) lo migro tal cual está escrito manualmente en `Principal`, y lo dejo editable — no lo derivo automáticamente de la fórmula.
5. **`DYE`** sin costo: lo migro con costo $0 y quedará marcado como materia prima con costo faltante.
6. Para la verificación final (paso 6 del plan) usaré `Listado` como referencia (está sincronizado con `Principal` a la fecha 22/07/2026), no `Precio actualizado` (desactualizada al 05/01/2026).

## 4bis. Hallazgo post-implementación: fórmulas que no suman 100%

Con el motor de validación ya construido y los 25 productos cargados, la app detecta que **19 de 25 fórmulas (76%) no suman exactamente 100%** — siempre por encima, nunca por debajo, típicamente entre 100.66% y 101.56%. Ejemplos: 5W-20 SP suma 100.83%, 15W-40 CK-4 suma 101.53%, 75W-90 GL-4 suma 101.19%.

Que la desviación sea sistemáticamente positiva y de magnitud similar en casi todos los productos (no aleatoria) sugiere que el % de aceite base nunca se recalculó como "balance a 100%" después de fijar los aditivos — es decir, es una imprecisión real y estructural del Excel de 18 versiones, no errores de tipeo aislados. Excel nunca lo marcó porque no tiene validación de suma en vivo; esta app sí. No alteré los porcentajes originales (eso requeriría decidir cuál ingrediente "absorbe" la diferencia, una decisión de formulación que te corresponde a ti): la app simplemente lo señala con una advertencia visual en cada producto afectado, tal como pediste.

## 5. Siguiente paso

Si confirmas este análisis (o me corriges algo), sigo con:
1. Script de migración (PowerShell + Excel COM) → `seed.json` con materias primas, presentaciones, fórmulas de las 26 recetas, costos indirectos, empaque y márgenes.
2. Motor de cálculo puro en JS + tests unitarios que reproduzcan estos mismos números.
3. La interfaz completa (catálogo, editor de fórmulas, dashboard, ficha de costo, comparador, import/export, historial).

## 6. Verificación final contra el Excel original

Se comparó el resultado de `calcularDesglose()` contra los valores de `Fms!fila 63/66` y `Listado` (que refleja exactamente `Principal`, verificado fecha 22/07/2026) para **6 productos × todas sus presentaciones comercializadas (25 combinaciones)**: 5W-20 SP, 20W-50 SP (BO imp, margen 20%), 15W-40 CK-4, 75W-90 GL-4, UNITRAK THF y AW 32. Casos automatizados en `src/calc-engine.test.js`, ejecutables en `test-runner.html`.

| Métrica | Resultado |
|---|---|
| Costo de materia prima | Coincide exacto (± $0.02, redondeo) — misma fórmula que `Fms!fila63` |
| Costo total de presentación | Coincide ± $0.05 — la única diferencia viene de modelar el empaque como "envase + otros" en vez de replicar el prorrateo exacto por tarima (decisión de diseño acordada) |
| Precio de venta | Coincide ± $0.10, arrastrando la misma diferencia de empaque |

No se encontraron discrepancias de fondo: el motor reproduce la lógica de costeo del Excel. La única fuente de diferencia (centavos) es deliberada y está documentada en la sección 4 (empaque simplificado). El hallazgo real y no trivial fue el de fórmulas que no suman 100% (sección 4bis), que no es un error de esta migración sino una característica preexistente del Excel que la nueva app ahora sí detecta.
