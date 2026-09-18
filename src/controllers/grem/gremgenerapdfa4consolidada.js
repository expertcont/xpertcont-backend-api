const {
  PDFDocument,
  StandardFonts,
  rgb,
} = require('pdf-lib');

const QRCode = require('qrcode');

/*
 * ============================================================
 * PALETA / TOKENS DE DISEÑO
 * ============================================================
 *
 * Un solo lugar para tocar colores y quede consistente en
 * toda la guía (cabecera, secciones, chips de resumen,
 * tarjetas de encomienda, footer).
 */

const PALETTE = {
  primary: rgb(0.09, 0.22, 0.48), // azul corporativo profundo
  primarySoft: rgb(0.90, 0.94, 1.0),
  accent: rgb(0.86, 0.47, 0.09), // naranja para acentos/resumen
  accentSoft: rgb(1.0, 0.95, 0.88),
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
      return codigo
        ? `DOC ${codigo}`
        : 'DOC';
  }
};

const formatearFecha = (valor) => {
  const fecha = texto(valor);

  if (!fecha) {
    return '-';
  }

  const partes = fecha
    .substring(0, 10)
    .split('-');

  if (partes.length !== 3) {
    return fecha;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
};

const formatearHora = (valor) => {
  const hora = texto(valor);

  if (!hora) {
    return '-';
  }

  return hora.substring(0, 8);
};

const formatearNumero = (
  valor,
  decimales = 3
) => {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return '0';
  }

  return numero.toFixed(decimales);
};

/*
 * Referencia interna/origen de la encomienda.
 *
 * La encomienda seleccionada está identificada por:
 * r_periodo, r_cod, r_serie, r_numero, elemento
 */
