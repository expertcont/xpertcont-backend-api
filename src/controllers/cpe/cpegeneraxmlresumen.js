function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(value) {
  return `<![CDATA[${String(value ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

function toMoney(value) {
  const number = Number(value || 0);
  return number.toFixed(2);
}

function hasAmount(value) {
  return Number(value || 0) > 0;
}

function getValue(source, keys, defaultValue = '') {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== '') {
      return source[key];
    }
  }
  return defaultValue;
}

function buildBillingPayment(documento, fieldNames, instructionID, moneda) {
  const amount = getValue(documento, fieldNames, 0);
  if (!hasAmount(amount)) {
    return '';
  }

  return `
    <sac:BillingPayment>
      <cbc:PaidAmount currencyID="${escapeXml(moneda)}">${toMoney(amount)}</cbc:PaidAmount>
      <cbc:InstructionID>${instructionID}</cbc:InstructionID>
    </sac:BillingPayment>`;
}

function buildTaxTotalIgv(documento, moneda) {
  const totalIgv = getValue(documento, ['total_igv', 'igv'], 0);

  return `
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${escapeXml(moneda)}">${toMoney(totalIgv)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxAmount currencyID="${escapeXml(moneda)}">${toMoney(totalIgv)}</cbc:TaxAmount>
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

function buildBillingReference(documento) {
  const refSerie = getValue(documento, ['ref_serie', 'serie_referencia']);
  const refNumero = getValue(documento, ['ref_numero', 'numero_referencia']);
  const refCodigo = getValue(documento, ['ref_codigo', 'tipo_documento_referencia'], '03');

  if (!refSerie || !refNumero) {
    return '';
  }

  return `
    <cac:BillingReference>
      <cac:InvoiceDocumentReference>
        <cbc:ID>${escapeXml(refSerie)}-${escapeXml(refNumero)}</cbc:ID>
        <cbc:DocumentTypeCode>${escapeXml(refCodigo)}</cbc:DocumentTypeCode>
      </cac:InvoiceDocumentReference>
    </cac:BillingReference>`;
}

function buildResumenLine(documento, index) {
  // LINEA DE RESUMEN - VERSION UBL DE UNA FILA DEL TRD
  // Paso 1: leer identificacion del comprobante y del cliente.
  // Cada SummaryDocumentsLine representa una boleta completa.
  const moneda = getValue(documento, ['moneda_id', 'moneda'], 'PEN');
  const tipoDocumento = getValue(documento, ['tipo_documento', 'codigo'], '03');
  const serie = getValue(documento, ['serie']);
  const numero = getValue(documento, ['numero']);
  const clienteDocumento = getValue(documento, ['cliente_numero_documento', 'documento_identidad'], '-');
  const clienteTipo = getValue(documento, ['cliente_tipo_documento', 'tipo_identidad'], '0');
  const status = getValue(documento, ['status', 'estado_resumen'], '1');
  const total = getValue(documento, ['total_a_pagar', 'monto_total', 'total'], 0);

  if (!serie || !numero) {
    throw new Error(`El comprobante de la linea ${index} no tiene serie o numero.`);
  }

  // Paso 2: generar importes por tipo de operacion:
  // - total_gravada   -> BillingPayment InstructionID 01.
  // - total_exonerada -> BillingPayment InstructionID 02.
  // - total_inafecta  -> BillingPayment InstructionID 03.
  // - total_gratuita  -> BillingPayment InstructionID 05.
  //
  // Paso 3: generar siempre TaxTotal IGV 1000 VAT.
  // En encomiendas lleva el IGV real; en boletos exonerados viaja 0.00.
  return `
  <sac:SummaryDocumentsLine>
    <cbc:LineID>${index}</cbc:LineID>
    <cbc:DocumentTypeCode>${escapeXml(tipoDocumento)}</cbc:DocumentTypeCode>
    <cbc:ID>${escapeXml(serie)}-${escapeXml(numero)}</cbc:ID>
    <cac:AccountingCustomerParty>
      <cbc:CustomerAssignedAccountID>${escapeXml(clienteDocumento)}</cbc:CustomerAssignedAccountID>
      <cbc:AdditionalAccountID>${escapeXml(clienteTipo)}</cbc:AdditionalAccountID>
    </cac:AccountingCustomerParty>
    ${tipoDocumento === '07' ? buildBillingReference(documento) : ''}
    <cac:Status>
      <cbc:ConditionCode>${escapeXml(status)}</cbc:ConditionCode>
    </cac:Status>
    <sac:TotalAmount currencyID="${escapeXml(moneda)}">${toMoney(total)}</sac:TotalAmount>
    ${buildBillingPayment(documento, ['total_gravada', 'base_gravada'], '01', moneda)}
    ${buildBillingPayment(documento, ['total_exonerada', 'base_exonerada'], '02', moneda)}
    ${buildBillingPayment(documento, ['total_inafecta', 'base_inafecta'], '03', moneda)}
    ${buildBillingPayment(documento, ['total_gratuita', 'base_gratuita'], '05', moneda)}
    ${buildTaxTotalIgv(documento, moneda)}
  </sac:SummaryDocumentsLine>`;
}

function cpegenerarxmlresumen(data) {
  // XML SUMMARYDOCUMENTS - NUEVA VERSION DEL ARCHIVO QUE ANTES PREPARABA SFS
  // Paso 1: validar cabecera del resumen RC:
  // numero = fecha o identificador YYYYMMDD, correlativo = envio del dia.
  const { empresa, resumen, comprobantes } = data || {};

  if (!empresa?.ruc) {
    throw new Error('El resumen no tiene empresa.ruc.');
  }

  if (!Array.isArray(comprobantes) || comprobantes.length === 0) {
    throw new Error('El resumen debe incluir al menos un comprobante.');
  }

  const numero = getValue(resumen, ['numero', 'fecha_documentos']);
  const correlativo = getValue(resumen, ['correlativo'], '1');
  const fechaDocumentos = getValue(resumen, ['fecha_documentos', 'fecha_referencia']);
  const fechaResumen = getValue(resumen, ['fecha_resumen', 'fecha_emision']);

  if (!numero || !fechaDocumentos || !fechaResumen) {
    throw new Error('El resumen requiere numero, fecha_documentos y fecha_resumen.');
  }

  // Paso 2: convertir cada boleta del JSON en sac:SummaryDocumentsLine.
  const lines = comprobantes
    .map((documento, index) => buildResumenLine(documento, index + 1))
    .join('');

  // Paso 3: armar el XML UBL que luego sera firmado y enviado con sendSummary.
  return `<?xml version="1.0" encoding="UTF-8"?>
<SummaryDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
  <cbc:CustomizationID>1.1</cbc:CustomizationID>
  <cbc:ID>RC-${escapeXml(numero)}-${escapeXml(correlativo)}</cbc:ID>
  <cbc:ReferenceDate>${escapeXml(fechaDocumentos)}</cbc:ReferenceDate>
  <cbc:IssueDate>${escapeXml(fechaResumen)}</cbc:IssueDate>
  <cac:Signature>
    <cbc:ID>${escapeXml(empresa.ruc)}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${escapeXml(empresa.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${cdata(empresa.razon_social)}</cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>SignatureSP</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:AccountingSupplierParty>
    <cbc:CustomerAssignedAccountID>${escapeXml(empresa.ruc)}</cbc:CustomerAssignedAccountID>
    <cbc:AdditionalAccountID>6</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${cdata(empresa.razon_social)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  ${lines}
</SummaryDocuments>`;
}

module.exports = cpegenerarxmlresumen;
