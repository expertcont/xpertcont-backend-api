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

  // Consulta certificado y password
  const { rows } = await pool.query(`
    SELECT certificado, password
    FROM mad_usuariocertificado 
    WHERE documento_id = $1
  `, [ruc]);

  if (rows.length === 0) throw new Error('Certificado no encontrado para el RUC indicado.');

  const { certificado: certificadoBuffer, password } = rows[0];

  // Carga PFX desde buffer y obtiene clave y certificado
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(certificadoBuffer));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  const privateKey = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;
  const certForge = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0].cert;
  const certPEM = forge.pki.certificateToPem(certForge);

  // Parsear XML sin firmar
  const doc = new DOMParser().parseFromString(unsignedXML, 'text/xml');

  // Limpiar contenido de UBLExtensions
  const select = xpath.useNamespaces({
    ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
  });
  const ublExtensions = select('//ext:UBLExtensions', doc)[0];
  if (!ublExtensions) throw new Error('No se encontró el nodo UBLExtensions');
  while (ublExtensions.firstChild) ublExtensions.removeChild(ublExtensions.firstChild);

  // Convertir clave privada y cargar en crypto.subtle
  const privateKeyBuffer = convertPrivateKeyToPkcs8Buffer(privateKey);
  const privateKeyCrypto = await xadesjs.Application.crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );

  // Crear objeto SignedXml
  const xmlSig = new xadesjs.SignedXml();
  xmlSig.SigningKey = privateKeyCrypto;
  
  console.log('antes del await firma xmlSig.Sign');
  // Firmar XML pasando referencias directo en options
  await xmlSig.Sign(
    privateKeyCrypto,
    doc.documentElement,
    {
      references: [
        {
          hash: "SHA-256",
          transforms: [
            "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
            "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
          ]
        }
      ]
    }
  );
  console.log('despues del await firma xmlSig.Sign');

  // Obtener elemento Signature generado
  const signatureElement = xmlSig.XmlSignature || (typeof xmlSig.GetXml === 'function' && xmlSig.GetXml());
  if (!signatureElement) throw new Error('No se pudo obtener el elemento Signature');

  // Agregar certificado manualmente al KeyInfo
  const rawCert = Buffer.from(certPEM.replace(/(-----(BEGIN|END) CERTIFICATE-----|\n)/g, ""), 'base64');

  const keyInfo = signatureElement.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'KeyInfo')[0]
    || doc.createElementNS('http://www.w3.org/2000/09/xmldsig#', 'KeyInfo');

  const x509Data = doc.createElementNS('http://www.w3.org/2000/09/xmldsig#', 'X509Data');
  const x509Certificate = doc.createElementNS('http://www.w3.org/2000/09/xmldsig#', 'X509Certificate');
  x509Certificate.appendChild(doc.createTextNode(rawCert.toString('base64')));
  x509Data.appendChild(x509Certificate);
  keyInfo.appendChild(x509Data);

  // En caso que KeyInfo no esté dentro de Signature, agregarlo
  if (!signatureElement.contains(keyInfo)) {
    signatureElement.appendChild(keyInfo);
  }

  // Crear UBLExtension con la firma
  const ublExtension = doc.createElementNS('urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ext:UBLExtension');
  const extensionContent = doc.createElementNS('urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ext:ExtensionContent');
  const importedSignature = doc.importNode(signatureElement, true);

  extensionContent.appendChild(importedSignature);
  ublExtension.appendChild(extensionContent);

  // 📌 Insertar como segundo hijo dentro de UBLExtensions
  if (ublExtensions.childNodes.length === 0) {
    ublExtensions.appendChild(ublExtension);
  } else if (ublExtensions.childNodes.length === 1) {
    ublExtensions.appendChild(ublExtension);
  } else {
    ublExtensions.insertBefore(ublExtension, ublExtensions.childNodes[1]);
  }

  // Devolver XML firmado serializado
  return new XMLSerializer().serializeToString(doc);
}


function verificarAPIXAdES() {
  console.log('Verificando API de XAdES.js disponible:');
  console.log('xadesjs:', typeof xadesjs);
  console.log('xadesjs.xml:', typeof xadesjs.xml);
  console.log('xadesjs.xml.Reference:', typeof xadesjs.xml?.Reference);
  console.log('xadesjs.SignedXml:', typeof xadesjs.SignedXml);
  
  // Verificar qué constructores están disponibles
  if (xadesjs.xml) {
    console.log('Constructores disponibles en xadesjs.xml:');
    Object.keys(xadesjs.xml).forEach(key => {
      console.log(`- ${key}:`, typeof xadesjs.xml[key]);
    });
  }
}

/*function convertPrivateKeyToPkcs8Buffer(privateKey) {
  const privateKeyAsn1 = forge.pki.privateKeyToAsn1(privateKey);
  const privateKeyInfoAsn1 = forge.pki.wrapRsaPrivateKey(privateKeyAsn1);
  const derBuffer = forge.asn1.toDer(privateKeyInfoAsn1).getBytes();
  return new Uint8Array([...derBuffer].map(c => c.charCodeAt(0)));
}*/

//////////////////////////////////////////////////////////////////////////////
function convertPrivateKeyToPkcs8Buffer(privateKey) {
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
}

module.exports = {
    obtenerTodosPermisosContabilidadesVista,
    registrarCPESunat
 }; 