const referenciaEncomienda = (detalle = {}) => {
  const cod = texto(detalle.r_cod);
  const serie = texto(detalle.r_serie);
  const numero = texto(detalle.r_numero);

  const referencia = [
    cod,
    serie,
    numero,
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

  return `${formatearTipoDocumento(
    tipoDocumento
  )}: ${numero}`;
};

/*
 * ============================================================
 * GENERADOR PRINCIPAL
 * ============================================================
 */

const gremgenerapdfa4consolidada = async (
  logo,
  sJson = {},
  digestvalue = '-'
) => {
  const pdfDoc =
    await PDFDocument.create();

  const font =
    await pdfDoc.embedFont(
      StandardFonts.Helvetica
    );

  const fontNegrita =
    await pdfDoc.embedFont(
      StandardFonts.HelveticaBold
    );

  const empresa =
    sJson.empresa || {};

  const guia =
    sJson.guia || {};

  const detalles =
    Array.isArray(sJson.detalles)
      ? sJson.detalles
      : [];

  if (detalles.length === 0) {
    throw new Error(
      'La GREM consolidada debe tener al menos una encomienda.'
    );
  }

  const codigo = texto(
    primero(
      guia.cod,
      guia.codigo
    ),
    '31'
  );

  const serie =
    texto(guia.serie);

  const numero =
    texto(guia.numero);

  const rucEmpresa =
    texto(
      empresa.documento_id
    );

  const razonSocial =
    texto(
      empresa.razon_social
    );

  const domicilioFiscal =
    texto(
      empresa.direccion
    );

  /*
   * A4
   */
  const width = 595.28;
  const height = 841.89;

  const marginLeft = 38;
  const marginRight = 38;
  const marginTop = 32;
  const marginBottom = 48;

  const contentWidth =
    width -
    marginLeft -
    marginRight;

  const logoImagen =
    await cargarLogo(
      pdfDoc,
      logo
    );

  const contexto = {
    pdfDoc,
    font,
    fontNegrita,

    empresa,
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
    marginRight,
    marginTop,
    marginBottom,

    contentWidth,

    logoImagen,

    totalEncomiendas:
      detalles.length,

    cantidadRemitentes:
      Number(
        guia.cantidad_remitentes
      ) || detalles.length,
  };

  let {
    page,
    y,
  } = crearPagina(contexto);

  /*
   * ========================================================
   * DETALLE DE ENCOMIENDAS
   * ========================================================
   */

  for (
    let index = 0;
    index < detalles.length;
    index += 1
  ) {
    const detalle =
      detalles[index] || {};

    const altoFila =
      calcularAltoEncomienda(
        detalle,
        font,
        fontNegrita,
        contentWidth
      );

    /*
     * Si no entra la encomienda completa,
     * generamos una página nueva.
     */
    if (
      y - altoFila <
      marginBottom + 15
    ) {
      ({
        page,
        y,
      } = crearPagina(contexto));
    }

    y = dibujarEncomienda({
      page,
      detalle,
      index,
      y,

      font,
      fontNegrita,

      marginLeft,
      contentWidth,
    });
  }

  /*
   * ========================================================
   * QR + HASH
   * ========================================================
   */

  const hash =
    texto(
      digestvalue,
      '-'
    );

  /*
   * Si todavía no existe digest,
   * usamos datos básicos para generar
   * un QR temporal.
   */
  const qrData =
    hash === '-'
      ? [
          rucEmpresa,
          codigo,
          serie,
          numero,
        ].join('|')
      : hash;

  const espacioQr = 96;

  if (
    y - espacioQr <
    marginBottom
  ) {
    ({
      page,
      y,
    } = crearPagina(contexto));
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

  /*
   * Numeración final + footer de marca en cada página.
   */
  dibujarFooter({
    pdfDoc,
    font,
    width,
    marginLeft,
    marginRight,
  });

  const pdfBytes =
    await pdfDoc.save();

  return {
    estado: true,
    buffer_pdf: pdfBytes,
  };
};

/*
 * ============================================================
 * CREAR PÁGINA
 * ============================================================
 *
 * Se repite la cabecera completa en cada página.
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

  const page =
    pdfDoc.addPage([
      width,
      height,
    ]);

  let y =
    height -
    marginTop;

  /*
   * ========================================================
   * LOGO Y EMPRESA
   * ========================================================
   */

  const logoBoxSize = 40;

  if (logoImagen) {
    const escala = Math.min(
      logoBoxSize / logoImagen.width,
      logoBoxSize / logoImagen.height
    );

    const logoWidth =
      logoImagen.width * escala;

    const logoHeight =
      logoImagen.height * escala;

    page.drawImage(
      logoImagen,
      {
        x: marginLeft,
        y: y - logoHeight,
        width: logoWidth,
        height: logoHeight,
      }
    );
  }

  const xEmpresa = marginLeft + logoBoxSize + 8;

  page.drawText(
    razonSocial || '-',
    {
      x: xEmpresa,
      y: y - 6,
      size: 10.5,
      font: fontNegrita,
      color: PALETTE.ink,
    }
  );

  page.drawText(
    `RUC ${rucEmpresa || '-'}`,
    {
      x: xEmpresa,
      y: y - 20,
      size: 8.5,
      font: fontNegrita,
      color: PALETTE.gray600,
    }
  );

  drawTextWrapped(
    page,
    domicilioFiscal || '-',
    font,
    7.5,
    contentWidth - logoBoxSize - 8,
    xEmpresa,
    y - 32,
    9,
    PALETTE.gray600
  );

  y -= 54;

  /*
   * ========================================================
   * BANNER DE TÍTULO (dos franjas: principal + acento)
   * ========================================================
   */

  const bannerHeight = 46;

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
    'GUÍA DE REMISIÓN ELECTRÓNICA TRANSPORTISTA',
    fontNegrita,
    11.5,
    width,
    y - 16,
    PALETTE.white
  );

  dibujarTextoCentrado(
    page,
    'CARGA CONSOLIDADA · MODO RESUMEN',
    fontNegrita,
    8.5,
    width,
    y - 29,
    rgb(0.85, 0.90, 1.0)
  );

  dibujarTextoCentrado(
    page,
    `${serie || '-'}-${numero || '-'}`,
    fontNegrita,
    13,
    width,
    y - 41,
    PALETTE.white
  );

  y -= bannerHeight + 12;

  /*
   * ========================================================
   * CHIPS DE RESUMEN (encomiendas / remitentes / peso / bultos)
   * ========================================================
   */

  const chips = [
    {
      label: 'ENCOMIENDAS',
      value: String(totalEncomiendas),
    },
    {
      label: 'REMITENTES',
      value: String(cantidadRemitentes),
    },
    {
      label: 'PESO TOTAL',
      value: `${formatearNumero(guia.peso_total, 2)} KG`,
    },
    {
      label: 'BULTOS',
      value: String(
        primero(guia.numero_bultos, totalEncomiendas)
      ),
    },
  ];

  y = dibujarChipsResumen({
    page,
    chips,
    x: marginLeft,
    y,
    width: contentWidth,
    font,
    fontNegrita,
  });

  y -= 10;

  /*
   * ========================================================
   * TRANSPORTISTA Y TRASLADO
   * ========================================================
   */

  y = dibujarTituloSeccion({
    page,
    titulo: 'DATOS DEL TRANSPORTISTA Y DEL TRASLADO',
    x: marginLeft,
    y,
    width: contentWidth,
    fontNegrita,
  });

  const mitad = contentWidth / 2;

  let yIzquierda = y;
  let yDerecha = y;

  const placa = texto(guia.vehiculo_placa);

  const conductor = [
    texto(guia.conductor_nombres),
    texto(guia.conductor_apellidos),
  ]
    .filter(Boolean)
    .join(' ');

  yIzquierda = dibujarCampo({
    page,
    label: 'Placa:',
    value: placa,
    x: marginLeft + 4,
    y: yIzquierda,
    maxWidth: mitad - 10,
    font,
    fontNegrita,
  });

  yIzquierda = dibujarCampo({
    page,
    label: 'Conductor:',
    value: conductor,
    x: marginLeft + 4,
    y: yIzquierda,
    maxWidth: mitad - 10,
    font,
    fontNegrita,
  });

  yIzquierda = dibujarCampo({
    page,
    label: 'DNI:',
    value: guia.conductor_dni,
    x: marginLeft + 4,
    y: yIzquierda,
    maxWidth: mitad - 10,
    font,
    fontNegrita,
  });

  yIzquierda = dibujarCampo({
    page,
    label: 'Licencia:',
    value: guia.conductor_licencia,
    x: marginLeft + 4,
    y: yIzquierda,
    maxWidth: mitad - 10,
    font,
    fontNegrita,
  });

  const xDerecha = marginLeft + mitad + 5;

  yDerecha = dibujarCampo({
    page,
    label: 'F. emisión:',
    value: formatearFecha(guia.fecha_emision),
    x: xDerecha,
    y: yDerecha,
    maxWidth: mitad - 10,
    font,
    fontNegrita,
  });

  yDerecha = dibujarCampo({
    page,
    label: 'Hora:',
    value: formatearHora(guia.hora_emision),
    x: xDerecha,
    y: yDerecha,
    maxWidth: mitad - 10,
    font,
    fontNegrita,
  });

  yDerecha = dibujarCampo({
    page,
    label: 'F. traslado:',
    value: formatearFecha(guia.fecha_traslado),
    x: xDerecha,
    y: yDerecha,
    maxWidth: mitad - 10,
    font,
    fontNegrita,
  });

  yDerecha = dibujarCampo({
    page,
    label: 'Motivo:',
    value: primero(guia.guia_motivo_id, '-'),
    x: xDerecha,
    y: yDerecha,
    maxWidth: mitad - 10,
    font,
    fontNegrita,
  });

  y = Math.min(yIzquierda, yDerecha) - 5;

  /*
   * ========================================================
   * ORIGEN Y DESTINO
   * ========================================================
   */

  y = dibujarTituloSeccion({
    page,
    titulo: 'ORIGEN Y DESTINO',
    x: marginLeft,
    y,
    width: contentWidth,
    fontNegrita,
  });

  yIzquierda = y;
  yDerecha = y;

  yIzquierda = dibujarCampo({
    page,
    label: 'Partida:',
    value: [
      texto(guia.partida_ubigeo),
      texto(guia.partida_direccion),
    ]
      .filter(Boolean)
      .join(' - '),
    x: marginLeft + 4,
    y: yIzquierda,
    maxWidth: mitad - 10,
    font,
    fontNegrita,
  });

  yDerecha = dibujarCampo({
    page,
    label: 'Llegada:',
    value: [
      texto(guia.llegada_ubigeo),
      texto(guia.llegada_direccion),
    ]
      .filter(Boolean)
      .join(' - '),
    x: xDerecha,
    y: yDerecha,
    maxWidth: mitad - 10,
    font,
    fontNegrita,
  });

  y = Math.min(yIzquierda, yDerecha) - 6;

  /*
   * ========================================================
   * GLOSA
   * ========================================================
   */

  if (texto(guia.glosa)) {
    y = dibujarTituloSeccion({
      page,
      titulo: 'OBSERVACIÓN',
      x: marginLeft,
      y,
      width: contentWidth,
      fontNegrita,
    });

    y = drawTextWrapped(
      page,
      guia.glosa,
      font,
      7.2,
      contentWidth - 8,
      marginLeft + 4,
      y,
      9,
      PALETTE.ink
    );

    y -= 4;
  }

  /*
   * ========================================================
   * CABECERA ENCOMIENDAS
   * ========================================================
   */

  y = dibujarTituloSeccion({
    page,
    titulo: 'ENCOMIENDAS DE LA CARGA CONSOLIDADA',
    x: marginLeft,
    y,
    width: contentWidth,
    fontNegrita,
    oscuro: true,
  });

  return {
    page,
    y: y - 3,
  };
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
  font,
  fontNegrita,
}) {
  const chipHeight = 34;
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
      borderWidth: 0.6,
    });

    page.drawRectangle({
      x: chipX,
      y: y - 3,
      width: chipWidth,
      height: 3,
      color: PALETTE.accent,
    });

    dibujarTextoCentrado(
      page,
      chip.label,
      fontNegrita,
      6.6,
      chipWidth,
      y - 14,
      PALETTE.gray600,
      chipX
    );

    dibujarTextoCentrado(
      page,
      chip.value,
      fontNegrita,
      12,
      chipWidth,
      y - 28,
      PALETTE.primary,
      chipX
    );
  });

  return y - chipHeight;
}

