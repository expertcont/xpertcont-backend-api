function cpegeneratotales(data) {
  const monedas = {
    "1": "PEN",
    "2": "USD"
  };
  let sMoneda = monedas[data.moneda_id] || "EUR";

  const toNumber = (val) => Number(val) || 0;
  let subtotal = toNumber(data.total_gravada) + toNumber(data.total_exonerada) + toNumber(data.total_inafecta);
  let igv = toNumber(data.total_igv);
  let nPrecioTotal = subtotal + igv;

  return `
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${sMoneda}">${data.total_gravada}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${sMoneda}">${nPrecioTotal}</cbc:TaxInclusiveAmount>
    <cbc:ChargeTotalAmount currencyID="${sMoneda}">0.00</cbc:ChargeTotalAmount>
    <cbc:PrepaidAmount currencyID="${sMoneda}">0.00</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="${sMoneda}">${nPrecioTotal}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
}

module.exports = cpegeneratotales;
