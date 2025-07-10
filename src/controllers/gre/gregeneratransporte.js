function gregeneratransporte(data) {
    //tipo_identidad = 1(dni), 6(ruc)
    let xmlTransporte = 
   `<cac:Shipment>
        <cbc:ID>1</cbc:ID>
        <cbc:HandlingCode>${data.guia_motivo_id}</cbc:HandlingCode>
        <cbc:HandlingInstructions>VENTA</cbc:HandlingInstructions>
        <cbc:GrossWeightMeasure unitCode="KGM">${data.peso_total}</cbc:GrossWeightMeasure>`;
        //<!--  Datos del Envío - Numero de bultos o pallets - Enteros -->
    //caso recojo bienes transformados,se requiere numero_bultos
        if (data.guia_motivo_id == "07"){    
    xmlTransporte +=
        `<cbc:TotalTransportHandlingUnitQuantity>${data.numero_bultos}</cbc:TotalTransportHandlingUnitQuantity>`;
    };
    
    xmlTransporte +=
       `<cac:ShipmentStage>
            <cbc:TransportModeCode>${data.guia_modalidad_id}</cbc:TransportModeCode>
            <cac:TransitPeriod>
                <cbc:StartDate>${data.fecha_traslado}</cbc:StartDate>
            </cac:TransitPeriod>`;
    //<!--  Datos del Envío - Embarque - Transporte publico -->
    if (data.guia_modalidad_id == "01"){
        xmlTransporte +=
           `<cac:CarrierParty>
                <cac:PartyIdentification>
                    <cbc:ID schemeID="6">${data.transp_ruc}</cbc:ID>
                </cac:PartyIdentification>
                <cac:PartyLegalEntity>
                    <cbc:RegistrationName><![CDATA[${data.transp_razon_social}]]></cbc:RegistrationName>
                </cac:PartyLegalEntity>
            </cac:CarrierParty>`;
    };
    //<!--  Datos del Envío - Embarque - Transporte privado -->
    if (data.guia_modalidad_id == "02"){
        xmlTransporte += 
           `<cac:DriverPerson>
                <cbc:ID schemeID="1" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${data.conductor_dni}</cbc:ID>
                <cbc:FirstName>${data.conductor_nombres}</cbc:FirstName>
                <cbc:FamilyName>${data.conductor_apellidos}</cbc:FamilyName>
                <cbc:JobTitle>Principal</cbc:JobTitle>
                <cac:IdentityDocumentReference>
                    <cbc:ID>${data.conductor_licencia}</cbc:ID>
                </cac:IdentityDocumentReference>
            </cac:DriverPerson>`;
    };

        xmlTransporte +=
        `</cac:ShipmentStage>
            <cac:Delivery>
                <cac:DeliveryAddress>
                    <cbc:ID>${data.llegada_ubigeo}</cbc:ID>
                    <cac:AddressLine>
                        <cbc:Line><![CDATA[${sanitizeCdata(data.llegada_direccion)}]]></cbc:Line>
                    </cac:AddressLine>
                </cac:DeliveryAddress>
                <cac:Despatch>
                    <cac:DespatchAddress>
                        <cbc:ID>${data.partida_ubigeo}</cbc:ID>
                        <cac:AddressLine>
                            <cbc:Line><![CDATA[${sanitizeCdata(data.partida_direccion)}]]></cbc:Line>
                        </cac:AddressLine>
                    </cac:DespatchAddress>
                </cac:Despatch>
            </cac:Delivery>
        </cac:Shipment>`;

   
    return xmlTransporte;
}

module.exports = gregeneratransporte;