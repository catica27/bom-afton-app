(function (global) {
  "use strict";

  function render(container, params) {
    const sub = params.sub || "indirectos";
    container.appendChild(
      UI.el(`
      <div>
        <h1>Configuración</h1>
        <p class="page-sub">Tarifas y reglas globales usadas por el motor de cálculo. Cambiarlas recalcula todos los productos en vivo.</p>
        <div class="tabs">
          <button data-sub="indirectos" class="${sub === "indirectos" ? "active" : ""}">Costos indirectos</button>
          <button data-sub="empaque" class="${sub === "empaque" ? "active" : ""}">Empaque</button>
          <button data-sub="margenes" class="${sub === "margenes" ? "active" : ""}">Márgenes</button>
          <button data-sub="general" class="${sub === "general" ? "active" : ""}">General</button>
        </div>
        <div id="cfg-body"></div>
      </div>
    `)
    );
    container.querySelectorAll(".tabs button").forEach((b) => {
      b.addEventListener("click", () => Router.navigate("/configuracion/" + b.getAttribute("data-sub")));
    });
    const body = container.querySelector("#cfg-body");

    if (sub === "indirectos") renderIndirectos(body);
    else if (sub === "empaque") renderEmpaque(body);
    else if (sub === "margenes") renderMargenes(body);
    else renderGeneral(body);

    const unsub = Store.subscribe(() => {
      body.innerHTML = "";
      if (sub === "indirectos") renderIndirectos(body);
      else if (sub === "empaque") renderEmpaque(body);
      else if (sub === "margenes") renderMargenes(body);
      else renderGeneral(body);
    });
    return unsub;
  }

  function renderIndirectos(body) {
    const items = Store.state.indirectCosts;
    body.appendChild(
      UI.el(`
      <div class="card">
        <h2>Costos indirectos (tarifa $/L, aplicada al volumen de cada presentación)</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Rubro</th><th class="num">Tarifa $/L</th><th></th></tr></thead>
            <tbody id="ind-tbody">
              ${items.map((i) => `
                <tr data-id="${i.id}">
                  <td><input class="editable-cell" data-field="nombre" value="${UI.escapeHtml(i.nombre)}" /></td>
                  <td class="num"><input class="editable-cell mono text-right" data-field="tarifaPorLitro" type="number" step="0.0001" value="${i.tarifaPorLitro}" /></td>
                  <td><button class="ghost danger" data-del="${i.id}">✕</button></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <button class="primary" id="ind-add" style="margin-top:0.75rem">+ Nuevo rubro</button>
      </div>
    `)
    );
    body.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("change", (e) => {
        const id = e.target.closest("tr").getAttribute("data-id");
        const field = e.target.getAttribute("data-field");
        const value = field === "tarifaPorLitro" ? parseFloat(e.target.value || "0") : e.target.value;
        Store.updateIndirectCost(id, { [field]: value });
      });
    });
    body.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => { if (confirm("¿Eliminar este rubro de costo indirecto?")) Store.deleteIndirectCost(btn.getAttribute("data-del")); });
    });
    body.querySelector("#ind-add").addEventListener("click", () => {
      Store.addIndirectCost({ nombre: "Nuevo rubro", tarifaPorLitro: 0 });
    });
  }

  function renderEmpaque(body) {
    const presentations = Store.state.presentations;
    const pkgByPres = Store.packagingByPresId();
    body.appendChild(
      UI.el(`
      <div>
        ${presentations
          .map((pr) => {
            const pkg = pkgByPres.get(pr.id) || { lineas: [] };
            const total = pkg.lineas.reduce((a, l) => a + (l.costo || 0), 0);
            return `
            <div class="card" data-pres="${pr.id}">
              <h2>${UI.escapeHtml(pr.nombre)} <span class="muted" style="font-weight:400;font-size:0.85rem">(${pr.volumenL} L) — total $${total.toFixed(4)}</span></h2>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Concepto</th><th class="num">Costo</th><th></th></tr></thead>
                  <tbody>
                    ${pkg.lineas
                      .map(
                        (l, idx) => `
                      <tr>
                        <td><input class="editable-cell" data-idx="${idx}" data-field="concepto" value="${UI.escapeHtml(l.concepto)}" /></td>
                        <td class="num"><input class="editable-cell mono text-right" data-idx="${idx}" data-field="costo" type="number" step="0.0001" value="${l.costo}" /></td>
                        <td><button class="ghost danger" data-del="${idx}">✕</button></td>
                      </tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
              <button class="ghost" data-addline style="margin-top:0.5rem">+ Agregar línea</button>
            </div>`;
          })
          .join("")}
      </div>
    `)
    );
    body.querySelectorAll(".card[data-pres]").forEach((card) => {
      const presId = card.getAttribute("data-pres");
      card.querySelectorAll("[data-field]").forEach((input) => {
        input.addEventListener("change", (e) => {
          const idx = parseInt(e.target.getAttribute("data-idx"), 10);
          const field = e.target.getAttribute("data-field");
          const value = field === "costo" ? parseFloat(e.target.value || "0") : e.target.value;
          Store.updatePackagingLine(presId, idx, { [field]: value });
        });
      });
      card.querySelectorAll("[data-del]").forEach((btn) => {
        btn.addEventListener("click", () => Store.deletePackagingLine(presId, parseInt(btn.getAttribute("data-del"), 10)));
      });
      card.querySelector("[data-addline]").addEventListener("click", () => {
        Store.addPackagingLine(presId, { concepto: "Nueva línea", costo: 0 });
      });
    });
  }

  function renderMargenes(body) {
    const items = Store.state.marginRules;
    body.appendChild(
      UI.el(`
      <div class="card">
        <h2>Reglas de margen</h2>
        <p class="muted" style="font-size:0.85rem">El criterio determina qué campo del producto se compara contra "valor" para escoger el factor de margen (precio = costo × factor).</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Criterio (campo del producto)</th><th>Valor</th><th class="num">Factor</th><th class="num">Margen equivalente</th><th></th></tr></thead>
            <tbody>
              ${items
                .map(
                  (m) => `
                <tr data-id="${m.id}">
                  <td><input class="editable-cell" data-field="criterio" value="${UI.escapeHtml(m.criterio)}" /></td>
                  <td><input class="editable-cell" data-field="valor" value="${UI.escapeHtml(m.valor)}" /></td>
                  <td class="num"><input class="editable-cell mono text-right" data-field="factor" type="number" step="0.01" value="${m.factor}" style="width:90px" /></td>
                  <td class="num mono muted">${((m.factor - 1) * 100).toFixed(1)}%</td>
                  <td><button class="ghost danger" data-del="${m.id}">✕</button></td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <button class="primary" id="margin-add" style="margin-top:0.75rem">+ Nueva regla</button>
      </div>
    `)
    );
    body.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("change", (e) => {
        const id = e.target.closest("tr").getAttribute("data-id");
        const field = e.target.getAttribute("data-field");
        const value = field === "factor" ? parseFloat(e.target.value || "1") : e.target.value;
        Store.updateMarginRule(id, { [field]: value });
      });
    });
    body.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => { if (confirm("¿Eliminar esta regla de margen?")) Store.deleteMarginRule(btn.getAttribute("data-del")); });
    });
    body.querySelector("#margin-add").addEventListener("click", () => {
      Store.addMarginRule({ criterio: "origenAceiteBase", valor: "Nuevo valor", factor: 1.3 });
    });
  }

  function renderGeneral(body) {
    body.appendChild(
      UI.el(`
      <div class="card">
        <h2>Tolerancia de validación de fórmula</h2>
        <p class="muted" style="font-size:0.85rem">Diferencia máxima aceptada (en puntos porcentuales) para que la suma de una fórmula se considere válida frente al 100%.</p>
        <div class="field" style="max-width:200px">
          <label>Tolerancia (%)</label>
          <input id="tol-input" type="number" step="0.1" value="${Store.state.tolerancia}" />
        </div>
      </div>
    `)
    );
    body.querySelector("#tol-input").addEventListener("change", (e) => Store.setTolerancia(parseFloat(e.target.value || "0.5")));
  }

  global.Views = global.Views || {};
  global.Views.configuracion = render;
})(typeof window !== "undefined" ? window : globalThis);
