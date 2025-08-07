const { numeroALetras } = require('../../utils/libreria.utils');

function cpegeneracab(data) {
  const toNumber = (val) => Number(val) || 0;

  let subtotal = toNumber(data.base_gravada) + toNumber(data.base_exonerada) + toNumber(data.base_inafecta);
  let igv = toNumber(data.total_igv);

  const monedaDesc = {
    'PEN': 'Soles',
    'USD': 'Dólares Americanos',
    'EUR': 'Euros'
  };

  const sMonedaDesc = monedaDesc[data.moneda_id] || '';
  let sMontoLetras = numeroALetras((subtotal + igv), sMonedaDesc);

  let sXml = `
    <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
    <cbc:CustomizationID>2.0</cbc:CustomizationID>
    <cbc:ID>${data.serie}-${data.numero}</cbc:ID>
    <cbc:IssueDate>${data.fecha_emision}</cbc:IssueDate>
    <cbc:IssueTime>${data.hora_emision}</cbc:IssueTime>`;

  // Solo incluir <cbc:InvoiceTypeCode> si no es nota de crédito (07)
  if (!['07', '08'].includes(data.codigo)) {
    sXml += `
    <cbc:InvoiceTypeCode listID="0101" listAgencyName="PE:SUNAT"
      listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01"
      name="Tipo de Operacion" listSchemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo51">${data.codigo}</cbc:InvoiceTypeCode>`;
  }

  sXml += `
    <cbc:Note languageLocaleID="1000">${sMontoLetras}</cbc:Note>
    <cbc:DocumentCurrencyCode>${data.moneda_id}</cbc:DocumentCurrencyCode>`;

  return sXml;
}

module.exports = cpegeneracab;
