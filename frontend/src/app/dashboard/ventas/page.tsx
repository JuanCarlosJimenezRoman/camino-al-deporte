'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, apiUpload, ApiError } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import { ProductoThumb, imagenPrincipal } from '@/components/ProductoThumb';

interface Sucursal {
  id: number;
  nombre: string;
}

interface CuentaTransferencia {
  id: number;
  nombre: string;
  banco: string | null;
}

interface VentaItem {
  id: number;
  cantidad: number;
  variante: {
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: { nombre: string; imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[] };
  };
}

interface Venta {
  id: number;
  folio: string;
  cliente: string | null;
  total: string;
  estado: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  comprobanteUrl: string | null;
  cuentaTransferencia: { nombre: string } | null;
  createdAt: string;
  usuario: { nombre: string };
  sucursal: { nombre: string };
  items: VentaItem[];
}

// Un renglón por (variante, proveedor, sucursal): la misma talla puede
// aparecer varias veces si más de un proveedor tiene stock de ella, y ahora
// que la búsqueda es global (sin sucursalId) también puede repetirse una vez
// por cada sucursal donde exista.
interface Existencia {
  id: number | null;
  sucursalId: number;
  sucursal: { id: number; nombre: string } | null;
  proveedorId: number | null;
  proveedor: { id: number; nombre: string } | null;
  stockActual: number;
  variante: {
    id: number;
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: {
      nombre: string;
      precioVenta: string;
      imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[];
    };
  };
}

// Un pedido (transferencia) creado desde Ventas para traer stock de otra
// sucursal — ver POST /transferencias.
interface Transferencia {
  id: number;
  folio: string;
  cantidad: number;
  estado: string;
  createdAt: string;
  sucursalOrigenId: number;
  sucursalDestinoId: number;
  variante: { sku: string; producto: { nombre: string }; talla: { valor: string } | null; color: string | null };
  sucursalOrigen: { nombre: string };
  sucursalDestino: { nombre: string };
  solicitadoPor: { nombre: string };
}

// Identifica un bucket concreto (variante + proveedor + sucursal) para usarlo
// como key/value, ya que un mismo varianteId puede repetirse.
function claveExistencia(e: Existencia) {
  return `${e.variante.id}:${e.proveedorId ?? 'null'}:${e.sucursalId}`;
}

const METODOS_PAGO = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TARJETA', etiqueta: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
] as const;

