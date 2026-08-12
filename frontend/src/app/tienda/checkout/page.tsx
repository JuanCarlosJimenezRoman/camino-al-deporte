'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthCliente } from '@/lib/authCliente';
import { useCarrito } from '@/lib/carrito';
import { apiTienda, ApiError } from '@/lib/apiTienda';
import { claseBotonPrimario } from '@/components/tienda/ui';

interface PedidoCreado {
  id: number;
  folio: string;
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
  // Al crear el pedido vaciamos el carrito, lo que hace que items.length caiga
  // a 0 mientras el router.push todavía está resolviendo la navegación. Sin
  // este flag, el efecto de abajo alcanza a mandar de vuelta a /tienda/carrito
  // (carrito vacío) antes de que termine de navegar al detalle del pedido.
  const [pedidoCreado, setPedidoCreado] = useState(false);

  useEffect(() => {
    apiTienda<{ costoEnvio: number }>('/tienda/configuracion')
      .then((data) => setCostoEnvio(Number(data.costoEnvio) || 0))
      .catch(() => setCostoEnvio(0));
  }, []);

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
        <div className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Envío</span>
            <span>{costoEnvio > 0 ? `$${costoEnvio.toFixed(2)}` : 'Gratis'}</span>
          </div>
          <div className="flex justify-between pt-1.5 text-base font-bold text-foreground">
            <span>Total</span>
            <span>${(total + costoEnvio).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