/*
 * ============================================================
 * CALCULAR ALTO DE CADA ENCOMIENDA
 * ============================================================
 */

function calcularAltoEncomienda(
  detalle,
  font,
  fontNegrita,
  contentWidth
) {
  const mitad = contentWidth / 2;
  const anchoPersona = mitad - 18;

  const descripcion = texto(
    detalle.descripcion,
    'ENCOMIENDA'
  );

  const lineasDescripcion = envolverTexto(
    descripcion,
    contentWidth - 90,
    7.4,
    font
  );

  const lineasNombreRemitente = envolverTexto(
    texto(detalle.cliente, '-'),
    anchoPersona,
    7.2,
    font
  );

  const lineasDireccionRemitente = envolverTexto(
    texto(detalle.cliente_direccion, '-'),
    anchoPersona,
    6.8,
    font
  );

  const telefonoRemitente = texto(
    detalle.cliente_telefono
  );

  const lineasNombreDestinatario = envolverTexto(
    texto(detalle.destinatario, '-'),
    anchoPersona,
    7.2,
    font
  );

  const lineasDireccionDestinatario = envolverTexto(
    texto(detalle.destinatario_direccion, '-'),
    anchoPersona,
    6.8,
    font
  );

  const telefonoDestinatario = texto(
    detalle.destinatario_telefono
  );

  const altoRemitente =
    10 +
    9 +
    lineasNombreRemitente.length * 8 +
    lineasDireccionRemitente.length * 8 +
    (telefonoRemitente ? 9 : 0);

  const altoDestinatario =
    10 +
    9 +
    lineasNombreDestinatario.length * 8 +
    lineasDireccionDestinatario.length * 8 +
    (telefonoDestinatario ? 9 : 0);

  const alto =
    20 +
    Math.max(18, lineasDescripcion.length * 9 + 6) +
    Math.max(altoRemitente, altoDestinatario) +
    14;

  return Math.max(90, alto);
}

