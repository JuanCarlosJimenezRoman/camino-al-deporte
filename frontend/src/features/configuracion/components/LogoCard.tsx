'use client';

import { ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface LogoCardProps {
  logoUrl: string | null;
  iniciales: string;
  subiendo: boolean;
  quitando: boolean;
  onSubir: (event: ChangeEvent<HTMLInputElement>) => void;
  onQuitar: () => void;
}

export function LogoCard({
  logoUrl,
  iniciales,
  subiendo,
  quitando,
  onSubir,
  onQuitar,
}: LogoCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Logo</CardTitle>
        <CardDescription>
          Imagen que aparece en el encabezado del ticket y de los comprobantes (en lugar de las iniciales).
          Conviene un logo cuadrado en PNG/JPG.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-wrap items-center gap-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Logo del negocio"
            className="w-16 h-16 rounded-lg object-contain border border-border bg-white"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg border border-dashed border-border flex items-center justify-center text-lg font-bold text-muted-foreground">
            {iniciales || 'CD'}
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer">
            {subiendo
              ? 'Subiendo...'
              : logoUrl
                ? 'Reemplazar logo'
                : 'Subir logo'}

            <input
              type="file"
              accept="image/*"
              onChange={onSubir}
              disabled={subiendo}
              className="hidden"
            />
          </label>

          {logoUrl && (
            <Button
              variant="outline"
              onClick={onQuitar}
              disabled={quitando}
            >
              <Trash2 className="w-4 h-4" />
              Quitar logo
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}