function cpegenerapago(data) {
  let forma_pago = (data.r_fecvcto == null) ? 'Contado' : 'Credito';
  //falta especificar arreglo de cuotas de pago
  return `
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>${forma_pago}</cbc:PaymentMeansID>
  </cac:PaymentTerms>`;
}

module.exports = cpegenerapago;
