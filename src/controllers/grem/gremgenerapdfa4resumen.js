const {
  PDFDocument,
  StandardFonts,
  rgb,
} = require('pdf-lib');

const QRCode = require('qrcode');

/*
 * ============================================================
 * PALETA / TOKENS DE DISEÑO (mismos tokens que la versión
 * descriptiva, para mantener identidad visual consistente)
 * ============================================================
 */

const PALETTE = {
  primary: rgb(0.09, 0.22, 0.48),
  primarySoft: rgb(0.90, 0.94, 1.0),
  accent: rgb(0.86, 0.47, 0.09),
  ink: rgb(0.14, 0.15, 0.18),
  gray600: rgb(0.42, 0.43, 0.47),
  gray300: rgb(0.80, 0.81, 0.84),
  gray100: rgb(0.95, 0.955, 0.965),
  zebra: rgb(0.975, 0.98, 0.99),
  white: rgb(1, 1, 1),
};

/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

const texto = (valor, defecto = '') => {
  const resultado = (valor ?? '')
    .toString()
    .trim();

  return resultado || defecto;
};

const primero = (...valores) => {
  for (const valor of valores) {
    if (
      valor !== undefined &&
      valor !== null &&
      texto(valor)
    ) {
      return valor;
    }
  }

  return '';
};

const formatearTipoDocumento = (tipo) => {
  const codigo = texto(tipo);

  switch (codigo) {
    case '1':
    case '01':
      return 'DNI';

    case '6':
    case '06':
      return 'RUC';

    case '4':
    case '04':
      return 'CE';

    case '7':
    case '07':
      return 'PAS';

    default:
      return codigo ? `DOC ${codigo}` : 'DOC';
  }
};

const formatearFecha = (valor) => {
  const fecha = texto(valor);

  if (!fecha) {
    return '-';
  }

  const partes = fecha.substring(0, 10).split('-');

  if (partes.length !== 3) {
    return fecha;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
};

const formatearHora = (valor) => {
  const hora = texto(valor);

  return hora ? hora.substring(0, 8) : '-';
};

const formatearNumero = (valor, decimales = 3) => {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return '0';
  }

  return numero.toFixed(decimales);
};

/*
 * Referencia interna de la encomienda:
 * r_periodo, r_cod, r_serie, r_numero, elemento
 */
const referenciaEncomienda = (detalle = {}) => {
  const referencia = [
    texto(detalle.r_cod),
    texto(detalle.r_serie),
    texto(detalle.r_numero),
  ]
    .filter(Boolean)
    .join('-');

  return referencia || '-';
};

const textoDocumentoPersona = (
  tipoDocumento,
  numeroDocumento
) => {
  const numero = texto(numeroDocumento);

  if (!numero) {
    return '-';
  }

  return `${formatearTipoDocumento(tipoDocumento)} ${numero}`;
};

/*
 * Recorta un texto a una sola línea que quepa en maxWidth,
 * agregando "..." si no entra completo. Pensado para la
 * versión resumida (sin wrap multilínea).
 */
const truncarTexto = (
  text,
  font,
  fontSize,
  maxWidth
) => {
  const contenido = texto(text, '-');

  if (
    font.widthOfTextAtSize(contenido, fontSize) <=
    maxWidth
  ) {
    return contenido;
  }

  const elipsis = '...';

  let recorte = contenido;

  while (
    recorte.length > 0 &&
    font.widthOfTextAtSize(
      recorte + elipsis,
      fontSize
    ) > maxWidth
  ) {
    recorte = recorte.slice(0, -1);
  }

  return recorte.length > 0
    ? `${recorte}${elipsis}`
    : elipsis;
};

/*
 * ============================================================
 * GENERADOR PRINCIPAL — VERSIÓN RESUMIDA
 * ============================================================
 */

