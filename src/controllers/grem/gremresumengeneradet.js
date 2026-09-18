// GREM CARGA CONSOLIDADA (>20 REMITENTES)
//
// Genera UNA cac:DespatchLine por encomienda.
// Los datos particulares de remitente/destinatario/flete se incluyen como
// AdditionalItemProperty siguiendo la plantilla de carga consolidada que
// estamos probando. SUNAT no define un DespatchParty repetible por línea.
//
// Campos reconocidos con aliases para facilitar el mapeo desde mve_transventa.

function texto(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function numero(v, defecto = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : defecto;
}

function dato(item, ...keys) {
  for (const k of keys) {
    const v = item[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function propiedad(nombre, valor) {
  if (!texto(valor)) return '';
  return `<cac:AdditionalItemProperty>
                    <cbc:Name>${nombre}</cbc:Name>
                    <cbc:Value><![CDATA[${valor}]]></cbc:Value>
                </cac:AdditionalItemProperty>`;
}

function gremresumengeneradet(items = []) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('GREM resumen: no existen items para generar el detalle');
  }

  return items.map((item, index) => {
    const id = index + 1;
    const cantidad = numero(item.cantidad || item.bultos, 1) || 1;
    const unidad = dato(item, 'codigo_unidad', 'cont_und') || 'NIU';
    const codigo = dato(item, 'codigo', 'id_producto') || 'ENCOMIENDA';
    const descripcion = dato(item, 'producto', 'descripcion') || 'ENCOMIENDA';

    const remTipo = dato(item, 'remitente_tipo', 'remitente_id_doc', 'cliente_id_doc') || '1';
    const remDoc = dato(item, 'remitente_documento_id', 'remitente_ruc_dni', 'cliente_documento_id');
    const remNom = dato(item, 'remitente_razon_social', 'remitente_nombre', 'remitente', 'cliente');

    const desTipo = dato(item, 'destinatario_tipo', 'destinatario_id_doc') || '1';
    const desDoc = dato(item, 'destinatario_documento_id', 'destinatario_ruc_dni');
    const desNom = dato(item, 'destinatario_razon_social', 'destinatario_nombre', 'destinatario');

    const flete = item.monto_flete !== undefined && item.monto_flete !== null
      ? numero(item.monto_flete).toFixed(2)
      : (item.precio_neto !== undefined && item.precio_neto !== null ? numero(item.precio_neto).toFixed(2) : '');

    const referencia = [
      dato(item, 'r_cod'),
      dato(item, 'r_serie'),
      dato(item, 'r_numero')
    ].filter(Boolean).join('-');

    if (!remDoc || !remNom) {
      throw new Error(`GREM resumen item ${id}: falta remitente DNI/documento o nombre`);
    }
    if (!desDoc || !desNom) {
      throw new Error(`GREM resumen item ${id}: falta destinatario DNI/documento o nombre`);
    }

    const remitenteTexto = `${remNom} - ${remTipo === '1' ? 'DNI' : 'DOC'} ${remDoc}`;
    const destinatarioTexto = `${desNom} - ${desTipo === '1' ? 'DNI' : 'DOC'} ${desDoc}`;

    return `<cac:DespatchLine>
        <cbc:ID>${id}</cbc:ID>
        <cbc:DeliveredQuantity unitCode="${unidad}">${cantidad}</cbc:DeliveredQuantity>
        <cac:OrderLineReference>
            <cbc:LineID>${id}</cbc:LineID>
        </cac:OrderLineReference>
        <cac:Item>
            <cbc:Description><![CDATA[${descripcion}]]></cbc:Description>
            ${propiedad('REMITENTE', remitenteTexto)}
            ${propiedad('DESTINATARIO', destinatarioTexto)}
            ${propiedad('FLETE', flete)}
            ${propiedad('DOCUMENTO_REFERENCIA', referencia)}
            <cac:SellersItemIdentification>
                <cbc:ID>${codigo}</cbc:ID>
            </cac:SellersItemIdentification>
        </cac:Item>
    </cac:DespatchLine>`;
  }).join('');
}

module.exports = gremresumengeneradet;
