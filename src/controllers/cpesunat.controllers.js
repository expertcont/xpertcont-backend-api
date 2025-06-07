const cpegeneraxml = require('./cpe/cpegeneraxml');
const { subirArchivoDesdeMemoria } = require('./cpe/cpeuploader');
const pool = require('../db');

const forge = require('node-forge');
const xpath = require('xpath');
const { DOMParser } = require('xmldom');
const { SignedXml } = require('xml-crypto');

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
  const privateKey = forge.pki.privateKeyToPem(keyObj[forge.pki.oids.pkcs8ShroudedKeyBag][0].key);

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

  // 📌 Creamos objeto de firma XML
  const sig = new SignedXml();

  // 📌 Definimos algoritmo de digest SHA-256 (para hash del contenido)
  sig.digestAlgorithm = 'http://www.w3.org/2001/04/xmlenc#sha256';

  // 📌 Definimos qué parte del XML se va a firmar (todo en este caso)
  sig.addReference(
    "/*", // Nodo raíz completo
    ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'], // Transforms
    'http://www.w3.org/2001/04/xmlenc#sha256' // Digest Algorithm obligatorio desde xml-crypto v6
  );


  // 📌 Establecemos clave privada para firmar
  sig.signingKey = privateKey;

  // 📌 Definimos proveedor de información de clave pública
  sig.keyInfoProvider = {
    getKeyInfo: () => `<X509Data><X509Certificate>${certificatePEM
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\r?\n|\r/g, '')}</X509Certificate></X509Data>`,
  };

  // 📌 Generamos la firma digital
  sig.computeSignature(unsignedXML);

  // 📌 Parseamos el nodo Signature generado
  const signatureNode = new DOMParser().parseFromString(sig.getSignedXml(), 'text/xml').documentElement;

  // 📌 Insertamos el nodo Signature dentro de UBLExtensions
  ublExtensions.appendChild(doc.importNode(signatureNode, true));

  // 📌 Serializamos el XML firmado a string
  const serializer = new (require('xmldom')).XMLSerializer();
  const signedXML = serializer.serializeToString(doc);

  // 📌 Devolvemos el XML firmado como string
  return signedXML;
}

module.exports = {
    obtenerTodosPermisosContabilidadesVista,
    registrarCPESunat
 }; 