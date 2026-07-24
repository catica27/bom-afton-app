(function (global) {
  "use strict";

  function usedIds() {
    const s = new Set();
    for (const p of Store.state.products) {
      for (const ing of p.ingredientes) if (ing.materiaPrimaId) s.add(ing.materiaPrimaId);
    }
    return s;
  }

  function render(container) {
    let filtroCategoria = "";
    let filtroTexto = "";
    let soloNoUsados = false;

    container.appendChild(
      UI.el(`
      <div>
        <h1>Materias primas</h1>
        <p class="page-sub">Aceites base y aditivos, con su costo unitario. Editar aquí recalcula todos los productos en vivo.</p>
        <div class="toolbar">
          <input type="search" id="mp-search" placeholder="Buscar…" style="width:220px" />
          <select id="mp-categoria">
            <option value="">Todas las categorías</option>
            <option value="aceite_base">Aceite base</option>
            <option value="aditivo">Aditivo</option>
            <option value="otro">Otro</option>
          </select>
          <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.85rem;color:var(--text-secondary)">
            <input type="checkbox" id="mp-no-usado" /> Solo no usadas (limpieza)
          </label>
          <div class="spacer"></div>
          <button class="primary" id="mp-add">+ Nueva materia prima</button>
        </div>
        <div class="card" style="padding:0">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th><th>Categoría</th><th>Unidad</th><th class="num">Costo unitario</th>
                  <th>Origen</th><th>Actualizado</th><th>Uso</th><th></th>
                </tr>
              </thead>
              <tbody id="mp-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `)
    );

    const tbody = container.querySelector("#mp-tbody");

    function renderTable() {
      const used = usedIds();
      let items = Store.state.rawMaterials.slice();
      if (filtroCategoria) items = items.filter((m) => m.categoria === filtroCategoria);
      if (filtroTexto) {
        const t = filtroTexto.toLowerCase();
        items = items.filter((m) => m.nombre.toLowerCase().includes(t));
      }
      if (soloNoUsados) items = items.filter((m) => !used.has(m.id));
      items.sort((a, b) => a.nombre.localeCompare(b.nombre));

      tbody.innerHTML = items
        .map((m) => {
          const isUsed = used.has(m.id);
          const faltaCosto = m.costoUnitario === null || m.costoUnitario === undefined;
          return `
          <tr data-id="${m.id}">
            <td><input class="editable-cell" data-field="nombre" value="${UI.escapeHtml(m.nombre)}" /></td>
            <td>
              <select class="editable-cell" data-field="categoria">
                <option value="aceite_base" ${m.categoria === "aceite_base" ? "selected" : ""}>Aceite base</option>
                <option value="aditivo" ${m.categoria === "aditivo" ? "selected" : ""}>Aditivo</option>
                <option value="otro" ${m.categoria === "otro" ? "selected" : ""}>Otro</option>
              </select>
            </td>
            <td>
              <select class="editable-cell" data-field="unidadCompra">
                <option value="L" ${m.unidadCompra === "L" ? "selected" : ""}>L</option>
                <option value="kg" ${m.unidadCompra === "kg" ? "selected" : ""}>kg</option>
              </select>
            </td>
            <td class="num">
              <input class="editable-cell mono text-right" data-field="costoUnitario" type="number" step="0.0001" value="${m.costoUnitario ?? ""}" style="${faltaCosto ? "border-color:var(--danger);background:var(--danger-bg)" : ""}" />
            </td>
            <td>
              <select class="editable-cell" data-field="origen">
                <option value="" ${!m.origen ? "selected" : ""}>—</option>
                <option value="local" ${m.origen === "local" ? "selected" : ""}>Local</option>
                <option value="importado" ${m.origen === "importado" ? "selected" : ""}>Importado</option>
              </select>
            </td>
            <td class="muted" style="font-size:0.8rem">${m.fechaActualizacion || "—"}</td>
            <td>${isUsed ? '<span class="badge activo">En uso</span>' : '<span class="badge warn">No usada</span>'}</td>
            <td><button class="ghost danger" data-del="${m.id}" title="Eliminar">✕</button></td>
          </tr>`;
        })
        .join("");

      tbody.querySelectorAll("[data-field]").forEach((input) => {
        input.addEventListener("change", (e) => {
          const tr = e.target.closest("tr");
          const id = tr.getAttribute("data-id");
          const field = e.target.getAttribute("data-field");
          let value = e.target.value;
          if (field === "costoUnitario") value = value === "" ? null : parseFloat(value);
          if (field === "origen" && value === "") value = null;
          Store.updateRawMaterial(id, { [field]: value });
        });
      });
      tbody.querySelectorAll("[data-del]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-del");
          const m = Store.state.rawMaterials.find((x) => x.id === id);
          if (used.has(id)) {
            alert(`"${m.nombre}" está usada en al menos una fórmula. Elimínala de las fórmulas antes de borrarla del catálogo.`);
            return;
          }
          if (confirm(`¿Eliminar "${m.nombre}" del catálogo?`)) Store.deleteRawMaterial(id);
        });
      });
    }

    container.querySelector("#mp-search").addEventListener("input", UI.debounce((e) => { filtroTexto = e.target.value; renderTable(); }, 150));
    container.querySelector("#mp-categoria").addEventListener("change", (e) => { filtroCategoria = e.target.value; renderTable(); });
    container.querySelector("#mp-no-usado").addEventListener("change", (e) => { soloNoUsados = e.target.checked; renderTable(); });
    container.querySelector("#mp-add").addEventListener("click", () => {
      Store.addRawMaterial({
        nombre: "Nueva materia prima",
        categoria: "aditivo",
        unidadCompra: "kg",
        costoUnitario: 0,
        origen: null,
        fechaActualizacion: new Date().toISOString().slice(0, 10),
        notas: null,
      });
    });

    renderTable();
    const unsub = Store.subscribe(renderTable);
    return unsub;
  }

  global.Views = global.Views || {};
  global.Views.materiasPrimas = render;
})(typeof window !== "undefined" ? window : globalThis);
