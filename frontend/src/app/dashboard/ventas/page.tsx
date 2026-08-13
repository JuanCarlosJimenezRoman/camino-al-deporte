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
  precioUnitario: string;
  subtotal: string;
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
  // Teléfono capturado en el punto de venta para mandar el ticket digital.
  clienteTelefono: string | null;
  total: string;
  estado: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  comprobanteUrl: string | null;
  cuentaTransferencia: { nombre: string } | null;
  createdAt: string;
  usuario: { nombre: string };
  sucursal: { nombre: string; telefono?: string | null };
  // Número que se muestra como "contáctanos" dentro del ticket: el WhatsApp
  // propio de la sucursal si lo tiene, si no el general de la tienda. Ya
  // viene resuelto desde el backend (ver GET/POST /ventas).
  whatsappContacto: string | null;
  // Resultado del envío automático por WhatsApp Business Platform (Cloud
  // API), solo presente en la respuesta de POST /ventas. Si enviado=false
  // (no configurado todavía, o Meta rechazó el mensaje), se ofrece el link
  // manual de wa.me como respaldo — ver construirLinkTicket.
  ticketDigital?: { enviado: boolean; error?: string } | null;
  // PDF del ticket (generado en el servidor, subido a Cloudinary). Se puede
  // abrir/descargar siempre que se haya generado, aunque el envío
  // automático por WhatsApp haya fallado o no esté configurado todavía.
  ticketPdfUrl: string | null;
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

// Ticket digital para ventas de tienda física: se manda por WhatsApp con el
// mismo mecanismo de click-to-chat que ya se usa para el pago de pedidos en
// línea (ver app/tienda/pedidos/[id]/page.tsx) — no hay envío automático,
// el cajero abre el link con el mensaje ya armado y lo manda desde su
// WhatsApp. Aquí el número del link SÍ es el del cliente (a diferencia de
// pedidos en línea, donde el cliente le escribe a la tienda): el ticket va
// del negocio hacia el cliente.
function formatearTelefonoWhatsapp(telefono: string): string {
  let digitos = telefono.replace(/\D/g, '');
  if (digitos.length === 10) digitos = '52' + digitos; // sin código de país -> asumimos México
  return digitos;
}

function construirTicketTexto(venta: Venta): string {
  const articulos = venta.items
    .map((it) => {
      const detalle = [it.variante.talla?.valor, it.variante.color].filter(Boolean).join(' / ');
      return `- ${it.variante.producto.nombre}${detalle ? ` (${detalle})` : ''} x${it.cantidad} — $${it.subtotal}`;
    })
    .join('\n');
  const etiquetaPago = METODOS_PAGO.find((m) => m.valor === venta.metodoPago)?.etiqueta || venta.metodoPago;

  return [
    'Ticket de compra — Camino al Deporte',
    `Folio: ${venta.folio}`,
    `Fecha: ${new Date(venta.createdAt).toLocaleString('es-MX')}`,
    venta.sucursal?.nombre ? `Sucursal: ${venta.sucursal.nombre}` : '',
    '',
    'Artículos:',
    articulos,
    '',
    `Total: $${venta.total}`,
    `Método de pago: ${etiquetaPago}`,
    '',
    '¡Gracias por tu compra!',
    venta.whatsappContacto ? `Dudas o cambios, contáctanos: ${venta.whatsappContacto}` : '',
  ].join('\n');
}

