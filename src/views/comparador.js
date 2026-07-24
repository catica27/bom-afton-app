(function (global) {
  "use strict";

  function render(container) {
    let productId = Store.state.products[0] ? Store.state.products[0].id : null;
    let presId = null;
    let costOverridePct = {}; // materiaPrimaId -> % de cambio (ej. 10 = +10%)
    let ingredienteOverride = {}; // idx -> nuevo % (0-100)
    let marginOverride = null;

    function producto() { return Store.productsById().get(productId); }

    function pickDefaultPres(p) {
      const primera = p.presentaciones.find((x) => x.comercializado) || p.presentaciones[0];
      return primera ? primera.presentacionId : null;
    }

    function draw() {
      const p = producto();
      if (!p) { container.innerHTML = "<p>No hay productos.</p>"; return; }
      if (!presId) presId = pickDefaultPres(p);

      container.innerHTML = `
        <h1>Comparador de escenarios</h1>
        <p class="page-sub">Simula cambios de costo o fórmula sin guardarlos, y compara el impacto antes/después.</p>
        <div class="toolbar">
          <select id="cmp-producto" style="min-width:260px"></select>
          <select id="cmp-pres" style="min-width:140px"></select>
          <div class="spacer"></div>
          <button class="ghost" id="cmp-reset">Restablecer simulación</button>
        </div>
        <div class="grid-2">
          <div class="card">
            <h2>Panel de simulación</h2>
            <div class="field" style="margin-bottom:0.75rem">
              <label>Factor de margen (actual: <span id="cmp-margen-actual"></span>)</label>
              <input id="cmp-margin" type="number" step="0.01" placeholder="dejar vacío = sin cambio" />
            </div>
            <h2 style="font-size:0.85rem;margin-top:1rem">Costo de materias primas (% de cambio)</h2>
            <div id="cmp-mp-controls"></div>
            <h2 style="font-size:0.85rem;margin-top:1rem">% de participación en la fórmula</h2>
            <div id="cmp-ing-controls"></div>
          </div>
          <div class="card">
            <h2>Impacto</h2>
            <div id="cmp-impact"></div>
          </div>
        </div>
        <div class="card" style="padding:0">
          <div class="table-wrap"><table id="cmp-table"></table></div>
        </div>
      `;

      const selProd = container.querySelector("#cmp-producto");
      selProd.innerHTML = Store.state.products
        .slice()
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map((prod) => `<option value="${prod.id}" ${prod.id === productId ? "selected" : ""}>${UI.escapeHtml(prod.nombre)}</option>`)
        .join("");
      selProd.addEventListener("change", (e) => {
        productId = e.target.value; presId = null; costOverridePct = {}; ingredienteOverride = {}; marginOverride = null; draw();
      });

      const selPres = container.querySelector("#cmp-pres");
      selPres.innerHTML = p.presentaciones
        .filter((x) => x.presentacionId)
        .map((pr) => `<option value="${pr.presentacionId}" ${pr.presentacionId === presId ? "selected" : ""}>${UI.escapeHtml(pr.presentacionLabel)}</option>`)
        .join("");
      selPres.addEventListener("change", (e) => { presId = e.target.value; draw(); });

      container.querySelector("#cmp-reset").addEventListener("click", () => {
        costOverridePct = {}; ingredienteOverride = {}; marginOverride = null; draw();
      });

      const before = Store.getDesglose(productId, presId);
      container.querySelector("#cmp-margen-actual").textContent = "×" + (before ? before.margenAplicado : "?");

      const rawById = Store.rawMaterialsById();
      const usadas = Array.from(new Set(p.ingredientes.map((i) => i.materiaPrimaId))).filter((id) => rawById.has(id));
      container.querySelector("#cmp-mp-controls").innerHTML = usadas
        .map((mid) => {
          const mp = rawById.get(mid);
          return `<div class="field" style="margin-bottom:0.4rem">
            <label>${UI.escapeHtml(mp.nombre)} (actual ${UI.money(mp.costoUnitario)}/${mp.unidadCompra})</label>
            <input data-mp="${mid}" type="number" step="1" placeholder="0%" value="${costOverridePct[mid] ?? ""}" style="width:100px" />
          </div>`;
        })
        .join("") || `<p class="muted">Sin materias primas.</p>`;

      container.querySelector("#cmp-ing-controls").innerHTML = p.ingredientes
        .map((ing, idx) => {
          const mp = rawById.get(ing.materiaPrimaId);
          return `<div class="field" style="margin-bottom:0.4rem">
            <label>${UI.escapeHtml(mp ? mp.nombre : ing.materiaPrimaNombre)} (actual ${(ing.porcentaje * 100).toFixed(2)}%)</label>
            <input data-ing="${idx}" type="number" step="0.01" placeholder="sin cambio" value="${ingredienteOverride[idx] ?? ""}" style="width:100px" />
          </div>`;
        })
        .join("") || `<p class="muted">Sin ingredientes.</p>`;

      container.querySelector("#cmp-margin").value = marginOverride ?? "";

      container.querySelectorAll("[data-mp]").forEach((input) => {
        input.addEventListener("input", UI.debounce((e) => {
          const v = e.target.value;
          costOverridePct[e.target.getAttribute("data-mp")] = v === "" ? undefined : parseFloat(v);
          recomputeAndRenderImpact();
        }, 150));
      });
      container.querySelectorAll("[data-ing]").forEach((input) => {
        input.addEventListener("input", UI.debounce((e) => {
          const v = e.target.value;
          ingredienteOverride[e.target.getAttribute("data-ing")] = v === "" ? undefined : parseFloat(v);
          recomputeAndRenderImpact();
        }, 150));
      });
      container.querySelector("#cmp-margin").addEventListener("input", UI.debounce((e) => {
        marginOverride = e.target.value === "" ? null : parseFloat(e.target.value);
        recomputeAndRenderImpact();
      }, 150));

      recomputeAndRenderImpact();
    }

    function computeAfter() {
      const p = producto();
      const pres = Store.presentationsById().get(presId);
      if (!p || !pres) return null;

      const rawById = Store.rawMaterialsById();
      const simRawById = new Map(rawById);
      for (const [mid, pctChange] of Object.entries(costOverridePct)) {
        if (pctChange === undefined || isNaN(pctChange)) continue;
        const original = rawById.get(mid);
        if (!original) continue;
        simRawById.set(mid, Object.assign({}, original, { costoUnitario: original.costoUnitario * (1 + pctChange / 100) }));
      }

      const simIngredientes = p.ingredientes.map((ing, idx) => {
        const override = ingredienteOverride[idx];
        if (override === undefined || isNaN(override)) return ing;
        return Object.assign({}, ing, { porcentaje: override / 100 });
      });
      const simProducto = Object.assign({}, p, { ingredientes: simIngredientes });

      let margenes = Store.state.marginRules;
      if (marginOverride !== null && !isNaN(marginOverride)) {
        margenes = margenes.map((m) => (m.valor === p.origenAceiteBase ? Object.assign({}, m, { factor: marginOverride }) : m));
      }

      const pkg = Store.packagingByPresId().get(presId);
      return CalcEngine.calcularDesglose({
        producto: simProducto,
        presentacion: pres,
        materiasPrimasById: simRawById,
        costosIndirectos: Store.state.indirectCosts,
        lineasEmpaque: pkg ? pkg.lineas : [],
        margenes,
        tolerancia: Store.state.tolerancia,
      });
    }

    function recomputeAndRenderImpact() {
      const before = Store.getDesglose(productId, presId);
      const after = computeAfter();
      const impactEl = container.querySelector("#cmp-impact");
      const tableEl = container.querySelector("#cmp-table");
      if (!before || !after) return;

      const deltaCosto = after.costoTotalPresentacion - before.costoTotalPresentacion;
      const deltaPrecio = after.precioVenta - before.precioVenta;
      const deltaPct = before.costoTotalPresentacion ? (deltaCosto / before.costoTotalPresentacion) * 100 : 0;

      impactEl.innerHTML = `
        <div class="grid-2">
          <div class="stat"><div class="label">Δ Costo total</div><div class="value" style="color:${deltaCosto > 0 ? "var(--danger)" : deltaCosto < 0 ? "#0b6b45" : "inherit"}">${deltaCosto >= 0 ? "+" : ""}${UI.money(deltaCosto)} (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%)</div></div>
          <div class="stat"><div class="label">Δ Precio de venta</div><div class="value" style="color:${deltaPrecio > 0 ? "var(--danger)" : deltaPrecio < 0 ? "#0b6b45" : "inherit"}">${deltaPrecio >= 0 ? "+" : ""}${UI.money(deltaPrecio)}</div></div>
        </div>
      `;

      const rows = [
        ["Materia prima", before.costoMateriaPrima.subtotal, after.costoMateriaPrima.subtotal],
        ["Costos indirectos", before.costosIndirectos.subtotal, after.costosIndirectos.subtotal],
        ["Empaque", before.empaque.subtotal, after.empaque.subtotal],
        ["Costo total", before.costoTotalPresentacion, after.costoTotalPresentacion],
        ["Precio de venta", before.precioVenta, after.precioVenta],
      ];
      tableEl.innerHTML = `
        <thead><tr><th>Concepto</th><th class="num">Antes</th><th class="num">Después</th><th class="num">Δ</th></tr></thead>
        <tbody>
          ${rows
            .map(([label, a, b]) => {
              const d = b - a;
              return `<tr><td>${label}</td><td class="num mono">${UI.money(a)}</td><td class="num mono"><strong>${UI.money(b)}</strong></td><td class="num mono" style="color:${d > 0.001 ? "var(--danger)" : d < -0.001 ? "#0b6b45" : "inherit"}">${d >= 0 ? "+" : ""}${UI.money(d)}</td></tr>`;
            })
            .join("")}
        </tbody>
      `;
    }

    draw();
    const unsub = Store.subscribe(draw);
    return unsub;
  }

  global.Views = global.Views || {};
  global.Views.comparador = render;
})(typeof window !== "undefined" ? window : globalThis);
