// Utilidades de formato y helpers de DOM compartidos entre vistas.
(function (global) {
  "use strict";

  function money(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return Number(n).toFixed(decimals === undefined ? 2 : decimals) + "%";
  }
  function num(n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 2 });
  }
  function fecha(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "2-digit" }) +
      " " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  }
  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function downloadJson(obj, filename) {
    downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }), filename);
  }
  function downloadCsv(rows, filename) {
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
    downloadBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), filename);
  }
  function csvEscape(v) {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  global.UI = { money, pct, num, fecha, escapeHtml, el, debounce, downloadBlob, downloadJson, downloadCsv };
})(typeof window !== "undefined" ? window : globalThis);
