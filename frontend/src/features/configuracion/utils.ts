export function derivarIniciales(nombre: string): string {
  const palabras = nombre
    .trim()
    .split(/\s+/)
    .filter((palabra) => palabra.length > 2);

  const letras = palabras
    .slice(0, 3)
    .map((palabra) => palabra[0])
    .join('');

  return (letras || nombre.trim().slice(0, 2)).toUpperCase();
}