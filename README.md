# Gallery with signed certificates of authenticity

A static gallery site for one artist. Each work has a page, a price or status, and a
digitally signed certificate of authenticity that anyone can verify in their browser.

There is no server, database, account system or checkout. To buy a work, a collector
presses **Inquire**, which opens an email to the artist. The sale itself (payment,
shipping, invoice) happens between the two of you.

Everything runs from files in this repository, hosted for free with GitHub Pages.

## Contents

- [The pages](#the-pages)
- [First-time setup](#first-time-setup)
- [Publish a work](#publish-a-work)
- [When a work is sold or changes hands](#when-a-work-is-sold-or-changes-hands)
- [Other changes](#other-changes)
- [Your signing key](#your-signing-key)
- [How the certificate works](#how-the-certificate-works)
- [What the certificate does and does not protect](#what-the-certificate-does-and-does-not-protect)
- [Files in this repository](#files-in-this-repository)
- [Preview on your own computer](#preview-on-your-own-computer)

## The pages

| Page | For | What it does |
| --- | --- | --- |
| `index.html` | Visitors | The works, with an All / Available filter, and your contact details. |
| `work.html?id=…` | Visitors | One work: photographs, details, price, **Inquire** button, link to its certificate. |
| `verify.html` | Collectors | Shows a work's certificate and checks it. Also checks a certificate file someone was given. Prints as a document. |
| `authenticator.html` | You | Adds and edits works, signs certificates, and builds the files to upload. It is not linked from the site; open it by typing its address. |

## First-time setup

Do these once.

### 1. Fill in `config.js`

On GitHub, open `config.js`, press the pencil icon, edit, and commit. Set at least:

- `artist`: your name as it should appear on certificates. Changing it later re-issues every certificate you edit, so choose it carefully.
- `email`: where inquiries are sent.
- `siteUrl`: the public address of the site, for example `https://xntrnx.github.io/ntrn/`. It is printed on certificates.

The other settings (tagline, statement, WhatsApp, Instagram, ID prefix, default currency) are explained in the file.

### 2. Turn on GitHub Pages

In the repository: **Settings → Pages → Build and deployment → Deploy from a branch**, choose the `main` branch and the `/ (root)` folder, and save. After a minute the site is live at the address GitHub shows there.

### 3. Create your signing key

1. Open `https://YOUR-SITE/authenticator.html` in Chrome, Edge, Firefox or Safari (a current version).
2. Under **2 Signing key**, open **Create a new signing key**.
3. Choose a passphrase of 12 characters or more and press **Create key**.
4. Your browser downloads `signing-key-XXXXXXXX.json`. This file plus the passphrase is your signature. See [Your signing key](#your-signing-key) for how to store it.
5. Under **4 Upload package**, press **Download upload package** and upload it as described in [step 4 below](#4-upload-the-package). This publishes the public half of your key in `keys.json` so visitors can check your signatures.

If you still have a `private-key.pem` from the earlier version of this project, use **Import a private-key.pem** instead of creating a new key.

## Publish a work

### 1. Photograph it

Take at least the front. For a stronger certificate, also photograph the reverse, your signature, and a distinctive detail. Write the work ID (for example `TLK-2026-001`) on the reverse of the piece before photographing it, so the object and the certificate point at each other.

Use JPEG or PNG. Any size is fine: the Authenticator resizes photographs for the web and removes camera metadata, including location.

### 2. Open the Authenticator and unlock your key

Go to `https://YOUR-SITE/authenticator.html`. Under **2 Signing key**, choose your key file, type your passphrase, press **Unlock**.

### 3. Fill in the work

Under **3 Work**, leave the selector on **New work** and complete:

- **Work ID**: suggested for you. It is permanent and must be unique.
- **Title, Year, Medium, Dimensions, Edition, Description.**
- **Photographs**: select them all at once. The first one (front) is the main image.
- **Provenance**: starts with one entry for the work's completion. Leave it or edit it.
- **Listing**: status, price (digits only; blank shows "Price on request") and currency.

Press **Sign and add to package**. The work appears in the list under **4 Upload package**. Repeat for as many works as you like.

### 4. Upload the package

1. Press **Download upload package (.zip)** and unzip it.
2. On GitHub, open the repository and choose **Add file → Upload files**.
3. Drag in everything *inside* the unzipped folder: `catalog.json`, `keys.json` and the `works` folder. Do not drag the outer folder itself, or the files land in the wrong place.
4. Press **Commit changes**.

The site updates in a minute or two. Open the work and follow **Certificate of authenticity**: it should say **Authentic**.

Always start from the Authenticator on the live site, so it begins from the catalogue that is currently published. Upload one package before you start the next.

## When a work is sold or changes hands

1. A collector writes to you from the **Inquire** button. Agree on price, payment and shipping by email.
2. Once it is paid, open the Authenticator, unlock your key, and select the work.
3. Set **Status** to **Sold**.
4. Under **Provenance**, press **Add entry** and record the sale, for example `Acquired from the artist. Private collection, Berlin.` Provenance is public, so name a collector only with their consent.
5. Press **Save changes to package**, then download and upload the package as before.

This issues **revision 2** of the certificate. The earlier revision still shows as genuine but **superseded** if anyone checks an old copy, which is what stops a previous owner from passing off an outdated certificate.

Give the collector:

- the link `https://YOUR-SITE/verify.html?id=WORK-ID`,
- a printed or PDF certificate (**Print or save as PDF** on that page), and
- the certificate file (**Download certificate file**), which they can re-check at any time.

If the collector later resells the work, they or the new owner write to you, and you add another provenance entry the same way. You are the registrar: only you can issue a new revision.

## Other changes

- **Change a price, or mark a work reserved**: select the work, change the listing, save, upload. No key is needed, because price and status are not part of the certificate.
- **Correct a detail or replace photographs**: select the work, edit, save. This issues a new revision and needs your key.
- **Remove a work**: select it and press **Remove this work from the catalogue**. Its photographs stay in the `works` folder until you delete that folder on GitHub.
- **Change the order**: new works are listed first. To reorder, edit the order of entries in `catalog.json`; this does not affect signatures.

## Your signing key

The key file is encrypted with your passphrase. Someone needs both to sign as you.

- Keep the key file on your own computer and one offline backup (a USB drive kept somewhere safe).
- Keep the passphrase written down somewhere separate from the key file. It cannot be recovered or reset.
- Never upload the key file to GitHub, and never send it by email or chat. `.gitignore` blocks it from git, but GitHub's web uploader does not read `.gitignore`, so take care what you drag in.

**If you lose the key or forget the passphrase**: create a new key in the Authenticator. The old one stays listed as an earlier key, and the certificates it signed remain valid. You sign future work with the new key.

**If the key may have been stolen or exposed**:

1. In the Authenticator, open **Published keys** and press **Revoke** next to it.
2. Create a new key.
3. Press **Re-sign every certificate with the unlocked key**.
4. Download and upload the package.

From then on, anything signed with the stolen key shows as **Not valid**.

## How the certificate works

A certificate is a small record: work ID, artist, title, year, medium, dimensions, edition, description, provenance, the revision number, and a SHA-256 fingerprint of each photograph. The Authenticator signs that record with your private key using Ed25519, a standard digital signature. The signature is stored next to the record in `catalog.json`.

When someone opens `verify.html`, their browser checks, without contacting any server:

1. **The signature matches the record.** Any change to the record, even one letter, makes this fail.
2. **The signing key is yours.** It must be listed in `keys.json` and not revoked. A key inside a certificate file is never trusted by itself.
3. **It is the current revision.** A file someone presents is compared with the registry; an older revision is reported as superseded.
4. **The photographs are the ones certified.** Each published image is fingerprinted again and compared.

Each new revision also records the fingerprint of the one it replaces, and the repository's commit history shows publicly when every change was published.

The results a visitor can see:

| Result | Meaning |
| --- | --- |
| **Authentic** | Signed by you and current. |
| **Authentic, but superseded** | A genuine older revision. A newer one exists. |
| **Signed by the artist, but not in the registry** | Genuine signature, but the work was removed or never published. |
| **Signature valid, photograph changed** | A published image differs from the certified one. |
| **Not valid** | Altered, forged, signed by an unknown key, or signed by a revoked key. |

## What the certificate does and does not protect

It protects against:

- A forged or edited certificate: nobody can produce a valid signature without your key file and passphrase.
- Someone who gets into the repository but not the key: they can break certificates, but cannot create or change valid ones.
- An outdated certificate being presented as current.

Its limits, which are worth knowing:

- **The official site is the anchor.** A forger could build a look-alike site that says whatever they want. Collectors should verify only at your address. Publish that address, and your key's fingerprint (shown in the Authenticator and on every certificate as "Artist's key"), somewhere independent such as your Instagram profile.
- **Someone with both repository access and your key can do anything you can.** Protect your GitHub account with two-factor authentication.
- **The certificate describes the object; it is not attached to it.** The link between a physical piece and its record is the photographs and the ID written on the reverse. Photograph identifying details.
- **It records what you declare.** Ownership entries are your statement as the artist, not a legal title register.
- **Price and status are not signed**, so that they can change freely. The agreed price is whatever you confirm by email.
- **Verification needs a current browser** (Chrome or Edge 137+, Firefox 129+, Safari 17+). Older browsers say they cannot verify rather than giving a wrong answer.

## Files in this repository

| File | Edit by hand? | Purpose |
| --- | --- | --- |
| `config.js` | Yes | Your name, contact details and site address. |
| `catalog.json` | No | Every work: signed certificate plus listing. Written by the Authenticator. |
| `keys.json` | No | Your public keys and their status. Written by the Authenticator. |
| `works/<ID>/` | No | Photographs for each work. Written by the Authenticator. |
| `index.html`, `work.html`, `verify.html`, `authenticator.html` | No | The pages. |
| `assets/` | No | Styles and scripts. `core.js` holds the certificate format and verification. |

The site loads nothing from other servers: no fonts, trackers or libraries.

## Preview on your own computer

The pages must be served, not opened as files. In the repository folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. The Authenticator works there too.
