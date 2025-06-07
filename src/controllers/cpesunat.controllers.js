const cpegeneraxml = require('./cpe/cpegeneraxml');
const { subirArchivoDesdeMemoria } = require('./cpe/cpeuploader');
const pool = require('../db');

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

async function firmarXMLUBL(xmlString, ruc) {
 
  // Consultamos el certificado y su password
  const res = await pool.query(`
    SELECT certificado, password
    FROM mad_usuariocertificado 
    WHERE documento_id = $1
  `, [ruc]);

  if (res.rows.length === 0) {
    throw new Error('Certificado no encontrado para el usuario y RUC indicados.');
  }
  console.log(res.rows[0]);
  const certificadoBuffer = res.rows[0].certificado;
  const password = res.rows[0].password_cert;
  console.log(password);

  // Cargamos el .pfx desde buffer
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(certificadoBuffer));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);  

  // Extraer clave privada y certificado público
  const keyObj = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag][0];
  const certObj = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0];

  const privateKeyPem = forge.pki.privateKeyToPem(keyObj.key);
  const certificatePem = forge.pki.certificateToPem(certObj.cert);

  // Parsear XML original
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml');

  // Crear firma digital
  const sig = new SignedXml();
  sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
  sig.keyInfoProvider = {
    getKeyInfo: () => `<X509Data><X509Certificate>${extractCertContent(certificatePem)}</X509Certificate></X509Data>`,
    getKey: () => privateKeyPem
  };

  sig.addReference(
    "/*", // Referencia al nodo raíz del documento
    ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
    'http://www.w3.org/2000/09/xmldsig#sha1'
  );

  // Firmar documento
  sig.signingKey = privateKeyPem;
  sig.computeSignature(xmlString);

  // Obtener firma generada
  const signatureXml = sig.getSignatureXml();

  // Insertar firma en el tag <ext:UBLExtensions>
  const ublExtensionsNode = doc.getElementsByTagName('ext:UBLExtensions')[0];
  const signatureDoc = new DOMParser().parseFromString(signatureXml, 'text/xml');
  ublExtensionsNode.appendChild(signatureDoc.documentElement);

  // Serializar XML final
  const finalXml = doc.toString();
  return finalXml;
};

function extractCertContent(pem) {
  return pem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\r?\n|\r/g, '');
};


module.exports = {
    obtenerTodosPermisosContabilidadesVista,
    registrarCPESunat
 }; 