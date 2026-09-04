const cpegenerarxmlresumen = require('./cpe/cpegeneraxmlresumen');
const { subirArchivoDesdeMemoria } = require('./cpe/cpeuploader');
const pool = require('../db');
const { XmlSignatureMod } = require('../utils/xmlsignaturemod.utils');
const { QpseService } = require('../utils/qpse.service');

const { DOMParser } = require('xmldom');
const xpath = require('xpath');
const AdmZip = require('adm-zip');
const fetch = require('node-fetch');

require('dotenv').config();

// ORDEN DE EJECUCION - BACKEND API SUNAT PARA RESUMEN
// Ruta:
//   POST /cpesunatresumen
//
// Paso 1:
//   registrarCPEResumenSunat(req, res, next)
//   Recibe el JSON tributario armado por el backend administrativo.
//
// Paso 2:
//   validarDataResumen(dataResumen)
//   Verifica empresa.ruc, cabecera resumen y comprobantes[].
//
// Paso 3:
//   obtenerNombreResumen(dataResumen) / obtenerPartesResumen(dataResumen)
//   Arma el nombre SUNAT: RUC-RC-YYYYMMDD-CORRELATIVO.
//
// Paso 4:
//   obtenerCertificado(ruc)
//   Recupera certificado, clave, usuario SOL, password SOL y URL de envio.
//
// Paso 5:
//   cpegenerarxmlresumen(dataResumen)
//   Convierte el JSON tipo TRD a XML UBL SummaryDocuments.
//
// Paso 6:
//   firmarResumen(xmlResumen, certificado, dataResumen)
//   Firma el XML con certificado interno o proveedor externo.
//
// Paso 7:
//   subirArchivoDesdeMemoria(...)
//   Guarda copia del XML firmado.
//
// Paso 8:
//   empaquetarYGenerarSOAPSummary(...)
//   Crea ZIP en memoria y arma SOAP sendSummary.
//
// Paso 9:
//   enviarSOAPSunat(...)
//   Envia el resumen a SUNAT beta o produccion.
//
// Paso 10:
//   procesarRespuestaTicket(respuestaSoap)
//   Lee el ticket devuelto por SUNAT o normaliza el SOAP Fault.
//
// Paso 11:
//   Responde al backend administrativo con ticket, nombre_archivo y ruta_xml.
const registrarCPEResumenSunat = async (req, res, next) => {
  try {
    const dataResumen = req.body;
    validarDataResumen(dataResumen);

    // RESUMEN DIARIO SUNAT - REEMPLAZO DEL ENVIO SFS
    // Paso 1: recibir el payload JSON armado por el backend administrativo.
    // Este JSON ocupa el lugar del antiguo TRD: empresa, cabecera RC y
    // comprobantes con bases gravadas/exoneradas e IGV.
    const { ruc } = dataResumen.empresa;
    const nombre = obtenerNombreResumen(dataResumen);
    const partes = obtenerPartesResumen(dataResumen);

    // Paso 2: obtener credenciales y certificado.
    // Equivale a la configuracion usada por SFS para firmar y enviar a SUNAT.
    const certificado = await obtenerCertificado(ruc);

    // Paso 3: generar XML UBL SummaryDocuments.
    // Aqui se traducen las bases del JSON a:
    // - BillingPayment InstructionID 01/02/03/05.
    // - TaxTotal 1000 IGV VAT, incluso con monto 0.00 para exoneradas.
    let xmlResumen = cpegenerarxmlresumen(dataResumen);
    xmlResumen = canonicalizarManual(xmlResumen);

    // Paso 4: firmar el XML.
    // SFS firmaba el XML generado; aqui se firma SummaryDocuments con el
    // certificado interno o con el proveedor externo configurado.
    const { xmlFirmado, digestValue } = await firmarResumen(xmlResumen, certificado, dataResumen);

    // Paso 5: guardar copia del XML firmado en el repositorio de descargas.
    // Sirve para auditoria y para conservar lo que realmente se envio.
    void subirArchivoDesdeMemoria(
      ruc,
      partes.codigo,
      partes.serie,
      partes.numero,
      xmlFirmado,
      '-'
    );

    // Paso 6: comprimir el XML firmado y construir SOAP sendSummary.
    // Equivale a cuando SFS generaba ZIP y lo enviaba a SUNAT.
    const soapXml = empaquetarYGenerarSOAPSummary({
      ruc,
      nombre,
      xmlFirmado,
      usuarioSol: certificado.secundario_user,
      passwordSol: certificado.secundario_passwd
    });

    // Paso 7: enviar a SUNAT.
    // Para resumenes SUNAT devuelve ticket, no CDR inmediato.
    const respuestaSoap = await enviarSOAPSunat(soapXml, certificado.url_envio, dataResumen.empresa.modo);
    const resultado = procesarRespuestaTicket(respuestaSoap);
    const serverSftp = process.env.CPE_HOST;

    if (resultado.estado) {
      return res.status(200).json({
        estado: true,
        nivel: 'TICKET',
        ticket: resultado.ticket,
        codigo_hash: digestValue,
        nombre_archivo: nombre,
        ruta_xml: `http://${serverSftp}:8080/descargas/${ruc}/${nombre}.xml`,
        respuesta_sunat_descripcion: 'Resumen enviado a SUNAT. Consultar CDR con el ticket.',
        mensaje: dataResumen?.empresa?.modo === '1' ? 'Ticket recibido Produccion' : 'Ticket recibido Beta'
      });
    }

    return res.status(400).json({
      estado: false,
      nivel: resultado.nivel,
      ticket: '',
      codigo_hash: null,
      nombre_archivo: nombre,
      ruta_xml: 'error',
      respuesta_sunat_descripcion: resultado.descripcion,
      detalle_sunat: resultado.detalleSunat,
      mensaje: 'No fue posible enviar el resumen'
    });
  } catch (error) {
    console.error('Error al registrar resumen SUNAT:', error);
    next(error);
  }
};

