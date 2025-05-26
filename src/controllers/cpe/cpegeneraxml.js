const cpegeneracab = require('./cpegeneracab');
const cpegenerafirma = require('./cpegenerafirma');
const cpegeneraemisor = require('./cpegeneraemisor');
const cpegeneracliente = require('./cpegeneracliente');
const cpegenerapago = require('./cpegenerapago');
const cpegeneraimpuestos = require('./cpegeneraimpuestos');
const cpegeneratotales = require('./cpegeneratotales');
const cpegeneradet = require('./cpegeneradet');

function cpegenerarxml(data) {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
           xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
           xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    ${cpegeneracab(data)}
    ${cpegenerafirma(data)}
    ${cpegeneraemisor(data)}
    ${cpegeneracliente(data)}
    ${cpegenerapago(data)}
    ${cpegeneraimpuestos(data)}
    ${cpegeneratotales(data)}
    ${cpegeneradet(data.items)}
  </Invoice>`;
}

module.exports = cpegenerarxml;
