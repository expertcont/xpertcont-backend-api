function cpegenerapago(data) {

  if (data.forma_pago_id === 'Contado') {
    return `
    <cac:PaymentTerms>
      <cbc:ID>FormaPago</cbc:ID>
      <cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>
    </cac:PaymentTerms>`;
  }else{
    //Considerar 1 sola cuota, por el momento
    const toNumber = (val) => Number(val) || 0;
    let subtotal = toNumber(data.base_gravada) + toNumber(data.base_exonerada) + toNumber(data.base_inafecta) + toNumber(data.base_gratuita);
    let igv = toNumber(data.total_igv);
    let nPrecioTotal = (subtotal + igv).toFixed(2);

    return `
    <cac:PaymentTerms>
      <cbc:ID>FormaPago</cbc:ID>
      <cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>
    </cac:PaymentTerms>
    <cac:PaymentTerms>
      <cbc:ID>Cuota001</cbc:ID>
      <cbc:Amount currencyID="${data.moneda_id}">
        ${nPrecioTotal}
      </cbc:Amount>
      <cbc:PaymentDueDate>
        ${data.fecha_vencimiento}
      </cbc:PaymentDueDate>
    </cac:PaymentTerms>`;
  };

}

/*function cpegenerapago(data) {
  //falta especificar arreglo de cuotas de pago
  return `
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>${data.forma_pago_id}</cbc:PaymentMeansID>
  </cac:PaymentTerms>`;
}*/

module.exports = cpegenerapago;
