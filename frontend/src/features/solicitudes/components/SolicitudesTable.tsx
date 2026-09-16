'use client';

import { formatearFechaHora } from '@/lib/utils';
import { ACCION_LABEL, ESTADO_LABEL, TIPO_LABEL, type EstadoSolicitud, type Solicitud } from '../types';
import { formatoCampos, mensajeSinSolicitudes } from '../utils';
import { SolicitudAcciones } from './SolicitudAcciones';

interface Props {
  solicitudes: Solicitud[];
  esAdmin: boolean;
  filtro: EstadoSolicitud | '';
  procesandoId: number | null;
  notaPorId: Record<number, string>;
  onNotaChange: (id: number, nota: string) => void;
  onAprobar: (id: number) => void;
  onRechazar: (id: number) => void;
}

export function SolicitudesTable({
  solicitudes,
  esAdmin,
  filtro,
  procesandoId,
  notaPorId,
  onNotaChange,
  onAprobar,
  onRechazar,
}: Props) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ padding: 8 }}>Tipo</th>
            <th style={{ padding: 8 }}>Acción</th>
            <th style={{ padding: 8 }}>Entidad</th>
            <th style={{ padding: 8 }}>Cambio</th>
            {esAdmin && <th style={{ padding: 8 }}>Solicitó</th>}
            <th style={{ padding: 8 }}>Fecha</th>
            <th style={{ padding: 8 }}>Estado</th>
            {esAdmin && <th style={{ padding: 8 }}>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {solicitudes.map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: 8 }}>{TIPO_LABEL[s.tipo]}</td>
              <td style={{ padding: 8 }}>{ACCION_LABEL[s.accion]}</td>
              <td style={{ padding: 8 }}>{s.entidadNombre || `#${s.entidadId}`}</td>
              <td style={{ padding: 8, fontSize: 12, color: 'var(--color-muted)' }}>
                {s.accion === 'DESACTIVAR' ? '—' : formatoCampos(s.datosCambio) || '—'}
              </td>
              {esAdmin && <td style={{ padding: 8 }}>{s.solicitadoPor.nombre}</td>}
              <td style={{ padding: 8 }}>{formatearFechaHora(s.solicitadoAt)}</td>
              <td style={{ padding: 8 }}>
                {ESTADO_LABEL[s.estado]}
                {s.estado !== 'PENDIENTE' && s.revisadoPor && (
                  <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                    por {s.revisadoPor.nombre}
                    {s.notaRevision ? `: ${s.notaRevision}` : ''}
                  </div>
                )}
              </td>
              {esAdmin && (
                <td style={{ padding: 8 }}>
                  <SolicitudAcciones
                    solicitud={s}
                    nota={notaPorId[s.id] || ''}
                    procesando={procesandoId === s.id}
                    onNotaChange={(n) => onNotaChange(s.id, n)}
                    onAprobar={() => onAprobar(s.id)}
                    onRechazar={() => onRechazar(s.id)}
                  />
                </td>
              )}
            </tr>
          ))}
          {solicitudes.length === 0 && (
            <tr>
              <td colSpan={esAdmin ? 8 : 6} style={{ color: 'var(--color-muted)', padding: 8 }}>
                {mensajeSinSolicitudes(filtro)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}