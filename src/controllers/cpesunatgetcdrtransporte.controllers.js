const AdmZip = require('adm-zip');
const { DOMParser } = require('xmldom');
const xpath = require('xpath');
const { subirArchivoDesdeMemoria } = require('./cpe/cpeuploader');
const pool = require('../db');
/**
 * Endpoint para consultar el estado y CDR de un comprobante en SUNAT
 * Ruta sugerida: POST /api/consultar-cdr
 */
const seguimiento = require('../services/cdrseguimiento.services');
const procesarCDRPendienteSunat = async (req, res, next) => {
  try {
    const data = req.body;
    const ruc = data.empresa.ruc;
    const { codigo, serie, numero } = data.venta;
    const pendiente = await seguimiento.obtenerPendiente(data);
    const { rows } = await pool.query(
      'SELECT secundario_user, secundario_passwd FROM api_usuariocertificado WHERE documento_id=$1', [ruc]);
    if (!rows.length) return res.status(404).json({ estado:false, codigo:'SIN_RUC',
      nivel:'PENDIENTE',cdr_pendiente:'1',mensaje_usuario:'RUC no encontrado en la API.' });
    const soap = construirSOAPConsultaCdr(ruc,codigo,serie,numero,rows[0].secundario_user,rows[0].secundario_passwd);
    const respuesta = await enviarSOAPSunat(soap,'https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService');
    const resultado = await procesarRespuestaConsultaCdr(respuesta,data);
    const codigoResultado = resultado.codigo ?? resultado.statusCode ?? 'CONSULTA';
    const tieneCdr = resultado.tieneCdr === true;
    const aceptado = tieneCdr && resultado.codigo === '0';
    // Solo este resultado de consulta permite ofrecer reenvio; no un error de red o credenciales.
    const puedeReenviar = !tieneCdr && resultado.statusCode === '0127';
    await seguimiento.registrarResultado(data, { codigo:codigoResultado,
      mensaje:resultado.detalleSunat || resultado.descripcion,
      resuelto:tieneCdr, resolucion:tieneCdr ? 'CDR_RECUPERADO' : null });
    const baseUrl = 'http://' + process.env.CPE_HOST + ':8080/descargas/' + ruc;
    const archivo = ruc + '-' + codigo + '-' + serie + '-' + numero;
    return res.status(tieneCdr || resultado.estado ? 200 : 400).json({
      estado:aceptado,
      nivel:tieneCdr ? (aceptado ? 'ACEPTADO' : 'RECHAZADO') : 'PENDIENTE',
      codigo:codigoResultado, status_code:resultado.statusCode,
      cdr_pendiente:tieneCdr ? '0' : '1', pendiente_detectado:!tieneCdr,
      puede_reenviar:puedeReenviar, consumioCorrelativo:tieneCdr,
      permiteReintento:!tieneCdr,
      titulo_usuario:tieneCdr ? (aceptado ? 'Comprobante aceptado' : 'Comprobante rechazado') : 'Envío por confirmar',
      mensaje_usuario:tieneCdr ? resultado.descripcion : puedeReenviar
        ? 'SUNAT no encontró el comprobante en esta consulta. Puede reintentar el envío del mismo comprobante.'
        : 'No se pudo completar la operación. Consulte el estado nuevamente. ' + (resultado.descripcion || ''),
      respuesta_sunat_descripcion:resultado.descripcion,
      detalle_sunat:resultado.detalleSunat,
      ruta_xml:baseUrl + '/' + archivo + '.xml', ruta_cdr:baseUrl + '/R-' + archivo + '.xml',
      ruta_pdf:baseUrl + '/' + archivo + '.pdf', codigo_hash:aceptado ? pendiente?.codigo_hash || null : null
    });
  } catch(error) {
    try { await seguimiento.registrarResultado(req.body,{codigo:'CONSULTA',mensaje:error.message}); }
    catch(registroError) { console.error('Error guardando consulta CDR:',registroError.message); }
    return next(error);
  }
};

/**
 * Construir SOAP XML para consulta getStatusCdr
 */
function construirSOAPConsultaCdr(ruc_emisor, codigo, serie, numero, usuarioSol, claveSol) {
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
      <rucComprobante>${ruc_emisor}</rucComprobante>
      <tipoComprobante>${codigo}</tipoComprobante>
      <serieComprobante>${serie}</serieComprobante>
      <numeroComprobante>${numero}</numeroComprobante>
    </ser:getStatusCdr>
  </soapenv:Body>
</soapenv:Envelope>`;

  //console.log('soapXml Generado: ',soapXml);
  return soapXml;
}

/**
 * Procesar respuesta SOAP de consulta CDR
 */
async function procesarRespuestaConsultaCdr(soapResponse, dataConsulta) {
  try {
    //Para procesar, 
    const { ruc:ruc_emisor } = dataConsulta.empresa;
    const { codigo, serie, numero } = dataConsulta.venta;

    //const { ruc:ruc_emisor, documento_identidad:ruc , codigo, serie, numero } = dataConsulta;

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

    // Guardar el CDR antes de dar la consulta por resuelta.
    await subirArchivoDesdeMemoria(ruc_emisor, codigo, serie, numero, contenidoCDR, 'R');

    // Extraer cbc:Description del CDR
    const descDoc = new DOMParser().parseFromString(contenidoCDR, 'text/xml');
    const descSelect = xpath.useNamespaces({
      cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
    });
    const descNode = descSelect('//*[local-name()="Description"]', descDoc)[0];
    const descripcionCDR = descNode ? descNode.textContent.trim() : statusMessage;

    const codeNode = descSelect('//*[local-name()="ResponseCode"]', descDoc)[0];
    const codigoCDR = codeNode?.textContent.trim();
    if (!codigoCDR || !/^\d+$/.test(codigoCDR)) throw new Error('CDR sin código de respuesta válido.');
    return {
      estado: codigoCDR === '0',
      codigo: codigoCDR,
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