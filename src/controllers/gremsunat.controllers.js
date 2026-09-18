const gremgeneraxml = require('./grem/gremgeneraxml');
const gremgenerapdf = require('./grem/gremgenerapdf');
const gremgenerapdfa4 = require('./grem/gremgenerapdfa4');
const gremgenerapdfa4consolidada = require('./grem/gremgenerapdfa4consolidada');

const { subirArchivoDesdeMemoria } = require('./cpe/cpeuploader');
const pool = require('../db');
const { XmlSignatureMod } = require('../utils/xmlsignaturemod.utils');

const crypto = require('crypto');
const yazl = require('yazl');
const crc32 = require('crc-32');
const { DOMParser } = require('xmldom');
const xpath = require('xpath');
const AdmZip = require('adm-zip');
const fetch = require('node-fetch');

require('dotenv').config();

const texto = (valor) => (valor ?? '').toString().trim();

const codigoGrem = (data = {}) =>
  texto(data.guia?.cod || data.guia?.codigo || '31');

const rucEmpresa = (data = {}) =>
  texto(data.empresa?.documento_id || data.empresa?.ruc);

const validarGrem = (data = {}) => {
  const ruc = rucEmpresa(data);
  const cod = codigoGrem(data);
  const serie = texto(data.guia?.serie);
  const numero = texto(data.guia?.numero);
  const detalles = Array.isArray(data.detalles) ? data.detalles : [];

  const faltantes = [];

  if (!ruc) faltantes.push('empresa.documento_id');
  if (!serie) faltantes.push('guia.serie');
  if (!numero) faltantes.push('guia.numero');
  if (detalles.length === 0) faltantes.push('detalles');

  if (faltantes.length > 0) {
    const error = new Error(
      `Faltan datos mínimos GREM: ${faltantes.join(', ')}`
    );

    error.statusCode = 400;
    throw error;
  }

  return {
    ruc,
    cod,
    serie,
    numero,
    detalles,
  };
};

const canonicalizarManual = (xmlStr) =>
  xmlStr
    .replace(/(\r\n|\n|\r)/g, '')
    .replace(/\t/g, '')
    .replace(/>\s+</g, '><')
    .trim();

const obtenerDigestValue = (xmlFirmado) => {
  const doc = new DOMParser().parseFromString(
    xmlFirmado,
    'text/xml'
  );

  const select = xpath.useNamespaces({
    ds: 'http://www.w3.org/2000/09/xmldsig#',
  });

  const digestNode = select(
    '//*[local-name()="DigestValue"]',
    doc
  )[0];

  if (!digestNode) {
    throw new Error(
      'No se encontró DigestValue en el XML firmado.'
    );
  }

  return digestNode.textContent.trim();
};

const obtenerDocumentDescription = (xmlFirmado) => {
  const doc = new DOMParser().parseFromString(
    xmlFirmado,
    'text/xml'
  );

  const node = xpath.select(
    "//*[local-name()='DocumentDescription']",
    doc
  )[0];

  if (!node) return '-';

  return texto(node.textContent) || '-';
};

const obtenerTokenSunatGrem = async (ruc) => {
  const { rows } = await pool.query(
    `
      SELECT
        secundario_user,
        secundario_passwd,
        gre_credencial,
        gre_password
      FROM api_usuariocertificado
      WHERE documento_id = $1
    `,
    [ruc]
  );

  if (!rows[0]) {
    throw new Error(
      `No existe configuración GRE para RUC ${ruc}`
    );
  }

  const {
    secundario_user: usuarioSol,
    secundario_passwd: passwordSol,
    gre_credencial: clientId,
    gre_password: clientSecret,
  } = rows[0];

  const params = new URLSearchParams();

  params.append('grant_type', 'password');
  params.append(
    'scope',
    'https://api-cpe.sunat.gob.pe'
  );
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('username', `${ruc}${usuarioSol}`);
  params.append('password', passwordSol);

  const response = await fetch(
    `https://api-seguridad.sunat.gob.pe/v1/clientessol/${clientId}/oauth2/token/`,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: params,
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `Error obteniendo token SUNAT: ${response.status} - ${errorBody}`
    );
  }

  return response.json();
};

const crearZipBuffer = (
  nombreArchivoXml,
  xmlBuffer
) =>
  new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    const buffers = [];

    zipfile.addBuffer(
      xmlBuffer,
      nombreArchivoXml,
      {
        compress: true,
        mtime: new Date('2000-01-01T00:00:00Z'),
        crc32: crc32.buf(xmlBuffer) >>> 0,
        uncompressedSize: xmlBuffer.length,
      }
    );

    zipfile.outputStream.on(
      'data',
      (data) => buffers.push(data)
    );

    zipfile.outputStream.on(
      'end',
      () => resolve(Buffer.concat(buffers))
    );

    zipfile.outputStream.on('error', reject);

    zipfile.end();
  });

