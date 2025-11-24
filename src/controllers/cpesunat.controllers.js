const cpegeneraxml = require('./cpe/cpegeneraxml');
const cpegenerapdf = require('./cpe/cpegenerapdf');
const cpegenerapdfa4 = require('./cpe/cpegenerapdfa4');
const { subirArchivoDesdeMemoria } = require('./cpe/cpeuploader');
const pool = require('../db');

const { XmlSignatureMod } = require('../utils/xmlsignaturemod.utils');
/////////////////////////////////////////////////////////
const { DOMParser} = require('xmldom');

//const { XmlSignature } = require('@supernova-team/xml-sunat');
const fs = require('fs/promises');
const xpath = require('xpath');
const path = require('path');
const { randomUUID } = require('crypto');

const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
const cpegenerarxmlnota = require('./cpe/cpegeneraxmlnota');

const { esErrorCDRPendiente } = require('../services/cdrvalidapendiente.services');
//const { procesarCDRPendienteSunat } = require('../controllers/cpesunatgetcdr.controllers');

require('dotenv').config();

const registrarCPESunat = async (req,res,next)=> {
    try {
        const dataVenta = req.body;
        //console.log('Procesando comprobante: ',dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero);

        /*const { ruc } = dataVenta.empresa;
        const { codigo, serie, numero } = dataVenta.venta;
        const { documento_identidad } = dataVenta.cliente;

        // 🟡 PRIMER PASO: verificar si existe en tabla de pendientes
        const yaPendiente = await existeCDRPendiente({ 
            documento_id: ruc, 
            documento_identidad,
            codigo, 
            serie, 
            numero 
        });

        if (yaPendiente) {
            console.log(`📌 CPE pendiente detectado ${ruc}-${documento_identidad}-${codigo}-${serie}-${numero}`);
            return procesarCDRPendienteSunat(req,res,next);
        }*/
        
        //Flujo normal
        //00. Consulta previa datos necesarios para procesos posteriores: certificado,password, usuario secundario, url
        const { rows } = await pool.query(`
          SELECT certificado, password, secundario_user,secundario_passwd, url_envio, logo
          FROM api_usuariocertificado 
          WHERE documento_id = $1
        `, [dataVenta.empresa.ruc]);
        //Aqui lo estamos cargando datos sensibles  ... fijos en API
        const {certificado: certificadoBuffer, password, secundario_user, secundario_passwd, url_envio, logo:logoBuffer} = rows[0];

        //01. Genera XML desde el servicio y canonicalizo el resultado
        let xmlComprobante;
        if (dataVenta.venta.codigo === '07'){
            xmlComprobante = await cpegenerarxmlnota(dataVenta);  
        }else{
            xmlComprobante = await cpegeneraxml(dataVenta);
        }
        xmlComprobante = canonicalizarManual(xmlComprobante);

        //02. Genero el bloque de firma y lo añado al xml Original (xmlComprobante)
        //let xmlComprobanteFirmado = await firmarXMLUBL(xmlComprobante, certificadoBuffer,password);
        //const sDigestInicial = obtenerDigestValue(xmlComprobanteFirmado);
        const signerManual = new XmlSignatureMod(certificadoBuffer, password, xmlComprobante);
        
        if (dataVenta.venta.codigo === '07'){
            signerManual.setSignNodeName('CreditNote');
        }else{
            signerManual.setSignNodeName('Invoice');
        }
        const xmlComprobanteFirmado = await signerManual.getSignedXML();
        const sDigestInicial = obtenerDigestValue(xmlComprobanteFirmado);

        //me guardo una copia del xmlFirmado en servidor ubuntu
        //await subirArchivoDesdeMemoria(dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero, xmlComprobanteFirmado,'-');
        //03. Guardar xml firmado en Server Ubuntu, version asyncrono(desconectado)
        (async () => {
          try {
            await subirArchivoDesdeMemoria(
              dataVenta.empresa.ruc,
              dataVenta.venta.codigo,
              dataVenta.venta.serie,
              dataVenta.venta.numero,
              xmlComprobanteFirmado,
              '-'
            );
            //console.log('Archivo XML almacenado en copia correctamente.');
          } catch (error) {
            console.error('Error al almacenar XML:', error);
          }
        })();
        
        //04. Construir SOAP
        let contenidoSOAP = await empaquetarYGenerarSOAP(dataVenta.empresa.ruc,dataVenta.venta.codigo,dataVenta.venta.serie,dataVenta.venta.numero,xmlComprobanteFirmado,secundario_user,secundario_passwd);
        
        //05. Enviar SOAP y recepcionar respuesta SUNAT
        const respuestaSoap = await enviarSOAPSunat(contenidoSOAP,url_envio,dataVenta.empresa.modo);
        //console.log('📩 Respuesta recibida de SUNAT:', respuestaSoap);
        
        // 06. Procesar respuesta SUNAT
        const resultadoSunat = await procesarRespuestaSunat(respuestaSoap, dataVenta);

        // 07. Generar PDF
        //PDF version asyncrono (desconectado)
        (async () => {
          procesarPDFCPE('80mm', logoBuffer, dataVenta, sDigestInicial);
        })();

        // Encapsulación final:
        return responderSunat(res, resultadoSunat, dataVenta, sDigestInicial);
        
    }catch(error){
        console.log(error);
        //res.json({error:error.message});
        next(error)
    }
};

