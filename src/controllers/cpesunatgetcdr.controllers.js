const AdmZip = require('adm-zip');
const { DOMParser } = require('xmldom');
const xpath = require('xpath');
const { subirArchivoDesdeMemoria } = require('./cpe/cpeuploader');
const pool = require('../db');
/**
 * Endpoint para consultar el estado y CDR de un comprobante en SUNAT
 * Ruta sugerida: POST /api/consultar-cdr
 */
const procesarCDRPendienteSunat = async (req, res, next) => {
  try {
    const dataConsulta = req.body;
    // Esperamos: { ruc_emisor, ruc, codigo, serie, numero }
    
    console.log('🔍 Consultando CDR:', dataConsulta.ruc_emisor, dataConsulta.ruc, dataConsulta.codigo, dataConsulta.serie, dataConsulta.numero);

    // 01. Consulta previa datos necesarios: usuario secundario
    const { rows } = await pool.query(`
      SELECT secundario_user, secundario_passwd
      FROM api_usuariocertificado 
      WHERE documento_id = $1
    `, [dataConsulta.ruc_emisor]);

    if (rows.length === 0) {
      return res.status(404).json({
        estado: false,
        mensaje: 'RUC no encontrado en la base de datos'
      });
    }

    const { secundario_user, secundario_passwd } = rows[0];

    // 02. URL de consulta
    const url_consulta = 'https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService';

    // 03. Construir SOAP para getStatusCdr
    const contenidoSOAP = construirSOAPConsultaCdr(
      dataConsulta.ruc_emisor,
      dataConsulta.ruc,
      dataConsulta.codigo,
      dataConsulta.serie,
      dataConsulta.numero,
      secundario_user,
      secundario_passwd
    );

    // 04. Enviar SOAP y recepcionar respuesta SUNAT
    const respuestaSoap = await enviarSOAPSunat(contenidoSOAP, url_consulta);
    //console.log('📩 Respuesta recibida de SUNAT (getStatusCdr)');

    // 04. Procesar respuesta SUNAT
    const resultadoSunat = await procesarRespuestaConsultaCdr(respuestaSoap, dataConsulta);

    // 05. Construir rutas de archivos
    const server_sftp = process.env.CPE_HOST;
    const ruta_xml = `http://${server_sftp}:8080/descargas/${dataConsulta.ruc}/${dataConsulta.ruc}-${dataConsulta.codigo}-${dataConsulta.serie}-${dataConsulta.numero}.xml`;
    const ruta_cdr = `http://${server_sftp}:8080/descargas/${dataConsulta.ruc}/R-${dataConsulta.ruc}-${dataConsulta.codigo}-${dataConsulta.serie}-${dataConsulta.numero}.xml`;
    const ruta_pdf = `http://${server_sftp}:8080/descargas/${dataConsulta.ruc}/${dataConsulta.ruc}-${dataConsulta.codigo}-${dataConsulta.serie}-${dataConsulta.numero}.pdf`;

    // 06. Enviar respuesta HTTP según resultado
    console.log('resultadoSunat', resultadoSunat);
    const descripcionCorta = (resultadoSunat.descripcion || '').substring(0, 80);

    if (resultadoSunat.estado && resultadoSunat.tieneCdr) {

      await pool.query(`
        DELETE FROM api_cdrpendiente
        WHERE documento_id = $1 AND ruc = $2 AND codigo = $3 AND serie = $4 AND numero = $5
      `, [
        dataConsulta.ruc_emisor,
        dataConsulta.ruc,
        dataConsulta.codigo,
        dataConsulta.serie,
        dataConsulta.numero
      ]);

      res.status(200).json({
        estado: true,
        respuesta_sunat_descripcion: resultadoSunat.descripcion,
        ruta_xml: ruta_xml,
        ruta_cdr: ruta_cdr,
        ruta_pdf: ruta_pdf,
        status_code: resultadoSunat.statusCode,
        mensaje: 'CDR Recuperado de Producción'
      });
    } else if (resultadoSunat.estado && !resultadoSunat.tieneCdr) {
      res.status(200).json({
        estado: true,
        respuesta_sunat_descripcion: resultadoSunat.descripcion,
        status_code: resultadoSunat.statusCode,
        mensaje: 'Comprobante encontrado pero sin CDR disponible'
      });
    } else {
      res.status(400).json({
        estado: false,
        respuesta_sunat_descripcion: 'Error SUNAT: ' + descripcionCorta,
        detalle_sunat: resultadoSunat.detalleSunat,
        codigo: resultadoSunat.codigo,
        mensaje: 'No se pudo recuperar el CDR'
      });
    }

  } catch (error) {
    console.error('❌ Error en consultarCDRSunat:', error);
    next(error);
  }
};

/**
 * Construir SOAP XML para consulta getStatusCdr
 */
