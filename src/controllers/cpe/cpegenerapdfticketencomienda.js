const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');

const TICKET_WIDTH = 226.77;
const TICKET_HEIGHT = 650;
const MARGIN = 12;
const CONTENT_WIDTH = TICKET_WIDTH - (MARGIN * 2);
const ACCENT = rgb(0.09, 0.55, 0.52);
const INK = rgb(0.1, 0.12, 0.14);
const MUTED = rgb(0.36, 0.4, 0.44);
const SOFT = rgb(0.94, 0.97, 0.96);
const LINE = rgb(0.82, 0.86, 0.86);

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

const drawLabelValue = (page, label, value, y, fonts) => {
  page.drawText(label, { x: MARGIN, y, size: 6.8, font: fonts.bold, color: MUTED });
  const lines = wrapText(value || '-', fonts.regular, 8.2, CONTENT_WIDTH);
  lines.forEach((line, index) => {
    page.drawText(line, { x: MARGIN, y: y - 9 - (index * 9), size: 8.2, font: fonts.regular, color: INK });
  });
  return y - 13 - (Math.max(lines.length, 1) * 9);
};

const drawSection = (page, title, y, fonts) => {
  page.drawRectangle({
    x: MARGIN,
    y: y - 4,
    width: CONTENT_WIDTH,
    height: 14,
    color: SOFT,
    borderColor: LINE,
    borderWidth: 0.4,
  });
  page.drawText(title, { x: MARGIN + 7, y, size: 7.8, font: fonts.bold, color: ACCENT });
  return y - 17;
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
    const logoMaxWidth = 96;
    const logoMaxHeight = 42;
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

  drawCentered(page, cleanText(empresa.razon_social || empresa.nombre_comercial) || 'TRANSPORTE DE ENCOMIENDAS', y, 7.8, regular, MUTED);
  y -= 15;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: TICKET_WIDTH - MARGIN, y }, thickness: 0.7, color: LINE });
  y -= 17;

  drawCentered(page, comprobanteNombre(codigo), y, 9.3, bold);
  y -= 12;
  drawCentered(page, numero || 'MODELO', y, 11.5, bold, ACCENT);
  y -= 13;
  drawCentered(page, `FECHA ${fecha(fechaEmision)}   HORA ${horaAmPm(horaEmision)}`, y, 7.4, regular, MUTED);
  y -= 18;

  y = drawSection(page, 'ORIGEN', y, fonts);
  y = drawLabelValue(page, 'REMITENTE', encomienda.cliente || jsonTicket.cliente?.razon_social_nombres, y, fonts);
  y = drawLabelValue(page, 'DNI / RUC', clienteDocumento, y, fonts);
  y = drawLabelValue(page, 'TELEFONO', encomienda.cliente_telefono, y, fonts);
  if (encomienda.remitente_direccion || encomienda.cliente_direccion) {
    y = drawLabelValue(page, 'DIRECCION', encomienda.remitente_direccion || encomienda.cliente_direccion, y, fonts);
  }

  y = drawSection(page, 'DESTINO', y, fonts);
  y = drawLabelValue(page, 'DESTINATARIO', encomienda.destinatario, y, fonts);
  y = drawLabelValue(page, 'DNI', destinatarioDocumento, y, fonts);
  y = drawLabelValue(page, 'TELEFONO', encomienda.destinatario_telefono, y, fonts);
  y = drawLabelValue(page, 'RUTA', `${cleanText(encomienda.id_ruta)}  ${cleanText(encomienda.id_punto_venta)} -> ${cleanText(encomienda.id_punto_venta_dest)}`, y, fonts);
  if (encomienda.destinatario_direccion) {
    y = drawLabelValue(page, 'DIRECCION ENTREGA', encomienda.destinatario_direccion, y, fonts);
  }

  y = drawSection(page, 'ENCOMIENDA', y, fonts);
  y = drawLabelValue(page, 'CONTENIDO', encomienda.descripcion || jsonTicket.items?.[0]?.producto, y, fonts);
  y = drawLabelValue(page, 'UNIDAD', `${cleanText(encomienda.placa)}  ${cleanText(encomienda.licencia)}`, y, fonts);

  y -= 2;
  page.drawRectangle({
    x: MARGIN,
    y: y - 38,
    width: CONTENT_WIDTH,
    height: 38,
    color: rgb(0.98, 0.99, 0.99),
    borderColor: ACCENT,
    borderWidth: 0.8,
  });
  page.drawText('CONDICION', { x: MARGIN + 8, y: y - 13, size: 7, font: bold, color: MUTED });
  page.drawText(cleanText(encomienda.condicion_pago || venta.forma_pago_id || 'PAGADO'), { x: MARGIN + 8, y: y - 27, size: 10, font: bold, color: INK });
  page.drawText('TOTAL S/', { x: TICKET_WIDTH - MARGIN - 78, y: y - 13, size: 7, font: bold, color: MUTED });
  drawRight(page, money(total), y - 29, 15, bold, ACCENT);
  y -= 51;

  const qrSize = 52;
  page.drawImage(qrImage, { x: (TICKET_WIDTH - qrSize) / 2, y: y - qrSize, width: qrSize, height: qrSize });
  y -= qrSize + 10;

  page.drawLine({ start: { x: MARGIN, y }, end: { x: TICKET_WIDTH - MARGIN, y }, thickness: 0.7, color: LINE });
  y -= 16;
  drawCentered(page, 'Gracias por confiar tu envio con nosotros', y, 8, regular, MUTED);
  y -= 11;
  drawCentered(page, 'Conserva este ticket para seguimiento y entrega', y, 6.8, regular, MUTED);

  const pdfBytes = await pdfDoc.save();
  return { estado: true, buffer_pdf: pdfBytes };
};

module.exports = cpegenerapdfticketencomienda;
