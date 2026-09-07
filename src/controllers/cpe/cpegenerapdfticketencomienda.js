const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');

const TICKET_WIDTH = 226.77;
const TICKET_HEIGHT = 650;
const MARGIN = 12;
const CONTENT_WIDTH = TICKET_WIDTH - (MARGIN * 2);
const ACCENT = rgb(0.18, 0.2, 0.23);
const INK = rgb(0.08, 0.09, 0.1);
const MUTED = rgb(0.32, 0.34, 0.38);
const SOFT = rgb(0.9, 0.91, 0.93);
const LINE = rgb(0.62, 0.64, 0.68);

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

const drawCentered = (page, text, y, size, font, color = INK) => {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: Math.max(MARGIN, (TICKET_WIDTH - width) / 2),
    y,
    size,
    font,
    color,
  });
};

const drawRight = (page, text, y, size, font, color = INK, right = TICKET_WIDTH - MARGIN) => {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: right - width,
    y,
    size,
    font,
    color,
  });
};

const drawDottedLine = (page, y, x1 = MARGIN, x2 = TICKET_WIDTH - MARGIN, color = LINE) => {
  for (let x = x1; x < x2; x += 5) {
    page.drawCircle({ x, y, size: 0.8, color });
  }
};

const drawMiniVan = (page, x, y, color = INK) => {
  page.drawRectangle({ x, y, width: 28, height: 10, borderColor: color, borderWidth: 1 });
  page.drawRectangle({ x: x + 5, y: y + 10, width: 14, height: 6, borderColor: color, borderWidth: 1 });
  page.drawLine({ start: { x: x + 10, y: y + 16 }, end: { x: x + 20, y: y + 10 }, thickness: 1, color });
  page.drawCircle({ x: x + 6, y: y - 1, size: 2.8, borderColor: color, borderWidth: 1 });
  page.drawCircle({ x: x + 23, y: y - 1, size: 2.8, borderColor: color, borderWidth: 1 });
  page.drawLine({ start: { x: x - 12, y: y + 4 }, end: { x: x - 3, y: y + 4 }, thickness: 0.7, color });
  page.drawLine({ start: { x: x - 8, y: y + 8 }, end: { x: x - 2, y: y + 8 }, thickness: 0.7, color });
};

const drawCenteredLines = (page, lines, y, size, font, color = INK, gap = 8) => {
  lines.forEach((line) => {
    drawCentered(page, line, y, size, font, color);
    y -= gap;
  });
  return y;
};

const wrapText = (text, font, size, maxWidth) => {
  const words = cleanText(text).split(' ').filter(Boolean);
  const lines = [];
  let line = '';

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      return;
    }
    if (line) lines.push(line);
    line = word;
  });

  if (line) lines.push(line);
  return lines.length ? lines : [''];
};

const fitText = (text, font, size, maxWidth) => {
  const value = cleanText(text);
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;

  let output = value;
  while (output.length > 3 && font.widthOfTextAtSize(`${output}...`, size) > maxWidth) {
    output = output.slice(0, -1);
  }

  return output.length > 3 ? `${output}...` : '';
};

const drawLabelValue = (page, label, value, y, fonts) => {
  page.drawText(label, { x: MARGIN, y, size: 6.8, font: fonts.bold, color: MUTED });
  const lines = wrapText(value || '-', fonts.regular, 8.2, CONTENT_WIDTH);
  lines.forEach((line, index) => {
    page.drawText(line, { x: MARGIN, y: y - 9 - (index * 9), size: 8.2, font: fonts.regular, color: INK });
  });
  return y - 13 - (Math.max(lines.length, 1) * 9);
};

