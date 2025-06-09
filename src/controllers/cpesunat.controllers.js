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
  // 📌 Consulta certificado y contraseña desde base de datos
  const res = await pool.query(`
    SELECT certificado, password
    FROM mad_usuariocertificado 
    WHERE documento_id = $1
  `, [ruc]);

  if (res.rows.length === 0) {
    throw new Error('Certificado no encontrado para el RUC indicado.');
  }

  const certificadoBuffer = res.rows[0].certificado;
  const password = res.rows[0].password;

  // 📌 Cargamos el archivo PFX desde buffer y lo parseamos usando forge
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(certificadoBuffer));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  // 📌 Obtenemos la clave privada desde el contenedor P12
  const keyObj = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const privateKey = keyObj[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;

  // 📌 Obtenemos el certificado público en formato PEM
  const certObj = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certificatePEM = forge.pki.certificateToPem(certObj[forge.pki.oids.certBag][0].cert);

  // 📌 Parseamos el XML original sin firmar
  const doc = new DOMParser().parseFromString(unsignedXML, 'text/xml');

  // 📌 Localizamos el nodo UBLExtensions y limpiamos su contenido
  const select = xpath.useNamespaces({
    ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
  });
  const ublExtensions = select('//ext:UBLExtensions', doc)[0];

  if (ublExtensions) {
    while (ublExtensions.firstChild) {
      ublExtensions.removeChild(ublExtensions.firstChild);
    }
  }

  const privateKeyBuffer = convertPrivateKeyToPkcs8Buffer(privateKey);

  // 📌 Importamos la clave privada al formato crypto.subtle
  const privateKeyCrypto = await xadesjs.Application.crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: { name: "SHA-256" },
    },
    false,
    ["sign"]
  );

  console.log('antes de crear SignedXml');

  // 📌 SOLUCIÓN PARA xadesjs v2.4.4: Usar la API correcta
  const xmlSig = new xadesjs.SignedXml();
  
  // 📌 Configurar el algoritmo de firma
  xmlSig.SigningKey = privateKeyCrypto;
  xmlSig.SignatureAlgorithm = "RSASSA-PKCS1-v1_5";
  xmlSig.CanonicalizationAlgorithm = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

  console.log('antes de certificado público');
  
  // 📌 SOLUCIÓN para v2.4.4: Incluir certificado usando la API correcta
  const rawCert = Buffer.from(certificatePEM.replace(/(-----(BEGIN|END) CERTIFICATE-----|\n)/g, ""), 'base64');
  
  try {
    // Método 1: Usar xml.KeyInfoX509Data
    const x509 = new xadesjs.xml.KeyInfoX509Data();
    x509.AddCertificate(rawCert);
    xmlSig.KeyInfo.Add(x509);
    console.log('Certificado agregado con método 1');
  } catch (error1) {
    console.log('Método 1 falló, intentando método 2:', error1.message);
    try {
      // Método 2: Usar KeyInfo.AddCertificate directamente
      xmlSig.KeyInfo.AddCertificate(rawCert);
      console.log('Certificado agregado con método 2');
    } catch (error2) {
      console.log('Método 2 falló, intentando método 3:', error2.message);
      try {
        // Método 3: Crear manualmente el elemento X509Data
        const x509Data = new xadesjs.xml.KeyInfoX509Data();
        const x509Certificate = new xadesjs.xml.X509Certificate();
        x509Certificate.Value = rawCert;
        x509Data.Certificates.Add(x509Certificate);
        xmlSig.KeyInfo.Add(x509Data);
        console.log('Certificado agregado con método 3');
      } catch (error3) {
        console.log('Método 3 falló, intentando método 4:', error3.message);
        // Método 4: Agregar certificado como string base64
        xmlSig.KeyInfo.AddCertificate(rawCert.toString('base64'));
        console.log('Certificado agregado con método 4');
      }
    }
  }

  console.log('antes de crear referencias');

  // 📌 MÉTODO CORRECTO para v2.4.4: Crear referencias manualmente
  try {
    // Crear una referencia al documento completo
    const reference = new xadesjs.xml.Reference();
    reference.Uri = "";
    reference.DigestMethod = "http://www.w3.org/2001/04/xmlenc#sha256";
    
    // Agregar transformaciones
    const envelopedTransform = new xadesjs.xml.Transform();
    envelopedTransform.Algorithm = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
    
    const canonicalTransform = new xadesjs.xml.Transform();
    canonicalTransform.Algorithm = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
    
    reference.Transforms.Add(envelopedTransform);
    reference.Transforms.Add(canonicalTransform);
    
    // Agregar la referencia al SignedInfo
    xmlSig.SignedInfo.References.Add(reference);
    
  } catch (error) {
    console.log('Error creando referencias manualmente, intentando método alternativo:', error.message);
    
    // 📌 MÉTODO ALTERNATIVO para v2.4.4
    xmlSig.AddReference("", [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
    ], "http://www.w3.org/2001/04/xmlenc#sha256");
  }

  console.log('antes de firmar');

  // 📌 Firmar el documento
  await xmlSig.ComputeSignature(doc.documentElement);

  console.log('antes de obtener XML firmado');

  // 📌 Obtener el elemento signature
  const signatureElement = xmlSig.GetXml();

  // 📌 Crear la estructura UBL correcta
  const ublExtension = doc.createElementNS('urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ext:UBLExtension');
  const extensionContent = doc.createElementNS('urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ext:ExtensionContent');
  
  // 📌 Importar el nodo signature al documento
  const importedSignature = doc.importNode(signatureElement, true);
  extensionContent.appendChild(importedSignature);
  ublExtension.appendChild(extensionContent);
  ublExtensions.appendChild(ublExtension);

  console.log('Signature insertada correctamente');

  // 📌 Serializamos el XML firmado a string
  const serializer = new XMLSerializer();
  const signedXML = serializer.serializeToString(doc);

  return signedXML;
}

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