function construirLinkTicket(venta: Venta): string | null {
  if (!venta.clienteTelefono) return null;
  const numero = formatearTelefonoWhatsapp(venta.clienteTelefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(construirTicketTexto(venta))}`;
}

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

  // Venta local (producto disponible en la sucursal propia)
  const [cliente, setCliente] = useState('');
  // Opcional: solo se pide para poder mandar el ticket digital por WhatsApp
  // al terminar la venta. Sin él, la venta se registra igual.
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'>('EFECTIVO');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [cuentaTransferenciaId, setCuentaTransferenciaId] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);

  // Link de WhatsApp del ticket de la última venta registrada, para
  // ofrecerlo justo después de cobrar (ver registrarVenta).
  const [ticketLink, setTicketLink] = useState<string | null>(null);
  // PDF del ticket de la última venta — se ofrece aparte del link de
  // WhatsApp de arriba: sirve incluso si el envío automático falló, o si
  // el cajero solo quiere verlo/imprimirlo.
  const [ticketPdfUrl, setTicketPdfUrl] = useState<string | null>(null);

  // Apartado (producto solo disponible en otra sucursal): no se vende
  // directamente, se aparta para el cliente y el stock se reserva en la
  // sucursal donde sí hay — ver POST /apartados.
  const [clienteNombreApartado, setClienteNombreApartado] = useState('');
  const [clienteTelefonoApartado, setClienteTelefonoApartado] = useState('');

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
  // (sin ?sucursalId=) — así se ve de un vistazo si lo que pide el cliente
  // está en la sucursal propia o solo en otra.
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
    setCantidad(1);
    setEfectivoRecibido('');
  }

  // El vendedor (VENTAS o admin probando con esa sucursal) nunca vende
  // directamente algo que no está físicamente en la sucursal elegida — si
  // el resultado es de otra sucursal, la única acción disponible es
  // apartarlo (ver más abajo), nunca "Registrar venta".
  const esLocal = seleccion ? seleccion.sucursalId === Number(sucursalId) : true;

  const precioUnitario = seleccion ? Number(seleccion.variante.producto.precioVenta) : 0;
  const totalVenta = precioUnitario * cantidad;
  const cambio = efectivoRecibido.trim() ? Number(efectivoRecibido) - totalVenta : null;

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
    if (metodoPago === 'EFECTIVO') {
      if (!efectivoRecibido.trim()) {
        setMensaje('Captura cuánto efectivo recibiste, para calcular el cambio.');
        return;
      }
      if (cambio !== null && cambio < 0) {
        setMensaje(`El efectivo recibido no alcanza: faltan $${Math.abs(cambio).toFixed(2)}.`);
        return;
      }
    }

    setGuardando(true);
    setTicketLink(null);
    setTicketPdfUrl(null);
    try {
      const datos = {
        sucursalId: Number(sucursalId),
        cliente: cliente || undefined,
        clienteTelefono: clienteTelefono.trim() || undefined,
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

      const creada = await apiUpload<Venta>('/ventas', formData);

      const baseMensaje =
        metodoPago === 'EFECTIVO' && cambio !== null && cambio > 0
          ? `Venta registrada. Cambio a dar: $${cambio.toFixed(2)}.`
          : 'Venta registrada.';

      setTicketPdfUrl(creada.ticketPdfUrl || null);

      if (creada.ticketDigital?.enviado) {
        // Ya se mandó solo por la API de WhatsApp (con el PDF adjunto) — no
        // se ofrece el botón manual para no arriesgar mandarlo dos veces.
        setMensaje(`${baseMensaje} Ticket (PDF) enviado automáticamente por WhatsApp.`);
        setTicketLink(null);
      } else {
        // Sin API configurada (o falló el envío): se ofrece el link manual
        // de siempre como respaldo, si el cliente dejó su teléfono — y el
        // PDF por su cuenta, para verlo o mandarlo a mano.
        setMensaje(baseMensaje);
        setTicketLink(construirLinkTicket(creada));
      }
      limpiarSeleccion();
      setCliente('');
      setClienteTelefono('');
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
  // vez de venderlo (o de "pedirlo" aparte) se aparta para el cliente: el
  // stock se reserva de inmediato en la sucursal donde sí hay (ver
  // ApartadoItem.sucursalStockId) y se notifica a esa sucursal y al admin —
  // reutiliza el mismo mecanismo de Apartados en vez de inventar uno nuevo.
  async function crearApartado() {
    if (!seleccion || !sucursalId) return;
    if (!clienteNombreApartado.trim() || !clienteTelefonoApartado.trim()) {
      setMensaje('Captura nombre y teléfono del cliente para poder apartarlo.');
      return;
    }
    setGuardando(true);
    setMensaje(null);
    setTicketLink(null);
    setTicketPdfUrl(null);
    try {
      await api('/apartados', {
        method: 'POST',
        body: JSON.stringify({
          clienteNuevo: { nombre: clienteNombreApartado.trim(), telefono: clienteTelefonoApartado.trim() },
          sucursalVentaId: Number(sucursalId),
          items: [
            {
              varianteId: seleccion.variante.id,
              proveedorId: seleccion.proveedorId,
              sucursalStockId: seleccion.sucursalId,
              cantidad,
              precioUnitario: precioUnitario,
            },
          ],
        }),
      });
      setMensaje(
        `Apartado creado — se notificó a ${seleccion.sucursal?.nombre ?? 'la sucursal'} y al admin. Puedes ` +
          'registrar el anticipo y darle seguimiento desde Apartados.'
      );
      limpiarSeleccion();
      setClienteNombreApartado('');
      setClienteTelefonoApartado('');
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear el apartado.');
    } finally {
      setGuardando(false);
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

      <div className="card" style={{ marginBottom: 20, maxWidth: 780 }}>
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
                {seleccion.sucursal?.nombre ?? 'otra sucursal'}. No se puede vender directamente desde aquí; puedes
                apartarlo para el cliente.
              </p>
            )}

            <label style={{ fontSize: 13 }}>Cantidad</label>
            <div style={{ marginBottom: 10 }}>
              <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
            </div>

            {seleccion && (
              <p style={{ fontSize: 13, fontWeight: 600, marginTop: -4, marginBottom: 10 }}>
                Total: ${totalVenta.toFixed(2)}
              </p>
            )}

            {esLocal ? (
              <>
                <label style={{ fontSize: 13 }}>Cliente (opcional)</label>
                <div style={{ marginBottom: 10 }}>
                  <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente" />
                </div>

                <label style={{ fontSize: 13 }}>Teléfono del cliente (opcional)</label>
                <div style={{ marginBottom: 10 }}>
                  <input
                    value={clienteTelefono}
                    onChange={(e) => setClienteTelefono(e.target.value)}
                    placeholder="10 dígitos, para mandarle el ticket por WhatsApp"
                  />
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

                {metodoPago === 'EFECTIVO' && (
                  <>
                    <label style={{ fontSize: 13 }}>Efectivo recibido</label>
                    <div style={{ marginBottom: 4 }}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={efectivoRecibido}
                        onChange={(e) => setEfectivoRecibido(e.target.value)}
                        placeholder="$0.00"
                      />
                    </div>
                    {efectivoRecibido.trim() && cambio !== null && (
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 10,
                          color: cambio < 0 ? '#c0392b' : '#1e7e34',
                        }}
                      >
                        {cambio < 0
                          ? `Falta efectivo: $${Math.abs(cambio).toFixed(2)}`
                          : `Cambio a dar: $${cambio.toFixed(2)}`}
                      </p>
                    )}
                  </>
                )}

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
            ) : (
              <>
                <label style={{ fontSize: 13 }}>Nombre del cliente</label>
                <div style={{ marginBottom: 10 }}>
                  <input
                    value={clienteNombreApartado}
                    onChange={(e) => setClienteNombreApartado(e.target.value)}
                    placeholder="Nombre completo"
                  />
                </div>
                <label style={{ fontSize: 13 }}>Teléfono del cliente</label>
                <div style={{ marginBottom: 10 }}>
                  <input
                    value={clienteTelefonoApartado}
                    onChange={(e) => setClienteTelefonoApartado(e.target.value)}
                    placeholder="10 dígitos"
                  />
                </div>
              </>
            )}

            {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

            {(ticketLink || ticketPdfUrl) && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {ticketLink && (
                  <a href={ticketLink} target="_blank" rel="noreferrer" className="btn">
                    Enviar ticket por WhatsApp
                  </a>
                )}
                {ticketPdfUrl && (
                  <a href={ticketPdfUrl} target="_blank" rel="noreferrer" className="btn-secondary btn">
                    Ver ticket (PDF)
                  </a>
                )}
              </div>
            )}

            {esLocal ? (
              <button className="btn" onClick={registrarVenta} disabled={!seleccion || guardando}>
                {guardando ? 'Guardando...' : 'Registrar venta'}
              </button>
            ) : (
              <button className="btn" onClick={crearApartado} disabled={!seleccion || guardando}>
                {guardando ? 'Guardando...' : 'Apartar para el cliente'}
              </button>
            )}
          </div>

          {/* Imagen grande del producto elegido, a la derecha del formulario.
              object-fit: contain (vía fit="contain") para que se vea la foto
              completa sin recortarla, aunque no sea cuadrada. */}
          <div
            style={{
              flex: '0 0 220px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                width: 220,
                height: 220,
                borderRadius: 12,
                background: '#fafafa',
                border: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 12,
              }}
            >
              <ProductoThumb
                url={previewUrl}
                alt={seleccion?.variante.producto.nombre || ''}
                size={196}
                fit="contain"
              />
            </div>
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
            <th>Ticket</th>
            <th>PDF</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((v) => {
            const primerItem = v.items?.[0];
            const linkTicket = construirLinkTicket(v);
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
                <td>
                  {linkTicket ? (
                    <a href={linkTicket} target="_blank" rel="noreferrer">
                      Enviar
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {v.ticketPdfUrl ? (
                    <a href={v.ticketPdfUrl} target="_blank" rel="noreferrer">
                      Ver
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
          {ventas.length === 0 && (
            <tr>
              <td colSpan={12} style={{ color: 'var(--color-muted)' }}>
                Sin ventas registradas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
