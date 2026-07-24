(function (global) {
  "use strict";

  function render(container) {
    container.appendChild(
      UI.el(`
      <div>
        <h1>Importar / Exportar</h1>
        <p class="page-sub">Backup completo en JSON, exportación de costos a Excel/CSV, y re-importación del Excel original.</p>

        <div class="card">
          <h2>Exportar backup completo (JSON)</h2>
          <p class="muted" style="font-size:0.85rem">Incluye materias primas, productos/fórmulas, costos indirectos, empaque, márgenes e historial. Úsalo para no depender solo del navegador.</p>
          <button class="primary" id="btn-export-backup">Descargar backup JSON</button>
        </div>

        <div class="card">
          <h2>Restaurar backup (JSON)</h2>
          <p class="muted" style="font-size:0.85rem">⚠ Reemplaza todos los datos actuales por los del archivo.</p>
          <input type="file" id="file-backup" accept="application/json" />
        </div>

        <div class="card">
          <h2>Exportar costos y precios</h2>
          <div class="toolbar" style="margin-bottom:0">
            <button id="btn-export-xlsx">Exportar a Excel (.xlsx)</button>
            <button id="btn-export-csv">Exportar a CSV</button>
          </div>
        </div>

        <div class="card">
          <h2>Reimportar Excel original</h2>
          <p class="muted" style="font-size:0.85rem">⚠ Reemplaza materias primas, fórmulas, costos indirectos, empaque y márgenes por lo que encuentre en las hojas "Fms" y "Principal" del archivo. El historial de cambios se conserva.</p>
          <input type="file" id="file-excel" accept=".xlsx" />
          <p id="excel-status" class="muted" style="font-size:0.85rem;margin-top:0.5rem"></p>
        </div>

        <div class="card">
          <h2>Información de la migración inicial</h2>
          <div id="info-box" class="muted" style="font-size:0.85rem"></div>
        </div>
      </div>
    `)
    );

    container.querySelector("#btn-export-backup").addEventListener("click", () => ImportExport.exportBackupJson());
    container.querySelector("#btn-export-xlsx").addEventListener("click", () => ImportExport.exportDashboardExcel());
    container.querySelector("#btn-export-csv").addEventListener("click", () => ImportExport.exportDashboardCsv());

    container.querySelector("#file-backup").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm("Esto reemplazará todos los datos actuales por los del backup. ¿Continuar?")) { e.target.value = ""; return; }
      try {
        const text = await file.text();
        await ImportExport.importBackupJson(JSON.parse(text));
        alert("Backup restaurado correctamente.");
      } catch (err) {
        alert("Error al restaurar el backup: " + err.message);
      }
      e.target.value = "";
    });

    container.querySelector("#file-excel").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('Esto reemplazará materias primas, fórmulas, costos indirectos, empaque y márgenes con lo leído de "Fms" y "Principal" en el archivo. ¿Continuar?')) { e.target.value = ""; return; }
      const status = container.querySelector("#excel-status");
      status.textContent = "Leyendo archivo…";
      try {
        const seed = await ImportExport.importExcelWorkbookFile(file);
        status.textContent = `Importado: ${seed.rawMaterials.length} materias primas, ${seed.products.length} productos.`;
      } catch (err) {
        status.textContent = "Error: " + err.message;
      }
      e.target.value = "";
    });

    Db.get("meta", "info").then((info) => {
      const box = container.querySelector("#info-box");
      if (!info || !info.value) { box.textContent = "Sin información de migración."; return; }
      box.innerHTML = `Generado desde: <strong>${UI.escapeHtml(info.value.generadoDesde || "—")}</strong><br/>Fecha de migración: ${UI.escapeHtml(info.value.fechaMigracion || "—")}<br/>Versión del Excel origen: ${UI.escapeHtml(String(info.value.versionExcelOrigen || "—"))}`;
    });
  }

  global.Views = global.Views || {};
  global.Views.importExportView = render;
})(typeof window !== "undefined" ? window : globalThis);
