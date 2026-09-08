const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');

const TICKET_WIDTH = 226.77;
const TICKET_HEIGHT = 690;
const MARGIN = 12;
const CONTENT_WIDTH = TICKET_WIDTH - (MARGIN * 2);

const INK = rgb(0.06, 0.07, 0.08);
const MUTED = rgb(0.35, 0.36, 0.39);
const LINE = rgb(0.65, 0.66, 0.68);
const SOFT = rgb(0.91, 0.92, 0.94);
const PANEL = rgb(0.965, 0.97, 0.975);
const PAPER = rgb(1, 1, 1);

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const money = (value) => Number(value || 0).toLocaleString('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fecha = (value) => {
  const text = String(value || '').slice(0, 10);
  return text ? text.split('-').reverse().join('/') : '';
};

const horaAmPm = (value) => {
  const text = String(value || '').trim();
  if (!text) return '-';
  const horaTexto = text.includes('T') ? text.split('T')[1] : text.split(' ')[1] || text;
  const [hora = '0', minuto = '00'] = horaTexto.split('.')[0].split(':');
  const horaNumero = Number(hora);
  if (!Number.isFinite(horaNumero)) return cleanText(value);
  const periodo = horaNumero >= 12 ? 'PM' : 'AM';
  const hora12 = horaNumero % 12 || 12;
  return `${String(hora12).padStart(2, '0')}:${String(minuto).padStart(2, '0')} ${periodo}`;
};

const comprobanteNombre = (rCod) => (rCod === '01' ? 'FACTURA ELECTRONICA' : 'BOLETA ELECTRONICA');

const base64ToUint8Array = (base64) => Uint8Array.from(Buffer.from(base64, 'base64'));

const fitText = (text, font, size, maxWidth) => {
  const value = cleanText(text);
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;

  let output = value;
  while (output.length > 3 && font.widthOfTextAtSize(`${output}...`, size) > maxWidth) {
    output = output.slice(0, -1);
  }

  return output.length > 3 ? `${output}...` : '';
};

const wrapText = (text, font, size, maxWidth, maxLines = 2) => {
  const words = cleanText(text).split(' ').filter(Boolean);
  const lines = [];
  let line = '';

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      return;
    }
    if (line && lines.length < maxLines) lines.push(line);
    line = word;
  });

  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.length) {
    lines[lines.length - 1] = fitText(lines[lines.length - 1], font, size, maxWidth);
  }
  return lines.length ? lines : [''];
};

const drawCentered = (page, text, y, size, font, color = INK, maxWidth = CONTENT_WIDTH) => {
  const label = fitText(text, font, size, maxWidth);
  const width = font.widthOfTextAtSize(label, size);
  page.drawText(label, {
    x: Math.max(MARGIN, (TICKET_WIDTH - width) / 2),
    y,
    size,
    font,
    color,
  });
};

const drawRight = (page, text, y, size, font, color = INK, right = TICKET_WIDTH - MARGIN, maxWidth = CONTENT_WIDTH) => {
  const label = fitText(text, font, size, maxWidth);
  const width = font.widthOfTextAtSize(label, size);
  page.drawText(label, { x: right - width, y, size, font, color });
};

const drawDottedLine = (page, y, x1 = MARGIN, x2 = TICKET_WIDTH - MARGIN) => {
  for (let x = x1; x < x2; x += 5) {
    page.drawCircle({ x, y, size: 0.75, color: LINE });
  }
};

const drawChip = (page, text, x, y, width, fonts) => {
  page.drawRectangle({ x, y, width, height: 13, color: SOFT, borderColor: LINE, borderWidth: 0.35 });
  drawCenteredInBox(page, text, x, y + 3.3, width, 6.9, fonts.bold, INK);
};

const drawCenteredInBox = (page, text, x, y, width, size, font, color = INK) => {
  const label = fitText(text, font, size, width - 4);
  const textWidth = font.widthOfTextAtSize(label, size);
  page.drawText(label, { x: x + Math.max(2, (width - textWidth) / 2), y, size, font, color });
};

