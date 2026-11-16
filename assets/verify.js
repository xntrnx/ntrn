/* verify.js — the certificate of authenticity and its verification.
   A certificate is accepted only if (1) its signature is valid, (2) the
   signing key is one the artist publishes in keys.json and has not been
   revoked, and (3) it is the current revision on record for that work. */
(async function () {
  "use strict";
  const N = window.NTRN, h = N.h, SITE = N.SITE;
  N.mountChrome("verify");

  const out = document.getElementById("result");
  const show = (...nodes) => N.clear(out).append(...nodes);
  const message = (kind, title, detail) =>
    h("div", { class: "verdict " + kind, role: "status" }, h("strong", null, title), h("p", null, detail));

  let catalog = null, keys = null;
  try {
    [catalog, keys] = await Promise.all([N.loadCatalog(), N.loadKeys()]);
  } catch (e) {
    show(message("bad", "The registry could not be loaded",
      "Certificates cannot be checked right now. Please try again later."));
    return;
  }
  const published = (id) => catalog.works.find((w) => w.certificate && w.certificate.id === id) || null;

  /* Compares each published photograph with the SHA-256 recorded in the
     signed certificate. Returns "ok", "mismatch", "unavailable" or "none". */
  async function checkImages(cert) {
    const list = Array.isArray(cert.images) ? cert.images : [];
    if (!list.length) return "none";
    let result = "ok";
    for (const img of list) {
      const src = N.safePath(img.src);
      if (!src) return "mismatch";
      try {
        const res = await fetch(src, { cache: "no-store" });
        if (!res.ok) { result = "unavailable"; continue; }
        if (await N.sha256Hex(await res.arrayBuffer()) !== img.sha256) return "mismatch";
      } catch (e) { result = "unavailable"; }
    }
    return result;
  }

  const INVALID = {
    "malformed": "This file is not a certificate issued from this site.",
    "unknown-key": "It was not signed with a key published by the artist.",
    "bad-signature": "Its contents do not match the signature. The certificate has been altered or forged.",
    "revoked-key": "It was signed with a key the artist has revoked. Ask the artist for a re-issued certificate.",
  };

  async function evaluate(record, fromFile) {
    show(h("p", { class: "note" }, "Verifying…"));
    const r = await N.verifyRecord(record, keys);
    const claimedId = record && record.certificate && typeof record.certificate.id === "string"
      ? record.certificate.id : "";

    if (r.state === "unsupported") {
      return show(message("warn", "This browser cannot verify signatures",
        "Open this page in a current version of Chrome, Edge, Firefox or Safari."));
    }
    if (r.state === "invalid") {
      return show(message("bad", "Not valid",
        (claimedId ? "Certificate presented for " + claimedId + ". " : "") + INVALID[r.code] +
        " Do not rely on it. Contact the artist if in doubt."));
    }

    const cert = record.certificate;
    const current = published(cert.id);
    let verdict;

    if (!current) {
      verdict = ["warn", "Signed by the artist, but not in the registry",
        "The signature is genuine, but this work is not listed in the artist's current registry. Contact the artist to confirm its status."];
    } else if (await N.certHash(current.certificate) !== await N.certHash(cert)) {
      const older = Number(cert.revision) < Number(current.certificate.revision);
      verdict = older
        ? ["warn", "Authentic, but superseded",
            "This is revision " + cert.revision + ". The artist has since issued revision " +
            current.certificate.revision + ", which replaces it. The current certificate is shown in the registry."]
        : ["warn", "Signed by the artist, but not the certificate on record",
            "The signature is genuine, but it differs from the certificate currently in the registry. Contact the artist."];
    } else {
      const photos = await checkImages(cert);
      verdict = photos === "mismatch"
        ? ["warn", "Signature valid, photograph changed",
            "The certificate is genuine, but a photograph published on this site no longer matches the one that was certified. Contact the artist."]
        : ["ok", "Authentic",
            "Signed by " + (cert.artist || "the artist") + " and current in the artist's registry." +
            (photos === "ok" ? " The published photographs match the ones certified." : "") +
            (photos === "unavailable" ? " The photographs could not be checked just now." : "")];
    }

    const superseded = verdict[1] === "Authentic, but superseded";
    show(await sheet(record, r.key, verdict, superseded ? current : null));
    if (!fromFile) document.title = (cert.title || cert.id) + " — Certificate of authenticity";
  }

  async function sheet(record, key, verdict, newer) {
    const c = record.certificate;
    const src = N.safePath(c.images && c.images[0] && c.images[0].src);
    const hash = await N.certHash(c);
    const print = await N.keyFingerprint(record.signature.publicKey);
    const url = N.siteUrl() + "verify.html?id=" + encodeURIComponent(c.id);

    const facts = [
      ["Artist", c.artist], ["Title", c.title], ["Year", c.year], ["Medium", c.medium],
      ["Dimensions", c.dimensions], ["Edition", c.edition], ["Work ID", c.id],
    ].filter(([, v]) => v);

    const download = () => {
      const blob = new Blob([JSON.stringify({ certificate: c, signature: record.signature }, null, 2) + "\n"],
        { type: "application/json" });
      const a = h("a", { href: URL.createObjectURL(blob), download: c.id + "-certificate-r" + c.revision + ".json" });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    return h("article", { class: "certificate" },
      h("div", { class: "verdict " + verdict[0], role: "status" },
        h("strong", null, verdict[1]),
        h("p", null, verdict[2],
          newer ? [" ", h("a", { href: "verify.html?id=" + encodeURIComponent(c.id) }, "View the current certificate")] : null),
        h("p", { class: "print-only" }, "Checked on " + N.formatDate(N.today()) + ".")),

      h("header", { class: "cert-head" },
        h("p", { class: "label" }, "Certificate of Authenticity"),
        h("h1", null, h("em", null, c.title || "Untitled"), c.year ? ", " + c.year : ""),
        h("p", { class: "cert-artist" }, c.artist || "")),

      h("div", { class: "cert-body" },
        src ? h("figure", null, h("img", { src, alt: c.title || "" })) : null,
        h("dl", { class: "facts" }, facts.map(([k, v]) => [h("dt", null, k), h("dd", null, String(v))]))),

      c.description ? h("p", { class: "description" }, c.description) : null,

      Array.isArray(c.provenance) && c.provenance.length
        ? h("section", null,
            h("h2", { class: "label" }, "Provenance"),
            h("ol", { class: "provenance" }, c.provenance.map((p) =>
              h("li", null, h("time", null, N.formatDate(p.date)), h("span", null, p.event)))))
        : null,

      h("section", null,
        h("h2", { class: "label" }, "Signature"),
        h("dl", { class: "facts mono" },
          h("dt", null, "Issued"), h("dd", null, N.formatDate(c.issued) + " · revision " + c.revision),
          h("dt", null, "Certificate"), h("dd", null, N.shortPrint(hash)),
          h("dt", null, "Artist's key"), h("dd", null, N.shortPrint(print) +
            (key && key.status === "retired" ? " (earlier key)" : "")),
          h("dt", null, "Method"), h("dd", null, "Ed25519 digital signature"),
          h("dt", null, "Verify at"), h("dd", null, url))),

      h("p", { class: "fine" },
        "This certificate is a digitally signed record issued by " + (c.artist || "the artist") +
        ". It cannot be altered without invalidating the signature. When the work changes hands, the artist " +
        "issues a new revision; only the latest revision in the registry is current."),

      h("div", { class: "actions no-print" },
        h("button", { type: "button", class: "btn", onclick: () => window.print() }, "Print or save as PDF"),
        h("button", { type: "button", class: "btn secondary", onclick: download }, "Download certificate file"),
        published(c.id) ? h("a", { class: "btn secondary", href: "work.html?id=" + encodeURIComponent(c.id) }, "View the work") : null)
    );
  }

  /* Look up by ID */
  document.getElementById("lookup").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = document.getElementById("lookup-id").value.trim().toUpperCase();
    if (v) location.href = "verify.html?id=" + encodeURIComponent(v);
  });

  /* Check a file */
  document.getElementById("file").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    let record;
    try { record = JSON.parse(await f.text()); }
    catch (err) {
      return show(message("bad", "Not valid", "This file could not be read as a certificate."));
    }
    await evaluate(record, true);
    out.scrollIntoView({ block: "start" });
  });

  const id = new URLSearchParams(location.search).get("id");
  if (id) {
    const rec = published(id);
    if (!rec) {
      show(message("bad", "No certificate on record",
        "There is no work with the ID " + id + " in the artist's registry. Check the ID, or contact the artist."));
    } else {
      await evaluate(rec, false);
    }
  } else {
    show(
      h("header", { class: "cert-head" },
        h("p", { class: "label" }, "Certificate of Authenticity"),
        h("h1", null, "Verify a certificate")),
      h("p", { class: "lead" },
        "Every work by " + (SITE.artist || "the artist") + " is issued with a digitally signed certificate. " +
        "Enter the work ID printed on the certificate, or open the certificate file, to confirm it is genuine and current."));
  }
})();
