/* gallery.js — the home page: the list of works and the contact block. */
(async function () {
  "use strict";
  const N = window.NTRN, h = N.h, SITE = N.SITE;
  N.mountChrome("works");
  document.title = SITE.artist ? SITE.artist + " — Works" : "Works";

  const intro = document.getElementById("intro");
  intro.append(
    h("h1", null, SITE.artist || "Works"),
    SITE.tagline ? h("p", { class: "tagline" }, SITE.tagline) : null,
    SITE.statement ? h("p", { class: "statement" }, SITE.statement) : null
  );

  /* Contact */
  const contact = document.getElementById("contact-body");
  const rows = [];
  if (SITE.email) rows.push(["Email", h("a", { href: "mailto:" + SITE.email }, SITE.email)]);
  if (SITE.whatsapp) rows.push(["WhatsApp", h("a", { href: "https://wa.me/" + SITE.whatsapp, rel: "noopener" }, "+" + SITE.whatsapp)]);
  if (SITE.instagram) rows.push(["Instagram", h("a", { href: "https://instagram.com/" + SITE.instagram, rel: "noopener" }, "@" + SITE.instagram)]);
  if (SITE.location) rows.push(["Studio", SITE.location]);
  contact.append(
    h("p", { class: "lead" },
      "Works are sold directly by the artist. To acquire a piece, ask about availability, shipping and payment by writing to the studio."),
    h("dl", { class: "facts" }, rows.map(([k, v]) => [h("dt", null, k), h("dd", null, v)]))
  );

  /* Works */
  const grid = document.getElementById("grid");
  const count = document.getElementById("works-count");
  const filter = document.getElementById("filter");
  let works = [];
  try {
    works = (await N.loadCatalog()).works;
  } catch (e) {
    grid.append(h("p", { class: "note" }, "The catalogue could not be loaded. Please try again later."));
    return;
  }

  function card(rec) {
    const c = rec.certificate, l = rec.listing || {};
    const src = N.safePath(l.thumb) || N.safePath(c.images && c.images[0] && c.images[0].src);
    return h("a", { class: "card", href: "work.html?id=" + encodeURIComponent(c.id) },
      h("span", { class: "card-image" },
        src ? h("img", { src, alt: c.title || "", loading: "lazy", decoding: "async" }) : null),
      h("span", { class: "card-caption" },
        h("span", { class: "card-title" }, h("em", null, c.title || "Untitled"), c.year ? ", " + c.year : ""),
        c.medium ? h("span", null, c.medium) : null,
        c.dimensions ? h("span", null, c.dimensions) : null,
        h("span", { class: "card-price" }, N.priceLabel(l)))
    );
  }

  function render(mode) {
    const list = mode === "available" ? works.filter((w) => N.isAvailable(w.listing)) : works;
    N.clear(grid);
    count.textContent = "Works (" + list.length + ")";
    if (!list.length) {
      grid.append(h("p", { class: "note" },
        works.length ? "No works are available at the moment." : "No works have been published yet."));
      return;
    }
    grid.append(...list.map(card));
  }

  if (works.some((w) => !N.isAvailable(w.listing)) && works.some((w) => N.isAvailable(w.listing))) {
    filter.hidden = false;
    filter.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-filter]");
      if (!b) return;
      for (const x of filter.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b));
      render(b.dataset.filter);
    });
  }
  render("all");
})();
