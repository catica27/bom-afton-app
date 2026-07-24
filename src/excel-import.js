// Importador del Excel original BOM Afton en el navegador (SheetJS), replicando la
// misma lógica de la migración inicial (scripts/migrate.ps1) para poder re-importar
// si el Excel fuente cambia. Puro: recibe un ArrayBuffer, devuelve un objeto "seed".
(function (global) {
  "use strict";

  const FAMILY_ANCHORS = [
    { row: 2, col: 20, name: "Passenger Car Motor Oil" },
    { row: 2, col: 38, name: "Truck Hydraulic Fluid" },
    { row: 31, col: 20, name: "Motorcycle Oil" },
    { row: 31, col: 38, name: "Transmision Oil" },
    { row: 61, col: 20, name: "Heavy Duty Engines Oil" },
    { row: 91, col: 20, name: "Hydraulic Oil" },
    { row: 121, col: 20, name: "Automatic Transmision Oil" },
    { row: 151, col: 20, name: "Gear Oil" },
  ];

  function cellAt(sheet, row, col) {
    const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
    return sheet[addr];
  }
  function val(sheet, row, col) {
    const c = cellAt(sheet, row, col);
    return c ? c.v : undefined;
  }
  function text(sheet, row, col) {
    const c = cellAt(sheet, row, col);
    if (!c) return "";
    return c.w !== undefined ? String(c.w) : c.v !== undefined ? String(c.v) : "";
  }
  function formula(sheet, row, col) {
    const c = cellAt(sheet, row, col);
    return c && c.f ? c.f : "";
  }

  function parseWorkbook(workbook) {
    const fms = workbook.Sheets["Fms"];
    const prin = workbook.Sheets["Principal"];
    if (!fms || !prin) throw new Error('El archivo no tiene las hojas "Fms" y "Principal" esperadas.');

    // ---------- Materias primas ----------
    const rawMaterials = [];
    let idc = 1;
    for (let r = 127; r <= 130; r++) {
      const nombre = text(prin, r, 2).trim();
      if (!nombre) continue;
      rawMaterials.push({
        id: "mp-" + idc++, nombre, categoria: "aceite_base", unidadCompra: "L",
        costoUnitario: round4(val(prin, r, 4)), origen: null, fechaActualizacion: null, notas: null,
      });
    }
    for (let r = 158; r <= 174; r++) {
      const nombre = text(prin, r, 2).trim();
      if (!nombre) continue;
      rawMaterials.push({
        id: "mp-" + idc++, nombre, categoria: "aditivo", unidadCompra: "kg",
        costoUnitario: round4(val(prin, r, 6)), densidad: val(prin, r, 7), origen: "importado",
        fechaActualizacion: null, notas: null,
      });
    }
    rawMaterials.push({
      id: "mp-" + idc++, nombre: "DYE", categoria: "aditivo", unidadCompra: "kg", costoUnitario: 0,
      origen: null, fechaActualizacion: null, notas: "Sin costo unitario definido en el Excel original.",
    });

    // ---------- Presentaciones ----------
    const presentations = [
      { id: "pres-cuarto", nombre: "Cuarto", volumenL: 0.946 },
      { id: "pres-galon", nombre: "Galón", volumenL: 3.785 },
      { id: "pres-cubeta", nombre: "Cubeta", volumenL: 18.927 },
      { id: "pres-estanon", nombre: "Estañón", volumenL: 208.17 },
      { id: "pres-tote", nombre: "Tote", volumenL: 1000 },
    ];

    // ---------- Costos indirectos ----------
    const indirectRows = { 38: "Consumo Energía", 39: "Agua", 40: "Alquiler", 41: "Depreciación", 42: "Mano de obra" };
    const indirectCosts = Object.keys(indirectRows).map((r) => ({
      id: "ind-" + r, nombre: indirectRows[r], tarifaPorLitro: round4(val(prin, parseInt(r, 10), 4)),
    }));

    // ---------- Empaque ----------
    const pkgRows = { "Estañón": 68, "Cubeta": 69, "Galón": 70, "Cuarto": 71, "Tote": 72 };
    const packaging = {};
    for (const label of Object.keys(pkgRows)) {
      const r = pkgRows[label];
      const envase = val(prin, r, 4) || 0;
      const total = val(prin, r, 6) || 0;
      packaging[label] = [
        { concepto: "Envase", costo: round4(envase) },
        { concepto: "Cajas / tarima / cinta / etiquetas / protección (prorrateado)", costo: round4(total - envase) },
      ];
    }

    // ---------- Márgenes ----------
    const marginRules = [
      { id: "margin-local", criterio: "origenAceiteBase", valor: text(prin, 135, 3), factor: val(prin, 135, 5) },
      { id: "margin-imp", criterio: "origenAceiteBase", valor: text(prin, 136, 3), factor: val(prin, 136, 5) },
    ];

    // ---------- Fms: fórmulas por producto x presentación ----------
    let lastBaseName = "";
    const fmsEntries = [];
    for (let c = 3; c <= 96; c++) {
      const baseNameCell = text(fms, 3, c).trim();
      if (baseNameCell) lastBaseName = baseNameCell;
      const codigoRaw = val(fms, 4, c);
      if (codigoRaw === undefined || codigoRaw === null || codigoRaw === "") continue;
      const codigo = String(Math.trunc(Number(codigoRaw)));
      const volumen = val(fms, 28, c);
      const densidad = val(fms, 32, c);
      const presLabel = text(fms, 31, c).trim();
      const costoMP = val(fms, 63, c);
      const costoTotal = val(fms, 66, c);

      const ingredientes = [];
      for (let r = 5; r <= 26; r++) {
        const pct = val(fms, r, c);
        if (pct !== undefined && pct !== null && pct !== 0 && pct !== "") {
          ingredientes.push({ materiaPrima: text(fms, r, 1).trim(), porcentaje: round6(pct) });
        }
      }
      fmsEntries.push({ productoBase: lastBaseName, codigo, presentacionLabel: presLabel, volumenL: volumen, densidad, ingredientes, costoMateriaPrimaVerif: costoMP, costoTotalVerif: costoTotal });
    }

    // ---------- Principal: escaneo de celdas HLOOKUP para nombre/origen/familia/precio ----------
    const prinEntries = new Map();
    const range = XLSX.utils.decode_range(prin["!ref"]);
    const maxRow = Math.min(range.e.r + 1, 300);
    const maxCol = range.e.c + 1;
    for (let r = 1; r <= maxRow; r++) {
      for (let c = 1; c <= maxCol; c++) {
        const f = formula(prin, r, c);
        if (f && /^HLOOKUP\(/i.test(f)) {
          const codigoVal = val(prin, r, c - 1);
          if (!codigoVal) continue;
          const codigo = String(Math.trunc(Number(codigoVal)));
          const nombre = text(prin, r, c - 5).trim();
          const origen = text(prin, r, c - 6).trim();
          const precio = val(prin, r, c + 1);

          let best = null;
          for (const a of FAMILY_ANCHORS) {
            if (a.row <= r && a.col <= c) {
              if (!best || a.row > best.row || (a.row === best.row && a.col > best.col)) best = a;
            }
          }
          prinEntries.set(codigo, { nombreCompleto: nombre, origen, familia: best ? best.name : "Sin clasificar", precioVerif: precio });
        }
      }
    }

    // ---------- Cruce (misma forma "cruda" que data/seed.json, para reusar SeedLoader) ----------
    const productsByBase = new Map();
    for (const e of fmsEntries) {
      const pinfo = prinEntries.get(e.codigo);
      if (!productsByBase.has(e.productoBase)) {
        productsByBase.set(e.productoBase, {
          id: "prod-" + e.productoBase.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase(),
          nombre: e.productoBase,
          familia: pinfo ? pinfo.familia : "Sin clasificar",
          origenAceiteBase: pinfo ? pinfo.origen : null,
          densidadKgL: e.densidad,
          estado: "activo",
          ingredientes: e.ingredientes,
          presentaciones: [],
        });
      }
      const entry = productsByBase.get(e.productoBase);
      entry.presentaciones.push({
        presentacion: e.presentacionLabel,
        codigo: e.codigo,
        volumenL: e.volumenL,
        nombreCompleto: pinfo ? pinfo.nombreCompleto : null,
        verificacionExcel: { costoMateriaPrima: round4(e.costoMateriaPrimaVerif), costoTotal: round4(e.costoTotalVerif), precio: pinfo ? round4(pinfo.precioVerif) : null },
      });
    }

    return {
      generadoDesde: "Importado desde el navegador",
      fechaMigracion: new Date().toISOString().slice(0, 10),
      rawMaterials, presentations, indirectCosts, packaging, marginRules,
      products: Array.from(productsByBase.values()),
    };
  }

  function round4(n) { return n === undefined || n === null ? n : Math.round((n + Number.EPSILON) * 10000) / 10000; }
  function round6(n) { return n === undefined || n === null ? n : Math.round((n + Number.EPSILON) * 1000000) / 1000000; }

  global.ExcelImport = { parseWorkbook };
})(typeof window !== "undefined" ? window : globalThis);
