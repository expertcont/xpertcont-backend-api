const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');

const gregenerapdfa4 = async (logo, sJson, digestvalue) => {
  const pdfDoc = await PDFDocument.create();

  // Dimensiones A4 en puntos (1mm = 2.834645 puntos)
  const width = 595.28;  // 210mm en puntos
  const height = 841.89; // 297mm en puntos
  
  const page = pdfDoc.addPage([width, height]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontNegrita = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const empresa = sJson.empresa;
  const guia = sJson.guia;
  const registrosdet = sJson.items;

  // Márgenes
  const marginLeft = 56.69; // 20mm
  const marginRight = 56.69;
  const marginTop = 56.69;
  const contentWidth = width - marginLeft - marginRight;

  let y = height - marginTop;

  // ============ LOGO ============
  const pngImage = await pdfDoc.embedPng(logo);
  const logoWidth = 80;
  const logoHeight = 40;
  
  page.drawImage(pngImage, {
    x: (width - logoWidth) / 2,
    y: y - logoHeight,
    width: logoWidth,
    height: logoHeight,
  });
  
  y -= logoHeight + 10;

  // ============ HEADER - EMPRESA ============
  let textWidth = font.widthOfTextAtSize(empresa.razon_social, 10);
  page.drawText(empresa.razon_social, { 
    x: (width - textWidth) / 2, 
    y, 
    size: 10,
    font
  });
  y -= 12;

  // RUC
  const rucText = 'RUC ' + empresa.ruc;
  textWidth = fontNegrita.widthOfTextAtSize(rucText, 12);
  page.drawText(rucText, { 
    x: (width - textWidth) / 2, 
    y, 
    size: 12, 
    font: fontNegrita 
  });
  y -= 13;

  // Dirección (con wrap)
  y = drawTextWrapped(page, empresa.domicilio_fiscal, font, 9, contentWidth, marginLeft, y, 'center', 11);
  y -= 13;

  // ============ TIPO DE DOCUMENTO ============
  const COD = guia.codigo;
  const documentos = {
    '09': 'GUIA REMISION REMITENTE',
    '31': 'GUIA REMISION TRANSPORTISTA'
  };
  const sDocumento = documentos[COD] || 'DOCUMENTO';

  textWidth = fontNegrita.widthOfTextAtSize(sDocumento, 14);
  page.drawText(sDocumento, { 
    x: (width - textWidth) / 2, 
    y, 
    size: 14, 
    font: fontNegrita 
  });
  y -= 13;

  textWidth = fontNegrita.widthOfTextAtSize('ELECTRONICA', 11);
  page.drawText('ELECTRONICA', { 
    x: (width - textWidth) / 2, 
    y, 
    size: 11, 
    font: fontNegrita 
  });
  y -= 14;

  // Serie y Número
  const serieNumero = guia.serie + '-' + guia.numero;
  textWidth = fontNegrita.widthOfTextAtSize(serieNumero, 16);
  page.drawText(serieNumero, { 
    x: (width - textWidth) / 2, 
    y, 
    size: 16, 
    font: fontNegrita,
    color: rgb(0.4, 0.49, 0.92)
  });
  y -= 15;

  // Línea separadora
  page.drawLine({
    start: { x: marginLeft, y },
    end: { x: width - marginRight, y },
    thickness: 2,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 12;

  // ============ DESTINATARIO Y TRANSPORTE (DOS COLUMNAS) ============
  const colLeftWidth = contentWidth / 2 - 5;
  const colRightStart = marginLeft + contentWidth / 2 + 5;
  
  let yLeft = y;
  let yRight = y;

  // === COLUMNA IZQUIERDA: DESTINATARIO ===
  page.drawRectangle({
    x: marginLeft,
    y: yLeft - 14,
    width: colLeftWidth,
    height: 14,
    color: rgb(0.97, 0.97, 0.98),
    borderColor: rgb(0.4, 0.49, 0.92),
    borderWidth: 0.5,
  });

  page.drawText('DESTINATARIO', { 
    x: marginLeft + 4, 
    y: yLeft - 10, 
    size: 9, 
    font: fontNegrita 
  });
  yLeft -= 20;

  page.drawText('Razon Social: ' + (guia.destinatario_razon_social || ''), { 
    x: marginLeft + 4, 
    y: yLeft, 
    size: 8,
    font 
  });
  yLeft -= 10;

  page.drawText('RUC/DNI: ' + (guia.destinatario_ruc_dni || ''), { 
    x: marginLeft + 4, 
    y: yLeft, 
    size: 8,
    font 
  });
  yLeft -= 10;

  yLeft = drawTextWrapped(page, 'Dir: ' + (guia.llegada_direccion || ''), font, 8, colLeftWidth - 8, marginLeft + 4, yLeft, 'left', 10);

  // === COLUMNA DERECHA: TRANSPORTE ===
  const IDMODOTRASLADO = guia.guia_modalidad_id;
  
  page.drawRectangle({
    x: colRightStart,
    y: yRight - 14,
    width: colLeftWidth,
    height: 14,
    color: rgb(0.97, 0.97, 0.98),
    borderColor: rgb(0.4, 0.49, 0.92),
    borderWidth: 0.5,
  });

  page.drawText('DATOS DEL TRANSPORTE', { 
    x: colRightStart + 4, 
    y: yRight - 10, 
    size: 9, 
    font: fontNegrita 
  });
  yRight -= 20;

  // TRANSPORTE PÚBLICO
  if (IDMODOTRASLADO === '01') {
    page.drawText('Transportista: ' + (guia.transp_razon_social || ''), { 
      x: colRightStart + 4, 
      y: yRight, 
      size: 8,
      font 
    });
    yRight -= 10;

    page.drawText('RUC: ' + (guia.transp_ruc || ''), { 
      x: colRightStart + 4, 
      y: yRight, 
      size: 8,
      font 
    });
    yRight -= 10;
  }

  // TRANSPORTE PRIVADO
  if (IDMODOTRASLADO === '02') {
    yRight = drawTextWrapped(page, 'Conductor: ' + (guia.conductor_nombres || '') + ' ' + (guia.conductor_apellidos || ''), font, 8, colLeftWidth - 8, colRightStart + 4, yRight, 'left', 10);

    page.drawText('DNI: ' + (guia.conductor_dni || ''), { 
      x: colRightStart + 4, 
      y: yRight, 
      size: 8,
      font 
    });
    yRight -= 10;

    page.drawText('Licencia: ' + (guia.conductor_licencia || ''), { 
      x: colRightStart + 4, 
      y: yRight, 
      size: 8,
      font 
    });
    yRight -= 10;

    page.drawText('Placa: ' + (guia.vehiculo_placa || ''), { 
      x: colRightStart + 4, 
      y: yRight, 
      size: 8,
      font 
    });
    yRight -= 10;
  }

  y = Math.min(yLeft, yRight) - 12;

  // ============ DATOS DE ENVÍO ============
  page.drawRectangle({
    x: marginLeft,
    y: y - 14,
    width: contentWidth,
    height: 14,
    color: rgb(0.97, 0.97, 0.98),
    borderColor: rgb(0.4, 0.49, 0.92),
    borderWidth: 0.5,
  });

  page.drawText('DATOS DE ENVIO', { 
    x: marginLeft + 4, 
    y: y - 10, 
    size: 9, 
    font: fontNegrita 
  });
  y -= 20;

  // Mapeo de motivos y modalidades
  const IDMOTIVO = guia.guia_motivo_id;
  const motivos = {
    '01': 'VENTA',
    '02': 'COMPRA',
    '03': 'VENTA CON ENTREGA A TERCEROS',
    '04': 'TRASLADO ENTRE ESTABLECIMIENTOS MISMA EMPRESA',
    '05': 'CONSIGNACION',
    '06': 'DEVOLUCION',
    '07': 'RECOJO DE BIENES TRANSFORMADOS',
    '08': 'IMPORTACION',
    '09': 'EXPORTACION',
    '13': 'OTROS',
    '14': 'VENTA SUJETA A CONFIRMACION DEL COMPRADOR',
    '15': 'TRASLADO DE BIENES PARA SU TRANSFORMACION',
    '18': 'TRASLADO EMISOR ITINERANTE CP',
  };
  const sMotivo = motivos[IDMOTIVO] || 'OTROS';

  const modalidad = {
    '01': 'TRANSPORTE PUBLICO',
    '02': 'TRANSPORTE PRIVADO',
  };
  const sModalidad = modalidad[IDMODOTRASLADO] || 'OTROS';

  // Layout en dos columnas
  const colLeft = marginLeft + 4;
  const colRight = marginLeft + contentWidth / 2 + 10;
  yLeft = y;
  yRight = y;

  // Columna izquierda
  page.drawText('F. Emision: ' + (guia.fecha_emision || ''), { 
    x: colLeft, 
    y: yLeft, 
    size: 8,
    font 
  });
  yLeft -= 10;

  page.drawText('F. Traslado: ' + (guia.fecha_traslado || ''), { 
    x: colLeft, 
    y: yLeft, 
    size: 8,
    font 
  });
  yLeft -= 10;

  page.drawText('Motivo: ' + sMotivo, { 
    x: colLeft, 
    y: yLeft, 
    size: 8,
    font 
  });
  yLeft -= 10;

  page.drawText('Modalidad: ' + sModalidad, { 
    x: colLeft, 
    y: yLeft, 
    size: 8,
    font 
  });
  yLeft -= 10;

  page.drawText('Peso Total (KG): ' + (guia.peso_total || ''), { 
    x: colLeft, 
    y: yLeft, 
    size: 8,
    font 
  });
  yLeft -= 10;

  // Columna derecha
  page.drawText('Partida Ubigeo: ' + (guia.partida_ubigeo || ''), { 
    x: colRight, 
    y: yRight, 
    size: 8,
    font 
  });
  yRight -= 10;

  yRight = drawTextWrapped(page, 'Dir: ' + (guia.partida_direccion || ''), font, 8, contentWidth/2 - 20, colRight, yRight, 'left', 10);

  page.drawText('Llegada Ubigeo: ' + (guia.llegada_ubigeo || ''), { 
    x: colRight, 
    y: yRight, 
    size: 8,
    font 
  });
  yRight -= 10;

  yRight = drawTextWrapped(page, 'Dir: ' + (guia.llegada_direccion || ''), font, 8, contentWidth/2 - 20, colRight, yRight, 'left', 10);

  y = Math.min(yLeft, yRight) - 12;

  // ============ TABLA DE PRODUCTOS ============
  page.drawRectangle({
    x: marginLeft,
    y: y - 14,
    width: contentWidth,
    height: 14,
    color: rgb(0.4, 0.49, 0.92),
  });

  // Columnas: CANT (15%) | DESCRIPCIÓN (70%) | UNIDAD (15%)
  const colCant = marginLeft + 4;
  const colDesc = marginLeft + contentWidth * 0.15;
  const colUnidad = marginLeft + contentWidth * 0.88;

  page.drawText('CANT.', { 
    x: colCant, 
    y: y - 10, 
    size: 9, 
    font: fontNegrita,
    color: rgb(1, 1, 1)
  });
  
  page.drawText('DESCRIPCION', { 
    x: colDesc, 
    y: y - 10, 
    size: 9, 
    font: fontNegrita,
    color: rgb(1, 1, 1)
  });
  
  page.drawText('UNIDAD', { 
    x: colUnidad, 
    y: y - 10, 
    size: 9, 
    font: fontNegrita,
    color: rgb(1, 1, 1)
  });

  y -= 18;

  // Productos
  let rowColor = true;
  registrosdet.forEach((detalle, index) => {
    const maxDescWidth = contentWidth * 0.70;
    
    // Dividir descripción en líneas
    const descLines = wrapText(detalle.producto, maxDescWidth, 8, font);
    const rowHeight = Math.max(18, descLines.length * 10 + 8);

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

    // Descripción en múltiples líneas
    let descY = y - 5;
    descLines.forEach(line => {
      page.drawText(line, { 
        x: colDesc, 
        y: descY, 
        size: 8,
        font 
      });
      descY -= 10;
    });

    // Cantidad (debajo de descripción)
    page.drawText('Cant: ' + detalle.cantidad, { 
      x: colCant, 
      y: descY + 2, 
      size: 7,
      font 
    });

    // Unidad (centrada verticalmente)
    const centeredY = y - (rowHeight / 2) - 2;
    page.drawText(detalle.codigo_unidad || 'UND', { 
      x: colUnidad, 
      y: centeredY, 
      size: 8,
      font 
    });

    // Línea separadora
    page.drawLine({
      start: { x: marginLeft, y: y - rowHeight },
      end: { x: width - marginRight, y: y - rowHeight },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });

    y -= rowHeight + 1;
    rowColor = !rowColor;
  });

  y -= 20;

  // ============ CÓDIGO QR Y HASH ============
  const qrImage = await QRCode.toDataURL(digestvalue);
  const qrImageBytes = qrImage.split(',')[1];
  const qrImageBuffer = base64ToUint8Array(qrImageBytes);
  const qrImageEmbed = await pdfDoc.embedPng(qrImageBuffer);

  const qrSize = 80;
  const qrX = (width - qrSize) / 2;

  page.drawImage(qrImageEmbed, {
    x: qrX,
    y: y - qrSize,
    width: qrSize,
    height: qrSize,
  });

  y -= qrSize + 10;

  // Hash
  page.drawRectangle({
    x: marginLeft,
    y: y - 20,
    width: contentWidth,
    height: 20,
    color: rgb(0.97, 0.97, 0.98),
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.5,
  });

  textWidth = font.widthOfTextAtSize(digestvalue, 7);
  page.drawText(digestvalue, { 
    x: (width - textWidth) / 2, 
    y: y - 14, 
    size: 7,
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

/**
 * Función para dividir texto en líneas según ancho máximo
 */
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

/**
 * Dibuja texto multilínea con ajuste automático y alineación
 */
function drawTextWrapped(page, text, font, fontSize, maxWidth, x, y, align = "left", lineHeight = 10) {
  const palabras = text.split(/\s+/);
  let linea = "";
  const lineas = [];

  for (let palabra of palabras) {
    const testLine = linea.length > 0 ? linea + " " + palabra : palabra;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth > maxWidth && linea.length > 0) {
      lineas.push(linea);
      linea = palabra;
    } else {
      linea = testLine;
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

module.exports = gregenerapdfa4;