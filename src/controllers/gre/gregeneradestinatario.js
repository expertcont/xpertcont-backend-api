function gregeneradestinatario(data) {
  //tipo_identidad = 1(dni), 6(ruc)
  const sXml = 
   `<cac:DeliveryCustomerParty>
        <cac:Party>
            <cac:PartyIdentification>
                <cbc:ID schemeID="${data.destinatario_tipo}">${data.destinatario_ruc_dni}</cbc:ID>
            </cac:PartyIdentification>
            <cac:PartyLegalEntity>
                <cbc:RegistrationName><![CDATA[${data.destinatario_razon_social}]]></cbc:RegistrationName>
            </cac:PartyLegalEntity>
        </cac:Party>
    </cac:DeliveryCustomerParty>`;
  return sXml;
}

module.exports = gregeneradestinatario;
