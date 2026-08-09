'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthCliente } from '@/lib/authCliente';
import { useCarrito } from '@/lib/carrito';
import { apiTienda, ApiError } from '@/lib/apiTienda';

interface PedidoCreado {
  id: number;
  folio: string;
}

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

  useEffect(() => {
    if (cargando) return;
    if (!cliente) {
      router.replace('/tienda/login?siguiente=/tienda/checkout');
      return;
    }
    if (items.length === 0) {
      router.replace('/tienda/carrito');
    }
  }, [cargando, cliente, items.length, router]);

  if (cargando || !cliente || items.length === 0) return null;

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
      vaciar();
      router.push(`/tienda/pedidos/${pedido.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el pedido.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 32 }}>
      <form onSubmit={confirmarPedido}>
        <h1 style={{ fontSize: 22, marginBottom: 16 }}>Dirección de envío</h1>

        <label style={{ fontSize: 13 }}>Nombre de quien recibe</label>
        <div style={{ marginBottom: 10, marginTop: 4 }}>
          <input required value={destinatario} onChange={(e) => setDestinatario(e.target.value)} />
        </div>

        <label style={{ fontSize: 13 }}>Teléfono de contacto</label>
        <div style={{ marginBottom: 10, marginTop: 4 }}>
          <input required value={telefonoContacto} onChange={(e) => setTelefonoContacto(e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 13 }}>Calle</label>
            <input required value={calle} onChange={(e) => setCalle(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 13 }}>No. ext</label>
            <input required value={numeroExt} onChange={(e) => setNumeroExt(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 13 }}>No. int</label>
            <input value={numeroInt} onChange={(e) => setNumeroInt(e.target.value)} style={{ marginTop: 4 }} />
          </div>
        </div>

        <label style={{ fontSize: 13 }}>Colonia</label>
        <div style={{ marginBottom: 10, marginTop: 4 }}>
          <input required value={colonia} onChange={(e) => setColonia(e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 13 }}>Municipio/Ciudad</label>
            <input required value={municipio} onChange={(e) => setMunicipio(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 13 }}>Estado</label>
            <input required value={estadoMx} onChange={(e) => setEstadoMx(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 13 }}>Código postal</label>
            <input required value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} style={{ marginTop: 4 }} />
          </div>
        </div>

        <label style={{ fontSize: 13 }}>Referencias (opcional)</label>
        <div style={{ marginBottom: 10, marginTop: 4 }}>
          <input value={referencias} onChange={(e) => setReferencias(e.target.value)} placeholder="Entre calles, color de la casa, etc." />
        </div>

        <label style={{ fontSize: 13 }}>Notas para tu pedido (opcional)</label>
        <div style={{ marginBottom: 16, marginTop: 4 }}>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <button type="submit" className="btn" disabled={enviando}>
          {enviando ? 'Creando pedido...' : 'Confirmar pedido y ver forma de pago'}
        </button>
      </form>

      <div className="card" style={{ height: 'fit-content' }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Resumen</h2>
        {items.map((i) => (
          <div key={i.varianteId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span>
              {i.nombre} {i.talla || i.color ? `(${[i.talla, i.color].filter(Boolean).join(' / ')})` : ''} × {i.cantidad}
            </span>
            <span>${(i.precioVenta * i.cantidad).toFixed(2)}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
