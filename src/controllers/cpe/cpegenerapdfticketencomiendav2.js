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
  const receiverName = encomienda.destinatario || '-';
  const receiverDoc = encomienda.destinatario_documento || encomienda.destinatario_documento_id || '-';
  const unit = `${clean(encomienda.placa)} ${clean(encomienda.licencia)}`.trim() || '-';
  const payment = clean(encomienda.condicion_pago || venta.forma_pago_id || 'PAGADO').toUpperCase();
  const content = encomienda.descripcion || jsonTicket.items?.[0]?.producto || 'SERVICIO DE TRANSPORTE DE ENCOMIENDA';
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

  // Cabecera del emisor: razon social, RUC y direccion.
  // Espacio entre lineas: razon social usa "index * 5.8".
  // Direccion usa "index * 8.2" para no pisarse por tener letra 7.4.
  // Posicion vertical de cada bloque: cambiar 576, 558 o 543.
  wrap(empresa.razon_social || empresa.nombre_comercial || 'TRANSPORTE DE ENCOMIENDAS', regular, 7.8, CW, 2)
    .forEach((item, index) => centered(page, item, 576 - (index * 5.8), 7.8, regular));
  centered(page, `RUC ${empresa.ruc || ''}`, 558, 13.8, bold);
  wrap(empresa.domicilio_fiscal || '', regular, 7.4, CW, 2)
    .forEach((item, index) => centered(page, item, 543 - (index * 8.2), 7.4, regular, MUTED));

  // Datos del comprobante: tipo, numero, fecha y hora.
  // Altura del espacio de este bloque: esta entre line(page, 525) y dotted(page, 466).
  // Para compactar mas, acercar esos Y y las lineas internas: 514, 496 y 480.
  line(page, 525, M, W - M, 0.7);
  centered(page, documentName(code), 514, 9.5, regular);
  centeredTracking(page, displayNumber || 'MODELO', 496, 16.8, bold, INK, 0.55, CW - 8);
  text(page, 'FECHA', 39, 480, 6.3, regular, MUTED, 29);
  text(page, datePe(issueDate), 68, 477, 11.4, regular, INK, 52);
  line(page, 478, 113, 113, 0.45);
  text(page, 'HORA', 126, 480, 6.3, regular, MUTED, 26);
  text(page, timePe(issueTime), 152, 477, 11.4, regular, INK, 58);
  dotted(page, 466);

  // Seccion ORIGEN.
  // Altura del espacio: box(page, M, 376, CW, 84, ...).
  // 376 es la base/inicio inferior de la caja; 84 es el alto total.
  // Espacio interno: ajustar 444, 430, 421, 414, 405 y 384.
  // Interlineado del remitente: cambiar "index * 5.8".
  box(page, M, 376, CW, 84, WHITE, LIGHT_LINE, 0.45);
  drawIcon(page, ICONS.place, M + 8, 438, 14, ICON_MUTED);
  text(page, 'ORIGEN', M + 25, 444, 8.1, semibold, MUTED, 46);
  centeredTracking(page, String(origin).toUpperCase(), 430, 17.6, bold, INK, 0.22, CW - 18);
  line(page, 421, M + 8, W - M - 8, 0.45, LIGHT_LINE);
  text(page, 'REMITENTE', M + 8, 414, 7.2, regular, MUTED, 54);
  wrap(senderName, regular, 10.2, CW - 16, 2).forEach((item, index) => {
    text(page, item, M + 8, 404 - (index * 7.4), 10.2, regular, INK, CW - 16);
  });
  text(page, 'DOC.', M + 8, 384, 6.3, regular, MUTED, 24);
  text(page, senderDoc, M + 32, 382.5, 10.2, regular, INK, 66);
  text(page, 'TEL.', M + 109, 384, 6.3, regular, MUTED, 20);
  text(page, encomienda.cliente_telefono || '-', M + 129, 382.5, 10.2, regular, INK, 64);

  // Seccion DESTINO. Mantiene la misma estructura visual que ORIGEN.
  // Altura del espacio: box(page, M, 281, CW, 84, ...).
  // 281 es la base/inicio inferior de la caja; 84 es el alto total.
  // Espacio interno: ajustar 349, 335, 326, 319, 310 y 289.
  // Interlineado del destinatario: cambiar "index * 5.8".
  box(page, M, 281, CW, 84, WHITE, LIGHT_LINE, 0.45);
  drawIcon(page, ICONS.place, M + 8, 343, 14, ICON_MUTED);
  text(page, 'DESTINO', M + 25, 349, 8.1, semibold, MUTED, 52);
  centeredTracking(page, String(destination).toUpperCase(), 335, 17.6, bold, INK, 0.22, CW - 18);
  line(page, 326, M + 8, W - M - 8, 0.45, LIGHT_LINE);
  text(page, 'DESTINATARIO', M + 8, 319, 7.2, regular, MUTED, 64);
  wrap(receiverName, regular, 10.2, CW - 16, 2).forEach((item, index) => {
    text(page, item, M + 8, 309 - (index * 7.4), 10.2, regular, INK, CW - 16);
  });
  text(page, 'DOC.', M + 8, 289, 6.3, regular, MUTED, 24);
  text(page, receiverDoc, M + 32, 287.5, 10.2, regular, INK, 66);
  text(page, 'TEL.', M + 109, 289, 6.3, regular, MUTED, 20);
  text(page, encomienda.destinatario_telefono || '-', M + 129, 287.5, 10.2, regular, INK, 64);

  // Detalle de encomienda: icono, unidad y descripcion del contenido.
  // Altura del espacio: box(page, M, 222, CW, 42, ...).
  // 222 es la base/inicio inferior; 42 es el alto total.
  // El SVG del icono usa la Y como base del dibujo completo.
  // El texto usa la Y como base de la letra, por eso el icono se baja a 245.5
  // para quedar visualmente centrado con el label ENCOMIENDA en y=249.
  // Espacio interno: ajustar 249, 245.5 y 230.
  box(page, M, 222, CW, 42, SOFT, LIGHT_LINE, 0.45);
  drawIcon(page, ICONS.package, M + 8, 245.5, 14, ICON_MUTED);
  text(page, 'ENCOMIENDA', M + 25, 249, 7.8, regular, MUTED, 58);
  text(page, 'UNIDAD', M + 112, 249, 6.3, regular, MUTED, 26);
  text(page, unit, M + 128, 247.5, 10.2, regular, INK, 74);
  text(page, String(content).toUpperCase(), M + 8, 230, 11.6, regular, INK, CW - 16);

  // Resumen inferior: QR a la izquierda, condicion al centro y total a la derecha.
  // Altura del espacio: box(page, M, 140, CW, 76, ...).
  // 140 es la base/inicio inferior; 76 es el alto total. Top = 216.
  // Como encomienda empieza en y=222, el espacio entre ambos queda en 6 puntos.
  // QR: y=152 y alto=53. Condicion: ajustar 173.
  box(page, M, 140, CW, 76, WHITE, LIGHT_LINE, 0.75);
  page.drawImage(qrImage, { x: M + 8, y: 152, width: 53, height: 53 });
  page.drawLine({ start: { x: 75, y: 151 }, end: { x: 75, y: 205 }, thickness: 0.45, color: LIGHT_LINE, dashArray: [2, 3] });
  page.drawLine({ start: { x: 136, y: 151 }, end: { x: 136, y: 205 }, thickness: 0.45, color: LIGHT_LINE, dashArray: [2, 3] });
  centeredIn(page, payment, 77, 173, 58, payment.length > 7 ? 10.2 : 12.2, semibold, payment.includes('COBRAR') ? ALERT : INK);
  text(page, 'TOTAL', 166, 199, 8, regular);
  text(page, 'S/', 143, 176, 9.8, regular);
  right(page, money(total), 162, 21, bold, INK, W - M - 7, 67);

  line(page, 128);
  text(page, 'TERMINOS Y CONDICIONES', M, 114, 6.5, regular);
  wrap('Conserva este ticket para seguimiento y entrega. No se aceptan reclamos por articulos no declarados o embalaje inadecuado.', regular, 6.1, 138, 3)
    .forEach((item, index) => text(page, item, M, 104 - (index * 6.8), 6.1, regular, MUTED, 138));
  page.drawLine({ start: { x: 160, y: 87 }, end: { x: 160, y: 117 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  text(page, 'GRACIAS', 176, 111, 7, semibold, INK, 42);
  text(page, 'POR CONFIAR', 176, 100, 6, regular, INK, 42);
  text(page, 'EN NOSOTROS', 176, 92, 6, regular, INK, 42);

  const pdfBytes = await pdfDoc.save();
  return { estado: true, buffer_pdf: pdfBytes };
};

module.exports = generarPdfTicketEncomiendaV2;
