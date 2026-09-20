'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { ApiError } from '@/lib/api';
import { formatearFechaHora } from '@/lib/utils';
import { descargarReporteTransferencias, listarTransferencias } from '../api';
import { agruparLotes, hoyNegocioISO, type LoteResumen } from '../utils';
import type { Sucursal } from '../types';

type Modo = 'lote' | 'dia';

const MAX_LOTES = 30;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sucursales: Sucursal[];
}

/**
 * Reporte en PDF (con fotos de los productos) para mandar fuera del sistema.
 * Se arma de un LOTE (todo lo que salió en un mismo "Enviar N traspasos") o
 * de un DÍA completo. Ver GET /transferencias/reporte-pdf en el backend.
 */
export function ReporteTransferenciasDialog({ open, onOpenChange, sucursales }: Props) {
  const [modo, setModo] = useState<Modo>('lote');
  const [lotes, setLotes] = useState<LoteResumen[]>([]);
  const [cargandoLotes, setCargandoLotes] = useState(false);
  const [loteFolio, setLoteFolio] = useState('');
  const [fecha, setFecha] = useState(hoyNegocioISO());
  const [sucursalId, setSucursalId] = useState('');
  const [incluirCanceladas, setIncluirCanceladas] = useState(false);
  const [descargando, setDescargando] = useState(false);

  // Al abrir: se reinicia el formulario y se leen los lotes más recientes del
  // historial completo (sin los filtros de la pantalla, para que un lote no
  // "desaparezca" de la lista solo porque hay un filtro activo allá).
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setFecha(hoyNegocioISO());
    setSucursalId('');
    setIncluirCanceladas(false);
    setCargandoLotes(true);
    listarTransferencias()
      .then((data) => {
        if (cancelado) return;
        const recientes = agruparLotes(data).slice(0, MAX_LOTES);
        setLotes(recientes);
        setLoteFolio(recientes[0]?.folio ?? '');
        // Sin lotes todavía (p. ej. solo hay traspasos anteriores a esta
        // función) el camino útil es "Por día".
        setModo(recientes.length > 0 ? 'lote' : 'dia');
      })
      .catch(() => {
        if (cancelado) return;
        setLotes([]);
        setModo('dia');
      })
      .finally(() => {
        if (!cancelado) setCargandoLotes(false);
      });
    return () => {
      cancelado = true;
    };
  }, [open]);

  const listo = useMemo(() => (modo === 'lote' ? Boolean(loteFolio) : Boolean(fecha)), [modo, loteFolio, fecha]);

  async function descargar() {
    setDescargando(true);
    try {
      await descargarReporteTransferencias(
        modo === 'lote'
          ? { lote: loteFolio, incluirCanceladas }
          : { fecha, sucursalId: sucursalId || undefined, incluirCanceladas }
      );
      toast({ title: 'Reporte generado', description: 'El PDF se descargó en tu equipo.', variant: 'success' });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'No se pudo generar el reporte',
        description: err instanceof ApiError ? err.message : 'Intenta de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setDescargando(false);
    }
  }

  const botonModo = (valor: Modo, etiqueta: string) => (
    <button
      type="button"
      onClick={() => setModo(valor)}
      className={`flex-1 rounded-lg border px-3 h-9 text-sm font-medium transition-colors ${
        modo === valor
          ? 'border-primary bg-accent text-primary'
          : 'border-border bg-card text-foreground hover:bg-secondary'
      }`}
    >
      {etiqueta}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reporte de transferencias en PDF</DialogTitle>
          <DialogDescription>
            Incluye la foto de cada producto, cantidades, origen y destino. No muestra costos ni precios.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="flex gap-2">
            {botonModo('lote', 'Por lote de envío')}
            {botonModo('dia', 'Por día')}
          </div>

          {modo === 'lote' ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Lote</label>
              {cargandoLotes ? (
                <p className="text-sm text-muted-foreground">Cargando lotes...</p>
              ) : lotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay lotes. Cada vez que envías un traspaso se crea uno; para los envíos anteriores usa
                  &quot;Por día&quot;.
                </p>
              ) : (
                <>
                  <Select value={loteFolio} onChange={(e) => setLoteFolio(e.target.value)}>
                    {lotes.map((l) => (
                      <option key={l.folio} value={l.folio}>
                        {l.folio} · {formatearFechaHora(l.creadoAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} ·{' '}
                        {l.traspasos} {l.traspasos === 1 ? 'traspaso' : 'traspasos'} · {l.piezas}{' '}
                        {l.piezas === 1 ? 'pieza' : 'piezas'}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lotes.find((l) => l.folio === loteFolio)?.rutas.join(' · ')}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Día</label>
                <Input type="date" value={fecha} max={hoyNegocioISO()} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Sucursal (opcional)</label>
                <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
                  <option value="">Todas</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={incluirCanceladas}
              onChange={(e) => setIncluirCanceladas(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Incluir transferencias canceladas
          </label>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={descargando}>
            Cancelar
          </Button>
          <Button type="button" onClick={descargar} disabled={!listo || descargando}>
            {descargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {descargando ? 'Generando...' : 'Descargar PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
