const cpegeneraxml = require('./cpe/cpegeneraxml');
const { subirArchivoDesdeMemoria } = require('./cpe/cpeuploader');
const pool = require('../db');

const forge = require('node-forge');
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
  // 1️⃣ Consultamos certificado y password desde la base de datos
  const res = await pool.query(`
    SELECT certificado, password_cert
    FROM mad_usuariocertificado 
    WHERE documento_id = $1
  `, [ruc]);

  if (res.rows.length === 0) {
    throw new Error('Certificado no encontrado para el RUC indicado.');
  }

  const certificadoBuffer = res.rows[0].certificado;
  const password = res.rows[0].password;

  // 2️⃣ Cargamos el PFX desde buffer y extraemos clave privada y certificado público
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(certificadoBuffer));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

  const privateKeyPem = forge.pki.privateKeyToPem(keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0].key);
  const certificatePem = forge.pki.certificateToPem(certBags[forge.pki.oids.certBag][0].cert);

  // 3️⃣ Limpiamos el certificado para dejarlo sin los headers PEM
  const certificateClean = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\r?\n|\r/g, '');

  // 4️⃣ Procesamos el XML sin firmar
  const doc = new DOMParser().parseFromString(unsignedXML, 'text/xml');

  // Buscamos el nodo UBLExtensions y lo dejamos vacío
  const select = xpath.useNamespaces({
    ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
  });
  const ublExtensions = select('//ext:UBLExtensions', doc)[0];

  if (ublExtensions) {
    while (ublExtensions.firstChild) {
      ublExtensions.removeChild(ublExtensions.firstChild);
    }
  }

  // 5️⃣ Preparamos la firma
  const sig = new SignedXml();
  sig.addReference(
    "/*", // firmamos todo el XML
    ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
    'http://www.w3.org/2001/04/xmlenc#sha256'
  );

  sig.signingKey = privateKeyPem;

  // Proveedor de KeyInfo usando el certificado limpio
  sig.keyInfoProvider = {
    getKeyInfo: () =>
      `<X509Data><X509Certificate>${certificateClean}</X509Certificate></X509Data>`
  };

  // 6️⃣ Generamos la firma sobre el XML sin firmar
  sig.computeSignature(unsignedXML);

  // 7️⃣ Insertamos la firma en el nodo UBLExtensions
  const signatureNode = new DOMParser()
    .parseFromString(sig.getSignedXml(), 'text/xml')
    .documentElement;

  ublExtensions.appendChild(doc.importNode(signatureNode, true));

  // 8️⃣ Serializamos XML final
  const serializer = new (require('xmldom')).XMLSerializer();
  const signedXML = serializer.serializeToString(doc);

  return signedXML;
}

module.exports = {
    obtenerTodosPermisosContabilidadesVista,
    registrarCPESunat
 }; 