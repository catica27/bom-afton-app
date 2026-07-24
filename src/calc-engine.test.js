// Tests unitarios del motor de cálculo (sin dependencias externas).
// Se ejecutan en el navegador vía test-runner.html. Script clásico (no ES module):
// depende de que calc-engine.js ya se haya cargado y expuesto `window.CalcEngine`.
const {
  calcularDesglose,
  calcularCostoMateriaPrima,
  calcularCostosIndirectos,
  calcularEmpaque,
  validarSumaFormula,
  obtenerMargen,
} = CalcEngine;

// ---------- Fixtures compartidas (valores reales de Principal!) ----------
const materiasPrimas = [
  { id: "MetaPlus 120 Aceite Base", nombre: "MetaPlus 120 Aceite Base", categoria: "aceite_base", costoUnitario: 1.0 },
  { id: "MetaPlus 240 Aceite Base", nombre: "MetaPlus 240 Aceite Base", categoria: "aceite_base", costoUnitario: 1.0 },
  { id: "BASE OIL 600N (group II)", nombre: "BASE OIL 600N (group II)", categoria: "aceite_base", costoUnitario: 1.92 },
  { id: "HiTEC 11455 ADITIVO", nombre: "HiTEC 11455 ADITIVO", categoria: "aditivo", costoUnitario: 6.93 },
  { id: "HiTEC 5754A ADITIVO", nombre: "HiTEC 5754A ADITIVO", categoria: "aditivo", costoUnitario: 4.49 },
  { id: "HITEC 12220 M ADITIVO", nombre: "HITEC 12220 M ADITIVO", categoria: "aditivo", costoUnitario: 5.47 },
  { id: "HiTEC 5748A ADITIVO", nombre: "HiTEC 5748A ADITIVO", categoria: "aditivo", costoUnitario: 4.51 },
  { id: "HiTEC 008 DRUM ADITIVO", nombre: "HiTEC 008 DRUM ADITIVO", categoria: "aditivo", costoUnitario: 18.21 },
  { id: "HiTEC 33321 DRUM ADITIVO", nombre: "HiTEC 33321 DRUM ADITIVO", categoria: "aditivo", costoUnitario: 12.5 },
  { id: "HiTEC 3301 DRUM ADITIVO", nombre: "HiTEC 3301 DRUM ADITIVO", categoria: "aditivo", costoUnitario: 9.8 },
  { id: "HITEC 672 ADITIVO", nombre: "HITEC 672 ADITIVO", categoria: "aditivo", costoUnitario: 9.82 },
  { id: "HiTEC 8703 ADITIVO", nombre: "HiTEC 8703 ADITIVO", categoria: "aditivo", costoUnitario: 8.7 },
  { id: "HiTEC 521F ADITIVO", nombre: "HiTEC 521F ADITIVO", categoria: "aditivo", costoUnitario: 13.29 },
];
const materiasPrimasById = new Map(materiasPrimas.map((m) => [m.id, m]));

const costosIndirectos = [
  { nombre: "Consumo Energía", tarifaPorLitro: 0.0124 },
  { nombre: "Agua", tarifaPorLitro: 0.004 },
  { nombre: "Alquiler", tarifaPorLitro: 0.0628 },
  { nombre: "Depreciación", tarifaPorLitro: 0.0374 },
  { nombre: "Mano de obra", tarifaPorLitro: 0.1282 },
];

const empaquePorPresentacion = {
  Estañón: [
    { concepto: "Envase", costo: 46.09 },
    { concepto: "Otros", costo: 6.475 },
  ],
  Cubeta: [
    { concepto: "Envase", costo: 5.84 },
    { concepto: "Otros", costo: 1.3328 },
  ],
  Galón: [
    { concepto: "Envase", costo: 0.54 },
    { concepto: "Otros", costo: 1.1463 },
  ],
  Cuarto: [
    { concepto: "Envase", costo: 0.35 },
    { concepto: "Otros", costo: 0.9073 },
  ],
};

const margenes = [
  { criterio: "origenAceiteBase", valor: "BO local", factor: 1.35 },
  { criterio: "origenAceiteBase", valor: "BO imp", factor: 1.2 },
];

