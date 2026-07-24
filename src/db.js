// Capa de persistencia (IndexedDB). Script clásico: expone window.Db.
(function (global) {
  "use strict";

  const DB_NAME = "bom-afton-db";
  const DB_VERSION = 1;
  const STORES = [
    { name: "rawMaterials", keyPath: "id" },
    { name: "presentations", keyPath: "id" },
    { name: "products", keyPath: "id" },
    { name: "indirectCosts", keyPath: "id" },
    { name: "packaging", keyPath: "presentacion" },
    { name: "marginRules", keyPath: "id" },
    { name: "history", keyPath: "id", autoIncrement: true },
    { name: "costSnapshots", keyPath: "id", autoIncrement: true },
    { name: "meta", keyPath: "key" },
  ];

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s.name)) {
            db.createObjectStore(s.name, { keyPath: s.keyPath, autoIncrement: !!s.autoIncrement });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(storeName, mode) {
    const db = await open();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function wrap(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAll(storeName) {
    const store = await tx(storeName, "readonly");
    return wrap(store.getAll());
  }
  async function get(storeName, key) {
    const store = await tx(storeName, "readonly");
    return wrap(store.get(key));
  }
  async function put(storeName, value) {
    const store = await tx(storeName, "readwrite");
    return wrap(store.put(value));
  }
  async function putAll(storeName, values) {
    const store = await tx(storeName, "readwrite");
    for (const v of values) store.put(v);
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  }
  async function del(storeName, key) {
    const store = await tx(storeName, "readwrite");
    return wrap(store.delete(key));
  }
  async function clear(storeName) {
    const store = await tx(storeName, "readwrite");
    return wrap(store.clear());
  }
  async function count(storeName) {
    const store = await tx(storeName, "readonly");
    return wrap(store.count());
  }

  global.Db = { open, getAll, get, put, putAll, delete: del, clear, count, STORES };
})(typeof window !== "undefined" ? window : globalThis);