// ORDEN DE EJECUCION - BACKEND API SUNAT PARA CONSULTAR TICKET
// Ruta:
//   POST /cpesunatresumen/ticket
//
// Paso 1:
//   consultarCPEResumenSunat(req, res, next)
//   Recibe empresa.ruc, ticket y nombre_archivo o datos del resumen.
//
// Paso 2:
//   obtenerNombreResumen(...) / obtenerPartesDesdeNombre(...)
//   Resuelve el nombre del archivo RC para guardar el CDR.
//
// Paso 3:
//   obtenerCertificado(empresa.ruc)
//   Recupera credenciales SOL y URL de envio.
//
// Paso 4:
//   generarSOAPGetStatus(...)
//   Arma SOAP getStatus con el ticket.
//
// Paso 5:
//   enviarSOAPSunat(...)
//   Consulta SUNAT por el estado del ticket.
//
// Paso 6:
//   procesarRespuestaStatus(...)
//   Si hay content, extrae ZIP CDR, lee ResponseCode y guarda R-*.xml.
//   Si viene statusCode 98, responde PENDIENTE.
//
// Paso 7:
//   Responde al backend administrativo con PENDIENTE, ACEPTADO o RECHAZADO.
const consultarCPEResumenSunat = async (req, res, next) => {
  try {
    const { empresa, resumen, ticket, nombre_archivo } = req.body;

    if (!empresa?.ruc || !ticket) {
      return res.status(400).json({
        estado: false,
        respuesta_sunat_descripcion: 'Debe enviar empresa.ruc y ticket.'
      });
    }

    // CONSULTA DE TICKET - EQUIVALENTE AL SEGUIMIENTO SFS DEL RESUMEN
    // Paso 1: reconstruir el nombre RC para guardar/ubicar el CDR.
    const dataResumen = { empresa, resumen: resumen || {} };
    const nombre = nombre_archivo || obtenerNombreResumen(dataResumen);
    const partes = nombre_archivo
      ? obtenerPartesDesdeNombre(nombre_archivo)
      : obtenerPartesResumen(dataResumen);
    const certificado = await obtenerCertificado(empresa.ruc);

    // Paso 2: construir SOAP getStatus con el ticket recibido por sendSummary.
    const soapXml = generarSOAPGetStatus({
      ruc: empresa.ruc,
      ticket,
      usuarioSol: certificado.secundario_user,
      passwordSol: certificado.secundario_passwd
    });

    // Paso 3: consultar SUNAT y procesar resultado.
    // statusCode 98 => pendiente.
    // content => ZIP CDR en base64; se extrae XML y se guarda como R-*.xml.
    const respuestaSoap = await enviarSOAPSunat(soapXml, certificado.url_envio, empresa.modo);
    const resultado = await procesarRespuestaStatus(
      respuestaSoap,
      partes.serie
        ? {
            ruc: empresa.ruc,
            codigo: partes.codigo,
            serie: partes.serie,
            numero: partes.numero
          }
        : null
    );

    const serverSftp = process.env.CPE_HOST;
    const rutaCdr = resultado.cdr_guardado
      ? `http://${serverSftp}:8080/descargas/${empresa.ruc}/R-${nombre}.xml`
      : '';

    return res.status(resultado.estado || resultado.nivel === 'PENDIENTE' ? 200 : 400).json({
      estado: resultado.estado,
      nivel: resultado.nivel,
      codigo: resultado.codigo,
      ticket,
      nombre_archivo: nombre,
      ruta_cdr: rutaCdr || 'error',
      respuesta_sunat_descripcion: resultado.descripcion,
      mensaje: resultado.mensaje
    });
  } catch (error) {
    console.error('Error al consultar resumen SUNAT:', error);
    next(error);
  }
};

