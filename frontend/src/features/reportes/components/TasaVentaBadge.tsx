// % de piezas vendidas sobre piezas ingresadas en el periodo ("rotación").
// null = ese proveedor no tuvo reabastos registrados en el periodo, así que
// no hay denominador para calcular el porcentaje.

'use client';

export function TasaVentaBadge({ valor }: { valor: number | null }) {
  if (valor === null) {
    return <span className="text-xs text-muted-foreground">sin entradas</span>;
  }
  const tono = valor >= 70 ? 'text-success' : valor >= 30 ? 'text-warning' : 'text-destructive';
  return <span className={`text-xs font-medium ${tono}`}>{valor.toFixed(1)}%</span>;
}
