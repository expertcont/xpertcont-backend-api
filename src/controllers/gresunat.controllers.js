const gregeneraxml = require('./gre/gregeneraxml');
const gregenerapdf = require('./gre/gregenerapdf');
const { subirArchivoDesdeMemoria } = require('./cpe/cpeuploader');
const pool = require('../db');
/////////////////////////////////////////////////////////
const { XmlSignatureMod } = require('../utils/xmlsignaturemod.utils');
const crypto = require('crypto');

/////////////////////////////////////////////////////////
const { DOMParser} = require('xmldom');

const fs = require('fs/promises');
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
        const sToken = await obtenerTokenSunat(gre_credencial, gre_password,dataGuia.empresa.ruc, secundario_user,secundario_passwd);
        console.log(sToken);

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
        const resultadoTicket = await enviarGreSunat(sToken,'09',dataGuia.empresa.ruc,dataGuia.guia.serie,dataGuia.guia.numero, xmlComprobanteFirmado)
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
async function procesarRespuestaSunat(soapResponse, dataGuia) {
  try {
      const { ruc, codigo, serie, numero } = {
        ruc: dataGuia.empresa.ruc,
        codigo: dataGuia.venta.codigo,
        serie: dataGuia.venta.serie,
        numero: dataGuia.venta.numero
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
    const nombreArchivoZip = `${numRucEmisor}-${codCpe}-${numSerie}-${numCpe}.zip`;

    // Crear ZIP en memoria
    const zip = new AdmZip();
    zip.addFile(nombreArchivoZip, Buffer.from(xmlFirmadoString));

    // Obtener contenido ZIP en buffer
    const zipBuffer = zip.toBuffer();

    // Convertir buffer a Base64
    const arcGreZip64 = zipBuffer.toString('base64');

    // Calcular hash SHA-256 en Base64 (igual que espera SUNAT)
    const hashZip = crypto.createHash('sha256').update(zipBuffer).digest('base64');
    
    const url = `https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/${numRucEmisor}-${codCpe}-${numSerie}-${numCpe}`;
    const body = {
      archivo: {
        nomArchivo: nombreArchivoZip,
        arcGreZip: arcGreZip64,
        hashZip: hashZip
      }
    };

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
    console.error('Error en enviarComprobanteSunat:', error.message);
    throw error;
  }
}

module.exports = {
    registrarGRESunat
 }; 