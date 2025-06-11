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

        //01. Genera XML desde el servicio
        let xmlComprobante = await cpegeneraxml(dataVenta);
        xmlComprobante = limpiarXML(xmlComprobante);
        
        //02. Consulta previa Firma y Envio: certificado,password, usuario secundario, url
        const { rows } = await pool.query(`
          SELECT certificado, password, secundario_user,secundario_passwd, url_envio
          FROM mad_usuariocertificado 
          WHERE documento_id = $1
        `, [dataVenta.empresa.ruc]);
        const { certificado: certificadoBuffer, password, secundario_user,secundario_passwd,url_envio } = rows[0];
        
        //03. Firma con datos del emisor (empresa) y se guarda copia en servidor linux (ubuntu)
        let contenidoFirmado = await firmarXMLUBL(xmlComprobante, certificadoBuffer,password);
        contenidoFirmado = limpiarXML(contenidoFirmado);
        await subirArchivoDesdeMemoria(dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero, contenidoFirmado);
        
        //04. Construir SOAP
        let contenidoSOAP = await empaquetarYGenerarSOAP(dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero,contenidoFirmado,secundario_user,secundario_passwd);
        console.log(contenidoSOAP);
        
        //05. Enviar SOAP

        //06. Almacenar Certificado en tabla temporal ticket

        res.status(200).send('Archivo subido correctamente');
        
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

async function firmarXMLUBL(unsignedXML, certificadoBuffer, password) {
  // Consulta certificado y password
  /*const { rows } = await pool.query(`
    SELECT certificado, password
    FROM mad_usuariocertificado 
    WHERE documento_id = $1
  `, [ruc]);

  if (rows.length === 0) throw new Error('Certificado no encontrado para el RUC indicado.');

  const { certificado: certificadoBuffer, password } = rows[0];
  */

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

  while (ublExtensions.firstChild) ublExtensions.removeChild(ublExtensions.firstChild);

  // Serializar Canonicalizado
  const canonXml = new XMLSerializer().serializeToString(doc.documentElement)
    .replace(/(\r\n|\n|\r)/gm, "");

  // 📌 Digest SHA256 manual con forge
  const mdCanon = forge.md.sha256.create();
  mdCanon.update(canonXml, 'utf8');
  const digest = forge.util.encode64(mdCanon.digest().bytes());

  // Construir Signature manualmente
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
          <ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha256"/>
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

  // Firmar el SignedInfo
  const signedInfo = signatureDoc.getElementsByTagName("ds:SignedInfo")[0];
  const canonSignedInfo = new XMLSerializer().serializeToString(signedInfo)
    .replace(/(\r\n|\n|\r)/gm, "");

  const mdSignedInfo = forge.md.sha256.create();
  mdSignedInfo.update(canonSignedInfo, 'utf8');

  const signature = forge.util.encode64(privateKey.sign(mdSignedInfo));

  // Insertar SignatureValue
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
  //console.log(signedXmlString);
  return signedXmlString;
}

function limpiarXML(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');

  // Serializar sin saltos de línea ni espacios innecesarios
  let serializer = new XMLSerializer();
  let xmlStr = serializer.serializeToString(doc);

  // Limpiar saltos de línea y tabs
  xmlStr = xmlStr.replace(/>\s+</g, '><').trim();

  return xmlStr;
}

function empaquetarYGenerarSOAP(ruc, codigo, serie, numero, xmlString, secundario_user,secundario_passwd) {
  const nombreArchivoXml = `${ruc}-${codigo}-${serie}-${numero}.xml`;
  const nombreArchivoZip = `${ruc}-${codigo}-${serie}-${numero}.zip`;

  // Crear ZIP en memoria
  const zip = new AdmZip();
  zip.addFile(nombreArchivoXml, Buffer.from(xmlString));

  // Obtener contenido ZIP en buffer
  const zipBuffer = zip.toBuffer();

  // Convertir buffer a Base64
  const zipBase64 = zipBuffer.toString('base64');

  // Armar SOAP manualmente
  /*const soapXml = `<?xml version="1.0" encoding="UTF-8"?>
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                    xmlns:ser="http://service.sunat.gob.pe">
    <soapenv:Header/>
    <soapenv:Body>
      <ser:sendBill>
        <fileName>${nombreArchivoZip}</fileName>
        <contentFile>${zipBase64}</contentFile>
      </ser:sendBill>
    </soapenv:Body>
  </soapenv:Envelope>`;*/

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
          <fileName>${nombreArchivoZip}</fileName>
          <contentFile>${zipBase64}</contentFile>
  </soapenv:Body>
  </soapenv:Envelope>`;

  return soapXml;
}

//////////////////////////////////////////////////////////////////////////////

module.exports = {
    obtenerTodosPermisosContabilidadesVista,
    registrarCPESunat
 }; 