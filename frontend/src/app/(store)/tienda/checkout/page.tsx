'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthCliente } from '@/lib/authCliente';
import { useCarrito } from '@/lib/carrito';
import { apiTienda, ApiError } from '@/lib/apiTienda';
import { claseBotonPrimario } from '@/components/store/ui';

interface PedidoCreado {
  id: number;
  folio: string;
}

interface CuponValidado {
  codigo: string;
  montoDescuento: number;
}

// Envío dinámico dentro de Oaxaca (opcional — ver
// ConfiguracionTienda.envioDinamicoActivo, /dashboard/metodos-pago y
// routes/tienda/envios.js). Con el flag apagado (el default) nada de esto
// se usa y el checkout se comporta exactamente igual que siempre.
interface DestinoEnvioOpcion {
  id: number;
  nombre: string;
  municipio: string;
}
interface OpcionEnvioLocal {
  tarifaId: number;
  transportista: { nombre: string };
  tipoEntrega: 'DOMICILIO' | 'PUNTO_RECOLECCION' | 'COTIZACION_MANUAL';
  puntoEntrega: { nombre: string; direccion: string | null } | null;
  precioCliente: string;
}
interface CotizacionEnvioLocal {
  estado: 'DISPONIBLE' | 'COTIZACION_MANUAL';
  opciones: OpcionEnvioLocal[];
}

const campoClase = 'w-full rounded-lg border border-border bg-input px-3.5 py-3 text-sm outline-none focus:border-foreground';
const labelClase = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground';

