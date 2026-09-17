'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface IdentidadCardProps {
  nombre: string;
  iniciales: string;
  guardando: boolean;
  onNombreChange: (valor: string) => void;
  onInicialesChange: (valor: string) => void;
  onGuardar: () => void;
}

export function IdentidadCard({
  nombre,
  iniciales,
  guardando,
  onNombreChange,
  onInicialesChange,
  onGuardar,
}: IdentidadCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nombre e iniciales</CardTitle>
        <CardDescription>
          El nombre aparece en el encabezado de los tickets y en el panel; las iniciales son el respaldo cuando no hay logo.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <label className="text-sm">Nombre del negocio</label>
          <Input
            value={nombre}
            onChange={(event) => onNombreChange(event.target.value)}
            placeholder="Camino al Deporte"
          />
        </div>

        <div className="max-w-[140px]">
          <label className="text-sm">Iniciales</label>
          <Input
            value={iniciales}
            onChange={(event) =>
              onInicialesChange(event.target.value.toUpperCase())
            }
            maxLength={6}
            placeholder="CD"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={onGuardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar identidad'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}