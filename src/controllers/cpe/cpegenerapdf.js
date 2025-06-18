const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');
const numeral = require('numeral');

const cpegenerapdf = async (size, logo, jsonVenta) => {
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
  const margin = 5;

  page.drawImage(pngImage, {
    x: margin + 50 - (marginLeftSize / 2),
    y: 730,
    width: pngDims.width,
    height: pngDims.height,
  });

  let x = margin;
  let y = 720;

  const COD = venta.codigo;
  const documentos = {
    '01': 'FACTURA ELECTRONICA',
    '03': 'BOLETA ELECTRONICA',
    '07': 'NOTA CRED. ELECTRONICA',
    '08': 'NOTA DEB. ELECTRONICA'
  };
  const sDocumento = documentos[COD] || 'DOCUMENTO';

  const ticketWidth = 227;

  let textWidth = fontNegrita.widthOfTextAtSize(sDocumento, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(sDocumento, { x, y, size: fontSize, font: fontNegrita });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize('RUC ' + empresa.ruc, fontSize + 1);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText('RUC ' + empresa.ruc, { x, y, size: fontSize + 1, font: fontNegrita });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize(empresa.razon_social, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(empresa.razon_social, { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize(empresa.domicilio_fiscal, fontSize);
  x = ((ticketWidth - textWidth) / 2) > 0 ? ((ticketWidth - textWidth) / 2) : margin;
  page.drawText(empresa.domicilio_fiscal, { x, y, size: 8 });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize(venta.serie+'-'+venta.numero, 12);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(venta.serie+'-'+venta.numero, { x, y, size: 12, font: fontNegrita });
  y -= 12;

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

  textWidth = fontNegrita.widthOfTextAtSize(cliente.razon_social_nombres, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(cliente.razon_social_nombres?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize("RUC/DNI: " + cliente.documento_identidad, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("RUC/DNI: " + cliente.documento_identidad?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize(cliente.cliente_direccion, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(cliente.cliente_direccion?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  //Opcional: datos del vendedor o correo q registro la venta al cliente (tamaño max 14 largo)
  const vendedor = venta.vendedor?.trim();
  if (vendedor) {
    textWidth = fontNegrita.widthOfTextAtSize("VENTA: " + venta.vendedor, fontSize);
    x = (ticketWidth - textWidth - marginLeftSize) / 2;
    page.drawText("VENTA: " + venta.vendedor, { x, y, size: fontSize });
    y -= 12;
  }

  //Harcode temporal: modificar urgente
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

  registrosdet.forEach(producto => {
    const textY = y - lineHeight;

    page.drawText(`${producto.descripcion}`, { x: margin, y: y + 4 - espaciadoDet, size: fontSize - 1, font });
    espaciadoDet += 10;
    page.drawText('Cant: ' + producto.cantidad, { x: margin, y: y + 4 - espaciadoDet, size: fontSize - 1 });

    textWidth = fontNegrita.widthOfTextAtSize(numeral(producto.precio_unitario).format('0,0.00'), fontSize);
    x = (ticketWidth - textWidth - margin - 50 - marginLeftSize);
    page.drawText(numeral(producto.precio_unitario).format('0,0.00'), { x, y: y + 4 - espaciadoDet, size: fontSize - 1 });

    textWidth = fontNegrita.widthOfTextAtSize(numeral(producto.precio_neto).format('0,0.00'), fontSize);
    x = (ticketWidth - textWidth - margin - marginLeftSize);
    page.drawText(numeral(producto.precio_neto).format('0,0.00'), { x, y: y + 4 - espaciadoDet, size: fontSize - 1 });

    page.drawLine({
      start: { x: margin, y: y + 2 - espaciadoDet },
      end: { x: page.getWidth() - margin - 5, y: y + 2 - espaciadoDet },
      thickness: 1,
      color: rgb(0.778, 0.778, 0.778),
    });

    espaciadoDet += 10;
    row++;
  });

  // El resto sigue igual
    y=y-15; //aumentamos linea nueva
    y=y-15; //aumentamos linea nueva

  
    const monto_total = (Number(venta.base_gravada) || 0) +
                        (Number(venta.base_exonerada) || 0) +
                        (Number(venta.base_inafecta) || 0) +
                        (Number(venta.total_igv) || 0);

    let MontoEnLetras = NumerosALetras(monto_total, {
        plural: 'SOLES', //pinches opciones no funcionan, tengo q arreglarlas en la siguiente linea
        singular: 'SOL', //todos mis movimientos estan friamente calculados
        centPlural: 'CÉNTIMOS', //siganme los buenos ...  :)
        centSingular: 'CÉNTIMO',
    });
    MontoEnLetras = 'SON: ' + MontoEnLetras.toUpperCase().replace('PESOS', 'SOLES CON').replace('PESO', 'SOL CON').replace('M.N.','');
    page.drawText(MontoEnLetras, { x:margin, y:y-espaciadoDet+30, size: 8 }); //Actualizar urgente

    const moneda = {
        'PEN': 'S/',
        'USD': '$ USD'
    };
    const sMoneda = moneda[venta.moneda_id] || ''; // Manejo de caso por defecto

    //////////////////
    x = margin;
    page.drawText("BASE:",{ x, y:y-espaciadoDet+4, size: 9 });
    textWidth = fontNegrita.widthOfTextAtSize(numeral(venta.base_gravada).format('0,0.00'), fontSize+2);
    // Calcular el punto x para alinear a la derecha
    x = (ticketWidth - textWidth - margin - marginLeftSize);
    page.drawText(numeral(venta.base_gravada).format('0,0.00')?.toString() ?? "", { x, y:y+4-espaciadoDet, size: 10, font }); //Actualizar urgente


    x = margin;
    page.drawText("IGV.: ",{ x, y:y-espaciadoDet+4-10, size: 9 });
    textWidth = fontNegrita.widthOfTextAtSize(numeral(venta.total_igv).format('0,0.00'), fontSize+2);
    // Calcular el punto x para alinear a la derecha
    x = (ticketWidth - textWidth - margin - marginLeftSize);
    page.drawText(numeral(venta.total_igv).format('0,0.00')?.toString() ?? "", { x, y:y+4-espaciadoDet-10, size: 10, font }); //Actualizar urgente


    x = margin;
    page.drawText("TOTAL.:" + sMoneda,{ x, y:y-espaciadoDet+4-25, size: fontSize+2, font:fontNegrita });
    textWidth = fontNegrita.widthOfTextAtSize(numeral(monto_total).format('0,0.00'), fontSize+2);
    // Calcular el punto x para alinear a la derecha
    x = (ticketWidth - textWidth - margin - marginLeftSize);
    page.drawText(numeral(monto_total).format('0,0.00')?.toString() ?? "", { x, y:y+4-espaciadoDet-25, size: fontSize+2, font:fontNegrita }); //Actualizar urgente


    //SeccionQR
    // Generar el código QR como base64
    const numeroFormateado = venta.numero.padStart(8, '0');
    const comprobanteConvertido = `${venta.codigo}|${venta.serie}|${numeroFormateado}`;

    const qrImage = await QRCode.toDataURL(empresa.ruc + '|' + comprobanteConvertido + '|' + venta.r_igv002 + '|' + venta.r_monto_total + '|' + venta.r_fecemi + '|' + venta.r_id_doc + '|' + venta.r_documento_id + '|');
    // Convertir la imagen base64 a formato compatible con pdf-lib
    const qrImageBytes = qrImage.split(',')[1]; // Eliminar el encabezado base64
    //const qrImageBuffer = Uint8Array.from(atob(qrImageBytes), (c) => c.charCodeAt(0));
    const qrImageBuffer = base64ToUint8Array(qrImageBytes);

    const qrImageEmbed = await pdfDoc.embedPng(qrImageBuffer);
    // Obtener dimensiones de la imagen
    const qrWidth = 45;
    const qrHeight = 45;
    // Calcular el punto x para alinear a la derecha
    x = (ticketWidth - 45 - marginLeftSize)/2;

    // Dibujar el código QR en el PDF
    page.drawImage(qrImageEmbed, {
        x,
        y: y-espaciadoDet-26-45,
        width: qrWidth,
        height: qrHeight,
    });


  const pdfBytes = await pdfDoc.save();
  // Retorna el buffer en un objeto junto a estado y nombre sugerido
  return {
    estado: true,
    buffer_pdf: pdfBytes
  };
  
}

module.exports = cpegenerapdf;