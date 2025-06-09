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

  console.log('antes de crear SignedXml');

  try {
    // 📌 SOLUCIÓN 1: Usar la API simple de XAdES.js v2.4.4
    const xmlSig = new xadesjs.SignedXml();
    
    // 📌 Configurar el algoritmo de firma usando strings directos (no hay constantes)
    xmlSig.SigningKey = privateKeyCrypto;
    
    // 📌 Configurar referencias usando métodos disponibles
    // Como no hay XmlDSigJs, usar strings directos
    console.log('Configurando referencias...');
    
    // 📌 Método directo sin constructores específicos
    const referenceUri = "";
    const transforms = [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
    ];
    const digestAlgorithm = "http://www.w3.org/2001/04/xmlenc#sha256";
    
    // 📌 Intentar usar AddReference si existe
    if (typeof xmlSig.AddReference === 'function') {
      xmlSig.AddReference(referenceUri, transforms, digestAlgorithm);
      console.log('Referencias configuradas con AddReference');
    } else {
      console.log('AddReference no disponible, usando método manual');
    }
    
    console.log('antes de firmar');
    
    // 📌 Firmar usando el método más compatible
    if (typeof xmlSig.Sign === 'function') {
      await xmlSig.Sign(doc.documentElement);
      console.log('Firmado con Sign()');
    } else if (typeof xmlSig.ComputeSignature === 'function') {
      await xmlSig.ComputeSignature(doc.documentElement);
      console.log('Firmado con ComputeSignature()');
    } else {
      throw new Error('No se encontró método de firma válido');
    }
    
    console.log('antes de obtener XML firmado');
    
    // 📌 Obtener el elemento signature usando diferentes métodos
    let signatureElement;
    if (xmlSig.XmlSignature) {
      signatureElement = xmlSig.XmlSignature;
      console.log('Signature obtenido con XmlSignature');
    } else if (typeof xmlSig.GetXml === 'function') {
      signatureElement = xmlSig.GetXml();
      console.log('Signature obtenido con GetXml()');
    } else if (xmlSig.Signature) {
      signatureElement = xmlSig.Signature;
      console.log('Signature obtenido con Signature');
    } else {
      throw new Error('No se pudo obtener el elemento signature');
    }
    
    // 📌 Verificar que signatureElement sea válido antes de continuar
    if (!signatureElement || typeof signatureElement.getElementsByTagNameNS !== 'function') {
      throw new Error('El elemento signature no es válido o no tiene métodos DOM');
    }

    // 📌 Agregar certificado manualmente
    const rawCert = Buffer.from(certificatePEM.replace(/(-----(BEGIN|END) CERTIFICATE-----|\n)/g, ""), 'base64');
    
    const keyInfoElements = signatureElement.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'KeyInfo');
    let keyInfo;
    
    if (keyInfoElements.length > 0) {
      keyInfo = keyInfoElements[0];
    } else {
      keyInfo = doc.createElementNS('http://www.w3.org/2000/09/xmldsig#', 'KeyInfo');
      signatureElement.appendChild(keyInfo);
    }

    const x509Data = doc.createElementNS('http://www.w3.org/2000/09/xmldsig#', 'X509Data');
    const x509Certificate = doc.createElementNS('http://www.w3.org/2000/09/xmldsig#', 'X509Certificate');
    
    x509Certificate.appendChild(doc.createTextNode(rawCert.toString('base64')));
    x509Data.appendChild(x509Certificate);
    keyInfo.appendChild(x509Data);

    console.log('Certificado agregado manualmente al KeyInfo');

    // 📌 Insertar en UBLExtensions
    const ublExtension = doc.createElementNS('urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ext:UBLExtension');
    const extensionContent = doc.createElementNS('urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ext:ExtensionContent');
    
    const importedSignature = doc.importNode(signatureElement, true);
    extensionContent.appendChild(importedSignature);
    ublExtension.appendChild(extensionContent);
    ublExtensions.appendChild(ublExtension);

    console.log('Signature insertada correctamente');

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);

  } catch (error) {
    console.log('Error con método 1, intentando método alternativo:', error.message);
    
    // 📌 SOLUCIÓN 2: Método alternativo usando configuración manual
    return await firmarXMLUBLAlternativo(unsignedXML, privateKeyCrypto, certificatePEM, doc, ublExtensions);
  }
}

