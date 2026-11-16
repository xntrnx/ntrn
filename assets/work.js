/* work.js — a single work: images, details, how to acquire it. */
(async function () {
  "use strict";
  const N = window.NTRN, h = N.h, SITE = N.SITE;
  N.mountChrome("works");

  const root = document.getElementById("work");
  const id = new URLSearchParams(location.search).get("id");

  function fail(msg) {
    N.clear(root).append(
      h("p", { class: "note" }, msg, " ", h("a", { href: "index.html" }, "Back to works")));
  }

  let catalog;
  try { catalog = await N.loadCatalog(); }
  catch (e) { return fail("The catalogue could not be loaded."); }

  const index = catalog.works.findIndex((w) => w.certificate && w.certificate.id === id);
  if (index < 0) return fail("This work was not found.");

  const rec = catalog.works[index];
  const c = rec.certificate, l = rec.listing || {};
  const title = c.title || "Untitled";
  document.title = title + (SITE.artist ? " — " + SITE.artist : "");

  /* Images */
  const images = (c.images || []).map((i) => N.safePath(i.src)).filter(Boolean);
  const main = h("img", { alt: title, decoding: "async" });
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  let current = 0;

  const thumbs = images.length > 1
    ? h("div", { class: "work-thumbs" }, images.map((src, i) =>
        h("button", { type: "button", "aria-label": "View " + (i + 1) + " of " + images.length, onclick: () => show(i) },
          h("img", { src, alt: "", loading: "lazy" }))))
    : null;

  function show(i) {
    current = i;
    main.src = images[i];
    if (thumbs) [...thumbs.children].forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
  }
  function enlarge() {
    lightboxImg.src = images[current];
    lightboxImg.alt = title;
    lightbox.showModal();
  }
  document.getElementById("lightbox-close").addEventListener("click", () => lightbox.close());
  lightbox.addEventListener("click", (e) => { if (e.target === lightbox || e.target === lightboxImg) lightbox.close(); });

  const media = h("div", { class: "work-media" },
    images.length
      ? h("button", { type: "button", class: "work-image", "aria-label": "Enlarge image", onclick: enlarge }, main)
      : h("p", { class: "note" }, "No photographs yet."),
    thumbs);
  if (images.length) show(0);

  /* How to acquire: there is no checkout. The buyer writes to the artist. */
  const available = N.isAvailable(l);
  const subject = "Inquiry: " + title + " (" + c.id + ")";
  const body =
    "Hello,\n\nI am interested in the following work:\n\n" +
    title + (c.year ? ", " + c.year : "") + "\n" +
    (c.medium ? c.medium + "\n" : "") +
    (c.dimensions ? c.dimensions + "\n" : "") +
    "Reference: " + c.id + "\n" +
    N.siteUrl() + "work.html?id=" + encodeURIComponent(c.id) + "\n\n" +
    "Could you confirm availability, price and shipping to:\n\n";
  const mailto = "mailto:" + (SITE.email || "") +
    "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);

  const acquire = h("div", { class: "acquire" },
    h("p", { class: "price" }, N.priceLabel(l)),
    SITE.email ? h("a", { class: "btn", href: mailto }, available ? "Inquire" : "Ask about this work") : null,
    h("p", { class: "fine" },
      available
        ? "Works are sold directly by the artist. Write to confirm availability, shipping and payment."
        : "This work is no longer available. Write to ask about similar or upcoming works.",
      SITE.email ? [" ", h("a", { href: "mailto:" + SITE.email }, SITE.email)] : null,
      SITE.whatsapp ? [" · ", h("a", {
        href: "https://wa.me/" + SITE.whatsapp + "?text=" + encodeURIComponent(subject), rel: "noopener",
      }, "WhatsApp")] : null));

  /* Certificate line — checked here, full detail on the verify page. */
  const certLink = h("a", { href: "verify.html?id=" + encodeURIComponent(c.id) }, "Certificate of authenticity");
  const certState = h("span", { class: "cert-state" }, "checking…");
  const cert = h("p", { class: "cert-line" }, certLink, " ", certState);

  const facts = [
    ["Artist", c.artist], ["Year", c.year], ["Medium", c.medium],
    ["Dimensions", c.dimensions], ["Edition", c.edition], ["Reference", c.id],
  ].filter(([, v]) => v);

  const prev = catalog.works[index - 1], next = catalog.works[index + 1];
  const adj = (w, label) => w
    ? h("a", { href: "work.html?id=" + encodeURIComponent(w.certificate.id) },
        h("span", { class: "label" }, label), h("em", null, w.certificate.title || "Untitled"))
    : h("span");

  N.clear(root).append(
    media,
    h("div", { class: "work-info" },
      h("p", { class: "label" }, c.artist || SITE.artist || ""),
      h("h1", null, h("em", null, title), c.year ? ", " + c.year : ""),
      h("dl", { class: "facts" }, facts.map(([k, v]) => [h("dt", null, k), h("dd", null, String(v))])),
      c.description ? h("p", { class: "description" }, c.description) : null,
      acquire,
      cert),
    h("nav", { class: "adjacent", "aria-label": "Other works" }, adj(prev, "Previous"), adj(next, "Next"))
  );

  try {
    const r = await N.verifyRecord(rec, await N.loadKeys());
    certState.textContent =
      r.state === "valid" ? "Signature verified" :
      r.state === "unsupported" ? "" : "Not verified";
    certState.classList.toggle("bad", r.state === "invalid");
  } catch (e) {
    certState.textContent = "";
  }
})();
