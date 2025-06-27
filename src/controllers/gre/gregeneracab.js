function gregeneracab(data) {
  //${data.codigo} = 09  por default
  const sXml = 
   `<cbc:UBLVersionID>2.1</cbc:UBLVersionID>
    <cbc:CustomizationID>2.0</cbc:CustomizationID>
    <cbc:ID>${data.serie}-${data.numero}</cbc:ID>
    <cbc:IssueDate>${data.fecha_emision}</cbc:IssueDate>
    <cbc:IssueTime>${data.hora_emision}</cbc:IssueTime>
    <cbc:DespatchAdviceTypeCode>${data.codigo}</cbc:DespatchAdviceTypeCode>
    <cbc:Note>Guia generada desde los sistemas del contribuyente</cbc:Note>`;

  //Campos comprobante: codigo,serie,numero,fecha,hora,moneda_id(PEN,USD,EUR)
  return sXml;
}
module.exports = gregeneracab;