/*
 * ============================================================
 * DIBUJAR ENCOMIENDA (tarjeta con acento de color por ítem)
 * ============================================================
 */

function dibujarEncomienda({
  page,
  detalle,
  index,
  y,

  font,
  fontNegrita,

  marginLeft,
  contentWidth,
}) {
  const altoFila = calcularAltoEncomienda(
    detalle,
    font,
    fontNegrita,
    contentWidth
  );

  const top = y - altoFila;

  /*
   * Fondo de la tarjeta (zebra sutil)
   */
  page.drawRectangle({
    x: marginLeft,
    y: top,
    width: contentWidth,
    height: altoFila,
    color: index % 2 === 0 ? PALETTE.zebra : PALETTE.white,
    borderColor: PALETTE.gray300,
    borderWidth: 0.5,
  });

  /*
   * Barra de acento a la izquierda, identifica el ítem
   */
  page.drawRectangle({
    x: marginLeft,
    y: top,
    width: 3,
    height: altoFila,
    color: PALETTE.accent,
  });

  /*
   * Cabecera de la encomienda
   */
  const cabeceraAlto = 18;

  page.drawRectangle({
    x: marginLeft,
    y: y - cabeceraAlto,
    width: contentWidth,
    height: cabeceraAlto,
    color: PALETTE.primarySoft,
    borderColor: PALETTE.gray300,
    borderWidth: 0.4,
  });

  const item = primero(detalle.item, index + 1);

  page.drawText(
    `ENCOMIENDA N° ${item}`,
    {
      x: marginLeft + 8,
      y: y - 12.5,
      size: 8,
      font: fontNegrita,
      color: PALETTE.primary,
    }
  );

  const referencia = referenciaEncomienda(detalle);
  const textoReferencia = `Ref: ${referencia}`;
  const anchoReferencia = font.widthOfTextAtSize(
    textoReferencia,
    7
  );

  page.drawText(
    textoReferencia,
    {
      x: marginLeft + contentWidth - anchoReferencia - 6,
      y: y - 12.5,
      size: 7,
      font,
      color: PALETTE.gray600,
    }
  );

  /*
   * ========================================================
   * DESCRIPCIÓN
   * ========================================================
   */

  let cursor = y - cabeceraAlto - 12;

  cursor = dibujarCampo({
    page,
    label: 'Descripción:',
    value: texto(detalle.descripcion, 'ENCOMIENDA'),
    x: marginLeft + 8,
    y: cursor,
    maxWidth: contentWidth - 14,
    font,
    fontNegrita,
  });

  cursor -= 3;

  /*
   * ========================================================
   * REMITENTE / DESTINATARIO
   * ========================================================
   */

  const mitad = contentWidth / 2;
  const xIzquierda = marginLeft + 8;
  const xDerecha = marginLeft + mitad + 5;
  const anchoColumna = mitad - 14;

  page.drawText(
    'REMITENTE',
    {
      x: xIzquierda,
      y: cursor,
      size: 7.4,
      font: fontNegrita,
      color: PALETTE.primary,
    }
  );

  page.drawText(
    'DESTINATARIO',
    {
      x: xDerecha,
      y: cursor,
      size: 7.4,
      font: fontNegrita,
      color: PALETTE.primary,
    }
  );

  cursor -= 11;

  let yRemitente = cursor;
  let yDestinatario = cursor;

  /*
   * REMITENTE
   */

  yRemitente = dibujarLineaPersona({
    page,
    label: 'Documento:',
    value: textoDocumentoPersona(
      detalle.cliente_id_doc,
      detalle.cliente_documento_id
    ),
    x: xIzquierda,
    y: yRemitente,
    maxWidth: anchoColumna,
    font,
    fontNegrita,
  });

  yRemitente = dibujarLineaPersona({
    page,
    label: 'Nombre:',
    value: detalle.cliente,
    x: xIzquierda,
    y: yRemitente,
    maxWidth: anchoColumna,
    font,
    fontNegrita,
  });

  if (texto(detalle.cliente_telefono)) {
    yRemitente = dibujarLineaPersona({
      page,
      label: 'Teléfono:',
      value: detalle.cliente_telefono,
      x: xIzquierda,
      y: yRemitente,
      maxWidth: anchoColumna,
      font,
      fontNegrita,
    });
  }

  yRemitente = dibujarLineaPersona({
    page,
    label: 'Dirección:',
    value: detalle.cliente_direccion,
    x: xIzquierda,
    y: yRemitente,
    maxWidth: anchoColumna,
    font,
    fontNegrita,
  });

  /*
   * DESTINATARIO
   */

  yDestinatario = dibujarLineaPersona({
    page,
    label: 'Documento:',
    value: textoDocumentoPersona(
      detalle.destinatario_id_doc,
      detalle.destinatario_documento_id
    ),
    x: xDerecha,
    y: yDestinatario,
    maxWidth: anchoColumna,
    font,
    fontNegrita,
  });

  yDestinatario = dibujarLineaPersona({
    page,
    label: 'Nombre:',
    value: detalle.destinatario,
    x: xDerecha,
    y: yDestinatario,
    maxWidth: anchoColumna,
    font,
    fontNegrita,
  });

  if (texto(detalle.destinatario_telefono)) {
    yDestinatario = dibujarLineaPersona({
      page,
      label: 'Teléfono:',
      value: detalle.destinatario_telefono,
      x: xDerecha,
      y: yDestinatario,
      maxWidth: anchoColumna,
      font,
      fontNegrita,
    });
  }

  yDestinatario = dibujarLineaPersona({
    page,
    label: 'Dirección:',
    value: detalle.destinatario_direccion,
    x: xDerecha,
    y: yDestinatario,
    maxWidth: anchoColumna,
    font,
    fontNegrita,
  });

  /*
   * Separador vertical entre remitente y destinatario
   */
  page.drawLine({
    start: {
      x: marginLeft + mitad,
      y: cursor + 7,
    },
    end: {
      x: marginLeft + mitad,
      y: Math.min(yRemitente, yDestinatario) + 4,
    },
    thickness: 0.35,
    color: PALETTE.gray300,
  });

  return top - 6;
}

