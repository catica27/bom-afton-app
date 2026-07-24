(function (global) {
  "use strict";

  function render(container) {
    let filtroTexto = "";
    let filtroFamilia = "";
    const familias = Array.from(new Set(Store.state.products.map((p) => p.familia))).sort();

    container.appendChild(
      UI.el(`
      <div>
        <h1>Productos / Fórmulas</h1>
        <p class="page-sub">Selecciona un producto para editar su fórmula, ver la ficha de costo y su historial.</p>
        <div class="toolbar">
          <input type="search" id="pl-search" placeholder="Buscar producto…" style="width:220px" />
          <select id="pl-familia"><option value="">Todas las familias</option>${familias
            .map((f) => `<option value="${UI.escapeHtml(f)}">${UI.escapeHtml(f)}</option>`)
            .join("")}</select>
          <div class="spacer"></div>
          <button class="primary" id="pl-add">+ Nuevo producto</button>
        </div>
        <div class="card" style="padding:0">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Producto</th><th>Familia</th><th>Origen BO</th><th class="num">Ingredientes</th><th class="num">Presentaciones</th><th>Estado</th></tr></thead>
              <tbody id="pl-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `)
    );

    const tbody = container.querySelector("#pl-tbody");
    function renderTable() {
      let items = Store.state.products.slice();
      if (filtroFamilia) items = items.filter((p) => p.familia === filtroFamilia);
      if (filtroTexto) {
        const t = filtroTexto.toLowerCase();
        items = items.filter((p) => p.nombre.toLowerCase().includes(t));
      }
      items.sort((a, b) => a.nombre.localeCompare(b.nombre));
      tbody.innerHTML = items
        .map(
          (p) => `
        <tr data-goto="${p.id}" style="cursor:pointer">
          <td><a class="link">${UI.escapeHtml(p.nombre)}</a></td>
          <td>${UI.escapeHtml(p.familia)}</td>
          <td><span class="badge ${p.origenAceiteBase === "BO local" ? "local" : "imp"}">${UI.escapeHtml(p.origenAceiteBase || "—")}</span></td>
          <td class="num">${p.ingredientes.length}</td>
          <td class="num">${p.presentaciones.filter((x) => x.comercializado).length} / ${p.presentaciones.length}</td>
          <td><span class="badge ${p.estado === "activo" ? "activo" : "descontinuado"}">${UI.escapeHtml(p.estado)}</span></td>
        </tr>`
        )
        .join("");
      tbody.querySelectorAll("[data-goto]").forEach((tr) => {
        tr.addEventListener("click", () => Router.navigate("/productos/" + tr.getAttribute("data-goto")));
      });
    }

    container.querySelector("#pl-search").addEventListener("input", UI.debounce((e) => { filtroTexto = e.target.value; renderTable(); }, 150));
    container.querySelector("#pl-familia").addEventListener("change", (e) => { filtroFamilia = e.target.value; renderTable(); });
    container.querySelector("#pl-add").addEventListener("click", async () => {
      const nombre = prompt("Nombre del nuevo producto:");
      if (!nombre) return;
      const id = "prod-" + nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36).slice(-4);
      await Store.addProduct({
        id, nombre, familia: "Sin clasificar", origenAceiteBase: "BO local",
        densidadKgL: 0.86, estado: "activo", comentarios: null, especificacion: nombre,
        ingredientes: [], presentaciones: Store.state.presentations.map((pr) => ({
          presentacionId: pr.id, presentacionLabel: pr.nombre, codigo: "", volumenL: pr.volumenL,
          nombreCompleto: null, comercializado: false, verificacionExcel: null,
        })),
      });
      Router.navigate("/productos/" + id);
    });

    renderTable();
    const unsub = Store.subscribe(renderTable);
    return unsub;
  }

  global.Views = global.Views || {};
  global.Views.productosLista = render;
})(typeof window !== "undefined" ? window : globalThis);
