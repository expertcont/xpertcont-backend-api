const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');

const W = 226.77;
const H = 650;
const M = 12;
const CW = W - (M * 2);
const INK = rgb(0.03, 0.035, 0.045);
const MUTED = rgb(0.34, 0.35, 0.37);
const LINE = rgb(0.7, 0.71, 0.73);
const LIGHT_LINE = rgb(0.82, 0.83, 0.85);
const SOFT = rgb(0.94, 0.945, 0.955);
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

const dotted = (page, y, x1 = M, x2 = W - M) => {
  for (let x = x1; x < x2; x += 5) {
    page.drawCircle({ x, y, size: 0.65, color: LINE });
  }
};

const box = (page, x, y, width, height, fill = WHITE, border = LINE, borderWidth = 0.55) => {
  page.drawRectangle({ x, y, width, height, color: fill, borderColor: border, borderWidth });
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

const labelValue = (page, label, value, x, y, labelWidth, valueWidth, fonts, valueBold = true) => {
  text(page, label, x, y, 5.9, fonts.bold, MUTED, labelWidth);
  text(page, value || '-', x + labelWidth, y, 6.9, valueBold ? fonts.bold : fonts.regular, INK, valueWidth);
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

const generarPdfTicketEncomiendaV2 = async (logo, jsonTicket) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([W, H]);
  const regular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fonts = { regular, bold };

  const empresa = jsonTicket.empresa || {};
  const venta = jsonTicket.venta || {};
  const encomienda = jsonTicket.encomienda || {};
  const cliente = jsonTicket.cliente || {};
  const code = venta.codigo || encomienda.r_cod || '03';
  const serie = venta.serie || encomienda.r_serie || '';
  const number = venta.numero || encomienda.r_numero || '';
  const fullNumber = [code, serie, number].filter(Boolean).join('-');
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
  const paymentMethod = clean(venta.medio_pago || encomienda.medio_pago || 'EFECTIVO').toUpperCase();
  const content = encomienda.descripcion || jsonTicket.items?.[0]?.producto || 'SERVICIO DE TRANSPORTE DE ENCOMIENDA';
  const observations = clean(encomienda.observaciones || encomienda.observacion || (encomienda.numero_rdi ? `RDI: ${encomienda.numero_rdi}` : '-'));
  const qrText = [empresa.ruc, code, serie, number, issueDate, senderDoc, total].map(clean).join('|');

  const logoImage = await embedLogo(pdfDoc, logo);
  const qrDataUrl = await QRCode.toDataURL(qrText || fullNumber || empresa.ruc || 'XPERTCONT');
  const qrImage = await pdfDoc.embedPng(base64ToBytes(qrDataUrl.split(',')[1]));

  if (logoImage) {
    const scale = Math.min(152 / logoImage.width, 42 / logoImage.height);
    const logoWidth = logoImage.width * scale;
    const logoHeight = logoImage.height * scale;
    page.drawImage(logoImage, {
      x: (W - logoWidth) / 2,
      y: 596,
      width: logoWidth,
      height: logoHeight,
    });
  } else {
    centered(page, 'TRANSPORTE DE ENCOMIENDAS', 616, 10.5, bold);
  }

  wrap(empresa.razon_social || empresa.nombre_comercial || 'TRANSPORTE DE ENCOMIENDAS', bold, 7.1, CW, 2)
    .forEach((item, index) => centered(page, item, 574 - (index * 8), 7.1, bold));
  centered(page, `RUC ${empresa.ruc || ''}`, 548, 15.8, bold);
  wrap(empresa.domicilio_fiscal || '', regular, 5.8, CW, 2)
    .forEach((item, index) => centered(page, item, 531 - (index * 6.8), 5.8, regular, MUTED));

  line(page, 510, M, W - M, 0.7);
  centered(page, documentName(code), 491, 9.5, bold);
  centered(page, fullNumber || 'MODELO', 466, 18.5, bold);
  labelValue(page, 'FECHA', datePe(issueDate), 43, 445, 27, 45, fonts, false);
  line(page, 443, 113, 113, 0.45);
  labelValue(page, 'HORA', timePe(issueTime), 129, 445, 24, 52, fonts, false);
  dotted(page, 425);

  pill(page, 'SALIDA', M, 397, 45, fonts);
  text(page, String(origin).toUpperCase(), M + 54, 397, 15.2, bold, INK, CW - 58);
  line(page, 384, M + 54, W - M, 0.45, LIGHT_LINE);
  text(page, 'RUTA DE ENCOMIENDA', M, 373, 6.2, bold, MUTED, 86);
  page.drawLine({ start: { x: 94, y: 375 }, end: { x: 154, y: 375 }, thickness: 0.8, color: INK, dashArray: [2, 4] });
  text(page, '>', 158, 369, 13, bold);
  text(page, 'BUS', 174, 373, 6.2, bold, MUTED, 28);
  pill(page, 'LLEGADA', M, 348, 45, fonts);
  text(page, String(destination).toUpperCase(), M + 54, 348, 15.2, bold, INK, CW - 58);
  line(page, 335);

  const half = (CW - 12) / 2;
  text(page, 'REMITENTE', M, 315, 7.1, bold);
  text(page, 'DESTINATARIO', M + half + 12, 315, 7.1, bold);
  wrap(senderName, bold, 7, half, 2).forEach((item, index) => text(page, item, M, 300 - (index * 8), 7, bold, INK, half));
  wrap(receiverName, bold, 7, half, 2).forEach((item, index) => text(page, item, M + half + 12, 300 - (index * 8), 7, bold, INK, half));
  page.drawLine({ start: { x: M + half + 6, y: 319 }, end: { x: M + half + 6, y: 265 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  line(page, 277, M, M + half, 0.4);
  line(page, 277, M + half + 12, W - M, 0.4);
  labelValue(page, 'DOC.', senderDoc, M, 266, 25, half - 25, fonts);
  labelValue(page, 'DOC.', receiverDoc, M + half + 12, 266, 25, half - 25, fonts);
  labelValue(page, 'TEL.', encomienda.cliente_telefono || '-', M, 254, 25, half - 25, fonts, false);
  labelValue(page, 'TEL.', encomienda.destinatario_telefono || '-', M + half + 12, 254, 25, half - 25, fonts, false);

  box(page, M, 178, CW, 60, SOFT, LINE, 0.45);
  text(page, 'ENCOMIENDA', M + 8, 221, 8.6, bold);
  labelValue(page, 'UNIDAD', unit, M + 96, 221, 28, 72, fonts);
  line(page, 209, M + 8, W - M - 8, 0.45);
  text(page, 'CONTENIDO', M + 8, 196, 6.3, bold, MUTED);
  text(page, String(content).toUpperCase(), M + 8, 184, 10.8, bold, INK, CW - 16);
  labelValue(page, 'OBS.', observations || '-', M + 8, 166, 24, CW - 40, fonts, false);

  box(page, M, 78, CW, 76, WHITE, LIGHT_LINE, 0.75);
  page.drawCircle({ x: M, y: 120, size: 5, color: WHITE, borderColor: INK, borderWidth: 0.75 });
  page.drawCircle({ x: W - M, y: 120, size: 5, color: WHITE, borderColor: INK, borderWidth: 0.75 });
  page.drawImage(qrImage, { x: M + 8, y: 90, width: 53, height: 53 });
  page.drawLine({ start: { x: 75, y: 89 }, end: { x: 75, y: 143 }, thickness: 0.45, color: LIGHT_LINE, dashArray: [2, 3] });
  page.drawLine({ start: { x: 136, y: 89 }, end: { x: 136, y: 143 }, thickness: 0.45, color: LIGHT_LINE, dashArray: [2, 3] });
  text(page, 'CONDICION', 84, 137, 6.1, bold, MUTED, 44);
  box(page, 83, 113, 46, 18, WHITE, LIGHT_LINE, 0.55);
  centeredIn(page, payment, 83, 118, 46, payment.length > 7 ? 7.2 : 9.2, bold);
  text(page, paymentMethod, 85, 96, paymentMethod.length > 8 ? 6.2 : 6.8, regular, INK, 42);
  text(page, 'TOTAL', 166, 137, 8, bold);
  text(page, 'S/', 143, 114, 9.8, bold);
  right(page, money(total), 100, 21, bold, INK, W - M - 7, 67);

  line(page, 64);
  text(page, 'TERMINOS Y CONDICIONES', M, 47, 6.7, bold);
  wrap('Conserva este ticket para seguimiento y entrega. No se aceptan reclamos por articulos no declarados o embalaje inadecuado.', regular, 6.1, 138, 3)
    .forEach((item, index) => text(page, item, M, 36 - (index * 7.2), 6.1, regular, MUTED, 138));
  page.drawLine({ start: { x: 160, y: 17 }, end: { x: 160, y: 50 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  centered(page, 'GRACIAS', 43, 7, bold, INK, 48);
  text(page, 'POR CONFIAR', 176, 32, 6, regular, INK, 42);
  text(page, 'EN NOSOTROS', 176, 24, 6, regular, INK, 42);

  const pdfBytes = await pdfDoc.save();
  return { estado: true, buffer_pdf: pdfBytes };
};

module.exports = generarPdfTicketEncomiendaV2;
