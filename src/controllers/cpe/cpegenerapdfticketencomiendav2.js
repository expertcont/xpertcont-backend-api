const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const QRCode = require('qrcode');

const W = 226.77;
const H = 650;
const M = 12;
const CW = W - (M * 2);

// Medidas base del ticket:
// W/H son ancho y alto de la hoja en puntos PDF.
// M es el margen lateral y CW es el ancho util dentro de ese margen.
// En pdf-lib, y=0 esta abajo y y=H esta arriba.
// Para subir un elemento aumenta su Y; para bajarlo disminuye su Y.
const INK = rgb(0.03, 0.035, 0.045);
const MUTED = rgb(0.34, 0.35, 0.37);
const LINE = rgb(0.7, 0.71, 0.73);
const LIGHT_LINE = rgb(0.82, 0.83, 0.85);
const SOFT = rgb(0.94, 0.945, 0.955);
const ALERT = rgb(0.82, 0.12, 0.12);
const ICON_MUTED = rgb(0.48, 0.5, 0.53);
const WHITE = rgb(1, 1, 1);

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const money = (value) => Number(value || 0).toLocaleString('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const datePe = (value) => {
  const text = String(value || '').slice(0, 10);
  return text ? text.split('-').reverse().join('/') : '-';
};

const timePe = (value) => {
  const text = clean(value);
  if (!text) return '-';
  const time = text.includes('T') ? text.split('T')[1] : text.split(' ')[1] || text;
  const [hour = '0', minute = '00'] = time.split('.')[0].split(':');
  const hourNumber = Number(hour);
  if (!Number.isFinite(hourNumber)) return text;
  const suffix = hourNumber >= 12 ? 'PM' : 'AM';
  const hour12 = hourNumber % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${suffix}`;
};

const documentName = (code) => (code === '01' ? 'FACTURA ELECTRONICA' : 'BOLETA ELECTRONICA');

const base64ToBytes = (base64) => Uint8Array.from(Buffer.from(base64, 'base64'));
const fontPath = (name) => path.join(__dirname, 'fonts', name);

const fit = (text, font, size, maxWidth) => {
  const value = clean(text);
  if (!value) return '';
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;

  let output = value;
  while (output.length > 3 && font.widthOfTextAtSize(`${output}...`, size) > maxWidth) {
    output = output.slice(0, -1);
  }
  return output.length > 3 ? `${output}...` : '';
};

const wrap = (text, font, size, maxWidth, maxLines = 2) => {
  const words = clean(text).split(' ').filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length >= maxLines) break;
  }

  if (line && lines.length < maxLines) lines.push(line);
  if (!lines.length) return [''];
  lines[lines.length - 1] = fit(lines[lines.length - 1], font, size, maxWidth);
  return lines;
};

const wrapPreservingBreaks = (value, font, size, maxWidth, maxLines = 8) => {
  const sourceLines = String(value || '').replace(/\r\n/g, '\n').split('\n');
  const lines = [];

  for (const sourceLine of sourceLines) {
    if (lines.length >= maxLines) break;
    const wrapped = wrap(sourceLine, font, size, maxWidth, maxLines - lines.length);
    lines.push(...(wrapped.length ? wrapped : ['']));
  }

  return lines.slice(0, maxLines);
};

const text = (page, value, x, y, size, font, color = INK, maxWidth = null) => {
  page.drawText(maxWidth ? fit(value, font, size, maxWidth) : clean(value), { x, y, size, font, color });
};

// Texto centrado en el ancho del ticket.
const centered = (page, value, y, size, font, color = INK, maxWidth = CW) => {
  const label = fit(value, font, size, maxWidth);
  const width = font.widthOfTextAtSize(label, size);
  page.drawText(label, { x: (W - width) / 2, y, size, font, color });
};

const right = (page, value, y, size, font, color = INK, rightX = W - M, maxWidth = CW) => {
  const label = fit(value, font, size, maxWidth);
  const width = font.widthOfTextAtSize(label, size);
  page.drawText(label, { x: rightX - width, y, size, font, color });
};

const line = (page, y, x1 = M, x2 = W - M, thickness = 0.55, color = LINE) => {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
};

// Separador punteado. El valor y define la altura del separador.
const dotted = (page, y, x1 = M, x2 = W - M) => {
  for (let x = x1; x < x2; x += 5) {
    page.drawCircle({ x, y, size: 0.65, color: LINE });
  }
};

// Caja de una seccion. x/y son la esquina inferior izquierda.
const box = (page, x, y, width, height, fill = WHITE, border = LINE, borderWidth = 0.55) => {
  page.drawRectangle({ x, y, width, height, color: fill, borderColor: border, borderWidth });
};

const drawIcon = (page, pathData, x, y, size = 12, color = ICON_MUTED) => {
  page.drawSvgPath(pathData, { x, y, scale: size / 24, color });
};

const ICONS = {
  place: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
  package: 'M20 8.69V18c0 .72-.38 1.38-1 1.73l-6 3.46c-.62.36-1.38.36-2 0l-6-3.46A2 2 0 0 1 4 18V8.69c0-.72.38-1.38 1-1.73l6-3.46c.62-.36 1.38-.36 2 0l6 3.46c.62.35 1 1.01 1 1.73zM12 5.23 6.74 8.26 12 11.29l5.26-3.03L12 5.23zm-6 4.76V18l5 2.88v-7.86L6 9.99zm12 0-5 3.03v7.86L18 18V9.99z',
};

const drawTrackingText = (page, value, x, y, size, font, color = INK, tracking = 0.5, maxWidth = null) => {
  const label = maxWidth ? fit(value, font, size, maxWidth) : clean(value);
  let cursor = x;

  for (const character of label) {
    page.drawText(character, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(character, size) + tracking;
  }
};

const centeredTracking = (page, value, y, size, font, color = INK, tracking = 0.5, maxWidth = CW) => {
  const label = fit(value, font, size, maxWidth);
  const width = label
    .split('')
    .reduce((total, character) => total + font.widthOfTextAtSize(character, size) + tracking, 0) - tracking;

  drawTrackingText(page, label, (W - width) / 2, y, size, font, color, tracking);
};

const pill = (page, label, x, y, width, fonts) => {
  box(page, x, y, width, 12, SOFT, LINE, 0.35);
  centeredIn(page, label, x, y + 3.2, width, 6.2, fonts.bold);
};

const centeredIn = (page, value, x, y, width, size, font, color = INK) => {
  const label = fit(value, font, size, width - 4);
  const textWidth = font.widthOfTextAtSize(label, size);
  page.drawText(label, { x: x + ((width - textWidth) / 2), y, size, font, color });
};

// Label y valor en la misma linea. labelWidth controla donde empieza el valor.
const labelValue = (page, label, value, x, y, labelWidth, valueWidth, fonts, valueBold = true) => {
  text(page, label, x, y, 6.3, fonts.regular, MUTED, labelWidth);
  text(page, value || '-', x + labelWidth, y, 7.6, valueBold ? fonts.semibold : fonts.regular, INK, valueWidth);
};

const embedLogo = async (pdfDoc, logo) => {
  if (!logo) return null;
  try {
    return await pdfDoc.embedPng(logo);
  } catch (error) {
    try {
      return await pdfDoc.embedJpg(logo);
    } catch (jpgError) {
      return null;
    }
  }
};

const embedTicketFonts = async (pdfDoc) => {
  pdfDoc.registerFontkit(fontkit);

  try {
    const regular = await pdfDoc.embedFont(fs.readFileSync(fontPath('BarlowCondensed-Regular.ttf')));
    const semibold = await pdfDoc.embedFont(fs.readFileSync(fontPath('BarlowCondensed-SemiBold.ttf')));
    const bold = await pdfDoc.embedFont(fs.readFileSync(fontPath('BarlowCondensed-Bold.ttf')));

    return { regular, semibold, bold };
  } catch (error) {
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const semibold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    return { regular, semibold, bold };
  }
};

const generarPdfTicketEncomiendaV2 = async (logo, jsonTicket) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([W, H]);
  const fonts = await embedTicketFonts(pdfDoc);
  const { regular, semibold, bold } = fonts;

  const empresa = jsonTicket.empresa || {};
  const venta = jsonTicket.venta || {};
  const encomienda = jsonTicket.encomienda || {};
  const cliente = jsonTicket.cliente || {};
  const code = venta.codigo || encomienda.r_cod || '03';
  const serie = venta.serie || encomienda.r_serie || '';
  const number = venta.numero || encomienda.r_numero || '';
  const fullNumber = [code, serie, number].filter(Boolean).join('-');
  const displayNumber = [serie, number].filter(Boolean).join('-') || fullNumber;
  const issueDate = venta.fecha_emision || encomienda.r_fecemi;
  const issueTime = venta.hora_emision || encomienda.ctrl_crea || encomienda.hora_grabacion;
  const total = venta.total || venta.r_monto_total || encomienda.r_monto_total || encomienda.precio_neto;
  const origin = encomienda.punto_venta_nombre || encomienda.id_punto_venta || 'ORIGEN';
  const destination = encomienda.punto_venta_dest_nombre || encomienda.id_punto_venta_dest || 'DESTINO';
  const senderName = encomienda.cliente || cliente.razon_social_nombres || '-';
  const senderDoc = encomienda.cliente_documento || encomienda.cliente_documento_id || cliente.documento_identidad || '-';
  const senderAddress = encomienda.remitente_direccion || encomienda.cliente_direccion || cliente.cliente_direccion || cliente.cliente_direccion_fact || cliente.direccion || '';
  const receiverName = encomienda.destinatario || '-';
  const receiverDoc = encomienda.destinatario_documento || encomienda.destinatario_documento_id || '-';
  const unit = `${clean(encomienda.placa)} ${clean(encomienda.licencia)}`.trim() || '-';
  const payment = clean(encomienda.condicion_pago || venta.forma_pago_id || 'PAGADO').toUpperCase();
  const paymentLabel = payment.includes('COBRAR') ? 'POR PAGAR' : payment;
  const content = encomienda.descripcion || jsonTicket.items?.[0]?.producto || 'SERVICIO DE TRANSPORTE DE ENCOMIENDA';
  const descriptionFontSize = 10.2;
  const descriptionLineHeight = 10;
  const descriptionLines = wrapPreservingBreaks(String(content).toUpperCase(), regular, descriptionFontSize, CW - 16, 8);
  const descriptionLineCount = Math.max(1, descriptionLines.length);
  const encomiendaTopY = 264;
  const encomiendaBaseY = 232 - ((descriptionLineCount - 1) * descriptionLineHeight) - 12;
  const encomiendaHeight = encomiendaTopY - encomiendaBaseY;
  const dynamicSummaryShift = encomiendaBaseY - 169;
  const qrText = [empresa.ruc, code, serie, number, issueDate, senderDoc, total].map(clean).join('|');

  const logoImage = await embedLogo(pdfDoc, logo);
  const qrDataUrl = await QRCode.toDataURL(qrText || displayNumber || empresa.ruc || 'XPERTCONT');
  const qrImage = await pdfDoc.embedPng(base64ToBytes(qrDataUrl.split(',')[1]));

  // Logo superior.
  // La imagen puede venir en pixeles grandes, por ejemplo 380x130.
  // pdf-lib interpreta width/height como puntos PDF, no como pixeles de pantalla.
  // Por eso se escala proporcionalmente para que entre en el ticket.
  if (logoImage) {
    const scale = Math.min(190 / logoImage.width, 65 / logoImage.height);
    const logoWidth = logoImage.width * scale;
    const logoHeight = logoImage.height * scale;
    const logoX = (W - logoWidth) / 2;
    const logoY = H - logoHeight - 12;
    page.drawImage(logoImage, {
      x: logoX,
      y: logoY,
      width: logoWidth,
      height: logoHeight,
    });
  } else {
    centered(page, 'TRANSPORTE DE ENCOMIENDAS', 616, 10.5, bold);
  }

  // Desplaza todo el cuerpo del ticket desde la razon social hacia abajo.
  // Valor negativo baja el bloque; valor positivo lo sube.
  // Ejemplo: -14 baja todo 14 puntos sin tocar el logo.
  const BODY_Y_OFFSET = -14;
  const bodyY = (value) => value + BODY_Y_OFFSET;
  // Cabecera mas compacta: este valor sube todos los bloques debajo del emisor.
  // Si reduces mas espacios entre razon social/RUC/direccion, aumenta este numero.
  const HEADER_HEIGHT_REDUCTION = 10;
  const afterHeaderY = (value) => bodyY(value + HEADER_HEIGHT_REDUCTION);
  // ORIGEN ocupa menos alto que antes para que DESTINO tenga mas protagonismo.
  // Si cambias ORIGIN_HEIGHT_REDUCTION, todo lo posterior sube/baja parejo.
  const ORIGIN_HEIGHT_REDUCTION = 34;
  // ORIGIN_TO_DATE_SHIFT acerca ORIGEN a la linea punteada debajo de fecha/hora.
  // Tambien mueve todo lo posterior para no abrir huecos nuevos.
  const ORIGIN_TO_DATE_SHIFT = 11;
  const originY = (value) => afterHeaderY(value + ORIGIN_TO_DATE_SHIFT);
  const afterOriginY = (value) => afterHeaderY(value + ORIGIN_HEIGHT_REDUCTION + ORIGIN_TO_DATE_SHIFT);
  // Ajustes de separacion entre los ultimos bloques.
  // ENCOMIENDA_Y_SHIFT sube/baja encomienda sin tocar destino.
  // SUMMARY_Y_SHIFT sube/baja QR/total y el pie en conjunto.
  const ENCOMIENDA_Y_SHIFT = 22;
  const SUMMARY_Y_SHIFT = dynamicSummaryShift;
  const encomiendaY = (value) => afterOriginY(value + ENCOMIENDA_Y_SHIFT);
  const summaryY = (value) => afterOriginY(value + SUMMARY_Y_SHIFT);

  // Cabecera del emisor: razon social, RUC y direccion.
  // Espacio entre lineas: razon social usa "index * 5.8".
  // Direccion usa "index * 8.2" para no pisarse por tener letra 7.4.
  // Posicion vertical de cada bloque: cambiar 576, 563 o 550.
  wrap(empresa.razon_social || empresa.nombre_comercial || 'TRANSPORTE DE ENCOMIENDAS', regular, 7.8, CW, 2)
    .forEach((item, index) => centered(page, item, bodyY(576 - (index * 5.8)), 7.8, regular));
  centered(page, `RUC ${empresa.ruc || ''}`, bodyY(563), 13.8, bold);
  wrap(empresa.domicilio_fiscal || '', regular, 7.4, CW, 2)
    .forEach((item, index) => centered(page, item, bodyY(550 - (index * 8.2)), 7.4, regular, MUTED));

  // Datos del comprobante: tipo, numero, fecha y hora.
  // Altura del espacio de este bloque: esta entre line(page, 525) y dotted(page, 466).
  // Para compactar mas, acercar esos Y y las lineas internas: 514, 496 y 480.
  line(page, afterHeaderY(525), M, W - M, 0.7);
  centered(page, documentName(code), afterHeaderY(514), 9.5, regular);
  centeredTracking(page, displayNumber || 'MODELO', afterHeaderY(496), 16.8, bold, INK, 0.55, CW - 8);
  text(page, 'FECHA', 39, afterHeaderY(487), 6.3, regular, MUTED, 29);
  text(page, datePe(issueDate), 68, afterHeaderY(484), 11.4, regular, INK, 52);
  line(page, afterHeaderY(485), 113, 113, 0.45);
  text(page, 'HORA', 126, afterHeaderY(487), 6.3, regular, MUTED, 26);
  text(page, timePe(issueTime), 152, afterHeaderY(484), 11.4, regular, INK, 58);
  dotted(page, afterHeaderY(475));

  // Seccion ORIGEN.
  // Altura del espacio: box(page, M, 400, CW, 60, ...).
  // 400 es la base/inicio inferior de la caja; 60 es el alto total.
  // Label ORIGEN va junto al icono para no gastar una linea completa.
  // Espacio interno: ajustar 450, 440, 433, 427, 418, 407 y 401.
  // Interlineado del remitente: cambiar "index * 5.8".
  box(page, M, originY(400), CW, 60, WHITE, LIGHT_LINE, 0.45);
  drawIcon(page, ICONS.place, M + 8, originY(448), 11, ICON_MUTED);
  text(page, 'ORIGEN', M + 24, originY(450), 7.2, semibold, MUTED, 44);
  centeredTracking(page, String(origin).toUpperCase(), originY(440), 13.2, regular, INK, 0.12, CW - 18);
  line(page, originY(433), M + 8, W - M - 8, 0.45, LIGHT_LINE);
  text(page, 'REMITENTE', M + 8, originY(427), 7.2, regular, MUTED, 54);
  wrap(senderName, regular, 10.2, CW - 16, 2).forEach((item, index) => {
    text(page, item, M + 8, originY(418 - (index * 6.4)), 10.2, regular, INK, CW - 16);
  });
  text(page, 'DOC.', M + 8, originY(407), 6.3, regular, MUTED, 24);
  text(page, senderDoc, M + 32, originY(406), 10.2, regular, INK, 66);
  text(page, 'TEL.', M + 109, originY(407), 6.3, regular, MUTED, 20);
  text(page, encomienda.cliente_telefono || '-', M + 129, originY(406), 10.2, regular, INK, 64);
  if (senderAddress) {
    text(page, 'DIR.', M + 8, originY(401), 5.6, regular, MUTED, 20);
    text(page, senderAddress, M + 30, originY(400.5), 6.6, regular, INK, CW - 42);
  }

  // Seccion DESTINO. Mantiene la misma estructura visual que ORIGEN.
  // Altura del espacio: box(page, M, 291, CW, 74, ...).
  // 291 es la base/inicio inferior de la caja; 74 es el alto total.
  // Label DESTINO va junto al icono para no gastar una linea completa.
  // Espacio interno: ajustar 346, 342, 333, 326, 316 y 299.
  // Interlineado del destinatario: cambiar "index * 5.8".
  box(page, M, afterOriginY(291), CW, 74, WHITE, LIGHT_LINE, 0.45);
  drawIcon(page, ICONS.place, M + 8, afterOriginY(343), 14, ICON_MUTED);
  text(page, 'DESTINO', M + 25, afterOriginY(346), 8.1, semibold, MUTED, 52);
  centeredTracking(page, String(destination).toUpperCase(), afterOriginY(342), 17.6, bold, INK, 0.22, CW - 18);
  line(page, afterOriginY(333), M + 8, W - M - 8, 0.45, LIGHT_LINE);
  text(page, 'DESTINATARIO', M + 8, afterOriginY(326), 7.2, regular, MUTED, 64);
  wrap(receiverName, regular, 10.2, CW - 16, 2).forEach((item, index) => {
    text(page, item, M + 8, afterOriginY(316 - (index * 7.4)), 10.2, regular, INK, CW - 16);
  });
  text(page, 'DOC.', M + 8, afterOriginY(299), 6.3, regular, MUTED, 24);
  text(page, receiverDoc, M + 32, afterOriginY(297.5), 10.2, regular, INK, 66);
  text(page, 'TEL.', M + 109, afterOriginY(299), 6.3, regular, MUTED, 20);
  text(page, encomienda.destinatario_telefono || '-', M + 129, afterOriginY(297.5), 10.2, regular, INK, 64);

  // Detalle de encomienda: icono, unidad y descripcion del contenido.
  // Altura dinamica: encomiendaBaseY es la base inferior y encomiendaHeight el alto.
  // El top queda fijo en 264; si hay mas lineas, la caja crece hacia abajo.
  // El SVG del icono usa la Y como base del dibujo completo.
  // Icono ENCOMIENDA: ajustar 253 si se ve arriba/abajo del label.
  // Descripcion multilinea: respeta saltos manuales y envuelve lineas largas.
  box(page, M, encomiendaY(encomiendaBaseY), CW, encomiendaHeight, SOFT, LIGHT_LINE, 0.45);
  drawIcon(page, ICONS.package, M + 8, encomiendaY(263), 14, ICON_MUTED);
  text(page, 'ENCOMIENDA', M + 25, encomiendaY(249), 10.2, regular, MUTED, 58);
  text(page, 'UNIDAD', M + 100, encomiendaY(249), 10.2, regular, MUTED, 26);
  text(page, unit, M + 128, encomiendaY(247.5), 10.2, regular, INK, 74);
  descriptionLines.forEach((item, index) => {
    text(page, item, M + 8, encomiendaY(232 - (index * descriptionLineHeight)), descriptionFontSize, regular, INK, CW - 16);
  });

  // Resumen inferior: QR a la izquierda, condicion al centro y total a la derecha.
  // Altura del espacio: box(page, M, 114, CW, 62, ...).
  // 114 es la base/inicio inferior; 62 es el alto total. Top = 176.
  // SUMMARY_Y_SHIFT se calcula con la base dinamica de ENCOMIENDA.
  // Asi QR/total sube o baja sin descuadrarse cuando cambia la descripcion.
  // QR: y=119 y alto=53. Estado de pago: ajustar 145.
  box(page, M, summaryY(114), CW, 62, WHITE, LIGHT_LINE, 0.75);
  page.drawImage(qrImage, { x: M + 8, y: summaryY(119), width: 53, height: 53 });
  page.drawLine({ start: { x: 75, y: summaryY(118) }, end: { x: 75, y: summaryY(173) }, thickness: 0.45, color: LIGHT_LINE, dashArray: [2, 3] });
  page.drawLine({ start: { x: 136, y: summaryY(118) }, end: { x: 136, y: summaryY(173) }, thickness: 0.45, color: LIGHT_LINE, dashArray: [2, 3] });
  if (payment.includes('COBRAR')) {
    centeredIn(page, 'POR', 77, summaryY(150), 58, 19.2, bold, ALERT);
    centeredIn(page, 'PAGAR', 77, summaryY(128), 58, 19.2, bold, ALERT);
  } else {
    centeredIn(page, paymentLabel, 77, summaryY(140), 58, 14.8, semibold, INK);
  }
  centeredIn(page, 'TOTAL', W - M - 7 - 67, summaryY(164), 67, 8, regular);
  centeredIn(page, 'S/', W - M - 7 - 67, summaryY(149), 67, 9.8, regular);
  right(page, money(total), summaryY(127), 21, bold, INK, W - M - 7, 67);

  line(page, summaryY(102));
  text(page, 'TERMINOS Y CONDICIONES', M, summaryY(88), 6.5, regular);
  wrap('Conserva este ticket para seguimiento y entrega. No se aceptan reclamos por articulos no declarados o embalaje inadecuado.', regular, 6.1, 138, 3)
    .forEach((item, index) => text(page, item, M, summaryY(78 - (index * 6.8)), 6.1, regular, MUTED, 138));
  page.drawLine({ start: { x: 160, y: summaryY(61) }, end: { x: 160, y: summaryY(91) }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  text(page, 'GRACIAS', 176, summaryY(85), 7, semibold, INK, 42);
  text(page, 'POR CONFIAR', 176, summaryY(74), 6, regular, INK, 42);
  text(page, 'EN NOSOTROS', 176, summaryY(66), 6, regular, INK, 42);

  const pdfBytes = await pdfDoc.save();
  return { estado: true, buffer_pdf: pdfBytes };
};

module.exports = generarPdfTicketEncomiendaV2;
