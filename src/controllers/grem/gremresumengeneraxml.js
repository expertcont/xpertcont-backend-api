// GREM CARGA CONSOLIDADA (>20 REMITENTES)
//
// Maestro separado de la GREM clásica para poder probar/corregir esta rama
// sin alterar el XML clásico ya implementado.
//
// Reutiliza:
//   gremgeneracab.js
//   gremgenerafirma.js
//   gremgeneratransportista.js
//
// IMPORTANTE:
// SUNAT exige actualmente un DespatchParty global (remitente) en GREM.
// Por eso gremresumengeneratransporte.js conserva ese nodo usando
// guia.remitente_* o, si no viene, el primer item de la carga.
// Los remitentes/destinatarios particulares de cada encomienda se expresan
// además en cada DespatchLine como AdditionalItemProperty para la prueba
// de carga consolidada.

const gremgeneracab = require('./gremgeneracab');
const gremgenerafirma = require('./gremgenerafirma');
const gremgeneratransportista = require('./gremgeneratransportista');
const gremresumengeneradestinatario = require('./gremresumengeneradestinatario');
const gremresumengeneratransporte = require('./gremresumengeneratransporte');
const gremresumengeneradet = require('./gremresumengeneradet');

function gremresumengenerarxml(data = {}) {
  const guia = data.guia || {};
  const empresa = data.empresa || {};
  const items = Array.isArray(data.items) ? data.items : [];

  if (!items.length) {
    throw new Error('GREM resumen: data.items no contiene encomiendas');
  }

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

      ${gremgeneracab(guia)}
      ${gremgenerafirma(empresa)}

      <!-- TRANSPORTISTA / EMISOR -->
      ${gremgeneratransportista(empresa)}

      <!-- DESTINATARIO GLOBAL: AGENCIA RECEPTORA -->
      ${gremresumengeneradestinatario(guia, empresa)}

      <!-- SHIPMENT + REMITENTE GLOBAL EXIGIDO POR REGLAS SUNAT -->
      ${gremresumengeneratransporte(guia, items)}

      <!-- UNA LINEA POR ENCOMIENDA -->
      ${gremresumengeneradet(items)}
  </DespatchAdvice>`;
}

module.exports = gremresumengenerarxml;
