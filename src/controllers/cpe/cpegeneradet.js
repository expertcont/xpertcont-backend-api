function cpegeneradet(items, moneda_id, codigo) {
  let xml = items.map((item, index) => {
    let {
      producto,
      cantidad,
      precio_base,
      codigo_sunat,
      codigo_producto,
      codigo_unidad,
      tipo_igv_codigo,
      porc_igv
    } = item;

    const precio_unitario = (precio_base * (1 + (porc_igv / 100))).toFixed(2);
    const subtotal_item = (precio_base * cantidad).toFixed(2);
    const igv_item = (subtotal_item * (porc_igv / 100)).toFixed(2);

    return `
    <cac:InvoiceLine>
      <cbc:ID>${index + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${codigo_unidad}">${cantidad}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${moneda_id}">${subtotal_item}</cbc:LineExtensionAmount>
      <cac:PricingReference>
        <cac:AlternativeConditionPrice>
          <cbc:PriceAmount currencyID="${moneda_id}">${precio_unitario}</cbc:PriceAmount>
          <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
        </cac:AlternativeConditionPrice>
      </cac:PricingReference>

      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${moneda_id}">${igv_item}</cbc:TaxAmount>
        <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="${moneda_id}">${subtotal_item}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="${moneda_id}">${igv_item}</cbc:TaxAmount>
            <cac:TaxCategory>
              <cbc:Percent>${porc_igv}</cbc:Percent>
              <cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode>
              <cac:TaxScheme>
                <cbc:ID>1000</cbc:ID>
                <cbc:Name>IGV</cbc:Name>
                <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
              </cac:TaxScheme>
            </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>

      <cac:Item>
        <cbc:Description><![CDATA[${producto}]]></cbc:Description>
        <cac:SellersItemIdentification>
          <cbc:ID>${codigo_producto}</cbc:ID>
        </cac:SellersItemIdentification>
        <cac:CommodityClassification>
          <cbc:ItemClassificationCode>${codigo_sunat}</cbc:ItemClassificationCode>
        </cac:CommodityClassification>        
      </cac:Item>

      <cac:Price>
        <cbc:PriceAmount currencyID="${moneda_id}">${precio_base}</cbc:PriceAmount>
      </cac:Price>

    </cac:InvoiceLine>`;
  }).join('');

  // Si el código es 07 (nota de crédito), reemplaza "Invoice" por "CreditNote"
  if (codigo && String(codigo) === '07') {
    xml = xml.replace(/Invoice/g, 'CreditNote');
  }

  return xml;
}

module.exports = cpegeneradet;
