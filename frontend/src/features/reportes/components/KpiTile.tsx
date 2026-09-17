// Tarjeta de KPI del dashboard de reportes, con su indicador de variación.
// Vista pura: recibe valores ya calculados por el hook.

'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function Delta({ valor }: { valor: number | null | undefined }) {
  if (valor === null || valor === undefined) {
    return <span className="text-xs text-muted-foreground">sin periodo anterior</span>;
  }
  const positivo = valor > 0.5;
  const negativo = valor < -0.5;
  const Icono = positivo ? TrendingUp : negativo ? TrendingDown : Minus;
  const clase = positivo ? 'text-success' : negativo ? 'text-destructive' : 'text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${clase}`}>
      <Icono className="w-3.5 h-3.5" />
      {valor > 0 ? '+' : ''}
      {valor.toFixed(1)}% vs periodo anterior
    </span>
  );
}

interface Props {
  icon: typeof TrendingUp;
  titulo: string;
  valor: string;
  delta?: number | null;
  tono: 'primary' | 'success' | 'warning';
}

export function KpiTile({ icon: Icono, titulo, valor, delta, tono }: Props) {
  const toneClasses: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
  };
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
        <div className={`p-2 rounded-lg ${toneClasses[tono]}`}>
          <Icono className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{valor}</div>
        {delta !== undefined && <div className="mt-1">{<Delta valor={delta} />}</div>}
      </CardContent>
    </Card>
  );
}