const prepararZipYHash = async (
  ruc,
  cod,
  serie,
  numero,
  xmlFirmado
) => {
  const nombreArchivoXml =
    `${ruc}-${cod}-${serie}-${numero}.xml`;

  const nombreArchivoZip =
    `${ruc}-${cod}-${serie}-${numero}.zip`;

  const xmlBuffer = Buffer.from(
    xmlFirmado,
    'utf8'
  );

  const zipBuffer = await crearZipBuffer(
    nombreArchivoXml,
    xmlBuffer
  );

  return {
    nombreArchivoZip,
    arcGreZip64: zipBuffer.toString('base64'),

    hashZip: crypto
      .createHash('sha256')
      .update(zipBuffer)
      .digest('hex'),
  };
};

const enviarGremSunat = async (
  token,
  ruc,
  cod,
  serie,
  numero,
  xmlFirmado
) => {
  const {
    nombreArchivoZip,
    arcGreZip64,
    hashZip,
  } = await prepararZipYHash(
    ruc,
    cod,
    serie,
    numero,
    xmlFirmado
  );

  const response = await fetch(
    `https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/${ruc}-${cod}-${serie}-${numero}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        archivo: {
          nomArchivo: nombreArchivoZip,
          arcGreZip: arcGreZip64,
          hashZip,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `Error enviando GREM a SUNAT: ${response.status} - ${errorBody}`
    );
  }

  return response.json();
};

const consultarTicketDB = async (
  ruc,
  cod,
  serie,
  numero
) => {
  const { rows } = await pool.query(
    `
      SELECT
        gre_ticket,
        gre_digestvalue
      FROM api_usuarioticket
      WHERE documento_id = $1
        AND codigo = $2
        AND serie = $3
        AND numero = $4
    `,
    [ruc, cod, serie, numero]
  );

  return rows;
};

const registrarTicketDB = async ({
  ruc,
  cod,
  serie,
  numero,
  ticket,
  digestvalue,
}) => {
  await pool.query(
    `
      INSERT INTO api_usuarioticket
        (
          documento_id,
          codigo,
          serie,
          numero,
          gre_ticket,
          gre_digestvalue
        )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      ruc,
      cod,
      serie,
      numero,
      ticket,
      digestvalue,
    ]
  );
};

const eliminarTicketDB = async ({
  ruc,
  cod,
  serie,
  numero,
}) => {
  await pool.query(
    `
      DELETE FROM api_usuarioticket
      WHERE documento_id = $1
        AND codigo = $2
        AND serie = $3
        AND numero = $4
    `,
    [ruc, cod, serie, numero]
  );
};

const generarPdfGrem = async (
  formato,
  dataGrem,
  digestInicial = '-'
) => {
  
  console.log('antes de validarGrem: ',dataGrem);

  const {
    ruc,
    cod,
    serie,
    numero,
  } = validarGrem(dataGrem);

  const { rows } = await pool.query(
    `
      SELECT logo
      FROM api_usuariocertificado
      WHERE documento_id = $1
    `,
    [ruc]
  );

  const logoBuffer = rows[0]?.logo || null;

  console.log('antes del gremgenerapdfa4consolidada');

  const resultadoPdf =
    formato === 'A4'
      ? await gremgenerapdfa4consolidada(
          logoBuffer,
          dataGrem,
          digestInicial
        )
      : await gremgenerapdf(
          '80mm',
          logoBuffer,
          dataGrem,
          digestInicial
        );
  
  console.log('despues del gremgenerapdfa4consolidada');

  if (
    !resultadoPdf?.estado ||
    !resultadoPdf?.buffer_pdf
  ) {
    throw new Error(
      'El generador PDF GREM no devolvió un PDF válido.'
    );
  }

  await subirArchivoDesdeMemoria(
    ruc,
    cod,
    serie,
    numero,
    resultadoPdf.buffer_pdf,
    'PDF'
  );

  const server = process.env.CPE_HOST;

  return (
    `http://${server}:8080/descargas/` +
    `${ruc}/${ruc}-${cod}-${serie}-${numero}.pdf`
  );
};

