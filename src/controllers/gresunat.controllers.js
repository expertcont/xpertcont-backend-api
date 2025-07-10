const gregeneraxml = require('./gre/gregeneraxml');
const gregenerapdf = require('./gre/gregenerapdf');
const { subirArchivoDesdeMemoria } = require('./cpe/cpeuploader');
const pool = require('../db');
/////////////////////////////////////////////////////////
const { XmlSignatureMod } = require('../utils/xmlsignaturemod.utils');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const yazl = require("yazl");
const archiver = require('archiver');
const crc32 = require('crc-32');
/////////////////////////////////////////////////////////
const { DOMParser} = require('xmldom');

const xpath = require('xpath');
const path = require('path');

const AdmZip = require('adm-zip');
const fetch = require('node-fetch');

require('dotenv').config();

const registrarGRESunat = async (req,res,next)=> {
    try {
        const dataGuia = req.body;
        //console.log('Procesando comprobante: ',dataGuia.empresa.ruc,dataGuia.venta.codigo,dataGuia.venta.serie,dataGuia.venta.numero);

        //00. Consulta previa datos necesarios para procesos posteriores: certificado,password, usuario secundario, url
        const { rows } = await pool.query(`
          SELECT certificado, password, secundario_user,secundario_passwd, url_envio, logo, gre_credencial, gre_password
          FROM mad_usuariocertificado 
          WHERE documento_id = $1
        `, [dataGuia.empresa.ruc]);
        
        //console.log('rows[0]: ',rows[0]);
        //Aqui lo estamos cargando datos sensibles  ... fijos en API
        const {certificado: certificadoBuffer, password, secundario_user, secundario_passwd, url_envio, logo:logoBuffer, gre_credencial, gre_password} = rows[0];

        
        //00. Obtener token
        const data = await obtenerTokenSunat(gre_credencial, gre_password,dataGuia.empresa.ruc, secundario_user,secundario_passwd);
        const sToken = data.access_token;
        //console.log(sToken);

        //01. Genera XML desde el servicio y canonicalizo el resultado
        let xmlComprobante = await gregeneraxml(dataGuia);
        xmlComprobante = canonicalizarManual(xmlComprobante);

        //02. Nueva firma implementado propio
        const signerManual = new XmlSignatureMod(certificadoBuffer, password, xmlComprobante);
        signerManual.setSignNodeName('DespatchAdvice');
        const xmlComprobanteFirmado = await signerManual.getSignedXML();
        const sDigestInicial = obtenerDigestValue(xmlComprobanteFirmado);

        //me guardo una copia del xmlFirmado en servidor ubuntu
        //await subirArchivoDesdeMemoria(dataGuia.empresa.ruc,dataGuia.venta.codigo,dataGuia.venta.serie,dataGuia.venta.numero, xmlComprobanteFirmado,'-');
        //03. Guardar xml firmado en Server Ubuntu, version asyncrono(desconectado)
        (async () => {
          try {
            await subirArchivoDesdeMemoria(
              dataGuia.empresa.ruc,
              dataGuia.guia.codigo,
              dataGuia.guia.serie,
              dataGuia.guia.numero,
              xmlComprobanteFirmado,
              '-'
            );
            //console.log('Archivo XML almacenado en copia correctamente.');
          } catch (error) {
            console.error('Error al almacenar XML:', error);
          }
        })();
        
        //Aqui se enviara por POST XML + token, ya no se usa SOAP
        const resultadoTicket = await enviarGreSunat(sToken,dataGuia.empresa.ruc,'09',dataGuia.guia.serie,dataGuia.guia.numero, xmlComprobanteFirmado)
        console.log('resultadoTicket: ', resultadoTicket)

        // 06. Procesar respuesta SUNAT
        //const resultadoSunat = await procesarRespuestaSunat(respuestaSoap, dataGuia);

        // 07. Generar PDF
        //PDF version asyncrono (desconectado)
        /*(async () => {
          try {
            const resultadoPdf = await gregenerapdf('80mm', logoBuffer, dataGuia, sDigestInicial);
            if (resultadoPdf.estado) {
              console.log('PDF EXITOSO');
              await subirArchivoDesdeMemoria(
                dataGuia.empresa.ruc,
                dataGuia.venta.codigo,
                dataGuia.venta.serie,
                dataGuia.venta.numero,
                resultadoPdf.buffer_pdf,
                'PDF'
              );
            } else {
              console.log('REVISAR PROCESO PDF ERRORRR');
            }
          } catch (error) {
            console.error('Error al generar PDF:', error);
          }
        })();*/
            
        
        const server_sftp = process.env.CPE_HOST;
        const ruta_xml = 'http://' + server_sftp + ':8080/descargas/'+ dataGuia.empresa.ruc + '/' + dataGuia.empresa.ruc+ '-' + dataGuia.guia.codigo + '-' + dataGuia.guia.serie + '-' + dataGuia.guia.numero + '.xml'
        const ruta_cdr = 'http://' + server_sftp + ':8080/descargas/'+ dataGuia.empresa.ruc + '/R-' + dataGuia.empresa.ruc+ '-' + dataGuia.guia.codigo + '-' + dataGuia.guia.serie + '-' + dataGuia.guia.numero + '.xml'
        const ruta_pdf = 'http://' + server_sftp + ':8080/descargas/'+ dataGuia.empresa.ruc + '/' + dataGuia.empresa.ruc+ '-' + dataGuia.guia.codigo + '-' + dataGuia.guia.serie + '-' + dataGuia.guia.numero + '.pdf'

        const sModoEnvio = dataGuia?.empresa?.modo === "1" ? "1" : "0";

        //respuesta temporal
        res.status(200).json({
          respuesta_sunat_descripcion: 'vamos si se puede',
          ruta_xml: ruta_xml,
          ruta_cdr: ruta_cdr,
          ruta_pdf: ruta_pdf,
          toke: sToken,
          digest_value: sDigestInicial
        });
        
        // Enviar respuesta HTTP según resultado
        //console.log('resultadoSunat', resultadoSunat);
        
        /*if (resultadoSunat.estado) {
          res.status(200).json({
            respuesta_sunat_descripcion: resultadoSunat.descripcion,
            ruta_xml: ruta_xml,
            ruta_cdr: ruta_cdr,
            ruta_pdf: ruta_pdf,
            codigo_hash: sDigestInicial,
            mensaje: (sModoEnvio=="1") ? 'CDR Recibido Produccion': 'CDR Recibido Beta'
          });
        } else {
          res.status(400).json({
            respuesta_sunat_descripcion: 'error',
            ruta_xml: 'error',
            ruta_cdr: 'error',
            ruta_pdf: 'error',
            codigo_hash: null,
            mensaje: 'CDR No recibido'
          });
        }*/
    }catch(error){
        console.log(error);
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

function obtenerDigestValue(xmlFirmado) {
  // Parsear XML firmado
  const doc = new DOMParser().parseFromString(xmlFirmado, 'text/xml');

  // Buscar nodo DigestValue dentro de la firma
  const select = xpath.useNamespaces({
    ds: 'http://www.w3.org/2000/09/xmldsig#'
  });

  const digestNode = select('//*[local-name()="DigestValue"]', doc)[0];

  if (!digestNode) {
    throw new Error('❌ No se encontró el DigestValue en el XML firmado.');
  }

  // Retornar su contenido
  return digestNode.textContent.trim();
}


async function obtenerTokenSunat(clientId,clientSecret,ruc,usuarioSol,passwordSol) {
  try {
    const url = `https://api-seguridad.sunat.gob.pe/v1/clientessol/${clientId}/oauth2/token/`;

    // Cuerpo tipo x-www-form-urlencoded
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('scope', 'https://api-cpe.sunat.gob.pe');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('username', `${ruc}${usuarioSol}`);
    params.append('password', passwordSol);
    
    //console.log(params);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Error obteniendo token SUNAT: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error(error.message);
    throw error;
  }
}



async function enviarGreSunat(token, numRucEmisor, codCpe, numSerie, numCpe, xmlFirmadoString) {
  try {
    const { nombreArchivoZip, arcGreZip64, hashZip } = await prepararZipYHash(numRucEmisor, codCpe, numSerie, numCpe, xmlFirmadoString);

    const url = `https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/${numRucEmisor}-${codCpe}-${numSerie}-${numCpe}`;
    const body = {
      archivo: {
        nomArchivo: nombreArchivoZip,
        arcGreZip: arcGreZip64,
        hashZip: hashZip
      }
    };

    console.log('HASH calculado:', hashZip);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Error enviando comprobante SUNAT: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();
    console.log('Respuesta SUNAT:', data);

    return data;

  } catch (error) {
    console.error('Error en enviarGreSunat:', error.message);
    throw error;
  }
}

async function prepararZipYHash(numRucEmisor, codCpe, numSerie, numCpe, xmlFirmadoString) {
  const nombreArchivoXml = `${numRucEmisor}-${codCpe}-${numSerie}-${numCpe}.xml`;
  const nombreArchivoZip = `${numRucEmisor}-${codCpe}-${numSerie}-${numCpe}.zip`;

  // 🧹 Limpiar XML
  let cleanXml = xmlFirmadoString;

  if (cleanXml.charCodeAt(0) === 0xFEFF) {
    cleanXml = cleanXml.slice(1);
  }
  
  // Eliminar líneas vacías, CRLF → LF
  cleanXml = cleanXml.replace(/\r\n/g, '\n').replace(/\s+$/gm, '').trim();
  // Asegúrate de NO tener espacio final al final del string
  if (cleanXml.endsWith('\n')) cleanXml = cleanXml.slice(0, -1);

  const xmlBuffer = Buffer.from(cleanXml, 'utf8');

  // 🗜️ Crear ZIP con yazl usando DEFLATED y mtime fijo
  const zipBuffer = await crearZipBuffer(nombreArchivoXml, xmlBuffer);

  // Calcular SHA-256 en base64
  const hashZip = crypto.createHash('sha256').update(zipBuffer).digest('base64');

  // Convertir a base64 para enviar
  const arcGreZip64 = zipBuffer.toString('base64');

  return {
    nombreArchivoXml,
    nombreArchivoZip,
    arcGreZip64,
    hashZip
  };
}

function crearZipBuffer(nombreArchivoXml, xmlBuffer) {
  return new Promise((resolve) => {
    const zipfile = new yazl.ZipFile();

    const crc = crc32.buf(xmlBuffer) >>> 0; // unsigned
    const uncompressedSize = xmlBuffer.length;

    zipfile.addBuffer(xmlBuffer, nombreArchivoXml, {
      compress: true,
      mtime: new Date('2000-01-01T00:00:00Z'),
      crc32: crc,
      uncompressedSize: uncompressedSize
    });

    const buffers = [];
    zipfile.outputStream.on("data", (data) => buffers.push(data));
    zipfile.outputStream.on("end", () => {
      const zipBuffer = Buffer.concat(buffers);
      resolve(zipBuffer);
    });

    zipfile.end();
  });
}


module.exports = {
    registrarGRESunat
 }; 