const gremgenerapdfa4resumen = async (
  logo,
  sJson = {},
  digestvalue = '-'
) => {
  const pdfDoc = await PDFDocument.create();

  const font = await pdfDoc.embedFont(
    StandardFonts.Helvetica
  );

  const fontNegrita = await pdfDoc.embedFont(
    StandardFonts.HelveticaBold
  );

  const empresa = sJson.empresa || {};
  const guia = sJson.guia || {};

  const detalles = Array.isArray(sJson.detalles)
    ? sJson.detalles
    : [];

  if (detalles.length === 0) {
    throw new Error(
      'La GREM consolidada debe tener al menos una encomienda.'
    );
  }

  const codigo = texto(
    primero(guia.cod, guia.codigo),
    '31'
  );

  const serie = texto(guia.serie);
  const numero = texto(guia.numero);

  const rucEmpresa = texto(empresa.documento_id);
  const razonSocial = texto(empresa.razon_social);
  const domicilioFiscal = texto(empresa.direccion);

  /*
   * A4
   */
  const width = 595.28;
  const height = 841.89;

  const marginLeft = 38;
  const marginRight = 38;
  const marginTop = 32;
  const marginBottom = 48;

  const contentWidth = width - marginLeft - marginRight;

  const logoImagen = await cargarLogo(pdfDoc, logo);

  const contexto = {
    pdfDoc,
    font,
    fontNegrita,

    guia,

    codigo,
    serie,
    numero,

    rucEmpresa,
    razonSocial,
    domicilioFiscal,

    width,
    height,

    marginLeft,
    marginTop,

    contentWidth,

    logoImagen,

    totalEncomiendas: detalles.length,

    cantidadRemitentes:
      Number(guia.cantidad_remitentes) ||
      detalles.length,
  };

  let { page, y } = crearPagina(contexto);

  /*
   * ========================================================
   * TABLA COMPACTA DE ENCOMIENDAS — 2 LÍNEAS C/U
   * ========================================================
   */

  const alturaFila = 24;

  for (
    let index = 0;
    index < detalles.length;
    index += 1
  ) {
    const detalle = detalles[index] || {};

    if (y - alturaFila < marginBottom + 15) {
      ({ page, y } = crearPagina(contexto));
    }

    y = dibujarFilaEncomienda({
      page,
      detalle,
      index,
      y,
      alturaFila,

      font,
      fontNegrita,

      marginLeft,
      contentWidth,
    });
  }

  /*
   * ========================================================
   * QR + HASH (compacto)
   * ========================================================
   */

  const hash = texto(digestvalue, '-');

  const qrData =
    hash === '-'
      ? [rucEmpresa, codigo, serie, numero].join('|')
      : hash;

  const espacioQr = 74;

  if (y - espacioQr < marginBottom) {
    ({ page, y } = crearPagina(contexto));
  }

  await dibujarQrYHash({
    pdfDoc,
    page,
    y,

    qrData,
    hash,

    font,
    fontNegrita,

    marginLeft,
    contentWidth,
  });

  dibujarFooter({
    pdfDoc,
    font,
    width,
    marginLeft,
    marginRight,
  });

  const pdfBytes = await pdfDoc.save();

  return {
    estado: true,
    buffer_pdf: pdfBytes,
  };
};

/*
 * ============================================================
 * CREAR PÁGINA
 * ============================================================
 */

