const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');
const numeral = require('numeral');
const {numeroALetras} = require('../../utils/libreria.utils');

const cpegenerapdf = async (size, logo, jsonVenta, digestvalue) => {
  const pdfDoc = await PDFDocument.create();

  const width = (size === '80mm') ? 226.77 : 164.41;
  const fontSize = (size === '80mm') ? 10 : 8;
  const marginLeftSize = (size === '80mm') ? 0 : 62.36;

  const empresa = jsonVenta.empresa;
  const cliente = jsonVenta.cliente;
  const venta = jsonVenta.venta;
  const registrosdet = jsonVenta.items;

  const lineHeight = fontSize * 1.2;
  const margin = 10;
  const ticketWidth = 227;
  const maxTextWidth = ticketWidth - margin * 2 - marginLeftSize;

  // ─────────────────────────────────────────────────────────────────────────────
  // PASO 1: Pre-cargar fuentes y logo para medir antes de crear la página
  // ─────────────────────────────────────────────────────────────────────────────
  const font        = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontNegrita = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pngImage = await pdfDoc.embedPng(logo);
  const pngDims  = pngImage.scale(0.6);
  const logoHeight = pngDims.height + 10; // alto real del logo + pequeño margen

  // ─────────────────────────────────────────────────────────────────────────────
  // PASO 2: Calcular la altura total necesaria (simulación del layout)
  // ─────────────────────────────────────────────────────────────────────────────
  let estimatedHeight = 0;

  // Logo (alto real, no fijo)
  estimatedHeight += logoHeight;

  // Encabezado empresa
  estimatedHeight += 12; // tipo documento
  estimatedHeight += 12; // RUC
  estimatedHeight += countWrappedLines(empresa.razon_social, maxTextWidth, fontSize, font) * 12 + 2;
  estimatedHeight += countWrappedLines(empresa.domicilio_fiscal, maxTextWidth, 8, font) * 10 + 2;
  estimatedHeight += 12; // serie-numero
  if (venta.ref_numero !== '') estimatedHeight += 12;
  estimatedHeight += 15; // fecha

  // Datos cliente
  estimatedHeight += lineHeight + 2; // banda gris "datos cliente"
  estimatedHeight += 12;
  estimatedHeight += countWrappedLines(cliente.razon_social_nombres?.toString() ?? "", maxTextWidth, fontSize, font) * 12 + 2;
  estimatedHeight += 12; // RUC/DNI
  estimatedHeight += countWrappedLines(cliente.cliente_direccion?.toString() ?? "", maxTextWidth, fontSize, font) * 12 + 2;
  if (venta.vendedor?.trim()) estimatedHeight += 12;
  estimatedHeight += 15; // PAGO CONTADO

  // Cabecera detalle
  estimatedHeight += lineHeight + 2;
  estimatedHeight += 10;

  // Ítems
  registrosdet.forEach(detalle => {
    const productoLines = wrapText(detalle.producto, maxTextWidth, fontSize - 1, font);
    estimatedHeight += productoLines.length * 10; // líneas del producto
    estimatedHeight += 10; // cantidad / unidad / precio
    estimatedHeight += 10; // separador
  });

  // Totales
  estimatedHeight += 30;  // monto en letras (aprox 2-3 líneas)
  estimatedHeight += 10;  // BASE
  estimatedHeight += 10;  // IGV
  estimatedHeight += 15;  // TOTAL

  // QR
  estimatedHeight += 55;  // imagen QR

  // Digest + CDR
  estimatedHeight += 10;
  estimatedHeight += countWrappedLines(
    `Descarga CDR  http://74.208.184.113:8080/descargas/${empresa.ruc}/R-${empresa.ruc}-${venta.codigo}-${venta.serie}-${venta.numero}.xml`,
    maxTextWidth, 8, font
  ) * 10 + 30;

  // Margen inferior de seguridad
  estimatedHeight += 40;

  // ─────────────────────────────────────────────────────────────────────────────
  // PASO 3: Crear la página con el alto calculado
  // ─────────────────────────────────────────────────────────────────────────────
  const height = Math.max(estimatedHeight, 300); // mínimo razonable
  const page = pdfDoc.addPage([width, height]);

  // ─────────────────────────────────────────────────────────────────────────────
  // PASO 4: Dibujar todo el contenido (igual que antes, pero Y parte desde arriba)
  // ─────────────────────────────────────────────────────────────────────────────
  // pngImage y pngDims ya fueron calculados arriba para medir logoHeight
  page.drawImage(pngImage, {
    x: margin + (marginLeftSize / 2),
    y: height - logoHeight,   // posición real: arriba de la página menos el alto del logo
    width: pngDims.width,
    height: pngDims.height,
  });

  let x = margin;
  let y = height - logoHeight; // y arranca justo debajo del logo, sin espacio extra

  const COD = venta.codigo;
  const documentos = {
    '01': 'FACTURA ELECTRONICA',
    '03': 'BOLETA ELECTRONICA',
    '07': 'NOTA CRED. ELECTRONICA',
    '08': 'NOTA DEB. ELECTRONICA'
  };
  const sDocumento = documentos[COD] || 'DOCUMENTO';

  let textWidth = fontNegrita.widthOfTextAtSize(sDocumento, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(sDocumento, { x, y, size: fontSize, font: fontNegrita });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize('RUC ' + empresa.ruc, fontSize + 1);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText('RUC ' + empresa.ruc, { x, y, size: fontSize + 1, font: fontNegrita });
  y -= 12;

  y = drawTextWrapped(page, empresa.razon_social, font, fontSize, maxTextWidth, margin, y, 'center', 12);
  y -= 2;

  y = drawTextWrapped(page, empresa.domicilio_fiscal, font, 8, maxTextWidth, margin, y, 'center', 10);
  y -= 2;

  textWidth = fontNegrita.widthOfTextAtSize(venta.serie + '-' + venta.numero, 12);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(venta.serie + '-' + venta.numero, { x, y, size: 12, font: fontNegrita });
  y -= 12;

  if (venta.ref_numero !== '') {
    textWidth = fontNegrita.widthOfTextAtSize('REF: ' + venta.ref_serie + '-' + venta.ref_numero, 9);
    x = (ticketWidth - textWidth - marginLeftSize) / 2;
    page.drawText('REF: ' + venta.ref_serie + '-' + venta.ref_numero, { x, y, size: 9 });
    y -= 12;
  }

  textWidth = fontNegrita.widthOfTextAtSize("FECHA: " + venta.fecha_emision, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("FECHA: " + venta.fecha_emision, { x, y, size: fontSize });
  y -= 15;

  // Banda "DATOS DEL CLIENTE"
  page.drawRectangle({
    x: margin,
    y: y - 2,
    width: (page.getWidth() - margin - 5),
    height: (lineHeight + 2),
    borderWidth: 1,
    color: rgb(0.778, 0.778, 0.778),
    borderColor: rgb(0.8, 0.8, 0.8)
  });

  textWidth = fontNegrita.widthOfTextAtSize("DATOS DEL CLIENTE: ", fontSize - 1);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("DATOS DEL CLIENTE: ", { x, y, size: fontSize - 1 });
  y -= 12;

  y = drawTextWrapped(page, cliente.razon_social_nombres?.toString() ?? "", font, fontSize, maxTextWidth, margin, y, 'center', 12);
  y -= 2;

  textWidth = fontNegrita.widthOfTextAtSize("RUC/DNI: " + cliente.documento_identidad, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("RUC/DNI: " + cliente.documento_identidad?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  y = drawTextWrapped(page, cliente.cliente_direccion?.toString() ?? "", font, fontSize, maxTextWidth, margin, y, 'center', 12);
  y -= 2;

  const vendedor = venta.vendedor?.trim();
  if (vendedor) {
    textWidth = fontNegrita.widthOfTextAtSize("VENTA: " + venta.vendedor, fontSize);
    x = (ticketWidth - textWidth - marginLeftSize) / 2;
    page.drawText("VENTA: " + venta.vendedor, { x, y, size: fontSize });
    y -= 12;
  }

  textWidth = fontNegrita.widthOfTextAtSize("PAGO: CONTADO", fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("PAGO: CONTADO", { x, y, size: fontSize });
  y -= 15;

  // ── Cabecera de ítems ──────────────────────────────────────────────────────
  page.drawRectangle({
    x: margin,
    y: y - 2,
    width: (page.getWidth() - margin - 5),
    height: (lineHeight + 2),
    borderWidth: 1,
    color: rgb(0.778, 0.778, 0.778),
    borderColor: rgb(0.8, 0.8, 0.8)
  });

  page.drawText("DESCRIPCION", { x: margin, y, size: fontSize - 1 });
  textWidth = fontNegrita.widthOfTextAtSize('P.UNIT', fontSize - 1);
  x = (ticketWidth - textWidth - margin - 50 - marginLeftSize);
  page.drawText("P.UNIT", { x, y, size: fontSize - 1 });
  textWidth = fontNegrita.widthOfTextAtSize('IMPORTE', fontSize - 1);
  x = (ticketWidth - textWidth - margin - marginLeftSize);
  page.drawText("IMPORTE", { x, y, size: fontSize - 1 });
  y -= 10;

  // ── Ítems ─────────────────────────────────────────────────────────────────
  // CORRECCIÓN PRINCIPAL: en lugar de acumular un offset "espaciadoDet" sobre
  // una y fija, simplemente decrementamos y directamente en cada ítem.
  registrosdet.forEach(detalle => {
    const cantidad       = Number(detalle.cantidad);
    const precio_base    = Number(detalle.precio_base);
    const porc_igv       = Number(detalle.porc_igv);
    const precio_unitario = (precio_base * (1 + (porc_igv / 100))).toFixed(2);
    const precio_neto     = (precio_unitario * cantidad).toFixed(2);

    // Nombre del producto (puede ser multilínea)
    const productoLines = wrapText(detalle.producto, maxTextWidth, fontSize - 1, font);
    productoLines.forEach(line => {
      page.drawText(line, { x: margin, y, size: fontSize - 1, font });
      y -= 10;
    });

    // Fila con cantidad, unidad, precio unitario e importe
    page.drawText('Cant: ' + detalle.cantidad, { x: margin, y, size: fontSize - 1 });
    page.drawText(detalle.codigo_unidad, { x: margin + 70, y, size: fontSize - 1 });

    textWidth = font.widthOfTextAtSize(numeral(precio_unitario).format('0,0.00'), fontSize - 1);
    x = (ticketWidth - textWidth - margin - 50 - marginLeftSize);
    page.drawText(numeral(precio_unitario).format('0,0.00'), { x, y, size: fontSize - 1 });

    textWidth = font.widthOfTextAtSize(numeral(precio_neto).format('0,0.00'), fontSize - 1);
    x = (ticketWidth - textWidth - margin - marginLeftSize);
    page.drawText(numeral(precio_neto).format('0,0.00'), { x, y, size: fontSize - 1 });

    y -= 5;

    // Línea separadora
    page.drawLine({
      start: { x: margin, y },
      end:   { x: page.getWidth() - margin - 5, y },
      thickness: 1,
      color: rgb(0.778, 0.778, 0.778),
    });

    y -= 8;
  });

  // ── Totales ───────────────────────────────────────────────────────────────
  y -= 5;

  const monto_total = (Number(venta.base_gravada)  || 0) +
                      (Number(venta.base_exonerada) || 0) +
                      (Number(venta.base_inafecta)  || 0) +
                      (Number(venta.total_igv)      || 0);

  const monedaDesc = { 'PEN': 'Soles', 'USD': 'Dolares Americanos', 'EUR': 'Euros' };
  const sMonedaDesc = monedaDesc[venta.moneda_id] || '';
  let MontoEnLetras = 'SON: ' + numeroALetras(monto_total, sMonedaDesc).toUpperCase();

  // Monto en letras (multilínea)
  const letrasLines = wrapText(MontoEnLetras, maxTextWidth, 8, font);
  letrasLines.forEach(line => {
    page.drawText(line, { x: margin, y, size: 8, font });
    y -= 10;
  });

  y -= 5;

  const moneda = { 'PEN': 'S/', 'USD': '$ USD' };
  const sMoneda = moneda[venta.moneda_id] || '';

  // BASE
  page.drawText("BASE:", { x: margin, y, size: 9 });
  textWidth = font.widthOfTextAtSize(numeral(venta.base_gravada).format('0,0.00'), 10);
  x = (ticketWidth - textWidth - margin - marginLeftSize);
  page.drawText(numeral(venta.base_gravada).format('0,0.00')?.toString() ?? "", { x, y, size: 10, font });
  y -= 10;

  // IGV
  page.drawText("IGV.:", { x: margin, y, size: 9 });
  textWidth = font.widthOfTextAtSize(numeral(venta.total_igv).format('0,0.00'), 10);
  x = (ticketWidth - textWidth - margin - marginLeftSize);
  page.drawText(numeral(venta.total_igv).format('0,0.00')?.toString() ?? "", { x, y, size: 10, font });
  y -= 15;

  // TOTAL
  page.drawText("TOTAL.: " + sMoneda, { x: margin, y, size: fontSize + 2, font: fontNegrita });
  textWidth = fontNegrita.widthOfTextAtSize(numeral(monto_total).format('0,0.00'), fontSize + 2);
  x = (ticketWidth - textWidth - margin - marginLeftSize - 10);
  page.drawText(numeral(monto_total).format('0,0.00')?.toString() ?? "", { x, y, size: fontSize + 2, font: fontNegrita });
  y -= 15;

  // ── QR ───────────────────────────────────────────────────────────────────
  const numeroFormateado   = venta.numero.padStart(8, '0');
  const comprobanteConvertido = `${venta.codigo}|${venta.serie}|${numeroFormateado}`;

  const qrImage      = await QRCode.toDataURL(empresa.ruc + '|' + comprobanteConvertido + '|' + venta.r_igv002 + '|' + venta.r_monto_total + '|' + venta.r_fecemi + '|' + venta.r_id_doc + '|' + venta.r_documento_id + '|');
  const qrImageBytes  = qrImage.split(',')[1];
  const qrImageBuffer = base64ToUint8Array(qrImageBytes);
  const qrImageEmbed  = await pdfDoc.embedPng(qrImageBuffer);

  const qrWidth  = 45;
  const qrHeight = 45;
  x = (ticketWidth - qrWidth - marginLeftSize) / 2;

  page.drawImage(qrImageEmbed, { x, y: y - qrHeight, width: qrWidth, height: qrHeight });
  y -= (qrHeight + 5);

  // ── Digest value ─────────────────────────────────────────────────────────
  page.drawText(digestvalue, { x: margin, y, size: fontSize - 2 });
  y -= 15;

  // ── CDR ──────────────────────────────────────────────────────────────────
  const sCdr = `Descarga CDR  http://74.208.184.113:8080/descargas/${empresa.ruc}/R-${empresa.ruc}-${venta.codigo}-${venta.serie}-${venta.numero}.xml`;
  drawTextWrapped(page, sCdr, font, 8, maxTextWidth, margin, y, 'left', 10);

  const pdfBytes = await pdfDoc.save();
  return {
    estado: true,
    buffer_pdf: pdfBytes
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function base64ToUint8Array(base64) {
  const buffer = Buffer.from(base64, 'base64');
  return new Uint8Array(buffer);
}

/**
 * Divide texto en líneas según ancho máximo y retorna el array de líneas.
 */
function wrapText(text, maxWidth, fontSize, font) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    const testLine  = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });

  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Cuenta cuántas líneas genera un texto al hacer wrap.
 * Útil para pre-calcular la altura antes de crear la página.
 */
function countWrappedLines(text, maxWidth, fontSize, font) {
  return wrapText(text || '', maxWidth, fontSize, font).length;
}

/**
 * Dibuja texto con salto de línea automático y alineación.
 * Retorna la coordenada Y final (debajo del último texto dibujado).
 */
function drawTextWrapped(page, text, font, fontSize, maxWidth, x, y, align = "left", lineHeight = 12) {
  const palabras = (text || '').split(/\s+/);
  let linea = "";
  const lineas = [];

  for (let palabra of palabras) {
    const palabraWidth = font.widthOfTextAtSize(palabra, fontSize);

    if (palabraWidth > maxWidth) {
      if (linea.length > 0) { lineas.push(linea); linea = ""; }

      let palabraRestante = palabra;
      while (palabraRestante.length > 0) {
        let pedazo = "";
        for (let i = 1; i <= palabraRestante.length; i++) {
          const testPedazo = palabraRestante.substring(0, i);
          if (font.widthOfTextAtSize(testPedazo, fontSize) <= maxWidth) {
            pedazo = testPedazo;
          } else {
            break;
          }
        }
        if (pedazo.length === 0) pedazo = palabraRestante.substring(0, 1);
        lineas.push(pedazo);
        palabraRestante = palabraRestante.substring(pedazo.length);
      }
    } else {
      const testLine  = linea.length > 0 ? linea + " " + palabra : palabra;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (testWidth > maxWidth && linea.length > 0) {
        lineas.push(linea);
        linea = palabra;
      } else {
        linea = testLine;
      }
    }
  }

  if (linea.length > 0) lineas.push(linea);

  lineas.forEach((ln, i) => {
    const tw = font.widthOfTextAtSize(ln, fontSize);
    let drawX = x;
    if (align === "center") drawX = x + (maxWidth - tw) / 2;
    else if (align === "right") drawX = x + (maxWidth - tw);

    page.drawText(ln, { x: drawX, y: y - i * lineHeight, size: fontSize, font });
  });

  return y - lineas.length * lineHeight;
}

module.exports = cpegenerapdf;


/*const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');
const numeral = require('numeral');
const {numeroALetras} = require('../../utils/libreria.utils');

const cpegenerapdf = async (size, logo, jsonVenta, digestvalue) => {
  const pdfDoc = await PDFDocument.create();

  const width = (size === '80mm') ? 226.77 : 164.41;
  const fontSize = (size === '80mm') ? 10 : 8;
  const marginLeftSize = (size === '80mm') ? 0 : 62.36;

  const empresa = jsonVenta.empresa;
  const cliente = jsonVenta.cliente;
  const venta = jsonVenta.venta;
  const registrosdet = jsonVenta.items;

  const lineHeight = fontSize * 1.2;
  let height = 800;
  const page = pdfDoc.addPage([width, height]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontNegrita = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pngImage = await pdfDoc.embedPng(logo);
  const pngDims = pngImage.scale(0.6);
  const margin = 10;

  page.drawImage(pngImage, {
    x: margin + (marginLeftSize / 2),
    y: 720,
    width: pngDims.width,
    height: pngDims.height,
  });

  let x = margin;
  let y = 710;

  const COD = venta.codigo;
  const documentos = {
    '01': 'FACTURA ELECTRONICA',
    '03': 'BOLETA ELECTRONICA',
    '07': 'NOTA CRED. ELECTRONICA',
    '08': 'NOTA DEB. ELECTRONICA'
  };
  const sDocumento = documentos[COD] || 'DOCUMENTO';

  const ticketWidth = 227;
  const maxTextWidth = ticketWidth - margin * 2 - marginLeftSize;

  let textWidth = fontNegrita.widthOfTextAtSize(sDocumento, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(sDocumento, { x, y, size: fontSize, font: fontNegrita });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize('RUC ' + empresa.ruc, fontSize + 1);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText('RUC ' + empresa.ruc, { x, y, size: fontSize + 1, font: fontNegrita });
  y -= 12;

  // Razón Social con multilínea
  y = drawTextWrapped(page, empresa.razon_social, font, fontSize, maxTextWidth, margin, y, 'center', 12);
  y -= 2;

  // Domicilio Fiscal con multilínea
  y = drawTextWrapped(page, empresa.domicilio_fiscal, font, 8, maxTextWidth, margin, y, 'center', 10);
  y -= 2;

  textWidth = fontNegrita.widthOfTextAtSize(venta.serie+'-'+venta.numero, 12);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(venta.serie+'-'+venta.numero, { x, y, size: 12, font: fontNegrita });
  y -= 12;
  
  //Nueva ref en caso Nota Credito o Debito
  if (venta.ref_numero !== '') {
    textWidth = fontNegrita.widthOfTextAtSize('REF: ' + venta.ref_serie+'-'+venta.ref_numero, 9);
    x = (ticketWidth - textWidth - marginLeftSize) / 2;
    page.drawText('REF: ' + venta.ref_serie+'-'+venta.ref_numero, { x, y, size: 9 });
    y -= 12;
  }

  textWidth = fontNegrita.widthOfTextAtSize("FECHA: " + venta.fecha_emision, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("FECHA: " + venta.fecha_emision, { x, y, size: fontSize });
  y -= 15;

  page.drawRectangle({
    x: margin,
    y: y - 2,
    width: (page.getWidth() - margin - 5),
    height: (lineHeight + 2),
    borderWidth: 1,
    color: rgb(0.778, 0.778, 0.778),
    borderColor: rgb(0.8, 0.8, 0.8)
  });

  textWidth = fontNegrita.widthOfTextAtSize("DATOS DEL CLIENTE: ", fontSize - 1);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("DATOS DEL CLIENTE: ", { x, y, size: fontSize - 1 });
  y -= 12;

  // Razón Social Cliente con multilínea
  y = drawTextWrapped(page, cliente.razon_social_nombres?.toString() ?? "", font, fontSize, maxTextWidth, margin, y, 'center', 12);
  y -= 2;

  textWidth = fontNegrita.widthOfTextAtSize("RUC/DNI: " + cliente.documento_identidad, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("RUC/DNI: " + cliente.documento_identidad?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  // Dirección Cliente con multilínea
  y = drawTextWrapped(page, cliente.cliente_direccion?.toString() ?? "", font, fontSize, maxTextWidth, margin, y, 'center', 12);
  y -= 2;

  // Opcional: datos del vendedor
  const vendedor = venta.vendedor?.trim();
  if (vendedor) {
    textWidth = fontNegrita.widthOfTextAtSize("VENTA: " + venta.vendedor, fontSize);
    x = (ticketWidth - textWidth - marginLeftSize) / 2;
    page.drawText("VENTA: " + venta.vendedor, { x, y, size: fontSize });
    y -= 12;
  }

  textWidth = fontNegrita.widthOfTextAtSize("PAGO: CONTADO", fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("PAGO: CONTADO", { x, y, size: fontSize });
  y -= 15;

  let row = 1;
  let espaciadoDet = 0;

  espaciadoDet += 20;

  page.drawRectangle({
    x: margin,
    y: y - 2,
    width: (page.getWidth() - margin - 5),
    height: (lineHeight + 2),
    borderWidth: 1,
    color: rgb(0.778, 0.778, 0.778),
    borderColor: rgb(0.8, 0.8, 0.8)
  });

  page.drawText("DESCRIPCION", { x: margin, y, size: fontSize - 1 });
  textWidth = fontNegrita.widthOfTextAtSize('P.UNIT', fontSize - 1);
  x = (ticketWidth - textWidth - margin - 50 - marginLeftSize);
  page.drawText("P.UNIT", { x, y, size: fontSize - 1 });
  textWidth = fontNegrita.widthOfTextAtSize('IMPORTE', fontSize - 1);
  x = (ticketWidth - textWidth - margin - marginLeftSize);
  page.drawText("IMPORTE", { x, y, size: fontSize - 1 });

  let cantidad;
  let precio_base;
  let porc_igv;
  let precio_unitario;
  let precio_neto;

  registrosdet.forEach(detalle => {
    cantidad = Number(detalle.cantidad);
    precio_base = Number(detalle.precio_base);
    porc_igv = Number(detalle.porc_igv);
    precio_unitario = (precio_base*(1+(porc_igv / 100))).toFixed(2);
    precio_neto = (precio_unitario*cantidad).toFixed(2);

    // Producto con multilínea
    const productoLines = wrapText(detalle.producto, maxTextWidth, fontSize - 1, font);
    productoLines.forEach(line => {
      page.drawText(line, { x: margin, y: y + 4 - espaciadoDet, size: fontSize - 1, font });
      espaciadoDet += 10;
    });

    page.drawText('Cant: ' + detalle.cantidad, { x: margin, y: y + 4 - espaciadoDet, size: fontSize - 1 });

    page.drawText(detalle.codigo_unidad, { x: margin + 70, y: y + 4 - espaciadoDet, size: fontSize - 1 });

    textWidth = fontNegrita.widthOfTextAtSize(numeral(precio_unitario).format('0,0.00'), fontSize);
    x = (ticketWidth - textWidth - margin - 50 - marginLeftSize);
    page.drawText(numeral(precio_unitario).format('0,0.00'), { x, y: y + 4 - espaciadoDet, size: fontSize - 1 });

    textWidth = fontNegrita.widthOfTextAtSize(numeral(precio_neto).format('0,0.00'), fontSize);
    x = (ticketWidth - textWidth - margin - marginLeftSize);
    page.drawText(numeral(precio_neto).format('0,0.00'), { x, y: y + 4 - espaciadoDet, size: fontSize - 1 });

    page.drawLine({
      start: { x: margin, y: y + 2 - espaciadoDet },
      end: { x: page.getWidth() - margin - 5, y: y + 2 - espaciadoDet },
      thickness: 1,
      color: rgb(0.778, 0.778, 0.778),
    });

    espaciadoDet += 10;
    row++;
  });

  y = y - 15;
  y = y - 15;

  const monto_total = (Number(venta.base_gravada) || 0) +
                      (Number(venta.base_exonerada) || 0) +
                      (Number(venta.base_inafecta) || 0) +
                      (Number(venta.total_igv) || 0);
  const monedaDesc = {
    'PEN': 'Soles',
    'USD': 'Dolares Americanos',
    'EUR': 'Euros'
  };
  const sMonedaDesc = monedaDesc[venta.moneda_id] || '';
  let MontoEnLetras = numeroALetras(monto_total, sMonedaDesc);
  MontoEnLetras = 'SON: ' + MontoEnLetras.toUpperCase();

  // Monto en letras con multilínea
  //y = drawTextWrapped(page, MontoEnLetras, font, 8, maxTextWidth, margin, y-espaciadoDet, 'left', 10);
  drawTextWrapped(page, MontoEnLetras, font, 8, maxTextWidth, margin, y-espaciadoDet+30, 'left', 10);
    
  //y += 10;

  const moneda = {
    'PEN': 'S/',
    'USD': '$ USD'
  };
  const sMoneda = moneda[venta.moneda_id] || '';

  x = margin;
  page.drawText("BASE:", { x, y: y - espaciadoDet + 4, size: 9 });
  textWidth = fontNegrita.widthOfTextAtSize(numeral(venta.base_gravada).format('0,0.00'), fontSize + 2);
  x = (ticketWidth - textWidth - margin - marginLeftSize);
  page.drawText(numeral(venta.base_gravada).format('0,0.00')?.toString() ?? "", { x, y: y + 4 - espaciadoDet, size: 10, font });

  x = margin;
  page.drawText("IGV.: ", { x, y: y - espaciadoDet + 4 - 10, size: 9 });
  textWidth = fontNegrita.widthOfTextAtSize(numeral(venta.total_igv).format('0,0.00'), fontSize + 2);
  x = (ticketWidth - textWidth - margin - marginLeftSize);
  page.drawText(numeral(venta.total_igv).format('0,0.00')?.toString() ?? "", { x, y: y + 4 - espaciadoDet - 10, size: 10, font });

  x = margin;
  page.drawText("TOTAL.:" + sMoneda, { x, y: y - espaciadoDet + 4 - 25, size: fontSize + 2, font: fontNegrita });
  textWidth = fontNegrita.widthOfTextAtSize(numeral(monto_total).format('0,0.00'), fontSize + 2);
  x = (ticketWidth - textWidth - margin - marginLeftSize-10);
  page.drawText(numeral(monto_total).format('0,0.00')?.toString() ?? "", { x, y: y + 4 - espaciadoDet - 25, size: fontSize + 2, font: fontNegrita });

  // Sección QR
  const numeroFormateado = venta.numero.padStart(8, '0');
  const comprobanteConvertido = `${venta.codigo}|${venta.serie}|${numeroFormateado}`;

  const qrImage = await QRCode.toDataURL(empresa.ruc + '|' + comprobanteConvertido + '|' + venta.r_igv002 + '|' + venta.r_monto_total + '|' + venta.r_fecemi + '|' + venta.r_id_doc + '|' + venta.r_documento_id + '|');
  const qrImageBytes = qrImage.split(',')[1];
  const qrImageBuffer = base64ToUint8Array(qrImageBytes);

  const qrImageEmbed = await pdfDoc.embedPng(qrImageBuffer);
  const qrWidth = 45;
  const qrHeight = 45;
  x = (ticketWidth - 45 - marginLeftSize) / 2;

  page.drawImage(qrImageEmbed, {
    x,
    y: y - espaciadoDet - 26 - 45,
    width: qrWidth,
    height: qrHeight,
  });

  x = margin;
  textWidth = fontNegrita.widthOfTextAtSize(digestvalue, fontSize - 2);
  page.drawText(digestvalue, { x, y: y - espaciadoDet - 80, size: fontSize - 2 });

  y = y - espaciadoDet - 90;
  //Esta Linea imprime descarga de xml

  //Esta Linea imprime descarga de cdr
  const sCdr = `Descarga CDR  http://74.208.184.113:8080/descargas/${empresa.ruc}/R-${empresa.ruc}-${venta.codigo}-${venta.serie}-${venta.numero}.xml`;
  drawTextWrapped(page, sCdr, font, 8, maxTextWidth, margin, y-30, 'left', 10);

  
  const pdfBytes = await pdfDoc.save();
  return {
    estado: true,
    buffer_pdf: pdfBytes
  };
}

function base64ToUint8Array(base64) {
  const buffer = Buffer.from(base64, 'base64');
  const bytes = new Uint8Array(buffer);
  return bytes;
}

//Función para dividir texto en líneas según ancho máximo
function wrapText(text, maxWidth, fontSize, font) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  
  if (currentLine) lines.push(currentLine);
  return lines;
}


function drawTextWrapped(page, text, font, fontSize, maxWidth, x, y, align = "left", lineHeight = 12) {
  const palabras = text.split(/\s+/);
  let linea = "";
  const lineas = [];

  for (let palabra of palabras) {
    // Verificar si la palabra sola es más ancha que maxWidth
    const palabraWidth = font.widthOfTextAtSize(palabra, fontSize);
    
    if (palabraWidth > maxWidth) {
      // Si hay contenido en la línea actual, guardarlo primero
      if (linea.length > 0) {
        lineas.push(linea);
        linea = "";
      }
      
      // Partir la palabra larga en pedazos que quepan
      let palabraRestante = palabra;
      while (palabraRestante.length > 0) {
        let pedazo = "";
        for (let i = 1; i <= palabraRestante.length; i++) {
          const testPedazo = palabraRestante.substring(0, i);
          const testWidth = font.widthOfTextAtSize(testPedazo, fontSize);
          
          if (testWidth <= maxWidth) {
            pedazo = testPedazo;
          } else {
            break;
          }
        }
        
        // Si no cabe ni un carácter, forzar al menos uno
        if (pedazo.length === 0) {
          pedazo = palabraRestante.substring(0, 1);
        }
        
        lineas.push(pedazo);
        palabraRestante = palabraRestante.substring(pedazo.length);
      }
    } else {
      // Lógica normal para palabras que caben
      const testLine = linea.length > 0 ? linea + " " + palabra : palabra;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxWidth && linea.length > 0) {
        lineas.push(linea);
        linea = palabra;
      } else {
        linea = testLine;
      }
    }
  }

  if (linea.length > 0) {
    lineas.push(linea);
  }

  // Dibujar cada línea con alineación
  lineas.forEach((ln, i) => {
    const textWidth = font.widthOfTextAtSize(ln, fontSize);
    let drawX = x;

    if (align === "center") {
      drawX = x + (maxWidth - textWidth) / 2;
    } else if (align === "right") {
      drawX = x + (maxWidth - textWidth);
    }

    page.drawText(ln, {
      x: drawX,
      y: y - i * lineHeight,
      size: fontSize,
      font,
    });
  });

  return y - lineas.length * lineHeight;
}

module.exports = cpegenerapdf;*/

