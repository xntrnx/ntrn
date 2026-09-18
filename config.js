// config.js — datos que tú editas. Nada de esto es secreto: tu CLABE y tu
// Client ID de PayPal son, por naturaleza, datos que alguien necesita ver
// para poder pagarte. No pongas aquí tu llave privada de firma ni nada de
// certify/ — eso es un sistema aparte y no debe tocarse desde aquí.

window.SHOP_CONFIG = {
  // Developer.paypal.com -> tu app -> "Client ID" (usa la de modo Live
  // cuando ya quieras cobrar de verdad; usa la de Sandbox mientras pruebas).
  paypalClientId: "TU_CLIENT_ID_DE_PAYPAL",
  paypalCurrency: "MXN",

  // A dónde le llega al comprador el mensaje para mandarte su dirección
  // de envío o su comprobante de transferencia (no hay backend que lo
  // capture automáticamente, así que esto es el puente).
  contactEmail: "tu-correo@ejemplo.com",
  contactWhatsapp: "", // opcional, formato: 521XXXXXXXXXX (sin +, sin espacios)

  spei: {
    clabe: "000000000000000000",
    banco: "Nombre de tu banco",
    beneficiario: "Nombre completo del titular de la cuenta",
  },
};