function crearPagina(contexto) {
  const {
    pdfDoc,
    font,
    fontNegrita,

    guia,

    serie,
    numero,

    rucEmpresa,
    razonSocial,
    domicilioFiscal,

    width,
    height,

    marginLeft,
    marginTop,

    contentWidth,

    logoImagen,

    totalEncomiendas,
    cantidadRemitentes,
  } = contexto;

  const page = pdfDoc.addPage([width, height]);

  let y = height - marginTop;

  /*
   * LOGO Y EMPRESA
   */

  const logoBoxSize = 34;

  if (logoImagen) {
    const escala = Math.min(
      logoBoxSize / logoImagen.width,
      logoBoxSize / logoImagen.height
    );

    page.drawImage(logoImagen, {
      x: marginLeft,
      y: y - logoImagen.height * escala,
      width: logoImagen.width * escala,
      height: logoImagen.height * escala,
    });
  }

  const xEmpresa = marginLeft + logoBoxSize + 8;

  page.drawText(razonSocial || '-', {
    x: xEmpresa,
    y: y - 6,
    size: 9.5,
    font: fontNegrita,
    color: PALETTE.ink,
  });

  page.drawText(
    `RUC ${rucEmpresa || '-'}  ·  ${texto(domicilioFiscal, '-')}`,
    {
      x: xEmpresa,
      y: y - 18,
      size: 7,
      font,
      color: PALETTE.gray600,
    }
  );

  y -= 38;

  /*
   * BANNER DE TÍTULO (compacto, una sola franja)
   */

  const bannerHeight = 30;

  page.drawRectangle({
    x: marginLeft,
    y: y - bannerHeight,
    width: contentWidth,
    height: bannerHeight,
    color: PALETTE.primary,
  });

  page.drawRectangle({
    x: marginLeft,
    y: y - bannerHeight,
    width: 4,
    height: bannerHeight,
    color: PALETTE.accent,
  });

  dibujarTextoCentrado(
    page,
    'GUÍA DE REMISIÓN ELECTRÓNICA TRANSPORTISTA — RESUMEN',
    fontNegrita,
    9.5,
    width,
    y - 13,
    PALETTE.white
  );

  dibujarTextoCentrado(
    page,
    `${serie || '-'}-${numero || '-'}  ·  CARGA CONSOLIDADA`,
    fontNegrita,
    8,
    width,
    y - 25,
    rgb(0.85, 0.90, 1.0)
  );

  y -= bannerHeight + 8;

  /*
   * FRANJA DE DATOS BÁSICOS SUNAT (una sola línea, 2 columnas)
   */

  const mitad = contentWidth / 2;

  page.drawRectangle({
    x: marginLeft,
    y: y - 30,
    width: contentWidth,
    height: 30,
    color: PALETTE.gray100,
    borderColor: PALETTE.gray300,
    borderWidth: 0.5,
  });

  const placa = texto(guia.vehiculo_placa);

  const conductor = [
    texto(guia.conductor_nombres),
    texto(guia.conductor_apellidos),
  ]
    .filter(Boolean)
    .join(' ');

  let yA = dibujarCampoLinea({
    page,
    label: 'Placa:',
    value: placa,
    x: marginLeft + 6,
    y: y - 11,
    font,
    fontNegrita,
  });

  dibujarCampoLinea({
    page,
    label: 'Conductor:',
    value: conductor,
    x: marginLeft + 6,
    y: y - 23,
    font,
    fontNegrita,
  });

  dibujarCampoLinea({
    page,
    label: 'Traslado:',
    value: formatearFecha(guia.fecha_traslado),
    x: marginLeft + mitad + 6,
    y: y - 11,
    font,
    fontNegrita,
  });

  dibujarCampoLinea({
    page,
    label: 'Ruta:',
    value: `${texto(guia.partida_ubigeo, '-')} → ${texto(guia.llegada_ubigeo, '-')}`,
    x: marginLeft + mitad + 6,
    y: y - 23,
    font,
    fontNegrita,
  });

  y -= 38;

  /*
   * CHIPS DE RESUMEN (fila única, compacta)
   */

  const chips = [
    { label: 'ENCOMIENDAS', value: String(totalEncomiendas) },
    { label: 'REMITENTES', value: String(cantidadRemitentes) },
    { label: 'PESO TOTAL', value: `${formatearNumero(guia.peso_total, 2)} KG` },
    {
      label: 'BULTOS',
      value: String(primero(guia.numero_bultos, totalEncomiendas)),
    },
  ];

  y = dibujarChipsResumen({
    page,
    chips,
    x: marginLeft,
    y,
    width: contentWidth,
    fontNegrita,
  });

  y -= 8;

  /*
   * CABECERA DE TABLA
   */

  const alturaCabeceraTabla = 16;

  page.drawRectangle({
    x: marginLeft,
    y: y - alturaCabeceraTabla,
    width: contentWidth,
    height: alturaCabeceraTabla,
    color: PALETTE.primary,
  });

  const colItem = marginLeft + 6;
  const colDescripcion = marginLeft + 30;
  const colRemitente = marginLeft + contentWidth * 0.46;
  const colDestinatario = marginLeft + contentWidth * 0.73;

  const yCabecera = y - 11;

  page.drawText('N°', {
    x: colItem,
    y: yCabecera,
    size: 7,
    font: fontNegrita,
    color: PALETTE.white,
  });

  page.drawText('DESCRIPCIÓN / REF.', {
    x: colDescripcion,
    y: yCabecera,
    size: 7,
    font: fontNegrita,
    color: PALETTE.white,
  });

  page.drawText('REMITENTE (DNI/RUC)', {
    x: colRemitente,
    y: yCabecera,
    size: 7,
    font: fontNegrita,
    color: PALETTE.white,
  });

  page.drawText('DESTINATARIO (DNI/RUC)', {
    x: colDestinatario,
    y: yCabecera,
    size: 7,
    font: fontNegrita,
    color: PALETTE.white,
  });

  return {
    page,
    y: y - alturaCabeceraTabla,

    columnas: {
      colItem,
      colDescripcion,
      colRemitente,
      colDestinatario,
    },
  };
}

/*
 * ============================================================
 * CAMPO EN UNA SOLA LÍNEA (label + valor, sin wrap)
 * ============================================================
 */

function dibujarCampoLinea({
  page,
  label,
  value,
  x,
  y,
  font,
  fontNegrita,
}) {
  const etiqueta = texto(label);
  const contenido = texto(value, '-');

  const labelWidth = fontNegrita.widthOfTextAtSize(
    etiqueta,
    7.2
  );

  page.drawText(etiqueta, {
    x,
    y,
    size: 7.2,
    font: fontNegrita,
    color: PALETTE.gray600,
  });

  page.drawText(contenido, {
    x: x + labelWidth + 3,
    y,
    size: 7.2,
    font,
    color: PALETTE.ink,
  });

  return y;
}