const presentaciones = {
  Estañón: { nombre: "Estañón", volumenL: 208.17 },
  Cubeta: { nombre: "Cubeta", volumenL: 18.927 },
  Galón: { nombre: "Galón", volumenL: 3.785 },
  Cuarto: { nombre: "Cuarto", volumenL: 0.946 },
};

function desglose(producto, presKey) {
  return calcularDesglose({
    producto,
    presentacion: presentaciones[presKey],
    materiasPrimasById,
    costosIndirectos,
    lineasEmpaque: empaquePorPresentacion[presKey],
    margenes,
  });
}

// ---------- Mini framework de test ----------
const results = [];
function test(nombre, fn) {
  try {
    fn();
    results.push({ nombre, ok: true });
  } catch (e) {
    results.push({ nombre, ok: false, error: e.message });
  }
}
function assertClose(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${msg}: esperado ${expected}, obtenido ${actual} (tolerancia ${tol})`);
  }
}
function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------- Casos unitarios de las funciones puras ----------

test("calcularCostoMateriaPrima: aceites base (dosificados en volumen, sin densidad)", () => {
  const producto = {
    densidadKgL: 0.854,
    ingredientes: [{ materiaPrimaId: "MetaPlus 120 Aceite Base", porcentaje: 1.0 }],
  };
  const r = calcularCostoMateriaPrima(producto, 100, materiasPrimasById);
  // 100% x $1.00/L x 100L = $100, sin factor de densidad
  assertClose(r.aceitesBase, 100, 0.001, "costo aceites base");
  assertClose(r.aditivos, 0, 0.001, "costo aditivos debe ser 0");
});

test("calcularCostoMateriaPrima: aditivos (dosificados en peso, con densidad)", () => {
  const producto = {
    densidadKgL: 0.854,
    ingredientes: [{ materiaPrimaId: "HiTEC 11455 ADITIVO", porcentaje: 0.07 }],
  };
  const r = calcularCostoMateriaPrima(producto, 208.17, materiasPrimasById);
  const esperado = 0.07 * 6.93 * 208.17 * 0.854;
  assertClose(r.aditivos, esperado, 0.01, "costo aditivos con densidad");
});

test("calcularCostosIndirectos: tarifa x volumen, sumado por rubro", () => {
  const r = calcularCostosIndirectos(costosIndirectos, 208.17);
  assertClose(r.subtotal, 0.2448 * 208.17, 0.05, "subtotal indirectos estañón");
});

test("calcularEmpaque: suma de líneas configurables", () => {
  const r = calcularEmpaque(empaquePorPresentacion.Cuarto);
  assertClose(r.subtotal, 1.2573, 0.001, "subtotal empaque cuarto");
});

test("validarSumaFormula: detecta fórmula que no suma 100%", () => {
  const v = validarSumaFormula([{ porcentaje: 0.5 }, { porcentaje: 0.3 }], 0.5);
  assertTrue(!v.valido, "80% debe marcarse inválido");
  assertClose(v.sumaPorcentaje, 80, 0.001, "suma reportada");
});

test("validarSumaFormula: acepta dentro de tolerancia configurable", () => {
  const v = validarSumaFormula([{ porcentaje: 0.997 }], 0.5);
  assertTrue(v.valido, "99.7% debe ser válido con tolerancia 0.5%");
});

test("obtenerMargen: BO local -> 1.35, BO imp -> 1.20", () => {
  assertClose(obtenerMargen({ origenAceiteBase: "BO local" }, margenes).factor, 1.35, 0, "margen local");
  assertClose(obtenerMargen({ origenAceiteBase: "BO imp" }, margenes).factor, 1.2, 0, "margen importado");
});

test("calcularDesglose: reporta warning si falta materia prima en el catálogo", () => {
  const producto = {
    nombre: "Producto fantasma",
    densidadKgL: 0.85,
    origenAceiteBase: "BO local",
    ingredientes: [{ materiaPrimaId: "No existe", porcentaje: 1.0 }],
  };
  const r = desglose(producto, "Cuarto");
  assertTrue(
    r.warnings.some((w) => w.tipo === "materia_prima_no_encontrada"),
    "debe advertir materia prima no encontrada"
  );
});

test("calcularDesglose: reporta warning si la fórmula no suma 100%", () => {
  const producto = {
    nombre: "Fórmula incompleta",
    densidadKgL: 0.85,
    origenAceiteBase: "BO local",
    ingredientes: [{ materiaPrimaId: "MetaPlus 120 Aceite Base", porcentaje: 0.5 }],
  };
  const r = desglose(producto, "Cuarto");
  assertTrue(
    r.warnings.some((w) => w.tipo === "formula_no_suma_100"),
    "debe advertir fórmula incompleta"
  );
});

test("calcularDesglose: reporta warning si no hay regla de margen para el producto", () => {
  const producto = {
    nombre: "Sin margen",
    densidadKgL: 0.85,
    origenAceiteBase: "Origen desconocido",
    ingredientes: [{ materiaPrimaId: "MetaPlus 120 Aceite Base", porcentaje: 1.0 }],
  };
  const r = desglose(producto, "Cuarto");
  assertTrue(
    r.warnings.some((w) => w.tipo === "margen_no_configurado"),
    "debe advertir margen no configurado"
  );
});

// ---------- Verificación cruzada contra el Excel original (5 productos, todas sus presentaciones) ----------
// Valores tomados de Fms!fila63 (materia prima), Fms!fila66 (costo total) y Principal (precio).
const productosVerificacion = [
  {
    nombre: "5W-20 SP",
    origenAceiteBase: "BO local",
    densidadKgL: 0.854,
    ingredientes: [
      { materiaPrimaId: "MetaPlus 120 Aceite Base", porcentaje: 0.8833 },
      { materiaPrimaId: "HiTEC 11455 ADITIVO", porcentaje: 0.07 },
      { materiaPrimaId: "HiTEC 5754A ADITIVO", porcentaje: 0.055 },
    ],
    esperado: {
      Estañón: { costoMateriaPrima: 314.0183, costoTotal: 417.5434, precio: 563.6835 },
      Cubeta: { costoMateriaPrima: 28.5508, costoTotal: 40.3569, precio: 54.4819 },
      Galón: { costoMateriaPrima: 5.7096, costoTotal: 8.3224, precio: 11.2353 },
      Cuarto: { costoMateriaPrima: 1.427, costoTotal: 2.9159, precio: 3.9365 },
    },
  },
  {
    nombre: "20W-50 SP",
    origenAceiteBase: "BO imp",
    densidadKgL: 0.862,
    ingredientes: [
      { materiaPrimaId: "MetaPlus 240 Aceite Base", porcentaje: 0.26468 },
      { materiaPrimaId: "BASE OIL 600N (group II)", porcentaje: 0.60443 },
      { materiaPrimaId: "HiTEC 11455 ADITIVO", porcentaje: 0.07 },
      { materiaPrimaId: "HiTEC 5754A ADITIVO", porcentaje: 0.068 },
    ],
    esperado: {
      Estañón: { costoMateriaPrima: 438.5159, costoTotal: 542.0409, precio: 650.449 },
      Cubeta: { costoMateriaPrima: 39.8702, costoTotal: 51.6764, precio: 62.0116 },
      Galón: { costoMateriaPrima: 7.9732, costoTotal: 10.5861, precio: 12.7033 },
    },
  },
  {
    nombre: "15W-40 CK-4",
    origenAceiteBase: "BO local",
    densidadKgL: 0.858,
    ingredientes: [
      { materiaPrimaId: "MetaPlus 120 Aceite Base", porcentaje: 0.1519 },
      { materiaPrimaId: "MetaPlus 240 Aceite Base", porcentaje: 0.63541 },
      { materiaPrimaId: "HITEC 12220 M ADITIVO", porcentaje: 0.167 },
      { materiaPrimaId: "HiTEC 5748A ADITIVO", porcentaje: 0.061 },
    ],
    esperado: {
      Estañón: { costoMateriaPrima: 376.19, costoTotal: 479.715, precio: 647.6153 },
      Cubeta: { costoMateriaPrima: 34.2035, costoTotal: 46.0096, precio: 62.113 },
      Galón: { costoMateriaPrima: 6.84, costoTotal: 9.4528, precio: 12.7613 },
      Cuarto: { costoMateriaPrima: 1.7095, costoTotal: 3.1984, precio: 4.3179 },
    },
  },
  {
    nombre: "75W-90 GL-4",
    origenAceiteBase: "BO local",
    densidadKgL: 0.877,
    ingredientes: [
      { materiaPrimaId: "MetaPlus 120 Aceite Base", porcentaje: 0.5419 },
      { materiaPrimaId: "HiTEC 008 DRUM ADITIVO", porcentaje: 0.1 },
      { materiaPrimaId: "HiTEC 33321 DRUM ADITIVO", porcentaje: 0.03 },
      { materiaPrimaId: "HiTEC 3301 DRUM ADITIVO", porcentaje: 0.32 },
      { materiaPrimaId: "HITEC 672 ADITIVO", porcentaje: 0.02 },
    ],
    esperado: {
      Estañón: { costoMateriaPrima: 1122.1002, costoTotal: 1225.6252, precio: 1654.594 },
      Cubeta: { costoMateriaPrima: 102.0223, costoTotal: 113.8284, precio: 153.6684 },
      Galón: { costoMateriaPrima: 20.4023, costoTotal: 23.0152, precio: 31.0705 },
    },
  },
  {
    nombre: "UNITRAK THF",
    origenAceiteBase: "BO local",
    densidadKgL: 0.86,
    ingredientes: [
      { materiaPrimaId: "MetaPlus 240 Aceite Base", porcentaje: 0.90703 },
      { materiaPrimaId: "HiTEC 8703 ADITIVO", porcentaje: 0.05 },
      { materiaPrimaId: "HITEC 672 ADITIVO", porcentaje: 0.01 },
      { materiaPrimaId: "HiTEC 5754A ADITIVO", porcentaje: 0.04 },
    ],
    esperado: {
      Estañón: { costoMateriaPrima: 316.4263, costoTotal: 419.9513, precio: 566.9343 },
      Cubeta: { costoMateriaPrima: 28.7698, costoTotal: 40.5759, precio: 54.7774 },
      Galón: { costoMateriaPrima: 5.7498, costoTotal: 8.3627, precio: 11.2896 },
    },
  },
  {
    nombre: "AW 32",
    origenAceiteBase: "BO local",
    densidadKgL: 0.849,
    ingredientes: [
      { materiaPrimaId: "MetaPlus 120 Aceite Base", porcentaje: 0.63131 },
      { materiaPrimaId: "MetaPlus 240 Aceite Base", porcentaje: 0.35959 },
      { materiaPrimaId: "HiTEC 521F ADITIVO", porcentaje: 0.0085 },
      { materiaPrimaId: "HITEC 672 ADITIVO", porcentaje: 0.002 },
    ],
    esperado: {
      Estañón: { costoMateriaPrima: 229.7118, costoTotal: 333.2368, precio: 449.8697 },
      Cubeta: { costoMateriaPrima: 20.8856, costoTotal: 32.6917, precio: 44.1338 },
      Galón: { costoMateriaPrima: 4.1763, costoTotal: 6.7892, precio: 9.1654 },
    },
  },
];

for (const p of productosVerificacion) {
  for (const [presKey, esperado] of Object.entries(p.esperado)) {
    test(`Verificación Excel: ${p.nombre} / ${presKey} — costo materia prima`, () => {
      const r = desglose(p, presKey);
      // el motor de calculo reproduce exactamente Fms!fila63 (misma formula)
      assertClose(r.costoMateriaPrima.subtotal, esperado.costoMateriaPrima, 0.02, "costo materia prima");
    });
    test(`Verificación Excel: ${p.nombre} / ${presKey} — costo total y precio`, () => {
      const r = desglose(p, presKey);
      // tolerancia mayor: empaque se modela simplificado (envase + otros prorrateado)
      // en vez de replicar la formula exacta de prorrateo por tarima del Excel
      assertClose(r.costoTotalPresentacion, esperado.costoTotal, 0.05, "costo total presentación");
      assertClose(r.precioVenta, esperado.precio, 0.1, "precio de venta");
    });
  }
}

window.__CALC_ENGINE_TEST_RESULTS__ = results;
