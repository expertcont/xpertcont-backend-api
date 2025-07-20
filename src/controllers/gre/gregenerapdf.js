const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');
const numeral = require('numeral');

const gregenerapdf = async (size, logo, sJson, digestvalue) => {
  const pdfDoc = await PDFDocument.create();

  const width = (size === '80mm') ? 226.77 : 164.41;
  const fontSize = (size === '80mm') ? 10 : 8;
  const marginLeftSize = (size === '80mm') ? 0 : 62.36;

  const empresa = sJson.empresa;
  const guia = sJson.guia;
  const registrosdet = sJson.items;

  const lineHeight = fontSize * 1.2;
  let height = 800;
  const page = pdfDoc.addPage([width, height]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontNegrita = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pngImage = await pdfDoc.embedPng(logo);
  const pngDims = pngImage.scale(0.6);
  const margin = 5;

  page.drawImage(pngImage, {
    //x: margin + 50 - (marginLeftSize / 2),
    x: margin + (marginLeftSize / 2),
    y: 720,
    width: pngDims.width,
    height: pngDims.height,
  });

  let x = margin;
  let y = 710;
  

  const COD = guia.codigo;
  const documentos = {
    '09': 'GUIA REMISION REMITENTE',
    '31': 'GUIA REMISION TRANSPORTISTA'
  };
  const sDocumento = documentos[COD] || 'DOCUMENTO';

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

  const IDMODOTRASLADO = guia.guia_modalidad_id;
  const modalidad = {
    '01': 'TRANSPORTE PUBLICO',
    '02': 'TRANSPORTE PRIVADO',
  };
  const sModalidad = modalidad[IDMODOTRASLADO] || 'OTROS';


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

  textWidth = fontNegrita.widthOfTextAtSize(guia.serie+'-'+guia.numero, 12);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(guia.serie+'-'+guia.numero, { x, y, size: 12, font: fontNegrita });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize("FECHA: " + guia.fecha_emision, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("FECHA: " + guia.fecha_emision, { x, y, size: fontSize });
  y -= 15;

  //console.log('antes de datos cliente');
  page.drawRectangle({
    x: margin,
    y: y - 2,
    width: (page.getWidth() - margin - 5),
    height: (lineHeight + 2),
    borderWidth: 1,
    color: rgb(0.778, 0.778, 0.778),
    borderColor: rgb(0.8, 0.8, 0.8)
  });

  textWidth = fontNegrita.widthOfTextAtSize("DATOS DEL DESTINATARIO: ", fontSize - 1);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("DATOS DEL DESTINATARIO: ", { x, y, size: fontSize - 1 });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize(guia.destinatario_razon_social, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(guia.razon_social_nombres?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize("RUC/DNI: " + guia.destinatario_ruc_dni, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("RUC/DNI: " + guia.destinatario_ruc_dni?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize(guia.llegada_direccion, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(guia.llegada_direccion?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;


  page.drawRectangle({
    x: margin,
    y: y - 2,
    width: (page.getWidth() - margin - 5),
    height: (lineHeight + 2),
    borderWidth: 1,
    color: rgb(0.778, 0.778, 0.778),
    borderColor: rgb(0.8, 0.8, 0.8)
  });

  textWidth = fontNegrita.widthOfTextAtSize("DATOS DEL ENVIO: ", fontSize - 1);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("DATOS DEL ENVIO: ", { x, y, size: fontSize - 1 });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize("FECHA EMISION: " + guia.fecha_emision, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("RUC/DNI: " + guia.fecha_emision?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize("FECHA TRASLADO: " + guia.fecha_traslado, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("FECHA TRASLADO: " + guia.fecha_traslado?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize("MOTIVO TRASLADO: " + sMotivo, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("MOTIVO TRASLADO: " + sMotivo?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize("MODALIDAD TRASLADO: " + sModalidad, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("MODALIDAD TRASLADO: " + sModalidad?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize("PARTIDA UBIGEO: " + guia.partida_ubigeo, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("PARTIDA UBIGEO: " + guia.partida_ubigeo?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize(guia.partida_direccion, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(guia.partida_direccion?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize("LLEGADA UBIGEO: " + guia.llegada_ubigeo, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("LLEGADA UBIGEO: " + guia.llegada_ubigeo?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize(guia.llegada_direccion, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText(guia.llegada_direccion?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize("PESO TOTAL KG: " + guia.peso_total, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("PESO TOTAL KG: " + guia.peso_total?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  textWidth = fontNegrita.widthOfTextAtSize("NUMERO BULTOS: " + guia.numero_bultos, fontSize);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("NUMERO BULTOS: " + guia.numero_bultos?.toString() ?? "", { x, y, size: fontSize });
  y -= 12;

  page.drawRectangle({
    x: margin,
    y: y - 2,
    width: (page.getWidth() - margin - 5),
    height: (lineHeight + 2),
    borderWidth: 1,
    color: rgb(0.778, 0.778, 0.778),
    borderColor: rgb(0.8, 0.8, 0.8)
  });

  textWidth = fontNegrita.widthOfTextAtSize("DATOS DEL TRANSPORTE: ", fontSize - 1);
  x = (ticketWidth - textWidth - marginLeftSize) / 2;
  page.drawText("DATOS DEL TRANSPORTE: ", { x, y, size: fontSize - 1 });
  y -= 12;

  //CASO TRANSPORTE: PUBLICO
  if (sModalidad === '01') {
    textWidth = fontNegrita.widthOfTextAtSize(guia.transp_razon_social, fontSize);
    x = (ticketWidth - textWidth - marginLeftSize) / 2;
    page.drawText(guia.transp_razon_social?.toString() ?? "", { x, y, size: fontSize });
    y -= 12;

    textWidth = fontNegrita.widthOfTextAtSize("RUC: " + guia.transp_ruc, fontSize);
    x = (ticketWidth - textWidth - marginLeftSize) / 2;
    page.drawText("RUC/DNI: " + guia.transp_ruc?.toString() ?? "", { x, y, size: fontSize });
    y -= 12;
  }

  //CASO TRANSPORTE: PRIVADO
  if (sModalidad === '02') {
    textWidth = fontNegrita.widthOfTextAtSize(guia.conductor_nombres, fontSize);
    x = (ticketWidth - textWidth - marginLeftSize) / 2;
    page.drawText(guia.conductor_nombres?.toString() ?? "", { x, y, size: fontSize });
    y -= 12;

    textWidth = fontNegrita.widthOfTextAtSize(guia.conductor_apellidos, fontSize);
    x = (ticketWidth - textWidth - marginLeftSize) / 2;
    page.drawText(guia.conductor_apellidos?.toString() ?? "", { x, y, size: fontSize });
    y -= 12;

    textWidth = fontNegrita.widthOfTextAtSize("DNI: " + guia.conductor_dni, fontSize);
    x = (ticketWidth - textWidth - marginLeftSize) / 2;
    page.drawText("DNI: " + guia.conductor_dni?.toString() ?? "", { x, y, size: fontSize });
    y -= 12;

    textWidth = fontNegrita.widthOfTextAtSize("LICENCIA: " + guia.conductor_licencia, fontSize);
    x = (ticketWidth - textWidth - marginLeftSize) / 2;
    page.drawText("LICENCIA: " + guia.conductor_licencia?.toString() ?? "", { x, y, size: fontSize });
    y -= 12;

    textWidth = fontNegrita.widthOfTextAtSize("PLACA: " + guia.vehiculo_placa, fontSize);
    x = (ticketWidth - textWidth - marginLeftSize) / 2;
    page.drawText("PLACA: " + guia.vehiculo_placa?.toString() ?? "", { x, y, size: fontSize });
    y -= 12;
  }
  /////////////////////////////////////////////////////////////////////
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
  //console.log('antes forEach producto');
  registrosdet.forEach(detalle => {
    //calcular precio unitario con igv 
    //calcular precio neto (importe) con igv
    cantidad = Number(detalle.cantidad);

    page.drawText(`${detalle.producto}`, { x: margin, y: y + 4 - espaciadoDet, size: fontSize - 1, font });
    espaciadoDet += 10;
    page.drawText('Cant: ' + detalle.cantidad, { x: margin, y: y + 4 - espaciadoDet, size: fontSize - 1 });

    textWidth = fontNegrita.widthOfTextAtSize(detalle.codigo_unidad, fontSize);
    x = (ticketWidth - textWidth - margin - marginLeftSize);
    page.drawText(detalle.codigo_unidad, { x, y: y + 4 - espaciadoDet, size: fontSize - 1 });

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

  //////////////////
  //SeccionQR
  // Generar el código QR como base64
  const numeroFormateado = guia.numero.padStart(8, '0');
  const comprobanteConvertido = `${guia.codigo}|${guia.serie}|${numeroFormateado}`;

  const qrImage = await QRCode.toDataURL(empresa.ruc + '|' + comprobanteConvertido + '|');
  // Convertir la imagen base64 a formato compatible con pdf-lib
  const qrImageBytes = qrImage.split(',')[1]; // Eliminar el encabezado base64
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

  /////////////////////////////////////////////////////////////
  x = margin;
  textWidth = fontNegrita.widthOfTextAtSize(digestvalue, fontSize-2);
  // Calcular el punto x para alinear a la derecha
  page.drawText(digestvalue, { x, y:y-espaciadoDet-80, size: fontSize-2 }); //Actualizar urgente

  const pdfBytes = await pdfDoc.save();
  // Retorna el buffer en un objeto junto a estado y nombre sugerido
  return {
    estado: true,
    buffer_pdf: pdfBytes
  };
  
}

function base64ToUint8Array(base64) {
  // Decodificar Base64 a un Buffer
  const buffer = Buffer.from(base64, 'base64');
  // Convertir el Buffer a Uint8Array
  const bytes = new Uint8Array(buffer);
  return bytes;
}

module.exports = gregenerapdf;