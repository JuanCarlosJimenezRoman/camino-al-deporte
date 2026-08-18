'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';

interface ProductoResumen {
  id: number;
  nombre: string;
}

interface Cupon {
  id: number;
  codigo: string;
  descripcion: string | null;
  tipoDescuento: 'PORCENTAJE' | 'MONTO';
  valor: string;
  montoMinimo: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  usosMaximos: number | null;
  usosPorCliente: number | null;
  activo: boolean;
  productos: { producto: ProductoResumen }[];
  creadoPor: { nombre: string } | null;
  _count: { usos: number };
  createdAt: string;
}

const FORM_VACIO = {
  codigo: '',
  descripcion: '',
  tipoDescuento: 'PORCENTAJE' as 'PORCENTAJE' | 'MONTO',
  valor: '',
  montoMinimo: '',
  fechaInicio: '',
  fechaFin: '',
  usosMaximos: '',
  usosPorCliente: '',
};

// Convierte un <input type="date"> ("YYYY-MM-DD") a ISO datetime completo,
// que es lo que espera z.string().datetime() en el backend.
function fechaAIso(valor: string): string | undefined {
  if (!valor) return undefined;
  return new Date(`${valor}T00:00:00.000Z`).toISOString();
}

// Y al revés: de vuelta a "YYYY-MM-DD" para poder precargar el <input date>.
function isoAFecha(valor: string | null): string {
  if (!valor) return '';
  return valor.slice(0, 10);
}

