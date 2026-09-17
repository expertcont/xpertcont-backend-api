const texto = (valor) => (valor || '').toString().trim();

function descripcionDetalle(item = {}) {
  const partes = [texto(item.producto) || 'ENCOMIENDA'];

  if (item.monto_flete !== undefined && item.monto_flete !== null && item.monto_flete !== '') {
    partes.push(`Flete: ${Number(item.monto_flete || 0).toFixed(2)}`);
  }

  return partes.join(' | ');
}

function gremgeneradet(items) {
  return items.map((item, index) => {
    const cantidad = item.cantidad || 1;
    const codigo = item.codigo || 'ENCOMIENDA';
    const unidad = item.codigo_unidad || 'NIU';

    return `
        <cac:DespatchLine>
            <cbc:ID>${index + 1}</cbc:ID>
            <cbc:DeliveredQuantity unitCode="${unidad}">${cantidad}</cbc:DeliveredQuantity>
            <cac:OrderLineReference>
                <cbc:LineID>${index + 1}</cbc:LineID>
            </cac:OrderLineReference>
            <cac:Item>
                <cbc:Description><![CDATA[${descripcionDetalle(item)}]]></cbc:Description>
                <cac:SellersItemIdentification>
                    <cbc:ID>${codigo}</cbc:ID>
                </cac:SellersItemIdentification>
            </cac:Item>
        </cac:DespatchLine>`;
  }).join('');
}

module.exports = gremgeneradet;
