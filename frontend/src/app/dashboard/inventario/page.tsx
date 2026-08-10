'use client';

import { Fragment, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ProductoThumb, imagenPrincipal } from '@/components/ProductoThumb';

interface Sucursal {
  id: number;
  nombre: string;
}

interface Proveedor {
  id: number;
  nombre: string;
}

interface Existencia {
  id: number | null;
  sucursalId: number;
  stockActual: number;
  stockMinimo: number;
  variante: {
    id: number;
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    proveedor: { id: number; nombre: string } | null;
    producto: { nombre: string; marca: { nombre: string }; imagenes?: { url: string }[] };
  };
}

export default function InventarioPage() {
  const { usuario } = useAuth();
  // VENTAS solo puede consultar existencias (de su sucursal o de otras, para
  // buscar un modelo y pedirlo si un cliente lo quiere) — no puede editar
  // stock desde aquí; eso sigue siendo trabajo de INVENTARIO/ADMIN.
  const puedeEditar = usuario?.rol !== 'VENTAS';
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState<string>('');
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedorFiltro, setProveedorFiltro] = useState('');
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [entradaVarianteId, setEntradaVarianteId] = useState<number | null>(null);
  const [entradaCantidad, setEntradaCantidad] = useState('1');
  const [entradaProveedorId, setEntradaProveedorId] = useState('');

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then((data) => {
      setSucursales(data);
      // VENTAS arranca viendo su propia sucursal, pero puede cambiar el
      // selector para consultar existencia en otras (no puede editar ahí).
      const inicial = usuario?.sucursalId ? String(usuario.sucursalId) : data[0] ? String(data[0].id) : '';
      setSucursalId(inicial);
    });
    api<Proveedor[]>('/proveedores').then(setProveedores).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar() {
    if (!sucursalId) return;
    const qs = new URLSearchParams({ sucursalId });
    if (busqueda) qs.set('skuOProducto', busqueda);
    if (proveedorFiltro) qs.set('proveedorId', proveedorFiltro);
    const data = await api<Existencia[]>(`/inventario/existencias?${qs.toString()}`);
    setExistencias(data);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId, proveedorFiltro]);

  async function registrarMovimiento(varianteId: number, tipo: 'ENTRADA' | 'SALIDA') {
    if (tipo === 'ENTRADA') {
      // La entrada necesita saber de qué proveedor vino el lote, así que se
      // abre un mini-formulario en vez del prompt simple.
      setEntradaVarianteId(varianteId);
      setEntradaCantidad('1');
      setEntradaProveedorId('');
      return;
    }
    const cantidadStr = window.prompt('Cantidad a registrar (salida):', '1');
    if (!cantidadStr) return;
    const cantidad = Number(cantidadStr);
    if (!cantidad || cantidad <= 0) return;

    try {
      await api('/inventario/movimientos', {
        method: 'POST',
        body: JSON.stringify({ sucursalId: Number(sucursalId), varianteId, tipo, cantidad }),
      });
      setMensaje('Movimiento registrado.');
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar el movimiento.');
    }
  }

  async function confirmarEntrada() {
    if (!entradaVarianteId) return;
    const cantidad = Number(entradaCantidad);
    if (!cantidad || cantidad <= 0) return;

    try {
      await api('/inventario/movimientos', {
        method: 'POST',
        body: JSON.stringify({
          sucursalId: Number(sucursalId),
          varianteId: entradaVarianteId,
          tipo: 'ENTRADA',
          cantidad,
          proveedorId: entradaProveedorId ? Number(entradaProveedorId) : undefined,
        }),
      });
      setMensaje('Movimiento registrado.');
      setEntradaVarianteId(null);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar el movimiento.');
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Inventario / Existencias</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} style={{ maxWidth: 220 }}>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <input
          placeholder="Buscar por SKU o producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && cargar()}
          style={{ maxWidth: 260 }}
        />
        <select value={proveedorFiltro} onChange={(e) => setProveedorFiltro(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <button className="btn" onClick={cargar}>
          Buscar
        </button>
      </div>

      {mensaje && <p style={{ marginBottom: 12, fontSize: 13 }}>{mensaje}</p>}

      <table>
        <thead>
          <tr>
            <th></th>
            <th>SKU</th>
            <th>Producto</th>
            <th>Marca</th>
            <th>Talla</th>
            <th>Proveedor</th>
            <th>Stock</th>
            {puedeEditar && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {existencias.map((e) => (
            <Fragment key={e.variante.id}>
              <tr>
                <td>
                  <ProductoThumb url={imagenPrincipal(e.variante.producto)} alt={e.variante.producto?.nombre || ''} />
                </td>
                <td>{e.variante.sku}</td>
                <td>{e.variante.producto?.nombre}</td>
                <td>{e.variante.producto?.marca?.nombre}</td>
                <td>{e.variante.talla?.valor ?? '—'}</td>
                <td>{e.variante.proveedor?.nombre ?? '—'}</td>
                <td className={e.stockActual <= e.stockMinimo ? 'stock-bajo' : ''}>{e.stockActual}</td>
                {puedeEditar && (
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-secondary btn" onClick={() => registrarMovimiento(e.variante.id, 'ENTRADA')}>
                      + Entrada
                    </button>
                    <button className="btn-secondary btn" onClick={() => registrarMovimiento(e.variante.id, 'SALIDA')}>
                      − Salida
                    </button>
                  </td>
                )}
              </tr>
              {entradaVarianteId === e.variante.id && (
                <tr>
                  <td colSpan={puedeEditar ? 8 : 7} style={{ background: '#fafafa' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0' }}>
                      <span style={{ fontSize: 12 }}>Cantidad:</span>
                      <input
                        type="number"
                        min={1}
                        value={entradaCantidad}
                        onChange={(ev) => setEntradaCantidad(ev.target.value)}
                        style={{ maxWidth: 90 }}
                      />
                      <span style={{ fontSize: 12 }}>Proveedor:</span>
                      <select
                        value={entradaProveedorId}
                        onChange={(ev) => setEntradaProveedorId(ev.target.value)}
                        style={{ maxWidth: 180 }}
                      >
                        <option value="">Sin especificar</option>
                        {proveedores.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                      <button className="btn" onClick={confirmarEntrada}>
                        Confirmar
                      </button>
                      <button className="btn-secondary btn" onClick={() => setEntradaVarianteId(null)}>
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {existencias.length === 0 && (
            <tr>
              <td colSpan={puedeEditar ? 8 : 7} style={{ color: 'var(--color-muted)' }}>
                Sin existencias registradas en esta sucursal.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