const generarGREMPrevioPDF = async (
  req,
  res
) => {
  try {
    const dataGrem = req.body || {};

    const {
      cod,
      serie,
      numero,
    } = validarGrem(dataGrem);

    const rutaPdf = await generarPdfGrem(
      '80mm',
      dataGrem,
      '-'
    );

    return res.status(200).json({
      success: true,
      titulo_usuario: 'PDF generado',

      mensaje_usuario:
        'PDF previo de GREM generado correctamente. ' +
        'No se envió a SUNAT.',

      respuesta_sunat_descripcion:
        'PDF generado localmente',

      ruta_xml: null,
      ruta_cdr: null,
      ruta_pdf: rutaPdf,
      codigo_hash: null,
      grem_cod: cod,
      grem_serie: serie,
      grem_numero: numero,
    });
  } catch (error) {
    console.error(
      'Error generando PDF previo GREM:',
      error
    );

    return res
      .status(error.statusCode || 500)
      .json({
        success: false,

        respuesta_sunat_descripcion:
          error.message,

        mensaje_usuario:
          error.message ||
          'No se pudo generar el PDF de la GREM.',

        ruta_pdf: 'error',
      });
  }
};

const generarGREMPrevioPDFA4 = async (
  req,
  res
) => {
  try {
    const dataGrem = req.body || {};

    const {
      cod,
      serie,
      numero,
    } = validarGrem(dataGrem);

    console.log('antes de generarPdfGrem: ',dataGrem);

    const rutaPdf = await generarPdfGrem(
      'A4',
      dataGrem,
      '-'
    );

    return res.status(200).json({
      success: true,
      titulo_usuario: 'PDF A4 generado',

      mensaje_usuario:
        'PDF A4 previo de GREM generado correctamente. ' +
        'No se envió a SUNAT.',

      respuesta_sunat_descripcion:
        'PDF generado localmente',

      ruta_pdf: rutaPdf,
      grem_cod: cod,
      grem_serie: serie,
      grem_numero: numero,
    });
  } catch (error) {
    console.error(
      'Error generando PDF A4 previo GREM:',
      error
    );

    return res
      .status(error.statusCode || 500)
      .json({
        success: false,

        respuesta_sunat_descripcion:
          error.message,

        mensaje_usuario:
          error.message ||
          'No se pudo generar el PDF A4 de la GREM.',

        ruta_pdf: 'error',
      });
  }
};

const generarTicketGremSunat = async (
  dataGrem
) => {
  const {
    ruc,
    cod,
    serie,
    numero,
  } = validarGrem(dataGrem);

  const existente = await consultarTicketDB(
    ruc,
    cod,
    serie,
    numero
  );

  if (existente.length > 0) {
    return {
      ticket: existente[0].gre_ticket,
      digestvalue:
        existente[0].gre_digestvalue,
    };
  }

  const tokenData =
    await obtenerTokenSunatGrem(ruc);

  let xml = await gremgeneraxml(dataGrem);
  xml = canonicalizarManual(xml);

  const { rows } = await pool.query(
    `
      SELECT
        certificado,
        password
      FROM api_usuariocertificado
      WHERE documento_id = $1
    `,
    [ruc]
  );

  if (!rows[0]?.certificado) {
    throw new Error(
      `No existe certificado para RUC ${ruc}`
    );
  }

  const signer = new XmlSignatureMod(
    rows[0].certificado,
    rows[0].password,
    xml
  );

  signer.setSignNodeName('DespatchAdvice');

  const xmlFirmado =
    await signer.getSignedXML();

  const digestvalue =
    obtenerDigestValue(xmlFirmado);

  await subirArchivoDesdeMemoria(
    ruc,
    cod,
    serie,
    numero,
    xmlFirmado,
    '-'
  );

  const resultado = await enviarGremSunat(
    tokenData.access_token,
    ruc,
    cod,
    serie,
    numero,
    xmlFirmado
  );

  const ticket = texto(resultado.numTicket);

  if (!ticket) {
    throw new Error(
      'SUNAT no devolvió ticket para la GREM.'
    );
  }

  await registrarTicketDB({
    ruc,
    cod,
    serie,
    numero,
    ticket,
    digestvalue,
  });

  return {
    ticket,
    digestvalue,
  };
};

const extraerCDRDesdeBase64String = (
  base64Zip
) => {
  const zipBuffer = Buffer.from(
    base64Zip,
    'base64'
  );

  const zip = new AdmZip(zipBuffer);

  const entry = zip
    .getEntries()
    .find((item) =>
      item.entryName
        .toLowerCase()
        .endsWith('.xml')
    );

  return entry
    ? zip.readAsText(entry, 'utf8')
    : null;
};

