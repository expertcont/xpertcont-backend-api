function cpegeneradiscrepancia(data) {
  //Propio de nota credito
  return `<cac:DiscrepancyResponse>
                <cbc:ReferenceID>${data.serie}-${data.numero}</cbc:ReferenceID>
                <cbc:ResponseCode>${data.motivo_id}</cbc:ResponseCode>
                <cbc:Description>${data.motivo}</cbc:Description>
          </cac:DiscrepancyResponse>`;
}
module.exports = cpegeneradiscrepancia;