function gremgeneradestinatario(data = {}, empresa = {}) {
  const destinatarioTipo = data.destinatario_tipo || (empresa.ruc ? '6' : '');
  const destinatarioRucDni = data.destinatario_ruc_dni || empresa.ruc || '';
  const destinatarioRazonSocial = data.destinatario_razon_social || empresa.razon_social || '';

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
