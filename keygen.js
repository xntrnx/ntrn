// keygen.js — genera tu par de llaves Ed25519 (una sola vez).
//
// Uso:
//   node keygen.js
//
// Produce:
//   private-key.pem   -> GUÁRDALA OFFLINE. Nunca la subas a GitHub.
//                        Sin ella no puedes firmar obras nuevas.
//   public-key.json   -> Esta SÍ va en tu repo público. Es lo que
//                        verify.html usa para comprobar firmas.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
const publicRaw = publicKey.export({ type: "spki", format: "der" });
// Los últimos 32 bytes del SPKI DER son la llave pública Ed25519 cruda.
const publicRawKey = publicRaw.subarray(publicRaw.length - 32);
const publicKeyBase64 = publicRawKey.toString("base64");

const privatePath = path.join(__dirname, "private-key.pem");
const publicPath = path.join(__dirname, "public-key.json");

if (fs.existsSync(privatePath)) {
  console.error(
    "Ya existe private-key.pem. Si generas una llave nueva, todas las obras\n" +
    "firmadas con la anterior dejarán de verificarse. Bórrala manualmente\n" +
    "primero si de verdad quieres reemplazarla."
  );
  process.exit(1);
}

fs.writeFileSync(privatePath, privatePem, { mode: 0o600 });
fs.writeFileSync(
  publicPath,
  JSON.stringify(
    {
      algorithm: "Ed25519",
      publicKeyBase64,
      artist: "Jimmy",
      created: new Date().toISOString().slice(0, 10),
    },
    null,
    2
  ) + "\n"
);

console.log("Llaves generadas.");
console.log("");
console.log("  private-key.pem  (NO subir a git — agrégala a .gitignore)");
console.log("  public-key.json  (sí sube esta al repo, va en tu web)");
console.log("");
console.log("Llave pública (base64):", publicKeyBase64);
