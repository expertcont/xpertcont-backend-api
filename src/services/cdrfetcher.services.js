// services/cdrFetcher.service.js

const AdmZip = require('adm-zip');
const { DOMParser } = require('xmldom');
const xpath = require('xpath');
const fetch = require('node-fetch');
const pool = require('../db');

const SUNAT_URL = 'https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService';
const FETCH_TIMEOUT_MS = Number(process.env.SUNAT_FETCH_TIMEOUT_MS || 20000);

/* ──────────────────────────────────────────────────────────────
   FUNCIÓN PRINCIPAL: obtenerCdrDesdeSunat
────────────────────────────────────────────────────────────── */
async function obtenerCdrDesdeSunat(dataConsulta) {
    try {
      const { ruc_emisor, ruc, tipo, serie, numero } = dataConsulta || {};
  
      if (!ruc_emisor || !ruc || !tipo || !serie || !numero) {
        return { estado: false, descripcion: 'Faltan parámetros en dataConsulta' };
      }
  
      // Paso 1: Credenciales
      const { secundario_user, secundario_passwd } = await obtenerCredencialesDesdeBD(ruc_emisor);
  
      // Paso 2: Construir XML SOAP
      const soapXml = generarXmlSoap({
        ruc_emisor,
        ruc,
        tipo,
        serie,
        numero,
        usuario: secundario_user,
        clave: secundario_passwd
      });
  
      // Paso 3: Enviar SOAP
      const soapResponse = await enviarSoap(soapXml);
  
      // Paso 4: Parsear SOAP
      const analisis = analizarRespuestaSoap(soapResponse);
  
      if (analisis.fault) {
        return {
          estado: false,
          descripcion: analisis.mensaje,
          detalleSunat: analisis.detalle,
          codigo: analisis.codigo
        };
      }
  
      if (!analisis.contentBase64) {
        return {
          estado: analisis.statusCode === '0',
          tieneCdr: false,
          statusCode: analisis.statusCode,
          descripcion: analisis.statusMessage || 'Comprobante sin CDR disponible'
        };
      }
  
      // Paso 5: Extraer ZIP
      const contenidoXML = extraerXmlDesdeZip(analisis.contentBase64);
  
      // Paso 6: Extraer descripción del CDR
      const descripcionCDR = extraerDescripcionDelCdr(contenidoXML, analisis.statusMessage);
  
      return {
        estado: true,
        tieneCdr: true,
        contenidoCDR: contenidoXML,
        descripcion: descripcionCDR,
        statusCode: analisis.statusCode
      };
  
    } catch (err) {
      return { estado: false, descripcion: err.message, detalle: String(err) };
    }
  }

  
/* ──────────────────────────────────────────────────────────────
   1) OBTENER CREDENCIALES SOL DESDE BASE DE DATOS
────────────────────────────────────────────────────────────── */
async function obtenerCredencialesDesdeBD(ruc_emisor) {
  const { rows } = await pool.query(`
    SELECT secundario_user, secundario_passwd
    FROM api_usuariocertificado
    WHERE documento_id = $1
    LIMIT 1
  `, [ruc_emisor]);

  if (!rows || rows.length === 0) {
    throw new Error('RUC emisor no encontrado en la base de datos');
  }

  const { secundario_user, secundario_passwd } = rows[0];

  if (!secundario_user || !secundario_passwd) {
    throw new Error('Credenciales SOL incompletas para este RUC');
  }

  return { secundario_user, secundario_passwd };
}

/* ──────────────────────────────────────────────────────────────
   2) GENERAR XML SOAP
────────────────────────────────────────────────────────────── */
function generarXmlSoap({ ruc_emisor, ruc, tipo, serie, numero, usuario, clave }) {
  const username = `${ruc_emisor}${usuario}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:ser="http://service.sunat.gob.pe"
                  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${username}</wsse:Username>
        <wsse:Password>${clave}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:getStatusCdr>
      <rucComprobante>${ruc}</rucComprobante>
      <tipoComprobante>${tipo}</tipoComprobante>
      <serieComprobante>${serie}</serieComprobante>
      <numeroComprobante>${numero}</numeroComprobante>
    </ser:getStatusCdr>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/* ──────────────────────────────────────────────────────────────
   3) ENVIAR SOAP (fetch con timeout)
────────────────────────────────────────────────────────────── */
async function enviarSoap(xml) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(SUNAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: xml,
      signal: controller.signal
    });

    return await resp.text();
  } finally {
    clearTimeout(timeout);
  }
}

/* ──────────────────────────────────────────────────────────────
   4) PARSEAR RESPUESTA SOAP Y DETECTAR FAULT
────────────────────────────────────────────────────────────── */
function analizarRespuestaSoap(soapText) {
  const doc = new DOMParser().parseFromString(soapText, 'text/xml');
  const select = xpath.useNamespaces({
    soap: 'http://schemas.xmlsoap.org/soap/envelope/',
    ns0: 'http://service.sunat.gob.pe'
  });

  // Buscar Fault
  const faultNode = select('//*[local-name()="Fault"]', doc)[0];
  if (faultNode) {
    const faultCode = (select('//*[local-name()="faultcode"]', doc)[0]?.textContent || '').trim();
    const faultMsg = (select('//*[local-name()="faultstring"]', doc)[0]?.textContent || '').trim();

    let userMessage = faultMsg || 'Error SOAP';
    if (faultCode.includes('0100')) userMessage = 'SUNAT está fuera de servicio. Intente más tarde.';
    if (faultCode.includes('1032')) userMessage = 'Credenciales SOL incorrectas.';

    return {
      fault: true,
      status: false,
      codigo: faultCode,
      mensaje: userMessage,
      detalle: faultMsg
    };
  }

  // Extraer statusCdr
  const statusCdrNode = select('//*[local-name()="statusCdr"]', doc)[0];
  if (!statusCdrNode) {
    return { fault: false, status: false, mensaje: 'No se encontró statusCdr en la respuesta SUNAT', detalle: soapText };
  }

  const statusCode = (select('.//*[local-name()="statusCode"]', statusCdrNode)[0]?.textContent || '').trim();
  const statusMessage = (select('.//*[local-name()="statusMessage"]', statusCdrNode)[0]?.textContent || '').trim();
  const contentNode = select('.//*[local-name()="content"]', statusCdrNode)[0];

  return {
    fault: false,
    status: true,
    statusCode,
    statusMessage,
    contentBase64: contentNode?.textContent?.trim() || null
  };
}

/* ──────────────────────────────────────────────────────────────
   5) EXTRAER XML DESDE ZIP BASE64
────────────────────────────────────────────────────────────── */
function extraerXmlDesdeZip(base64Zip) {
  const zipBuffer = Buffer.from(base64Zip, 'base64');
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  if (!entries || entries.length === 0) {
    throw new Error('ZIP está vacío');
  }

  const xmlEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.xml'));
  if (!xmlEntry) {
    throw new Error('No hay archivo XML dentro del ZIP');
  }

  return xmlEntry.getData().toString('utf8');
}

/* ──────────────────────────────────────────────────────────────
   6) EXTRAER MENSAJE <Description> DENTRO DEL CDR
────────────────────────────────────────────────────────────── */
function extraerDescripcionDelCdr(xmlCdr, defaultMsg = '') {
  try {
    const doc = new DOMParser().parseFromString(xmlCdr, 'text/xml');
    const node = xpath.select('//*[local-name()="Description"]', doc)[0];
    return node?.textContent?.trim() || defaultMsg;
  } catch {
    return defaultMsg;
  }
}


module.exports = { obtenerCdrDesdeSunat };
