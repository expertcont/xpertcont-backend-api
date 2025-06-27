function gregeneraremitente(data) {
  //documento_id y razon_social(emisor)
  //ubigeo,provincia,departamento,distrito y direccion (datos propios emisor tabla mad_usuariocontabilidad)
  const sXml = 
  `<cac:DespatchSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${data.ruc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
            <cbc:RegistrationName><![CDATA[${data.razon_social}]]></cbc:RegistrationName>
            <cac:RegistrationAddress>
                <cbc:CitySubdivisionName>${data.distrito}</cbc:CitySubdivisionName>
                <cbc:CityName>${data.provincia}</cbc:CityName>
                <cbc:CountrySubentity>${data.departamento}</cbc:CountrySubentity>
                <cbc:CountrySubentityCode>${data.ubigeo}</cbc:CountrySubentityCode>
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
  </cac:DespatchSupplierParty>`;
  return sXml;
}

module.exports = gregeneraremitente;
