// keygen.js — genera un par de llaves Ed25519 y lo agrega a keys.json.
//
// Primer uso (una sola vez):
//   node keygen.js
//
// Rotar llave (la perdiste, o quieres reemplazarla por rutina):
//   1. Borra o mueve tu private-key.pem actual.
//   2. node keygen.js
//   Esto agrega la llave nueva a keys.json SIN borrar el registro de
//   la anterior — así las obras ya firmadas con la llave vieja siguen
//   verificándose. Solo firmarás obras nuevas con la llave nueva.
//
// Si te ROBARON la llave (no solo la perdiste), además de rotar,
// marca la vieja como revocada:
//   node revoke-key.js LLAVE_PUBLICA_VIEJA_EN_BASE64
//
// Produce / actualiza:
//   private-key.pem  -> GUÁRDALA OFFLINE. Nunca la subas a GitHub.
//   keys.json        -> Historial de llaves públicas. Esta SÍ va al
//                       repo — verify.html la usa para comprobar firmas.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const privatePath = path.join(__dirname, "private-key.pem");
const keysPath = path.join(__dirname, "keys.json");

if (fs.existsSync(privatePath)) {
  console.error(
    "Ya existe private-key.pem en esta carpeta.\n\n" +
    "Si es la que ya usas para firmar, no hay nada que hacer.\n" +
    "Si la perdiste o te la robaron y quieres reemplazarla, primero\n" +
    "mueve o borra este archivo (private-key.pem) y vuelve a correr\n" +
    "node keygen.js. Si te la robaron, después corre también:\n" +
    "  node revoke-key.js LLAVE_PUBLICA_VIEJA\n"
  );
  process.exit(1);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
const publicRaw = publicKey.export({ type: "spki", format: "der" });
// Los últimos 32 bytes del SPKI DER son la llave pública Ed25519 cruda.
const publicKeyBase64 = publicRaw.subarray(publicRaw.length - 32).toString("base64");

let keys = [];
if (fs.existsSync(keysPath)) {
  try {
    keys = JSON.parse(fs.readFileSync(keysPath, "utf8"));
  } catch (e) {
    console.error("keys.json existe pero no se pudo leer como JSON. Revísalo a mano.");
    process.exit(1);
  }
}

const isRotation = keys.length > 0;

keys.push({
  publicKeyBase64,
  created: new Date().toISOString().slice(0, 10),
  revoked: false,
});

fs.writeFileSync(privatePath, privatePem, { mode: 0o600 });
fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2) + "\n");

console.log(isRotation ? "Llave rotada." : "Llave generada.");
console.log("");
console.log("  private-key.pem  (NO subir a git — agrégala a .gitignore)");
console.log("  keys.json        (sí sube esta al repo, va en tu web)");
console.log("");
console.log("Llave pública nueva (base64):", publicKeyBase64);
if (isRotation) {
  console.log("");
  console.log(`Ya hay ${keys.length - 1} llave(s) anterior(es) en el historial.`);
  console.log("Las obras firmadas con ellas siguen verificándose.");
  console.log("Si esta rotación es porque te ROBARON la llave anterior, corre:");
  console.log("  node revoke-key.js LLAVE_PUBLICA_VIEJA");
}
