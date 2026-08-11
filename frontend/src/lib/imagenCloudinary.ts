// Aplica transformaciones de Cloudinary "al vuelo" insertándolas en la URL,
// sin tocar el archivo original ni el backend. Sirve para normalizar fotos
// de catálogo que fueron subidas con distinto encuadre/zoom (funciona incluso
// con fotos ya existentes, no solo las nuevas).
//
// Si la URL no es de Cloudinary (o no trae "/upload/"), se devuelve tal cual.
function conTransformacion(url: string | undefined, transformacion: string): string | undefined {
  if (!url || !url.includes('/upload/')) return url;
  return url.replace('/upload/', `/upload/${transformacion}/`);
}

// Miniaturas de catálogo: NUNCA recorta (muchas fotos de producto son casi
// panorámicas, ej. tenis de perfil en foto 4:3, y ya llenan el cuadro de
// lado a lado — recortar a 1:1 corta el producto o lo descentra). En vez de
// eso, se agrega relleno blanco hasta completar el cuadro: el producto
// siempre se ve completo y centrado, aunque a veces un poco más chico.
export function imagenCatalogo(url: string | undefined, ancho = 600): string | undefined {
  return conTransformacion(url, `c_pad,b_white,ar_1:1,w_${ancho},q_auto,f_auto`);
}

// Foto principal de producto: mismo criterio, nunca recorta.
export function imagenProducto(url: string | undefined, ancho = 1200): string | undefined {
  return conTransformacion(url, `c_pad,b_white,ar_1:1,w_${ancho},q_auto,f_auto`);
}

// Miniaturas pequeñas (galería/carrito): igual, sin recorte.
export function imagenMiniatura(url: string | undefined, ancho = 200): string | undefined {
  return conTransformacion(url, `c_pad,b_white,ar_1:1,w_${ancho},q_auto,f_auto`);
}
