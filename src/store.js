// Estado reactivo en memoria, respaldado por IndexedDB. Toda mutación persiste,
// registra historial (si afecta costos) y notifica a los suscriptores (vistas).
(function (global) {
  "use strict";

  const state = {
    rawMaterials: [],
    presentations: [],
    products: [],
    indirectCosts: [],
    packaging: [],
    marginRules: [],
    tolerancia: 0.5,
  };
  let rawMaterialsById = new Map();
  let presentationsById = new Map();
  let packagingByPresId = new Map();
  let productsById = new Map();

  const subscribers = new Set();
  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }
  function notify() {
    for (const fn of subscribers) fn();
  }

  function rebuildIndexes() {
    rawMaterialsById = new Map(state.rawMaterials.map((m) => [m.id, m]));
    presentationsById = new Map(state.presentations.map((p) => [p.id, p]));
    packagingByPresId = new Map(state.packaging.map((p) => [p.presentacion, p]));
    productsById = new Map(state.products.map((p) => [p.id, p]));
  }

  async function load() {
    const [rawMaterials, presentations, products, indirectCosts, packaging, marginRules, tol] = await Promise.all([
      Db.getAll("rawMaterials"),
      Db.getAll("presentations"),
      Db.getAll("products"),
      Db.getAll("indirectCosts"),
      Db.getAll("packaging"),
      Db.getAll("marginRules"),
      Db.get("meta", "tolerancia"),
    ]);
    state.rawMaterials = rawMaterials;
    state.presentations = presentations;
    state.products = products;
    state.indirectCosts = indirectCosts;
    state.packaging = packaging;
    state.marginRules = marginRules;
    state.tolerancia = tol ? tol.value : 0.5;
    rebuildIndexes();
    notify();
  }

  // ---------- Historial ----------
  async function recordHistory(entidad, entidadId, entidadNombre, campo, antes, despues) {
    await Db.put("history", {
      timestamp: new Date().toISOString(),
      entidad,
      entidadId,
      entidadNombre,
      campo,
      antes,
      despues,
    });
  }
  async function getHistory(entidadId) {
    const all = await Db.getAll("history");
    return all.filter((h) => h.entidadId === entidadId).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }
  async function getAllHistory() {
    const all = await Db.getAll("history");
    return all.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }

  // ---------- Snapshots de costo (para el histórico de tendencia) ----------
  async function snapshotProductCosts() {
    const fecha = new Date().toISOString();
    const last = await Db.getAll("costSnapshots");
    const lastByKey = new Map();
    for (const s of last) {
      const key = s.productId + "|" + s.presentacionId;
      const prev = lastByKey.get(key);
      if (!prev || prev.timestamp < s.timestamp) lastByKey.set(key, s);
    }
    for (const p of state.products) {
      for (const pres of p.presentaciones) {
        if (!pres.comercializado || !pres.presentacionId) continue;
        const d = getDesglose(p.id, pres.presentacionId);
        if (!d) continue;
        const key = p.id + "|" + pres.presentacionId;
        const prev = lastByKey.get(key);
        if (prev && Math.abs(prev.costoTotal - d.costoTotalPresentacion) < 0.0001) continue;
        await Db.put("costSnapshots", {
          timestamp: fecha,
          productId: p.id,
          presentacionId: pres.presentacionId,
          costoTotal: d.costoTotalPresentacion,
          precioVenta: d.precioVenta,
        });
      }
    }
  }
  async function getCostHistory(productId, presentacionId) {
    const all = await Db.getAll("costSnapshots");
    return all
      .filter((s) => s.productId === productId && (!presentacionId || s.presentacionId === presentacionId))
      .sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
  }

  // ---------- Cálculo (envuelve CalcEngine con el estado actual) ----------
  function getDesglose(productId, presentacionId) {
    const producto = productsById.get(productId);
    const presentacion = presentationsById.get(presentacionId);
    if (!producto || !presentacion) return null;
    const pkg = packagingByPresId.get(presentacionId);
    return CalcEngine.calcularDesglose({
      producto,
      presentacion,
      materiasPrimasById: rawMaterialsById,
      costosIndirectos: state.indirectCosts,
      lineasEmpaque: pkg ? pkg.lineas : [],
      margenes: state.marginRules,
      tolerancia: state.tolerancia,
    });
  }

  // ---------- Mutaciones: Materias primas ----------
  async function addRawMaterial(mp) {
    if (!mp.id) mp.id = "mp-" + Date.now().toString(36);
    state.rawMaterials.push(mp);
    rebuildIndexes();
    await Db.put("rawMaterials", mp);
    await recordHistory("rawMaterial", mp.id, mp.nombre, "creado", null, mp);
    notify();
  }
  async function updateRawMaterial(id, patch) {
    const mp = rawMaterialsById.get(id);
    if (!mp) return;
    const antes = Object.assign({}, mp);
    Object.assign(mp, patch);
    await Db.put("rawMaterials", mp);
    for (const campo of Object.keys(patch)) {
      if (antes[campo] !== mp[campo]) {
        await recordHistory("rawMaterial", id, mp.nombre, campo, antes[campo], mp[campo]);
      }
    }
    await snapshotProductCosts();
    notify();
  }
  async function deleteRawMaterial(id) {
    const mp = rawMaterialsById.get(id);
    state.rawMaterials = state.rawMaterials.filter((m) => m.id !== id);
    rebuildIndexes();
    await Db.delete("rawMaterials", id);
    if (mp) await recordHistory("rawMaterial", id, mp.nombre, "eliminado", mp, null);
    notify();
  }

  // ---------- Mutaciones: Productos / fórmulas ----------
  async function updateProduct(id, patch) {
    const p = productsById.get(id);
    if (!p) return;
    const antes = Object.assign({}, p);
    Object.assign(p, patch);
    await Db.put("products", p);
    for (const campo of Object.keys(patch)) {
      if (JSON.stringify(antes[campo]) !== JSON.stringify(p[campo])) {
        await recordHistory("producto", id, p.nombre, campo, antes[campo], p[campo]);
      }
    }
    await snapshotProductCosts();
    notify();
  }
  async function addProduct(p) {
    if (!p.id) p.id = "prod-" + Date.now().toString(36);
    if (!p.ingredientes) p.ingredientes = [];
    if (!p.presentaciones) p.presentaciones = [];
    state.products.push(p);
    rebuildIndexes();
    await Db.put("products", p);
    await recordHistory("producto", p.id, p.nombre, "creado", null, p);
    notify();
  }
  async function deleteProduct(id) {
    const p = productsById.get(id);
    state.products = state.products.filter((x) => x.id !== id);
    rebuildIndexes();
    await Db.delete("products", id);
    if (p) await recordHistory("producto", id, p.nombre, "eliminado", p, null);
    notify();
  }

  // ---------- Mutaciones: Costos indirectos ----------
  async function updateIndirectCost(id, patch) {
    const item = state.indirectCosts.find((i) => i.id === id);
    if (!item) return;
    const antes = Object.assign({}, item);
    Object.assign(item, patch);
    await Db.put("indirectCosts", item);
    for (const campo of Object.keys(patch)) {
      if (antes[campo] !== item[campo]) await recordHistory("costoIndirecto", id, item.nombre, campo, antes[campo], item[campo]);
    }
    await snapshotProductCosts();
    notify();
  }
  async function addIndirectCost(item) {
    if (!item.id) item.id = "ind-" + Date.now().toString(36);
    state.indirectCosts.push(item);
    await Db.put("indirectCosts", item);
    await recordHistory("costoIndirecto", item.id, item.nombre, "creado", null, item);
    notify();
  }
  async function deleteIndirectCost(id) {
    const item = state.indirectCosts.find((i) => i.id === id);
    state.indirectCosts = state.indirectCosts.filter((i) => i.id !== id);
    await Db.delete("indirectCosts", id);
    if (item) await recordHistory("costoIndirecto", id, item.nombre, "eliminado", item, null);
    await snapshotProductCosts();
    notify();
  }

  // ---------- Mutaciones: Empaque ----------
  async function updatePackagingLine(presentacionId, index, patch) {
    const pkg = packagingByPresId.get(presentacionId);
    if (!pkg || !pkg.lineas[index]) return;
    const antes = Object.assign({}, pkg.lineas[index]);
    Object.assign(pkg.lineas[index], patch);
    await Db.put("packaging", pkg);
    await recordHistory("empaque", presentacionId, pkg.presentacionNombre, `línea ${index + 1}`, antes, pkg.lineas[index]);
    await snapshotProductCosts();
    notify();
  }
  async function addPackagingLine(presentacionId, linea) {
    let pkg = packagingByPresId.get(presentacionId);
    if (!pkg) {
      pkg = { presentacion: presentacionId, presentacionNombre: presentacionId, lineas: [] };
      state.packaging.push(pkg);
    }
    pkg.lineas.push(linea);
    await Db.put("packaging", pkg);
    await recordHistory("empaque", presentacionId, pkg.presentacionNombre, "línea agregada", null, linea);
    await snapshotProductCosts();
    notify();
  }
  async function deletePackagingLine(presentacionId, index) {
    const pkg = packagingByPresId.get(presentacionId);
    if (!pkg) return;
    const antes = pkg.lineas[index];
    pkg.lineas.splice(index, 1);
    await Db.put("packaging", pkg);
    await recordHistory("empaque", presentacionId, pkg.presentacionNombre, "línea eliminada", antes, null);
    await snapshotProductCosts();
    notify();
  }

  // ---------- Mutaciones: Márgenes ----------
  async function updateMarginRule(id, patch) {
    const item = state.marginRules.find((i) => i.id === id);
    if (!item) return;
    const antes = Object.assign({}, item);
    Object.assign(item, patch);
    await Db.put("marginRules", item);
    for (const campo of Object.keys(patch)) {
      if (antes[campo] !== item[campo]) await recordHistory("margen", id, item.valor, campo, antes[campo], item[campo]);
    }
    await snapshotProductCosts();
    notify();
  }
  async function addMarginRule(item) {
    if (!item.id) item.id = "margin-" + Date.now().toString(36);
    state.marginRules.push(item);
    await Db.put("marginRules", item);
    await recordHistory("margen", item.id, item.valor, "creado", null, item);
    notify();
  }
  async function deleteMarginRule(id) {
    const item = state.marginRules.find((i) => i.id === id);
    state.marginRules = state.marginRules.filter((i) => i.id !== id);
    await Db.delete("marginRules", id);
    if (item) await recordHistory("margen", id, item.valor, "eliminado", item, null);
    await snapshotProductCosts();
    notify();
  }

  async function setTolerancia(v) {
    state.tolerancia = v;
    await Db.put("meta", { key: "tolerancia", value: v });
    notify();
  }

  global.Store = {
    state,
    subscribe,
    load,
    getDesglose,
    rawMaterialsById: () => rawMaterialsById,
    presentationsById: () => presentationsById,
    packagingByPresId: () => packagingByPresId,
    productsById: () => productsById,
    addRawMaterial,
    updateRawMaterial,
    deleteRawMaterial,
    addProduct,
    updateProduct,
    deleteProduct,
    addIndirectCost,
    updateIndirectCost,
    deleteIndirectCost,
    addPackagingLine,
    updatePackagingLine,
    deletePackagingLine,
    addMarginRule,
    updateMarginRule,
    deleteMarginRule,
    setTolerancia,
    getHistory,
    getAllHistory,
    getCostHistory,
    snapshotProductCosts,
  };
})(typeof window !== "undefined" ? window : globalThis);
