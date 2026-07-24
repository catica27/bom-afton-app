(function (global) {
  "use strict";

  async function render(container) {
    container.appendChild(
      UI.el(`
      <div>
        <h1>Historial de cambios</h1>
        <p class="page-sub">Trazabilidad de qué cambió, cuándo — costos, fórmulas, márgenes y empaque.</p>
        <div class="toolbar">
          <select id="hist-entidad">
            <option value="">Todas las entidades</option>
            <option value="rawMaterial">Materias primas</option>
            <option value="producto">Productos / fórmulas</option>
            <option value="costoIndirecto">Costos indirectos</option>
            <option value="empaque">Empaque</option>
            <option value="margen">Márgenes</option>
          </select>
          <input type="search" id="hist-search" placeholder="Buscar…" style="width:220px" />
          <div class="spacer"></div>
          <span class="muted" id="hist-count"></span>
        </div>
        <div class="card" style="padding:0">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Entidad</th><th>Nombre</th><th>Campo</th><th>Antes</th><th>Después</th></tr></thead>
              <tbody id="hist-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `)
    );

    const all = await Store.getAllHistory();
    const tbody = container.querySelector("#hist-tbody");
    const countEl = container.querySelector("#hist-count");
    const entidadLabels = { rawMaterial: "Materia prima", producto: "Producto", costoIndirecto: "Costo indirecto", empaque: "Empaque", margen: "Margen" };

    function fmtVal(v) {
      if (v === null || v === undefined) return "—";
      if (typeof v === "object") return UI.escapeHtml(JSON.stringify(v)).slice(0, 80);
      return UI.escapeHtml(String(v));
    }

    function renderTable() {
      const entidad = container.querySelector("#hist-entidad").value;
      const texto = container.querySelector("#hist-search").value.toLowerCase();
      let rows = all;
      if (entidad) rows = rows.filter((h) => h.entidad === entidad);
      if (texto) rows = rows.filter((h) => (h.entidadNombre || "").toLowerCase().includes(texto) || (h.campo || "").toLowerCase().includes(texto));
      countEl.textContent = `${rows.length} cambios`;
      tbody.innerHTML =
        rows
          .slice(0, 500)
          .map(
            (h) => `<tr>
          <td class="muted" style="font-size:0.8rem;white-space:nowrap">${UI.fecha(h.timestamp)}</td>
          <td>${entidadLabels[h.entidad] || h.entidad}</td>
          <td>${UI.escapeHtml(h.entidadNombre || "")}</td>
          <td>${UI.escapeHtml(h.campo)}</td>
          <td class="mono">${fmtVal(h.antes)}</td>
          <td class="mono">${fmtVal(h.despues)}</td>
        </tr>`
          )
          .join("") || `<tr><td colspan="6" class="muted">Sin cambios registrados todavía.</td></tr>`;
    }
    container.querySelector("#hist-entidad").addEventListener("change", renderTable);
    container.querySelector("#hist-search").addEventListener("input", UI.debounce(renderTable, 150));
    renderTable();
  }

  global.Views = global.Views || {};
  global.Views.historial = render;
})(typeof window !== "undefined" ? window : globalThis);
