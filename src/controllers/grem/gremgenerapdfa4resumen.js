const {
  PDFDocument,
  StandardFonts,
  rgb,
} = require('pdf-lib');

const QRCode = require('qrcode');

/*
 * ============================================================
 * PAYLOAD DISPONIBLE (sJson)
 * ============================================================
 *
 * Esta es la forma exacta que entrega generarPayloadGremTransporte().
 * Deja este bloque como referencia rápida: si quieres mostrar un
 * campo que hoy no se dibuja, solo búscalo aquí y agrégalo donde
 * corresponda (fila de encomienda, franja de datos, chips, etc).
 *
 * sJson = {
 *   rubro: 'TRANS_GREM',
 *
 *   empresa: {
 *     documento_id,     // RUC transportista            [USADO - cabecera]
 *     razon_social,     //                               [USADO - cabecera]
 *     direccion,        //                               [USADO - cabecera]
 *     id_ubigeo,        //                               [DISPONIBLE - no se dibuja]
 *   },
 *
 *   guia: {
 *     cod,                      // '31' = GRE Transportista   [USADO - título/QR]
 *     serie,                    //                             [USADO - título]
 *     numero,                   //                             [USADO - título]
 *     fecha_emision,            //                             [USADO - "F. emisión:"]
 *     hora_emision,             //                             [USADO - "Hora:"]
 *     fecha_traslado,           //                             [USADO - "F. traslado:"]
 *
 *     guia_motivo_id,           // catálogo 20 SUNAT           [USADO - "Motivo:"]
 *     guia_modalidad_id,        // catálogo 18 SUNAT           [DISPONIBLE - no se dibuja]
 *
 *     partida_ubigeo,           //                             [USADO - "Partida:"]
 *     partida_direccion,        //                             [USADO - "Partida:"]
 *     llegada_ubigeo,           //                             [USADO - "Llegada:"]
 *     llegada_direccion,        //                             [USADO - "Llegada:"]
 *
 *     peso_total,               //                             [USADO - chip "PESO TOTAL"]
 *     numero_bultos,            //                             [USADO - chip "BULTOS"]
 *
 *     conductor_dni,            //                             [USADO - "DNI:"]
 *     conductor_nombres,        //                             [USADO - "Conductor:"]
 *     conductor_apellidos,      //                             [USADO - "Conductor:"]
 *     conductor_licencia,       //                             [USADO - "Licencia:"]
 *
 *     vehiculo_placa,           //                             [USADO - "Placa:"]
 *
 *     glosa,                    // observación libre           [USADO - sección "OBSERVACIÓN" (si existe)]
 *
 *     cantidad_remitentes,      // calculado en el controller  [USADO - chip "REMITENTES"]
 *     resumen_mas_20_remitentes,// bandera >20 remitentes      [DISPONIBLE - útil para leyenda/aviso]
 *   },
 *
 *   detalles: [
 *     {
 *       item,                       // N° correlativo             [USADO - col. N°]
 *
 *       // Referencia a mve_transventa = "CPE" de la encomienda
 *       r_periodo,                  //                             [DISPONIBLE]
 *       r_cod,                      //                             [USADO - col. CPE]
 *       r_serie,                    //                             [USADO - col. CPE]
 *       r_numero,                   //                             [USADO - col. CPE]
 *       elemento,                   //                             [DISPONIBLE]
 *       r_fecemi,                   // fecha emisión venta         [DISPONIBLE]
 *
 *       r_cod_ref,                  //                             [DISPONIBLE]
 *       r_serie_ref,                //                             [DISPONIBLE]
 *       r_numero_ref,               //                             [DISPONIBLE]
 *       r_fecemi_ref,               //                             [DISPONIBLE]
 *
 *       // Remitente (línea 1: solo número de documento + nombre,
 *       // SIN el label "DNI"/"RUC" -> ahorra espacio para las 3
 *       // columnas: CPE / Remitente / Destinatario)
 *       cliente_id_doc,             // tipo doc (1=DNI, 6=RUC...)  [DISPONIBLE - se usó para decidir formato, no se imprime la etiqueta]
 *       cliente_documento_id,       // número de documento         [USADO - col. Remitente]
 *       cliente,                    // nombre / razón social       [USADO - col. Remitente]
 *       cliente_telefono,           //                             [NO USADO por pedido: sin teléfonos]
 *       cliente_direccion,          //                             [NO USADO por pedido: sin direcciones]
 *
 *       id_ruta,                    //                             [DISPONIBLE]
 *       descripcion,                // descripción del bien        [USADO - línea 2, ancho completo]
 *
 *       id_punto_venta,             // agencia origen               [DISPONIBLE]
 *       id_punto_venta_dest,        // agencia destino               [DISPONIBLE]
 *
 *       placa,                      // placa asociada a la venta   [DISPONIBLE - guia.vehiculo_placa manda]
 *       licencia,                   //                             [DISPONIBLE - guia.conductor_licencia manda]
 *
 *       // Destinatario (mismo criterio que remitente)
 *       destinatario_id_doc,        //                             [DISPONIBLE - no se imprime la etiqueta]
 *       destinatario_documento_id,  //                             [USADO - col. Destinatario]
 *       destinatario,               //                             [USADO - col. Destinatario]
 *       destinatario_telefono,      //                             [NO USADO por pedido: sin teléfonos]
 *       destinatario_direccion,     //                             [NO USADO por pedido: sin direcciones]
 *
 *       precio_neto,                //                             [DISPONIBLE - no se dibuja, es dato comercial]
 *       r_monto_total,              //                             [DISPONIBLE - no se dibuja, es dato comercial]
 *     },
 *     // ... un objeto por cada encomienda seleccionada
 *   ],
 * }
 *
 * Otros parámetros de la función:
 *   logo          Buffer|Uint8Array PNG/JPG del logo de la empresa (opcional)
 *   digestvalue   string: hash/DigestValue de la firma XML de SUNAT.
 *                 Si aún no existe (documento sin firmar todavía),
 *                 se genera un QR temporal con RUC|cod|serie|numero.
 * ============================================================
 */

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
 * CPE de la encomienda (referencia interna): r_cod-r_serie-r_numero.
 * Antes se mostraba como "Ref:" en la línea 2; ahora es el primer
 * elemento de la línea 1.
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

