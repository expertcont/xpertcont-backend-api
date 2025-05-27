const cpegeneracab = require('./cpegeneracab');
const cpegenerafirma = require('./cpegenerafirma');
const cpegeneraemisor = require('./cpegeneraemisor');
const cpegeneracliente = require('./cpegeneracliente');
const cpegenerapago = require('./cpegenerapago');
const cpegeneraimpuestos = require('./cpegeneraimpuestos');
const cpegeneratotales = require('./cpegeneratotales');
const cpegeneradet = require('./cpegeneradet');

function cpegenerarxml(data) {
  console.log(data);
  return `<?xml version="1.0" encoding="UTF-8"?>
  <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
           xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
           xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    ${cpegeneracab(data.empresa)}
  </Invoice>`;
}
/* 
    ${cpegenerafirma(data.empresa)}
    ${cpegeneraemisor(data.empresa)}
    ${cpegeneracliente(data.cliente)}
    ${cpegenerapago(data.venta)}
    ${cpegeneraimpuestos(data.venta)}
    ${cpegeneratotales(data.venta)}
    ${cpegeneradet(data.items)}

*/
module.exports = cpegenerarxml;