function construirSOAPConsultaCdr(ruc_emisor, ruc, codigo, serie, numero, usuarioSol, claveSol) {
  // Concatenar RUC emisor + Usuario SOL
  const username = `${ruc_emisor}${usuarioSol}`;

  const soapXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:ser="http://service.sunat.gob.pe"
                  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${username}</wsse:Username>
        <wsse:Password>${claveSol}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:getStatusCdr>
      <rucComprobante>${ruc}</rucComprobante>
      <tipoComprobante>${codigo}</tipoComprobante>
      <serieComprobante>${serie}</serieComprobante>
      <numeroComprobante>${numero}</numeroComprobante>
    </ser:getStatusCdr>
  </soapenv:Body>
</soapenv:Envelope>`;

  return soapXml;
}

/**
 * Procesar respuesta SOAP de consulta CDR
 */
async function procesarRespuestaConsultaCdr(soapResponse, dataConsulta) {
  try {
    //Para procesar, 
    const { ruc_emisor, codigo, serie, numero } = dataConsulta;

    // Parsear SOAP XML
    const doc = new DOMParser().parseFromString(soapResponse, 'text/xml');
    const select = xpath.useNamespaces({
      'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
      'ns0': 'http://service.sunat.gob.pe'
    });

    // Verificar si hay Fault
    const faultNode = select('//*[local-name()="Fault"]', doc)[0];
    if (faultNode) {
      const faultCodeNode = select('//*[local-name()="faultcode"]', doc)[0];
      const faultStringNode = select('//*[local-name()="faultstring"]', doc)[0];

      const faultCode = faultCodeNode ? faultCodeNode.textContent.trim() : 'UNKNOWN';
      const faultMessage = faultStringNode ? faultStringNode.textContent.trim() : 'Error desconocido en SOAP';

      // Mensajes personalizados
      let userMessage = faultMessage;
      if (faultCode.includes("0100")) {
        userMessage = "SUNAT está fuera de servicio. Intente más tarde.";
      } else if (faultCode.includes("1032")) {
        userMessage = "Credenciales SOL incorrectas.";
      } else if (faultMessage.includes("no existe") || faultMessage.includes("not found")) {
        userMessage = "El comprobante no existe en SUNAT o aún no ha sido procesado.";
      }

      return {
        estado: false,
        descripcion: userMessage,
        detalleSunat: faultMessage,
        codigo: faultCode
      };
    }

    // Buscar statusCdr en la respuesta
    const statusCdrNode = select('//*[local-name()="statusCdr"]', doc)[0];
    if (!statusCdrNode) {
      throw new Error('❌ No se encontró statusCdr en la respuesta SOAP.');
    }

    // Extraer statusCode, statusMessage y content
    const statusCodeNode = select('.//*[local-name()="statusCode"]', statusCdrNode)[0];
    const statusMessageNode = select('.//*[local-name()="statusMessage"]', statusCdrNode)[0];
    const contentNode = select('.//*[local-name()="content"]', statusCdrNode)[0];

    const statusCode = statusCodeNode ? statusCodeNode.textContent.trim() : '';
    const statusMessage = statusMessageNode ? statusMessageNode.textContent.trim() : 'Sin mensaje';

    // Si no hay content, retornar solo el mensaje
    if (!contentNode || !contentNode.textContent.trim()) {
      return {
        estado: statusCode === '0',
        descripcion: statusMessage,
        statusCode: statusCode,
        tieneCdr: false
      };
    }

    // Decodificar base64 a buffer ZIP
    const base64Zip = contentNode.textContent.trim();
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

    // 🔹 Subir CDR con prefijo R- (versión asíncrona desconectada)
    (async () => {
      try {
        await subirArchivoDesdeMemoria(ruc_emisor, codigo, serie, numero, contenidoCDR, 'R');
        console.log('✅ CDR almacenado correctamente.');
      } catch (error) {
        console.error('❌ Error al almacenar CDR:', error);
      }
    })();

    // Extraer cbc:Description del CDR
    const descDoc = new DOMParser().parseFromString(contenidoCDR, 'text/xml');
    const descSelect = xpath.useNamespaces({
      cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
    });
    const descNode = descSelect('//*[local-name()="Description"]', descDoc)[0];
    const descripcionCDR = descNode ? descNode.textContent.trim() : statusMessage;

    return {
      estado: true,
      descripcion: descripcionCDR,
      statusCode: statusCode,
      statusMessage: statusMessage,
      contenidoCDR: contenidoCDR,
      tieneCdr: true
    };

  } catch (error) {
    console.error('❌ Error procesando respuesta consulta CDR:', error.message);
    return {
      estado: false,
      descripcion: error.message
    };
  }
}

async function enviarSOAPSunat(soapXml,urlEnvio) {
    //Facturas,NotasCred,NotasDeb
    try {
      const response = await fetch(urlEnvio, {
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
  
// Exportar función principal
module.exports = {
  procesarCDRPendienteSunat
};