function validarDataResumen(dataResumen) {
  if (!dataResumen?.empresa?.ruc) {
    throw new Error('El resumen requiere empresa.ruc.');
  }
  if (!dataResumen?.resumen) {
    throw new Error('El resumen requiere el bloque resumen.');
  }
  if (!Array.isArray(dataResumen?.comprobantes) || dataResumen.comprobantes.length === 0) {
    throw new Error('El resumen requiere comprobantes.');
  }
}

async function obtenerCertificado(ruc) {
  const { rows } = await pool.query(`
    SELECT certificado, password, secundario_user, secundario_passwd, url_envio
          ,cert_externo, cert_username, cert_password, cert_url
    FROM api_usuariocertificado
    WHERE documento_id = $1
  `, [ruc]);

  if (!rows.length) {
    throw new Error(`No se encontro certificado para el RUC ${ruc}.`);
  }

  return rows[0];
}

async function firmarResumen(xmlResumen, certificado, dataResumen) {
  const usaCertExterno = String(certificado.cert_externo) === '1';

  if (usaCertExterno) {
    const qpse = new QpseService({
      baseUrl: certificado.cert_url,
      username: certificado.cert_username,
      password: certificado.cert_password
    });

    const resultFirma = await qpse.firmarXml({
      xmlFilename: `${obtenerNombreResumen(dataResumen)}.xml`,
      xmlContent: xmlResumen
    });

    return {
      xmlFirmado: resultFirma.xmlFirmado,
      digestValue: obtenerDigestValue(resultFirma.xmlFirmado)
    };
  }

  const signerManual = new XmlSignatureMod(certificado.certificado, certificado.password, xmlResumen);
  signerManual.setSignNodeName('SummaryDocuments');
  const xmlFirmado = await signerManual.getSignedXML();

  return {
    xmlFirmado,
    digestValue: obtenerDigestValue(xmlFirmado)
  };
}

function obtenerPartesResumen(dataResumen) {
  const numero = dataResumen?.resumen?.numero || dataResumen?.resumen?.fecha_documentos;
  const correlativo = dataResumen?.resumen?.correlativo || '1';

  return {
    codigo: 'RC',
    serie: String(numero || '').replace(/-/g, ''),
    numero: correlativo
  };
}

function obtenerNombreResumen(dataResumen) {
  const partes = obtenerPartesResumen(dataResumen);
  return `${dataResumen.empresa.ruc}-${partes.codigo}-${partes.serie}-${partes.numero}`;
}

function obtenerPartesDesdeNombre(nombreArchivo) {
  const partes = String(nombreArchivo || '').split('-');

  if (partes.length < 4) {
    return {
      codigo: 'RC',
      serie: '',
      numero: ''
    };
  }

  return {
    codigo: partes[1],
    serie: partes[2],
    numero: partes.slice(3).join('-')
  };
}

