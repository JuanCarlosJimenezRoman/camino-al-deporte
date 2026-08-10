// Genera el código interno único de una variante (ProductoVariante) a partir
// del SKU de fábrica + talla + color. El SKU de fábrica ya NO es único (en
// calzado viene por lote de tallas y se repite a propósito), así que este es
// el identificador que sí garantiza unicidad para trazabilidad/etiquetado.
//
// Debe llamarse dentro de la misma transacción en la que se crea la
// variante, para que la búsqueda de colisiones vea también lo que ya se creó
// en esa misma transacción y no se pisen dos variantes creadas casi al
// mismo tiempo.
async function generarCodigoInterno(tx, { sku, tallaValor, color }) {
  const base =
    [sku, tallaValor, color]
      .filter((p) => p !== null && p !== undefined && String(p).trim() !== '')
      .map((p) => String(p).trim().toUpperCase().replace(/\s+/g, ''))
      .join('-') || 'VAR';

  let candidato = base;
  let sufijo = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await tx.productoVariante.findFirst({ where: { codigoInterno: candidato } })) {
    candidato = `${base}-${sufijo}`;
    sufijo += 1;
  }
  return candidato;
}

module.exports = { generarCodigoInterno };
