// Exportar/importar backup completo (JSON) y exportar el dashboard a Excel/CSV.
(function (global) {
  "use strict";

  async function exportBackupJson() {
    const [rawMaterials, presentations, products, indirectCosts, packaging, marginRules, history, costSnapshots] = await Promise.all([
      Db.getAll("rawMaterials"), Db.getAll("presentations"), Db.getAll("products"),
      Db.getAll("indirectCosts"), Db.getAll("packaging"), Db.getAll("marginRules"),
      Db.getAll("history"), Db.getAll("costSnapshots"),
    ]);
    const backup = {
      tipo: "bom-afton-backup", version: 1, exportadoEn: new Date().toISOString(),
      rawMaterials, presentations, products, indirectCosts, packaging, marginRules, history, costSnapshots,
    };
    UI.downloadJson(backup, `bom-afton-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function importBackupJson(backup) {
    if (!backup || backup.tipo !== "bom-afton-backup") throw new Error("El archivo no parece ser un backup válido de esta app.");
    const stores = ["rawMaterials", "presentations", "products", "indirectCosts", "packaging", "marginRules", "history", "costSnapshots"];
    await Promise.all(stores.map((s) => Db.clear(s)));
    for (const s of stores) {
      if (Array.isArray(backup[s]) && backup[s].length) await Db.putAll(s, backup[s]);
    }
    await Db.put("meta", { key: "seeded", value: true, fecha: new Date().toISOString() });
    await Store.load();
  }

  async function importExcelWorkbookFile(file) {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: "array", cellFormula: true });
    const seed = ExcelImport.parseWorkbook(workbook);
    await SeedLoader.loadSeedData(seed, { replace: true, keepTolerancia: true });
    await Store.load();
    return seed;
  }

  function buildDashboardRows() {
    const rows = [["Producto", "Familia", "Origen aceite base", "Presentación", "Código", "Costo materia prima", "Costo indirectos", "Costo empaque", "Costo total", "Costo por litro", "Margen aplicado", "Precio de venta", "Precio por litro"]];
    for (const p of Store.state.products) {
      for (const pres of p.presentaciones) {
        if (!pres.presentacionId) continue;
        const d = Store.getDesglose(p.id, pres.presentacionId);
        if (!d) continue;
        rows.push([
          p.nombre, p.familia, p.origenAceiteBase, pres.presentacionLabel, pres.codigo,
          d.costoMateriaPrima.subtotal, d.costosIndirectos.subtotal, d.empaque.subtotal,
          d.costoTotalPresentacion, d.costoPorLitro, d.margenAplicado, d.precioVenta, d.precioPorLitro,
        ]);
      }
    }
    return rows;
  }

  function exportDashboardCsv() {
    UI.downloadCsv(buildDashboardRows(), `bom-afton-costos-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function exportDashboardExcel() {
    const rows = buildDashboardRows();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = rows[0].map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Costos y precios");
    XLSX.writeFile(wb, `bom-afton-costos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  global.ImportExport = { exportBackupJson, importBackupJson, importExcelWorkbookFile, exportDashboardCsv, exportDashboardExcel };
})(typeof window !== "undefined" ? window : globalThis);
