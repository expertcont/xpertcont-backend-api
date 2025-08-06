function cpegenerareferencia(data) {
  //Propio NotaCredito
  return `<cac:BillingReference>
            <cac:InvoiceDocumentReference>
              <cbc:ID>${data.ref_serie}-${data.ref_numero}</cbc:ID>
              <cbc:DocumentTypeCode>${data.ref_codigo}</cbc:DocumentTypeCode>
            </cac:InvoiceDocumentReference>
          </cac:BillingReference>`;
}
module.exports = cpegenerareferencia;