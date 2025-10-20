const { PDFDocument, StandardFonts, PDFName, rgb } = require('pdf-lib');
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

  // Monto en letras (lado izquierdo)
  /*page.drawRectangle({
    x: marginLeft,
    y: y - 45,
    width: contentWidth * 0.6,
    height: 45,
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

  page.drawText(MontoEnLetras, { 
    x: marginLeft + 5, 
    y: y - 32, 
    size: 10,
    font 
  });*/
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
  /*const sXml = `Descarga XML  http://74.208.184.113:8080/descargas/${empresa.ruc}/${empresa.ruc}-${venta.codigo}-${venta.serie}-${venta.numero}.xml`;
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
  });*/
  
  //cambiamos un sola linea, enlaces
  await agregarLinksDescarga(page, font, empresa, venta, 50, 100);


  const pdfBytes = await pdfDoc.save();
  
  return {
    estado: true,
    buffer_pdf: pdfBytes
  };
}


async function agregarLinksDescarga(page, font, empresa, venta, marginLeft, y) {
  const fontSize = 8;
  const colorTexto = rgb(0.2, 0.2, 0.8); // Azul tenue tipo link
  const base = `http://74.208.184.113:8080/descargas/${empresa.ruc}`;
  const nombreBase = `${empresa.ruc}-${venta.codigo}-${venta.serie}-${venta.numero}`;

  const links = [
    { label: 'Descarga XML', url: `${base}/${nombreBase}.xml`, offsetY: 38 },
    { label: 'Descarga CDR', url: `${base}/R-${nombreBase}.xml`, offsetY: 48 },
    { label: 'Descarga PDF', url: `${base}/${nombreBase}.pdf`, offsetY: 58 },
  ];

  const annots = [];

  for (const { label, url, offsetY } of links) {
    const sText = `${label}  ${url}`;
    const x = marginLeft;
    const yPos = y - offsetY;

    page.drawText(sText, {
      x,
      y: yPos,
      size: fontSize,
      font,
      color: colorTexto,
    });

    const textWidth = font.widthOfTextAtSize(sText, fontSize);
    const textHeight = fontSize + 2;

    // Creamos el objeto de anotación correctamente
    const linkAnnot = page.doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, yPos, x + textWidth, yPos + textHeight],
      Border: [0, 0, 0],
      A: page.doc.context.obj({
        Type: 'Action',
        S: 'URI',
        URI: url,
      }),
    });

    annots.push(linkAnnot);
  }

  // Vinculamos todas las anotaciones a la página
  page.node.set(PDFName.of('Annots'), page.doc.context.obj(annots));
}

function base64ToUint8Array(base64) {
  const buffer = Buffer.from(base64, 'base64');
  const bytes = new Uint8Array(buffer);
  return bytes;
}

module.exports = cpegenerapdfa4;