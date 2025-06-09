const cpegeneraxml = require('./cpe/cpegeneraxml');
const { subirArchivoDesdeMemoria } = require('./cpe/cpeuploader');
const pool = require('../db');

// 📌 Inyecta WebCrypto compatible en globalThis
const { Crypto } = require('@peculiar/webcrypto');
globalThis.crypto = new Crypto();

const xadesjs = require('xadesjs');
xadesjs.Application.setEngine("NodeJS WebCrypto", globalThis.crypto);

const { DOMParser, XMLSerializer } = require('xmldom');
const forge = require('node-forge');
const xpath = require('xpath');


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
        //console.log(dataVenta);
        //console.log('Procesando comprobante: ',dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero);

        // Genera XML desde el servicio
        const xmlComprobante = await cpegeneraxml(dataVenta);

        //Se firma con datos del emisor (empresa: correo y ruc)
        const xmlFirmado = firmarXMLUBL(xmlComprobante, dataVenta.empresa.ruc);

        subirArchivoDesdeMemoria(dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero,xmlFirmado);

        return res.status(200).json({
                message:"xml generado"
        });

    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};


async function firmarXMLUBL(unsignedXML, ruc) {
  verificarAPIXAdES();

  const { rows } = await pool.query(`
    SELECT certificado, password
    FROM mad_usuariocertificado 
    WHERE documento_id = $1
  `, [ruc]);

  if (rows.length === 0) throw new Error('Certificado no encontrado para el RUC indicado.');

  const { certificado: certificadoBuffer, password } = rows[0];

  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(certificadoBuffer));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  const privateKey = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;
  const certPEM = forge.pki.certificateToPem(
    p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0].cert
  );

  const doc = new DOMParser().parseFromString(unsignedXML, 'text/xml');

  const select = xpath.useNamespaces({
    ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
  });
  const ublExtensions = select('//ext:UBLExtensions', doc)[0];
  if (ublExtensions) while (ublExtensions.firstChild) ublExtensions.removeChild(ublExtensions.firstChild);

  const privateKeyBuffer = convertPrivateKeyToPkcs8Buffer(privateKey);
  const privateKeyCrypto = await xadesjs.Application.crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );

  try {
    const xmlSig = new xadesjs.SignedXml();
    xmlSig.SigningKey = privateKeyCrypto;

    // 📌 Crear referencia manual
    const reference = new xadesjs.xml.Reference();
    reference.Uri = "";
    reference.DigestMethod.Algorithm = "http://www.w3.org/2001/04/xmlenc#sha256";

    // 📌 Transformaciones: enveloped y canonicalization
    const transform1 = new xadesjs.xml.Transform();
    transform1.Algorithm = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
    reference.Transforms.Add(transform1);

    const transform2 = new xadesjs.xml.Transform();
    transform2.Algorithm = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
    reference.Transforms.Add(transform2);

    // 📌 Agregar referencia al SignedInfo
    xmlSig.SignedInfo.References.Add(reference);

    // 📌 Firmar
    await xmlSig.Sign(
      { name: "RSASSA-PKCS1-v1_5" },
      privateKeyCrypto,
      doc.documentElement
    );

    // 📌 Obtener signature generado
    const signatureElement = xmlSig.XmlSignature;
    if (!signatureElement) throw new Error('No se pudo obtener el elemento signature');

    // 📌 Agregar certificado manualmente al KeyInfo
    const rawCert = Buffer.from(certPEM.replace(/(-----(BEGIN|END) CERTIFICATE-----|\n)/g, ""), 'base64');

    const keyInfo = signatureElement.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'KeyInfo')[0]
      || doc.createElementNS('http://www.w3.org/2000/09/xmldsig#', 'KeyInfo');

    const x509Data = doc.createElementNS('http://www.w3.org/2000/09/xmldsig#', 'X509Data');
    const x509Certificate = doc.createElementNS('http://www.w3.org/2000/09/xmldsig#', 'X509Certificate');
    x509Certificate.appendChild(doc.createTextNode(rawCert.toString('base64')));
    x509Data.appendChild(x509Certificate);
    keyInfo.appendChild(x509Data);
    signatureElement.appendChild(keyInfo);

    // 📌 Insertar Signature dentro de UBLExtensions
    const ublExtension = doc.createElementNS('urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ext:UBLExtension');
    const extensionContent = doc.createElementNS('urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ext:ExtensionContent');
    const importedSignature = doc.importNode(signatureElement, true);

    extensionContent.appendChild(importedSignature);
    ublExtension.appendChild(extensionContent);
    ublExtensions.appendChild(ublExtension);

    return new XMLSerializer().serializeToString(doc);

  } catch (error) {
    console.log(error);
    next(error)
  }
}

function verificarAPIXAdES() {
  console.log('Verificando API XAdES.js:');
  if (typeof xadesjs.SignedXml === 'function') {
    const testInstance = new xadesjs.SignedXml();
    console.log('Métodos disponibles:', {
      Sign: typeof testInstance.Sign,
      ComputeSignature: typeof testInstance.ComputeSignature,
      AddReference: typeof testInstance.AddReference
    });
  }
}

function convertPrivateKeyToPkcs8Buffer(privateKey) {
  const privateKeyAsn1 = forge.pki.privateKeyToAsn1(privateKey);
  const privateKeyInfoAsn1 = forge.pki.wrapRsaPrivateKey(privateKeyAsn1);
  const derBuffer = forge.asn1.toDer(privateKeyInfoAsn1).getBytes();
  return new Uint8Array([...derBuffer].map(c => c.charCodeAt(0)));
}

//////////////////////////////////////////////////////////////////////////////
/*function convertPrivateKeyToPkcs8Buffer(privateKey) {
  // 📌 Convertimos la clave privada a ASN.1 (PKCS#1)
  const privateKeyAsn1 = forge.pki.privateKeyToAsn1(privateKey);

  // 📌 Armamos la estructura PKCS#8 (PrivateKeyInfo)
  const privateKeyInfoAsn1 = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [
      // version (INTEGER 0)
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, String.fromCharCode(0)),

      // algorithm (SEQUENCE)
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.SEQUENCE,
        true,
        [
          // algorithm OID for rsaEncryption
          forge.asn1.create(
            forge.asn1.Class.UNIVERSAL,
            forge.asn1.Type.OID,
            false,
            forge.asn1.oidToDer(forge.pki.oids.rsaEncryption).getBytes()
          ),
          // parameters (NULL)
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, '')
        ]
      ),

      // PrivateKey (OCTET STRING)
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.OCTETSTRING,
        false,
        forge.asn1.toDer(privateKeyAsn1).getBytes()
      )
    ]
  );

  // 📌 Convertimos a DER y luego a Buffer
  const privateKeyDer = forge.asn1.toDer(privateKeyInfoAsn1).getBytes();
  return Buffer.from(privateKeyDer, 'binary');
}*/

module.exports = {
    obtenerTodosPermisosContabilidadesVista,
    registrarCPESunat
 }; 