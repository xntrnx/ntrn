// revoke-key.js — marca una llave pública como revocada en keys.json.
//
// Úsalo cuando te ROBARON una llave privada (no cuando solo la
// perdiste sin que nadie más la tenga — en ese caso basta con rotar).
//
// Uso:
//   node revoke-key.js LLAVE_PUBLICA_EN_BASE64
//
// Después de correrlo, sube keys.json actualizado al repo. Cualquier
// obra firmada con esa llave a partir de ahora se marcará en
// verify.html como firmada con una llave revocada.
//
// Importante: esto NO invalida retroactivamente obras que ya
// firmaste legítimamente con esa llave antes del robo — solo alerta
// sobre firmas hechas con ella. Si sabes la fecha exacta del robo,
// puedes anotarla junto con el motivo para que quede constancia.

const fs = require("fs");
const path = require("path");

const target = process.argv[2];
if (!target) {
  console.error("Uso: node revoke-key.js LLAVE_PUBLICA_EN_BASE64");
  process.exit(1);
}

const keysPath = path.join(__dirname, "keys.json");
if (!fs.existsSync(keysPath)) {
  console.error("No existe keys.json todavía. Corre primero node keygen.js.");
  process.exit(1);
}

const keys = JSON.parse(fs.readFileSync(keysPath, "utf8"));
const entry = keys.find((k) => k.publicKeyBase64 === target);

if (!entry) {
  console.error("Esa llave no está en keys.json. Revisa que la copiaste completa.");
  process.exit(1);
}

if (entry.revoked) {
  console.log("Esa llave ya estaba marcada como revocada.");
  process.exit(0);
}

entry.revoked = true;
entry.revokedDate = new Date().toISOString().slice(0, 10);

fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2) + "\n");

console.log("Llave marcada como revocada:", target);
console.log("Sube keys.json actualizado al repo para que tome efecto.");
