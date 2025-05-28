function cpegeneratotales(data) {

  const toNumber = (val) => Number(val) || 0;
  let subtotal = toNumber(data.base_gravada) + toNumber(data.base_exonerada) + toNumber(data.base_inafecta);
  let igv = toNumber(data.total_igv);
  let nPrecioTotal = subtotal + igv;
  console.log(data);
  
  return `
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${data.moneda_id}">${data.base_gravada}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${data.moneda_id}">${nPrecioTotal}</cbc:TaxInclusiveAmount>
    <cbc:ChargeTotalAmount currencyID="${data.moneda_id}">0.00</cbc:ChargeTotalAmount>
    <cbc:PrepaidAmount currencyID="${data.moneda_id}">0.00</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="${data.moneda_id}">${nPrecioTotal}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
}

module.exports = cpegeneratotales;