/*
 * Solo el número de documento, SIN el label "DNI"/"RUC" (se quita
 * a propósito para ganar espacio horizontal entre las 3 columnas
 * de la línea 1: CPE / Remitente / Destinatario).
 */
const soloNumeroDocumento = (numeroDocumento) => {
  const numero = texto(numeroDocumento);

  return numero || '-';
};

/*
 * Recorta un texto a una sola línea que quepa en maxWidth,
 * agregando "..." si no entra completo.
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
 * GENERADOR PRINCIPAL
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
   *
   * Línea 1: N°  |  CPE  |  Remitente (doc + nombre)  |  Destinatario (doc + nombre)
   * Línea 2: Descripción de la encomienda, a todo lo ancho
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
 *
 * Cabecera IDÉNTICA a la del modelo "consolidada" (banner en dos
 * franjas, chips de resumen, sección de transportista/traslado y
 * sección de origen/destino). Lo único que cambia es lo que hay
 * debajo: en vez de tarjetas por encomienda, una tabla compacta.
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

    const logoWidth = logoImagen.width * escala;
    const logoHeight = logoImagen.height * escala;

    page.drawImage(logoImagen, {
      x: marginLeft,
      y: y - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
  }

  const xEmpresa = marginLeft + logoBoxSize + 8;

  page.drawText(razonSocial || '-', {
    x: xEmpresa,
    y: y - 6,
    size: 10.5,
    font: fontNegrita,
    color: PALETTE.ink,
  });

  page.drawText(`RUC ${rucEmpresa || '-'}`, {
    x: xEmpresa,
    y: y - 20,
    size: 8.5,
    font: fontNegrita,
    color: PALETTE.gray600,
  });

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
   * CHIPS DE RESUMEN
   * ========================================================
   */

  const chips = [
    { label: 'ENCOMIENDAS', value: String(totalEncomiendas) },
    { label: 'REMITENTES', value: String(cantidadRemitentes) },
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
   * GLOSA (si existe)
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
   * CABECERA DE LA TABLA DE ENCOMIENDAS (cuerpo resumido)
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

  const alturaCabeceraTabla = 15;

  page.drawRectangle({
    x: marginLeft,
    y: y - alturaCabeceraTabla,
    width: contentWidth,
    height: alturaCabeceraTabla,
    color: PALETTE.primarySoft,
    borderColor: PALETTE.gray300,
    borderWidth: 0.4,
  });

  const yCabecera = y - 10.5;

  page.drawText('N°', {
    x: marginLeft + 6,
    y: yCabecera,
    size: 6.6,
    font: fontNegrita,
    color: PALETTE.primary,
  });

  page.drawText('CPE', {
    x: marginLeft + 24,
    y: yCabecera,
    size: 6.6,
    font: fontNegrita,
    color: PALETTE.primary,
  });

  page.drawText('REMITENTE', {
    x: marginLeft + contentWidth * 0.32,
    y: yCabecera,
    size: 6.6,
    font: fontNegrita,
    color: PALETTE.primary,
  });

  page.drawText('DESTINATARIO', {
    x: marginLeft + contentWidth * 0.66,
    y: yCabecera,
    size: 6.6,
    font: fontNegrita,
    color: PALETTE.primary,
  });

  return {
    page,
    y: y - alturaCabeceraTabla - 2,
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
  fontNegrita,
}) {
  const chipHeight = 32;
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
      6.4,
      chipWidth,
      y - 13,
      PALETTE.gray600,
      chipX
    );

    dibujarTextoCentrado(
      page,
      chip.value,
      fontNegrita,
      11,
      chipWidth,
      y - 26,
      PALETTE.primary,
      chipX
    );
  });

  return y - chipHeight;
}