/*
 * ============================================================
 * CHIPS DE RESUMEN
 * ============================================================
 */

function dibujarChipsResumen({
  page,
  chips,
  x,
  y,
  width,
  fontNegrita,
}) {
  const chipHeight = 26;
  const gap = 6;
  const chipWidth =
    (width - gap * (chips.length - 1)) / chips.length;

  chips.forEach((chip, index) => {
    const chipX = x + index * (chipWidth + gap);

    page.drawRectangle({
      x: chipX,
      y: y - chipHeight,
      width: chipWidth,
      height: chipHeight,
      color: PALETTE.gray100,
      borderColor: PALETTE.gray300,
      borderWidth: 0.5,
    });

    page.drawRectangle({
      x: chipX,
      y: y - 2,
      width: chipWidth,
      height: 2,
      color: PALETTE.accent,
    });

    dibujarTextoCentrado(
      page,
      chip.label,
      fontNegrita,
      6,
      chipWidth,
      y - 11,
      PALETTE.gray600,
      chipX
    );

    dibujarTextoCentrado(
      page,
      chip.value,
      fontNegrita,
      10,
      chipWidth,
      y - 21,
      PALETTE.primary,
      chipX
    );
  });

  return y - chipHeight;
}

/*
 * ============================================================
 * FILA DE ENCOMIENDA — 2 LÍNEAS, SOLO DATOS BÁSICOS SUNAT
 * (N°, descripción, referencia, remitente doc+nombre,
 *  destinatario doc+nombre — SIN teléfono ni dirección)
 * ============================================================
 */

function dibujarFilaEncomienda({
  page,
  detalle,
  index,
  y,
  alturaFila,

  font,
  fontNegrita,

  marginLeft,
  contentWidth,
}) {
  const top = y - alturaFila;

  page.drawRectangle({
    x: marginLeft,
    y: top,
    width: contentWidth,
    height: alturaFila,
    color: index % 2 === 0 ? PALETTE.zebra : PALETTE.white,
    borderColor: PALETTE.gray300,
    borderWidth: 0.4,
  });

  page.drawRectangle({
    x: marginLeft,
    y: top,
    width: 2,
    height: alturaFila,
    color: PALETTE.accent,
  });

  const colItem = marginLeft + 6;
  const colDescripcion = marginLeft + 30;
  const colRemitente = marginLeft + contentWidth * 0.46;
  const colDestinatario = marginLeft + contentWidth * 0.73;

  const anchoDescripcion =
    colRemitente - colDescripcion - 6;

  const anchoRemitente =
    colDestinatario - colRemitente - 6;

  const anchoDestinatario =
    marginLeft + contentWidth - colDestinatario - 4;

  const item = primero(detalle.item, index + 1);
  const referencia = referenciaEncomienda(detalle);

  const docRemitente = textoDocumentoPersona(
    detalle.cliente_id_doc,
    detalle.cliente_documento_id
  );

  const docDestinatario = textoDocumentoPersona(
    detalle.destinatario_id_doc,
    detalle.destinatario_documento_id
  );

  /*
   * LÍNEA 1: N° / Descripción / Remitente (documento + nombre) / Destinatario (documento + nombre)
   */

  const yLinea1 = top + alturaFila - 10;

  page.drawText(String(item), {
    x: colItem,
    y: yLinea1,
    size: 7.6,
    font: fontNegrita,
    color: PALETTE.primary,
  });

  page.drawText(
    truncarTexto(
      texto(detalle.descripcion, 'ENCOMIENDA'),
      font,
      7.4,
      anchoDescripcion
    ),
    {
      x: colDescripcion,
      y: yLinea1,
      size: 7.4,
      font: fontNegrita,
      color: PALETTE.ink,
    }
  );

  page.drawText(
    truncarTexto(
      `${docRemitente}  ${texto(detalle.cliente, '-')}`,
      font,
      7.2,
      anchoRemitente
    ),
    {
      x: colRemitente,
      y: yLinea1,
      size: 7.2,
      font,
      color: PALETTE.ink,
    }
  );

  page.drawText(
    truncarTexto(
      `${docDestinatario}  ${texto(detalle.destinatario, '-')}`,
      font,
      7.2,
      anchoDestinatario
    ),
    {
      x: colDestinatario,
      y: yLinea1,
      size: 7.2,
      font,
      color: PALETTE.ink,
    }
  );

  /*
   * LÍNEA 2: Referencia de la encomienda (r_cod-r_serie-r_numero)
   */

  const yLinea2 = top + alturaFila - 20;

  page.drawText(`Ref: ${referencia}`, {
    x: colDescripcion,
    y: yLinea2,
    size: 6.4,
    font,
    color: PALETTE.gray600,
  });

  return top - 3;
}

