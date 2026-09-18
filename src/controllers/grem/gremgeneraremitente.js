// GREM CLASICA (NO RESUMEN >20)
//
// REMITENTE REAL de la mercadería/encomienda.
//
// SUNAT lo ubica en:
// Shipment > Delivery > Despatch > DespatchParty
//
// NO usar data.empresa aquí: data.empresa corresponde al transportista.
//
// Reglas SUNAT 20/06/2026:
// - Tipo de documento del remitente: obligatorio.
// - Número de documento del remitente: obligatorio (error 3383 si falta).
// - Nombre / razón social del remitente: obligatorio (error 3387 si falta).

function gremgeneraremitente(data = {}) {
  const remitenteTipo = (
    data.remitente_tipo ||
    data.remitente_id_doc ||
    ''
  ).toString().trim();

  const remitenteDocumento = (
    data.remitente_documento_id ||
    data.remitente_ruc_dni ||
    ''
  ).toString().trim();

  const remitenteNombre = (
    data.remitente_razon_social ||
    data.remitente_nombre ||
    data.remitente ||
    ''
  ).toString().trim();

  if (!remitenteTipo) {
    throw new Error('GREM clásica: falta tipo de documento del remitente');
  }

  if (!remitenteDocumento) {
    throw new Error('GREM clásica: falta número de documento del remitente');
  }

  if (!remitenteNombre) {
    throw new Error('GREM clásica: falta nombre/razón social del remitente');
  }

  return `<cac:DespatchParty>
        <cac:PartyIdentification>
            <cbc:ID
                schemeID="${remitenteTipo}"
                schemeName="Documento de Identidad"
                schemeAgencyName="PE:SUNAT"
                schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06"
            >${remitenteDocumento}</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyLegalEntity>
            <cbc:RegistrationName><![CDATA[${remitenteNombre}]]></cbc:RegistrationName>
        </cac:PartyLegalEntity>
    </cac:DespatchParty>`;
}

module.exports = gremgeneraremitente;
