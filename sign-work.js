// sign-work.js — firma la ficha de una obra con tu llave privada.
//
// Uso:
//   node sign-work.js works/TLK-2026-014.json
//
// Lee el JSON de la obra, quita cualquier firma anterior, ordena las
// llaves de forma determinista, firma ese texto exacto con Ed25519,
// y reescribe el archivo agregando "signature" y "publicKeyBase64".
//
// Cualquier cambio posterior al archivo (una fecha, una palabra en la
// descripción) invalida la firma — por eso verify.html puede detectar
// manipulación.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Uso: node sign-work.js works/ID-DE-LA-OBRA.json");
  process.exit(1);
}

const privatePath = path.join(__dirname, "private-key.pem");
const keysPath = path.join(__dirname, "keys.json");

if (!fs.existsSync(privatePath)) {
  console.error("No encuentro private-key.pem. Corre primero: node keygen.js");
  process.exit(1);
}

const privateKey = crypto.createPrivateKey(fs.readFileSync(privatePath, "utf8"));
const publicKey = crypto.createPublicKey(privateKey);
const publicRaw = publicKey.export({ type: "spki", format: "der" });
const publicKeyBase64 = publicRaw.subarray(publicRaw.length - 32).toString("base64");

// Asegura que esta llave esté registrada en keys.json (por si se perdió
// o se editó a mano) y avisa si está marcada como revocada — firmar con
// una llave revocada casi seguro es un error.
let keys = fs.existsSync(keysPath) ? JSON.parse(fs.readFileSync(keysPath, "utf8")) : [];
let entry = keys.find((k) => k.publicKeyBase64 === publicKeyBase64);
if (!entry) {
  entry = { publicKeyBase64, created: new Date().toISOString().slice(0, 10), revoked: false };
  keys.push(entry);
  fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2) + "\n");
  console.log("Nota: esta llave no estaba en keys.json, se agregó automáticamente.");
} else if (entry.revoked) {
  console.error(
    "ADVERTENCIA: la llave privada que estás usando corresponde a una entrada\n" +
    "marcada como REVOCADA en keys.json. Si esto es intencional, quita 'revoked'\n" +
    "de esa entrada; si no, estás firmando con una llave que ya no es de confianza."
  );
}

const work = JSON.parse(fs.readFileSync(filePath, "utf8"));
delete work.signature;
delete work.publicKeyBase64;

// Orden determinista de llaves -> el mismo contenido siempre produce
// el mismo texto canónico, sin importar en qué orden se escribió el JSON.
function canonicalize(obj) {
  if (Array.isArray(obj)) return obj.map(canonicalize);
  if (obj && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((acc, k) => {
        acc[k] = canonicalize(obj[k]);
        return acc;
      }, {});
  }
  return obj;
}

const canonical = JSON.stringify(canonicalize(work));
const signature = crypto.sign(null, Buffer.from(canonical, "utf8"), privateKey);

work.publicKeyBase64 = publicKeyBase64;
work.signature = signature.toString("base64");

fs.writeFileSync(filePath, JSON.stringify(work, null, 2) + "\n");

console.log(`Firmado: ${filePath}`);
console.log(`ID de obra: ${work.id || "(sin campo 'id')"}`);
