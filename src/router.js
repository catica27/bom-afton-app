// Router basado en hash, minimalista. Script clásico: window.Router.
(function (global) {
  "use strict";

  const routes = [];
  let currentCleanup = null;

  function register(pattern, renderFn) {
    // pattern: "/dashboard" o "/productos/:id"
    const paramNames = [];
    const regex = new RegExp(
      "^" +
        pattern.replace(/:[^/]+/g, (m) => {
          paramNames.push(m.slice(1));
          return "([^/]+)";
        }) +
        "$"
    );
    routes.push({ regex, paramNames, renderFn });
  }

  function parseHash() {
    let hash = location.hash.replace(/^#/, "");
    if (!hash) hash = "/dashboard";
    const [path, query] = hash.split("?");
    const params = {};
    if (query) {
      for (const part of query.split("&")) {
        const [k, v] = part.split("=");
        params[decodeURIComponent(k)] = decodeURIComponent(v || "");
      }
    }
    return { path, params };
  }

  async function handleChange() {
    const { path, params } = parseHash();
    const container = document.getElementById("main-content");
    for (const r of routes) {
      const m = path.match(r.regex);
      if (m) {
        r.paramNames.forEach((name, i) => (params[name] = m[i + 1]));
        if (typeof currentCleanup === "function") {
          try { currentCleanup(); } catch (e) { /* noop */ }
        }
        container.innerHTML = "";
        currentCleanup = await r.renderFn(container, params);
        updateActiveNav(path);
        window.scrollTo(0, 0);
        return;
      }
    }
    container.innerHTML = "<p>Página no encontrada.</p>";
  }

  function updateActiveNav(path) {
    document.querySelectorAll("#sidebar nav a").forEach((a) => {
      const target = a.getAttribute("href").replace(/^#/, "").split("?")[0].split("/").slice(0, 2).join("/");
      a.classList.toggle("active", path.split("/").slice(0, 2).join("/") === target);
    });
  }

  function start() {
    window.addEventListener("hashchange", handleChange);
    handleChange();
  }

  function navigate(path) {
    location.hash = path;
  }

  global.Router = { register, start, navigate, parseHash };
})(typeof window !== "undefined" ? window : globalThis);
