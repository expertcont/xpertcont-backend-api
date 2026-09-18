// GREM CARGA CONSOLIDADA (>20 REMITENTES)
//
// Shipment de la carga consolidada.
//
// La hoja SUNAT Guía-Transportista2_0 marca DespatchParty como obligatorio
// (errores 3383/3387 si falta). Como UBL no ofrece un DespatchParty repetible
// por cada DespatchLine, esta primera implementación conserva UN remitente
// global y deja los demás remitentes/destinatarios en el detalle.
//
// Prioridad para el remitente global:
//   1) guia.remitente_*
//   2) primer item de data.items
//
// Esto permite enviar la prueba a SUNAT sin eliminar el nodo obligatorio.

function valor(...valores) {
  for (const v of valores) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function remitenteGlobal(data = {}, items = []) {
  const primero = items[0] || {};

  const tipo = valor(
    data.remitente_tipo,
    data.remitente_id_doc,
    primero.remitente_tipo,
    primero.remitente_id_doc,
    primero.cliente_id_doc
  );

  const documento = valor(
    data.remitente_documento_id,
    data.remitente_ruc_dni,
    primero.remitente_documento_id,
    primero.remitente_ruc_dni,
    primero.cliente_documento_id
  );

  const nombre = valor(
    data.remitente_razon_social,
    data.remitente_nombre,
    data.remitente,
    primero.remitente_razon_social,
    primero.remitente_nombre,
    primero.remitente,
    primero.cliente
  );

  if (!tipo || !documento || !nombre) {
    throw new Error('GREM resumen: faltan datos del remitente global/primer remitente');
  }

  return { tipo, documento, nombre };
}

function gremresumengeneratransporte(data = {}, items = []) {
  const remitente = remitenteGlobal(data, items);

  let xml = `<cac:Shipment>
        <cbc:ID>1</cbc:ID>
        <cbc:HandlingCode>${data.guia_motivo_id}</cbc:HandlingCode>
        <cbc:HandlingInstructions>${data.observacion || 'TRASLADO DE ENCOMIENDAS - CARGA CONSOLIDADA'}</cbc:HandlingInstructions>
        <cbc:GrossWeightMeasure unitCode="KGM">${data.peso_total}</cbc:GrossWeightMeasure>`;

  if (data.numero_bultos) {
    xml += `<cbc:TotalTransportHandlingUnitQuantity>${data.numero_bultos}</cbc:TotalTransportHandlingUnitQuantity>`;
  }

  // Indicador recomendado por las reglas SUNAT cuando paga el remitente.
  // Si tu operación usa otro pagador, enviar guia.indicador_pagador_flete.
  if (data.indicador_pagador_flete !== false) {
    xml += `<cbc:SpecialInstructions>${data.indicador_pagador_flete || 'SUNAT_Envio_IndicadorPagadorFlete_Remitente'}</cbc:SpecialInstructions>`;
  }

  xml += `<cac:ShipmentStage>
            <cbc:TransportModeCode>${data.guia_modalidad_id}</cbc:TransportModeCode>
            <cac:TransitPeriod>
                <cbc:StartDate>${data.fecha_traslado}</cbc:StartDate>
                <cbc:EndDate>${data.fecha_traslado}</cbc:EndDate>
            </cac:TransitPeriod>`;

  if (data.guia_modalidad_id === '01') {
    xml += `<cac:CarrierParty>
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
    xml += `<cac:DriverPerson>
                <cbc:ID schemeID="1" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${data.conductor_dni}</cbc:ID>
                <cbc:FirstName>${data.conductor_nombres}</cbc:FirstName>
                <cbc:FamilyName>${data.conductor_apellidos}</cbc:FamilyName>
                <cbc:JobTitle>Principal</cbc:JobTitle>
                <cac:IdentityDocumentReference>
                    <cbc:ID>${data.conductor_licencia}</cbc:ID>
                </cac:IdentityDocumentReference>
            </cac:DriverPerson>`;
  }

  xml += `</cac:ShipmentStage>
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
                <cac:DespatchParty>
                    <cac:PartyIdentification>
                        <cbc:ID schemeID="${remitente.tipo}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${remitente.documento}</cbc:ID>
                    </cac:PartyIdentification>
                    <cac:PartyLegalEntity>
                        <cbc:RegistrationName><![CDATA[${remitente.nombre}]]></cbc:RegistrationName>
                    </cac:PartyLegalEntity>
                </cac:DespatchParty>
            </cac:Despatch>
        </cac:Delivery>`;

  if (data.vehiculo_placa) {
    const placa = String(data.vehiculo_placa).toUpperCase().replace(/[-\s]/g, '');
    xml += `<cac:TransportHandlingUnit>
            <cac:TransportEquipment>
                <cbc:ID>${placa}</cbc:ID>
            </cac:TransportEquipment>
        </cac:TransportHandlingUnit>`;
  }

  xml += `</cac:Shipment>`;
  return xml;
}

module.exports = gremresumengeneratransporte;
