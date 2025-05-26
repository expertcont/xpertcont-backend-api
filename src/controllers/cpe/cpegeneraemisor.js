function cpegeneraemisor(data) {
  //documento_id y razon_social(emisor)
  //ubigeo,provincia,departamento,distrito y direccion (datos propios emisor tabla mad_usuariocontabilidad)
  return `
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${data.ruc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${data.razon_social}]]></cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${data.razon_social}]]></cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:ID schemeName="Ubigeos" schemeAgencyName="PE:INEI">${data.ubigeo}</cbc:ID>
          <cbc:AddressTypeCode>0000</cbc:AddressTypeCode>
          <cbc:CityName>${data.provincia}</cbc:CityName>
          <cbc:CountrySubentity>${data.departamento}</cbc:CountrySubentity>
          <cbc:District>${data.distrito}</cbc:District>
          <cac:AddressLine>
            <cbc:Line>${data.domicilio_fiscal}</cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>PE</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>`;
}

module.exports = cpegeneraemisor;