const drawCalendarIcon = (page, x, y, color = INK) => {
  page.drawRectangle({ x, y, width: 8.5, height: 8.5, borderColor: color, borderWidth: 0.8 });
  page.drawLine({ start: { x, y: y + 5.8 }, end: { x: x + 8.5, y: y + 5.8 }, thickness: 0.65, color });
  page.drawLine({ start: { x: x + 2, y: y + 10 }, end: { x: x + 2, y: y + 7.2 }, thickness: 0.9, color });
  page.drawLine({ start: { x: x + 6.4, y: y + 10 }, end: { x: x + 6.4, y: y + 7.2 }, thickness: 0.9, color });
};

const drawClockIcon = (page, x, y, color = INK) => {
  page.drawCircle({ x: x + 4.7, y: y + 4.7, size: 4.5, borderColor: color, borderWidth: 0.8 });
  page.drawLine({ start: { x: x + 4.7, y: y + 4.7 }, end: { x: x + 4.7, y: y + 7.5 }, thickness: 0.75, color });
  page.drawLine({ start: { x: x + 4.7, y: y + 4.7 }, end: { x: x + 6.8, y: y + 3.6 }, thickness: 0.75, color });
};

const drawDateTimeRow = (page, dateText, timeText, y, fonts) => {
  const dateLabel = `FECHA ${fecha(dateText)}`;
  const timeLabel = `HORA ${horaAmPm(timeText)}`;
  const dateWidth = fonts.regular.widthOfTextAtSize(dateLabel, 7.4);
  const timeWidth = fonts.regular.widthOfTextAtSize(timeLabel, 7.4);
  const totalWidth = 10 + dateWidth + 14 + 10 + timeWidth;
  let x = Math.max(MARGIN, (TICKET_WIDTH - totalWidth) / 2);

  drawCalendarIcon(page, x, y - 2);
  x += 12;
  page.drawText(dateLabel, { x, y, size: 7.4, font: fonts.regular, color: INK });
  x += dateWidth + 7;
  page.drawLine({ start: { x, y: y - 1 }, end: { x, y: y + 10 }, thickness: 0.45, color: LINE });
  x += 7;
  drawClockIcon(page, x, y - 2);
  x += 12;
  page.drawText(timeLabel, { x, y, size: 7.4, font: fonts.regular, color: INK });
};

const drawVanRight = (page, x, y, color = INK) => {
  page.drawLine({ start: { x: x - 14, y: y + 11 }, end: { x: x - 3, y: y + 11 }, thickness: 0.7, color });
  page.drawLine({ start: { x: x - 10, y: y + 15 }, end: { x: x - 2, y: y + 15 }, thickness: 0.6, color });
  page.drawRectangle({ x, y: y + 5, width: 31, height: 11, color });
  page.drawRectangle({ x: x + 7, y: y + 14, width: 13, height: 7, color });
  page.drawRectangle({ x: x + 3.5, y: y + 10, width: 8, height: 5, color: PAPER });
  page.drawRectangle({ x: x + 13.5, y: y + 10, width: 7, height: 5, color: PAPER });
  page.drawRectangle({ x: x + 27, y: y + 8, width: 6, height: 5, color });
  page.drawCircle({ x: x + 8, y: y + 4.7, size: 3.2, color });
  page.drawCircle({ x: x + 8, y: y + 4.7, size: 1.35, color: PAPER });
  page.drawCircle({ x: x + 25, y: y + 4.7, size: 3.2, color });
  page.drawCircle({ x: x + 25, y: y + 4.7, size: 1.35, color: PAPER });
};

const drawPersonIcon = (page, x, y, color = INK) => {
  page.drawCircle({ x: x + 5, y: y + 5, size: 5, color });
  page.drawCircle({ x: x + 5, y: y + 6.8, size: 1.5, color: PAPER });
  page.drawSvgPath('M1.8 2 C2.6 3.9 3.8 4.8 5 4.8 C6.2 4.8 7.4 3.9 8.2 2 Z', { x, y, color: PAPER });
};

const drawPackageIcon = (page, x, y, color = INK) => {
  page.drawRectangle({ x, y, width: 12, height: 12, borderColor: color, borderWidth: 0.9 });
  page.drawLine({ start: { x, y: y + 8 }, end: { x: x + 6, y: y + 12 }, thickness: 0.8, color });
  page.drawLine({ start: { x: x + 12, y: y + 8 }, end: { x: x + 6, y: y + 12 }, thickness: 0.8, color });
  page.drawLine({ start: { x: x + 6, y: y + 12 }, end: { x: x + 6, y }, thickness: 0.8, color });
};

