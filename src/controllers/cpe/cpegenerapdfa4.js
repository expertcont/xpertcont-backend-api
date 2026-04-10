const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');
const numeral = require('numeral');
const { numeroALetras } = require('../../utils/libreria.utils');

// ─── Constantes de layout ────────────────────────────────────────────────────
const PAGE_W      = 595.28;
const PAGE_H      = 841.89;
const MARGIN_L    = 56.69;
const MARGIN_R    = 56.69;
const MARGIN_TOP  = 45;
const MARGIN_BOT  = 45;
const CONTENT_W   = PAGE_W - MARGIN_L - MARGIN_R;

// Columnas de la tabla (posiciones X absolutas)
const COL_CANT    = MARGIN_L + 5;
const COL_UNI     = MARGIN_L + 38;
const COL_DESC    = MARGIN_L + CONTENT_W * 0.18;
const COL_PUNIT   = MARGIN_L + CONTENT_W * 0.72;
const COL_IMP     = MARGIN_L + CONTENT_W * 0.86;

// Altura de fila mínima (producto en 1 línea)
const ROW_MIN_H   = 14;
const ROW_PAD     = 4;  // padding vertical dentro de la fila
const FONT_ROW    = 9;

// ─── Helper: wrapText con corte de palabras largas ───────────────────────────
function wrapText(text, maxWidth, fontSize, font) {
  const words = (text || '').split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    if (!word) continue;
    if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
      if (current) { lines.push(current); current = ''; }
      let chunk = '';
      for (const char of word) {
        const test = chunk + char;
        if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) chunk = test;
        else { if (chunk) lines.push(chunk); chunk = char; }
      }
      if (chunk) current = chunk;
    } else {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawLines(page, lines, font, fontSize, x, y, lineHeight = 12) {
  lines.forEach((ln, i) => {
    page.drawText(ln, { x, y: y - i * lineHeight, size: fontSize, font });
  });
}

function base64ToUint8Array(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

// ─── Dibuja el encabezado de la empresa en una página ────────────────────────
function drawHeader(page, { pngImage, pngDims, empresa, venta, font, fontNegrita }) {
  let y = PAGE_H - MARGIN_TOP;

  // Logo
  page.drawImage(pngImage, {
    x: (PAGE_W - pngDims.width) / 2,
    y: y - pngDims.height,
    width: pngDims.width,
    height: pngDims.height,
  });
  y -= pngDims.height + 8;

  // Tipo de documento
  const documentos = { '01':'FACTURA ELECTRONICA','03':'BOLETA ELECTRONICA','07':'NOTA CRED. ELECTRONICA','08':'NOTA DEB. ELECTRONICA' };
  const sDocumento = documentos[venta.codigo] || 'DOCUMENTO';
  let tw = fontNegrita.widthOfTextAtSize(sDocumento, 14);
  page.drawText(sDocumento, { x: (PAGE_W - tw) / 2, y, size: 14, font: fontNegrita });
  y -= 14;

  // RUC
  tw = fontNegrita.widthOfTextAtSize('RUC ' + empresa.ruc, 12);
  page.drawText('RUC ' + empresa.ruc, { x: (PAGE_W - tw) / 2, y, size: 12, font: fontNegrita });
  y -= 12;

  // Razón social
  tw = font.widthOfTextAtSize(empresa.razon_social, 10);
  page.drawText(empresa.razon_social, { x: (PAGE_W - tw) / 2, y, size: 10, font });
  y -= 11;

  // Domicilio
  tw = font.widthOfTextAtSize(empresa.domicilio_fiscal, 9);
  page.drawText(empresa.domicilio_fiscal, { x: (PAGE_W - tw) / 2, y, size: 9, font });
  y -= 11;

  // Serie-Número
  tw = fontNegrita.widthOfTextAtSize(venta.serie + '-' + venta.numero, 16);
  page.drawText(venta.serie + '-' + venta.numero, { x: (PAGE_W - tw) / 2, y, size: 16, font: fontNegrita, color: rgb(0.4, 0.49, 0.92) });
  y -= 14;

  // Referencia NC/ND
  if (venta.ref_numero !== '') {
    const ref = 'REF: ' + venta.ref_serie + '-' + venta.ref_numero;
    tw = font.widthOfTextAtSize(ref, 10);
    page.drawText(ref, { x: (PAGE_W - tw) / 2, y, size: 10, font });
    y -= 12;
  }

  // Fecha
  const fechaText = 'FECHA: ' + venta.fecha_emision;
  tw = font.widthOfTextAtSize(fechaText, 10);
  page.drawText(fechaText, { x: (PAGE_W - tw) / 2, y, size: 10, font });
  y -= 12;

  // Línea separadora
  page.drawLine({ start: { x: MARGIN_L, y }, end: { x: PAGE_W - MARGIN_R, y }, thickness: 1.5, color: rgb(0.2, 0.2, 0.2) });
  y -= 10;

  // ── Sección cliente ──────────────────────────────────────────────────────
  page.drawRectangle({ x: MARGIN_L, y: y - 14, width: CONTENT_W, height: 16, color: rgb(0.97, 0.97, 0.98), borderColor: rgb(0.4, 0.49, 0.92), borderWidth: 0.5 });
  page.drawText('DATOS DEL CLIENTE', { x: MARGIN_L + 5, y: y - 11, size: 10, font: fontNegrita });
  y -= 18;

  page.drawText('Cliente: ' + (venta.cliente_nombre || ''), { x: MARGIN_L + 5, y, size: 9, font });
  y -= 11;
  page.drawText('RUC/DNI: ' + (venta.documento_identidad || ''), { x: MARGIN_L + 5, y, size: 9, font });
  y -= 11;
  page.drawText('Dirección: ' + (venta.cliente_direccion || ''), { x: MARGIN_L + 5, y, size: 9, font });
  y -= 11;

  if (venta.vendedor?.trim()) {
    page.drawText('Vendedor: ' + venta.vendedor.trim(), { x: MARGIN_L + 5, y, size: 9, font });
    y -= 11;
  }

  page.drawText('Forma de Pago: CONTADO', { x: MARGIN_L + 5, y, size: 9, font });
  y -= 12;

  return y; // Y donde termina el encabezado
}

// ─── Dibuja la cabecera de la tabla de ítems ─────────────────────────────────
function drawTableHeader(page, y, fontNegrita) {
  page.drawRectangle({ x: MARGIN_L, y: y - 14, width: CONTENT_W, height: 16, color: rgb(0.4, 0.49, 0.92) });
  const white = rgb(1, 1, 1);
  page.drawText('CANT',        { x: COL_CANT,  y: y - 11, size: 9, font: fontNegrita, color: white });
  page.drawText('UND',         { x: COL_UNI,   y: y - 11, size: 9, font: fontNegrita, color: white });
  page.drawText('DESCRIPCIÓN', { x: COL_DESC,  y: y - 11, size: 9, font: fontNegrita, color: white });
  page.drawText('P.UNIT',      { x: COL_PUNIT, y: y - 11, size: 9, font: fontNegrita, color: white });
  page.drawText('IMPORTE',     { x: COL_IMP,   y: y - 11, size: 9, font: fontNegrita, color: white });
  return y - 16;
}

// ─── Dibuja número de página en el pie ───────────────────────────────────────
function drawPageNumber(page, pageNum, totalPages, font) {
  const txt = `Página ${pageNum} de ${totalPages}`;
  const tw = font.widthOfTextAtSize(txt, 8);
  page.drawText(txt, { x: (PAGE_W - tw) / 2, y: MARGIN_BOT - 20, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
}

// ─── Función principal ───────────────────────────────────────────────────────
const cpegenerapdfa4 = async (logo, jsonVenta, digestvalue) => {
  const pdfDoc = await PDFDocument.create();

  const font        = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontNegrita = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pngImage    = await pdfDoc.embedPng(logo);
  const pngDims     = pngImage.scale(0.5); // logo más compacto

  const empresa      = jsonVenta.empresa;
  const cliente      = jsonVenta.cliente;
  const venta        = jsonVenta.venta;
  const registrosdet = jsonVenta.items;

  // Inyectar datos de cliente en venta para pasarlo fácil a drawHeader
  venta.cliente_nombre    = cliente.razon_social_nombres || '';
  venta.documento_identidad = cliente.documento_identidad || '';
  venta.cliente_direccion = cliente.cliente_direccion || '';

  // ── QR y datos comunes ────────────────────────────────────────────────────
  const monto_total = (Number(venta.base_gravada)  || 0) +
                      (Number(venta.base_exonerada) || 0) +
                      (Number(venta.base_inafecta)  || 0) +
                      (Number(venta.total_igv)      || 0);

  const monedaDesc    = { PEN:'Soles', USD:'Dolares Americanos', EUR:'Euros' };
  const monedaSimbolo = { PEN:'S/', USD:'$ USD', EUR:'€' };
  const sMonedaDesc   = monedaDesc[venta.moneda_id]    || 'Soles';
  const sMoneda       = monedaSimbolo[venta.moneda_id] || 'S/';
  const MontoEnLetras = 'SON: ' + numeroALetras(monto_total, sMonedaDesc).toUpperCase();

  const numeroFormateado      = venta.numero.padStart(8, '0');
  const comprobanteConvertido = `${venta.codigo}|${venta.serie}|${numeroFormateado}`;
  const qrDataUrl    = await QRCode.toDataURL(
    empresa.ruc + '|' + comprobanteConvertido + '|' +
    venta.r_igv002 + '|' + venta.r_monto_total + '|' +
    venta.r_fecemi + '|' + venta.r_id_doc + '|' + venta.r_documento_id + '|'
  );
  const qrImageEmbed = await pdfDoc.embedPng(base64ToUint8Array(qrDataUrl.split(',')[1]));

  // ── Pre-calcular filas: líneas de descripción y altura de cada ítem ───────
  const maxDescW = CONTENT_W * 0.52;
  const rows = registrosdet.map(detalle => {
    const cantidad        = Number(detalle.cantidad);
    const precio_base     = Number(detalle.precio_base);
    const porc_igv        = Number(detalle.porc_igv);
    const precio_unitario = (precio_base * (1 + porc_igv / 100)).toFixed(2);
    const precio_neto     = (precio_unitario * cantidad).toFixed(2);
    const descLines       = wrapText(detalle.producto, maxDescW, FONT_ROW, font);
    const rowH            = Math.max(ROW_MIN_H, descLines.length * (FONT_ROW + 2)) + ROW_PAD;
    return { detalle, cantidad, precio_unitario, precio_neto, descLines, rowH };
  });

  // ── Distribuir ítems en páginas ───────────────────────────────────────────
  // Altura disponible para ítems en la primera página y en las siguientes
  // Se estima el encabezado de empresa+cliente (varía); usamos una medida fija conservadora.
  const HEADER_H_P1   = 195; // altura aprox del encabezado en pág 1 (logo+empresa+cliente)
  const HEADER_H_CONT = 20;  // en páginas de continuación solo tabla header
  const TABLE_H_LINE  = 16;  // altura cabecera tabla
  const FOOTER_AREA   = 180; // reservado para totales+QR+hash solo en última página

  // Agrupar filas por página
  const pages = []; // cada elemento: { rows: [...] }
  let currentPageRows = [];
  let usedH = HEADER_H_P1 + TABLE_H_LINE;
  let isFirstPage = true;

  for (const row of rows) {
    const availH = PAGE_H - MARGIN_TOP - MARGIN_BOT -
                   (isFirstPage ? HEADER_H_P1 : HEADER_H_CONT) -
                   TABLE_H_LINE;
    const footerReserve = (pages.length === 0 && currentPageRows.length === rows.length - 1) ? FOOTER_AREA : 0;

    if (usedH + row.rowH + footerReserve > PAGE_H - MARGIN_TOP - MARGIN_BOT) {
      pages.push({ rows: currentPageRows });
      currentPageRows = [];
      usedH = HEADER_H_CONT + TABLE_H_LINE;
      isFirstPage = false;
    }
    currentPageRows.push(row);
    usedH += row.rowH;
  }
  pages.push({ rows: currentPageRows }); // última página

  const totalPages = pages.length;

  // ── Dibujar páginas ───────────────────────────────────────────────────────
  const pdfPages = [];

  for (let pi = 0; pi < totalPages; pi++) {
    const pdfPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
    pdfPages.push(pdfPage);

    const ctx = { pngImage, pngDims, empresa, venta, font, fontNegrita };

    let y;
    if (pi === 0) {
      // Primera página: encabezado completo
      y = drawHeader(pdfPage, ctx);
    } else {
      // Páginas siguientes: solo título compacto
      y = PAGE_H - MARGIN_TOP;
      const contText = `${venta.serie}-${venta.numero}  (continuación ${pi + 1}/${totalPages})`;
      const tw = fontNegrita.widthOfTextAtSize(contText, 11);
      pdfPage.drawText(contText, { x: (PAGE_W - tw) / 2, y, size: 11, font: fontNegrita, color: rgb(0.4, 0.49, 0.92) });
      y -= 16;
    }

    // Cabecera tabla
    y = drawTableHeader(pdfPage, y, fontNegrita);

    // ── Filas de esta página ────────────────────────────────────────────────
    let rowColor = pi % 2 === 0; // alternar fondo arrancando diferente por página

    for (const { detalle, cantidad, precio_unitario, precio_neto, descLines, rowH } of pages[pi].rows) {
      // Fondo alternado
      if (rowColor) {
        pdfPage.drawRectangle({ x: MARGIN_L, y: y - rowH, width: CONTENT_W, height: rowH, color: rgb(0.98, 0.98, 0.98) });
      }

      const textY = y - FONT_ROW - ROW_PAD / 2;

      // Cantidad
      pdfPage.drawText(cantidad.toString(), { x: COL_CANT, y: textY, size: FONT_ROW, font });
      // Unidad
      pdfPage.drawText(detalle.codigo_unidad || '', { x: COL_UNI, y: textY, size: FONT_ROW, font });
      // Descripción (multilínea)
      drawLines(pdfPage, descLines, font, FONT_ROW, COL_DESC, textY, FONT_ROW + 2);
      // Precio unitario (alineado a la derecha de COL_IMP)
      const puTxt = numeral(precio_unitario).format('0,0.00');
      const puW   = font.widthOfTextAtSize(puTxt, FONT_ROW);
      pdfPage.drawText(puTxt, { x: COL_IMP - puW - 5, y: textY, size: FONT_ROW, font });
      // Importe (alineado al margen derecho)
      const impTxt = numeral(precio_neto).format('0,0.00');
      const impW   = font.widthOfTextAtSize(impTxt, FONT_ROW);
      pdfPage.drawText(impTxt, { x: PAGE_W - MARGIN_R - impW - 2, y: textY, size: FONT_ROW, font });

      // Línea separadora
      pdfPage.drawLine({ start: { x: MARGIN_L, y: y - rowH }, end: { x: PAGE_W - MARGIN_R, y: y - rowH }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });

      y -= rowH;
      rowColor = !rowColor;
    }

    // ── Totales + QR solo en la última página ─────────────────────────────
    if (pi === totalPages - 1) {
      y -= 10;

      // Monto en letras
      const montoW     = CONTENT_W * 0.58;
      const montoLines = wrapText(MontoEnLetras, montoW - 10, 9, font);
      const montoH     = Math.max(40, montoLines.length * 11 + 18);

      pdfPage.drawRectangle({ x: MARGIN_L, y: y - montoH, width: montoW, height: montoH, color: rgb(1, 0.98, 0.9), borderColor: rgb(1, 0.85, 0.4), borderWidth: 1 });
      pdfPage.drawText('IMPORTE EN LETRAS:', { x: MARGIN_L + 5, y: y - 12, size: 8, font: fontNegrita, color: rgb(0.4, 0.4, 0.4) });
      drawLines(pdfPage, montoLines, font, 9, MARGIN_L + 5, y - 23, 11);

      // Totales derecha
      const totalX = MARGIN_L + CONTENT_W * 0.62;

      pdfPage.drawText('Base Gravada:', { x: totalX, y: y - 12, size: 10, font });
      let tw = font.widthOfTextAtSize(numeral(venta.base_gravada).format('0,0.00'), 10);
      pdfPage.drawText(sMoneda + ' ' + numeral(venta.base_gravada).format('0,0.00'), { x: PAGE_W - MARGIN_R - tw - 15, y: y - 12, size: 10, font });

      pdfPage.drawText('IGV (18%):', { x: totalX, y: y - 24, size: 10, font });
      tw = font.widthOfTextAtSize(numeral(venta.total_igv).format('0,0.00'), 10);
      pdfPage.drawText(sMoneda + ' ' + numeral(venta.total_igv).format('0,0.00'), { x: PAGE_W - MARGIN_R - tw - 15, y: y - 24, size: 10, font });

      y -= montoH + 5;

      // Línea total
      pdfPage.drawLine({ start: { x: totalX, y }, end: { x: PAGE_W - MARGIN_R, y }, thickness: 1.5, color: rgb(0.2, 0.2, 0.2) });
      y -= 14;

      // TOTAL
      pdfPage.drawText('TOTAL:', { x: totalX, y, size: 13, font: fontNegrita, color: rgb(0.4, 0.49, 0.92) });
      tw = fontNegrita.widthOfTextAtSize(sMoneda + ' ' + numeral(monto_total).format('0,0.00'), 13);
      pdfPage.drawText(sMoneda + ' ' + numeral(monto_total).format('0,0.00'), { x: PAGE_W - MARGIN_R - tw - 5, y, size: 13, font: fontNegrita, color: rgb(0.4, 0.49, 0.92) });

      y -= 25;

      // QR centrado
      const qrSize = 90;
      pdfPage.drawImage(qrImageEmbed, { x: (PAGE_W - qrSize) / 2, y: y - qrSize, width: qrSize, height: qrSize });
      y -= qrSize + 10;

      // Hash
      pdfPage.drawRectangle({ x: MARGIN_L, y: y - 22, width: CONTENT_W, height: 22, color: rgb(0.97, 0.97, 0.98), borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
      tw = font.widthOfTextAtSize(digestvalue, 7);
      pdfPage.drawText(digestvalue, { x: (PAGE_W - tw) / 2, y: y - 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) });
      y -= 30;

      // URLs (con wrapText por si son largas)
      const urlFontSize = 7;
      const urlColor    = rgb(0.4, 0.4, 0.8);

      const sXml  = `Descarga XML  http://74.208.184.113:8080/descargas/${empresa.ruc}/${empresa.ruc}-${venta.codigo}-${venta.serie}-${venta.numero}.xml`;
      const sCdr  = `Descarga CDR  http://74.208.184.113:8080/descargas/${empresa.ruc}/R-${empresa.ruc}-${venta.codigo}-${venta.serie}-${venta.numero}.xml`;
      const sPdf  = `Descarga PDF  http://74.208.184.113:8080/descargas/${empresa.ruc}/${empresa.ruc}-${venta.codigo}-${venta.serie}-${venta.numero}.pdf`;

      for (const url of [sXml, sCdr, sPdf]) {
        const urlLines = wrapText(url, CONTENT_W, urlFontSize, font);
        drawLines(pdfPage, urlLines, font, urlFontSize, MARGIN_L, y, 9);
        y -= urlLines.length * 9 + 2;
      }
    }

    // Número de página al pie
    drawPageNumber(pdfPage, pi + 1, totalPages, font);
  }

  const pdfBytes = await pdfDoc.save();
  return { estado: true, buffer_pdf: pdfBytes };
};

module.exports = cpegenerapdfa4;

/*const { PDFDocument, StandardFonts, PDFName, rgb } = require('pdf-lib');
const QRCode = require('qrcode');
const numeral = require('numeral');
const {numeroALetras} = require('../../utils/libreria.utils');

const cpegenerapdfa4 = async (logo, jsonVenta, digestvalue) => {
  const pdfDoc = await PDFDocument.create();

  // Dimensiones A4 en puntos (1mm = 2.834645 puntos)
  const width = 595.28;  // 210mm en puntos
  const height = 841.89; // 297mm en puntos
  
  const page = pdfDoc.addPage([width, height]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontNegrita = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const empresa = jsonVenta.empresa;
  const cliente = jsonVenta.cliente;
  const venta = jsonVenta.venta;
  const registrosdet = jsonVenta.items;

  // Márgenes
  const marginLeft = 56.69; // 20mm
  const marginRight = 56.69;
  const marginTop = 56.69;
  const contentWidth = width - marginLeft - marginRight;

  let y = height - marginTop;

  // ============ LOGO ============
  const pngImage = await pdfDoc.embedPng(logo);
  const logoWidth = 100;
  const logoHeight = 50;
  
  page.drawImage(pngImage, {
    x: (width - logoWidth) / 2,
    y: y - logoHeight,
    width: logoWidth,
    height: logoHeight,
  });
  
  y -= logoHeight + 15;

  // ============ HEADER - TIPO DE DOCUMENTO ============
  const COD = venta.codigo;
  const documentos = {
    '01': 'FACTURA ELECTRONICA',
    '03': 'BOLETA ELECTRONICA',
    '07': 'NOTA CRED. ELECTRONICA',
    '08': 'NOTA DEB. ELECTRONICA'
  };
  const sDocumento = documentos[COD] || 'DOCUMENTO';

  let textWidth = fontNegrita.widthOfTextAtSize(sDocumento, 16);
  page.drawText(sDocumento, { 
    x: (width - textWidth) / 2, 
    y, 
    size: 16, 
    font: fontNegrita 
  });
  y -= 18;

  // RUC
  const rucText = 'RUC ' + empresa.ruc;
  textWidth = fontNegrita.widthOfTextAtSize(rucText, 14);
  page.drawText(rucText, { 
    x: (width - textWidth) / 2, 
    y, 
    size: 14, 
    font: fontNegrita 
  });
  y -= 16;

  // Razón Social
  textWidth = font.widthOfTextAtSize(empresa.razon_social, 11);
  page.drawText(empresa.razon_social, { 
    x: (width - textWidth) / 2, 
    y, 
    size: 11,
    font 
  });
  y -= 14;

  // Dirección
  textWidth = font.widthOfTextAtSize(empresa.domicilio_fiscal, 10);
  page.drawText(empresa.domicilio_fiscal, { 
    x: (width - textWidth) / 2, 
    y, 
    size: 10,
    font 
  });
  y -= 18;

  // Serie y Número
  const serieNumero = venta.serie + '-' + venta.numero;
  textWidth = fontNegrita.widthOfTextAtSize(serieNumero, 18);
  page.drawText(serieNumero, { 
    x: (width - textWidth) / 2, 
    y, 
    size: 18, 
    font: fontNegrita,
    color: rgb(0.4, 0.49, 0.92) // Color azul
  });
  y -= 15;

  //Nueva ref en caso Nota Credito o Debito
  if (venta.ref_numero !== '') {
    const refNota = 'REF: ' + venta.ref_serie+'-'+venta.ref_numero;
    textWidth = font.widthOfTextAtSize(refNota, 11);
    page.drawText(refNota, { 
      x: (width - textWidth) / 2, 
      y, 
      size: 11,
      font 
    });
    y -= 15;
  }

  // Fecha
  const fechaText = 'FECHA: ' + venta.fecha_emision;
  textWidth = font.widthOfTextAtSize(fechaText, 11);
  page.drawText(fechaText, { 
    x: (width - textWidth) / 2, 
    y, 
    size: 11,
    font 
  });
  y -= 15;

  // Línea separadora
  page.drawLine({
    start: { x: marginLeft, y },
    end: { x: width - marginRight, y },
    thickness: 2,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 15;

  // ============ SECCIÓN CLIENTE ============
  // Fondo gris para el título
  page.drawRectangle({
    x: marginLeft,
    y: y - 16,
    width: contentWidth,
    height: 18,
    color: rgb(0.97, 0.97, 0.98),
    borderColor: rgb(0.4, 0.49, 0.92),
    borderWidth: 0.5,
  });

  page.drawText('DATOS DEL CLIENTE', { 
    x: marginLeft + 5, 
    y: y - 12, 
    size: 11, 
    font: fontNegrita 
  });
  y -= 25;

  // Cliente
  page.drawText('Cliente: ' + (cliente.razon_social_nombres || ''), { 
    x: marginLeft + 5, 
    y, 
    size: 10,
    font 
  });
  y -= 14;

  // RUC/DNI
  page.drawText('RUC/DNI: ' + (cliente.documento_identidad || ''), { 
    x: marginLeft + 5, 
    y, 
    size: 10,
    font 
  });
  y -= 14;

  // Dirección
  page.drawText('Dirección: ' + (cliente.cliente_direccion || ''), { 
    x: marginLeft + 5, 
    y, 
    size: 10,
    font 
  });
  y -= 14;

  // Vendedor (opcional)
  const vendedor = venta.vendedor?.trim();
  if (vendedor) {
    page.drawText('Vendedor: ' + vendedor, { 
      x: marginLeft + 5, 
      y, 
      size: 10,
      font 
    });
    y -= 14;
  }

  // Forma de pago
  page.drawText('Forma de Pago: CONTADO', { 
    x: marginLeft + 5, 
    y, 
    size: 10,
    font 
  });
  y -= 15;

  // ============ TABLA DE PRODUCTOS ============
  // Header de la tabla
  const tableTop = y;
  page.drawRectangle({
    x: marginLeft,
    y: y - 18,
    width: contentWidth,
    height: 18,
    color: rgb(0.4, 0.49, 0.92),
  });

  // Columnas: CANT (10%) | DESCRIPCIÓN (50%) | P.UNIT (20%) | IMPORTE (20%)
  const colCant = marginLeft + 5;
  const colDesc = marginLeft + contentWidth * 0.12;
  const colPUnit = marginLeft + contentWidth * 0.72;
  const colImporte = marginLeft + contentWidth * 0.85;

  page.drawText('CANT.', { 
    x: colCant, 
    y: y - 13, 
    size: 10, 
    font: fontNegrita,
    color: rgb(1, 1, 1)
  });
  
  page.drawText('DESCRIPCIÓN', { 
    x: colDesc+5, 
    y: y - 13, 
    size: 10, 
    font: fontNegrita,
    color: rgb(1, 1, 1)
  });
  
  page.drawText('P. UNITARIO', { 
    x: colPUnit, 
    y: y - 13, 
    size: 10, 
    font: fontNegrita,
    color: rgb(1, 1, 1)
  });
  
  page.drawText('IMPORTE', { 
    x: colImporte + 20, 
    y: y - 13, 
    size: 10, 
    font: fontNegrita,
    color: rgb(1, 1, 1)
  });

  y -= 25;

  // Función para dividir texto en líneas
  const wrapText = (text, maxWidth, fontSize, font) => {
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
  };

  // Productos
  let rowColor = true;
  registrosdet.forEach((detalle, index) => {
    const cantidad = Number(detalle.cantidad);
    const precio_base = Number(detalle.precio_base);
    const porc_igv = Number(detalle.porc_igv);
    const precio_unitario = (precio_base * (1 + (porc_igv / 100))).toFixed(2);
    const precio_neto = (precio_unitario * cantidad).toFixed(2);

    // Dividir descripción en líneas si es necesaria
    const maxDescWidth = contentWidth * 0.58; // Ancho disponible para descripción
    const descLines = wrapText(detalle.producto, maxDescWidth, 9, font);
    const rowHeight = Math.max(20, descLines.length * 12 + 8);

    // Fondo alternado
    if (rowColor) {
      page.drawRectangle({
        x: marginLeft,
        y: y - rowHeight + 2,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.98, 0.98, 0.98),
      });
    }

    // Cantidad (centrada verticalmente)
    //const centeredY = y - (rowHeight / 2) - 3;
    const centeredY = y - 8;
    page.drawText(cantidad.toString(), { 
      x: colCant + 10, 
      y: centeredY, 
      size: 9,
      font 
    });

    // codigo_unidad (centrada verticalmente) NEWWWW
    //const centeredUni = y - (rowHeight / 2) - 3;
    const centeredUni = y - 8;
    page.drawText(detalle.codigo_unidad, { 
      x: colCant + 35, 
      y: centeredUni, 
      size: 9,
      font 
    });
    
    // Descripción en múltiples líneas
    let descY = y - 8;
    descLines.forEach(line => {
      page.drawText(line, { 
        x: colDesc + 5,  //+10 original ....NEWW
        y: descY, 
        size: 9,
        font 
      });
      descY -= 12;
    });

    // Precio unitario (alineado a la derecha y centrado verticalmente)
    const punitText = numeral(precio_unitario).format('0,0.00');
    textWidth = font.widthOfTextAtSize(punitText, 9);
    page.drawText(punitText, { 
      x: colImporte - 40 - textWidth, 
      y: centeredY, 
      size: 9,
      font 
    });

    // Importe (alineado a la derecha y centrado verticalmente)
    const importeText = numeral(precio_neto).format('0,0.00');
    textWidth = font.widthOfTextAtSize(importeText, 9);
    page.drawText(importeText, { 
      x: width - marginRight - textWidth - 5, 
      y: centeredY, 
      size: 9,
      font 
    });

    // Línea separadora
    page.drawLine({
      start: { x: marginLeft, y: y - rowHeight },
      end: { x: width - marginRight, y: y - rowHeight },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });

    y -= rowHeight + 2;
    rowColor = !rowColor;
  });

  y -= 15;

  // ============ TOTALES ============
  const monto_total = (Number(venta.base_gravada) || 0) +
                      (Number(venta.base_exonerada) || 0) +
                      (Number(venta.base_inafecta) || 0) +
                      (Number(venta.total_igv) || 0);

  const monedaDesc = {
    'PEN': 'Soles',
    'USD': 'Dolares Americanos',
    'EUR': 'Euros'
  };
  const sMonedaDesc = monedaDesc[venta.moneda_id] || 'Soles';
  let MontoEnLetras = numeroALetras(monto_total, sMonedaDesc);
  MontoEnLetras = 'SON: ' + MontoEnLetras.toUpperCase();

  const moneda = {
    'PEN': 'S/',
    'USD': '$ USD',
    'EUR': '€'
  };
  const sMoneda = moneda[venta.moneda_id] || 'S/';

   // Monto en letras (lado izquierdo) - con ajuste multilínea
  const montoLetrasWidth = contentWidth * 0.6 - 10; // Ancho disponible menos padding
  const montoLetrasLines = wrapText(MontoEnLetras, montoLetrasWidth, 10, font);
  const montoLetrasHeight = Math.max(45, montoLetrasLines.length * 12 + 20); // Altura dinámica

  page.drawRectangle({
    x: marginLeft,
    y: y - montoLetrasHeight,
    width: contentWidth * 0.6,
    height: montoLetrasHeight,
    color: rgb(1, 0.98, 0.9),
    borderColor: rgb(1, 0.85, 0.4),
    borderWidth: 1,
  });

  page.drawText('IMPORTE EN LETRAS:', { 
    x: marginLeft + 5, 
    y: y - 15, 
    size: 9, 
    font: fontNegrita,
    color: rgb(0.4, 0.4, 0.4)
  });

  // Dibujar cada línea del monto en letras
  let montoY = y - 28;
  montoLetrasLines.forEach(line => {
    page.drawText(line, { 
      x: marginLeft + 5, 
      y: montoY, 
      size: 10,
      font 
    });
    montoY -= 12;
  });

  // Totales (lado derecho)
  const totalX = marginLeft + contentWidth * 0.62;
  const totalWidth = contentWidth * 0.38;

  // Base gravada
  page.drawText('Base Gravada:', { 
    x: totalX, 
    y: y - 15, 
    size: 10,
    font 
  });
  textWidth = font.widthOfTextAtSize(numeral(venta.base_gravada).format('0,0.00'), 10);
  page.drawText(sMoneda + ' ' + numeral(venta.base_gravada).format('0,0.00'), { 
    x: width - marginRight - textWidth - 15, 
    y: y - 15, 
    size: 10,
    font 
  });

  // IGV
  page.drawText('IGV (18%):', { 
    x: totalX, 
    y: y - 30, 
    size: 10,
    font 
  });
  textWidth = font.widthOfTextAtSize(numeral(venta.total_igv).format('0,0.00'), 10);
  page.drawText(sMoneda + ' ' + numeral(venta.total_igv).format('0,0.00'), { 
    x: width - marginRight - textWidth - 15, 
    y: y - 30, 
    size: 10,
    font 
  });

  y -= 50;

  // Línea antes del total
  page.drawLine({
    start: { x: totalX, y },
    end: { x: width - marginRight, y },
    thickness: 2,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 15;

  // TOTAL FINAL
  page.drawText('TOTAL:', { 
    x: totalX, 
    y, 
    size: 14, 
    font: fontNegrita,
    color: rgb(0.4, 0.49, 0.92)
  });
  textWidth = fontNegrita.widthOfTextAtSize(numeral(monto_total).format('0,0.00'), 14);
  page.drawText(sMoneda + ' ' + numeral(monto_total).format('0,0.00'), { 
    x: width - marginRight - textWidth - 15, 
    y, 
    size: 14, 
    font: fontNegrita,
    color: rgb(0.4, 0.49, 0.92)
  });

  y -= 40;

  // ============ CÓDIGO QR ============
  const numeroFormateado = venta.numero.padStart(8, '0');
  const comprobanteConvertido = `${venta.codigo}|${venta.serie}|${numeroFormateado}`;

  const qrImage = await QRCode.toDataURL(
    empresa.ruc + '|' + comprobanteConvertido + '|' + 
    venta.r_igv002 + '|' + venta.r_monto_total + '|' + 
    venta.r_fecemi + '|' + venta.r_id_doc + '|' + 
    venta.r_documento_id + '|'
  );

  const qrImageBytes = qrImage.split(',')[1];
  const qrImageBuffer = base64ToUint8Array(qrImageBytes);
  const qrImageEmbed = await pdfDoc.embedPng(qrImageBuffer);

  const qrSize = 100;
  const qrX = (width - qrSize) / 2;

  page.drawImage(qrImageEmbed, {
    x: qrX,
    y: y - qrSize,
    width: qrSize,
    height: qrSize,
  });

  y -= qrSize + 15;

  // ============ HASH ============
  page.drawRectangle({
    x: marginLeft,
    y: y - 25,
    width: contentWidth,
    height: 25,
    color: rgb(0.97, 0.97, 0.98),
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.5,
  });
  
  //Esta Linea imprime codigo hash, variable digestvalue
  textWidth = font.widthOfTextAtSize(digestvalue, 8);
  page.drawText(digestvalue, { 
    x: (width - textWidth) / 2, 
    y: y - 18, 
    size: 8,
    font,
    color: rgb(0.6, 0.6, 0.6)
  });

  //Esta Linea imprime descarga de pdf y cdr
  const sXml = `Descarga XML  http://74.208.184.113:8080/descargas/${empresa.ruc}/${empresa.ruc}-${venta.codigo}-${venta.serie}-${venta.numero}.xml`;
  textWidth = font.widthOfTextAtSize(sXml, 8);
  page.drawText(sXml, { 
    x: marginLeft, 
    y: y - 38, 
    size: 8,
    font,
    color: rgb(0.6, 0.6, 0.6)
  });
  
  //Esta Linea imprime descarga de pdf y cdr
  const sCdr = `Descarga CDR  http://74.208.184.113:8080/descargas/${empresa.ruc}/R-${empresa.ruc}-${venta.codigo}-${venta.serie}-${venta.numero}.xml`;
  textWidth = font.widthOfTextAtSize(sCdr, 8);
  page.drawText(sCdr, { 
    x: marginLeft, 
    y: y - 48, 
    size: 8,
    font,
    color: rgb(0.6, 0.6, 0.6)
  });
  //Esta Linea imprime descarga de pdf y cdr
  const sPdf = `Descarga PDF  http://74.208.184.113:8080/descargas/${empresa.ruc}/${empresa.ruc}-${venta.codigo}-${venta.serie}-${venta.numero}.pdf`;
  textWidth = font.widthOfTextAtSize(sPdf, 8);
  page.drawText(sPdf, { 
    x: marginLeft, 
    y: y - 58, 
    size: 8,
    font,
    color: rgb(0.6, 0.6, 0.6)
  });
  

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

module.exports = cpegenerapdfa4;*/