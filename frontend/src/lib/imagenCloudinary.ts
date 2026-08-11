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

// Miniaturas de catálogo: recorta a cuadro centrando el producto de forma
// automática (IA de Cloudinary detecta el sujeto), para que todas las fotos
// llenen el marco de forma pareja sin importar cómo fue tomada la original.
export function imagenCatalogo(url: string | undefined, ancho = 600): string | undefined {
  return conTransformacion(url, `c_fill,g_auto,ar_1:1,w_${ancho},q_auto,f_auto`);
}

// Foto principal de producto: nunca recorta (para no cortar el producto),
// solo agrega relleno blanco hasta completar el cuadro y pareja el tamaño.
export function imagenProducto(url: string | undefined, ancho = 1200): string | undefined {
  return conTransformacion(url, `c_pad,b_white,ar_1:1,w_${ancho},q_auto,f_auto`);
}

// Miniaturas pequeñas (galería/carrito): igual que catálogo pero más chicas.
export function imagenMiniatura(url: string | undefined, ancho = 200): string | undefined {
  return conTransformacion(url, `c_fill,g_auto,ar_1:1,w_${ancho},q_auto,f_auto`);
}
