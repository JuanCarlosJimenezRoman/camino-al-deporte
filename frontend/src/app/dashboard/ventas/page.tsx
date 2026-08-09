'use client';

import { useEffect, useState } from 'react';
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
    talla: { valor: string } | null;
    producto: { nombre: string; imagenes?: { url: string }[] };
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

interface Existencia {
  id: number | null;
  stockActual: number;
  variante: {
    id: number;
    sku: string;
    talla: { valor: string } | null;
    producto: { nombre: string; precioVenta: string; imagenes?: { url: string }[] };
  };
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
  // pueden elegir cualquier sucursal.
  const sucursalBloqueada = usuario?.rol === 'VENTAS';

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [cuentas, setCuentas] = useState<CuentaTransferencia[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [varianteId, setVarianteId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [cliente, setCliente] = useState('');
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'>('EFECTIVO');
  const [cuentaTransferenciaId, setCuentaTransferenciaId] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

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
      const e = await api<Existencia[]>(`/inventario/existencias?sucursalId=${sucursalId}`);
      setExistencias(e);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId]);

  async function registrarVenta() {
    if (!varianteId || !sucursalId) return;
    const existencia = existencias.find((e) => String(e.variante.id) === varianteId);
    if (!existencia) return;
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
            varianteId: Number(varianteId),
            cantidad,
            precioUnitario: Number(existencia.variante.producto.precioVenta),
          },
        ],
      };

      const formData = new FormData();
      formData.append('datos', JSON.stringify(datos));
      if (comprobante) formData.append('comprobante', comprobante);

      await apiUpload('/ventas', formData);

      setMensaje('Venta registrada.');
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

      <div className="card" style={{ marginBottom: 20, maxWidth: 480 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Registrar venta rápida</h2>

        <label style={{ fontSize: 13 }}>Sucursal</label>
        {sucursalBloqueada ? (
          <div style={{ marginBottom: 10, fontSize: 14 }}>
            {sucursales.find((s) => String(s.id) === sucursalId)?.nombre || usuario?.sucursal?.nombre || '—'}
          </div>
        ) : (
          <select
            value={sucursalId}
            onChange={(e) => {
              setSucursalId(e.target.value);
              setVarianteId('');
            }}
            style={{ marginBottom: 10 }}
          >
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        )}

        <label style={{ fontSize: 13 }}>Producto / SKU</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          {varianteId && (
            <ProductoThumb
              url={imagenPrincipal(existencias.find((e) => String(e.variante.id) === varianteId)?.variante.producto)}
              alt=""
              size={40}
            />
          )}
          <select value={varianteId} onChange={(e) => setVarianteId(e.target.value)} style={{ flex: 1 }}>
            <option value="">Selecciona...</option>
            {existencias.map((e) => (
              <option key={e.variante.id} value={e.variante.id}>
                {e.variante.producto.nombre} {e.variante.talla ? `(${e.variante.talla.valor})` : ''} —{' '}
                {e.variante.sku} — stock: {e.stockActual}
              </option>
            ))}
          </select>
        </div>

        <label style={{ fontSize: 13 }}>Cantidad</label>
        <div style={{ marginBottom: 10 }}>
          <input
            type="number"
            min={1}
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
          />
        </div>

        <label style={{ fontSize: 13 }}>Cliente (opcional)</label>
        <div style={{ marginBottom: 10 }}>
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente" />
        </div>

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

        {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

        <button className="btn" onClick={registrarVenta} disabled={!varianteId || guardando}>
          {guardando ? 'Guardando...' : 'Registrar venta'}
        </button>
      </div>

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
                  <ProductoThumb url={imagenPrincipal(primerItem?.variante.producto)} alt={primerItem?.variante.producto.nombre || ''} />
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