/*
 * ============================================================
 * QR Y HASH (compacto)
 * ============================================================
 */

async function dibujarQrYHash({
  pdfDoc,
  page,
  y,

  qrData,
  hash,

  font,
  fontNegrita,

  marginLeft,
  contentWidth,
}) {
  const qrImagen = await QRCode.toDataURL(qrData, {
    margin: 0,
    color: { dark: '#17325c', light: '#ffffff' },
  });

  const qrBuffer = Buffer.from(
    qrImagen.split(',')[1],
    'base64'
  );

  const qrEmbed = await pdfDoc.embedPng(qrBuffer);

  const cardHeight = 60;
  const qrSize = 46;

  page.drawRectangle({
    x: marginLeft,
    y: y - cardHeight,
    width: contentWidth,
    height: cardHeight,
    color: PALETTE.gray100,
    borderColor: PALETTE.gray300,
    borderWidth: 0.5,
  });

  page.drawRectangle({
    x: marginLeft,
    y: y - cardHeight,
    width: 3,
    height: cardHeight,
    color: PALETTE.primary,
  });

  page.drawImage(qrEmbed, {
    x: marginLeft + 10,
    y: y - cardHeight + (cardHeight - qrSize) / 2,
    width: qrSize,
    height: qrSize,
  });

  const xTexto = marginLeft + qrSize + 22;

  page.drawText('Código hash / valor de digest:', {
    x: xTexto,
    y: y - 16,
    size: 6.8,
    font: fontNegrita,
    color: PALETTE.gray600,
  });

  page.drawText(
    truncarTexto(hash, font, 7, contentWidth - qrSize - 34),
    {
      x: xTexto,
      y: y - 28,
      size: 7,
      font,
      color: PALETTE.ink,
    }
  );

  page.drawText(
    'Representación impresa - Guía de Remisión Electrónica Transportista (Resumen)',
    {
      x: xTexto,
      y: y - cardHeight + 12,
      size: 6.2,
      font,
      color: PALETTE.gray600,
    }
  );
}

/*
 * ============================================================
 * FOOTER
 * ============================================================
 */

function dibujarFooter({
  pdfDoc,
  font,
  width,
  marginLeft,
  marginRight,
}) {
  const paginas = pdfDoc.getPages();

  paginas.forEach((pagina, index) => {
    pagina.drawLine({
      start: { x: marginLeft, y: 28 },
      end: { x: width - marginRight, y: 28 },
      thickness: 0.5,
      color: PALETTE.gray300,
    });

    pagina.drawText(
      'GRE Transportista - Resumen de carga consolidada',
      {
        x: marginLeft,
        y: 17,
        size: 6.2,
        font,
        color: PALETTE.gray600,
      }
    );

    const numeroPagina = `Página ${index + 1} de ${paginas.length}`;
    const anchoTexto = font.widthOfTextAtSize(numeroPagina, 6.6);

    pagina.drawText(numeroPagina, {
      x: width - marginRight - anchoTexto,
      y: 17,
      size: 6.6,
      font,
      color: PALETTE.gray600,
    });
  });
}

/*
 * ============================================================
 * LOGO
 * ============================================================
 */

async function cargarLogo(pdfDoc, logo) {
  if (!logo) {
    return null;
  }

  try {
    const buffer = Buffer.isBuffer(logo)
      ? logo
      : Buffer.from(logo);

    try {
      return await pdfDoc.embedPng(buffer);
    } catch (_) {
      return await pdfDoc.embedJpg(buffer);
    }
  } catch (error) {
    console.warn(
      'No se pudo cargar el logo para la GREM resumen:',
      error.message
    );

    return null;
  }
}

/*
 * ============================================================
 * TEXTO CENTRADO
 * ============================================================
 */

function dibujarTextoCentrado(
  page,
  text,
  font,
  size,
  boxWidth,
  y,
  color = rgb(0, 0, 0),
  offsetX = 0
) {
  const contenido = texto(text);
  const ancho = font.widthOfTextAtSize(contenido, size);

  page.drawText(contenido, {
    x: offsetX + (boxWidth - ancho) / 2,
    y,
    size,
    font,
    color,
  });
}

module.exports = gremgenerapdfa4resumen;