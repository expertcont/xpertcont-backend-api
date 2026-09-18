// GREM CLASICA (NO RESUMEN >20)
//
// Maestro del XML de GRE Transportista clásica.
//
// Estructura principal:
// 1. Cabecera
// 2. Firma
// 3. DespatchSupplierParty = TRANSPORTISTA / EMISOR
// 4. DeliveryCustomerParty = DESTINATARIO
// 5. Shipment
//      └─ Delivery
//          └─ Despatch
//              └─ DespatchParty = REMITENTE REAL
// 6. Detalle
//
// IMPORTANTE:
// Cuando se implemente el caso >20 remitentes, crear otro maestro.
// No mezclar esa estructura especial con esta GREM clásica.

const gremgeneracab = require('./gremgeneracab');
const gremgenerafirma = require('./gremgenerafirma');
const gremgeneratransportista = require('./gremgeneratransportista');
const gremgeneradestinatario = require('./gremgeneradestinatario');
const gremgeneratransporte = require('./gremgeneratransporte');
const gremgeneradet = require('./gremgeneradet');

function gremgenerarxml(data) {
  return `<DespatchAdvice 
    xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
    xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
    xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
    xmlns:ccts="urn:un:unece:uncefact:documentation:2"
    xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
    xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
    xmlns:qdt="urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2"
    xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1"
    xmlns:udt="urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <ext:UBLExtensions>
        <ext:UBLExtension>
          <ext:ExtensionContent/>
        </ext:UBLExtension>
      </ext:UBLExtensions>

      ${gremgeneracab(data.guia)}
      ${gremgenerafirma(data.empresa)}

      <!-- TRANSPORTISTA / EMISOR DE LA GREM -->
      ${gremgeneratransportista(data.empresa)}

      <!-- DESTINATARIO DE LA GREM CLASICA -->
      ${gremgeneradestinatario(data.guia)}

      <!-- TRANSPORTE + REMITENTE REAL + ORIGEN/DESTINO + VEHICULO -->
      ${gremgeneratransporte(data.guia)}

      ${gremgeneradet(data.items)}
  </DespatchAdvice>`;
}

module.exports = gremgenerarxml;
