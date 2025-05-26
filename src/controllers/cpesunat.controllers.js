
function generaCPETotales(data) {
  return `
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${data.moneda}">${data.totalValorVenta}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${data.moneda}">${data.totalPrecioVenta}</cbc:TaxInclusiveAmount>
    <cbc:ChargeTotalAmount currencyID="${data.moneda}">0.00</cbc:ChargeTotalAmount>
    <cbc:PrepaidAmount currencyID="${data.moneda}">0.00</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="${data.moneda}">${data.totalPrecioVenta}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
}
