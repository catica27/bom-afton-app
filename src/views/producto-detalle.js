(function (global) {
  "use strict";

  let costChart = null;
  let historyChart = null;

  function render(container, params) {
    const id = params.id;
    let activeTab = "formula";
    let activePresId = null;

    function getProduct() {
      return Store.productsById().get(id);
    }

    function shell() {
      const p = getProduct();
      if (!p) {
        container.innerHTML = `<p>Producto no encontrado. <a class="link" href="#/productos">Volver</a></p>`;
        return;
      }
      if (!activePresId) {
        const primera = p.presentaciones.find((x) => x.comercializado) || p.presentaciones[0];
        activePresId = primera ? primera.presentacionId : null;
      }
      container.innerHTML = `
        <div class="no-print">
          <a class="link" href="#/productos">← Productos</a>
        </div>
        <h1 id="pd-title">${UI.escapeHtml(p.nombre)}</h1>
        <p class="page-sub">${UI.escapeHtml(p.familia)} · ${UI.escapeHtml(p.especificacion || "")}</p>
        <div class="tabs no-print">
          <button data-tab="formula" class="${activeTab === "formula" ? "active" : ""}">Fórmula</button>
          <button data-tab="ficha" class="${activeTab === "ficha" ? "active" : ""}">Ficha de costo</button>
          <button data-tab="historial" class="${activeTab === "historial" ? "active" : ""}">Historial</button>
        </div>
        <div id="pd-body"></div>
      `;
      container.querySelectorAll(".tabs button").forEach((b) => {
        b.addEventListener("click", () => { activeTab = b.getAttribute("data-tab"); shell(); });
      });
      const body = container.querySelector("#pd-body");
      if (activeTab === "formula") renderFormula(body, p);
      else if (activeTab === "ficha") renderFicha(body, p);
      else renderHistorial(body, p);
    }

    // ---------------- Tab: Fórmula ----------------
    function renderFormula(body, p) {
      const rawMaterials = Store.state.rawMaterials.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
      const suma = p.ingredientes.reduce((a, i) => a + (i.porcentaje || 0), 0) * 100;
      const over = suma > 100.5;

      body.innerHTML = `
        <div class="card">
          <h2>Datos generales</h2>
          <div class="form-grid">
            <div class="field"><label>Nombre</label><input id="f-nombre" value="${UI.escapeHtml(p.nombre)}" /></div>
            <div class="field"><label>Familia</label><input id="f-familia" value="${UI.escapeHtml(p.familia)}" /></div>
            <div class="field"><label>Origen aceite base (define margen)</label>
              <select id="f-origen">
                ${Array.from(new Set(Store.state.marginRules.map((m) => m.valor)))
                  .map((v) => `<option value="${UI.escapeHtml(v)}" ${p.origenAceiteBase === v ? "selected" : ""}>${UI.escapeHtml(v)}</option>`)
                  .join("")}
              </select>
            </div>
            <div class="field"><label>Densidad (kg/L)</label><input id="f-densidad" type="number" step="0.001" value="${p.densidadKgL ?? ""}" /></div>
            <div class="field"><label>Estado</label>
              <select id="f-estado">
                <option value="activo" ${p.estado === "activo" ? "selected" : ""}>Activo</option>
                <option value="descontinuado" ${p.estado === "descontinuado" ? "selected" : ""}>Descontinuado</option>
              </select>
            </div>
          </div>
          <div class="field" style="margin-top:0.75rem"><label>Comentarios</label><textarea id="f-comentarios" rows="2" style="width:100%">${UI.escapeHtml(p.comentarios || "")}</textarea></div>
        </div>

        <div class="card">
          <h2>Fórmula (% de participación)</h2>
          <div style="margin-bottom:0.5rem">
            <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:0.25rem">
              <span>Suma: <strong>${UI.pct(suma)}</strong> (objetivo 100% ± ${Store.state.tolerancia}%)</span>
            </div>
            <div class="pct-bar-track"><div class="pct-bar-fill ${over ? "over" : ""}" style="width:${Math.min(suma, 100)}%"></div></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Materia prima</th><th>Categoría</th><th class="num">%</th><th class="num">Costo unitario</th><th></th></tr></thead>
              <tbody id="ing-tbody"></tbody>
            </table>
          </div>
          <div class="toolbar" style="margin-top:0.75rem">
            <select id="ing-add-select">
              <option value="">+ Agregar materia prima…</option>
              ${rawMaterials.map((m) => `<option value="${m.id}">${UI.escapeHtml(m.nombre)} (${m.categoria === "aceite_base" ? "aceite base" : "aditivo"})</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="card">
          <h2>Presentaciones comercializadas</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Presentación</th><th>Código</th><th>Nombre comercial</th><th class="num">Volumen (L)</th><th>Comercializado</th></tr></thead>
              <tbody id="pres-tbody"></tbody>
            </table>
          </div>
        </div>
      `;

      const rawById = Store.rawMaterialsById();
      const tbody = body.querySelector("#ing-tbody");
      tbody.innerHTML = p.ingredientes
        .map((ing, idx) => {
          const mp = rawById.get(ing.materiaPrimaId);
          const missing = !mp;
          return `
          <tr>
            <td>${missing ? `<span class="badge danger">${UI.escapeHtml(ing.materiaPrimaNombre || ing.materiaPrimaId)} (no encontrada)</span>` : UI.escapeHtml(mp.nombre)}</td>
            <td class="muted">${mp ? (mp.categoria === "aceite_base" ? "Aceite base" : "Aditivo") : "—"}</td>
            <td class="num"><input class="editable-cell mono text-right" data-idx="${idx}" type="number" step="0.01" style="width:80px" value="${(ing.porcentaje * 100).toFixed(3)}" /></td>
            <td class="num mono muted">${mp && mp.costoUnitario != null ? UI.money(mp.costoUnitario) + "/" + mp.unidadCompra : "sin costo"}</td>
            <td><button class="ghost danger" data-remove="${idx}">✕</button></td>
          </tr>`;
        })
        .join("") || `<tr><td colspan="5" class="muted">Sin ingredientes. Agrega materias primas abajo.</td></tr>`;

      function saveIngredientes(newList) {
        Store.updateProduct(p.id, { ingredientes: newList });
      }

      tbody.querySelectorAll("[data-idx]").forEach((input) => {
        input.addEventListener("change", (e) => {
          const idx = parseInt(e.target.getAttribute("data-idx"), 10);
          const list = p.ingredientes.map((x) => Object.assign({}, x));
          list[idx].porcentaje = parseFloat(e.target.value || "0") / 100;
          saveIngredientes(list);
        });
      });
      tbody.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.getAttribute("data-remove"), 10);
          const list = p.ingredientes.slice();
          list.splice(idx, 1);
          saveIngredientes(list);
        });
      });
      body.querySelector("#ing-add-select").addEventListener("change", (e) => {
        const mpId = e.target.value;
        if (!mpId) return;
        const mp = rawById.get(mpId);
        const list = p.ingredientes.concat([{ materiaPrimaId: mpId, materiaPrimaNombre: mp.nombre, porcentaje: 0 }]);
        saveIngredientes(list);
      });

      body.querySelector("#f-nombre").addEventListener("change", (e) => Store.updateProduct(p.id, { nombre: e.target.value }));
      body.querySelector("#f-familia").addEventListener("change", (e) => Store.updateProduct(p.id, { familia: e.target.value }));
      body.querySelector("#f-origen").addEventListener("change", (e) => Store.updateProduct(p.id, { origenAceiteBase: e.target.value }));
      body.querySelector("#f-densidad").addEventListener("change", (e) => Store.updateProduct(p.id, { densidadKgL: parseFloat(e.target.value || "0") }));
      body.querySelector("#f-estado").addEventListener("change", (e) => Store.updateProduct(p.id, { estado: e.target.value }));
      body.querySelector("#f-comentarios").addEventListener("change", (e) => Store.updateProduct(p.id, { comentarios: e.target.value }));

      const presTbody = body.querySelector("#pres-tbody");
      presTbody.innerHTML = p.presentaciones
        .map(
          (pr, idx) => `
        <tr>
          <td>${UI.escapeHtml(pr.presentacionLabel)}</td>
          <td><input class="editable-cell" data-pidx="${idx}" data-pfield="codigo" value="${UI.escapeHtml(pr.codigo || "")}" style="width:130px" /></td>
          <td><input class="editable-cell" data-pidx="${idx}" data-pfield="nombreCompleto" value="${UI.escapeHtml(pr.nombreCompleto || "")}" style="width:220px" /></td>
          <td class="num"><input class="editable-cell mono text-right" data-pidx="${idx}" data-pfield="volumenL" type="number" step="0.001" value="${pr.volumenL}" style="width:90px" /></td>
          <td><input type="checkbox" data-pidx="${idx}" data-pfield="comercializado" ${pr.comercializado ? "checked" : ""} /></td>
        </tr>`
        )
        .join("");
      presTbody.querySelectorAll("[data-pidx]").forEach((input) => {
        input.addEventListener("change", (e) => {
          const idx = parseInt(e.target.getAttribute("data-pidx"), 10);
          const field = e.target.getAttribute("data-pfield");
          const list = p.presentaciones.map((x) => Object.assign({}, x));
          list[idx][field] = field === "comercializado" ? e.target.checked : field === "volumenL" ? parseFloat(e.target.value || "0") : e.target.value;
          Store.updateProduct(p.id, { presentaciones: list });
        });
      });
    }

    // ---------------- Tab: Ficha de costo ----------------
    function renderFicha(body, p) {
      const comercializadas = p.presentaciones.filter((x) => x.presentacionId);
      body.innerHTML = `
        <div class="toolbar no-print">
          <div class="tabs" id="pres-selector" style="border:none;margin:0">
            ${comercializadas
              .map((pr) => `<button data-pres="${pr.presentacionId}" class="${pr.presentacionId === activePresId ? "active" : ""}">${UI.escapeHtml(pr.presentacionLabel)}</button>`)
              .join("")}
          </div>
          <div class="spacer"></div>
          <button id="btn-print">🖨 Imprimir / Exportar PDF</button>
        </div>
        <div id="ficha-content"></div>
      `;
      body.querySelectorAll("#pres-selector button").forEach((b) => {
        b.addEventListener("click", () => { activePresId = b.getAttribute("data-pres"); shell(); });
      });
      body.querySelector("#btn-print").addEventListener("click", () => window.print());

      const pres = comercializadas.find((x) => x.presentacionId === activePresId);
      const content = body.querySelector("#ficha-content");
      if (!pres) { content.innerHTML = `<p class="muted">Sin presentaciones configuradas.</p>`; return; }

      const d = Store.getDesglose(p.id, activePresId);
      if (!d) { content.innerHTML = `<p class="muted">No se pudo calcular.</p>`; return; }

      const warnHtml = d.warnings.length
        ? `<div class="warning-box"><strong>${d.warnings.length} advertencia(s):</strong><ul>${d.warnings.map((w) => `<li>${UI.escapeHtml(w.mensaje)}</li>`).join("")}</ul></div>`
        : `<div class="warning-box none">Sin advertencias — fórmula y costos completos.</div>`;

      const excelCompareHtml = pres.verificacionExcel
        ? `<p class="muted" style="font-size:0.8rem">Excel original: costo materia prima ${UI.money(pres.verificacionExcel.costoMateriaPrima)} · costo total ${UI.money(pres.verificacionExcel.costoTotal)} · precio ${UI.money(pres.verificacionExcel.precio)}</p>`
        : "";

      content.innerHTML = `
        <div class="card">
          <h2>Ficha de costo — ${UI.escapeHtml(pres.nombreCompleto || p.nombre + " " + pres.presentacionLabel)}</h2>
          <p class="muted" style="font-size:0.85rem">Código: ${UI.escapeHtml(pres.codigo || "—")} · Volumen: ${pres.volumenL} L · Densidad: ${p.densidadKgL} kg/L</p>
          ${warnHtml}
          <div class="grid-2">
            <div>
              <table>
                <tbody>
                  <tr><th colspan="2">Materia prima</th></tr>
                  <tr><td>Aceites base</td><td class="num mono">${UI.money(d.costoMateriaPrima.aceitesBase)}</td></tr>
                  <tr><td>Aditivos</td><td class="num mono">${UI.money(d.costoMateriaPrima.aditivos)}</td></tr>
                  <tr><td><strong>Subtotal materia prima</strong></td><td class="num mono"><strong>${UI.money(d.costoMateriaPrima.subtotal)}</strong></td></tr>
                  <tr><th colspan="2">Costos indirectos</th></tr>
                  ${Object.keys(d.costosIndirectos).filter((k) => k !== "subtotal").map((k) => `<tr><td>${UI.escapeHtml(k)}</td><td class="num mono">${UI.money(d.costosIndirectos[k])}</td></tr>`).join("")}
                  <tr><td><strong>Subtotal indirectos</strong></td><td class="num mono"><strong>${UI.money(d.costosIndirectos.subtotal)}</strong></td></tr>
                  <tr><th colspan="2">Empaque</th></tr>
                  ${Object.keys(d.empaque).filter((k) => k !== "subtotal").map((k) => `<tr><td>${UI.escapeHtml(k)}</td><td class="num mono">${UI.money(d.empaque[k])}</td></tr>`).join("")}
                  <tr><td><strong>Subtotal empaque</strong></td><td class="num mono"><strong>${UI.money(d.empaque.subtotal)}</strong></td></tr>
                  <tr><td style="font-size:1.05rem"><strong>Costo total presentación</strong></td><td class="num mono" style="font-size:1.05rem"><strong>${UI.money(d.costoTotalPresentacion)}</strong></td></tr>
                  <tr><td>Costo por litro</td><td class="num mono">${UI.money(d.costoPorLitro)}</td></tr>
                  <tr><td>Margen aplicado</td><td class="num mono">×${d.margenAplicado}</td></tr>
                  <tr><td style="font-size:1.05rem;color:var(--brand)"><strong>Precio de venta</strong></td><td class="num mono" style="font-size:1.05rem;color:var(--brand)"><strong>${UI.money(d.precioVenta)}</strong></td></tr>
                  <tr><td>Precio por litro</td><td class="num mono">${UI.money(d.precioPorLitro)}</td></tr>
                </tbody>
              </table>
              ${excelCompareHtml}
            </div>
            <div>
              <canvas id="ficha-pie" height="260"></canvas>
            </div>
          </div>
        </div>
      `;

      if (costChart) { costChart.destroy(); costChart = null; }
      const ctx = content.querySelector("#ficha-pie");
      costChart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["Materia prima", "Costos indirectos", "Empaque"],
          datasets: [{
            data: [d.costoMateriaPrima.subtotal, d.costosIndirectos.subtotal, d.empaque.subtotal],
            backgroundColor: ["#2a78d6", "#eb6834", "#1baf7a"],
            borderColor: "#fcfcfb",
            borderWidth: 2,
          }],
        },
        options: {
          plugins: { legend: { position: "bottom" }, title: { display: true, text: "Composición del costo total" } },
        },
      });
    }

    // ---------------- Tab: Historial ----------------
    async function renderHistorial(body, p) {
      body.innerHTML = `
        <div class="card">
          <h2>Evolución del costo</h2>
          <select id="hist-pres">
            ${p.presentaciones.filter((x) => x.presentacionId).map((pr) => `<option value="${pr.presentacionId}" ${pr.presentacionId === activePresId ? "selected" : ""}>${UI.escapeHtml(pr.presentacionLabel)}</option>`).join("")}
          </select>
          <canvas id="hist-chart" height="220" style="margin-top:1rem"></canvas>
        </div>
        <div class="card">
          <h2>Cambios registrados</h2>
          <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Campo</th><th>Antes</th><th>Después</th></tr></thead><tbody id="hist-tbody"></tbody></table></div>
        </div>
      `;
      async function draw(presId) {
        const hist = await Store.getCostHistory(p.id, presId);
        const ctx = body.querySelector("#hist-chart");
        if (historyChart) { historyChart.destroy(); historyChart = null; }
        historyChart = new Chart(ctx, {
          type: "line",
          data: {
            labels: hist.map((h) => new Date(h.timestamp).toLocaleDateString("es-CO")),
            datasets: [
              { label: "Costo total", data: hist.map((h) => h.costoTotal), borderColor: "#2a78d6", backgroundColor: "#2a78d6", tension: 0.15, pointRadius: 3 },
              { label: "Precio venta", data: hist.map((h) => h.precioVenta), borderColor: "#1baf7a", backgroundColor: "#1baf7a", tension: 0.15, pointRadius: 3 },
            ],
          },
          options: { plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: false } } },
        });
        if (hist.length === 0) body.querySelector("#hist-chart").insertAdjacentHTML("afterend", `<p class="muted" id="hist-empty" style="margin-top:0.5rem">Aún no hay suficientes cambios registrados para graficar tendencia. Edita un costo o fórmula para empezar a construir el histórico.</p>`);
      }
      body.querySelector("#hist-pres").addEventListener("change", (e) => draw(e.target.value));
      await draw(activePresId);

      const allHist = await Store.getHistory(p.id);
      body.querySelector("#hist-tbody").innerHTML =
        allHist.map((h) => `<tr><td class="muted" style="font-size:0.8rem">${UI.fecha(h.timestamp)}</td><td>${UI.escapeHtml(h.campo)}</td><td class="mono">${UI.escapeHtml(JSON.stringify(h.antes))}</td><td class="mono">${UI.escapeHtml(JSON.stringify(h.despues))}</td></tr>`).join("") ||
        `<tr><td colspan="4" class="muted">Sin cambios registrados aún.</td></tr>`;
    }

    shell();
    const unsub = Store.subscribe(shell);
    return () => {
      unsub();
      if (costChart) { costChart.destroy(); costChart = null; }
      if (historyChart) { historyChart.destroy(); historyChart = null; }
    };
  }

  global.Views = global.Views || {};
  global.Views.productoDetalle = render;
})(typeof window !== "undefined" ? window : globalThis);
