function gremgenerafirma(data) {
  return `<cac:Signature>
        <cbc:ID>${data.ruc}</cbc:ID>
        <cac:SignatoryParty>
          <cac:PartyIdentification>
            <cbc:ID>${data.ruc}</cbc:ID>
          </cac:PartyIdentification>
          <cac:PartyName>
            <cbc:Name><![CDATA[${data.razon_social}]]></cbc:Name>
          </cac:PartyName>
        </cac:SignatoryParty>
        <cac:DigitalSignatureAttachment>
          <cac:ExternalReference>
            <cbc:URI>SIGN</cbc:URI>
          </cac:ExternalReference>
        </cac:DigitalSignatureAttachment>
    </cac:Signature>`;
}

module.exports = gremgenerafirma;
