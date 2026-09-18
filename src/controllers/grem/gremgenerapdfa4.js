/*const gregenerapdfa4 = require('../gre/gregenerapdfa4');

module.exports = async function gremgenerapdfa4(logo, sJson, digestvalue) {
  return gregenerapdfa4(logo, sJson, digestvalue);
};*/

const {
  PDFDocument,
  StandardFonts,
  rgb,
} = require('pdf-lib');

const QRCode = require('qrcode');

const texto = (valor, defecto = '') => {
  const resultado = (valor ?? '').toString().trim();
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

const documentoPersona = (persona = {}) =>
  texto(
    primero(
      persona.numero_documento,
      persona.documento_id,
      persona.ruc_dni,
      persona.ruc,
      persona.dni
    )
  );

const nombrePersona = (persona = {}) =>
  texto(
    primero(
      persona.razon_social,
      persona.nombre,
      persona.nombres,
      persona.denominacion
    )
  );

const direccionPersona = (persona = {}) =>
  texto(
    primero(
      persona.direccion,
      persona.domicilio_fiscal
    )
  );

const gremgenerapdfa4 = async (
  logo,
  sJson = {},
  digestvalue = '-'
) => {
  const pdfDoc = await PDFDocument.create();

  const width = 595.28;
  const height = 841.89;

  const page = pdfDoc.addPage([
    width,
    height,
  ]);

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
    : Array.isArray(sJson.items)
      ? sJson.items
      : [];

  /*
   * GREM clásica:
   *
   * - Un remitente por guía.
   * - Un destinatario por guía.
   * - Un documento relacionado por guía.
   * - Los detalles contienen solamente los bienes.
   */

  const remitente =
    guia.remitente ||
    sJson.remitente || {
      tipo_documento:
        guia.remitente_tipo,

      numero_documento:
        guia.remitente_ruc_dni,

      razon_social:
        guia.remitente_razon_social,

      direccion:
        guia.remitente_direccion,
    };

  const destinatario =
    guia.destinatario ||
    sJson.destinatario || {
      tipo_documento:
        guia.destinatario_tipo,

      numero_documento:
        guia.destinatario_ruc_dni,

      razon_social:
        guia.destinatario_razon_social,

      direccion:
        guia.destinatario_direccion,
    };

  const documentoRelacionado =
    guia.documento_relacionado ||
    sJson.documento_relacionado || {
      tipo_documento: primero(
        guia.documento_relacionado_tipo,
        guia.documento_tipo,
        guia.r_cod_ref
      ),

      serie: primero(
        guia.documento_relacionado_serie,
        guia.documento_serie,
        guia.r_serie_ref
      ),

      numero: primero(
        guia.documento_relacionado_numero,
        guia.documento_numero,
        guia.r_numero_ref
      ),
    };

  const rucEmpresa = texto(
    primero(
      empresa.documento_id,
      empresa.ruc
    )
  );

  const razonSocial = texto(
    primero(
      empresa.razon_social,
      empresa.nombre_comercial
    )
  );

  const domicilioFiscal = texto(
    primero(
      empresa.domicilio_fiscal,
      empresa.direccion
    )
  );

  const codigo = texto(
    primero(
      guia.cod,
      guia.codigo
    ),
    '31'
  );

  const serie = texto(guia.serie);
  const numero = texto(guia.numero);

  const marginLeft = 42;
  const marginRight = 42;
  const marginTop = 42;

  const contentWidth =
    width -
    marginLeft -
    marginRight;

  const colorPrincipal = rgb(
    0.13,
    0.32,
    0.62
  );

  const colorClaro = rgb(
    0.95,
    0.97,
    1
  );

  let y = height - marginTop;

  // ========================================
  // LOGO
  // ========================================

  if (logo) {
    try {
      const logoBuffer = Buffer.isBuffer(logo)
        ? logo
        : Buffer.from(logo);

      let logoImage;

      try {
        logoImage =
          await pdfDoc.embedPng(
            logoBuffer
          );
      } catch (_) {
        logoImage =
          await pdfDoc.embedJpg(
            logoBuffer
          );
      }

      const escala = Math.min(
        100 / logoImage.width,
        48 / logoImage.height
      );

      const logoWidth =
        logoImage.width * escala;

      const logoHeight =
        logoImage.height * escala;

      page.drawImage(logoImage, {
        x: (width - logoWidth) / 2,
        y: y - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });

      y -= logoHeight + 7;
    } catch (error) {
      console.warn(
        'No se pudo insertar el logo en la GREM A4:',
        error.message
      );
    }
  }

  // ========================================
  // EMPRESA TRANSPORTISTA
  // ========================================

  y = drawCentered(
    page,
    razonSocial,
    fontNegrita,
    11,
    width,
    y
  );

  y = drawCentered(
    page,
    `RUC ${rucEmpresa}`,
    fontNegrita,
    12,
    width,
    y - 14
  );

  y = drawTextWrapped(
    page,
    domicilioFiscal,
    font,
    8,
    contentWidth,
    marginLeft,
    y - 13,
    'center',
    10
  );

  y -= 5;

  // ========================================
  // TÍTULO DEL DOCUMENTO
  // ========================================

  page.drawRectangle({
    x: marginLeft,
    y: y - 57,
    width: contentWidth,
    height: 57,
    borderColor: colorPrincipal,
    borderWidth: 1.2,
    color: colorClaro,
  });

  y = drawCentered(
    page,
    'GUIA DE REMISION ELECTRONICA TRANSPORTISTA',
    fontNegrita,
    13,
    width,
    y - 16,
    colorPrincipal
  );

  y = drawCentered(
    page,
    `${serie}-${numero}`,
    fontNegrita,
    15,
    width,
    y - 5,
    colorPrincipal
  );

  y -= 24;

  // ========================================
  // REMITENTE Y DESTINATARIO
  // ========================================

  const colGap = 8;

  const colWidth =
    (contentWidth - colGap) / 2;

  const colDerecha =
    marginLeft +
    colWidth +
    colGap;

  const inicioPersonas = y;

  const yRemitente = drawPersona({
    page,
    titulo: 'REMITENTE',
    persona: remitente,
    x: marginLeft,
    y,
    width: colWidth,
    font,
    fontNegrita,
    colorPrincipal,
    colorClaro,
  });

  const yDestinatario = drawPersona({
    page,
    titulo: 'DESTINATARIO',
    persona: destinatario,
    x: colDerecha,
    y,
    width: colWidth,
    font,
    fontNegrita,
    colorPrincipal,
    colorClaro,
  });

  y =
    Math.min(
      yRemitente,
      yDestinatario,
      inicioPersonas - 76
    ) - 9;

  // ========================================
  // DOCUMENTO RELACIONADO
  // ========================================

  const referenciaDocumento = [
    texto(
      primero(
        documentoRelacionado.tipo_documento,
        documentoRelacionado.codigo
      )
    ),

    texto(
      documentoRelacionado.serie
    ),

    texto(
      documentoRelacionado.numero
    ),
  ]
    .filter(Boolean)
    .join('-');

  if (referenciaDocumento) {
    y = drawSectionTitle(
      page,
      'DOCUMENTO RELACIONADO',
      marginLeft,
      y,
      contentWidth,
      fontNegrita,
      colorPrincipal
    );

    y =
      drawLabelValue(
        page,
        'Documento:',
        referenciaDocumento,
        marginLeft + 4,
        y,
        contentWidth - 8,
        font,
        fontNegrita
      ) - 3;
  }

  // ========================================
  // DATOS DEL TRANSPORTISTA
  // ========================================

  y = drawSectionTitle(
    page,
    'DATOS DEL TRANSPORTISTA Y DEL TRASLADO',
    marginLeft,
    y,
    contentWidth,
    fontNegrita,
    colorPrincipal
  );

  const mtc = texto(
    primero(
      guia.transp_mtc,
      guia.transportista_mtc,
      empresa.numero_mtc,
      empresa.mtc
    )
  );

  const placa = texto(
    primero(
      guia.vehiculo_placa,
      guia.transportista_placa_numero,
      guia.placa
    )
  );

  const conductorDocumento = texto(
    primero(
      guia.conductor_dni,
      guia.conductor_documento_id
    )
  );

  const conductorNombre = texto(
    [
      texto(
        guia.conductor_nombres
      ),

      texto(
        guia.conductor_apellidos
      ),
    ]
      .filter(Boolean)
      .join(' ')
  );

  let yLeft = y;
  let yRight = y;

  yLeft = drawLabelValue(
    page,
    'Registro MTC:',
    mtc,
    marginLeft + 4,
    yLeft,
    colWidth - 8,
    font,
    fontNegrita
  );

  yLeft = drawLabelValue(
    page,
    'Placa:',
    placa,
    marginLeft + 4,
    yLeft,
    colWidth - 8,
    font,
    fontNegrita
  );

  yLeft = drawLabelValue(
    page,
    'Conductor:',
    conductorNombre,
    marginLeft + 4,
    yLeft,
    colWidth - 8,
    font,
    fontNegrita
  );

  yLeft = drawLabelValue(
    page,
    'DNI:',
    conductorDocumento,
    marginLeft + 4,
    yLeft,
    colWidth - 8,
    font,
    fontNegrita
  );

  yLeft = drawLabelValue(
    page,
    'Licencia:',
    texto(
      guia.conductor_licencia
    ),
    marginLeft + 4,
    yLeft,
    colWidth - 8,
    font,
    fontNegrita
  );

  yRight = drawLabelValue(
    page,
    'F. emision:',
    texto(
      guia.fecha_emision
    ),
    colDerecha + 4,
    yRight,
    colWidth - 8,
    font,
    fontNegrita
  );

  yRight = drawLabelValue(
    page,
    'Hora emision:',
    texto(
      guia.hora_emision
    ),
    colDerecha + 4,
    yRight,
    colWidth - 8,
    font,
    fontNegrita
  );

  yRight = drawLabelValue(
    page,
    'F. traslado:',
    texto(
      primero(
        guia.fecha_traslado,
        guia.fecha_inicio_traslado
      )
    ),
    colDerecha + 4,
    yRight,
    colWidth - 8,
    font,
    fontNegrita
  );

  yRight = drawLabelValue(
    page,
    'Peso total:',
    `${texto(
      guia.peso_total,
      '0'
    )} KG`,
    colDerecha + 4,
    yRight,
    colWidth - 8,
    font,
    fontNegrita
  );

  yRight = drawLabelValue(
    page,
    'Bultos:',
    texto(
      primero(
        guia.numero_bultos,
        detalles.length
      ),
      '0'
    ),
    colDerecha + 4,
    yRight,
    colWidth - 8,
    font,
    fontNegrita
  );

  y =
    Math.min(
      yLeft,
      yRight
    ) - 6;

  // ========================================
  // ORIGEN Y DESTINO
  // ========================================

  y = drawSectionTitle(
    page,
    'ORIGEN Y DESTINO',
    marginLeft,
    y,
    contentWidth,
    fontNegrita,
    colorPrincipal
  );

  yLeft = y;
  yRight = y;

  yLeft = drawLabelValue(
    page,
    'Ubigeo partida:',
    texto(
      guia.partida_ubigeo
    ),
    marginLeft + 4,
    yLeft,
    colWidth - 8,
    font,
    fontNegrita
  );

  yLeft = drawLabelValue(
    page,
    'Direccion:',
    texto(
      guia.partida_direccion
    ),
    marginLeft + 4,
    yLeft,
    colWidth - 8,
    font,
    fontNegrita
  );

  yRight = drawLabelValue(
    page,
    'Ubigeo llegada:',
    texto(
      guia.llegada_ubigeo
    ),
    colDerecha + 4,
    yRight,
    colWidth - 8,
    font,
    fontNegrita
  );

  yRight = drawLabelValue(
    page,
    'Direccion:',
    texto(
      guia.llegada_direccion
    ),
    colDerecha + 4,
    yRight,
    colWidth - 8,
    font,
    fontNegrita
  );

  y =
    Math.min(
      yLeft,
      yRight
    ) - 7;

  // ========================================
  // BIENES TRANSPORTADOS
  // ========================================

  y = drawSectionTitle(
    page,
    'BIENES TRANSPORTADOS',
    marginLeft,
    y,
    contentWidth,
    fontNegrita,
    colorPrincipal,
    true
  );

  const xCantidad =
    marginLeft + 4;

  const xDescripcion =
    marginLeft + 48;

  const xUnidad =
    marginLeft + 455;

  page.drawText('CANT.', {
    x: xCantidad,
    y: y + 4,
    size: 8,
    font: fontNegrita,
    color: rgb(1, 1, 1),
  });

  page.drawText('DESCRIPCION', {
    x: xDescripcion,
    y: y + 4,
    size: 8,
    font: fontNegrita,
    color: rgb(1, 1, 1),
  });

  page.drawText('UND.', {
    x: xUnidad,
    y: y + 4,
    size: 8,
    font: fontNegrita,
    color: rgb(1, 1, 1),
  });

  y -= 6;

  for (
    let index = 0;
    index < detalles.length;
    index += 1
  ) {
    const detalle =
      detalles[index] || {};

    const descripcion = texto(
      primero(
        detalle.descripcion,
        detalle.producto
      ),
      'ENCOMIENDA'
    );

    const lineasDescripcion =
      wrapText(
        descripcion,
        390,
        7.5,
        font
      );

    const rowHeight = Math.max(
      20,
      lineasDescripcion.length * 9 + 7
    );

    if (index % 2 === 0) {
      page.drawRectangle({
        x: marginLeft,
        y: y - rowHeight + 5,
        width: contentWidth,
        height: rowHeight,
        color: rgb(
          0.98,
          0.98,
          0.99
        ),
      });
    }

    page.drawText(
      texto(
        detalle.cantidad,
        '1'
      ),
      {
        x: xCantidad,
        y,
        size: 7.5,
        font,
      }
    );

    drawLines(
      page,
      lineasDescripcion,
      xDescripcion,
      y,
      font,
      7.5,
      9
    );

    page.drawText(
      texto(
        primero(
          detalle.unidad_medida,
          detalle.codigo_unidad
        ),
        'NIU'
      ),
      {
        x: xUnidad,
        y,
        size: 7.5,
        font,
      }
    );

    y -= rowHeight;

    page.drawLine({
      start: {
        x: marginLeft,
        y: y + 5,
      },

      end: {
        x: width - marginRight,
        y: y + 5,
      },

      thickness: 0.4,

      color: rgb(
        0.85,
        0.85,
        0.85
      ),
    });
  }

  y -= 7;

  // ========================================
  // OBSERVACIÓN
  // ========================================

  if (
    texto(
      guia.observacion
    )
  ) {
    y = drawLabelValue(
      page,
      'Observacion:',
      texto(
        guia.observacion
      ),
      marginLeft,
      y,
      contentWidth,
      font,
      fontNegrita
    );
  }

  // ========================================
  // QR Y HASH
  // ========================================

  const hash = texto(
    digestvalue,
    '-'
  );

  const qrData =
    hash === '-'
      ? [
          rucEmpresa,
          codigo,
          serie,
          numero,
        ].join('|')
      : hash;

  const qrImage =
    await QRCode.toDataURL(
      qrData
    );

  const qrImageBuffer =
    Buffer.from(
      qrImage.split(',')[1],
      'base64'
    );

  const qrImageEmbed =
    await pdfDoc.embedPng(
      qrImageBuffer
    );

  const qrSize = 62;

  const qrY = Math.max(
    36,
    y - qrSize - 4
  );

  page.drawImage(
    qrImageEmbed,
    {
      x: marginLeft,
      y: qrY,
      width: qrSize,
      height: qrSize,
    }
  );

  page.drawText(
    'Hash:',
    {
      x:
        marginLeft +
        qrSize +
        10,

      y: qrY + 42,

      size: 7,

      font: fontNegrita,
    }
  );

  drawTextWrapped(
    page,
    hash,
    font,
    7,
    contentWidth -
      qrSize -
      10,
    marginLeft +
      qrSize +
      10,
    qrY + 30,
    'left',
    9
  );

  page.drawText(
    'Representacion impresa de la Guia de Remision Electronica Transportista',
    {
      x:
        marginLeft +
        qrSize +
        10,

      y: qrY + 4,

      size: 7,

      font,

      color: rgb(
        0.35,
        0.35,
        0.35
      ),
    }
  );

  const pdfBytes =
    await pdfDoc.save();

  return {
    estado: true,
    buffer_pdf: pdfBytes,
  };
};

function drawPersona({
  page,
  titulo,
  persona,
  x,
  y,
  width,
  font,
  fontNegrita,
  colorPrincipal,
  colorClaro,
}) {
  page.drawRectangle({
    x,
    y: y - 14,
    width,
    height: 14,
    color: colorClaro,
    borderColor:
      colorPrincipal,
    borderWidth: 0.5,
  });

  page.drawText(
    titulo,
    {
      x: x + 4,
      y: y - 10,
      size: 8.5,
      font: fontNegrita,
    }
  );

  let cursor = y - 24;

  cursor = drawLabelValue(
    page,
    'Nombre:',
    nombrePersona(persona),
    x + 4,
    cursor,
    width - 8,
    font,
    fontNegrita
  );

  cursor = drawLabelValue(
    page,
    'RUC/DNI:',
    documentoPersona(persona),
    x + 4,
    cursor,
    width - 8,
    font,
    fontNegrita
  );

  cursor = drawLabelValue(
    page,
    'Direccion:',
    direccionPersona(persona),
    x + 4,
    cursor,
    width - 8,
    font,
    fontNegrita
  );

  return cursor;
}

function drawSectionTitle(
  page,
  titulo,
  x,
  y,
  width,
  fontNegrita,
  colorPrincipal,
  oscuro = false
) {
  page.drawRectangle({
    x,
    y: y - 14,
    width,
    height: 14,

    color: oscuro
      ? colorPrincipal
      : rgb(
          0.95,
          0.97,
          1
        ),

    borderColor:
      colorPrincipal,

    borderWidth: 0.5,
  });

  page.drawText(
    titulo,
    {
      x: x + 4,
      y: y - 10,
      size: 8.5,
      font: fontNegrita,

      color: oscuro
        ? rgb(1, 1, 1)
        : rgb(0, 0, 0),
    }
  );

  return y - 24;
}

function drawLabelValue(
  page,
  label,
  value,
  x,
  y,
  maxWidth,
  font,
  fontNegrita
) {
  const labelWidth =
    fontNegrita.widthOfTextAtSize(
      label,
      7.5
    );

  page.drawText(
    label,
    {
      x,
      y,
      size: 7.5,
      font: fontNegrita,
    }
  );

  return drawTextWrapped(
    page,
    texto(value, '-'),
    font,
    7.5,
    Math.max(
      20,
      maxWidth -
        labelWidth -
        3
    ),
    x +
      labelWidth +
      3,
    y,
    'left',
    9
  );
}

function drawCentered(
  page,
  text,
  font,
  size,
  pageWidth,
  y,
  color = rgb(0, 0, 0)
) {
  const value = texto(text);

  const textWidth =
    font.widthOfTextAtSize(
      value,
      size
    );

  page.drawText(
    value,
    {
      x:
        (pageWidth -
          textWidth) /
        2,

      y,
      size,
      font,
      color,
    }
  );

  return y;
}

function drawLines(
  page,
  lines,
  x,
  y,
  font,
  size,
  lineHeight
) {
  lines.forEach(
    (line, index) => {
      page.drawText(
        line,
        {
          x,
          y:
            y -
            index *
              lineHeight,

          size,
          font,
        }
      );
    }
  );
}

function wrapText(
  text,
  maxWidth,
  fontSize,
  font
) {
  const words = texto(
    text,
    '-'
  ).split(/\s+/);

  const lines = [];

  let currentLine = '';

  words.forEach((word) => {
    const testLine =
      currentLine
        ? `${currentLine} ${word}`
        : word;

    if (
      font.widthOfTextAtSize(
        testLine,
        fontSize
      ) <= maxWidth
    ) {
      currentLine =
        testLine;
    } else {
      if (currentLine) {
        lines.push(
          currentLine
        );
      }

      currentLine = word;
    }
  });

  if (currentLine) {
    lines.push(
      currentLine
    );
  }

  return lines;
}

function drawTextWrapped(
  page,
  text,
  font,
  fontSize,
  maxWidth,
  x,
  y,
  align = 'left',
  lineHeight = 10
) {
  const lines = wrapText(
    text,
    maxWidth,
    fontSize,
    font
  );

  lines.forEach(
    (line, index) => {
      const textWidth =
        font.widthOfTextAtSize(
          line,
          fontSize
        );

      let drawX = x;

      if (
        align === 'center'
      ) {
        drawX =
          x +
          (
            maxWidth -
            textWidth
          ) /
            2;
      }

      if (
        align === 'right'
      ) {
        drawX =
          x +
          maxWidth -
          textWidth;
      }

      page.drawText(
        line,
        {
          x: drawX,

          y:
            y -
            index *
              lineHeight,

          size: fontSize,
          font,
        }
      );
    }
  );

  return (
    y -
    lines.length *
      lineHeight
  );
}

module.exports = gremgenerapdfa4;