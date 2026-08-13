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

interface Marca {
  id: number;
  nombre: string;
}
interface Modelo {
  id: number;
  nombre: string;
  marcaId: number;
}
interface Categoria {
  id: number;
  nombre: string;
}
interface Talla {
  id: number;
  valor: string;
  tipo: string;
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
    talla: { valor: string; orden?: number } | null;
    producto: {
      id: number;
      nombre: string;
      marca: { nombre: string };
      imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[];
    };
    // Proveedor "por defecto" asignado a esta variante en Productos — no es
    // necesariamente el mismo proveedor que tiene stock en este bucket
    // (b.proveedor), se usa para preseleccionar al registrar una entrada.
    proveedor: { id: number; nombre: string } | null;
  };
}

type GrupoVariante = { variante: Existencia['variante']; buckets: Existencia[] };
type GrupoProducto = { producto: Existencia['variante']['producto']; variantes: GrupoVariante[] };

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

  // Catálogos y filtros extra para encontrar más rápido qué tallas/marcas/
  // modelos hay disponibles, además de la búsqueda por texto y el proveedor.
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [modelosFiltro, setModelosFiltro] = useState<Modelo[]>([]);
  const [marcaFiltro, setMarcaFiltro] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [modeloFiltro, setModeloFiltro] = useState('');
  const [tallaFiltro, setTallaFiltro] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [entradaVarianteId, setEntradaVarianteId] = useState<number | null>(null);
  const [entradaCantidad, setEntradaCantidad] = useState('1');
  const [entradaProveedorId, setEntradaProveedorId] = useState('');
  const [salidaVarianteId, setSalidaVarianteId] = useState<number | null>(null);
  const [salidaCantidad, setSalidaCantidad] = useState('1');
  const [salidaProveedorId, setSalidaProveedorId] = useState('');
  // Qué producto tiene desplegado el detalle por talla/color — la vista
  // inicial solo muestra una fila por producto para no abrumar cuando tiene
  // muchas variantes; el registro de entradas/salidas sigue viviendo a nivel
  // de variante, adentro del desplegable.
  const [productoAbiertoId, setProductoAbiertoId] = useState<number | null>(null);

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then((data) => {
      setSucursales(data);
      // VENTAS arranca viendo su propia sucursal, pero puede cambiar el
      // selector para consultar existencia en otras (no puede editar ahí).
      const inicial = usuario?.sucursalId ? String(usuario.sucursalId) : data[0] ? String(data[0].id) : '';
      setSucursalId(inicial);
    });
    api<Proveedor[]>('/proveedores').then(setProveedores).catch(() => {});
    api<Marca[]>('/catalogos/marcas').then(setMarcas);
    api<Categoria[]>('/catalogos/categorias').then(setCategorias);
    api<Talla[]>('/catalogos/tallas').then(setTallas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Los modelos del filtro dependen de la marca elegida (si no hay ninguna,
  // se listan todos). Al cambiar de marca se limpia el modelo elegido, por
  // si ya no pertenece a la marca nueva.
  useEffect(() => {
    api<Modelo[]>(`/catalogos/modelos${marcaFiltro ? `?marcaId=${marcaFiltro}` : ''}`).then(setModelosFiltro);
    setModeloFiltro('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcaFiltro]);

  async function cargar() {
    if (!sucursalId) return;
    const qs = new URLSearchParams({ sucursalId });
    if (busqueda) qs.set('skuOProducto', busqueda);
    if (proveedorFiltro) qs.set('proveedorId', proveedorFiltro);
    if (marcaFiltro) qs.set('marcaId', marcaFiltro);
    if (categoriaFiltro) qs.set('categoriaId', categoriaFiltro);
    if (modeloFiltro) qs.set('modeloId', modeloFiltro);
    if (tallaFiltro) qs.set('tallaId', tallaFiltro);
    const data = await api<Existencia[]>(`/inventario/existencias?${qs.toString()}`);
    setExistencias(data);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId, proveedorFiltro, marcaFiltro, categoriaFiltro, modeloFiltro, tallaFiltro]);

  // Preselecciona el proveedor "por defecto" de la variante (el que se le
  // asignó en Productos). Antes siempre arrancaba en "Sin proveedor" y, si el
  // usuario no se acordaba de cambiarlo, el stock quedaba cargado a un bucket
  // sin proveedor aunque la variante sí tuviera uno asignado — eso es lo que
  // hacía que luego, al filtrar Inventario por ese proveedor, no apareciera
  // nada.
  function abrirEntrada(variante: Existencia['variante']) {
    setSalidaVarianteId(null);
    setEntradaVarianteId(variante.id);
    setEntradaCantidad('1');
    setEntradaProveedorId(variante.proveedor ? String(variante.proveedor.id) : '');
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
  const gruposVariante: GrupoVariante[] = (() => {
    const mapa = new Map<number, GrupoVariante>();
    for (const e of existencias) {
      const existente = mapa.get(e.variante.id);
      if (existente) existente.buckets.push(e);
      else mapa.set(e.variante.id, { variante: e.variante, buckets: [e] });
    }
    return Array.from(mapa.values());
  })();

  // Y luego agrupa las variantes por producto, para la vista inicial: una
  // sola fila por producto con sus tallas/colores resumidos, en vez de una
  // fila por cada combinación de talla — eso era lo que hacía tediosa la
  // vista al entrar cuando un producto tenía muchas tallas.
  const gruposProducto: GrupoProducto[] = (() => {
    const mapa = new Map<number, GrupoProducto>();
    for (const g of gruposVariante) {
      const pid = g.variante.producto.id;
      const existente = mapa.get(pid);
      if (existente) existente.variantes.push(g);
      else mapa.set(pid, { producto: g.variante.producto, variantes: [g] });
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

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={marcaFiltro} onChange={(e) => setMarcaFiltro(e.target.value)} style={{ maxWidth: 170 }}>
          <option value="">Todas las marcas</option>
          {marcas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        <select
          value={modeloFiltro}
          onChange={(e) => setModeloFiltro(e.target.value)}
          disabled={modelosFiltro.length === 0}
          style={{ maxWidth: 170 }}
        >
          <option value="">Todos los modelos</option>
          {modelosFiltro.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} style={{ maxWidth: 170 }}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select value={tallaFiltro} onChange={(e) => setTallaFiltro(e.target.value)} style={{ maxWidth: 170 }}>
          <option value="">Todas las tallas</option>
          {tallas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.tipo}: {t.valor}
            </option>
          ))}
        </select>
        {(marcaFiltro || categoriaFiltro || modeloFiltro || tallaFiltro) && (
          <button
            className="btn-secondary btn"
            onClick={() => {
              setMarcaFiltro('');
              setCategoriaFiltro('');
              setModeloFiltro('');
              setTallaFiltro('');
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {mensaje && <p style={{ marginBottom: 12, fontSize: 13 }}>{mensaje}</p>}

      <table>
        <thead>
          <tr>
            <th></th>
            <th>Producto</th>
            <th>Marca</th>
            <th>Tallas / colores</th>
            <th>Stock total</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {gruposProducto.map(({ producto, variantes }) => {
            const stockProducto = variantes.reduce(
              (s, g) => s + g.buckets.reduce((s2, b) => s2 + b.stockActual, 0),
              0
            );
            // Si cualquiera de las variantes está en o por debajo de su
            // mínimo, se marca el total del producto para que salte a la
            // vista sin tener que desplegar cada una a revisar.
            const algunaBaja = variantes.some((g) => {
              const total = g.buckets.reduce((s, b) => s + b.stockActual, 0);
              const minimo = g.buckets.reduce((max, b) => Math.max(max, b.stockMinimo), 0);
              return total <= minimo;
            });
            const etiquetas = variantes
              .slice()
              .sort((a, b) => (a.variante.talla?.orden ?? 0) - (b.variante.talla?.orden ?? 0))
              .map((g) => {
                const talla = g.variante.talla?.valor ?? 'sin talla';
                return g.variante.color ? `${talla} (${g.variante.color})` : talla;
              });
            const abierto = productoAbiertoId === producto.id;
            return (
              <Fragment key={producto.id}>
                <tr>
                  <td>
                    <ProductoThumb url={imagenPrincipal(producto)} alt={producto?.nombre || ''} />
                  </td>
                  <td>{producto?.nombre}</td>
                  <td>{producto?.marca?.nombre}</td>
                  <td style={{ fontSize: 12, whiteSpace: 'normal' }}>{etiquetas.join(', ') || '—'}</td>
                  <td className={algunaBaja ? 'stock-bajo' : ''}>{stockProducto}</td>
                  <td>
                    <button
                      className="btn-secondary btn"
                      onClick={() => setProductoAbiertoId(abierto ? null : producto.id)}
                    >
                      {abierto ? 'Ocultar' : 'Ver tallas'} ({variantes.length})
                    </button>
                  </td>
                </tr>
                {abierto && (
                  <tr>
                    <td colSpan={6} style={{ background: '#fafafa' }}>
                      <table style={{ minWidth: 0 }}>
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Talla</th>
                            <th>Color</th>
                            <th>Proveedor</th>
                            <th>Stock</th>
                            {puedeEditar && <th>Acciones</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {variantes.map(({ variante, buckets }) => {
                            const stockTotal = buckets.reduce((s, b) => s + b.stockActual, 0);
                            const minimo = buckets.reduce((max, b) => Math.max(max, b.stockMinimo), 0);
                            return (
                              <Fragment key={variante.id}>
                                <tr>
                                  <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>{variante.sku}</td>
                                  <td>{variante.talla?.valor ?? '—'}</td>
                                  <td>{variante.color ?? '—'}</td>
                                  <td style={{ fontSize: 12 }}>
                                    {buckets.map((b, i) => (
                                      <div key={b.id ?? `sin-${i}`}>
                                        {b.proveedor?.nombre ?? 'Sin proveedor'}: {b.stockActual}
                                      </div>
                                    ))}
                                  </td>
                                  <td className={stockTotal <= minimo ? 'stock-bajo' : ''}>{stockTotal}</td>
                                  {puedeEditar && (
                                    <td style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
                                      <button className="btn-secondary btn" onClick={() => abrirEntrada(variante)}>
                                        + Entrada
                                      </button>
                                      <button
                                        className="btn-secondary btn"
                                        onClick={() => abrirSalida(variante.id, buckets)}
                                      >
                                        − Salida
                                      </button>
                                    </td>
                                  )}
                                </tr>
                                {entradaVarianteId === variante.id && (
                                  <tr>
                                    <td colSpan={puedeEditar ? 6 : 5} style={{ background: '#f2f2f2' }}>
                                      <div
                                        style={{
                                          display: 'flex',
                                          gap: 8,
                                          alignItems: 'center',
                                          flexWrap: 'wrap',
                                          padding: '6px 0',
                                        }}
                                      >
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
                                        <button
                                          className="btn-secondary btn"
                                          onClick={() => setEntradaVarianteId(null)}
                                        >
                                          Cancelar
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                {salidaVarianteId === variante.id && (
                                  <tr>
                                    <td colSpan={puedeEditar ? 6 : 5} style={{ background: '#f2f2f2' }}>
                                      <div
                                        style={{
                                          display: 'flex',
                                          gap: 8,
                                          alignItems: 'center',
                                          flexWrap: 'wrap',
                                          padding: '6px 0',
                                        }}
                                      >
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
                                              <option
                                                key={b.id ?? 'sin'}
                                                value={b.proveedorId === null ? SIN_PROVEEDOR : b.proveedorId}
                                              >
                                                {b.proveedor?.nombre ?? 'Sin proveedor'} (stock: {b.stockActual})
                                              </option>
                                            ))}
                                        </select>
                                        <button className="btn" onClick={() => confirmarSalida(buckets)}>
                                          Confirmar
                                        </button>
                                        <button
                                          className="btn-secondary btn"
                                          onClick={() => setSalidaVarianteId(null)}
                                        >
                                          Cancelar
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {gruposProducto.length === 0 && (
            <tr>
              <td colSpan={6} style={{ color: 'var(--color-muted)' }}>
                Sin existencias registradas en esta sucursal.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
