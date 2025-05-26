function cpegeneracliente(data) {
  //tipo_identidad = 1(dni), 6(ruc)
  return `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${data.tipo_identidad}">${data.documento_identidad}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${data.razon_social_nombres}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`;
}

module.exports = cpegeneracliente;
