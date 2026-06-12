function cpegeneraimpuestos(data) {

  const toNumber = (val) => Number(val) || 0;

  let taxSubtotals = "";

  const totalIgv = toNumber(data.total_igv);

  // ============================
  // Gravadas (1000)
  // ============================
  if (toNumber(data.base_gravada) > 0) {
    taxSubtotals += `
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${data.moneda_id}">
          ${toNumber(data.base_gravada).toFixed(2)}
        </cbc:TaxableAmount>

        <cbc:TaxAmount currencyID="${data.moneda_id}">
          ${totalIgv.toFixed(2)}
        </cbc:TaxAmount>

        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:ID schemeName="Codigo de tributos"
                     schemeAgencyName="PE:SUNAT"
                     schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">
              1000
            </cbc:ID>
            <cbc:Name>IGV</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>

      </cac:TaxSubtotal>`;
  }

  // ============================
  // Exoneradas (9997)
  // ============================
  if (toNumber(data.base_exonerada) > 0) {
    taxSubtotals += `
      <cac:TaxSubtotal>

        <cbc:TaxableAmount currencyID="${data.moneda_id}">
          ${toNumber(data.base_exonerada).toFixed(2)}
        </cbc:TaxableAmount>

        <cbc:TaxAmount currencyID="${data.moneda_id}">
          0.00
        </cbc:TaxAmount>

        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:ID schemeName="Codigo de tributos"
                     schemeAgencyName="PE:SUNAT"
                     schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">
              9997
            </cbc:ID>
            <cbc:Name>EXO</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>

      </cac:TaxSubtotal>`;
  }

  // ============================
  // Inafectas (9998)
  // ============================
  if (toNumber(data.base_inafecta) > 0) {
    taxSubtotals += `
      <cac:TaxSubtotal>

        <cbc:TaxableAmount currencyID="${data.moneda_id}">
          ${toNumber(data.base_inafecta).toFixed(2)}
        </cbc:TaxableAmount>

        <cbc:TaxAmount currencyID="${data.moneda_id}">
          0.00
        </cbc:TaxAmount>

        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:ID schemeName="Codigo de tributos"
                     schemeAgencyName="PE:SUNAT"
                     schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">
              9998
            </cbc:ID>
            <cbc:Name>INA</cbc:Name>
            <cbc:TaxTypeCode>FRE</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>

      </cac:TaxSubtotal>`;
  }

  // ============================
  // Gratuitas (9996)
  // ============================
  if (toNumber(data.total_gratuito) > 0) {
    taxSubtotals += `
      <cac:TaxSubtotal>

        <cbc:TaxableAmount currencyID="${data.moneda_id}">
          ${toNumber(data.total_gratuito).toFixed(2)}
        </cbc:TaxableAmount>

        <cbc:TaxAmount currencyID="${data.moneda_id}">
          0.00
        </cbc:TaxAmount>

        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:ID schemeName="Codigo de tributos"
                     schemeAgencyName="PE:SUNAT"
                     schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">
              9996
            </cbc:ID>
            <cbc:Name>GRA</cbc:Name>
            <cbc:TaxTypeCode>FRE</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>

      </cac:TaxSubtotal>`;
  }

  return `
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${data.moneda_id}">
        ${totalIgv.toFixed(2)}
      </cbc:TaxAmount>
      ${taxSubtotals}
    </cac:TaxTotal>`;
}

module.exports = cpegeneraimpuestos;

/*function cpegeneraimpuestos(data) {
  // Convierte valores a número para evitar NaN
  const toNumber = (val) => Number(val) || 0;

  let bloquesImpuestos = "";

  // ============================
  // IGV (Gravadas - 1000)
  // ============================
  if (toNumber(data.base_gravada) > 0) {
    bloquesImpuestos += `
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${data.moneda_id}">${data.total_igv}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${data.moneda_id}">${data.base_gravada}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${data.moneda_id}">${data.total_igv}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT"
              schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">1000</cbc:ID>
            <cbc:Name>IGV</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>`;
  }

  // ============================
  // Exonerado (9997)
  // ============================
  if (toNumber(data.base_exonerada) > 0) {
    bloquesImpuestos += `
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${data.moneda_id}">0.00</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${data.moneda_id}">${data.base_exonerada}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${data.moneda_id}">0.00</cbc:TaxAmount>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT"
              schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">9997</cbc:ID>
            <cbc:Name>EXO</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>`;
  }

  // ============================
  // Inafecto (9998)
  // ============================
  if (toNumber(data.base_inafecta) > 0) {
    bloquesImpuestos += `
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${data.moneda_id}">0.00</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${data.moneda_id}">${data.base_inafecta}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${data.moneda_id}">0.00</cbc:TaxAmount>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT"
              schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">9998</cbc:ID>
            <cbc:Name>INA</cbc:Name>
            <cbc:TaxTypeCode>FRE</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>`;
  }

  // ============================
  // Gratuito (9996 - operaciones gratuitas)
  // ============================
  if (toNumber(data.base_gratuita) > 0) {
    bloquesImpuestos += `
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${data.moneda_id}">0.00</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${data.moneda_id}">${data.base_gratuita}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${data.moneda_id}">0.00</cbc:TaxAmount>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT"
              schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">9996</cbc:ID>
            <cbc:Name>GRA</cbc:Name>
            <cbc:TaxTypeCode>FRE</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>`;
  }

  return bloquesImpuestos;
}

module.exports = cpegeneraimpuestos;*/