const drawContentValue = (page, label, value, y, fonts) => {
  page.drawText(label, { x: MARGIN, y, size: 6.8, font: fonts.bold, color: MUTED });
  const lines = wrapText(value || '-', fonts.bold, 9.2, CONTENT_WIDTH).slice(0, 2);
  lines.forEach((line, index) => {
    page.drawText(line, { x: MARGIN, y: y - 10 - (index * 10), size: 9.2, font: fonts.bold, color: INK });
  });
  return y - 14 - (Math.max(lines.length, 1) * 10);
};

const drawSection = (page, title, y, fonts, value = '') => {
  page.drawRectangle({
    x: MARGIN,
    y: y - 4,
    width: CONTENT_WIDTH,
    height: 14,
    color: SOFT,
    borderColor: LINE,
    borderWidth: 0.55,
  });
  page.drawText(title, { x: MARGIN + 7, y, size: 8.2, font: fonts.bold, color: ACCENT });
  const valueText = cleanText(value);
  if (valueText) {
    const fittedValue = fitText(valueText.toUpperCase(), fonts.bold, 7.8, CONTENT_WIDTH - 66);
    drawRight(page, fittedValue, y, 7.8, fonts.bold, ACCENT, TICKET_WIDTH - MARGIN - 7);
  }
  return y - 17;
};

