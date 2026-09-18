// GREM CLASICA (NO RESUMEN >20)
//
// Shipment de la GRE Transportista.
//
// Estructura relevante:
// Shipment
// ├─ ShipmentStage
// │  └─ CarrierParty
// ├─ Delivery
// │  ├─ DeliveryAddress             = llegada
// │  └─ Despatch
// │     ├─ DespatchAddress          = partida
// │     └─ DespatchParty            = REMITENTE REAL
// └─ TransportHandlingUnit          = vehículo
//
// El DespatchParty se mantiene separado en gremgeneraremitente.js.

const gremgeneraremitente = require('./gremgeneraremitente');

function gremgeneratransporte(data = {}) {
  let xmlTransporte = `<cac:Shipment>
        <cbc:ID>1</cbc:ID>
        <cbc:HandlingCode>${data.guia_motivo_id}</cbc:HandlingCode>
        <cbc:HandlingInstructions>${data.observacion || 'TRASLADO DE ENCOMIENDAS'}</cbc:HandlingInstructions>
        <cbc:GrossWeightMeasure unitCode="KGM">${data.peso_total}</cbc:GrossWeightMeasure>`;

  if (data.numero_bultos) {
    xmlTransporte += `<cbc:TotalTransportHandlingUnitQuantity>${data.numero_bultos}</cbc:TotalTransportHandlingUnitQuantity>`;
  }

  xmlTransporte += `<cac:ShipmentStage>
            <cbc:TransportModeCode>${data.guia_modalidad_id}</cbc:TransportModeCode>
            <cac:TransitPeriod>
                <cbc:StartDate>${data.fecha_traslado}</cbc:StartDate>
                <cbc:EndDate>${data.fecha_traslado}</cbc:EndDate>
            </cac:TransitPeriod>`;

  if (data.guia_modalidad_id === '01') {
    xmlTransporte += `<cac:CarrierParty>
                <cac:PartyIdentification>
                    <cbc:ID schemeID="6">${data.transp_ruc}</cbc:ID>
                </cac:PartyIdentification>
                <cac:PartyLegalEntity>
                    <cbc:RegistrationName><![CDATA[${data.transp_razon_social}]]></cbc:RegistrationName>
                    <cac:CorporateRegistrationScheme>
                        <cbc:ID>${data.transp_mtc || '-'}</cbc:ID>
                    </cac:CorporateRegistrationScheme>
                </cac:PartyLegalEntity>
        </cac:CarrierParty>`;
  }

  if (data.guia_modalidad_id === '02') {
    xmlTransporte += `<cac:DriverPerson>
                <cbc:ID schemeID="1" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${data.conductor_dni}</cbc:ID>
                <cbc:FirstName>${data.conductor_nombres}</cbc:FirstName>
                <cbc:FamilyName>${data.conductor_apellidos}</cbc:FamilyName>
                <cbc:JobTitle>Principal</cbc:JobTitle>
                <cac:IdentityDocumentReference>
                    <cbc:ID>${data.conductor_licencia}</cbc:ID>
                </cac:IdentityDocumentReference>
            </cac:DriverPerson>`;
  }

  xmlTransporte += `</cac:ShipmentStage>
            <cac:Delivery>
                <cac:DeliveryAddress>
                    <cbc:ID>${data.llegada_ubigeo}</cbc:ID>
                    <cac:AddressLine>
                        <cbc:Line><![CDATA[${data.llegada_direccion}]]></cbc:Line>
                    </cac:AddressLine>
                </cac:DeliveryAddress>

                <cac:Despatch>
                    <cac:DespatchAddress>
                        <cbc:ID>${data.partida_ubigeo}</cbc:ID>
                        <cac:AddressLine>
                            <cbc:Line><![CDATA[${data.partida_direccion}]]></cbc:Line>
                        </cac:AddressLine>
                    </cac:DespatchAddress>

                    <!-- REMITENTE REAL, distinto del transportista/emisor -->
                    ${gremgeneraremitente(data)}

                </cac:Despatch>
            </cac:Delivery>`;

  if (data.vehiculo_placa) {
    const placa = String(data.vehiculo_placa)
      .toUpperCase()
      .replace(/[-\s]/g, '');

    xmlTransporte += `<cac:TransportHandlingUnit>
                <cac:TransportEquipment>
                    <cbc:ID>${placa}</cbc:ID>
                </cac:TransportEquipment>
            </cac:TransportHandlingUnit>`;
  }

  xmlTransporte += `</cac:Shipment>`;

  return xmlTransporte;
}

module.exports = gremgeneratransporte;