const descargarGremSunatCDR = async ({
  ruc,
  ticket,
  cod,
  serie,
  numero,
  dataGrem,
}) => {
  const tokenData =
    await obtenerTokenSunatGrem(ruc);

  const response = await fetch(
    `https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/envios/${ticket}`,
    {
      headers: {
        Authorization:
          `Bearer ${tokenData.access_token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Error consultando ticket GREM: ` +
      `HTTP ${response.status}`
    );
  }

  const data = await response.json();

  const codRespuesta = String(
    data.codRespuesta || ''
  );

  const indCdrGenerado = String(
    data.indCdrGenerado || '0'
  );

  if (codRespuesta === '98') {
    return {
      estado: 'EN_PROCESO',
    };
  }

  if (codRespuesta === '99') {
    await eliminarTicketDB({
      ruc,
      cod,
      serie,
      numero,
    });
  }

  if (
    ['0', '99'].includes(codRespuesta) &&
    indCdrGenerado === '1' &&
    data.arcCdr
  ) {
    const cdrXml =
      extraerCDRDesdeBase64String(data.arcCdr);

    if (cdrXml) {
      await subirArchivoDesdeMemoria(
        ruc,
        cod,
        serie,
        numero,
        cdrXml,
        'R'
      );

      const documentDescription =
        obtenerDocumentDescription(cdrXml);

      if (codRespuesta === '0') {
        await generarPdfGrem(
          '80mm',
          dataGrem,
          documentDescription
        );
      }
    }
  }

  if (codRespuesta === '0') {
    return {
      estado: 'OK',
    };
  }

  if (codRespuesta === '99') {
    return {
      estado: 'ERROR',
      error: data.error || null,

      descripcion:
        data.error?.desError ||
        'SUNAT rechazó la GREM',
    };
  }

  return {
    estado: 'DESCONOCIDO',
  };
};

const registrarGREMTransSunat = async (
  req,
  res
) => {
  try {
    const dataGrem = req.body || {};

    const {
      ruc,
      cod,
      serie,
      numero,
    } = validarGrem(dataGrem);

    const resultadoTicket =
      await generarTicketGremSunat(dataGrem);

    const resultadoSunat =
      await descargarGremSunatCDR({
        ruc,
        ticket: resultadoTicket.ticket,
        cod,
        serie,
        numero,
        dataGrem,
      });

    const server = process.env.CPE_HOST;

    const base =
      `http://${server}:8080/descargas/${ruc}`;

    if (resultadoSunat.estado === 'OK') {
      return res.status(200).json({
        success: true,

        respuesta_sunat_descripcion: 'OK',

        mensaje_usuario:
          'GREM aceptada por SUNAT.',

        ruta_xml:
          `${base}/${ruc}-${cod}-${serie}-${numero}.xml`,

        ruta_cdr:
          `${base}/R-${ruc}-${cod}-${serie}-${numero}.xml`,

        ruta_pdf:
          `${base}/${ruc}-${cod}-${serie}-${numero}.pdf`,

        codigo_hash:
          resultadoTicket.digestvalue,

        serie,
        numero,
      });
    }

    if (
      resultadoSunat.estado === 'EN_PROCESO'
    ) {
      return res.status(202).json({
        success: true,

        respuesta_sunat_descripcion:
          'EN_PROCESO',

        mensaje_usuario:
          'SUNAT recibió la GREM; ' +
          'el CDR aún está en proceso.',

        ruta_xml:
          `${base}/${ruc}-${cod}-${serie}-${numero}.xml`,

        ruta_cdr: null,
        ruta_pdf: null,

        codigo_hash:
          resultadoTicket.digestvalue,

        serie,
        numero,
      });
    }

    return res.status(400).json({
      success: false,

      respuesta_sunat_descripcion:
        resultadoSunat.descripcion ||
        resultadoSunat.estado,

      mensaje_usuario:
        resultadoSunat.descripcion ||
        'SUNAT no aceptó la GREM.',

      ruta_xml: 'error',
      ruta_cdr: 'error',
      ruta_pdf: 'error',
      codigo_hash: null,

      detalle_sunat:
        resultadoSunat.error || null,
    });
  } catch (error) {
    console.error(
      'Error procesando GREM Transportista:',
      error
    );

    return res
      .status(error.statusCode || 500)
      .json({
        success: false,

        respuesta_sunat_descripcion:
          error.message ||
          'ERROR interno GREM',

        mensaje_usuario:
          error.message ||
          'No se pudo procesar la GREM.',

        ruta_xml: null,
        ruta_cdr: null,
        ruta_pdf: null,
        codigo_hash: null,
      });
  }
};

module.exports = {
  registrarGREMTransSunat,
  generarGREMPrevioPDF,
  generarGREMPrevioPDFA4,
};