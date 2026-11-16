/* authenticator.js — the artist's tool. Builds and signs certificates in
   the browser and packs the changed files into a zip to upload.
   Nothing here talks to a server: the only requests are reads of
   catalog.json and keys.json from this same site. */
(async function () {
  "use strict";
  const N = window.NTRN, h = N.h, SITE = N.SITE;
  N.mountChrome("");
  const $ = (id) => document.getElementById(id);
  const te = new TextEncoder();

  const KEY_FORMAT = "ntrn.signing-key/1";
  const KDF_ITERATIONS = 600000;
  const MIN_PASS = 12;
  const ID_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

  const state = {
    catalog: null,       // { schema, updated, works: [...] }
    keys: null,          // contents of keys.json
    key: null,           // { privateKey, publicKey } once unlocked
    files: new Map(),    // path -> Blob, new image files for the package
    changes: [],         // human-readable log of what the package contains
    images: null,        // processed photographs chosen in the form
    downloaded: true,
  };

  /* ---------- support check ---------- */

  async function supported() {
    try {
      await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]);
      return true;
    } catch (e) { return false; }
  }
  if (!(await supported())) {
    const u = $("unsupported");
    u.hidden = false;
    u.textContent = location.protocol === "file:" || !window.isSecureContext
      ? "Open the Authenticator from your published site (https://…/authenticator.html), not as a local file."
      : "This browser cannot create signatures. Use a current version of Chrome, Edge, Firefox or Safari.";
    return;
  }

  /* ---------- small helpers ---------- */

  function download(name, blob) {
    const a = h("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function jsonBlob(value) {
    return new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" });
  }
  function logChange(text) {
    state.changes.push(text);
    state.downloaded = false;
    renderChanges();
  }
  function renderChanges() {
    const ul = N.clear($("changes"));
    if (!state.changes.length) ul.append(h("li", { class: "note" }, "No changes yet."));
    else ul.append(...state.changes.map((c) => h("li", null, c)));
    $("download-btn").disabled = !state.changes.length;
  }
  async function busy(button, fn) {
    const label = button.textContent;
    button.disabled = true; button.textContent = "Working…";
    try { await fn(); }
    catch (e) { alert(e && e.message ? e.message : String(e)); }
    finally { button.disabled = false; button.textContent = label; }
  }

  /* ---------- signing key ---------- */

  async function wrappingKey(pass, salt, iterations) {
    const base = await crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations }, base,
      { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  // Encrypts the private key with the passphrase. This is the key file.
  async function makeKeyFile(pkcs8, publicKey, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wk = await wrappingKey(pass, salt, KDF_ITERATIONS);
    const enc = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wk, pkcs8));
    return {
      format: KEY_FORMAT,
      note: "Private signing key, encrypted with your passphrase. Keep it offline and backed up. Never upload it.",
      publicKey,
      kdf: { name: "PBKDF2", hash: "SHA-256", iterations: KDF_ITERATIONS, salt: N.bytesToB64(salt) },
      cipher: { name: "AES-GCM", iv: N.bytesToB64(iv) },
      encryptedKey: N.bytesToB64(enc),
    };
  }

  async function openKeyFile(file, pass) {
    if (!file || file.format !== KEY_FORMAT) throw new Error("This is not a signing key file.");
    let pkcs8;
    try {
      const wk = await wrappingKey(pass, N.b64ToBytes(file.kdf.salt), file.kdf.iterations);
      pkcs8 = await crypto.subtle.decrypt({ name: "AES-GCM", iv: N.b64ToBytes(file.cipher.iv) }, wk, N.b64ToBytes(file.encryptedKey));
    } catch (e) { throw new Error("Wrong passphrase, or the key file is damaged."); }
    return usePrivateKey(pkcs8, file.publicKey);
  }

  // Loads a private key and proves it matches the public key before use.
  async function usePrivateKey(pkcs8, publicKey) {
    const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
    const pub = await crypto.subtle.importKey("raw", N.b64ToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    const probe = crypto.getRandomValues(new Uint8Array(32));
    const sig = await crypto.subtle.sign({ name: "Ed25519" }, privateKey, probe);
    if (!(await crypto.subtle.verify({ name: "Ed25519" }, pub, sig, probe))) {
      throw new Error("The key file is inconsistent and cannot be used.");
    }
    const entry = state.keys.find((k) => k.publicKey === publicKey);
    if (entry && entry.status === "revoked") throw new Error("This key has been revoked and can no longer sign.");
    state.key = { privateKey, publicKey };
    if (!entry) await registerKey(publicKey);
    await renderKeys();
  }

  // Adds a key to the published list. Earlier keys stay listed so the
  // certificates they signed keep verifying.
  async function registerKey(publicKey) {
    for (const k of state.keys) if (k.status === "active") k.status = "retired";
    const fingerprint = await N.keyFingerprint(publicKey);
    state.keys.push({ publicKey, fingerprint, created: N.today(), status: "active" });
    logChange("Signing key " + N.shortPrint(fingerprint) + " added to keys.json");
  }

  async function createKey(pass) {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
    const publicKey = N.bytesToB64(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
    await saveKeyFile(pkcs8, publicKey, pass);
  }

  async function importPem(text, pass) {
    const m = /-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/.exec(text);
    if (!m) throw new Error("This does not look like a private-key.pem file.");
    const pkcs8 = N.b64ToBytes(m[1].replace(/\s+/g, ""));
    const k = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
    const jwk = await crypto.subtle.exportKey("jwk", k);
    const publicKey = jwk.x.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (jwk.x.length % 4)) % 4);
    await saveKeyFile(pkcs8, publicKey, pass);
  }

  async function saveKeyFile(pkcs8, publicKey, pass) {
    const file = await makeKeyFile(pkcs8, publicKey, pass);
    const fp = await N.keyFingerprint(publicKey);
    download("signing-key-" + fp.slice(0, 8) + ".json", jsonBlob(file));
    await usePrivateKey(pkcs8, publicKey);
  }

  function checkNewPass(a, b) {
    if (a.length < MIN_PASS) throw new Error("Use a passphrase of at least " + MIN_PASS + " characters.");
    if (b !== undefined && a !== b) throw new Error("The two passphrases do not match.");
  }

  async function sign(cert) {
    if (!state.key) throw new Error("Unlock your signing key first (step 2).");
    const value = await crypto.subtle.sign({ name: "Ed25519" }, state.key.privateKey, N.payload(cert));
    const record = {
      certificate: cert,
      signature: { alg: "Ed25519", publicKey: state.key.publicKey, value: N.bytesToB64(new Uint8Array(value)) },
    };
    // Check the result exactly as a visitor's browser will.
    const r = await N.verifyRecord(record, state.keys);
    if (r.state !== "valid") throw new Error("Signing failed its own check. Nothing was changed.");
    return record.signature;
  }

  async function renderKeys() {
    const status = $("key-status");
    if (state.key) {
      status.textContent = "Unlocked: key " + N.shortPrint(await N.keyFingerprint(state.key.publicKey)) + ".";
      $("key-unlock").hidden = true;
    }
    const list = N.clear($("key-list"));
    if (!state.keys.length) list.append(h("p", { class: "note" }, "No keys published yet."));
    for (const k of state.keys) {
      const fp = await N.keyFingerprint(k.publicKey);
      list.append(h("p", { class: "key-row" },
        h("code", null, N.shortPrint(fp)), " · ", k.status,
        k.created ? " · created " + k.created : "",
        k.revoked ? " · revoked " + k.revoked : "",
        k.status !== "revoked"
          ? [" ", h("button", { type: "button", class: "link-btn", onclick: () => revoke(k, fp) }, "Revoke")]
          : null));
    }
  }

  async function revoke(k, fp) {
    if (!confirm("Revoke key " + N.shortPrint(fp) + "?\n\nDo this only if the key was stolen or exposed. " +
      "Every certificate it signed will show as not valid until you re-sign it with a new key.")) return;
    k.status = "revoked";
    k.revoked = N.today();
    if (state.key && state.key.publicKey === k.publicKey) {
      state.key = null;
      $("key-status").textContent = "Locked. Create a new key, then re-sign every certificate.";
      $("key-unlock").hidden = false;
    }
    logChange("Key " + N.shortPrint(fp) + " revoked");
    await renderKeys();
  }

  /* ---------- photographs ---------- */

  // Re-encodes a photograph as JPEG at a web size. This also strips
  // camera metadata (including any GPS position) from the published file.
  async function resize(file, maxEdge, quality) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("Could not process " + file.name);
    return blob;
  }

  async function chooseImages(files) {
    const previews = N.clear($("previews"));
    state.images = null;
    if (!files.length) { imagesNote(); return; }
    $("images-note").textContent = "Preparing " + files.length + " photograph(s)…";
    const out = [];
    for (const f of files) {
      let blob;
      try { blob = await resize(f, 2400, 0.9); }
      catch (e) {
        $("f-images").value = "";
        $("images-note").textContent = "“" + f.name + "” could not be read as an image. Use JPEG or PNG files.";
        return;
      }
      const sha256 = await N.sha256Hex(await blob.arrayBuffer());
      out.push({ blob, sha256 });
      previews.append(h("img", { src: URL.createObjectURL(blob), alt: f.name }));
    }
    const thumb = await resize(files[0], 900, 0.85);
    state.images = { list: out, thumb, thumbHash: await N.sha256Hex(await thumb.arrayBuffer()) };
    imagesNote();
  }

  function imagesNote() {
    const prev = selected();
    $("images-note").textContent = state.images
      ? state.images.list.length + " photograph(s) ready. The first is the main view."
      : prev
        ? "Keeps the " + prev.certificate.images.length + " photograph(s) already certified unless you choose new ones."
        : "Choose at least one photograph.";
  }

  /* ---------- work form ---------- */

  const works = () => state.catalog.works;
  const selected = () => works().find((w) => w.certificate.id === $("work-select").value) || null;

  function suggestId() {
    const prefix = (SITE.idPrefix || "W").toUpperCase(), year = new Date().getFullYear();
    const re = new RegExp("^" + prefix + "-" + year + "-(\\d+)$");
    const max = works().reduce((m, w) => {
      const x = re.exec(w.certificate.id);
      return x ? Math.max(m, +x[1]) : m;
    }, 0);
    return prefix + "-" + year + "-" + String(max + 1).padStart(3, "0");
  }

  function provRow(date, event) {
    const row = h("div", { class: "row prov-row" },
      h("label", { class: "field" }, h("span", null, "Date"), h("input", { type: "date", value: date || "" })),
      h("label", { class: "field grow" }, h("span", null, "Event"),
        h("input", { type: "text", value: event || "", placeholder: "Acquired from the artist. Private collection, Madrid." })),
      h("button", { type: "button", class: "link-btn", onclick: () => row.remove() }, "Remove"));
    return row;
  }

  function renderSelect(keepId) {
    const sel = N.clear($("work-select"));
    sel.append(h("option", { value: "" }, "New work"));
    for (const w of works()) {
      sel.append(h("option", { value: w.certificate.id },
        w.certificate.id + " — " + (w.certificate.title || "Untitled")));
    }
    sel.value = keepId || "";
    fillForm();
  }

  function fillForm() {
    const rec = selected();
    const c = rec ? rec.certificate : {}, l = rec ? rec.listing || {} : {};
    $("f-id").value = rec ? c.id : suggestId();
    $("f-id").readOnly = !!rec;
    $("f-title").value = c.title || "";
    $("f-year").value = c.year || (rec ? "" : String(new Date().getFullYear()));
    $("f-medium").value = c.medium || "";
    $("f-dimensions").value = c.dimensions || "";
    $("f-edition").value = rec ? c.edition || "" : "Unique work";
    $("f-description").value = c.description || "";
    $("f-status").value = l.status || "available";
    $("f-price").value = typeof l.price === "number" ? String(l.price) : "";
    $("f-currency").value = l.currency || SITE.defaultCurrency || "USD";
    $("f-images").value = "";
    N.clear($("previews"));
    state.images = null;
    const rows = N.clear($("prov-rows"));
    const prov = rec ? c.provenance || [] : [{ date: N.today(), event: "Completed by the artist. Artist's studio." }];
    rows.append(...prov.map((p) => provRow(p.date, p.event)));
    $("remove-btn").hidden = !rec;
    $("save-btn").textContent = rec ? "Save changes to package" : "Sign and add to package";
    $("form-error").hidden = true;
    imagesNote();
  }

  async function saveWork() {
    const prev = selected();
    const val = (id) => $(id).value.trim();
    const id = val("f-id").toUpperCase();

    if (!ID_RE.test(id)) throw new Error("Work ID: use capital letters, numbers and hyphens, e.g. " + suggestId() + ".");
    if (!prev && works().some((w) => w.certificate.id === id)) throw new Error("The ID " + id + " is already used by another work.");
    if (!val("f-title")) throw new Error("Give the work a title.");
    if (!SITE.artist) throw new Error("Set the artist name in config.js first.");
    if (!prev && !state.images) throw new Error("Choose at least one photograph.");

    const provenance = [];
    for (const row of $("prov-rows").children) {
      const [date, event] = [...row.querySelectorAll("input")].map((i) => i.value.trim());
      if (!date && !event) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !event) throw new Error("Each provenance entry needs a date and a description.");
      provenance.push({ date, event });
    }
    if (!provenance.length) throw new Error("Add at least one provenance entry.");

    const priceText = val("f-price").replace(/[\s,.]/g, "");
    if (priceText && !/^\d+$/.test(priceText)) throw new Error("Price: digits only, without decimals.");
    const currency = val("f-currency").toUpperCase();
    if (priceText && !/^[A-Z]{3}$/.test(currency)) throw new Error("Currency: a three-letter code such as USD, EUR or MXN.");

    const dir = "works/" + id + "/";
    const images = state.images
      ? state.images.list.map((i) => ({ src: dir + i.sha256.slice(0, 12) + ".jpg", sha256: i.sha256 }))
      : prev.certificate.images;

    const body = {
      schema: N.SCHEMA, id, artist: SITE.artist,
      title: val("f-title"), year: val("f-year"), medium: val("f-medium"),
      dimensions: val("f-dimensions"), edition: val("f-edition"), description: val("f-description"),
      images, provenance,
    };

    // If nothing in the certificate changed, the existing signature stands
    // and only the listing is updated. Otherwise a new revision is issued,
    // chained to the one it replaces.
    let certificate = null, signature = null, note;
    if (prev) {
      const p = prev.certificate;
      const same = { ...body, revision: p.revision, supersedes: p.supersedes, issued: p.issued };
      if (await N.certHash(same) === await N.certHash(p)) {
        certificate = p; signature = prev.signature;
        note = id + ": listing updated (certificate unchanged)";
      }
    }
    if (!certificate) {
      certificate = {
        ...body,
        revision: prev ? prev.certificate.revision + 1 : 1,
        supersedes: prev ? await N.certHash(prev.certificate) : null,
        issued: N.today(),
      };
      signature = await sign(certificate);
      note = id + ": certificate revision " + certificate.revision + " signed";
    }

    const listing = {
      status: $("f-status").value,
      price: priceText ? parseInt(priceText, 10) : null,
      currency: priceText ? currency : (prev && prev.listing && prev.listing.currency) || currency || null,
      thumb: state.images ? dir + "thumb-" + state.images.thumbHash.slice(0, 12) + ".jpg" : prev.listing && prev.listing.thumb,
    };

    if (state.images) {
      state.images.list.forEach((i, k) => state.files.set(images[k].src, i.blob));
      state.files.set(listing.thumb, state.images.thumb);
    }

    const record = { certificate, signature, listing };
    const at = works().indexOf(prev);
    if (at >= 0) works()[at] = record; else works().unshift(record);
    logChange(note);
    renderSelect(id);
  }

  /* ---------- zip (stored, no compression) ---------- */

  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(entries) {
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const { name, data } of entries) {
      const nameBytes = te.encode(name), crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true); local.setUint16(10, time, true); local.setUint16(12, date, true);
      local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true); local.setUint16(28, 0, true);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true); cd.setUint16(12, time, true); cd.setUint16(14, date, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
      cd.setUint16(28, nameBytes.length, true); cd.setUint32(42, offset, true);
      parts.push(local.buffer, nameBytes, data);
      central.push(cd.buffer, nameBytes);
      offset += 30 + nameBytes.length + data.length;
    }
    const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
  }

  async function downloadPackage() {
    state.catalog.schema = "ntrn.catalog/1";
    state.catalog.updated = new Date().toISOString();
    const entries = [
      { name: "catalog.json", data: new Uint8Array(await jsonBlob(state.catalog).arrayBuffer()) },
      { name: "keys.json", data: new Uint8Array(await jsonBlob(state.keys).arrayBuffer()) },
    ];
    for (const [name, blob] of state.files) entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
    download("site-upload-" + N.today() + ".zip", zip(entries));
    state.downloaded = true;
  }

  /* ---------- wiring ---------- */

  $("key-unlock-btn").addEventListener("click", (e) => busy(e.target, async () => {
    const f = $("key-file").files[0];
    if (!f) throw new Error("Choose your key file.");
    let parsed;
    try { parsed = JSON.parse(await f.text()); } catch (err) { throw new Error("This is not a signing key file."); }
    await openKeyFile(parsed, $("key-pass").value);
    $("key-pass").value = "";
  }));

  $("key-create-btn").addEventListener("click", (e) => busy(e.target, async () => {
    checkNewPass($("new-pass").value, $("new-pass2").value);
    await createKey($("new-pass").value);
    $("new-pass").value = $("new-pass2").value = "";
    e.target.closest("details").open = false;
  }));

  $("pem-import-btn").addEventListener("click", (e) => busy(e.target, async () => {
    const f = $("pem-file").files[0];
    if (!f) throw new Error("Choose your private-key.pem file.");
    checkNewPass($("pem-pass").value);
    await importPem(await f.text(), $("pem-pass").value);
    $("pem-pass").value = "";
    e.target.closest("details").open = false;
  }));

  $("resign-btn").addEventListener("click", (e) => busy(e.target, async () => {
    if (!state.key) throw new Error("Unlock your signing key first.");
    if (!works().length) throw new Error("There are no certificates to sign.");
    for (const w of works()) w.signature = await sign(w.certificate);
    logChange("All " + works().length + " certificate(s) re-signed with the current key");
  }));

  $("work-select").addEventListener("change", fillForm);
  $("f-images").addEventListener("change", (e) => chooseImages([...e.target.files]));
  $("prov-add").addEventListener("click", () => $("prov-rows").append(provRow(N.today(), "")));

  $("work-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("form-error"), btn = $("save-btn");
    err.hidden = true; btn.disabled = true;
    try { await saveWork(); }
    catch (ex) { err.textContent = ex.message || String(ex); err.hidden = false; }
    finally { btn.disabled = false; }
  });

  $("remove-btn").addEventListener("click", () => {
    const rec = selected();
    if (!rec || !confirm("Remove " + rec.certificate.id + " from the catalogue? Its certificate will no longer verify.")) return;
    works().splice(works().indexOf(rec), 1);
    logChange(rec.certificate.id + ": removed from the catalogue");
    renderSelect("");
  });

  $("download-btn").addEventListener("click", (e) => busy(e.target, downloadPackage));

  addEventListener("beforeunload", (e) => { if (!state.downloaded) e.preventDefault(); });

  /* ---------- start ---------- */

  async function start() {
    const signedCount = works().length;
    $("registry-status").textContent =
      "Loaded " + signedCount + " work(s) and " + state.keys.length + " key(s) from the site.";
    $("registry-manual").hidden = true;
    await renderKeys();
    renderSelect("");
    renderChanges();
  }

  try {
    [state.catalog, state.keys] = await Promise.all([N.loadCatalog(), N.loadKeys()]);
    await start();
  } catch (e) {
    $("registry-status").textContent = "Could not read the published catalogue.";
    $("registry-manual").hidden = false;
    const tryManual = async () => {
      const c = $("manual-catalog").files[0], k = $("manual-keys").files[0];
      if (!c || !k) return;
      try {
        state.catalog = JSON.parse(await c.text());
        state.keys = JSON.parse(await k.text());
        if (!Array.isArray(state.catalog.works) || !Array.isArray(state.keys)) throw new Error();
        await start();
      } catch (err) { $("registry-status").textContent = "Those files are not a valid catalog.json and keys.json."; }
    };
    $("manual-catalog").addEventListener("change", tryManual);
    $("manual-keys").addEventListener("change", tryManual);
  }
})();
