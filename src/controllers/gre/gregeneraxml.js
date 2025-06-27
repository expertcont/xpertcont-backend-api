const gregeneracab = require('./gregeneracab');
const gregenerafirma = require('./gregenerafirma');
const gregeneraremitente = require('./gregeneraremitente');
const gregeneradestinatario = require('./gregeneradestinatario');
const gregeneratransporte = require('./gregeneratransporte');
const gregeneradet = require('./gregeneradet');

function gregenerarxml(data) {
  return `<DespatchAdvice 
    xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
    xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ccts="urn:un:unece:uncefact:documentation:2"
    xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
    xmlns:qdt="urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2" xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1"
    xmlns:udt="urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <ext:UBLExtensions>
            <ext:UBLExtension>
                <ext:ExtensionContent/>
            </ext:UBLExtension>
          </ext:UBLExtensions>
          ${gregeneracab(data.guia)}
          ${gregenerafirma(data.empresa)}
          ${gregeneraremitente(data.empresa)}
          ${gregeneradestinatario(data.guia)}
          ${gregeneratransporte(data.guia)}
          ${gregeneradet(data.items)}
  </DespatchAdvice>`;
}
/*
        

*/
module.exports = gregenerarxml;
