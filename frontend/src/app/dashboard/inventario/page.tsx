'use client';

import { Fragment, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ProductoThumb, imagenPrincipal } from '@/components/ProductoThumb';

// Valor de opción usado en el selector de "de qué proveedor sale" para
// distinguir "el usuario eligió explícitamente el bucket sin proveedor" de
// "todavía no ha elegido nada" — ambos no pueden ser '' o se confunden.
const SIN_PROVEEDOR = '__sin_proveedor__';

interface Sucursal {
  id: number;
  nombre: string;
}

interface Proveedor {
  id: number;
  nombre: string;
}

// Desde que el stock se separa por proveedor, el backend ya no manda un
// renglón por variante: manda un renglón por (variante, proveedor) — si dos
// proveedores surten la misma talla en esta sucursal, llegan dos renglones
// con su propio stockActual. proveedorId/proveedor aquí es del bucket (de
// quién es ESTE stock), no del proveedor "por defecto" de la variante.
interface Existencia {
  id: number | null;
  sucursalId: number;
  proveedorId: number | null;
  proveedor: { id: number; nombre: string } | null;
  stockActual: number;
  stockMinimo: number;
  variante: {
    id: number;
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
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
  const [salidaVarianteId, setSalidaVarianteId] = useState<number | null>(null);
  const [salidaCantidad, setSalidaCantidad] = useState('1');
  const [salidaProveedorId, setSalidaProveedorId] = useState('');

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

  function abrirEntrada(varianteId: number) {
    setSalidaVarianteId(null);
    setEntradaVarianteId(varianteId);
    setEntradaCantidad('1');
    setEntradaProveedorId('');
  }

  // Como el stock se separa por proveedor, una salida/ajuste tiene que decir
  // siempre de cuál bucket sale — por eso también abre un mini-formulario en
  // vez del prompt simple que había antes.
  function abrirSalida(varianteId: number, buckets: Existencia[]) {
    setEntradaVarianteId(null);
    setSalidaVarianteId(varianteId);
    setSalidaCantidad('1');
    // Si solo hay un proveedor con stock aquí, se preselecciona; si hay
    // varios, se deja vacío para que el usuario elija a fuerza.
    const conStock = buckets.filter((b) => b.stockActual > 0);
    setSalidaProveedorId(
      conStock.length === 1 ? (conStock[0].proveedorId === null ? SIN_PROVEEDOR : String(conStock[0].proveedorId)) : ''
    );
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
          proveedorId: entradaProveedorId ? Number(entradaProveedorId) : null,
        }),
      });
      setMensaje('Movimiento registrado.');
      setEntradaVarianteId(null);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar el movimiento.');
    }
  }

  async function confirmarSalida(buckets: Existencia[]) {
    if (!salidaVarianteId) return;
    const cantidad = Number(salidaCantidad);
    if (!cantidad || cantidad <= 0) return;
    // Si hay más de un proveedor con stock en esta sucursal, obligamos a
    // elegir de cuál sale — no se adivina.
    if (buckets.filter((b) => b.stockActual > 0).length > 1 && !salidaProveedorId) {
      setMensaje('Esta talla tiene stock de más de un proveedor: elige de cuál sale.');
      return;
    }

    try {
      await api('/inventario/movimientos', {
        method: 'POST',
        body: JSON.stringify({
          sucursalId: Number(sucursalId),
          varianteId: salidaVarianteId,
          tipo: 'SALIDA',
          cantidad,
          proveedorId: salidaProveedorId === SIN_PROVEEDOR ? null : Number(salidaProveedorId),
        }),
      });
      setMensaje('Movimiento registrado.');
      setSalidaVarianteId(null);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar el movimiento.');
    }
  }

  // Agrupa los renglones (uno por proveedor) en uno por variante, para
  // mostrar una sola fila por talla con el desglose de stock por proveedor
  // adentro, en vez de repetir SKU/foto/marca por cada bucket.
  const grupos = (() => {
    const mapa = new Map<number, { variante: Existencia['variante']; buckets: Existencia[] }>();
    for (const e of existencias) {
      const existente = mapa.get(e.variante.id);
      if (existente) existente.buckets.push(e);
      else mapa.set(e.variante.id, { variante: e.variante, buckets: [e] });
    }
    return Array.from(mapa.values());
  })();

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
          {grupos.map(({ variante, buckets }) => {
            const stockTotal = buckets.reduce((s, b) => s + b.stockActual, 0);
            const minimo = buckets.reduce((max, b) => Math.max(max, b.stockMinimo), 0);
            return (
              <Fragment key={variante.id}>
                <tr>
                  <td>
                    <ProductoThumb url={imagenPrincipal(variante.producto)} alt={variante.producto?.nombre || ''} />
                  </td>
                  <td>{variante.sku}</td>
                  <td>{variante.producto?.nombre}</td>
                  <td>{variante.producto?.marca?.nombre}</td>
                  <td>{variante.talla?.valor ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    {buckets.map((b, i) => (
                      <div key={b.id ?? `sin-${i}`}>
                        {b.proveedor?.nombre ?? 'Sin proveedor'}: {b.stockActual}
                      </div>
                    ))}
                  </td>
                  <td className={stockTotal <= minimo ? 'stock-bajo' : ''}>{stockTotal}</td>
                  {puedeEditar && (
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-secondary btn" onClick={() => abrirEntrada(variante.id)}>
                        + Entrada
                      </button>
                      <button className="btn-secondary btn" onClick={() => abrirSalida(variante.id, buckets)}>
                        − Salida
                      </button>
                    </td>
                  )}
                </tr>
                {entradaVarianteId === variante.id && (
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
                          <option value="">Sin proveedor</option>
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
                {salidaVarianteId === variante.id && (
                  <tr>
                    <td colSpan={puedeEditar ? 8 : 7} style={{ background: '#fafafa' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0' }}>
                        <span style={{ fontSize: 12 }}>Cantidad:</span>
                        <input
                          type="number"
                          min={1}
                          value={salidaCantidad}
                          onChange={(ev) => setSalidaCantidad(ev.target.value)}
                          style={{ maxWidth: 90 }}
                        />
                        <span style={{ fontSize: 12 }}>De qué proveedor sale:</span>
                        <select
                          value={salidaProveedorId}
                          onChange={(ev) => setSalidaProveedorId(ev.target.value)}
                          style={{ maxWidth: 180 }}
                        >
                          <option value="">Selecciona...</option>
                          {buckets
                            .filter((b) => b.stockActual > 0)
                            .map((b) => (
                              <option key={b.id ?? 'sin'} value={b.proveedorId === null ? SIN_PROVEEDOR : b.proveedorId}>
                                {b.proveedor?.nombre ?? 'Sin proveedor'} (stock: {b.stockActual})
                              </option>
                            ))}
                        </select>
                        <button className="btn" onClick={() => confirmarSalida(buckets)}>
                          Confirmar
                        </button>
                        <button className="btn-secondary btn" onClick={() => setSalidaVarianteId(null)}>
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {grupos.length === 0 && (
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
