/* core.js — shared by every page: the certificate format, signature
   verification, data loading and small DOM helpers. No dependencies. */
window.NTRN = (function () {
  "use strict";

  const SCHEMA = "ntrn.certificate/1";
  const SITE = window.SITE || {};
  const te = new TextEncoder();

  /* ---------- DOM ---------- */

  // Builds elements without innerHTML, so catalog text can never run as markup.
  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "value" || k === "checked" || k === "disabled" || k === "hidden") n[k] = v;
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return n;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /* ---------- bytes ---------- */

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  function hex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function sha256Hex(data) {
    return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
  }

  /* ---------- certificate format ---------- */

  // Canonical form: object keys sorted, no floats. The same certificate
  // always yields exactly the same bytes, whatever order it was written in.
  function canonical(v) {
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") {
      if (!Number.isSafeInteger(v)) throw new Error("Only whole numbers are allowed in a certificate.");
      return v;
    }
    if (Array.isArray(v)) return v.map(canonical);
    if (typeof v === "object") {
      const o = {};
      for (const k of Object.keys(v).sort()) o[k] = canonical(v[k]);
      return o;
    }
    throw new Error("Unsupported value in certificate.");
  }

  // The exact bytes that are signed. The schema prefix means a signature
  // made for a certificate can never be reused for any other purpose.
  function payload(cert) {
    return te.encode(SCHEMA + "\n" + JSON.stringify(canonical(cert)));
  }
  async function certHash(cert) {
    return sha256Hex(payload(cert));
  }
  async function keyFingerprint(publicKeyB64) {
    return sha256Hex(b64ToBytes(publicKeyB64));
  }
  // 16 hex characters in groups of four — short enough to read aloud.
  function shortPrint(hexStr) {
    return hexStr.slice(0, 16).toUpperCase().match(/.{4}/g).join(" ");
  }

  /* Verifies one record against the artist's published keys.
     Returns { state: "valid" | "invalid" | "unsupported", code, key }.
     The key embedded in a record is never trusted by itself: it must
     be listed in keys.json and must not be revoked. */
  async function verifyRecord(record, keys) {
    const c = record && record.certificate;
    const s = record && record.signature;
    if (!c || !s || c.schema !== SCHEMA || s.alg !== "Ed25519" ||
        typeof s.publicKey !== "string" || typeof s.value !== "string") {
      return { state: "invalid", code: "malformed" };
    }
    if (!window.crypto || !crypto.subtle) return { state: "unsupported" };

    const key = (Array.isArray(keys) ? keys : []).find((k) => k.publicKey === s.publicKey);
    if (!key) return { state: "invalid", code: "unknown-key" };

    let ok;
    try {
      const pk = await crypto.subtle.importKey("raw", b64ToBytes(s.publicKey), { name: "Ed25519" }, false, ["verify"]);
      ok = await crypto.subtle.verify({ name: "Ed25519" }, pk, b64ToBytes(s.value), payload(c));
    } catch (e) {
      if (e && e.name === "NotSupportedError") return { state: "unsupported" };
      return { state: "invalid", code: "malformed" };
    }
    if (!ok) return { state: "invalid", code: "bad-signature" };
    if (key.status === "revoked") return { state: "invalid", code: "revoked-key", key };
    return { state: "valid", key };
  }

  /* ---------- data ---------- */

  async function loadJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(url + " (" + res.status + ")");
    return res.json();
  }
  async function loadCatalog() {
    const c = await loadJSON("catalog.json");
    if (!c || !Array.isArray(c.works)) throw new Error("catalog.json is not a catalog");
    return c;
  }
  async function loadKeys() {
    const k = await loadJSON("keys.json");
    if (!Array.isArray(k)) throw new Error("keys.json is not a key list");
    return k;
  }

  // Image paths come from data files; only plain paths inside works/ are used.
  const PATH_RE = /^works\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
  function safePath(p) {
    return typeof p === "string" && PATH_RE.test(p) && !p.includes("..") ? p : null;
  }

  /* ---------- formatting ---------- */

  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "";
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }
  function today() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  // What to show where a price would go.
  function priceLabel(listing) {
    const l = listing || {};
    if (l.status === "sold") return "Sold";
    if (l.status === "reserved") return "Reserved";
    if (l.status === "nfs") return "Not for sale";
    if (typeof l.price === "number" && l.price > 0) {
      return (l.currency || "") + " " + l.price.toLocaleString("en-US");
    }
    return "Price on request";
  }
  function isAvailable(listing) {
    return !listing || !listing.status || listing.status === "available";
  }
  function siteUrl() {
    if (SITE.siteUrl) return SITE.siteUrl.replace(/\/?$/, "/");
    return location.origin + location.pathname.replace(/[^/]*$/, "");
  }

  /* ---------- page chrome ---------- */

  function mountChrome(current) {
    const name = SITE.artist || "Gallery";
    const header = document.getElementById("site-header");
    if (header) {
      const link = (href, label, key) =>
        h("a", { href, "aria-current": current === key ? "page" : null }, label);
      header.append(
        h("a", { class: "wordmark", href: "index.html" }, name),
        h("nav", { "aria-label": "Main" },
          link("index.html", "Works", "works"),
          link("verify.html", "Verify", "verify"),
          h("a", { href: "index.html#contact" }, "Contact"))
      );
    }
    const footer = document.getElementById("site-footer");
    if (footer) {
      footer.append(
        h("p", null, "Every work is issued with a digitally signed certificate of authenticity. ",
          h("a", { href: "verify.html" }, "Verify a certificate")),
        h("p", null, "© " + new Date().getFullYear() + " " + name)
      );
    }
  }

  return {
    SCHEMA, SITE, h, clear, b64ToBytes, bytesToB64, hex, sha256Hex,
    canonical, payload, certHash, keyFingerprint, shortPrint, verifyRecord,
    loadJSON, loadCatalog, loadKeys, safePath,
    formatDate, today, priceLabel, isAvailable, siteUrl, mountChrome,
  };
})();
