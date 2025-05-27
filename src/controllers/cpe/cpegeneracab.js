const {numeroALetras} = require('../../utils/libreria.utils');

function cpegeneracab(data) {
  //seccion enviada json.venta
  const toNumber = (val) => Number(val) || 0;
  let subtotal = toNumber(data.base_gravada) + toNumber(data.base_exonerada) + toNumber(data.venta.base_inafecta);
  let igv = toNumber(data.venta.total_igv);
  let sMontoLetras = numeroALetras(subtotal + igv);

  console.log(data);
  let sXml = `
    <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
    <cbc:CustomizationID>2.0</cbc:CustomizationID>
    <cbc:ID>${data.serie}-${data.numero}</cbc:ID>
    <cbc:IssueDate>${data.fecha_emision}</cbc:IssueDate>
    <cbc:IssueTime>${data.hora_emision}</cbc:IssueTime>
    <cbc:InvoiceTypeCode listID="0101" listAgencyName="PE:SUNAT"
      listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01"
      name="Tipo de Operacion" listSchemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo51">
      ${data.codigo}
    </cbc:InvoiceTypeCode>
    <cbc:Note languageLocaleID="1000">${sMontoLetras}</cbc:Note>
    <cbc:DocumentCurrencyCode>${data.moneda_id}</cbc:DocumentCurrencyCode>
  `;
  console.log(sXml);
  //Campos comprobante: codigo,serie,numero,fecha,hora,moneda_id(PEN,USD,EUR)
  return sXml;
}
module.exports = cpegeneracab;
