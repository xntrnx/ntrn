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
if (!fs.existsSync(privatePath)) {
  console.error("No encuentro private-key.pem. Corre primero: node keygen.js");
  process.exit(1);
}

const privateKey = crypto.createPrivateKey(fs.readFileSync(privatePath, "utf8"));
const publicKey = crypto.createPublicKey(privateKey);
const publicRaw = publicKey.export({ type: "spki", format: "der" });
const publicKeyBase64 = publicRaw.subarray(publicRaw.length - 32).toString("base64");

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
