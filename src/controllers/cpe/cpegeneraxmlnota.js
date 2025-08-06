const cpegeneracab = require('./cpegeneracab');
const cpegeneradiscrepancia = require('./cpegeneradiscrepancia');
const cpegenerafirma = require('./cpegenerafirma');
const cpegeneraemisor = require('./cpegeneraemisor');
const cpegeneracliente = require('./cpegeneracliente');
const cpegenerapago = require('./cpegenerapago');
const cpegeneraimpuestos = require('./cpegeneraimpuestos');
const cpegeneratotales = require('./cpegeneratotales');
const cpegeneradet = require('./cpegeneradet');
const cpegenerareferencia = require('./cpegenerareferencia');

function cpegenerarxmlnota(data) {
  
  return `<CreditNote  xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
           xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
           xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
           xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
          <ext:UBLExtensions>
            <ext:UBLExtension>
                <ext:ExtensionContent/>
            </ext:UBLExtension>
          </ext:UBLExtensions>
          ${cpegeneracab(data.venta)}
          ${cpegeneradiscrepancia(data.venta)}
          ${cpegenerareferencia(data.venta)}
          ${cpegenerafirma(data.empresa)}
          ${cpegeneraemisor(data.empresa)}
          ${cpegeneracliente(data.cliente)}
          ${cpegeneraimpuestos(data.venta)}
          ${cpegeneratotales(data.venta)}
          ${cpegeneradet(data.items, data.venta.moneda_id, data.venta.codigo)}
  </Invoice>`;
}
/*
        

*/
module.exports = cpegenerarxmlnota;
