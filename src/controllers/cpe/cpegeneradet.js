function cpegeneradet(items) {
  return items.map((item, index) => {
    // Variables previas para cálculos
    const { codigo_unidad, cantidad, moneda_id, porc_igv, precio_base, producto, codigo_producto, codigo_sunat } = item;

    //Nota: precio_base = precio unitario sin igv

    // Calcular momtos subtotal,igv 
    const subtotal_item = precio_base*cantidad;
    const igv_item = subtotal_item*(porc_igv / 100);


    return `
    <cac:InvoiceLine>
      <cbc:ID>${index + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${codigo_unidad}">${cantidad}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${moneda_id}">${subtotal_item}</cbc:LineExtensionAmount>
      <cac:PricingReference>
        <cac:AlternativeConditionPrice>
          <cbc:PriceAmount currencyID="${moneda_id}">${precio_base}</cbc:PriceAmount>
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
}

module.exports = cpegeneradet;