const drawInfoBlock = (page, title, name, documentLabel, documentValue, phoneValue, x, y, width, fonts) => {
  page.drawText(title, { x, y, size: 7.2, font: fonts.bold, color: ACCENT });
  const nameLines = wrapText(name || '-', fonts.bold, 7.6, width).slice(0, 2);
  nameLines.forEach((line, index) => {
    page.drawText(line, { x, y: y - 12 - (index * 9), size: 7.6, font: fonts.bold, color: INK });
  });

  const baseY = y - 34;
  page.drawLine({ start: { x, y: baseY + 7 }, end: { x: x + width, y: baseY + 7 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  page.drawText(documentLabel, { x, y: baseY - 1, size: 7, font: fonts.regular, color: INK });
  page.drawText(cleanText(documentValue || '-'), { x: x + 49, y: baseY - 1, size: 7, font: fonts.bold, color: INK });
  page.drawText('TELEFONO', { x, y: baseY - 11, size: 7, font: fonts.regular, color: INK });
  page.drawText(cleanText(phoneValue || '-'), { x: x + 49, y: baseY - 11, size: 7, font: fonts.regular, color: INK });
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
  const agenciaOrigen = encomienda.punto_venta_nombre || '';
  const agenciaDestino = encomienda.punto_venta_dest_nombre || '';
  const unidadTransporte = `${cleanText(encomienda.placa)} ${cleanText(encomienda.licencia)}`.trim();
  const qrText = [
    empresa.ruc,
    codigo,
    serie,
    numeroVenta,
    fechaEmision,
    clienteDocumento,
    total,
  ].map(cleanText).join('|');

  const logoImage = await embedLogo(pdfDoc, logo);
  const qrDataUrl = await QRCode.toDataURL(qrText || numero || empresa.ruc || 'XPERTCONT');
  const qrImage = await pdfDoc.embedPng(base64ToUint8Array(qrDataUrl.split(',')[1]));

  let y = TICKET_HEIGHT - 20;

  if (logoImage) {
    const logoMaxWidth = 170;
    const logoMaxHeight = 58;
    const scale = Math.min(logoMaxWidth / logoImage.width, logoMaxHeight / logoImage.height);
    const logoWidth = logoImage.width * scale;
    const logoHeight = logoImage.height * scale;
    page.drawImage(logoImage, {
      x: (TICKET_WIDTH - logoWidth) / 2,
      y: y - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
    y -= logoHeight + 8;
  } else {
    drawCentered(page, 'XPERTCONT EXPRESS', y, 12, bold, ACCENT);
    y -= 16;
  }

  y = drawCenteredLines(
    page,
    wrapText(cleanText(empresa.razon_social || empresa.nombre_comercial) || 'TRANSPORTE DE ENCOMIENDAS', regular, 7.6, CONTENT_WIDTH).slice(0, 2),
    y,
    7.6,
    regular,
    MUTED,
    8.5
  );
  y -= 3;
  drawCentered(page, `RUC ${cleanText(empresa.ruc || '')}`, y, 9.2, bold, ACCENT);
  y -= 10;
  if (empresa.domicilio_fiscal) {
    wrapText(empresa.domicilio_fiscal, regular, 6.5, CONTENT_WIDTH).slice(0, 2).forEach((line) => {
      drawCentered(page, line, y, 6.5, regular, MUTED);
      y -= 8;
    });
  }
  y -= 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: TICKET_WIDTH - MARGIN, y }, thickness: 0.85, color: LINE });
  y -= 17;

  drawCentered(page, comprobanteNombre(codigo), y, 9.4, bold);
  y -= 12;
  drawCentered(page, numero || 'MODELO', y, 11.7, bold, ACCENT);
  y -= 13;
  drawCentered(page, `FECHA ${fecha(fechaEmision)}   HORA ${horaAmPm(horaEmision)}`, y, 7.4, regular, MUTED);
  y -= 16;
  drawDottedLine(page, y, MARGIN + 4, TICKET_WIDTH - MARGIN - 4, rgb(0.66, 0.67, 0.7));
  y -= 18;

  page.drawRectangle({ x: MARGIN + 11, y: y - 2, width: 45, height: 14, color: SOFT, borderColor: LINE, borderWidth: 0.35 });
  page.drawRectangle({ x: TICKET_WIDTH - MARGIN - 56, y: y - 2, width: 45, height: 14, color: SOFT, borderColor: LINE, borderWidth: 0.35 });
  drawCentered(page, 'ORIGEN', y + 2, 7.3, bold, ACCENT);
  drawRight(page, 'DESTINO', y + 2, 7.3, bold, ACCENT, TICKET_WIDTH - MARGIN - 20);
  y -= 27;

  const origenTexto = fitText((agenciaOrigen || encomienda.id_punto_venta || 'ORIGEN').toUpperCase(), bold, 13.5, 76);
  const destinoTexto = fitText((agenciaDestino || encomienda.id_punto_venta_dest || 'DESTINO').toUpperCase(), bold, 13.5, 58);
  page.drawText(origenTexto, { x: MARGIN, y, size: 13.5, font: bold, color: INK });
  drawMiniVan(page, MARGIN + 100, y + 2, INK);
  page.drawLine({ start: { x: MARGIN + 137, y: y + 7 }, end: { x: TICKET_WIDTH - MARGIN - 51, y: y + 7 }, thickness: 0.8, color: INK, dashArray: [1, 3] });
  page.drawText('>', { x: TICKET_WIDTH - MARGIN - 47, y: y + 2, size: 12, font: bold, color: INK });
  drawRight(page, destinoTexto, y, 13.5, bold, INK, TICKET_WIDTH - MARGIN);
  y -= 25;

  page.drawLine({ start: { x: MARGIN, y }, end: { x: TICKET_WIDTH - MARGIN, y }, thickness: 0.55, color: LINE });
  y -= 17;

  const blockWidth = (CONTENT_WIDTH - 12) / 2;
  drawInfoBlock(page, 'REMITENTE', encomienda.cliente || jsonTicket.cliente?.razon_social_nombres, 'DNI / RUC', clienteDocumento, encomienda.cliente_telefono, MARGIN, y, blockWidth, fonts);
  page.drawLine({ start: { x: MARGIN + blockWidth + 6, y: y + 3 }, end: { x: MARGIN + blockWidth + 6, y: y - 48 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  drawInfoBlock(page, 'DESTINATARIO', encomienda.destinatario, 'DNI', destinatarioDocumento, encomienda.destinatario_telefono, MARGIN + blockWidth + 12, y, blockWidth, fonts);
  y -= 63;

  if ((String(clienteDocumento || '').length === 11) && (encomienda.remitente_direccion || encomienda.cliente_direccion || jsonTicket.cliente?.cliente_direccion)) {
    y = drawLabelValue(page, 'DIRECCION', encomienda.remitente_direccion || encomienda.cliente_direccion || jsonTicket.cliente?.cliente_direccion, y, fonts);
  }

  if (encomienda.destinatario_direccion) {
    y = drawLabelValue(page, 'DIRECCION ENTREGA', encomienda.destinatario_direccion, y, fonts);
  }

  page.drawRectangle({
    x: MARGIN,
    y: y - 60,
    width: CONTENT_WIDTH,
    height: 60,
    color: rgb(0.94, 0.95, 0.96),
    borderColor: rgb(0.86, 0.87, 0.89),
    borderWidth: 0.4,
  });
  y -= 16;
  page.drawText('ENCOMIENDA', { x: MARGIN + 10, y, size: 9, font: bold, color: ACCENT });
  page.drawText('PLACA / LICENCIA', { x: MARGIN + 128, y, size: 6.7, font: regular, color: INK });
  drawRight(page, fitText(unidadTransporte, bold, 8.1, 72), y - 11, 8.1, bold, INK, TICKET_WIDTH - MARGIN - 8);
  page.drawLine({ start: { x: MARGIN + 10, y: y - 9 }, end: { x: MARGIN + 121, y: y - 9 }, thickness: 0.45, color: LINE });
  y -= 24;
  y = drawContentValue(page, 'CONTENIDO', encomienda.descripcion || jsonTicket.items?.[0]?.producto, y, fonts);
  y -= 6;

  y -= 2;
  const qrSize = 46;
  page.drawRectangle({
    x: MARGIN,
    y: y - 58,
    width: CONTENT_WIDTH,
    height: 58,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: LINE,
    borderWidth: 0.55,
  });
  page.drawImage(qrImage, { x: MARGIN + 9, y: y - 52, width: qrSize, height: qrSize });
  page.drawLine({ start: { x: MARGIN + 63, y: y - 6 }, end: { x: MARGIN + 63, y: y - 52 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  page.drawLine({ start: { x: MARGIN + 133, y: y - 6 }, end: { x: MARGIN + 133, y: y - 52 }, thickness: 0.45, color: LINE, dashArray: [2, 3] });
  page.drawText('CONDICION DE PAGO', { x: MARGIN + 75, y: y - 14, size: 6.7, font: regular, color: MUTED });
  page.drawText(cleanText(encomienda.condicion_pago || venta.forma_pago_id || 'PAGADO'), { x: MARGIN + 75, y: y - 33, size: 11.4, font: bold, color: INK });
  page.drawText('TOTAL', { x: TICKET_WIDTH - MARGIN - 48, y: y - 14, size: 8.2, font: bold, color: ACCENT });
  page.drawText('S/', { x: MARGIN + 143, y: y - 35, size: 10, font: bold, color: INK });
  drawRight(page, money(total), y - 43, 20, bold, INK, TICKET_WIDTH - MARGIN - 8);
  y -= 68;

  page.drawLine({ start: { x: MARGIN, y }, end: { x: TICKET_WIDTH - MARGIN, y }, thickness: 0.7, color: LINE });
  y -= 13;
  page.drawText('TERMINOS Y CONDICIONES', { x: MARGIN, y, size: 6.8, font: bold, color: ACCENT });
  y -= 9;
  wrapText('Conserva este ticket para seguimiento y entrega. La empresa no se responsabiliza por articulos no declarados o embalaje inadecuado.', regular, 6.5, CONTENT_WIDTH).slice(0, 3).forEach((line) => {
    page.drawText(line, { x: MARGIN, y, size: 6.5, font: regular, color: MUTED });
    y -= 8;
  });

  const pdfBytes = await pdfDoc.save();
  return { estado: true, buffer_pdf: pdfBytes };
};

module.exports = cpegenerapdfticketencomienda;