/*
 * ============================================================
 * CAMPO DE PERSONA
 * ============================================================
 */

function dibujarLineaPersona({
  page,
  label,
  value,

  x,
  y,
  maxWidth,

  font,
  fontNegrita,
}) {
  const etiqueta = texto(label);
  const contenido = texto(value, '-');
  const size = 6.9;

  const labelWidth = fontNegrita.widthOfTextAtSize(
    etiqueta,
    size
  );

  page.drawText(
    etiqueta,
    {
      x,
      y,
      size,
      font: fontNegrita,
      color: PALETTE.gray600,
    }
  );

  return drawTextWrapped(
    page,
    contenido,
    font,
    size,
    Math.max(25, maxWidth - labelWidth - 3),
    x + labelWidth + 3,
    y,
    8,
    PALETTE.ink
  );
}

/*
 * ============================================================
 * QR Y HASH
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
    color: {
      dark: '#17325c',
      light: '#ffffff',
    },
  });

  const qrBuffer = Buffer.from(
    qrImagen.split(',')[1],
    'base64'
  );

  const qrEmbed = await pdfDoc.embedPng(qrBuffer);

  const cardHeight = 84;
  const qrSize = 64;

  /*
   * Tarjeta contenedora
   */
  page.drawRectangle({
    x: marginLeft,
    y: y - cardHeight,
    width: contentWidth,
    height: cardHeight,
    color: PALETTE.gray100,
    borderColor: PALETTE.gray300,
    borderWidth: 0.6,
  });

  page.drawRectangle({
    x: marginLeft,
    y: y - cardHeight,
    width: 3,
    height: cardHeight,
    color: PALETTE.primary,
  });

  page.drawImage(
    qrEmbed,
    {
      x: marginLeft + 12,
      y: y - cardHeight + (cardHeight - qrSize) / 2,
      width: qrSize,
      height: qrSize,
    }
  );

  const xTexto = marginLeft + qrSize + 26;

  page.drawText(
    'Verifica la autenticidad de este documento',
    {
      x: xTexto,
      y: y - 18,
      size: 7.6,
      font: fontNegrita,
      color: PALETTE.primary,
    }
  );

  page.drawText(
    'Código hash / valor de digest:',
    {
      x: xTexto,
      y: y - 32,
      size: 7,
      font: fontNegrita,
      color: PALETTE.gray600,
    }
  );

  drawTextWrapped(
    page,
    hash,
    font,
    7,
    contentWidth - qrSize - 38,
    xTexto,
    y - 44,
    9,
    PALETTE.ink
  );

  page.drawText(
    'Representación impresa de la Guía de Remisión Electrónica Transportista - Carga consolidada',
    {
      x: xTexto,
      y: y - cardHeight + 12,
      size: 6.6,
      font,
      color: PALETTE.gray600,
    }
  );
}