function responderSunat(res, resultadoSunat, dataVenta, sDigestInicial) {

  const server_sftp = process.env.CPE_HOST;
  const ruta_xml = 'http://' + server_sftp + ':8080/descargas/'+ dataVenta.empresa.ruc + '/' + dataVenta.empresa.ruc+ '-' + dataVenta.venta.codigo + '-' + dataVenta.venta.serie + '-' + dataVenta.venta.numero + '.xml'
  const ruta_cdr = 'http://' + server_sftp + ':8080/descargas/'+ dataVenta.empresa.ruc + '/R-' + dataVenta.empresa.ruc+ '-' + dataVenta.venta.codigo + '-' + dataVenta.venta.serie + '-' + dataVenta.venta.numero + '.xml'
  const ruta_pdf = 'http://' + server_sftp + ':8080/descargas/'+ dataVenta.empresa.ruc + '/' + dataVenta.empresa.ruc+ '-' + dataVenta.venta.codigo + '-' + dataVenta.venta.serie + '-' + dataVenta.venta.numero + '.pdf'

  const descripcionCorta = (resultadoSunat.descripcion || '').substring(0, 80);
  const codigoSunat = (resultadoSunat.codigo || '').trim();
  const mensajeSunat = (resultadoSunat.descripcion || '');
  const sModoEnvio = dataVenta?.empresa?.modo === "1" ? "1" : "0";
          
          //Formato de respuesta sunat//////////////////////////////////////////////////////////
          //resultadoSunat: {
          //  estado: false,
          //  descripcion: userMessage,
          //  detalleSunat: faultMessage, // 🔹 Mantener el mensaje oficial de SUNAT
          //  codigo: faultCode
          //};
          /////////////////////////////////////////////////////////////////////////////////////
  
  console.log('resultadoSunat', resultadoSunat);
  // Caso éxito normal
  if (resultadoSunat.estado) {
    return res.status(200).json({
      estado: true,
      cdr_pendiente: '0',
      respuesta_sunat_descripcion: resultadoSunat.descripcion,
      ruta_xml,
      ruta_cdr,
      ruta_pdf,
      codigo_hash: sDigestInicial,
      mensaje: (sModoEnvio=="1") ? 'CDR Recibido Produccion' : 'CDR Recibido Beta'
    });
  }

  // Caso: CDR Pendiente (solo facturas, NC, ND)
  if (['01','07','08'].includes(dataVenta.venta.codigo)) {
    const { esPendiente, descripcion } = esErrorCDRPendiente(codigoSunat, mensajeSunat);

    if (esPendiente){
        registrarCdrPendienteDB({
            documento_id: dataVenta.empresa.ruc,
            ruc: dataVenta.cliente.documento_identidad,
            codigo: dataVenta.venta.codigo,
            serie: dataVenta.venta.serie,
            numero: dataVenta.venta.numero
        }).catch(error => console.error('Error al registrar pendiente', error));

        return res.status(200).json({
            estado: true,
            cdr_pendiente: '1',
            respuesta_sunat_descripcion: descripcion,
            ruta_xml,
            ruta_cdr,
            ruta_pdf,
            codigo_hash: sDigestInicial,
            mensaje: 'CDR pendiente en SUNAT'
        });
    }
  }

  // Error real SUNAT
  return res.status(400).json({
    estado: false,
    cdr_pendiente: '0',
    respuesta_sunat_descripcion: 'error sunat: ' + descripcionCorta,
    ruta_xml: 'error',
    ruta_cdr: 'error',
    ruta_pdf: 'error',
    codigo_hash: null,
    mensaje: 'CDR No recibido'
  });
}

