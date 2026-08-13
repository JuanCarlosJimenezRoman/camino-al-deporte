'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Tipo = 'MARCA' | 'CATEGORIA' | 'MODELO' | 'TALLA' | 'PROVEEDOR';
type Accion = 'EDITAR' | 'DESACTIVAR';
type Estado = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

interface Solicitud {
  id: number;
  tipo: Tipo;
  accion: Accion;
  entidadId: number;
  entidadNombre: string | null;
  datosCambio: Record<string, unknown> | null;
  motivo: string | null;
  estado: Estado;
  solicitadoPor: { id: number; nombre: string };
  solicitadoAt: string;
  revisadoPor: { id: number; nombre: string } | null;
  revisadoAt: string | null;
  notaRevision: string | null;
}

const TIPO_LABEL: Record<Tipo, string> = {
  MARCA: 'Marca',
  CATEGORIA: 'Categoría',
  MODELO: 'Modelo',
  TALLA: 'Talla',
  PROVEEDOR: 'Proveedor',
};

const ACCION_LABEL: Record<Accion, string> = {
  EDITAR: 'Editar',
  DESACTIVAR: 'Desactivar',
};

const ESTADO_LABEL: Record<Estado, string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
};

const FILTROS: { valor: Estado | ''; etiqueta: string }[] = [
  { valor: 'PENDIENTE', etiqueta: 'Pendientes' },
  { valor: 'APROBADA', etiqueta: 'Aprobadas' },
  { valor: 'RECHAZADA', etiqueta: 'Rechazadas' },
  { valor: '', etiqueta: 'Todas' },
];

function formatoCampos(datos: Record<string, unknown> | null) {
  if (!datos) return null;
  return Object.entries(datos)
    .map(([clave, valor]) => `${clave}: ${valor === null ? '—' : String(valor)}`)
    .join(', ');
}

export default function SolicitudesPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [filtro, setFiltro] = useState<Estado | ''>('PENDIENTE');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [procesandoId, setProcesandoId] = useState<number | null>(null);
  const [notaPorId, setNotaPorId] = useState<Record<number, string>>({});

  async function cargar() {
    const qs = filtro ? `?estado=${filtro}` : '';
    const data = await api<Solicitud[]>(`/solicitudes${qs}`);
    setSolicitudes(data);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  async function aprobar(id: number) {
    setProcesandoId(id);
    try {
      await api(`/solicitudes/${id}/aprobar`, { method: 'POST' });
      setMensaje('Solicitud aprobada y aplicada.');
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al aprobar la solicitud.');
    } finally {
      setProcesandoId(null);
    }
  }

  async function rechazar(id: number) {
    setProcesandoId(id);
    try {
      await api(`/solicitudes/${id}/rechazar`, {
        method: 'POST',
        body: JSON.stringify({ notaRevision: notaPorId[id] || undefined }),
      });
      setMensaje('Solicitud rechazada.');
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al rechazar la solicitud.');
    } finally {
      setProcesandoId(null);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Solicitudes</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 16, fontSize: 14 }}>
        {esAdmin
          ? 'Acciones que Inventario pidió hacer (desactivar catálogos, editar o desactivar proveedores) y que necesitan tu aprobación.'
          : 'Aquí puedes ver el estado de las acciones que enviaste a aprobación (desactivar catálogos, editar o desactivar proveedores).'}
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            className={filtro === f.valor ? 'btn' : 'btn-secondary btn'}
            onClick={() => setFiltro(f.valor)}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      {mensaje && <p style={{ fontSize: 13, marginBottom: 12 }}>{mensaje}</p>}

      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Acción</th>
            <th>Registro</th>
            <th>Cambios</th>
            {esAdmin && <th>Solicitado por</th>}
            <th>Fecha</th>
            <th>Estado</th>
            {esAdmin && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {solicitudes.map((s) => (
            <tr key={s.id}>
              <td>{TIPO_LABEL[s.tipo]}</td>
              <td>{ACCION_LABEL[s.accion]}</td>
              <td>{s.entidadNombre || `#${s.entidadId}`}</td>
              <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                {s.accion === 'DESACTIVAR' ? '—' : formatoCampos(s.datosCambio) || '—'}
              </td>
              {esAdmin && <td>{s.solicitadoPor.nombre}</td>}
              <td>{new Date(s.solicitadoAt).toLocaleString('es-MX')}</td>
              <td>
                {ESTADO_LABEL[s.estado]}
                {s.estado !== 'PENDIENTE' && s.revisadoPor && (
                  <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                    por {s.revisadoPor.nombre}
                    {s.notaRevision ? `: ${s.notaRevision}` : ''}
                  </div>
                )}
              </td>
              {esAdmin && (
                <td>
                  {s.estado === 'PENDIENTE' ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        className="btn"
                        disabled={procesandoId === s.id}
                        onClick={() => aprobar(s.id)}
                      >
                        Aprobar
                      </button>
                      <input
                        placeholder="Motivo (si rechazas)"
                        value={notaPorId[s.id] || ''}
                        onChange={(e) => setNotaPorId({ ...notaPorId, [s.id]: e.target.value })}
                        style={{ maxWidth: 160 }}
                      />
                      <button
                        className="btn-secondary btn"
                        disabled={procesandoId === s.id}
                        onClick={() => rechazar(s.id)}
                      >
                        Rechazar
                      </button>
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              )}
            </tr>
          ))}
          {solicitudes.length === 0 && (
            <tr>
              <td colSpan={esAdmin ? 8 : 6} style={{ color: 'var(--color-muted)' }}>
                Sin solicitudes {filtro ? ESTADO_LABEL[filtro].toLowerCase() : ''}.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
