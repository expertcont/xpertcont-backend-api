function cpegeneraimpuestos(data) {
  //Impuestos solo igv codigo 1000
  //TaxAmount = base o subtotal
  //TaxableAmount = igv
  return `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${data.moneda_id}">${data.total_igv}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${data.moneda_id}">${data.base_gravada}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${data.moneda_id}">${data.total_igv}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>`;
}

module.exports = cpegeneraimpuestos;