export default function CheckoutPage() {
  const { cliente, cargando } = useAuthCliente();
  const { items, total, vaciar } = useCarrito();
  const router = useRouter();

  const [destinatario, setDestinatario] = useState('');
  const [telefonoContacto, setTelefonoContacto] = useState('');
  const [calle, setCalle] = useState('');
  const [numeroExt, setNumeroExt] = useState('');
  const [numeroInt, setNumeroInt] = useState('');
  const [colonia, setColonia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [estadoMx, setEstadoMx] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [referencias, setReferencias] = useState('');
  const [notas, setNotas] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [costoEnvio, setCostoEnvio] = useState(0);
  // Envío dinámico dentro de Oaxaca — se activa solo cuando el flag está
  // prendido y el cliente escribe "Oaxaca" como estado; en cualquier otro
  // caso el checkout sigue mostrando el costo fijo de siempre.
  const [envioDinamicoActivo, setEnvioDinamicoActivo] = useState(false);
  const [destinosEnvio, setDestinosEnvio] = useState<DestinoEnvioOpcion[]>([]);
  const [destinoEnvioId, setDestinoEnvioId] = useState('');
  const [cotizacionLocal, setCotizacionLocal] = useState<CotizacionEnvioLocal | null>(null);
  const [cotizandoLocal, setCotizandoLocal] = useState(false);
  const [tarifaEnvioId, setTarifaEnvioId] = useState('');
  // Al crear el pedido vaciamos el carrito, lo que hace que items.length caiga
  // a 0 mientras el router.push todavía está resolviendo la navegación. Sin
  // este flag, el efecto de abajo alcanza a mandar de vuelta a /tienda/carrito
  // (carrito vacío) antes de que termine de navegar al detalle del pedido.
  const [pedidoCreado, setPedidoCreado] = useState(false);

  // Cupón de código, opcional (ver /dashboard/cupones — solo aplica a los
  // productos específicos que el admin eligió). Se valida aquí para
  // mostrarle el descuento al cliente antes de confirmar, pero el backend
  // vuelve a validar todo al crear el pedido (POST /tienda/pedidos), así que
  // esta vista previa nunca es la fuente de verdad del monto final.
  const [cuponCodigo, setCuponCodigo] = useState('');
  const [cuponAplicado, setCuponAplicado] = useState<CuponValidado | null>(null);
  const [cuponError, setCuponError] = useState<string | null>(null);
  const [validandoCupon, setValidandoCupon] = useState(false);

  useEffect(() => {
    apiTienda<{ costoEnvio: number; envioDinamicoActivo?: boolean }>('/tienda/configuracion')
      .then((data) => {
        setCostoEnvio(Number(data.costoEnvio) || 0);
        setEnvioDinamicoActivo(Boolean(data.envioDinamicoActivo));
      })
      .catch(() => setCostoEnvio(0));
  }, []);

  // Catálogo de destinos dentro de Oaxaca — solo hace falta pedirlo si el
  // flag está prendido; si no, ni se llama.
  useEffect(() => {
    if (!envioDinamicoActivo) return;
    apiTienda<DestinoEnvioOpcion[]>('/tienda/envios/destinos')
      .then(setDestinosEnvio)
      .catch(() => setDestinosEnvio([]));
  }, [envioDinamicoActivo]);

  // Si el cliente cambia de estado (o borra el destino elegido), se limpia
  // la selección de envío local para no mandar un tarifaEnvioId que ya no
  // corresponde a lo que escribió.
  const dentroDeOaxaca = envioDinamicoActivo && estadoMx.trim().toLowerCase().includes('oaxaca');
  useEffect(() => {
    if (!dentroDeOaxaca) {
      setDestinoEnvioId('');
      setCotizacionLocal(null);
      setTarifaEnvioId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dentroDeOaxaca]);

  // Al elegir un destino, cotiza las opciones de envío local conocidas
  // hacia ahí (ver GET /tienda/envios/cotizar) — el cliente elige una antes
  // de pagar.
  useEffect(() => {
    setTarifaEnvioId('');
    if (!destinoEnvioId) {
      setCotizacionLocal(null);
      return;
    }
    setCotizandoLocal(true);
    apiTienda<CotizacionEnvioLocal>(`/tienda/envios/cotizar?destinoId=${destinoEnvioId}`)
      .then(setCotizacionLocal)
      .catch(() => setCotizacionLocal(null))
      .finally(() => setCotizandoLocal(false));
  }, [destinoEnvioId]);

  // Costo de envío que se le muestra al cliente: el de la opción de envío
  // local elegida si hay una, o el fijo de siempre.
  const opcionElegida = cotizacionLocal?.opciones.find((o) => String(o.tarifaId) === tarifaEnvioId) || null;
  const costoEnvioMostrado = opcionElegida ? Number(opcionElegida.precioCliente) : costoEnvio;

  useEffect(() => {
    if (cargando || pedidoCreado) return;
    if (!cliente) {
      router.replace('/tienda/login?siguiente=/tienda/checkout');
      return;
    }
    if (items.length === 0) {
      router.replace('/tienda/carrito');
    }
  }, [cargando, cliente, items.length, router, pedidoCreado]);

  if (cargando || !cliente || (items.length === 0 && !pedidoCreado)) return null;

  async function aplicarCupon() {
    if (!cuponCodigo.trim()) return;
    setValidandoCupon(true);
    setCuponError(null);
    try {
      const resultado = await apiTienda<{ codigo: string; montoDescuento: number }>('/tienda/cupones/validar', {
        method: 'POST',
        body: JSON.stringify({
          codigo: cuponCodigo.trim(),
          items: items.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad })),
        }),
      });
      setCuponAplicado({ codigo: resultado.codigo, montoDescuento: resultado.montoDescuento });
    } catch (err) {
      setCuponAplicado(null);
      setCuponError(err instanceof ApiError ? err.message : 'No se pudo aplicar el cupón.');
    } finally {
      setValidandoCupon(false);
    }
  }

  function quitarCupon() {
    setCuponAplicado(null);
    setCuponCodigo('');
    setCuponError(null);
  }

  async function confirmarPedido(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const pedido = await apiTienda<PedidoCreado>('/tienda/pedidos', {
        method: 'POST',
        body: JSON.stringify({
          destinatario,
          telefonoContacto,
          calle,
          numeroExt,
          numeroInt: numeroInt || undefined,
          colonia,
          municipio,
          estadoMx,
          codigoPostal,
          referencias: referencias || undefined,
          notas: notas || undefined,
          items: items.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad })),
          cuponCodigo: cuponAplicado ? cuponAplicado.codigo : undefined,
          tarifaEnvioId: tarifaEnvioId ? Number(tarifaEnvioId) : undefined,
        }),
      });
      setPedidoCreado(true);
      vaciar();
      router.push(`/tienda/pedidos/${pedido.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el pedido.');
      setEnviando(false);
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[1.3fr_1fr] md:gap-12">
      <div className="order-2 md:order-1">
        <h1 className="mb-6 text-2xl font-extrabold uppercase tracking-tight">Dirección de envío</h1>

        <form onSubmit={confirmarPedido} className="space-y-4">
          <div>
            <label className={labelClase}>Nombre de quien recibe</label>
            <input required value={destinatario} onChange={(e) => setDestinatario(e.target.value)} className={campoClase} />
          </div>

          <div>
            <label className={labelClase}>Teléfono de contacto</label>
            <input
              required
              value={telefonoContacto}
              onChange={(e) => setTelefonoContacto(e.target.value)}
              className={campoClase}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClase}>Calle</label>
              <input required value={calle} onChange={(e) => setCalle(e.target.value)} className={campoClase} />
            </div>
            <div>
              <label className={labelClase}>No. ext</label>
              <input required value={numeroExt} onChange={(e) => setNumeroExt(e.target.value)} className={campoClase} />
            </div>
            <div>
              <label className={labelClase}>No. int</label>
              <input value={numeroInt} onChange={(e) => setNumeroInt(e.target.value)} className={campoClase} />
            </div>
          </div>

          <div>
            <label className={labelClase}>Colonia</label>
            <input required value={colonia} onChange={(e) => setColonia(e.target.value)} className={campoClase} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClase}>Municipio/Ciudad</label>
              <input required value={municipio} onChange={(e) => setMunicipio(e.target.value)} className={campoClase} />
            </div>
            <div>
              <label className={labelClase}>Estado</label>
              <input required value={estadoMx} onChange={(e) => setEstadoMx(e.target.value)} className={campoClase} />
            </div>
            <div>
              <label className={labelClase}>Código postal</label>
              <input required value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} className={campoClase} />
            </div>
          </div>

          {dentroDeOaxaca && (
            <div className="rounded-lg border border-border p-4">
              <label className={labelClase}>Destino de envío dentro de Oaxaca</label>
              <select
                value={destinoEnvioId}
                onChange={(e) => setDestinoEnvioId(e.target.value)}
                className={campoClase}
              >
                <option value="">Selecciona el destino más cercano a tu domicilio</option>
                {destinosEnvio.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre} ({d.municipio})
                  </option>
                ))}
              </select>

              {destinoEnvioId && (
                <div className="mt-3">
                  {cotizandoLocal ? (
                    <p className="text-xs text-muted-foreground">Buscando opciones de envío…</p>
                  ) : !cotizacionLocal || cotizacionLocal.opciones.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Todavía no tenemos una tarifa conocida para ese destino — se te cobrará el envío estándar y
                      te contactaremos para confirmar cómo hacértelo llegar.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {cotizacionLocal.opciones.map((op) => (
                        <label
                          key={op.tarifaId}
                          className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm"
                        >
                          <input
                            type="radio"
                            name="tarifaEnvioLocal"
                            className="mt-1"
                            checked={tarifaEnvioId === String(op.tarifaId)}
                            onChange={() => setTarifaEnvioId(String(op.tarifaId))}
                          />
                          <span>
                            <strong>{op.transportista.nombre}</strong> — ${Number(op.precioCliente).toFixed(2)}
                            {op.tipoEntrega === 'PUNTO_RECOLECCION' && op.puntoEntrega && (
                              <span className="mt-1 block text-xs font-medium text-destructive">
                                Este envío no llega a tu domicilio: lo recoges en {op.puntoEntrega.nombre}
                                {op.puntoEntrega.direccion ? ` — ${op.puntoEntrega.direccion}` : ''}.
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className={labelClase}>Referencias (opcional)</label>
            <input
              value={referencias}
              onChange={(e) => setReferencias(e.target.value)}
              placeholder="Entre calles, color de la casa, etc."
              className={campoClase}
            />
          </div>

          <div>
            <label className={labelClase}>Notas para tu pedido (opcional)</label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} className={campoClase} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button type="submit" className={`${claseBotonPrimario} w-full`} disabled={enviando}>
            {enviando ? 'Creando pedido...' : 'Confirmar pedido y ver forma de pago'}
          </button>
        </form>
      </div>

      <div className="order-1 h-fit rounded-2xl bg-secondary/60 p-5 md:order-2">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide">Resumen</h2>
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.varianteId} className="flex justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {i.nombre} {i.talla || i.color ? `(${[i.talla, i.color].filter(Boolean).join(' / ')})` : ''} × {i.cantidad}
              </span>
              <span className="whitespace-nowrap font-semibold">${(i.precioVenta * i.cantidad).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-border pt-4">
          {cuponAplicado ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Cupón <strong className="text-foreground">{cuponAplicado.codigo}</strong> aplicado
              </span>
              <button type="button" onClick={quitarCupon} className="text-xs font-medium underline-offset-4 hover:underline">
                Quitar
              </button>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input
                  value={cuponCodigo}
                  onChange={(e) => setCuponCodigo(e.target.value.toUpperCase())}
                  placeholder="Código de cupón"
                  className={`${campoClase} flex-1`}
                />
                <button
                  type="button"
                  onClick={aplicarCupon}
                  disabled={validandoCupon || !cuponCodigo.trim()}
                  className="rounded-lg border border-border px-4 text-sm font-semibold"
                >
                  {validandoCupon ? '...' : 'Aplicar'}
                </button>
              </div>
              {cuponError && <p className="mt-1.5 text-xs text-destructive">{cuponError}</p>}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Envío</span>
            <span>{costoEnvioMostrado > 0 ? `$${costoEnvioMostrado.toFixed(2)}` : 'Gratis'}</span>
          </div>
          {cuponAplicado && cuponAplicado.montoDescuento > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Cupón</span>
              <span>-${cuponAplicado.montoDescuento.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1.5 text-base font-bold text-foreground">
            <span>Total</span>
            <span>${(total + costoEnvioMostrado - (cuponAplicado?.montoDescuento || 0)).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