const drawCardIcon = (page, x, y, color = INK) => {
  page.drawRectangle({ x, y, width: 13, height: 9, borderColor: color, borderWidth: 0.8 });
  page.drawLine({ start: { x: x + 1.2, y: y + 6 }, end: { x: x + 11.8, y: y + 6 }, thickness: 0.7, color });
};

const drawInfoBlock = (page, title, name, documentLabel, documentValue, phoneValue, x, y, width, fonts) => {
  drawPersonIcon(page, x, y + 1);
  page.drawText(title, { x: x + 14, y: y + 7, size: 7.2, font: fonts.bold, color: INK });

  wrapText(name || '-', fonts.bold, 7.4, width, 2).forEach((line, index) => {
    page.drawText(line, { x, y: y - 7 - (index * 8.5), size: 7.4, font: fonts.bold, color: INK });
  });

  page.drawLine({ start: { x, y: y - 27 }, end: { x: x + width, y: y - 27 }, thickness: 0.4, color: LINE, dashArray: [2, 3] });
  page.drawText(documentLabel, { x, y: y - 37, size: 6.6, font: fonts.regular, color: INK });
  page.drawText(fitText(documentValue || '-', fonts.bold, 6.8, width - 45), { x: x + 45, y: y - 37, size: 6.8, font: fonts.bold, color: INK });
  page.drawText('TELEFONO', { x, y: y - 47, size: 6.6, font: fonts.regular, color: INK });
  page.drawText(fitText(phoneValue || '-', fonts.regular, 6.8, width - 45), { x: x + 45, y: y - 47, size: 6.8, font: fonts.regular, color: INK });
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

const cpegenerapdfticketencomienda = async (logo, jsonTicket) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([TICKET_WIDTH, TICKET_HEIGHT]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  const empresa = jsonTicket.empresa || {};
  const venta = jsonTicket.venta || {};
  const encomienda = jsonTicket.encomienda || {};
  const codigo = venta.codigo || encomienda.r_cod || '03';
  const serie = venta.serie || encomienda.r_serie || '';
  const numeroVenta = venta.numero || encomienda.r_numero || '';
  const numero = [codigo, serie, numeroVenta].filter(Boolean).join('-');
  const fechaEmision = venta.fecha_emision || encomienda.r_fecemi;
  const horaEmision = venta.hora_emision || encomienda.ctrl_crea || encomienda.hora_grabacion;
  const total = venta.total || venta.r_monto_total || encomienda.r_monto_total || encomienda.precio_neto;
  const clienteDocumento = encomienda.cliente_documento || encomienda.cliente_documento_id || jsonTicket.cliente?.documento_identidad;
  const destinatarioDocumento = encomienda.destinatario_documento || encomienda.destinatario_documento_id;
  const agenciaOrigen = encomienda.punto_venta_nombre || encomienda.id_punto_venta || 'ORIGEN';
  const agenciaDestino = encomienda.punto_venta_dest_nombre || encomienda.id_punto_venta_dest || 'DESTINO';
  const unidadTransporte = `${cleanText(encomienda.placa)} ${cleanText(encomienda.licencia)}`.trim();
  const condicionPago = cleanText(encomienda.condicion_pago || venta.forma_pago_id || 'PAGADO').toUpperCase();
  const medioPago = cleanText(venta.medio_pago || encomienda.medio_pago || 'EFECTIVO').toUpperCase();
  const observaciones = cleanText(encomienda.observaciones || encomienda.observacion || (encomienda.numero_rdi ? `RDI: ${encomienda.numero_rdi}` : '-'));
  const contenido = encomienda.descripcion || jsonTicket.items?.[0]?.producto || 'SERVICIO DE TRANSPORTE DE ENCOMIENDA';
  const qrText = [empresa.ruc, codigo, serie, numeroVenta, fechaEmision, clienteDocumento, total].map(cleanText).join('|');

  const logoImage = await embedLogo(pdfDoc, logo);
  const qrDataUrl = await QRCode.toDataURL(qrText || numero || empresa.ruc || 'XPERTCONT');
  const qrImage = await pdfDoc.embedPng(base64ToUint8Array(qrDataUrl.split(',')[1]));

  if (logoImage) {
    const logoMaxWidth = 165;
    const logoMaxHeight = 54;
    const scale = Math.min(logoMaxWidth / logoImage.width, logoMaxHeight / logoImage.height);
    const logoWidth = logoImage.width * scale;
    const logoHeight = logoImage.height * scale;
    page.drawImage(logoImage, {
      x: (TICKET_WIDTH - logoWidth) / 2,
      y: 624,
      width: logoWidth,
      height: logoHeight,
    });
  } else {
    drawCentered(page, 'XPERTCONT EXPRESS', 650, 13, bold, INK);
  }

  wrapText(empresa.razon_social || empresa.nombre_comercial || 'TRANSPORTE DE ENCOMIENDAS', bold, 7.7, CONTENT_WIDTH, 2).forEach((line, index) => {
    drawCentered(page, line, 604 - (index * 8.5), 7.7, bold, INK);
  });
  drawCentered(page, `RUC ${cleanText(empresa.ruc || '')}`, 581, 11.4, bold, INK);
  wrapText(empresa.domicilio_fiscal || '', regular, 6.4, CONTENT_WIDTH, 2).forEach((line, index) => {
    drawCentered(page, line, 566 - (index * 7.4), 6.4, regular, MUTED);
  });

  page.drawLine({ start: { x: MARGIN, y: 542 }, end: { x: TICKET_WIDTH - MARGIN, y: 542 }, thickness: 0.75, color: LINE });
  drawCentered(page, comprobanteNombre(codigo), 522, 10.4, bold, INK);
  drawCentered(page, numero || 'MODELO', 499, 17, bold, INK);
  drawDateTimeRow(page, fechaEmision, horaEmision, 474, fonts);
  drawDottedLine(page, 452, MARGIN + 4, TICKET_WIDTH - MARGIN - 4);

  drawChip(page, 'ORIGEN', MARGIN + 14, 425, 45, fonts);
  drawChip(page, 'DESTINO', TICKET_WIDTH - MARGIN - 59, 425, 45, fonts);
  page.drawText(fitText(String(agenciaOrigen).toUpperCase(), bold, 15.2, 82), { x: MARGIN, y: 397, size: 15.2, font: bold, color: INK });
  drawVanRight(page, 96, 393, INK);
  page.drawLine({ start: { x: 132, y: 404 }, end: { x: 165, y: 404 }, thickness: 0.85, color: INK, dashArray: [1.2, 3] });
  page.drawText('>', { x: 168, y: 398, size: 13, font: bold, color: INK });
  drawRight(page, String(agenciaDestino).toUpperCase(), 397, 15.2, bold, INK, TICKET_WIDTH - MARGIN, 68);
  page.drawLine({ start: { x: MARGIN, y: 375 }, end: { x: TICKET_WIDTH - MARGIN, y: 375 }, thickness: 0.55, color: LINE });

  const blockWidth = (CONTENT_WIDTH - 12) / 2;
  drawInfoBlock(page, 'REMITENTE', encomienda.cliente || jsonTicket.cliente?.razon_social_nombres, 'DNI / RUC', clienteDocumento, encomienda.cliente_telefono, MARGIN, 348, blockWidth, fonts);
  page.drawLine({ start: { x: MARGIN + blockWidth + 6, y: 357 }, end: { x: MARGIN + blockWidth + 6, y: 296 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  drawInfoBlock(page, 'DESTINATARIO', encomienda.destinatario, 'DNI', destinatarioDocumento, encomienda.destinatario_telefono, MARGIN + blockWidth + 12, 348, blockWidth, fonts);

  page.drawRectangle({ x: MARGIN, y: 214, width: CONTENT_WIDTH, height: 68, color: PANEL, borderColor: rgb(0.84, 0.85, 0.87), borderWidth: 0.45 });
  drawPackageIcon(page, MARGIN + 8, 257, INK);
  page.drawText('ENCOMIENDA', { x: MARGIN + 26, y: 259, size: 9.2, font: bold, color: INK });
  page.drawText('PLACA / LICENCIA', { x: 142, y: 260, size: 6.6, font: regular, color: INK });
  drawRight(page, unidadTransporte || '-', 247, 8.1, bold, INK, TICKET_WIDTH - MARGIN - 8, 72);
  page.drawLine({ start: { x: MARGIN + 8, y: 244 }, end: { x: 138, y: 244 }, thickness: 0.45, color: LINE });
  page.drawText('CONTENIDO', { x: MARGIN + 8, y: 231, size: 6.8, font: regular, color: INK });
  page.drawText(fitText(String(contenido).toUpperCase(), bold, 12.2, CONTENT_WIDTH - 18), { x: MARGIN + 8, y: 216, size: 12.2, font: bold, color: INK });
  page.drawLine({ start: { x: MARGIN + 8, y: 207 }, end: { x: TICKET_WIDTH - MARGIN - 8, y: 207 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  page.drawText('OBSERVACIONES', { x: MARGIN + 8, y: 196, size: 6.8, font: regular, color: INK });
  page.drawText(fitText(observaciones || '-', regular, 7.2, CONTENT_WIDTH - 92), { x: MARGIN + 72, y: 196, size: 7.2, font: regular, color: INK });

  page.drawRectangle({ x: MARGIN, y: 112, width: CONTENT_WIDTH, height: 72, color: rgb(0.985, 0.985, 0.985), borderColor: INK, borderWidth: 0.75 });
  page.drawCircle({ x: MARGIN, y: 148, size: 6, color: PAPER, borderColor: INK, borderWidth: 0.75 });
  page.drawCircle({ x: TICKET_WIDTH - MARGIN, y: 148, size: 6, color: PAPER, borderColor: INK, borderWidth: 0.75 });
  page.drawImage(qrImage, { x: MARGIN + 9, y: 123, width: 50, height: 50 });
  page.drawLine({ start: { x: 76, y: 122 }, end: { x: 76, y: 174 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  page.drawLine({ start: { x: 139, y: 122 }, end: { x: 139, y: 174 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  page.drawText('CONDICION DE PAGO', { x: 87, y: 162, size: 6.7, font: regular, color: MUTED });
  page.drawRectangle({ x: 86, y: 136, width: 43, height: 17, color: PAPER, borderColor: INK, borderWidth: 0.55 });
  drawCenteredInBox(page, condicionPago, 86, 140, 43, 10.5, bold, INK);
  drawCardIcon(page, 87, 122, INK);
  page.drawText(fitText(medioPago, regular, 7.2, 38), { x: 104, y: 124, size: 7.2, font: regular, color: INK });
  page.drawText('TOTAL', { x: 171, y: 162, size: 8.3, font: bold, color: INK });
  page.drawText('S/', { x: 147, y: 140, size: 10, font: bold, color: INK });
  drawRight(page, money(total), 128, 21, bold, INK, TICKET_WIDTH - MARGIN - 7, 64);

  page.drawLine({ start: { x: MARGIN, y: 94 }, end: { x: TICKET_WIDTH - MARGIN, y: 94 }, thickness: 0.65, color: LINE });
  page.drawText('TERMINOS Y CONDICIONES', { x: MARGIN, y: 76, size: 6.8, font: bold, color: INK });
  wrapText('Conserva este ticket para seguimiento y entrega. La empresa no se responsabiliza por articulos no declarados o embalaje inadecuado.', regular, 6.4, 136, 3).forEach((line, index) => {
    page.drawText(line, { x: MARGIN, y: 65 - (index * 8), size: 6.4, font: regular, color: MUTED });
  });
  page.drawLine({ start: { x: 158, y: 43 }, end: { x: 158, y: 78 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  drawPackageIcon(page, 164, 55, INK);
  page.drawText('GRACIAS POR', { x: 181, y: 66, size: 5.9, font: regular, color: INK });
  page.drawText('CONFIAR EN', { x: 181, y: 58, size: 5.9, font: regular, color: INK });
  page.drawText('NOSOTROS', { x: 181, y: 50, size: 5.9, font: regular, color: INK });

  const pdfBytes = await pdfDoc.save();
  return { estado: true, buffer_pdf: pdfBytes };
};

module.exports = cpegenerapdfticketencomienda;
