function gregeneradet(items) {
  return items.map((item, index) => {
    // Variables previas para cálculos
    let { producto, cantidad, codigo_producto } = item;

    //Nota: precio_base = precio unitario sin igv
    //precio_base = precio_base.toFixed(2);
    // Calcular momtos subtotal,igv 

    return `
        <cac:DespatchLine>
            <cbc:ID>${index + 1}</cbc:ID>
            <cbc:DeliveredQuantity unitCode="NIU">${cantidad}</cbc:DeliveredQuantity>
            <cac:OrderLineReference>
                <cbc:LineID>1</cbc:LineID>
            </cac:OrderLineReference>
            <cac:Item>
                    <cbc:Description><![CDATA[${producto}]]></cbc:Description>
                    <cac:SellersItemIdentification>
                        <cbc:ID>${codigo_producto}</cbc:ID>
                    </cac:SellersItemIdentification>
            </cac:Item>
        </cac:DespatchLine>`;

  }).join('');
}

module.exports = gregeneradet;
