const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const QRCode = require('qrcode');

const W = 226.77;
const H = 390;
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
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.68 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.32 1.84.55 2.8.68A2 2 0 0 1 22 16.92z',
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

const generarPdfTicketEncomienda = async (logo, jsonTicket) => {
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
  const senderOriginZone = clean(encomienda.remitente_zona || encomienda.cliente_zona);
  const senderPickupAddress = clean(encomienda.remitente_direccion || encomienda.cliente_direccion || cliente.cliente_direccion || cliente.cliente_direccion_fact || cliente.direccion || '');
  const receiverName = encomienda.destinatario || '-';
  const receiverDoc = encomienda.destinatario_documento || encomienda.destinatario_documento_id || '-';
  const receiverArrivalZone = clean(encomienda.destinatario_zona);
  const receiverAddress = clean(encomienda.destinatario_direccion);
  const originOptionalLineHeight = 6.6;
  const senderZoneLines = senderOriginZone ? wrap(senderOriginZone, regular, 7.1, CW - 65, 2) : [];
  const senderPickupAddressLines = senderPickupAddress ? wrap(senderPickupAddress, regular, 7.1, CW - 65, 2) : [];
  const originOptionalLines = senderZoneLines.length + senderPickupAddressLines.length;
  const originTopY = 460;
  const originBaseY = originOptionalLines
    ? 391 - ((originOptionalLines - 1) * originOptionalLineHeight)
    : 400;
  const originHeight = originTopY - originBaseY;
  const destinationOptionalLineHeight = 10.5;
  const receiverZoneLines = receiverArrivalZone ? wrap(receiverArrivalZone.toUpperCase(), semibold, 10.2, CW - 12, 2) : [];
  const receiverAddressLines = receiverAddress ? wrap(receiverAddress.toUpperCase(), semibold, 10.2, CW - 12, 3) : [];
  const destinationOptionalLines = receiverZoneLines.length + receiverAddressLines.length;
  const destinationTopY = 365;
  const destinationBaseY = destinationOptionalLines
    ? 294 - ((destinationOptionalLines - 1) * destinationOptionalLineHeight)
    : 302;
  const destinationHeight = destinationTopY - destinationBaseY;
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
    centered(page, 'TRANSPORTE DE ENCOMIENDAS', H - 34, 10.5, bold);
  }

  // Desplaza todo el cuerpo del ticket desde la razon social hacia abajo.
  // Valor negativo baja el bloque; valor positivo lo sube.
  // Ejemplo: -14 baja todo 14 puntos sin tocar el logo.
  const BODY_Y_OFFSET = -304;
  const bodyY = (value) => value + BODY_Y_OFFSET;
  // Cabecera mas compacta: este valor sube todos los bloques debajo del emisor.
  // Si reduces mas espacios entre razon social/RUC/direccion, aumenta este numero.
  const HEADER_HEIGHT_REDUCTION = 10;
  const afterHeaderY = (value) => bodyY(value + HEADER_HEIGHT_REDUCTION);
  const ticketDestinationY = (value) => value - 194;

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
  // Altura del espacio de este bloque: esta debajo del separador punteado de cabecera.
  // Para compactar mas, acercar esos Y y las lineas internas: 514, 496 y 480.
  dotted(page, afterHeaderY(525));
  centered(page, documentName(code), afterHeaderY(514), 9.5, regular);
  centeredTracking(page, displayNumber || 'MODELO', afterHeaderY(496), 16.8, bold, INK, 0.55, CW - 8);
  text(page, 'FECHA', 39, afterHeaderY(487), 6.3, regular, MUTED, 29);
  text(page, datePe(issueDate), 68, afterHeaderY(484), 11.4, regular, INK, 52);
  line(page, afterHeaderY(485), 113, 113, 0.45);
  text(page, 'HORA', 126, afterHeaderY(487), 6.3, regular, MUTED, 26);
  text(page, timePe(issueTime), 152, afterHeaderY(484), 11.4, regular, INK, 58);

  drawIcon(page, ICONS.place, M + 2, ticketDestinationY(353), 15, ICON_MUTED);
  text(page, 'Dest.', M + 20, ticketDestinationY(347), 9.2, semibold, MUTED, 30);
  centeredTracking(page, String(destination).toUpperCase(), ticketDestinationY(342), 19.8, bold, INK, 0.22, CW - 18);
  line(page, ticketDestinationY(333), M + 8, W - M - 8, 0.45, LIGHT_LINE);
  text(page, 'DESTINATARIO', M + 8, ticketDestinationY(322), 8.2, semibold, MUTED, 58);
  text(page, String(receiverName).toUpperCase(), M + 8, ticketDestinationY(307), 15, semibold, INK, CW - 16);
  text(page, 'DNI:', M + 8, ticketDestinationY(290), 8.6, semibold, MUTED, 22);
  text(page, receiverDoc, M + 34, ticketDestinationY(288), 13.4, semibold, INK, 60);
  drawIcon(page, ICONS.phone, M + 104, ticketDestinationY(291), 11, ICON_MUTED);
  text(page, encomienda.destinatario_telefono || '-', M + 120, ticketDestinationY(288), 13.8, bold, INK, 82);
  receiverZoneLines.forEach((item, index) => {
    const y = 273 - (index * destinationOptionalLineHeight);
    text(page, index === 0 ? 'ZONA:' : '', M + 8, ticketDestinationY(y), 7.2, semibold, MUTED, 26);
    text(page, item, M + 37, ticketDestinationY(y - 1.2), 10.2, semibold, INK, CW - 45);
  });
  receiverAddressLines.forEach((item, index) => {
    const y = 273 - ((receiverZoneLines.length + index) * destinationOptionalLineHeight);
    text(page, index === 0 ? 'DIR:' : '', M + 8, ticketDestinationY(y), 7.2, semibold, MUTED, 23);
    text(page, item, M + 37, ticketDestinationY(y - 1.2), 10.2, semibold, INK, CW - 45);
  });

  page.drawImage(qrImage, { x: (W - 64) / 2, y: 10, width: 64, height: 64 });

  const pdfBytes = await pdfDoc.save();
  return { estado: true, buffer_pdf: pdfBytes };
};

module.exports = generarPdfTicketEncomienda;