export default function VentasPage() {
  const { usuario } = useAuth();
  // El vendedor (VENTAS) solo puede vender desde su propia sucursal
  // asignada; el selector se bloquea para ese rol. Admin/desarrollo sí
  // pueden elegir cualquier sucursal. Esto también se valida en el backend
  // (ver resolverSucursalId en routes/ventas.js) — el bloqueo aquí es solo
  // para no confundir al usuario, no es la única línea de defensa.
  const sucursalBloqueada = usuario?.rol === 'VENTAS';

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [cuentas, setCuentas] = useState<CuentaTransferencia[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);

  // Búsqueda de producto: ya no es un <select> con todo el catálogo, es un
  // campo de texto que busca (con un pequeño debounce) en TODAS las
  // sucursales — así se puede ver de un vistazo si el producto que pide el
  // cliente está en la sucursal propia o solo en otra.
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Existencia[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [seleccion, setSeleccion] = useState<Existencia | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cantidad, setCantidad] = useState(1);
  const [cliente, setCliente] = useState('');
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'>('EFECTIVO');
  const [cuentaTransferenciaId, setCuentaTransferenciaId] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Pedidos (transferencias) que esta sucursal ya solicitó y siguen en
  // camino — para que el vendedor vea que no se perdió el pedido, sin tener
  // que ir a la pantalla de Transferencias (que ni siquiera puede ver).
  const [pedidosPendientes, setPedidosPendientes] = useState<Transferencia[]>([]);

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then((data) => {
      setSucursales(data);
      const inicial = usuario?.sucursalId ? String(usuario.sucursalId) : data[0] ? String(data[0].id) : '';
      setSucursalId(inicial);
    });
    api<CuentaTransferencia[]>('/catalogos/cuentas-transferencia').then(setCuentas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar() {
    const v = await api<Venta[]>('/ventas');
    setVentas(v);
    if (sucursalId) {
      const t = await api<Transferencia[]>(`/transferencias?sucursalId=${sucursalId}&estado=SOLICITADA`);
      // El endpoint trae las que tienen esta sucursal como origen O destino;
      // aquí solo interesan las que ESTA sucursal pidió (destino), las que
      // le piden a ella se atienden desde Transferencias (rol INVENTARIO).
      setPedidosPendientes(t.filter((p) => p.sucursalDestinoId === Number(sucursalId)));
    }
  }

  useEffect(() => {
    cargar();
    setSeleccion(null);
    setBusqueda('');
    setResultados([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId]);

  // Búsqueda con debounce: espera 300ms sin teclear antes de consultar, para
  // no mandar una petición por cada letra. Busca en todas las sucursales
  // (sin ?sucursalId=) — así se puede pedir a otra si no hay en la propia.
  // Si ya hay una selección hecha (el texto es solo el nombre que se puso al
  // elegir un resultado, no algo que el usuario esté escribiendo), no vuelve
  // a buscar — si no, el buscador se reabriría solo justo después de elegir.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (seleccion || busqueda.trim().length < 2) {
      setResultados([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const data = await api<Existencia[]>(
          `/inventario/existencias?skuOProducto=${encodeURIComponent(busqueda.trim())}`
        );
        setResultados(data.filter((e) => e.stockActual > 0));
        setMostrarResultados(true);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [busqueda, seleccion]);

  function elegirResultado(e: Existencia) {
    setSeleccion(e);
    setMostrarResultados(false);
    setBusqueda(`${e.variante.producto.nombre}${e.variante.talla ? ` (${e.variante.talla.valor})` : ''}`);
    setMensaje(null);
  }

  function limpiarSeleccion() {
    setSeleccion(null);
    setBusqueda('');
    setResultados([]);
  }

  const esLocal = seleccion ? seleccion.sucursalId === Number(sucursalId) : true;

  async function registrarVenta() {
    if (!seleccion || !sucursalId) return;
    if (metodoPago === 'TRANSFERENCIA' && !cuentaTransferenciaId) {
      setMensaje('Elige a qué cuenta llegó la transferencia.');
      return;
    }
    if (metodoPago === 'TRANSFERENCIA' && !comprobante) {
      setMensaje('Falta la foto del comprobante de transferencia.');
      return;
    }

    setGuardando(true);
    try {
      const datos = {
        sucursalId: Number(sucursalId),
        cliente: cliente || undefined,
        metodoPago,
        cuentaTransferenciaId: metodoPago === 'TRANSFERENCIA' ? Number(cuentaTransferenciaId) : undefined,
        items: [
          {
            varianteId: seleccion.variante.id,
            cantidad,
            precioUnitario: Number(seleccion.variante.producto.precioVenta),
            // De qué proveedor sale el stock vendido — ya viene fijo desde
            // que se eligió el renglón en la búsqueda.
            proveedorId: seleccion.proveedorId,
          },
        ],
      };

      const formData = new FormData();
      formData.append('datos', JSON.stringify(datos));
      if (comprobante) formData.append('comprobante', comprobante);

      await apiUpload('/ventas', formData);

      setMensaje('Venta registrada.');
      limpiarSeleccion();
      setCliente('');
      setCantidad(1);
      setMetodoPago('EFECTIVO');
      setCuentaTransferenciaId('');
      setComprobante(null);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar la venta.');
    } finally {
      setGuardando(false);
    }
  }

  // Si el producto no está en la sucursal del vendedor pero sí en otra, en
  // vez de venderlo se crea un pedido (transferencia) hacia la sucursal
  // propia: no se pierde la venta, y se notifica al admin y al personal de
  // ambas sucursales para que lo surtan (ver POST /transferencias).
  async function crearPedido() {
    if (!seleccion || !sucursalId) return;
    setGuardando(true);
    setMensaje(null);
    try {
      await api('/transferencias', {
        method: 'POST',
        body: JSON.stringify({
          varianteId: seleccion.variante.id,
          proveedorId: seleccion.proveedorId,
          cantidad,
          sucursalOrigenId: seleccion.sucursalId,
          sucursalDestinoId: Number(sucursalId),
          notas: cliente ? `Pedido para venta — cliente: ${cliente}` : 'Pedido para venta',
        }),
      });
      setMensaje('Pedido creado: se notificó al admin y al personal de ambas sucursales.');
      limpiarSeleccion();
      setCliente('');
      setCantidad(1);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear el pedido.');
    } finally {
      setGuardando(false);
    }
  }

  async function cancelarPedido(id: number) {
    if (!window.confirm('¿Cancelar este pedido?')) return;
    try {
      await api(`/transferencias/${id}/cancelar`, { method: 'POST' });
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al cancelar el pedido.');
    }
  }

  const previewUrl = seleccion
    ? imagenPrincipal(seleccion.variante.producto, seleccion.variante.color)
    : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Ventas</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {puedeVer('apartados', usuario?.rol) && (
            <Link href="/dashboard/apartados" className="btn-secondary btn">
              Apartados
            </Link>
          )}
          <Link href="/dashboard/ventas/corte-dia" className="btn-secondary btn">
            Corte del día
          </Link>
          {puedeVer('historialVentas', usuario?.rol) && (
            <Link href="/dashboard/ventas/historial" className="btn-secondary btn">
              Historial
            </Link>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, maxWidth: 760 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Registrar venta rápida</h2>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 280 }}>
            <label style={{ fontSize: 13 }}>Sucursal</label>
            {sucursalBloqueada ? (
              <div style={{ marginBottom: 10, fontSize: 14 }}>
                {sucursales.find((s) => String(s.id) === sucursalId)?.nombre || usuario?.sucursal?.nombre || '—'}
              </div>
            ) : (
              <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} style={{ marginBottom: 10 }}>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            )}

            <label style={{ fontSize: 13 }}>Buscar producto (nombre o SKU)</label>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setSeleccion(null);
                }}
                onFocus={() => resultados.length > 0 && setMostrarResultados(true)}
                onBlur={() => {
                  // Retraso corto para que el click en un resultado alcance a
                  // registrarse antes de que el blur cierre la lista.
                  setTimeout(() => setMostrarResultados(false), 150);
                }}
                placeholder="Ej. Tenis Runner Pro, o el SKU..."
                style={{ width: '100%' }}
              />
              {buscando && <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Buscando...</span>}

              {mostrarResultados && resultados.length > 0 && (
                <div
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    marginTop: 4,
                    maxHeight: 280,
                    overflowY: 'auto',
                    background: 'var(--color-card, #fff)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                >
                  {resultados.map((r) => {
                    const local = r.sucursalId === Number(sucursalId);
                    return (
                      <button
                        key={claveExistencia(r)}
                        onClick={() => elegirResultado(r)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 10px',
                          border: 'none',
                          borderBottom: '1px solid var(--color-border)',
                          background: 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <ProductoThumb
                          url={imagenPrincipal(r.variante.producto, r.variante.color)}
                          alt=""
                          size={32}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {r.variante.producto.nombre}
                            {r.variante.talla ? ` (${r.variante.talla.valor})` : ''}
                            {r.variante.color ? ` — ${r.variante.color}` : ''}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                            SKU {r.variante.sku} · stock: {r.stockActual}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 999,
                            whiteSpace: 'nowrap',
                            background: local ? '#e6f4ea' : '#fff4e5',
                            color: local ? '#1e7e34' : '#a15c00',
                          }}
                        >
                          {local ? 'Tu sucursal' : r.sucursal?.nombre ?? 'Otra sucursal'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {seleccion && !esLocal && (
              <p style={{ fontSize: 12, color: '#a15c00', marginTop: -4, marginBottom: 10 }}>
                Este producto no está en tu sucursal — hay {seleccion.stockActual} en{' '}
                {seleccion.sucursal?.nombre ?? 'otra sucursal'}. Puedes crear un pedido en vez de venderlo.
              </p>
            )}

            <label style={{ fontSize: 13 }}>Cantidad</label>
            <div style={{ marginBottom: 10 }}>
              <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
            </div>

            <label style={{ fontSize: 13 }}>Cliente {esLocal ? '(opcional)' : ''}</label>
            <div style={{ marginBottom: 10 }}>
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente" />
            </div>

            {esLocal && (
              <>
                <label style={{ fontSize: 13 }}>Método de pago</label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as typeof metodoPago)}
                  style={{ marginBottom: 10 }}
                >
                  {METODOS_PAGO.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.etiqueta}
                    </option>
                  ))}
                </select>

                {metodoPago === 'TRANSFERENCIA' && (
                  <>
                    <label style={{ fontSize: 13 }}>Cuenta que recibió el pago</label>
                    <select
                      value={cuentaTransferenciaId}
                      onChange={(e) => setCuentaTransferenciaId(e.target.value)}
                      style={{ marginBottom: 10 }}
                    >
                      <option value="">Selecciona...</option>
                      {cuentas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} {c.banco ? `(${c.banco})` : ''}
                        </option>
                      ))}
                    </select>

                    <label style={{ fontSize: 13 }}>Foto del comprobante</label>
                    <div style={{ marginBottom: 10 }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setComprobante(e.target.files?.[0] || null)}
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

            {esLocal ? (
              <button className="btn" onClick={registrarVenta} disabled={!seleccion || guardando}>
                {guardando ? 'Guardando...' : 'Registrar venta'}
              </button>
            ) : (
              <button className="btn" onClick={crearPedido} disabled={!seleccion || guardando}>
                {guardando ? 'Enviando...' : 'Pedir a mi sucursal'}
              </button>
            )}
          </div>

          {/* Imagen grande del producto elegido, a la derecha del formulario */}
          <div
            style={{
              flex: '0 0 200px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 8,
            }}
          >
            <ProductoThumb url={previewUrl} alt={seleccion?.variante.producto.nombre || ''} size={200} />
            {seleccion && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{seleccion.variante.producto.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  {seleccion.variante.talla ? `Talla ${seleccion.variante.talla.valor}` : ''}
                  {seleccion.variante.color ? ` · ${seleccion.variante.color}` : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>SKU {seleccion.variante.sku}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {pedidosPendientes.length > 0 && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 760 }}>
          <h2 style={{ fontSize: 14, marginBottom: 10 }}>Pedidos en camino a tu sucursal</h2>
          <table style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Desde</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pedidosPendientes.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontSize: 12 }}>{p.folio}</td>
                  <td style={{ fontSize: 12 }}>
                    {p.variante.producto.nombre} {p.variante.talla ? `(${p.variante.talla.valor})` : ''}
                  </td>
                  <td style={{ fontSize: 12 }}>{p.cantidad}</td>
                  <td style={{ fontSize: 12 }}>{p.sucursalOrigen.nombre}</td>
                  <td>
                    <button className="btn-secondary btn" style={{ fontSize: 11 }} onClick={() => cancelarPedido(p.id)}>
                      Cancelar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th></th>
            <th>Folio</th>
            <th>Producto</th>
            <th>Sucursal</th>
            <th>Cliente</th>
            <th>Total</th>
            <th>Pago</th>
            <th>Estado</th>
            <th>Vendedor</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((v) => {
            const primerItem = v.items?.[0];
            return (
              <tr key={v.id}>
                <td>
                  <ProductoThumb
                    url={imagenPrincipal(primerItem?.variante.producto, primerItem?.variante.color)}
                    alt={primerItem?.variante.producto.nombre || ''}
                  />
                </td>
                <td>{v.folio}</td>
                <td>
                  {primerItem
                    ? `${primerItem.variante.producto.nombre}${primerItem.variante.talla ? ` (${primerItem.variante.talla.valor})` : ''}`
                    : '—'}
                  {v.items && v.items.length > 1 ? ` +${v.items.length - 1}` : ''}
                </td>
                <td>{v.sucursal?.nombre}</td>
                <td>{v.cliente || '—'}</td>
                <td>${v.total}</td>
                <td>
                  {v.metodoPago === 'EFECTIVO' ? 'Efectivo' : v.metodoPago === 'TARJETA' ? 'Tarjeta' : 'Transferencia'}
                  {v.cuentaTransferencia ? ` (${v.cuentaTransferencia.nombre})` : ''}
                  {v.comprobanteUrl && (
                    <>
                      {' '}
                      <a href={v.comprobanteUrl} target="_blank" rel="noreferrer">
                        ver comprobante
                      </a>
                    </>
                  )}
                </td>
                <td>{v.estado}</td>
                <td>{v.usuario?.nombre}</td>
                <td>{new Date(v.createdAt).toLocaleString('es-MX')}</td>
              </tr>
            );
          })}
          {ventas.length === 0 && (
            <tr>
              <td colSpan={10} style={{ color: 'var(--color-muted)' }}>
                Sin ventas registradas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