export default function CuponesPage() {
  const [cupones, setCupones] = useState<Cupon[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [productosSeleccionados, setProductosSeleccionados] = useState<ProductoResumen[]>([]);

  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<ProductoResumen[]>([]);
  const [buscando, setBuscando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const data = await api<Cupon[]>('/cupones');
      setCupones(data);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'No se pudieron cargar los cupones.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (busqueda.trim().length < 2) {
      setResultados([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const data = await api<{ data: ProductoResumen[] }>(
          `/productos?q=${encodeURIComponent(busqueda.trim())}&limit=8`
        );
        setResultados(data.data.filter((p) => !productosSeleccionados.some((sel) => sel.id === p.id)));
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  function limpiarFormulario() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setProductosSeleccionados([]);
    setBusqueda('');
    setResultados([]);
    setMensaje(null);
  }

  function editar(cupon: Cupon) {
    setEditandoId(cupon.id);
    setForm({
      codigo: cupon.codigo,
      descripcion: cupon.descripcion || '',
      tipoDescuento: cupon.tipoDescuento,
      valor: cupon.valor,
      montoMinimo: cupon.montoMinimo || '',
      fechaInicio: isoAFecha(cupon.fechaInicio),
      fechaFin: isoAFecha(cupon.fechaFin),
      usosMaximos: cupon.usosMaximos != null ? String(cupon.usosMaximos) : '',
      usosPorCliente: cupon.usosPorCliente != null ? String(cupon.usosPorCliente) : '',
    });
    setProductosSeleccionados(cupon.productos.map((cp) => cp.producto));
    setMensaje(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function agregarProducto(p: ProductoResumen) {
    setProductosSeleccionados((prev) => (prev.some((sel) => sel.id === p.id) ? prev : [...prev, p]));
    setBusqueda('');
    setResultados([]);
  }

  function quitarProducto(id: number) {
    setProductosSeleccionados((prev) => prev.filter((p) => p.id !== id));
  }

  async function guardar() {
    if (!form.codigo.trim()) {
      setMensaje('Captura el código del cupón.');
      return;
    }
    if (!form.valor || Number(form.valor) <= 0) {
      setMensaje('Captura un valor de descuento mayor a cero.');
      return;
    }
    if (productosSeleccionados.length === 0) {
      setMensaje('Elige al menos un producto al que aplique el cupón.');
      return;
    }

    setGuardando(true);
    setMensaje(null);
    try {
      const body = {
        codigo: form.codigo.trim(),
        descripcion: form.descripcion.trim() || undefined,
        tipoDescuento: form.tipoDescuento,
        valor: Number(form.valor),
        productosIds: productosSeleccionados.map((p) => p.id),
        montoMinimo: form.montoMinimo ? Number(form.montoMinimo) : undefined,
        fechaInicio: fechaAIso(form.fechaInicio),
        fechaFin: fechaAIso(form.fechaFin),
        usosMaximos: form.usosMaximos ? Number(form.usosMaximos) : undefined,
        usosPorCliente: form.usosPorCliente ? Number(form.usosPorCliente) : undefined,
      };

      if (editandoId) {
        await api<Cupon>(`/cupones/${editandoId}`, { method: 'PUT', body: JSON.stringify(body) });
        setMensaje('Cupón actualizado.');
      } else {
        await api<Cupon>('/cupones', { method: 'POST', body: JSON.stringify(body) });
        setMensaje('Cupón creado.');
      }
      limpiarFormulario();
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'No se pudo guardar el cupón.');
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(cupon: Cupon) {
    try {
      await api(`/cupones/${cupon.id}/activo`, {
        method: 'POST',
        body: JSON.stringify({ activo: !cupon.activo }),
      });
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado del cupón.');
    }
  }

  async function eliminar(cupon: Cupon) {
    if (!window.confirm(`¿Borrar el cupón ${cupon.codigo}? Esto solo se puede hacer si nunca se ha usado.`)) return;
    try {
      await api(`/cupones/${cupon.id}`, { method: 'DELETE' });
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'No se pudo borrar el cupón.');
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Cupones</h1>

      <div className="card" style={{ marginBottom: 20, maxWidth: 640 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>
          {editandoId ? `Editar cupón` : 'Nuevo cupón'}
        </h2>

        <label style={{ fontSize: 13 }}>Código</label>
        <div style={{ marginBottom: 10 }}>
          <input
            value={form.codigo}
            onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))}
            placeholder="Ej. VERANO10"
          />
        </div>

        <label style={{ fontSize: 13 }}>Descripción (opcional, solo uso interno)</label>
        <div style={{ marginBottom: 10 }}>
          <input
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            placeholder="Ej. Promo de fin de temporada"
          />
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13 }}>Tipo de descuento</label>
            <select
              value={form.tipoDescuento}
              onChange={(e) => setForm((f) => ({ ...f, tipoDescuento: e.target.value as 'PORCENTAJE' | 'MONTO' }))}
            >
              <option value="PORCENTAJE">Porcentaje (%)</option>
              <option value="MONTO">Monto fijo ($)</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13 }}>
              Valor {form.tipoDescuento === 'PORCENTAJE' ? '(%)' : '($)'}
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
            />
          </div>
        </div>

        <label style={{ fontSize: 13 }}>Productos a los que aplica</label>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Busca por nombre para agregarlo..."
            style={{ width: '100%' }}
          />
          {buscando && <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Buscando...</span>}
          {resultados.length > 0 && (
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                marginTop: 4,
                maxHeight: 220,
                overflowY: 'auto',
                background: 'var(--color-card, #fff)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                position: 'absolute',
                width: '100%',
                zIndex: 5,
              }}
            >
              {resultados.map((p) => (
                <button
                  key={p.id}
                  onClick={() => agregarProducto(p)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border)',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          )}
        </div>

        {productosSeleccionados.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {productosSeleccionados.map((p) => (
              <span
                key={p.id}
                style={{
                  fontSize: 12,
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: 'var(--color-secondary, #f0f0f0)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {p.nombre}
                <button
                  onClick={() => quitarProducto(p.id)}
                  aria-label={`Quitar ${p.nombre}`}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {productosSeleccionados.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: -4, marginBottom: 10 }}>
            El cupón solo descontará los productos que agregues aquí — el resto del carrito no se ve afectado.
          </p>
        )}

        <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13 }}>Compra mínima en esos productos (opcional)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.montoMinimo}
              onChange={(e) => setForm((f) => ({ ...f, montoMinimo: e.target.value }))}
              placeholder="$0.00"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13 }}>Vigente desde (opcional)</label>
            <input
              type="date"
              value={form.fechaInicio}
              onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13 }}>Vigente hasta (opcional)</label>
            <input
              type="date"
              value={form.fechaFin}
              onChange={(e) => setForm((f) => ({ ...f, fechaFin: e.target.value }))}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13 }}>Usos máximos totales (opcional)</label>
            <input
              type="number"
              min={1}
              value={form.usosMaximos}
              onChange={(e) => setForm((f) => ({ ...f, usosMaximos: e.target.value }))}
              placeholder="Sin límite"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13 }}>Usos máximos por cliente (opcional)</label>
            <input
              type="number"
              min={1}
              value={form.usosPorCliente}
              onChange={(e) => setForm((f) => ({ ...f, usosPorCliente: e.target.value }))}
              placeholder="Sin límite"
            />
          </div>
        </div>

        {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Crear cupón'}
          </button>
          {editandoId && (
            <button className="btn-secondary btn" onClick={limpiarFormulario} disabled={guardando}>
              Cancelar
            </button>
          )}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Descuento</th>
            <th>Productos</th>
            <th>Vigencia</th>
            <th>Usos</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cupones.map((c) => (
            <tr key={c.id}>
              <td>
                <strong>{c.codigo}</strong>
                {c.descripcion && (
                  <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{c.descripcion}</div>
                )}
              </td>
              <td>{c.tipoDescuento === 'PORCENTAJE' ? `${c.valor}%` : `$${c.valor}`}</td>
              <td style={{ fontSize: 12 }}>
                {c.productos.length === 1
                  ? c.productos[0].producto.nombre
                  : `${c.productos.length} productos`}
              </td>
              <td style={{ fontSize: 12 }}>
                {c.fechaInicio || c.fechaFin
                  ? `${c.fechaInicio ? isoAFecha(c.fechaInicio) : '—'} a ${c.fechaFin ? isoAFecha(c.fechaFin) : '—'}`
                  : 'Sin límite'}
              </td>
              <td style={{ fontSize: 12 }}>
                {c._count.usos}
                {c.usosMaximos ? ` / ${c.usosMaximos}` : ''}
              </td>
              <td>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: c.activo ? '#e6f4ea' : '#f5f5f5',
                    color: c.activo ? '#1e7e34' : '#777',
                  }}
                >
                  {c.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-secondary btn" onClick={() => editar(c)}>
                    Editar
                  </button>
                  <button className="btn-secondary btn" onClick={() => toggleActivo(c)}>
                    {c.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  {c._count.usos === 0 && (
                    <button className="btn-secondary btn" onClick={() => eliminar(c)}>
                      Borrar
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!cargando && cupones.length === 0 && (
            <tr>
              <td colSpan={7} style={{ color: 'var(--color-muted)' }}>
                Sin cupones creados todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
