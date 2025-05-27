function cpegenerapago(data) {
  //falta especificar arreglo de cuotas de pago
  return `
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>${data.forma_pago_id}</cbc:PaymentMeansID>
  </cac:PaymentTerms>`;
}

module.exports = cpegenerapago;
