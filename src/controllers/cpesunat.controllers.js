const cpegeneraxml = require('./cpe/cpegeneraxml');
const cpegenerapdf = require('./cpe/cpegenerapdf');
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

require('dotenv').config();

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
          SELECT certificado, password, secundario_user,secundario_passwd, url_envio, logo
          FROM mad_usuariocertificado 
          WHERE documento_id = $1
        `, [dataVenta.empresa.ruc]);
        const {certificado: certificadoBuffer, password, secundario_user, secundario_passwd, url_envio, logo:logoBuffer} = rows[0];

        //01. Genera XML desde el servicio y canonicalizo el resultado
        let xmlComprobante = await cpegeneraxml(dataVenta);
        xmlComprobante = canonicalizarManual(xmlComprobante);

        //02. Genero el bloque de firma y lo añado al xml Original (xmlComprobante)
        let xmlComprobanteFirmado = await firmarXMLUBL(xmlComprobante, certificadoBuffer,password);
        //verificarDigest(digestOriginal, xmlComprobanteFirmado);

        //me guardo una copia del xmlFirmado en servidor ubuntu
        await subirArchivoDesdeMemoria(dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero, xmlComprobanteFirmado,'-');
        
        //04. Construir SOAP
        let contenidoSOAP = await empaquetarYGenerarSOAP(dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero,xmlComprobanteFirmado,secundario_user,secundario_passwd);
        
        //05. Enviar SOAP
        const respuestaSoap = await enviarSOAPSunat(contenidoSOAP,url_envio,dataVenta.empresa.modo);
        console.log('📩 Respuesta recibida de SUNAT:');
        console.log(respuestaSoap);
        
        // 06. Procesar respuesta SUNAT
        const resultadoSunat = await procesarRespuestaSunat(respuestaSoap, dataVenta);

        // 07. Generar PDF
        const resultadoPdf = await cpegenerapdf('80mm',logoBuffer,dataVenta);
        if (resultadoPdf.estado) {
            console.log('PDF EXITOSO');
            await subirArchivoDesdeMemoria(dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero, resultadoPdf.buffer_pdf,'PDF');
        } else {
            console.log('REVISAR PROCESO PDF ERRORRR');
        }
        
        // Si quieres guardar en BD o loguear resultadoSunat.estado y resultadoSunat.descripcion aquí
            /*respuesta_sunat_descripcion,
            ruta_xml,
            ruta_cdr,
            ruta_pdf,
            codigo_hash,*/
        
        const server_sftp = process.env.CPE_HOST;
        const ruta_xml = server_sftp + '/descargas/'+ dataVenta.empresa.ruc + '/' + dataVenta.empresa.ruc+ '-' + dataVenta.venta.codigo + '-' + dataVenta.venta.serie + '-' + dataVenta.venta.numero + '.xml';
        const ruta_cdr = server_sftp + '/descargas/'+ dataVenta.empresa.ruc + '/R-' + dataVenta.empresa.ruc+ '-' + dataVenta.venta.codigo + '-' + dataVenta.venta.serie + '-' + dataVenta.venta.numero + '.xml';
        const ruta_pdf = server_sftp + '/descargas/'+ dataVenta.empresa.ruc + '/' + dataVenta.empresa.ruc+ '-' + dataVenta.venta.codigo + '-' + dataVenta.venta.serie + '-' + dataVenta.venta.numero + '.pdf';

        // Enviar respuesta HTTP según resultado
        if (resultadoSunat.estado) {
          res.status(200).json({
            mensaje: 'CDR recibido',
            respuesta_sunat_descripcion: resultadoSunat.descripcion,
            ruta_xml: ruta_xml,
            ruta_cdr: ruta_cdr,
            ruta_pdf: ruta_pdf
          });
        } else {
          res.status(400).json({
            mensaje: 'CDR No recibido',
            respuesta_sunat_descripcion: resultadoSunat.descripcion
          });
        }
        
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

async function enviarSOAPSunat(soapXml,urlEnvio,modo) {
  //Modo 1 = produccion(sunat,ose), caso contrario Beta generico
  const urlEnvioEfectivo = (modo == "1") ?  urlEnvio : 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService';
  //Facturas,Boletas,NotasCred,NotasDeb
  //https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService
  //https://ose.nubefact.com/ol-ti-itcpe/billService?wsdl
  //https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService

  //Guias Remision
  //https://e-guiaremision.sunat.gob.pe/ol-ti-itemision-guia-gem/billService
  //https://e-beta.sunat.gob.pe/ol-ti-itemision-guia-gem-beta/billService
  try {
    const response = await fetch(urlEnvioEfectivo, {
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
  try {
      const { ruc, codigo, serie, numero } = {
        ruc: dataVenta.empresa.ruc,
        codigo: dataVenta.venta.codigo,
        serie: dataVenta.venta.serie,
        numero: dataVenta.venta.numero
      };

      // Parsear SOAP XML
      const doc = new DOMParser().parseFromString(soapResponse, 'text/xml');
      const select = xpath.useNamespaces({
        'soap': 'http://schemas.xmlsoap.org/soap/envelope/'
      });

      // Localizar applicationResponse
      const appRespNode = select('//*[local-name()="applicationResponse"]', doc)[0];
      if (!appRespNode) {
        throw new Error('❌ No se encontró applicationResponse en SOAP.');
      }

      // Decodificar base64 a buffer ZIP
      const base64Zip = appRespNode.textContent.trim();
      const zipBuffer = Buffer.from(base64Zip, 'base64');

      // Leer ZIP
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();
      if (entries.length === 0) {
        throw new Error('❌ ZIP devuelto está vacío.');
      }

      // Obtener primer archivo XML CDR dentro del ZIP
      const entry = entries.find(e => e.entryName.endsWith('.xml'));
      if (!entry) {
        throw new Error('❌ No se encontró archivo XML dentro del ZIP.');
      }

      const rawBuffer = entry.getData();
      const contenidoCDR = rawBuffer.toString('utf8');

      // Subir CDR con prefijo R-
      await subirArchivoDesdeMemoria(ruc, codigo, serie, numero, contenidoCDR, 'R');
      //console.log(`📦 CDR descomprimido (${rawBuffer.length} bytes)`);
      //console.log(`📝 Nombre CDR: ${entry.entryName}`);
      //console.log('📑 Primeros bytes:', rawBuffer.slice(0, 80));
      //console.log(`✅ CDR SUNAT guardado como R-${ruc}-${codigo}-${serie}-${numero}.xml`);
      
      // Extraer cbc:Description
      const descDoc = new DOMParser().parseFromString(contenidoCDR, 'text/xml');
      const descSelect = xpath.useNamespaces({
        cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
      });

      const descNode = descSelect('//*[local-name()="Description"]', descDoc)[0];
      const descripcion = descNode ? descNode.textContent.trim() : 'Sin descripción SUNAT';

      return { estado: true, descripcion };

  } catch (error) {
    console.error('❌ Error procesando respuesta SUNAT:', error.message);
    return { estado: false, descripcion: error.message };
  }
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