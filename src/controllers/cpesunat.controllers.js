const cpegeneraxml = require('./cpe/cpegeneraxml');
const { subirArchivoDesdeMemoria } = require('./cpe/cpeuploader');
const pool = require('../db');

// 📌 Inyecta WebCrypto compatible en globalThis
const { Crypto } = require('@peculiar/webcrypto');
globalThis.crypto = new Crypto();


const { DOMParser, XMLSerializer } = require('xmldom');
const forge = require('node-forge');
const xpath = require('xpath');

const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
let digestOriginal;

const obtenerTodosPermisosContabilidadesVista = async (req,res,next)=> {
    try {
        const {id_usuario,id_invitado} = req.params;
        let strSQL;
        //Aqui modificar para cvista de contabilidades asiganadas y por asignar
        strSQL = "SELECT mad_usuariocontabilidad.documento_id";
        strSQL = strSQL + " ,(mad_usuariocontabilidad.documento_id || ' ' || mad_usuariocontabilidad.razon_social)::varchar(200) as nombre2";
        strSQL = strSQL + " ,mad_usuariocontabilidad.razon_social as nombre";
        strSQL = strSQL + " ,mad_seguridad_contabilidad.documento_id as id_permiso";
        strSQL = strSQL + " FROM"; 
        strSQL = strSQL + " mad_usuariocontabilidad LEFT JOIN mad_seguridad_contabilidad";
        strSQL = strSQL + " ON (mad_usuariocontabilidad.documento_id = mad_seguridad_contabilidad.documento_id and";
        strSQL = strSQL + "     mad_seguridad_contabilidad.id_usuario like '" + id_usuario + "%' and";
        strSQL = strSQL + "     mad_seguridad_contabilidad.id_invitado like '" + id_invitado + "%' )";
        strSQL = strSQL + " WHERE mad_usuariocontabilidad.id_usuario like '" + id_usuario + "%'";
        strSQL = strSQL + " ORDER BY mad_usuariocontabilidad.razon_social";
        console.log(strSQL);
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const registrarCPESunat = async (req,res,next)=> {
    try {
        const dataVenta = req.body;
        //console.log('Procesando comprobante: ',dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero);

        //00. Consulta previa datos necesarios para procesos posteriores: certificado,password, usuario secundario, url
        const { rows } = await pool.query(`
          SELECT certificado, password, secundario_user,secundario_passwd, url_envio
          FROM mad_usuariocertificado 
          WHERE documento_id = $1
        `, [dataVenta.empresa.ruc]);
        const {certificado: certificadoBuffer, password, secundario_user, secundario_passwd, url_envio} = rows[0];

        //01. Genera XML desde el servicio y canonicalizo el resultado
        let xmlComprobante = await cpegeneraxml(dataVenta);
        
        //02. Genero el bloque de firma y lo añado al xml Original (xmlComprobante)
        let xmlComprobanteFirmado = await firmarXMLUBL(xmlComprobante, certificadoBuffer,password);
        verificarDigest(digestOriginal, xmlComprobanteFirmado);

        //me guardo una copia del xmlFirmado en servidor ubuntu
        await subirArchivoDesdeMemoria(dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero, xmlComprobanteFirmado);
        
        //04. Construir SOAP
        let contenidoSOAP = await empaquetarYGenerarSOAP(dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero,xmlComprobanteFirmado,secundario_user,secundario_passwd);
        
        //05. Enviar SOAP
        const respuestaSoap = await enviarSOAPSunat(contenidoSOAP);
        console.log('📩 Respuesta recibida de SUNAT:');
        console.log(respuestaSoap);

        //06. Almacenar Certificado en tabla temporal ticket

        res.status(200).send('Archivo subido correctamente');
        
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

/*async function firmarXMLUBL(unsignedXML, certificadoBuffer, password) {

  // Cargar PFX desde buffer
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(certificadoBuffer));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  const privateKey = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;
  const certForge = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0].cert;
  const certPEM = forge.pki.certificateToPem(certForge);
  const rawCert = Buffer.from(certPEM.replace(/(-----(BEGIN|END) CERTIFICATE-----|\n)/g, ""), 'base64');

  // Parsear XML
  const doc = new DOMParser().parseFromString(unsignedXML, 'text/xml');

  // Buscar nodo UBLExtensions
  const select = xpath.useNamespaces({
    ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
  });
  const ublExtensions = select('//ext:UBLExtensions', doc)[0];
  if (!ublExtensions) throw new Error('No se encontró el nodo UBLExtensions');

  // Limpiar cualquier firma previa
  while (ublExtensions.firstChild) ublExtensions.removeChild(ublExtensions.firstChild);

  // Canonicalizar todo el documento raíz para DigestValue
  const canonXml = canonicalizarXML(new XMLSerializer().serializeToString(doc.documentElement));

  // Digest SHA256
  const mdCanon = forge.md.sha256.create();
  mdCanon.update(canonXml, 'utf8');
  const digest = forge.util.encode64(mdCanon.digest().bytes());

  // Construir Signature XML
  const signatureDoc = new DOMParser().parseFromString(`
    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
      <ds:SignedInfo>
        <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
        <ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha256"/>
        <ds:Reference URI="">
          <ds:Transforms>
            <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
            <ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
          </ds:Transforms>
          <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
          <ds:DigestValue>${digest}</ds:DigestValue>
        </ds:Reference>
      </ds:SignedInfo>
      <ds:SignatureValue></ds:SignatureValue>
      <ds:KeyInfo>
        <ds:X509Data>
          <ds:X509Certificate>${rawCert.toString('base64')}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </ds:Signature>
  `, 'text/xml');

  // Firmar el SignedInfo canonicalizado
  const signedInfoNode = signatureDoc.getElementsByTagName("ds:SignedInfo")[0];
  const canonSignedInfo = canonicalizarXML(new XMLSerializer().serializeToString(signedInfoNode));

  const mdSignedInfo = forge.md.sha256.create();
  mdSignedInfo.update(canonSignedInfo, 'utf8');
  const signature = forge.util.encode64(privateKey.sign(mdSignedInfo));

  // Colocar SignatureValue
  signatureDoc.getElementsByTagName("ds:SignatureValue")[0].textContent = signature;

  // Crear UBLExtension con la firma
  const ublExtension = doc.createElementNS('urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ext:UBLExtension');
  const extensionContent = doc.createElementNS('urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ext:ExtensionContent');

  const importedSignature = doc.importNode(signatureDoc.documentElement, true);
  extensionContent.appendChild(importedSignature);
  ublExtension.appendChild(extensionContent);
  ublExtensions.appendChild(ublExtension);

  // Retornar XML firmado
  const signedXmlString = new XMLSerializer().serializeToString(doc);
  return signedXmlString;
}
function canonicalizarXML(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml');

  const sig = new SignedXml();
  const xmlCanonicalized = sig.getCanonXml(doc.documentElement, {
    inclusiveNamespacesPrefixList: '',
    algorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
  });

  return xmlCanonicalized;
}
*/


async function firmarXMLUBL(unsignedXML, certificadoBuffer, password) {
  // 1️⃣ Leer PFX desde buffer y obtener privateKey y certificado
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(certificadoBuffer));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  const privateKey = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;
  const certForge = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0].cert;
  const certPEM = forge.pki.certificateToPem(certForge);
  const rawCert = Buffer.from(certPEM.replace(/(-----(BEGIN|END) CERTIFICATE-----|\n)/g, ''), 'base64');

  // 2️⃣ Parsear XML
  const doc = new DOMParser().parseFromString(unsignedXML, 'text/xml');

  // 3️⃣ Vaciar UBLExtensions
  const select = xpath.useNamespaces({
    ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
  });
  const ublExtensions = select('//ext:UBLExtensions', doc)[0];
  if (!ublExtensions) throw new Error('No se encontró el nodo UBLExtensions');
  while (ublExtensions.firstChild) ublExtensions.removeChild(ublExtensions.firstChild);

  // 4️⃣ Canonicalizar documento raíz para DigestValue
  const canonXml = canonicalizarManual(new XMLSerializer().serializeToString(doc.documentElement));

  // 5️⃣ Digest SHA-1 (SUNAT usa SHA-1 aún)
  const mdCanon = forge.md.sha1.create();
  mdCanon.update(canonXml, 'utf8');
  const digest = forge.util.encode64(mdCanon.digest().bytes());
  digestOriginal = digest; //prueba

  // 6️⃣ Construir Signature XML con DigestValue calculado
  const signatureXml = `
    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
      <ds:SignedInfo>
        <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
        <ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
        <ds:Reference URI="">
          <ds:Transforms>
            <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
            <ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
          </ds:Transforms>
          <ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
          <ds:DigestValue>${digest}</ds:DigestValue>
        </ds:Reference>
      </ds:SignedInfo>
      <ds:SignatureValue></ds:SignatureValue>
      <ds:KeyInfo>
        <ds:X509Data>
          <ds:X509Certificate>${rawCert.toString('base64')}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </ds:Signature>
  `;

  const signatureDoc = new DOMParser().parseFromString(signatureXml, 'text/xml');

  // 7️⃣ Canonicalizar SignedInfo para firmar
  const signedInfoNode = signatureDoc.getElementsByTagName('ds:SignedInfo')[0];
  const canonSignedInfo = canonicalizarManual(new XMLSerializer().serializeToString(signedInfoNode));

  const mdSignedInfo = forge.md.sha1.create();
  mdSignedInfo.update(canonSignedInfo, 'utf8');
  const signatureValue = forge.util.encode64(privateKey.sign(mdSignedInfo));

  // 8️⃣ Colocar SignatureValue
  signatureDoc.getElementsByTagName('ds:SignatureValue')[0].textContent = signatureValue;

  // 9️⃣ Crear UBLExtension con firma
  const ublExtension = doc.createElementNS(
    'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    'ext:UBLExtension'
  );
  const extensionContent = doc.createElementNS(
    'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    'ext:ExtensionContent'
  );

  const importedSignature = doc.importNode(signatureDoc.documentElement, true);
  extensionContent.appendChild(importedSignature);
  ublExtension.appendChild(extensionContent);
  ublExtensions.appendChild(ublExtension);

  // 🔟 Retornar XML firmado
  return new XMLSerializer().serializeToString(doc);
}

// 📦 Canonicalización manual compatible SUNAT (sin comentarios)
function canonicalizarManual(xmlStr) {
  return xmlStr
    .replace(/(\r\n|\n|\r)/g, '')
    .replace(/\t/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

function canonicalizarXML(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
  return canonicalizarNodo(doc.documentElement);
}

/*function canonicalizarXML(node) {
  const sig = new SignedXml();
  const xmlCanonicalized = sig.getCanonXml(node, {
    inclusiveNamespacesPrefixList: '',
    algorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
  });

  return xmlCanonicalized;
}*/

function empaquetarYGenerarSOAP(ruc, codigo, serie, numero, xmlFirmadoString, secundario_user,secundario_passwd) {
  const nombreArchivoXml = `${ruc}-${codigo}-${serie}-${numero}.xml`;
  const nombreArchivoZip = `${ruc}-${codigo}-${serie}-${numero}.zip`;

  // Crear ZIP en memoria
  const zip = new AdmZip();
  zip.addFile(nombreArchivoXml, Buffer.from(xmlFirmadoString));

  // Obtener contenido ZIP en buffer
  const zipBuffer = zip.toBuffer();

  // Convertir buffer a Base64
  const zipBase64 = zipBuffer.toString('base64');

  // Armar SOAP manualmente
  const soapXml = `<?xml version="1.0" encoding="UTF-8"?>
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
      <wsse:Security>
          <wsse:UsernameToken>
              <wsse:Username>${ruc}${secundario_user}</wsse:Username>
              <wsse:Password>${secundario_passwd}</wsse:Password>
          </wsse:UsernameToken>
      </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
        <ser:sendBill>
          <fileName>${nombreArchivoZip}</fileName>
          <contentFile>${zipBase64}</contentFile>
        </ser:sendBill>
  </soapenv:Body>
  </soapenv:Envelope>`;

  return soapXml;
}

async function enviarSOAPSunat(soapXml) {
  try {
    const response = await fetch('https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': ''  // obligatorio pero vacío
      },
      body: soapXml
    });

    const respuestaTexto = await response.text();
    return respuestaTexto;

  } catch (error) {
    console.error('❌ Error al enviar SOAP:', error);
    throw error;
  }
}
//////////////////////////////////////////////////////////////////////////////
function limpiarXML(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml');

  let serializer = new XMLSerializer();
  let xmlLimpio = serializer.serializeToString(doc.documentElement)
    .replace(/(\r\n|\n|\r)/gm, "")
    .replace(/\t/g, "")
    .replace(/\s{2,}/g, " "); // opcional: reducir espacios repetidos

  return xmlLimpio;
}
/////////////////////////////////////////////////////////////////////////////
function obtenerDocumentoRaizSinFirma(xmlFirmado) {
  const doc = new DOMParser().parseFromString(xmlFirmado, 'text/xml');
  const select = xpath.useNamespaces({
    ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
  });

  const ublExtensions = select('//ext:UBLExtensions', doc)[0];
  if (ublExtensions) {
    while (ublExtensions.firstChild) ublExtensions.removeChild(ublExtensions.firstChild);
  }

  const xmlCanon = new XMLSerializer().serializeToString(doc.documentElement)
    .replace(/(\r\n|\n|\r)/g, '')
    .replace(/\t/g, '')
    .replace(/>\s+</g, '><')
    .trim();

  return xmlCanon;
}

/**
 * 📌 Calcula el digest SHA-1 (SUNAT usa SHA-1 para DigestValue)
 */
function calcularDigest(xmlCanonizado) {
  const md = forge.md.sha1.create();
  md.update(xmlCanonizado, 'utf8');
  return forge.util.encode64(md.digest().bytes());
}

/**
 * 📌 Valida DigestValue original vs digest calculado del XML sin firma
 */
function verificarDigest(digestValueOriginal, xmlFirmado) {
  const xmlCanonizado = obtenerDocumentoRaizSinFirma(xmlFirmado);
  const digestCalculado = calcularDigest(xmlCanonizado);

  console.log('📄 Digest original generado: ', digestValueOriginal);
  console.log('📄 Digest recalculado ahora: ', digestCalculado);

  const coincide = digestValueOriginal === digestCalculado;

  if (coincide) {
    console.log('✅ DigestValue OK ✅');
  } else {
    console.error('❌ DigestValue distinto ❌');
  }

  return coincide;
}

module.exports = {
    obtenerTodosPermisosContabilidadesVista,
    registrarCPESunat
 }; 