const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const QRCode = require('qrcode');

const W = 226.77;
const H = 400;
const M = 12;
const CW = W - (M * 2);

// ============================================================
// TICKET ADMIN DE ENCOMIENDA
// Endpoint backend-api:
//   POST /cpesunatticketencomienda
//
// Este archivo genera el PDF pequeño para pegar al paquete.
// Contenido actual:
//   1. Cabecera del emisor y datos basicos del CPE.
//   2. Datos de entrega: destino, zona/direccion y destinatario.
//   3. QR con solo "serie-numero" para lector de barras/QR.
//
// Importante:
//   - El ticket completo vive en cpegenerapdfticketencomiendav2.js.
//   - No tocar /v2 cuando se personaliza este formato admin.
//
// Sistema de coordenadas pdf-lib:
//   - x=0,y=0 esta en la esquina inferior izquierda.
//   - Para subir un elemento, aumenta su Y.
//   - Para bajarlo, disminuye su Y.
//   - W/H son ancho y alto del papel en puntos PDF.
//   - M es margen lateral; CW es el ancho util dentro del margen.
//
// Como personalizar sin romper el layout:
//   - Modifica primero las variables de LAYOUT.
//   - Evita cambiar numeros sueltos dentro del dibujo.
//   - Los bloques se calculan en cadena:
//       logo -> emisor -> CPE -> entrega -> destinatario -> QR
// ============================================================
const LAYOUT = {
  // Logo superior. Si la empresa no tiene logo, se imprime un titulo fallback.
  logo: {
    maxWidth: 190,
    maxHeight: 65,
    topMargin: 12,
    issuerGap: 8,
  },
  // Cabecera del emisor. issuerTopY nace justo debajo del logo.
  issuer: {
    fallbackTopGap: 34,
    fallbackIssuerGap: 18,
    razonSize: 7.8,
    razonLineHeight: 5.8,
    rucGap: 12,
    rucSize: 9.2,
    addressGap: 22,
    addressSize: 7.4,
    addressLineHeight: 8.2,
    cpeGap: 42,
  },
  // Datos del CPE. cpeTopY nace debajo del emisor.
  // Aqui se imprime "DATOS DE ENTREGA", serie-numero, fecha y hora.
  cpe: {
    titleGap: 11,
    titleSize: 10.4,
    numberGap: 29,
    numberSize: 16.8,
    dateLabelGap: 38,
    dateValueGap: 41,
    dateValueSize: 11.4,
  },
  // Bloque operativo para el transportista.
  // deliveryTopY nace debajo de la linea fecha/hora del CPE.
  // Si se quiere eliminar espacio entre fecha y destino, reducir topGap.
  delivery: {
    topGap: 44,
    iconX: M + 10,
    iconGap: 4,
    iconSize: 16,
    destinationGap: 6,
    destinationSize: 21.6,
    detailsGap: 28,
    detailsLabelX: M + 8,
    detailsTextX: M + 40,
    detailsLabelSize: 8.2,
    detailsTextSize: 12.4,
    detailsLineHeight: 12.6,
    detailsLabelYOffset: 1.2,
    detailsAfterGap: 4,
  },
  // Bloque del destinatario. Empieza despues de zona/direccion.
  recipient: {
    separatorYOffset: 5,
    labelGap: 8,
    labelSize: 8.2,
    nameGap: 24,
    nameSize: 15.2,
    nameLineHeight: 13.8,
  },
  // QR inferior. Su Y se calcula desde el final del bloque destinatario.
  // preferredY es la posicion ideal; minBottom evita que se salga del papel.
  // gapAbove separa el QR del texto anterior.
  qr: {
    size: 111,
    minBottom: 6,
    preferredY: 78,
    gapAbove: 8,
  },
};

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
  whatsapp: 'M20.52 3.49A10 10 0 0 0 3.9 14.55L2.5 21.5l6.82-1.6A10 10 0 0 0 20.52 3.49zM12 20a8 8 0 0 1-4.07-1.12l-.29-.17-3.05.72.64-3.12-.18-.3A8 8 0 1 1 12 20zm4.44-5.74c-.24-.12-1.43-.71-1.65-.79-.22-.08-.38-.12-.54.12-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.41-.54-.42h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.43-.58 1.63-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28z',
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
  const receiverNameLines = wrap(String(receiverName).toUpperCase(), semibold, 15.2, CW - 16, 2);
  const receiverZoneLines = receiverArrivalZone ? wrap(receiverArrivalZone.toUpperCase(), semibold, 12.4, CW - 16, 2) : [];
  const receiverAddressLines = receiverAddress ? wrap(receiverAddress.toUpperCase(), semibold, 12.4, CW - 16, 4) : [];
  const qrText = displayNumber;

  const logoImage = await embedLogo(pdfDoc, logo);
  const qrDataUrl = await QRCode.toDataURL(qrText || displayNumber || empresa.ruc || 'XPERTCONT');
  const qrImage = await pdfDoc.embedPng(base64ToBytes(qrDataUrl.split(',')[1]));

  // issuerTopY:
  //   Coordenada Y donde empieza la razon social del emisor.
  //   Se define despues de dibujar el logo para que la cabecera quede pegada
  //   al alto real del logo.
  let issuerTopY = H - 74;

  // SECCION 1: LOGO
  // Inicia arriba del papel: H - logoHeight - LAYOUT.logo.topMargin.
  // Tocar maxWidth/maxHeight para cambiar tamaño; tocar topMargin para subir/bajar.
  if (logoImage) {
    const scale = Math.min(LAYOUT.logo.maxWidth / logoImage.width, LAYOUT.logo.maxHeight / logoImage.height);
    const logoWidth = logoImage.width * scale;
    const logoHeight = logoImage.height * scale;
    const logoX = (W - logoWidth) / 2;
    const logoY = H - logoHeight - LAYOUT.logo.topMargin;
    issuerTopY = logoY - LAYOUT.logo.issuerGap;
    page.drawImage(logoImage, {
      x: logoX,
      y: logoY,
      width: logoWidth,
      height: logoHeight,
    });
  } else {
    centered(page, 'TRANSPORTE DE ENCOMIENDAS', H - LAYOUT.issuer.fallbackTopGap, 10.5, bold);
    issuerTopY = H - LAYOUT.issuer.fallbackTopGap - LAYOUT.issuer.fallbackIssuerGap;
  }

  // cpeTopY:
  //   Coordenada Y de la linea punteada que separa emisor y datos del CPE.
  //   Nace desde issuerTopY - LAYOUT.issuer.cpeGap.
  const cpeTopY = issuerTopY - LAYOUT.issuer.cpeGap;

  // SECCION 2: EMISOR
  // Inicia en issuerTopY. Incluye razon social, RUC y direccion fiscal.
  wrap(empresa.razon_social || empresa.nombre_comercial || 'TRANSPORTE DE ENCOMIENDAS', regular, 7.8, CW, 2)
    .forEach((item, index) => centered(page, item, issuerTopY - (index * LAYOUT.issuer.razonLineHeight), LAYOUT.issuer.razonSize, regular));
  centered(page, `RUC ${empresa.ruc || ''}`, issuerTopY - LAYOUT.issuer.rucGap, LAYOUT.issuer.rucSize, regular);
  wrap(empresa.domicilio_fiscal || '', regular, LAYOUT.issuer.addressSize, CW, 2)
    .forEach((item, index) => centered(page, item, issuerTopY - LAYOUT.issuer.addressGap - (index * LAYOUT.issuer.addressLineHeight), LAYOUT.issuer.addressSize, regular, MUTED));

  // SECCION 3: DATOS CPE / IMPRESION
  // Inicia en cpeTopY. Mantiene la misma idea de la cabecera original:
  // titulo, serie-numero, fecha del CPE y hora de impresion/emision.
  dotted(page, cpeTopY);
  centered(page, 'DATOS DE ENTREGA', cpeTopY - LAYOUT.cpe.titleGap, LAYOUT.cpe.titleSize, semibold);
  centeredTracking(page, displayNumber || 'MODELO', cpeTopY - LAYOUT.cpe.numberGap, LAYOUT.cpe.numberSize, regular, INK, 0.55, CW - 8);
  text(page, 'FECHA', 39, cpeTopY - LAYOUT.cpe.dateLabelGap, 6.3, regular, MUTED, 29);
  text(page, datePe(issueDate), 68, cpeTopY - LAYOUT.cpe.dateValueGap, LAYOUT.cpe.dateValueSize, regular, INK, 52);
  line(page, cpeTopY - 40, 113, 113, 0.45);
  text(page, 'HORA', 126, cpeTopY - LAYOUT.cpe.dateLabelGap, 6.3, regular, MUTED, 26);
  text(page, timePe(issueTime), 152, cpeTopY - LAYOUT.cpe.dateValueGap, LAYOUT.cpe.dateValueSize, regular, INK, 58);

  // deliveryTopY:
  //   Coordenada Y donde inicia el bloque de entrega.
  //   Si aparece mucho aire entre fecha/hora y destino, reducir LAYOUT.delivery.topGap.
  const deliveryTopY = cpeTopY - LAYOUT.delivery.topGap;

  // SECCION 4: DESTINO
  // Inicia en deliveryTopY. Se omite el label "DESTINO" para ahorrar altura.
  drawIcon(page, ICONS.place, LAYOUT.delivery.iconX, deliveryTopY - LAYOUT.delivery.iconGap, LAYOUT.delivery.iconSize, ICON_MUTED);
  centeredTracking(page, String(destination).toUpperCase(), deliveryTopY - LAYOUT.delivery.destinationGap, LAYOUT.delivery.destinationSize, bold, INK, 0.22, CW - 18);

  // cursorY:
  //   Cursor vertical mutable. Cada linea dibujada lo reduce por su lineHeight.
  //   Desde aqui se evita usar coordenadas absolutas para textos variables.
  let cursorY = deliveryTopY - LAYOUT.delivery.detailsGap;

  // SECCION 5: ZONA Y DIRECCION DE ENTREGA
  // Inicia debajo del destino. Va antes del destinatario porque es lo primero
  // que necesita leer el transportista si la entrega es a domicilio.
  receiverZoneLines.forEach((item, index) => {
    text(page, index === 0 ? 'ZONA:' : '', LAYOUT.delivery.detailsLabelX, cursorY + LAYOUT.delivery.detailsLabelYOffset, LAYOUT.delivery.detailsLabelSize, semibold, MUTED, 28);
    text(page, item, LAYOUT.delivery.detailsTextX, cursorY, LAYOUT.delivery.detailsTextSize, semibold, INK, CW - 48);
    cursorY -= LAYOUT.delivery.detailsLineHeight;
  });
  receiverAddressLines.forEach((item, index) => {
    text(page, index === 0 ? 'DIR:' : '', LAYOUT.delivery.detailsLabelX, cursorY + LAYOUT.delivery.detailsLabelYOffset, LAYOUT.delivery.detailsLabelSize, semibold, MUTED, 25);
    text(page, item, LAYOUT.delivery.detailsTextX, cursorY, LAYOUT.delivery.detailsTextSize, semibold, INK, CW - 48);
    cursorY -= LAYOUT.delivery.detailsLineHeight;
  });

  cursorY -= receiverZoneLines.length || receiverAddressLines.length ? LAYOUT.delivery.detailsAfterGap : 0;

  // SECCION 6: DESTINATARIO
  // Inicia donde termino zona/direccion. Nombre soporta multilinea.
  line(page, cursorY + LAYOUT.recipient.separatorYOffset, M + 8, W - M - 8, 0.45, LIGHT_LINE);
  centered(page, 'DESTINATARIO', cursorY - LAYOUT.recipient.labelGap, LAYOUT.recipient.labelSize, semibold, MUTED);
  cursorY -= LAYOUT.recipient.nameGap;
  receiverNameLines.forEach((item) => {
    text(page, item, M + 8, cursorY, LAYOUT.recipient.nameSize, semibold, INK, CW - 16);
    cursorY -= LAYOUT.recipient.nameLineHeight;
  });

  // SECCION 7: QR ADMIN
  // Contenido del QR: solo serie-numero del CPE, por ejemplo B001-0000000123.
  // Posicion:
  //   - preferredY intenta mantenerlo a una altura comoda.
  //   - Si el texto anterior crece, cursorY lo empuja hacia abajo.
  //   - minBottom evita que el QR salga por debajo del papel.
  const qrY = Math.max(
    LAYOUT.qr.minBottom,
    Math.min(LAYOUT.qr.preferredY, cursorY - LAYOUT.qr.gapAbove - LAYOUT.qr.size)
  );
  page.drawImage(qrImage, { x: (W - LAYOUT.qr.size) / 2, y: qrY, width: LAYOUT.qr.size, height: LAYOUT.qr.size });

  const pdfBytes = await pdfDoc.save();
  return { estado: true, buffer_pdf: pdfBytes };
};

module.exports = generarPdfTicketEncomienda;
