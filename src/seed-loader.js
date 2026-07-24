// Carga datos con la forma "cruda" (igual a data/seed.json) a IndexedDB. Se usa tanto
// para la siembra inicial (window.SEED_DATA) como para reimportar el Excel original o
// un backup desde la UI. Normaliza referencias (nombre de materia prima -> id,
// etiqueta de presentación del Excel -> id canónico de presentación).
(function (global) {
  "use strict";

  const LABEL_TO_PRES_ID = {
    "Estañones": "pres-estanon",
    "Estañón": "pres-estanon",
    "Cubetas": "pres-cubeta",
    "Cubeta": "pres-cubeta",
    "Galones": "pres-galon",
    "Galón": "pres-galon",
    "Cuartos": "pres-cuarto",
    "Cuarto": "pres-cuarto",
    "Tanqueta": "pres-tote",
    "Tote": "pres-tote",
  };

  async function loadSeedData(seed, options) {
    options = options || {};
    if (options.replace) {
      await Promise.all(
        ["rawMaterials", "presentations", "products", "indirectCosts", "packaging", "marginRules"].map((s) => Db.clear(s))
      );
    }

    const nameToId = new Map(seed.rawMaterials.map((m) => [m.nombre.toUpperCase(), m.id]));

    await Db.putAll("rawMaterials", seed.rawMaterials);
    await Db.putAll("presentations", seed.presentations);
    await Db.putAll("indirectCosts", seed.indirectCosts);
    await Db.putAll("marginRules", seed.marginRules);

    const packagingRecords = Object.keys(seed.packaging).map((label) => ({
      presentacion: LABEL_TO_PRES_ID[label] || label,
      presentacionNombre: label,
      lineas: seed.packaging[label],
    }));
    await Db.putAll("packaging", packagingRecords);

    const products = seed.products.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      familia: p.familia,
      origenAceiteBase: p.origenAceiteBase,
      densidadKgL: p.densidadKgL,
      estado: p.estado || "activo",
      comentarios: p.comentarios || null,
      especificacion: p.especificacion || p.nombre,
      ingredientes: p.ingredientes.map((i) => ({
        materiaPrimaId: nameToId.get(i.materiaPrima.toUpperCase()) || null,
        materiaPrimaNombre: i.materiaPrima,
        porcentaje: i.porcentaje,
      })),
      presentaciones: p.presentaciones.map((pr) => ({
        presentacionId: LABEL_TO_PRES_ID[pr.presentacion] || null,
        presentacionLabel: pr.presentacion,
        codigo: pr.codigo,
        volumenL: pr.volumenL,
        nombreCompleto: pr.nombreCompleto,
        comercializado: !!pr.nombreCompleto,
        verificacionExcel: pr.verificacionExcel,
      })),
    }));
    await Db.putAll("products", products);

    await Db.put("meta", { key: "seeded", value: true, fecha: new Date().toISOString() });
    if (!options.keepTolerancia) await Db.put("meta", { key: "tolerancia", value: 0.5 });
    await Db.put("meta", {
      key: "info",
      value: { generadoDesde: seed.generadoDesde, fechaMigracion: seed.fechaMigracion, versionExcelOrigen: seed.versionExcelOrigen },
    });
  }

  async function seedIfEmpty() {
    const meta = await Db.get("meta", "seeded");
    if (meta && meta.value) return false;
    const seed = global.SEED_DATA;
    if (!seed) throw new Error("data/seed.js no se cargó (window.SEED_DATA no existe).");
    await loadSeedData(seed, { replace: false });
    return true;
  }

  global.SeedLoader = { seedIfEmpty, loadSeedData, LABEL_TO_PRES_ID };
})(typeof window !== "undefined" ? window : globalThis);