function canonicalizarManual(xmlStr) {
  return xmlStr
    .replace(/(\r\n|\n|\r)/g, '')
    .replace(/\t/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}
async function procesarPDFCPE(sTamaño, logoBuffer, dataVenta, sDigestInicial) {
  try {
    //const resultadoPdf = await cpegenerapdf('80mm', logoBuffer, dataVenta, sDigestInicial);
    let resultadoPdf;
    if (sTamaño === 'A4') {
      console.log('A4 sTamaño: ',sTamaño);
      resultadoPdf = await cpegenerapdfa4(logoBuffer, dataVenta, sDigestInicial);
    } else {
      console.log('sTamaño: ',sTamaño);
      resultadoPdf = await cpegenerapdf('80mm', logoBuffer, dataVenta, sDigestInicial);
    }

    if (resultadoPdf?.estado) {
      console.log('✅ PDF generado correctamente');

      await subirArchivoDesdeMemoria(
        dataVenta.empresa.ruc,
        dataVenta.venta.codigo,
        dataVenta.venta.serie,
        dataVenta.venta.numero,
        resultadoPdf.buffer_pdf,
        'PDF'
      );

      console.log('📤 PDF subido correctamente');
    } else {
      console.error('❌ Error: El proceso de generación PDF no devolvió un estado exitoso.');
    }

  } catch (error) {
    console.error('💥 Error al generar o subir el PDF:', error);
  }
}

async function firmarXMLUBL(unsignedXML, certificadoBuffer, password) {
  try {
    // 📌 Generar ruta temporal única para el PFX
    const pfxTempPath = path.join('/tmp', `cert-${randomUUID()}.pfx`);

    // 📌 Escribir buffer del certificado a archivo temporal
    await fs.writeFile(pfxTempPath, certificadoBuffer);

    // 📌 Instanciar firmador y firmar XML
    // La libreria super-nova se encarga de calcular los valores digestvalue, firma y certificado publico ... junto con la bloque de firma (formato de sunat)
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
    console.log('❌ Error al enviar SOAP:', error);
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

    // Verificar si hay Fault
    const faultNode = select('//*[local-name()="Fault"]', doc)[0];
    if (faultNode) {
      const faultCodeNode = select('//*[local-name()="faultcode"]', doc)[0];
      const faultStringNode = select('//*[local-name()="faultstring"]', doc)[0];

      const faultCode = faultCodeNode ? faultCodeNode.textContent.trim() : 'UNKNOWN';
      const faultMessage = faultStringNode ? faultStringNode.textContent.trim() : 'Error desconocido en SOAP';

      // Mensaje personalizado solo para los más frecuentes
      let userMessage = faultMessage;
      if (faultCode.includes("0100")) {
        userMessage = "SUNAT está fuera de servicio. Intente más tarde.";
      } else if (faultCode.includes("1032")) {
        userMessage = "Credenciales SOL incorrectas.";
      } else if (faultCode.includes("1020")) {
        userMessage = "El XML enviado no cumple con el formato exigido.";
      } else if (faultCode.includes("1033")) {
        userMessage = "El certificado digital no es válido o está vencido.";
      } else if (faultCode.includes("1035")) {
        userMessage = "El archivo ZIP enviado está dañado.";
      }

      return {
        estado: false,
        descripcion: userMessage,
        detalleSunat: faultMessage, // 🔹 Mantener el mensaje oficial de SUNAT
        codigo: faultCode
      };
    }

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

// 🔹 Función auxiliar reutilizable
async function generarPDFPrevioSunat(req, res, formatoPDF) {
  try {
    const dataVenta = req.body;

    // 1️⃣ Consultar logo desde la BD
    const { rows } = await pool.query(
      `SELECT logo FROM api_usuariocertificado WHERE documento_id = $1`,
      [dataVenta.empresa.ruc]
    );

    if (!rows.length) {
      return res.status(404).json({
        respuesta_sunat_descripcion: 'No se encontró logo para el RUC indicado',
        ruta_pdf: 'error',
      });
    }

    const { logo: logoBuffer } = rows[0];
    
    //(null o valor)esto llega en json, en solicitud renovar pdf o pdf libre
    //const sDigestInicial = dataVenta.venta.r_vfirmado;
    const sDigestInicial = dataVenta?.venta?.r_vfirmado ?? "";
    
    // 2️⃣ Generar PDF esperando respuesta)
    await procesarPDFCPE(formatoPDF, logoBuffer, dataVenta, sDigestInicial);

    // 3️⃣ Construir URL de descarga del PDF
    const server_sftp = process.env.CPE_HOST;
    const ruta_pdf = `http://${server_sftp}:8080/descargas/${dataVenta.empresa.ruc}/${dataVenta.empresa.ruc}-${dataVenta.venta.codigo}-${dataVenta.venta.serie}-${dataVenta.venta.numero}.pdf`;

    // 4️⃣ Responder inmediatamente al cliente
    return res.status(200).json({
      respuesta_sunat_descripcion: 'PDF generado correctamente',
      ruta_pdf,
    });

  } catch (error) {
    console.error('Error al registrar PDF Sunat:', error);
    return res.status(400).json({
      respuesta_sunat_descripcion: 'PDF no generado',
      ruta_pdf: 'error',
    });
  }
}

const existeCDRPendiente = async ({documento_id, ruc, codigo, serie, numero}) =>{
  try{
    const strSQL = `
      SELECT 1
      FROM api_cdrpendiente
      WHERE documento_id = $1
      AND ruc      = $2
      AND codigo   = $3
      AND serie    = $4
      AND numero   = $5
    `;
    const result = await pool.query(strSQL,[documento_id,ruc, codigo,serie,numero]);
    return result.rowCount > 0;
  } catch (error){
    console.error('Error en existeCDRPendiente:', error);
    return false;
  }
};

const registrarCdrPendienteDB = async ({documento_id, ruc, codigo, serie, numero}) => {
  try {
      const strSQL = `
          INSERT INTO api_cdrpendiente
          (documento_id, ruc, codigo, serie, numero, ctrl_crea)
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          RETURNING *
      `;
      const result = await pool.query(strSQL, [documento_id, ruc, codigo, serie, numero]);

      // Validar si se insertó al menos una fila
      if (result.rowCount > 0) {
          return true;
      } else {
          return false;
      }
  } catch (error) {
      console.error('Error al registrar tabla api_cdrpendiente:', error); // para depuración
      return false;
  }
};

//
// 🔹 Endpoint para ticket 80mm
//
const registrarCPESunatPrevioPDF = async (req, res, next) => {
  await generarPDFPrevioSunat(req, res, '80mm');
};

//
// 🔹 Endpoint para A4
//
const registrarCPESunatPrevioPDFA4 = async (req, res, next) => {
  await generarPDFPrevioSunat(req, res, 'A4');
};

module.exports = {
    registrarCPESunat,
    registrarCPESunatPrevioPDF,
    registrarCPESunatPrevioPDFA4
 }; 