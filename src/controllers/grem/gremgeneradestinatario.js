function gremgeneradestinatario(data) {
  if (!data.destinatario_tipo || !data.destinatario_ruc_dni || !data.destinatario_razon_social) {
    return '';
  }

  return `<cac:DeliveryCustomerParty>
        <cac:Party>
            <cac:PartyIdentification>
                <cbc:ID schemeID="${data.destinatario_tipo}">${data.destinatario_ruc_dni}</cbc:ID>
            </cac:PartyIdentification>
            <cac:PartyLegalEntity>
                <cbc:RegistrationName><![CDATA[${data.destinatario_razon_social}]]></cbc:RegistrationName>
            </cac:PartyLegalEntity>
        </cac:Party>
    </cac:DeliveryCustomerParty>`;
}

module.exports = gremgeneradestinatario;