/*
 * ============================================================
 * FOOTER (línea + numeración de páginas)
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
      start: { x: marginLeft, y: 32 },
      end: { x: width - marginRight, y: 32 },
      thickness: 0.5,
      color: PALETTE.gray300,
    });

    pagina.drawText(
      'Guía de Remisión Electrónica Transportista - Carga consolidada',
      {
        x: marginLeft,
        y: 20,
        size: 6.6,
        font,
        color: PALETTE.gray600,
      }
    );

    const numeroPagina = `Página ${index + 1} de ${paginas.length}`;

    const anchoTexto = font.widthOfTextAtSize(
      numeroPagina,
      7
    );

    pagina.drawText(
      numeroPagina,
      {
        x: width - marginRight - anchoTexto,
        y: 20,
        size: 7,
        font,
        color: PALETTE.gray600,
      }
    );
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
      'No se pudo cargar el logo para la GREM consolidada:',
      error.message
    );

    return null;
  }
}

/*
 * ============================================================
 * TÍTULO DE SECCIÓN (barra con acento a la izquierda)
 * ============================================================
 */

function dibujarTituloSeccion({
  page,
  titulo,

  x,
  y,
  width,

  fontNegrita,

  oscuro = false,
}) {
  const alto = 16;

  page.drawRectangle({
    x,
    y: y - alto,
    width,
    height: alto,
    color: oscuro ? PALETTE.primary : PALETTE.primarySoft,
    borderColor: PALETTE.primary,
    borderWidth: 0.5,
  });

  page.drawRectangle({
    x,
    y: y - alto,
    width: 3,
    height: alto,
    color: PALETTE.accent,
  });

  page.drawText(
    titulo,
    {
      x: x + 9,
      y: y - 11.5,
      size: 8,
      font: fontNegrita,
      color: oscuro ? PALETTE.white : PALETTE.ink,
    }
  );

  return y - 25;
}

