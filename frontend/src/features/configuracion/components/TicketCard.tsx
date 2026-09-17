'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface TicketCardProps {
  mensajeTicketPie: string;
  mostrarCodigoBarrasTicket: boolean;
  mostrarVendedorTicket: boolean;
  mostrarSucursalTicket: boolean;
  guardando: boolean;
  onMensajeChange: (valor: string) => void;
  onMostrarCodigoBarrasChange: (valor: boolean) => void;
  onMostrarVendedorChange: (valor: boolean) => void;
  onMostrarSucursalChange: (valor: boolean) => void;
  onGuardar: () => void;
}

export function TicketCard({
  mensajeTicketPie,
  mostrarCodigoBarrasTicket,
  mostrarVendedorTicket,
  mostrarSucursalTicket,
  guardando,
  onMensajeChange,
  onMostrarCodigoBarrasChange,
  onMostrarVendedorChange,
  onMostrarSucursalChange,
  onGuardar,
}: TicketCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ticket de venta</CardTitle>
        <CardDescription>
          Qué se imprime en el ticket (PDF) de cada venta, además del nombre, iniciales y logo de arriba. Usa
          "Vista previa del ticket" (arriba a la derecha) para ver el efecto de un cambio antes de guardarlo.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <label className="text-sm">
            Mensaje de pie de página (opcional)
          </label>

          <textarea
            value={mensajeTicketPie}
            onChange={(event) => onMensajeChange(event.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Ej. Cambios y devoluciones dentro de 15 días con este ticket. Síguenos: @caminoaldeporte"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />

          <p className="mt-1 text-xs text-muted-foreground">
            Se imprime debajo del aviso de "no es un comprobante fiscal".{' '}
            {mensajeTicketPie.length}/300.
          </p>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mostrarCodigoBarrasTicket}
              onChange={(event) =>
                onMostrarCodigoBarrasChange(event.target.checked)
              }
            />
            Mostrar código de barras del folio
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mostrarVendedorTicket}
              onChange={(event) =>
                onMostrarVendedorChange(event.target.checked)
              }
            />
            Mostrar el nombre de quien vendió
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mostrarSucursalTicket}
              onChange={(event) =>
                onMostrarSucursalChange(event.target.checked)
              }
            />
            Mostrar la sucursal
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={onGuardar} disabled={guardando}>
            {guardando
              ? 'Guardando...'
              : 'Guardar configuración del ticket'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}