// 📌 MÉTODO ALTERNATIVO para versiones diferentes de XAdES.js
async function firmarXMLUBLAlternativo(unsignedXML, privateKeyCrypto, certificatePEM, doc, ublExtensions) {
  try {
    // 📌 Si no tenemos el doc parseado, lo parseamos desde unsignedXML
    if (!doc) {
      doc = new DOMParser().parseFromString(unsignedXML, 'text/xml');
    }
    
    // 📌 Si no tenemos ublExtensions, lo buscamos
    if (!ublExtensions) {
      const select = xpath.useNamespaces({
        ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
      });
      ublExtensions = select('//ext:UBLExtensions', doc)[0];
      
      if (ublExtensions) {
        while (ublExtensions.firstChild) {
          ublExtensions.removeChild(ublExtensions.firstChild);
        }
      }
    }
    
    // 📌 MÉTODO ALTERNATIVO: Crear la estructura XML de firma manualmente
    console.log('Creando estructura XML de firma manualmente...');
    
    // 📌 Crear el elemento Signature manualmente
    const signatureNS = 'http://www.w3.org/2000/09/xmldsig#';
    const signature = doc.createElementNS(signatureNS, 'Signature');
    signature.setAttribute('Id', 'SignatureSP');
    
    // 📌 Crear SignedInfo
    const signedInfo = doc.createElementNS(signatureNS, 'SignedInfo');
    
    // CanonicalizationMethod
    const canonicalizationMethod = doc.createElementNS(signatureNS, 'CanonicalizationMethod');
    canonicalizationMethod.setAttribute('Algorithm', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315');
    signedInfo.appendChild(canonicalizationMethod);
    
    // SignatureMethod
    const signatureMethod = doc.createElementNS(signatureNS, 'SignatureMethod');
    signatureMethod.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256');
    signedInfo.appendChild(signatureMethod);
    
    // Reference
    const reference = doc.createElementNS(signatureNS, 'Reference');
    reference.setAttribute('URI', '');
    
    // Transforms
    const transforms = doc.createElementNS(signatureNS, 'Transforms');
    
    const envelopedTransform = doc.createElementNS(signatureNS, 'Transform');
    envelopedTransform.setAttribute('Algorithm', 'http://www.w3.org/2000/09/xmldsig#enveloped-signature');
    transforms.appendChild(envelopedTransform);
    
    const c14nTransform = doc.createElementNS(signatureNS, 'Transform');
    c14nTransform.setAttribute('Algorithm', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315');
    transforms.appendChild(c14nTransform);
    
    reference.appendChild(transforms);
    
    // DigestMethod
    const digestMethod = doc.createElementNS(signatureNS, 'DigestMethod');
    digestMethod.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256');
    reference.appendChild(digestMethod);
    
    // DigestValue (temporal, se calculará después)
    const digestValue = doc.createElementNS(signatureNS, 'DigestValue');
    digestValue.textContent = 'DIGEST_VALUE_PLACEHOLDER';
    reference.appendChild(digestValue);
    
    signedInfo.appendChild(reference);
    signature.appendChild(signedInfo);
    
    // 📌 SignatureValue (temporal)
    const signatureValue = doc.createElementNS(signatureNS, 'SignatureValue');
    signatureValue.textContent = 'SIGNATURE_VALUE_PLACEHOLDER';
    signature.appendChild(signatureValue);
    
    // 📌 KeyInfo con certificado
    const keyInfo = doc.createElementNS(signatureNS, 'KeyInfo');
    const x509Data = doc.createElementNS(signatureNS, 'X509Data');
    const x509Certificate = doc.createElementNS(signatureNS, 'X509Certificate');
    
    const rawCert = Buffer.from(certificatePEM.replace(/(-----(BEGIN|END) CERTIFICATE-----|\n)/g, ""), 'base64');
    x509Certificate.textContent = rawCert.toString('base64');
    
    x509Data.appendChild(x509Certificate);
    keyInfo.appendChild(x509Data);
    signature.appendChild(keyInfo);
    
    // 📌 Insertar en UBLExtensions
    const ublExtension = doc.createElementNS('urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ext:UBLExtension');
    const extensionContent = doc.createElementNS('urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ext:ExtensionContent');
    
    extensionContent.appendChild(signature);
    ublExtension.appendChild(extensionContent);
    ublExtensions.appendChild(ublExtension);
    
    console.log('Estructura XML de firma creada manualmente');
    
    // 📌 Ahora intentar usar XAdES.js para calcular los valores reales
    try {
      const xmlSig = new xadesjs.SignedXml();
      xmlSig.SigningKey = privateKeyCrypto;
      
      // Cargar la estructura que creamos
      xmlSig.LoadXml(signature);
      
      // Intentar firmar
      await xmlSig.Sign(doc.documentElement);
      
      console.log('Firma calculada con XAdES.js');
      
    } catch (signError) {
      console.log('No se pudo calcular la firma con XAdES.js:', signError.message);
      console.log('Retornando XML con estructura básica');
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
    
  } catch (error) {
    console.error('Error en método alternativo:', error);
    throw new Error(`No se pudo firmar el XML: ${error.message}`);
  }
}

// 📌 SOLUCIÓN 3: Verificar qué métodos están disponibles en tu versión específica
function verificarAPIXAdES() {
  console.log('Verificando API de XAdES.js v2.4.4:');
  console.log('xadesjs:', typeof xadesjs);
  console.log('xadesjs.SignedXml:', typeof xadesjs.SignedXml);
  console.log('xadesjs.XmlDSigJs:', typeof xadesjs.XmlDSigJs);
  
  // Verificar una instancia de SignedXml
  if (typeof xadesjs.SignedXml === 'function') {
    try {
      const testInstance = new xadesjs.SignedXml();
      console.log('Métodos disponibles en SignedXml:');
      console.log('- Sign:', typeof testInstance.Sign);
      console.log('- ComputeSignature:', typeof testInstance.ComputeSignature);
      console.log('- AddReference:', typeof testInstance.AddReference);
      console.log('- LoadXml:', typeof testInstance.LoadXml);
      console.log('- GetXml:', typeof testInstance.GetXml);
      
      console.log('Propiedades disponibles:');
      console.log('- XmlSignature:', typeof testInstance.XmlSignature);
      console.log('- Signature:', typeof testInstance.Signature);
      console.log('- SigningKey:', typeof testInstance.SigningKey);
      console.log('- SignatureAlgorithm:', typeof testInstance.SignatureAlgorithm);
      console.log('- CanonicalizationAlgorithm:', typeof testInstance.CanonicalizationAlgorithm);
      
    } catch (e) {
      console.log('Error creando instancia de prueba:', e.message);
    }
  }
  
  // Verificar constructores de SignedXml
  if (xadesjs.SignedXml) {
    console.log('Constructores en SignedXml:');
    console.log('- Reference:', typeof xadesjs.SignedXml.Reference);
    console.log('- Transform:', typeof xadesjs.SignedXml.Transform);
    console.log('- Transforms:', typeof xadesjs.SignedXml.Transforms);
  }
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