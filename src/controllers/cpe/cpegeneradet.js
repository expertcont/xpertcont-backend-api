function cpegeneradet(items, moneda_id, codigo) {
  let xml = items.map((item, index) => {
    let {
      producto,
      cantidad,
      precio_base,
      codigo_sunat,
      codigo_producto,
      codigo_unidad,
      tipo_igv_codigo, // 🔹 Código de afectación IGV (Catálogo 07)
      porc_igv
    } = item;

    const precio_unitario = (precio_base * (1 + (porc_igv / 100))).toFixed(2);
    const subtotal_item = (precio_base * cantidad).toFixed(2);
    const igv_item = (subtotal_item * (porc_igv / 100)).toFixed(2);

    // 🔹 Variables por defecto (Gravado IGV - código 10)
    let taxSchemeId = "1000"; // IGV
    let taxSchemeName = "IGV";
    let taxTypeCode = "VAT";
    let percent = porc_igv;
    let taxAmount = igv_item;
    let taxableAmount = subtotal_item;
    let lineExtensionAmount = subtotal_item; // Valor de venta por defecto
    let priceTypeCode = "01"; // Precio unitario con IGV

    // 🔹 Reglas según tipo de IGV (Catálogo 07 SUNAT)
    if (tipo_igv_codigo === "20") { // Exonerado
      taxSchemeId = "9997";
      taxSchemeName = "EXO";
      taxAmount = "0.00";
      percent = "0";
    } else if (tipo_igv_codigo === "30") { // Inafecto
      taxSchemeId = "9998";
      taxSchemeName = "INA";
      taxTypeCode = "FRE";
      taxAmount = "0.00";
      percent = "0";
    } else if (tipo_igv_codigo === "21") { // Gratuito
      taxSchemeId = "9996";
      taxSchemeName = "GRA";
      taxTypeCode = "FRE";
      taxAmount = "0.00";
      lineExtensionAmount = "0.00"; // ⚠️ Valor de venta debe ser 0 en gratuitos
      priceTypeCode = "02"; // ⚠️ Precio referencial unitario en operaciones no onerosas
      percent = "0";
    }

    return `
    <cac:InvoiceLine>
      <cbc:ID>${index + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${codigo_unidad}">${cantidad}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${moneda_id}">${lineExtensionAmount}</cbc:LineExtensionAmount>
      
      <cac:PricingReference>
        <cac:AlternativeConditionPrice>
          <cbc:PriceAmount currencyID="${moneda_id}">${precio_unitario}</cbc:PriceAmount>
          <cbc:PriceTypeCode>${priceTypeCode}</cbc:PriceTypeCode>
        </cac:AlternativeConditionPrice>
      </cac:PricingReference>

      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${moneda_id}">${taxAmount}</cbc:TaxAmount>
        <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="${moneda_id}">${taxableAmount}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="${moneda_id}">${taxAmount}</cbc:TaxAmount>
            <cac:TaxCategory>
              <cbc:Percent>${percent}</cbc:Percent>
              <!-- 🔹 Código de afectación IGV (SUNAT Catálogo 07) -->
              <cbc:TaxExemptionReasonCode>${tipo_igv_codigo}</cbc:TaxExemptionReasonCode>
              <cac:TaxScheme>
                <cbc:ID>${taxSchemeId}</cbc:ID>
                <cbc:Name>${taxSchemeName}</cbc:Name>
                <cbc:TaxTypeCode>${taxTypeCode}</cbc:TaxTypeCode>
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

  // 🔹 Si el documento es Nota de Crédito (07), cambia las etiquetas
  if (codigo && String(codigo) === '07') {
    xml = xml.replace(/InvoiceLine/g, 'CreditNoteLine');
    xml = xml.replace(/InvoicedQuantity/g, 'CreditedQuantity');
  }

  return xml;
}

module.exports = cpegeneradet;

//Version Anterior Solo IGV
/*function cpegeneradet(items, moneda_id, codigo) {
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
    xml = xml.replace(/InvoiceLine/g, 'CreditNoteLine');
    xml = xml.replace(/InvoicedQuantity/g, 'CreditedQuantity');
  }

  return xml;
}
module.exports = cpegeneradet;*/