function canonicalizarManual(xmlStr) {
  return xmlStr
    .replace(/(\r\n|\n|\r)/g, '')
    .replace(/\t/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

function empaquetarYGenerarSOAPSummary({ ruc, nombre, xmlFirmado, usuarioSol, passwordSol }) {
  const nombreArchivoXml = `${nombre}.xml`;
  const nombreArchivoZip = `${nombre}.zip`;
  const zip = new AdmZip();
  zip.addFile(nombreArchivoXml, Buffer.from(xmlFirmado));
  const zipBase64 = zip.toBuffer().toString('base64');

  return construirSoap({
    ruc,
    usuarioSol,
    passwordSol,
    metodo: 'sendSummary',
    contenido: `
      <fileName>${nombreArchivoZip}</fileName>
      <contentFile>${zipBase64}</contentFile>`
  });
}

function generarSOAPGetStatus({ ruc, ticket, usuarioSol, passwordSol }) {
  return construirSoap({
    ruc,
    usuarioSol,
    passwordSol,
    metodo: 'getStatus',
    contenido: `<ticket>${ticket}</ticket>`
  });
}

function construirSoap({ ruc, usuarioSol, passwordSol, metodo, contenido }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
    <soapenv:Header>
      <wsse:Security>
        <wsse:UsernameToken>
          <wsse:Username>${ruc}${usuarioSol}</wsse:Username>
          <wsse:Password>${passwordSol}</wsse:Password>
        </wsse:UsernameToken>
      </wsse:Security>
    </soapenv:Header>
    <soapenv:Body>
      <ser:${metodo}>
        ${contenido}
      </ser:${metodo}>
    </soapenv:Body>
  </soapenv:Envelope>`;
}

async function enviarSOAPSunat(soapXml, urlEnvio, modo) {
  const urlEnvioEfectivo = modo == '1'
    ? urlEnvio
    : 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService';

  const response = await fetch(urlEnvioEfectivo, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': ''
    },
    body: soapXml
  });

  return response.text();
}

function procesarRespuestaTicket(soapResponse) {
  const doc = new DOMParser().parseFromString(soapResponse, 'text/xml');
  const ticketNode = xpath.select('//*[local-name()="ticket"]', doc)[0];

  if (ticketNode?.textContent?.trim()) {
    return {
      estado: true,
      nivel: 'TICKET',
      ticket: ticketNode.textContent.trim()
    };
  }

  return procesarSoapFault(doc);
}

async function procesarRespuestaStatus(soapResponse, archivo) {
  const doc = new DOMParser().parseFromString(soapResponse, 'text/xml');
  const statusCodeNode = xpath.select('//*[local-name()="statusCode"]', doc)[0];
  const contentNode = xpath.select('//*[local-name()="content"]', doc)[0];
  const statusCode = statusCodeNode?.textContent?.trim() || '';

  if (contentNode?.textContent?.trim()) {
    const cdrXml = extraerCDRDesdeBase64String(contentNode.textContent.trim());

    if (cdrXml && archivo) {
      await subirArchivoDesdeMemoria(
        archivo.ruc,
        archivo.codigo,
        archivo.serie,
        archivo.numero,
        cdrXml,
        'R'
      );
    }

    const resultadoCdr = leerResultadoCDR(cdrXml);
    return {
      estado: resultadoCdr.codigo === '0',
      nivel: resultadoCdr.codigo === '0' ? 'ACEPTADO' : 'RECHAZADO',
      codigo: resultadoCdr.codigo,
      descripcion: resultadoCdr.descripcion,
      cdr_guardado: Boolean(cdrXml),
      mensaje: resultadoCdr.codigo === '0' ? 'CDR recibido' : 'Resumen rechazado por SUNAT'
    };
  }

  if (statusCode) {
    return {
      estado: false,
      nivel: statusCode === '98' ? 'PENDIENTE' : 'RECHAZADO',
      codigo: statusCode,
      descripcion: statusCode === '98' ? 'SUNAT aun esta procesando el resumen.' : 'SUNAT no devolvio CDR para el ticket.',
      cdr_guardado: false,
      mensaje: statusCode === '98' ? 'Ticket en proceso' : 'Ticket sin CDR'
    };
  }

  return procesarSoapFault(doc);
}

function procesarSoapFault(doc) {
  const faultCodeNode = xpath.select('//*[local-name()="faultcode"]', doc)[0];
  const faultStringNode = xpath.select('//*[local-name()="faultstring"]', doc)[0];

  return {
    estado: false,
    nivel: 'ERROR',
    codigo: faultCodeNode?.textContent?.trim() || 'SIN_RESPUESTA',
    descripcion: faultStringNode?.textContent?.trim() || 'SUNAT no devolvio ticket ni CDR.',
    detalleSunat: faultStringNode?.textContent?.trim() || ''
  };
}

function extraerCDRDesdeBase64String(base64Zip) {
  try {
    const zipBuffer = Buffer.from(base64Zip, 'base64');
    const zip = new AdmZip(zipBuffer);
    const entry = zip.getEntries().find(item => item.entryName.toLowerCase().endsWith('.xml'));
    return entry ? entry.getData().toString('utf8') : null;
  } catch (error) {
    console.error('Error extrayendo CDR resumen:', error);
    return null;
  }
}

function leerResultadoCDR(cdrXml) {
  if (!cdrXml) {
    return {
      codigo: '',
      descripcion: 'No se pudo leer el CDR devuelto por SUNAT.'
    };
  }

  const doc = new DOMParser().parseFromString(cdrXml, 'text/xml');
  const codeNode = xpath.select('//*[local-name()="ResponseCode"]', doc)[0];
  const descNode = xpath.select('//*[local-name()="Description"]', doc)[0];

  return {
    codigo: codeNode?.textContent?.trim() || '',
    descripcion: descNode?.textContent?.trim() || 'Sin descripcion SUNAT.'
  };
}

function obtenerDigestValue(xmlFirmado) {
  const doc = new DOMParser().parseFromString(xmlFirmado, 'text/xml');
  const digestNode = xpath.select('//*[local-name()="DigestValue"]', doc)[0];

  if (!digestNode) {
    throw new Error('No se encontro DigestValue en el XML firmado.');
  }

  return digestNode.textContent.trim();
}

module.exports = {
  registrarCPEResumenSunat,
  consultarCPEResumenSunat
};
