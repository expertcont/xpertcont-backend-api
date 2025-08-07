const {numeroALetras} = require('../../utils/libreria.utils');

function cpegeneracab(data) {
  //seccion enviada json.venta
  const toNumber = (val) => Number(val) || 0;
  let subtotal = toNumber(data.base_gravada) + toNumber(data.base_exonerada) + toNumber(data.base_inafecta);
  let igv = toNumber(data.total_igv);
  const monedaDesc = {
      'PEN': 'Soles',
      'USD': 'Dolares Americanos',
      'EUR': 'Euros'
  };
  const sMonedaDesc = monedaDesc[data.moneda_id] || ''; // Manejo de caso por defecto
  let sMontoLetras = numeroALetras((subtotal + igv),sMonedaDesc);

  let sXml = `
    <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
    <cbc:CustomizationID>2.0</cbc:CustomizationID>
    <cbc:ID>${data.serie}-${data.numero}</cbc:ID>
    <cbc:IssueDate>${data.fecha_emision}</cbc:IssueDate>
    <cbc:IssueTime>${data.hora_emision}</cbc:IssueTime>
    <cbc:InvoiceTypeCode listID="0101" listAgencyName="PE:SUNAT"
      listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01"
      name="Tipo de Operacion" listSchemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo51">${data.codigo}</cbc:InvoiceTypeCode>
    <cbc:Note languageLocaleID="1000">${sMontoLetras}</cbc:Note>
    <cbc:DocumentCurrencyCode>${data.moneda_id}</cbc:DocumentCurrencyCode>`;
    
  //Campos comprobante: codigo,serie,numero,fecha,hora,moneda_id(PEN,USD,EUR)
  return sXml;
}
module.exports = cpegeneracab;