/*
 * ============================================================
 * CAMPO GENERAL
 * ============================================================
 */

function dibujarCampo({
  page,
  label,
  value,

  x,
  y,
  maxWidth,

  font,
  fontNegrita,
}) {
  const etiqueta = texto(label);
  const contenido = texto(value, '-');

  const labelWidth = fontNegrita.widthOfTextAtSize(
    etiqueta,
    7.2
  );

  page.drawText(
    etiqueta,
    {
      x,
      y,
      size: 7.2,
      font: fontNegrita,
      color: PALETTE.gray600,
    }
  );

  return drawTextWrapped(
    page,
    contenido,
    font,
    7.2,
    Math.max(30, maxWidth - labelWidth - 3),
    x + labelWidth + 3,
    y,
    8,
    PALETTE.ink
  );
}

/*
 * ============================================================
 * TEXTO CENTRADO (soporta centrar dentro de un ancho local con offsetX)
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

  const ancho = font.widthOfTextAtSize(
    contenido,
    size
  );

  page.drawText(
    contenido,
    {
      x: offsetX + (boxWidth - ancho) / 2,
      y,
      size,
      font,
      color,
    }
  );
}

/*
 * ============================================================
 * ENVOLVER TEXTO
 * ============================================================
 */

function envolverTexto(
  text,
  maxWidth,
  fontSize,
  font
) {
  const contenido = texto(text, '-');
  const words = contenido.split(/\s+/);
  const lines = [];

  let currentLine = '';

  words.forEach((word) => {
    const testLine = currentLine
      ? `${currentLine} ${word}`
      : word;

    const ancho = font.widthOfTextAtSize(
      testLine,
      fontSize
    );

    if (ancho <= maxWidth) {
      currentLine = testLine;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    /*
     * Si una sola palabra es demasiado larga
     * (por ejemplo un hash), permitimos que pase
     * como línea individual.
     */
    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/*
 * ============================================================
 * DIBUJAR TEXTO CON WRAP
 * ============================================================
 */

function drawTextWrapped(
  page,
  text,
  font,
  fontSize,
  maxWidth,
  x,
  y,
  lineHeight = 9,
  color = rgb(0, 0, 0)
) {
  const lines = envolverTexto(
    text,
    maxWidth,
    fontSize,
    font
  );

  lines.forEach((line, index) => {
    page.drawText(
      line,
      {
        x,
        y: y - index * lineHeight,
        size: fontSize,
        font,
        color,
      }
    );
  });

  return y - lines.length * lineHeight;
}

module.exports = gremgenerapdfa4consolidada;
