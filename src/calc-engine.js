// Motor de cálculo de costos y precios de lubricantes.
// Módulo puro: sin I/O, sin estado, sin efectos secundarios. Cada función recibe
// datos y devuelve resultados + advertencias, nunca lanza excepciones por datos
// de negocio incompletos (eso se reporta como warning para que la UI lo muestre).
//
// Script clásico (no ES module): así `index.html` y `test-runner.html` funcionan
// abriendo el archivo directamente (file://) en cualquier navegador, sin bloqueos
// de CORS entre módulos que Chrome impone a `<script type="module">` sobre file://.
(function (global) {
  "use strict";

  const CATEGORIA_ACEITE_BASE = "aceite_base";
  const CATEGORIA_ADITIVO = "aditivo";

  /** Suma el % de participación de una fórmula y valida que ronde 100%. */
  function validarSumaFormula(ingredientes, tolerancia) {
    tolerancia = tolerancia === undefined ? 0.5 : tolerancia;
    const suma = ingredientes.reduce((acc, i) => acc + (i.porcentaje || 0), 0) * 100;
    const diferencia = suma - 100;
    return {
      sumaPorcentaje: suma,
      diferencia,
      valido: Math.abs(diferencia) <= tolerancia,
    };
  }

  /**
   * Costo de materia prima para una fórmula en una presentación dada.
   * aceites base: dosificados en % volumen -> %  × $/L × volumen(L)
   * aditivos:     dosificados en % peso    -> %  × $/kg × volumen(L) × densidad(kg/L)
   */
  function calcularCostoMateriaPrima(producto, volumenL, materiasPrimasById) {
    let costoAceitesBase = 0;
    let costoAditivos = 0;
    const warnings = [];

    for (const ing of producto.ingredientes) {
      const mp = materiasPrimasById.get(ing.materiaPrimaId);
      if (!mp) {
        warnings.push({
          tipo: "materia_prima_no_encontrada",
          mensaje: `Materia prima "${ing.materiaPrimaId}" usada en la fórmula no existe en el catálogo.`,
        });
        continue;
      }
      if (mp.costoUnitario === null || mp.costoUnitario === undefined) {
        warnings.push({
          tipo: "costo_materia_prima_faltante",
          mensaje: `Falta el costo unitario de "${mp.nombre}".`,
        });
        continue;
      }
      if (mp.categoria === CATEGORIA_ACEITE_BASE) {
        costoAceitesBase += ing.porcentaje * mp.costoUnitario;
      } else {
        costoAditivos += ing.porcentaje * mp.costoUnitario * (producto.densidadKgL || 0);
      }
    }

    costoAceitesBase *= volumenL;
    costoAditivos *= volumenL;

    return {
      aceitesBase: round4(costoAceitesBase),
      aditivos: round4(costoAditivos),
      subtotal: round4(costoAceitesBase + costoAditivos),
      warnings,
    };
  }

  /** Costos indirectos: tarifas $/L configurables, aplicadas al volumen de la presentación. */
  function calcularCostosIndirectos(costosIndirectos, volumenL) {
    const detalle = {};
    let subtotal = 0;
    for (const rubro of costosIndirectos) {
      const valor = (rubro.tarifaPorLitro || 0) * volumenL;
      detalle[rubro.nombre] = round4(valor);
      subtotal += valor;
    }
    return { detalle, subtotal: round4(subtotal) };
  }

  /**
   * Empaque: lista de líneas de costo ya expresadas en $ para esa presentación
   * (envase, cajas, cinta, etiquetas, tarimas, u otras que el usuario agregue).
   */
  function calcularEmpaque(lineasEmpaque) {
    const detalle = {};
    let subtotal = 0;
    for (const linea of lineasEmpaque || []) {
      detalle[linea.concepto] = round4(linea.costo || 0);
      subtotal += linea.costo || 0;
    }
    return { detalle, subtotal: round4(subtotal) };
  }

  /**
   * Determina el factor de margen aplicable a un producto según las reglas configuradas.
   * Reglas: [{ criterio: 'origenAceiteBase' | 'familia' | ..., valor, factor }]
   */
  function obtenerMargen(producto, margenes) {
    const regla = (margenes || []).find((m) => producto[m.criterio] === m.valor);
    return regla || null;
  }

  /**
   * Cálculo completo: desglose de costo y precio para producto × presentación.
   * No lanza excepciones: cualquier dato faltante se reporta en `warnings`.
   */
  function calcularDesglose(args) {
    const {
      producto,
      presentacion,
      materiasPrimasById,
      costosIndirectos,
      lineasEmpaque,
      margenes,
      tolerancia = 0.5,
    } = args;
    const warnings = [];

    const validacionFormula = validarSumaFormula(producto.ingredientes, tolerancia);
    if (!validacionFormula.valido) {
      warnings.push({
        tipo: "formula_no_suma_100",
        mensaje: `La fórmula de "${producto.nombre}" suma ${validacionFormula.sumaPorcentaje.toFixed(
          2
        )}% (esperado 100% ± ${tolerancia}%).`,
      });
    }

    const mp = calcularCostoMateriaPrima(producto, presentacion.volumenL, materiasPrimasById);
    warnings.push(...mp.warnings);

    if (!costosIndirectos || costosIndirectos.length === 0) {
      warnings.push({
        tipo: "costos_indirectos_no_configurados",
        mensaje: "No hay costos indirectos configurados.",
      });
    }
    const indirectos = calcularCostosIndirectos(costosIndirectos || [], presentacion.volumenL);

    if (!lineasEmpaque) {
      warnings.push({
        tipo: "empaque_no_configurado",
        mensaje: `No hay costos de empaque configurados para la presentación "${presentacion.nombre}".`,
      });
    }
    const empaque = calcularEmpaque(lineasEmpaque || []);

    const costoTotalPresentacion = round4(mp.subtotal + indirectos.subtotal + empaque.subtotal);
    const costoPorLitro = presentacion.volumenL ? round4(costoTotalPresentacion / presentacion.volumenL) : 0;

    const reglaMargen = obtenerMargen(producto, margenes);
    if (!reglaMargen) {
      warnings.push({
        tipo: "margen_no_configurado",
        mensaje: `No hay regla de margen para este producto (origenAceiteBase="${producto.origenAceiteBase}").`,
      });
    }
    const factor = reglaMargen ? reglaMargen.factor : 1;
    const precioVenta = round4(costoTotalPresentacion * factor);
    const precioPorLitro = presentacion.volumenL ? round4(precioVenta / presentacion.volumenL) : 0;

    return {
      costoMateriaPrima: { aceitesBase: mp.aceitesBase, aditivos: mp.aditivos, subtotal: mp.subtotal },
      costosIndirectos: Object.assign({}, indirectos.detalle, { subtotal: indirectos.subtotal }),
      empaque: Object.assign({}, empaque.detalle, { subtotal: empaque.subtotal }),
      costoTotalPresentacion,
      costoPorLitro,
      margenAplicado: factor,
      precioVenta,
      precioPorLitro,
      validacionFormula,
      warnings,
    };
  }

  function round4(n) {
    return Math.round((n + Number.EPSILON) * 10000) / 10000;
  }

  global.CalcEngine = {
    CATEGORIA_ACEITE_BASE,
    CATEGORIA_ADITIVO,
    validarSumaFormula,
    calcularCostoMateriaPrima,
    calcularCostosIndirectos,
    calcularEmpaque,
    obtenerMargen,
    calcularDesglose,
  };
})(typeof window !== "undefined" ? window : globalThis);
