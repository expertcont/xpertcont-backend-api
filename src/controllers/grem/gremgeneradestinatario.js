// GREM CLASICA (NO RESUMEN >20)
//
// Destinatario real de la GREM clásica.
//
// No se usa fallback hacia data.empresa.
// Si falta información, se detiene la generación para evitar colocar
// accidentalmente a la empresa transportista como destinatario.

function gremgeneradestinatario(data = {}) {
  const destinatarioTipo = (data.destinatario_tipo || '').toString().trim();
  const destinatarioRucDni = (data.destinatario_ruc_dni || '').toString().trim();
  const destinatarioRazonSocial = (data.destinatario_razon_social || '').toString().trim();

  if (!destinatarioTipo) {
    throw new Error('GREM clásica: falta destinatario_tipo');
  }

  if (!destinatarioRucDni) {
    throw new Error('GREM clásica: falta destinatario_ruc_dni');
  }

  if (!destinatarioRazonSocial) {
    throw new Error('GREM clásica: falta destinatario_razon_social');
  }

  return `<cac:DeliveryCustomerParty>
        <cac:Party>
            <cac:PartyIdentification>
                <cbc:ID schemeID="${destinatarioTipo}">${destinatarioRucDni}</cbc:ID>
            </cac:PartyIdentification>
            <cac:PartyLegalEntity>
                <cbc:RegistrationName><![CDATA[${destinatarioRazonSocial}]]></cbc:RegistrationName>
            </cac:PartyLegalEntity>
        </cac:Party>
    </cac:DeliveryCustomerParty>`;
}

module.exports = gremgeneradestinatario;
