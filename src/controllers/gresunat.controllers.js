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

        let server_sftp = process.env.CPE_HOST;
        let ruta_xml = 'http://' + server_sftp + ':8080/descargas/'+ dataGuia.empresa.ruc + '/' + dataGuia.empresa.ruc+ '-' + dataGuia.guia.codigo + '-' + dataGuia.guia.serie + '-' + dataGuia.guia.numero + '.xml'
        let ruta_cdr = 'http://' + server_sftp + ':8080/descargas/'+ dataGuia.empresa.ruc + '/R-' + dataGuia.empresa.ruc+ '-' + dataGuia.guia.codigo + '-' + dataGuia.guia.serie + '-' + dataGuia.guia.numero + '.xml'
        let ruta_pdf = 'http://' + server_sftp + ':8080/descargas/'+ dataGuia.empresa.ruc + '/' + dataGuia.empresa.ruc+ '-' + dataGuia.guia.codigo + '-' + dataGuia.guia.serie + '-' + dataGuia.guia.numero + '.pdf'

        const sModoEnvio = dataGuia?.empresa?.modo === "1" ? "1" : "0";
        //Frontend solicita y APi retornara, un ticket con su estado ...en primera (en espera)
        //Frontend sigue solicitando y API retorna (en espera o disponible)
        const resultadoTicket = await generarTicketGreAdmin(dataGuia);
        if (resultadoTicket.ticket !== '') {
            //Procesar descarga CDR
            const resultadoSunat = await descargarGreSunatCDR();
            console.log('estado de descarga cdr Gre: ',resultadoSunat);
            if (resultadoSunat === 'OK'){
                console.log('cdr generado y almacenado en servidor');

                //imprimir pdf          ...pendiente
                //subir pdf a servidor  ...pendiente
                res.status(200).json({
                  respuesta_sunat_descripcion: resultadoSunat,
                  ruta_xml: ruta_xml,
                  ruta_cdr: ruta_cdr,
                  ruta_pdf: ruta_pdf,
                  codigo_hash: resultadoTicket.digestvalue,
                  mensaje: (sModoEnvio=="1") ? 'CDR Recibido Produccion': 'CDR Recibido Beta'
                });
            }else{
                ruta_cdr = '';
                ruta_pdf = '';

                res.status(400).json({
                  respuesta_sunat_descripcion: resultadoSunat,
                  ruta_xml: 'error',
                  ruta_cdr: 'error',
                  ruta_pdf: 'error',
                  codigo_hash: null,
                  mensaje: 'CDR No recibido'
                });
            }
        }else{
            //Retonar Pendiente y links CDR y PDF Vacios
            //Error, siempre debe retornar ticket, en caso contrario, falla sunat o interna
            ruta_cdr = ''
            ruta_pdf = ''
            res.status(400).json({
              respuesta_sunat_descripcion: 'ERROR TICKET',
              ruta_xml: 'error',
              ruta_cdr: 'error',
              ruta_pdf: 'error',
              codigo_hash: null,
              mensaje: 'ni Ticket ni CDR recibidos, revisar endpoit'
            });
        }
       
    }catch(error){
        console.log(error);
        //next(error)
        res.status(500).json({
          respuesta_sunat_descripcion: 'ERROR interno',
          ruta_xml: null,
          ruta_cdr: null,
          ruta_pdf: null,
          codigo_hash: null,
          mensaje: error
        });
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

async function obtenerTokenSunatGre(ruc) {
  try {
    //00. Consulta previa datos necesarios para procesos posteriores: certificado,password, usuario secundario, url
    const { rows } = await pool.query(`
      SELECT secundario_user,secundario_passwd, gre_credencial, gre_password
      FROM mad_usuariocertificado 
      WHERE documento_id = $1
    `, [ruc]);
    
    console.log('rows: ',rows);
    //Aqui lo estamos cargando datos sensibles  ... fijos en API
    const {secundario_user:usuarioSol, secundario_passwd:passwordSol, gre_credencial:clientId, gre_password:clientSecret} = rows[0];

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
    //console.log('Respuesta SUNAT:', data);

    return data;

  } catch (error) {
    console.error('Error en enviarGreSunat:', error.message);
    throw error;
  }
}

async function prepararZipYHash(numRucEmisor, codCpe, numSerie, numCpe, xmlFirmadoString) {
  const nombreArchivoXml = `${numRucEmisor}-${codCpe}-${numSerie}-${numCpe}.xml`;
  const nombreArchivoZip = `${numRucEmisor}-${codCpe}-${numSerie}-${numCpe}.zip`;

  const xmlBuffer = Buffer.from(xmlFirmadoString, 'utf8');

  const zipBuffer = await crearZipBuffer(nombreArchivoXml, xmlBuffer);

  const hashZip = crypto.createHash('sha256').update(zipBuffer).digest('hex');  
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

    const crc = crc32.buf(xmlBuffer) >>> 0;
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

const generarTicketGreAdmin = async (sJson) => {
  try {
      const documento_id = sJson.empresa.ruc
      const cod = sJson.guia.codigo
      const serie = sJson.guia.serie
      const numero = sJson.guia.numero
      /////////////////////////////////////////////////////////////
      //1: Consultar si existe ticket Generado en BD
      const rowTicket = await generarTicketGreConsultaDB(documento_id,cod,serie,numero);
      
      let ticket,digestvalue;
      //2: Si no existe Ticket BD, generar Ticket Nuevo
      if (rowTicket.length > 0) {
          // Acceder al primer resultado y al campo sire_ticket
          ticket = (rowTicket[0].gre_ticket);
          digestvalue = (rowTicket[0].gre_digestvalue);
          return {ticket, digestvalue};
      } else {
          //Genera ticket desde sunat, y almacena en servidor xml firmado(modo asincrono)
          const resultado = generarTicketGreSunat(sJson);
          ticket = resultado.ticket;
          digestvalue = resultado.digestvalue;
          return {ticket,digestvalue}; // Aquí se detiene la ejecución si ocurre un error
      }
      //El resto del proceso, se ejecuta en otro EndPoint
     
  } catch (error) {
      console.error('Error:', error);
      let ticketVacio='';
      return {ticketVacio,error};
  }
};

const generarTicketGreConsultaDB = async (documento_id,cod,serie,numero) => {
  const strSQL = `
      SELECT gre_ticket, gre_digestvalue FROM api_usuarioticket
      WHERE documento_id = $1
      AND codigo = $2
      AND serie = $3
      AND numero = $4
  `;
  const { rows } = await pool.query(strSQL, [documento_id,cod,serie,numero]);
  return rows;
};
const registrarTicketDB = async (documento_id, codigo, serie, numero, sTicketGre, sDigestValue) => {
    try {
        const strSQL = `
            INSERT INTO api_usuarioticket
            (documento_id, codigo, serie, numero, gre_ticket, gre_digestvalue)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        const result = await pool.query(strSQL, [documento_id, codigo, serie, numero, sTicketGre, sDigestValue]);

        // Validar si se insertó al menos una fila
        if (result.rowCount > 0) {
            return true;
        } else {
            return false;
        }
    } catch (error) {
        console.error('Error al registrar ticket:', error); // para depuración
        return false;
    }
};

const generarTicketGreSunat = async (sJson) => {
    try {
        const dataGuia = sJson;
        console.log(sJson);
        console.log('Procesando comprobante: ',dataGuia.empresa.ruc,dataGuia.venta.codigo,dataGuia.venta.serie,dataGuia.venta.numero);

        //00. Consulta previa datos necesarios para procesos posteriores: certificado,password, usuario secundario, url
        /*const { rows } = await pool.query(`
          SELECT certificado, password, secundario_user,secundario_passwd, url_envio, logo, gre_credencial, gre_password
          FROM mad_usuariocertificado 
          WHERE documento_id = $1
        `, [dataGuia.empresa.ruc]);
        //Aqui lo estamos cargando datos sensibles  ... fijos en API
        const {certificado: certificadoBuffer, password, secundario_user, secundario_passwd, url_envio, logo:logoBuffer, gre_credencial, gre_password} = rows[0];
        //00. Obtener token
        const data = await obtenerTokenSunat(gre_credencial, gre_password,dataGuia.empresa.ruc, secundario_user,secundario_passwd);*/

        const data = await obtenerTokenSunatGre(dataGuia.empresa.ruc);
        const sToken = data.access_token;

        //01. Genera XML desde el servicio y canonicalizo el resultado
        let xmlComprobante = await gregeneraxml(dataGuia);
        xmlComprobante = canonicalizarManual(xmlComprobante);

        //02. Nueva firma implementado propio
        const signerManual = new XmlSignatureMod(certificadoBuffer, password, xmlComprobante);
        signerManual.setSignNodeName('DespatchAdvice');
        let xmlComprobanteFirmado = await signerManual.getSignedXML();
        const digestvalue = obtenerDigestValue(xmlComprobanteFirmado);
        
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
        const resultadoTicket = await enviarGreSunat(sToken,dataGuia.empresa.ruc,dataGuia.guia.codigo,dataGuia.guia.serie,dataGuia.guia.numero, xmlComprobanteFirmado)
        console.log('resultadoTicket: ', resultadoTicket)

        //Guardar en BD numTicket con el rico: "name arguments pattern" parametros nombrados ;)
        registrarTicketDB({
          documento_id: dataGuia.empresa.ruc,
          codigo: dataGuia.guia.serie,
          serie: dataGuia.guia.numero,
          numero: dataGuia.guia.numero,
          sTicketGre: resultadoTicket.numTicket,
          sDigestValue: sDigestInicial,
        }).catch(error => {
          console.error('Error al insertar ticket', error);
        });
        const ticket = resultadoTicket.numTicket;
        //Respuesta 
        return { ticket, digestvalue };
        
    }catch(error){
        console.log(error);
        //next(error)
        return { ticket:'', digestvalue:'' };
    }

};

async function descargarGreSunatCDR(ruc, numTicket, cod,serie,numero) {
  const url = `https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/envios/${numTicket}`;
  const tokenData = await obtenerTokenSunatGre(ruc);
  const sToken = tokenData.access_token;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();
    const codRespuesta = String(data.codRespuesta || '');  // Asegurar lectura como string
    const indCdrGenerado = String(data.indCdrGenerado || '0');

    let estado = 'DESCONOCIDO';
    let cdr = null;

    switch (codRespuesta) {
      case '0':
        estado = 'OK';
        break;
      case '98':
        estado = 'EN_PROCESO';
        break;
      case '99':
        estado = 'ERROR';
        console.error(`SUNAT Error ${data.error?.numError}: ${data.error?.desError}`);
        break;
      default:
        console.warn(`Código de respuesta no esperado: ${codRespuesta}`);
    }

    if (['0', '99'].includes(codRespuesta) && indCdrGenerado === '1') {
      cdr = data.arcCdr || null;
      const cdrXml = extraerCDRDesdeBase64String(cdr);

      /////////////////////////////////////////////////////////////////////
      //Guardar cdr-xml en Server Ubuntu, version asyncrono(desconectado)
      (async () => {
        try {
          await subirArchivoDesdeMemoria(
            ruc,
            cod,
            serie,
            numero,
            cdrXml,
            'R'
          );
          //console.log('Archivo XML almacenado en copia correctamente.');
        } catch (error) {
          console.error('Error al almacenar XML:', error);
        }
      })();
      /////////////////////////////////////////////////////////////////////
    }
    return estado;

  } catch (error) {
    console.error("❗ Error consultando ticket:", error.message);
    return 'ERROR_CONEXION';
  }
};

function extraerCDRDesdeBase64String(sBase64Zip) {
  try {
    const zipBuffer = Buffer.from(sBase64Zip, 'base64');
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    for (const entry of zipEntries) {
      if (entry.entryName.toLowerCase().endsWith('.xml')) {
        const cdrXml = zip.readAsText(entry, 'utf8');
        return cdrXml;
      }
    }

    console.warn('⚠️ No se encontró ningún archivo .xml dentro del ZIP');
    return null;

  } catch (error) {
    console.error('❗ Error extrayendo CDR del ZIP:', error.message);
    return null;
  }
}
module.exports = {
    registrarGRESunat
 }; 
