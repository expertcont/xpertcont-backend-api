const cpegeneraxml = require('./cpe/cpegeneraxml');
const { subirArchivoDesdeMemoria } = require('./cpe/cpeuploader');
const pool = require('../db');

/////////////////////////////////////////////////////////
const { DOMParser} = require('xmldom');

const { XmlSignature } = require('@supernova-team/xml-sunat');
const fs = require('fs/promises');
const xpath = require('xpath');
const path = require('path');
const { randomUUID } = require('crypto');

const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
//let digestOriginal;

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
        xmlComprobante = canonicalizarManual(xmlComprobante);

        //02. Genero el bloque de firma y lo añado al xml Original (xmlComprobante)
        let xmlComprobanteFirmado = await firmarXMLUBL(xmlComprobante, certificadoBuffer,password);
        //verificarDigest(digestOriginal, xmlComprobanteFirmado);

        //me guardo una copia del xmlFirmado en servidor ubuntu
        await subirArchivoDesdeMemoria(dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero, xmlComprobanteFirmado,'');
        
        //04. Construir SOAP
        let contenidoSOAP = await empaquetarYGenerarSOAP(dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero,xmlComprobanteFirmado,secundario_user,secundario_passwd);
        
        //05. Enviar SOAP
        const respuestaSoap = await enviarSOAPSunat(contenidoSOAP);
        console.log('📩 Respuesta recibida de SUNAT:');
        console.log(respuestaSoap);

        //06. Almacenar Certificado en tabla temporal ticket
        await procesarRespuestaSunat(respuestaSoap, dataVenta);

        res.status(200).send('Archivo subido correctamente');
        
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};
function canonicalizarManual(xmlStr) {
  return xmlStr
    .replace(/(\r\n|\n|\r)/g, '')
    .replace(/\t/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}
async function firmarXMLUBL(unsignedXML, certificadoBuffer, password) {
  try {
    // 📌 Generar ruta temporal única para el PFX
    const pfxTempPath = path.join('/tmp', `cert-${randomUUID()}.pfx`);

    // 📌 Escribir buffer del certificado a archivo temporal
    await fs.writeFile(pfxTempPath, certificadoBuffer);

    // 📌 Instanciar firmador y firmar XML
    const signer = new XmlSignature(pfxTempPath, password, unsignedXML);
    const signedXml = await signer.getSignedXML();

    // 📌 Eliminar el archivo temporal una vez firmado
    await fs.unlink(pfxTempPath);

    // 📌 Retornar XML firmado como string
    return signedXml;
  } catch (err) {
    console.error('❌ Error firmando XML:', err);
    throw err;
  }
}

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

// Función para procesar y guardar el CDR
async function procesarRespuestaSunat(soapResponse, dataVenta) {
  const { ruc, codigo, serie, numero } = {
    ruc: dataVenta.empresa.ruc,
    codigo: dataVenta.venta.codigo,
    serie: dataVenta.venta.serie,
    numero: dataVenta.venta.numero
  };

  // Parsear respuesta SOAP para extraer <applicationResponse>
  const doc = new DOMParser().parseFromString(soapResponse, 'text/xml');
  const select = xpath.useNamespaces({
    'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
    'br': 'http://service.sunat.gob.pe'
  });

// Buscar applicationResponse sin prefijo
  const appRespNode = select('//*[local-name()="applicationResponse"]', doc)[0];
  if (!appRespNode) throw new Error('No se encontró applicationResponse en SOAP.');

  const base64Zip = appRespNode.textContent;

  // Decodificar base64 y leer ZIP
  const zipBuffer = Buffer.from(base64Zip, 'base64');
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  if (entries.length === 0) throw new Error('ZIP devuelto está vacío.');

  // Normalmente hay una sola entrada, la respuesta SUNAT CDR XML
  const entry = entries[0];
  const contenidoCDR = entry.getData().toString('utf8');

  // Guardar con tu función subirArchivoDesdeMemoria
  await subirArchivoDesdeMemoria(ruc, codigo, serie, numero, contenidoCDR,'R');

  console.log(`✅ CDR de SUNAT guardado exitosamente como R-${ruc}-${codigo}-${serie}-${numero}.xml`);
}

//////////////////////////////////////////////////////////////////////////////
/*function limpiarXML(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml');

  let serializer = new XMLSerializer();
  let xmlLimpio = serializer.serializeToString(doc.documentElement)
    .replace(/(\r\n|\n|\r)/gm, "")
    .replace(/\t/g, "")
    .replace(/\s{2,}/g, " "); // opcional: reducir espacios repetidos

  return xmlLimpio;
}*/
/////////////////////////////////////////////////////////////////////////////
module.exports = {
    obtenerTodosPermisosContabilidadesVista,
    registrarCPESunat
 }; 