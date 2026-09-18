// GREM CARGA CONSOLIDADA (>20 REMITENTES)
//
// DeliveryCustomerParty global.
// En esta rama representa a la agencia/punto de venta que recibe físicamente
// la carga consolidada. Por defecto usa el RUC de la propia transportista.
//
// Campos opcionales específicos de guia:
//   agencia_destino_tipo
//   agencia_destino_documento_id
//   agencia_destino_nombre
//
// Si no vienen, usa empresa.ruc y un nombre basado en llegada_direccion.

function gremresumengeneradestinatario(data = {}, empresa = {}) {
  const tipo = String(data.agencia_destino_tipo || '6').trim();
  const documento = String(data.agencia_destino_documento_id || empresa.ruc || '').trim();
  const nombre = String(
    data.agencia_destino_nombre ||
    data.punto_venta_destino_nombre ||
    `${empresa.razon_social || ''}${data.llegada_direccion ? ` - ${data.llegada_direccion}` : ''}`
  ).trim();

  if (!documento) {
    throw new Error('GREM resumen: falta documento de la agencia destinataria');
  }
  if (!nombre) {
    throw new Error('GREM resumen: falta nombre de la agencia destinataria');
  }

  return `<cac:DeliveryCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${tipo}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${documento}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${nombre}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:DeliveryCustomerParty>`;
}

module.exports = gremresumengeneradestinatario;
