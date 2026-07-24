(function (global) {
  "use strict";

  function buildRows() {
    const rows = [];
    for (const p of Store.state.products) {
      for (const pres of p.presentaciones) {
        if (!pres.presentacionId) continue;
        const d = Store.getDesglose(p.id, pres.presentacionId);
        if (!d) continue;
        const margenObjetivo = d.margenAplicado;
        const margenReal = d.costoTotalPresentacion ? d.precioVenta / d.costoTotalPresentacion : null;
        rows.push({
          producto: p,
          presentacion: pres,
          desglose: d,
          margenRealPct: margenReal ? (margenReal - 1) * 100 : null,
          margenObjetivoPct: (margenObjetivo - 1) * 100,
        });
      }
    }
    return rows;
  }

  function render(container) {
    let sortKey = "producto";
    let sortDir = 1;
    let filtroFamilia = "";
    let filtroTexto = "";
    let filtroWarnings = false;

    const familias = Array.from(new Set(Store.state.products.map((p) => p.familia))).sort();

    container.appendChild(
      UI.el(`
      <div>
        <h1>Dashboard</h1>
        <p class="page-sub">Costo y precio de venta calculados en vivo para cada producto × presentación.</p>
        <div class="grid-3" id="dash-stats"></div>
        <div class="toolbar">
          <input type="search" id="dash-search" placeholder="Buscar producto…" style="width:220px" />
          <select id="dash-familia"><option value="">Todas las familias</option>${familias
            .map((f) => `<option value="${UI.escapeHtml(f)}">${UI.escapeHtml(f)}</option>`)
            .join("")}</select>
          <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.85rem;color:var(--text-secondary)">
            <input type="checkbox" id="dash-warn-only" /> Solo con advertencias
          </label>
          <div class="spacer"></div>
          <span class="muted" id="dash-count"></span>
        </div>
        <div class="card" style="padding:0">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th data-key="producto">Producto</th>
                  <th data-key="familia">Familia</th>
                  <th data-key="origen">Origen</th>
                  <th data-key="presentacion">Presentación</th>
                  <th class="num" data-key="costo">Costo total</th>
                  <th class="num" data-key="precio">Precio venta</th>
                  <th class="num" data-key="margenReal">Margen real</th>
                  <th class="num" data-key="margenObj">Margen objetivo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody id="dash-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `)
    );

    const tbody = container.querySelector("#dash-tbody");
    const countEl = container.querySelector("#dash-count");
    const statsEl = container.querySelector("#dash-stats");

    function renderStats(rows) {
      const totalProductos = Store.state.products.length;
      const conWarnings = rows.filter((r) => r.desglose.warnings.length > 0).length;
      const margenPromedio =
        rows.reduce((a, r) => a + (r.margenRealPct || 0), 0) / (rows.length || 1);
      statsEl.innerHTML = `
        <div class="stat"><div class="label">Productos activos</div><div class="value">${totalProductos}</div></div>
        <div class="stat"><div class="label">SKU con advertencias</div><div class="value" style="color:${conWarnings ? "var(--danger)" : "inherit"}">${conWarnings}</div></div>
        <div class="stat"><div class="label">Margen real promedio</div><div class="value">${UI.pct(margenPromedio, 1)}</div></div>
      `;
    }

    function renderTable() {
      let rows = buildRows();
      if (filtroFamilia) rows = rows.filter((r) => r.producto.familia === filtroFamilia);
      if (filtroTexto) {
        const t = filtroTexto.toLowerCase();
        rows = rows.filter((r) => r.producto.nombre.toLowerCase().includes(t) || (r.presentacion.nombreCompleto || "").toLowerCase().includes(t));
      }
      if (filtroWarnings) rows = rows.filter((r) => r.desglose.warnings.length > 0);

      rows.sort((a, b) => {
        let av, bv;
        switch (sortKey) {
          case "familia": av = a.producto.familia; bv = b.producto.familia; break;
          case "origen": av = a.producto.origenAceiteBase; bv = b.producto.origenAceiteBase; break;
          case "presentacion": av = a.presentacion.presentacionLabel; bv = b.presentacion.presentacionLabel; break;
          case "costo": av = a.desglose.costoTotalPresentacion; bv = b.desglose.costoTotalPresentacion; break;
          case "precio": av = a.desglose.precioVenta; bv = b.desglose.precioVenta; break;
          case "margenReal": av = a.margenRealPct; bv = b.margenRealPct; break;
          case "margenObj": av = a.margenObjetivoPct; bv = b.margenObjetivoPct; break;
          default: av = a.producto.nombre; bv = b.producto.nombre;
        }
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * sortDir;
      });

      renderStats(rows);
      countEl.textContent = `${rows.length} filas`;

      tbody.innerHTML = rows
        .map((r) => {
          const warn = r.desglose.warnings.length;
          const margenDelta = r.margenRealPct - r.margenObjetivoPct;
          const deltaColor = Math.abs(margenDelta) < 0.5 ? "var(--text-secondary)" : margenDelta < 0 ? "var(--danger)" : "#0b6b45";
          return `
          <tr>
            <td><a class="link" data-goto="${r.producto.id}">${UI.escapeHtml(r.producto.nombre)}</a></td>
            <td>${UI.escapeHtml(r.producto.familia)}</td>
            <td><span class="badge ${r.producto.origenAceiteBase === "BO local" ? "local" : "imp"}">${UI.escapeHtml(r.producto.origenAceiteBase || "—")}</span></td>
            <td>${UI.escapeHtml(r.presentacion.presentacionLabel)}</td>
            <td class="num mono">${UI.money(r.desglose.costoTotalPresentacion)}</td>
            <td class="num mono">${UI.money(r.desglose.precioVenta)}</td>
            <td class="num mono" style="color:${deltaColor}">${UI.pct(r.margenRealPct, 1)}</td>
            <td class="num mono muted">${UI.pct(r.margenObjetivoPct, 1)}</td>
            <td>${warn ? `<span class="badge warn" title="${UI.escapeHtml(r.desglose.warnings.map((w) => w.mensaje).join(" | "))}">⚠ ${warn}</span>` : `<span class="badge activo">OK</span>`}</td>
          </tr>`;
        })
        .join("");

      tbody.querySelectorAll("[data-goto]").forEach((a) => {
        a.addEventListener("click", () => Router.navigate("/productos/" + a.getAttribute("data-goto")));
      });
    }

    container.querySelectorAll("th[data-key]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.getAttribute("data-key");
        if (sortKey === key) sortDir *= -1;
        else { sortKey = key; sortDir = 1; }
        renderTable();
      });
    });
    container.querySelector("#dash-search").addEventListener(
      "input",
      UI.debounce((e) => { filtroTexto = e.target.value; renderTable(); }, 150)
    );
    container.querySelector("#dash-familia").addEventListener("change", (e) => { filtroFamilia = e.target.value; renderTable(); });
    container.querySelector("#dash-warn-only").addEventListener("change", (e) => { filtroWarnings = e.target.checked; renderTable(); });

    renderTable();
    const unsub = Store.subscribe(renderTable);
    return unsub;
  }

  global.Views = global.Views || {};
  global.Views.dashboard = render;
})(typeof window !== "undefined" ? window : globalThis);
