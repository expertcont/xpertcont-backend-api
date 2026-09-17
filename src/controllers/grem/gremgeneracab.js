function gremgeneracab(data) {
  return `<cbc:UBLVersionID>2.1</cbc:UBLVersionID>
    <cbc:CustomizationID>2.0</cbc:CustomizationID>
    <cbc:ID>${data.serie}-${data.numero}</cbc:ID>
    <cbc:IssueDate>${data.fecha_emision}</cbc:IssueDate>
    <cbc:IssueTime>${data.hora_emision || new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'America/Lima' })}</cbc:IssueTime>
    <cbc:DespatchAdviceTypeCode>${data.codigo || '31'}</cbc:DespatchAdviceTypeCode>
    <cbc:Note>GRE Transportista generada desde los sistemas del contribuyente</cbc:Note>`;
}

module.exports = gremgeneracab;
