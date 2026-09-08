const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');

const TICKET_WIDTH = 226.77;
const TICKET_HEIGHT = 650;
const MARGIN = 11;
const CONTENT_WIDTH = TICKET_WIDTH - (MARGIN * 2);

const INK = rgb(0.04, 0.045, 0.055);
const MUTED = rgb(0.36, 0.37, 0.4);
const LINE = rgb(0.72, 0.73, 0.75);
const LIGHT = rgb(0.945, 0.95, 0.958);
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
  if (!value) return '';
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;

  let output = value;
  while (output.length > 3 && font.widthOfTextAtSize(`${output}...`, size) > maxWidth) {
    output = output.slice(0, -1);
  }

  return output.length > 3 ? `${output}...` : '';
};

const wrapText = (text, font, size, maxWidth, maxLines) => {
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
  if (!lines.length) return [''];
  lines[lines.length - 1] = fitText(lines[lines.length - 1], font, size, maxWidth);
  return lines;
};

const drawText = (page, text, x, y, size, font, color = INK, maxWidth = null) => {
  const value = maxWidth ? fitText(text, font, size, maxWidth) : cleanText(text);
  page.drawText(value, { x, y, size, font, color });
};

const drawCentered = (page, text, y, size, font, color = INK, maxWidth = CONTENT_WIDTH) => {
  const value = fitText(text, font, size, maxWidth);
  const width = font.widthOfTextAtSize(value, size);
  page.drawText(value, {
    x: Math.max(MARGIN, (TICKET_WIDTH - width) / 2),
    y,
    size,
    font,
    color,
  });
};

const drawRight = (page, text, y, size, font, color = INK, right = TICKET_WIDTH - MARGIN, maxWidth = CONTENT_WIDTH) => {
  const value = fitText(text, font, size, maxWidth);
  const width = font.widthOfTextAtSize(value, size);
  page.drawText(value, { x: right - width, y, size, font, color });
};

const drawDottedLine = (page, y, x1 = MARGIN, x2 = TICKET_WIDTH - MARGIN) => {
  for (let x = x1; x < x2; x += 5) {
    page.drawCircle({ x, y, size: 0.7, color: LINE });
  }
};

const drawBox = (page, x, y, width, height, fill = PAPER, border = LINE, borderWidth = 0.55) => {
  page.drawRectangle({ x, y, width, height, color: fill, borderColor: border, borderWidth });
};

const drawLabel = (page, text, x, y, fonts, maxWidth = 60) => {
  drawText(page, text, x, y, 5.8, fonts.bold, MUTED, maxWidth);
};

const drawValue = (page, text, x, y, fonts, maxWidth = 80, size = 7.2) => {
  drawText(page, text || '-', x, y, size, fonts.bold, INK, maxWidth);
};

const drawMaterialIcon = (page, path, x, y, size = 12, color = INK) => {
  page.drawSvgPath(path, { x, y, scale: size / 24, color });
};

const ICONS = {
  event: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM19 19H5V8h14v11z',
  schedule: 'M12 20c4.41 0 8-3.59 8-8s-3.59-8-8-8-8 3.59-8 8 3.59 8 8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z',
  person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  package: 'M20 8.69V18c0 .72-.38 1.38-1 1.73l-6 3.46c-.62.36-1.38.36-2 0l-6-3.46A2 2 0 0 1 4 18V8.69c0-.72.38-1.38 1-1.73l6-3.46c.62-.36 1.38-.36 2 0l6 3.46c.62.35 1 1.01 1 1.73zM12 5.23 6.74 8.26 12 11.29l5.26-3.03L12 5.23zm-6 4.76V18l5 2.88v-7.86L6 9.99zm12 0-5 3.03v7.86L18 18V9.99z',
  card: 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
  truck: 'M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9 1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
};

const drawChip = (page, text, x, y, width, fonts) => {
  drawBox(page, x, y, width, 12, LIGHT, LINE, 0.35);
  drawCenteredInBox(page, text, x, y + 3.1, width, 6.4, fonts.bold, INK);
};

const drawCenteredInBox = (page, text, x, y, width, size, font, color = INK) => {
  const value = fitText(text, font, size, width - 4);
  const textWidth = font.widthOfTextAtSize(value, size);
  page.drawText(value, { x: x + Math.max(2, (width - textWidth) / 2), y, size, font, color });
};