/*
 * ============================================================
 * FILA DE ENCOMIENDA — CUERPO RESUMIDO, 2 LÍNEAS
 *
 * Línea 1: N°  |  CPE (primer elemento)  |  Remitente (número
 *          de documento + nombre, SIN label "DNI"/"RUC")  |
 *          Destinatario (ídem)
 * Línea 2: Descripción de la encomienda, a todo el ancho
 *          disponible, para evitar cortes de texto.
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

  /*
   * Columnas de la línea 1: N° | CPE | Remitente | Destinatario
   */
  const colItem = marginLeft + 6;
  const colCpe = marginLeft + 24;
  const colRemitente = marginLeft + contentWidth * 0.32;
  const colDestinatario = marginLeft + contentWidth * 0.66;

  const anchoCpe = colRemitente - colCpe - 6;
  const anchoRemitente = colDestinatario - colRemitente - 6;
  const anchoDestinatario =
    marginLeft + contentWidth - colDestinatario - 4;

  const item = primero(detalle.item, index + 1);
  const cpe = referenciaEncomienda(detalle);

  const numeroDocRemitente = soloNumeroDocumento(
    detalle.cliente_documento_id
  );

  const numeroDocDestinatario = soloNumeroDocumento(
    detalle.destinatario_documento_id
  );

  /*
   * LÍNEA 1
   */

  const yLinea1 = top + alturaFila - 10;

  page.drawText(String(item), {
    x: colItem,
    y: yLinea1,
    size: 7.4,
    font: fontNegrita,
    color: PALETTE.primary,
  });

  page.drawText(
    truncarTexto(cpe, font, 7, anchoCpe),
    {
      x: colCpe,
      y: yLinea1,
      size: 7,
      font,
      color: PALETTE.gray600,
    }
  );

  page.drawText(
    truncarTexto(
      `${numeroDocRemitente}  ${texto(detalle.cliente, '-')}`,
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
      `${numeroDocDestinatario}  ${texto(detalle.destinatario, '-')}`,
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
   * LÍNEA 2 — descripción a todo lo ancho, para minimizar cortes
   */

  const yLinea2 = top + alturaFila - 20;

  const anchoDescripcion = contentWidth - 12;

  page.drawText(
    truncarTexto(
      texto(detalle.descripcion, 'ENCOMIENDA'),
      font,
      7,
      anchoDescripcion
    ),
    {
      x: colCpe,
      y: yLinea2,
      size: 7,
      font: fontNegrita,
      color: PALETTE.ink,
    }
  );

  return top - 3;
}

/*
 * ============================================================
 * CAMPO GENERAL (label + valor con wrap, para secciones de cabecera)
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

  page.drawText(etiqueta, {
    x,
    y,
    size: 7.2,
    font: fontNegrita,
    color: PALETTE.gray600,
  });

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

  page.drawText(titulo, {
    x: x + 9,
    y: y - 11.5,
    size: 8,
    font: fontNegrita,
    color: oscuro ? PALETTE.white : PALETTE.ink,
  });

  return y - 25;
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

/*
 * ============================================================
 * ENVOLVER TEXTO
 * ============================================================
 */

function envolverTexto(text, maxWidth, fontSize, font) {
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
  const lines = envolverTexto(text, maxWidth, fontSize, font);

  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      size: fontSize,
      font,
      color,
    });
  });

  return y - lines.length * lineHeight;
}

module.exports = gremgenerapdfa4resumen;
