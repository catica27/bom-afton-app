(function () {
  "use strict";

  async function boot() {
    const content = document.getElementById("main-content");
    try {
      await Db.open();
      const seeded = await SeedLoader.seedIfEmpty();
      await Store.load();
      if (seeded) await Store.snapshotProductCosts();
    } catch (err) {
      content.innerHTML = `<div class="warning-box" style="background:var(--danger-bg);border-color:var(--danger);color:var(--danger)"><strong>Error al iniciar la app:</strong> ${UI.escapeHtml(err.message)}</div>`;
      console.error(err);
      return;
    }

    Router.register("/dashboard", Views.dashboard);
    Router.register("/materias-primas", Views.materiasPrimas);
    Router.register("/productos", Views.productosLista);
    Router.register("/productos/:id", Views.productoDetalle);
    Router.register("/configuracion/:sub", Views.configuracion);
    Router.register("/configuracion", Views.configuracion);
    Router.register("/comparador", Views.comparador);
    Router.register("/historial", Views.historial);
    Router.register("/import-export", Views.importExportView);

    Router.start();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