const drawParty = (page, title, name, docLabel, docValue, phoneValue, x, y, width, fonts) => {
  drawMaterialIcon(page, ICONS.person, x, y + 47, 11, INK);
  drawText(page, title, x + 14, y + 52, 7.2, fonts.bold, INK, width - 14);
  wrapText(name || '-', fonts.bold, 7.3, width, 2).forEach((line, index) => {
    drawText(page, line, x, y + 33 - (index * 8.5), 7.3, fonts.bold, INK, width);
  });
  page.drawLine({ start: { x, y: y + 18 }, end: { x: x + width, y: y + 18 }, thickness: 0.4, color: LINE, dashArray: [2, 3] });
  drawText(page, docLabel, x, y + 8, 6.4, fonts.regular, INK, 42);
  drawText(page, docValue || '-', x + 45, y + 8, 6.7, fonts.bold, INK, width - 45);
  drawText(page, 'TELEFONO', x, y - 2, 6.4, fonts.regular, INK, 42);
  drawText(page, phoneValue || '-', x + 45, y - 2, 6.7, fonts.regular, INK, width - 45);
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
  const origen = encomienda.punto_venta_nombre || encomienda.id_punto_venta || 'ORIGEN';
  const destino = encomienda.punto_venta_dest_nombre || encomienda.id_punto_venta_dest || 'DESTINO';
  const unidad = `${cleanText(encomienda.placa)} ${cleanText(encomienda.licencia)}`.trim() || '-';
  const condicionPago = cleanText(encomienda.condicion_pago || venta.forma_pago_id || 'PAGADO').toUpperCase();
  const medioPago = cleanText(venta.medio_pago || encomienda.medio_pago || 'EFECTIVO').toUpperCase();
  const observaciones = cleanText(encomienda.observaciones || encomienda.observacion || (encomienda.numero_rdi ? `RDI: ${encomienda.numero_rdi}` : '-'));
  const contenido = encomienda.descripcion || jsonTicket.items?.[0]?.producto || 'SERVICIO DE TRANSPORTE DE ENCOMIENDA';
  const qrText = [empresa.ruc, codigo, serie, numeroVenta, fechaEmision, clienteDocumento, total].map(cleanText).join('|');

  const logoImage = await embedLogo(pdfDoc, logo);
  const qrDataUrl = await QRCode.toDataURL(qrText || numero || empresa.ruc || 'XPERTCONT');
  const qrImage = await pdfDoc.embedPng(base64ToUint8Array(qrDataUrl.split(',')[1]));

  if (logoImage) {
    const scale = Math.min(160 / logoImage.width, 48 / logoImage.height);
    const logoWidth = logoImage.width * scale;
    const logoHeight = logoImage.height * scale;
    page.drawImage(logoImage, {
      x: (TICKET_WIDTH - logoWidth) / 2,
      y: 591,
      width: logoWidth,
      height: logoHeight,
    });
  } else {
    drawCentered(page, 'XPERTCONT EXPRESS', 616, 13, bold);
  }

  wrapText(empresa.razon_social || empresa.nombre_comercial || 'TRANSPORTE DE ENCOMIENDAS', bold, 7.3, CONTENT_WIDTH, 2).forEach((line, index) => {
    drawCentered(page, line, 574 - (index * 8), 7.3, bold);
  });
  drawCentered(page, `RUC ${cleanText(empresa.ruc || '')}`, 548, 15.6, bold);
  wrapText(empresa.domicilio_fiscal || '', regular, 5.9, CONTENT_WIDTH, 2).forEach((line, index) => {
    drawCentered(page, line, 532 - (index * 7), 5.9, regular, MUTED);
  });

  page.drawLine({ start: { x: MARGIN, y: 511 }, end: { x: TICKET_WIDTH - MARGIN, y: 511 }, thickness: 0.75, color: LINE });
  drawCentered(page, comprobanteNombre(codigo), 492, 9.6, bold);
  drawCentered(page, numero || 'MODELO', 468, 18, bold);
  drawMaterialIcon(page, ICONS.event, 45, 445, 10);
  drawText(page, `FECHA ${fecha(fechaEmision)}`, 58, 447, 7.2, regular, INK, 62);
  page.drawLine({ start: { x: 116, y: 443 }, end: { x: 116, y: 457 }, thickness: 0.45, color: LINE });
  drawMaterialIcon(page, ICONS.schedule, 128, 445, 10);
  drawText(page, `HORA ${horaAmPm(horaEmision)}`, 141, 447, 7.2, regular, INK, 68);
  drawDottedLine(page, 426);

  drawChip(page, 'SALIDA', MARGIN + 6, 398, 46, fonts);
  drawChip(page, 'LLEGADA', TICKET_WIDTH - MARGIN - 52, 398, 46, fonts);
  drawText(page, String(origen).toUpperCase(), MARGIN, 371, 15.8, bold, INK, 83);
  drawMaterialIcon(page, ICONS.truck, 96, 365, 32);
  page.drawLine({ start: { x: 129, y: 377 }, end: { x: 165, y: 377 }, thickness: 0.9, color: INK, dashArray: [1.2, 3] });
  drawText(page, '>', 168, 371, 14, bold);
  drawRight(page, String(destino).toUpperCase(), 371, 15.8, bold, INK, TICKET_WIDTH - MARGIN, 68);
  page.drawLine({ start: { x: MARGIN, y: 350 }, end: { x: TICKET_WIDTH - MARGIN, y: 350 }, thickness: 0.55, color: LINE });

  const partyWidth = (CONTENT_WIDTH - 12) / 2;
  drawParty(page, 'REMITENTE', encomienda.cliente || jsonTicket.cliente?.razon_social_nombres, 'DNI / RUC', clienteDocumento, encomienda.cliente_telefono, MARGIN, 288, partyWidth, fonts);
  page.drawLine({ start: { x: MARGIN + partyWidth + 6, y: 340 }, end: { x: MARGIN + partyWidth + 6, y: 282 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  drawParty(page, 'DESTINATARIO', encomienda.destinatario, 'DNI', destinatarioDocumento, encomienda.destinatario_telefono, MARGIN + partyWidth + 12, 288, partyWidth, fonts);

  drawBox(page, MARGIN, 194, CONTENT_WIDTH, 72, LIGHT, LINE, 0.45);
  drawMaterialIcon(page, ICONS.package, MARGIN + 8, 241, 14);
  drawText(page, 'ENCOMIENDA', MARGIN + 27, 245, 9.2, bold);
  drawLabel(page, 'UNIDAD', 142, 246, fonts, 35);
  drawRight(page, unidad, 234, 8, bold, INK, TICKET_WIDTH - MARGIN - 8, 70);
  page.drawLine({ start: { x: MARGIN + 8, y: 229 }, end: { x: TICKET_WIDTH - MARGIN - 8, y: 229 }, thickness: 0.45, color: LINE });
  drawLabel(page, 'CONTENIDO', MARGIN + 8, 216, fonts, 55);
  drawText(page, String(contenido).toUpperCase(), MARGIN + 8, 201, 12, bold, INK, CONTENT_WIDTH - 16);
  page.drawLine({ start: { x: MARGIN, y: 184 }, end: { x: TICKET_WIDTH - MARGIN, y: 184 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  drawLabel(page, 'OBSERVACIONES', MARGIN + 8, 173, fonts, 64);
  drawText(page, observaciones || '-', MARGIN + 76, 173, 7, regular, INK, CONTENT_WIDTH - 86);

  drawBox(page, MARGIN, 93, CONTENT_WIDTH, 76, PAPER, INK, 0.75);
  page.drawCircle({ x: MARGIN, y: 131, size: 5.5, color: PAPER, borderColor: INK, borderWidth: 0.75 });
  page.drawCircle({ x: TICKET_WIDTH - MARGIN, y: 131, size: 5.5, color: PAPER, borderColor: INK, borderWidth: 0.75 });
  page.drawImage(qrImage, { x: MARGIN + 8, y: 105, width: 54, height: 54 });
  page.drawLine({ start: { x: 75, y: 104 }, end: { x: 75, y: 158 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  page.drawLine({ start: { x: 137, y: 104 }, end: { x: 137, y: 158 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  drawLabel(page, 'PAGO', 86, 149, fonts, 40);
  drawBox(page, 86, 125, 42, 18, PAPER, INK, 0.55);
  drawCenteredInBox(page, condicionPago, 86, 130, 42, 10, bold);
  drawMaterialIcon(page, ICONS.card, 87, 105, 14);
  drawText(page, medioPago, 104, 108, 7.1, regular, INK, 31);
  drawLabel(page, 'TOTAL', 170, 149, fonts, 32);
  drawText(page, 'S/', 146, 126, 10, bold);
  drawRight(page, money(total), 112, 21, bold, INK, TICKET_WIDTH - MARGIN - 7, 65);

  page.drawLine({ start: { x: MARGIN, y: 75 }, end: { x: TICKET_WIDTH - MARGIN, y: 75 }, thickness: 0.65, color: LINE });
  drawText(page, 'TERMINOS Y CONDICIONES', MARGIN, 58, 6.8, bold);
  wrapText('Conserva este ticket para seguimiento y entrega. La empresa no se responsabiliza por articulos no declarados o embalaje inadecuado.', regular, 6.2, 138, 3).forEach((line, index) => {
    drawText(page, line, MARGIN, 47 - (index * 7.5), 6.2, regular, MUTED, 138);
  });
  page.drawLine({ start: { x: 160, y: 22 }, end: { x: 160, y: 61 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  drawMaterialIcon(page, ICONS.package, 166, 39, 15);
  drawText(page, 'GRACIAS POR', 184, 50, 5.9, regular, INK, 38);
  drawText(page, 'CONFIAR EN', 184, 42, 5.9, regular, INK, 38);
  drawText(page, 'NOSOTROS', 184, 34, 5.9, regular, INK, 38);

  const pdfBytes = await pdfDoc.save();
  return { estado: true, buffer_pdf: pdfBytes };
};

module.exports = cpegenerapdfticketencomienda;
