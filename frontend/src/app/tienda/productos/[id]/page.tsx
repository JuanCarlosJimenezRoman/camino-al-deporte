'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiTienda, ApiError } from '@/lib/apiTienda';
import { useCarrito } from '@/lib/carrito';

interface Variante {
  id: number;
  sku: string;
  color: string | null;
  talla: { valor: string } | null;
  stockTotal: number;
}

interface ProductoDetalle {
  id: number;
  nombre: string;
  descripcion: string | null;
  marca: { nombre: string } | null;
  categoria: { nombre: string } | null;
  precioVenta: string;
  imagenes: { url: string }[];
  variantes: Variante[];
  stockTotal: number;
}

export default function ProductoDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { agregar } = useCarrito();

  const [producto, setProducto] = useState<ProductoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [varianteId, setVarianteId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [imagenActiva, setImagenActiva] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    apiTienda<ProductoDetalle>(`/tienda/productos/${params.id}`)
      .then((data) => {
        setProducto(data);
        const primeraDisponible = data.variantes.find((v) => v.stockTotal > 0);
        if (primeraDisponible) setVarianteId(String(primeraDisponible.id));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el producto.'));
  }, [params.id]);

  if (error) return <p style={{ color: 'var(--color-danger)' }}>{error}</p>;
  if (!producto) return <p style={{ color: 'var(--color-muted)' }}>Cargando...</p>;

  const variante = producto.variantes.find((v) => String(v.id) === varianteId);

  function agregarAlCarrito() {
    if (!producto || !variante) return;
    agregar(
      {
        varianteId: variante.id,
        productoId: producto.id,
        nombre: producto.nombre,
        talla: variante.talla?.valor,
        color: variante.color,
        sku: variante.sku,
        precioVenta: Number(producto.precioVenta),
        imagenUrl: producto.imagenes?.[0]?.url,
        stockDisponible: variante.stockTotal,
      },
      cantidad
    );
    setMensaje('Agregado al carrito.');
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
      <div>
        <div
          style={{
            width: '100%',
            aspectRatio: '1 / 1',
            borderRadius: 10,
            background: 'var(--color-border)',
            overflow: 'hidden',
            marginBottom: 10,
          }}
        >
          {producto.imagenes?.[imagenActiva] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={producto.imagenes[imagenActiva].url}
              alt={producto.nombre}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </div>
        {producto.imagenes.length > 1 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {producto.imagenes.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.url}
                src={img.url}
                alt=""
                onClick={() => setImagenActiva(i)}
                style={{
                  width: 56,
                  height: 56,
                  objectFit: 'cover',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: i === imagenActiva ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{producto.marca?.nombre}</div>
        <h1 style={{ fontSize: 24, marginBottom: 6 }}>{producto.nombre}</h1>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>${producto.precioVenta}</div>

        {producto.descripcion && <p style={{ color: 'var(--color-muted)', marginBottom: 16 }}>{producto.descripcion}</p>}

        <label style={{ fontSize: 13, fontWeight: 600 }}>Talla / color</label>
        <div style={{ marginBottom: 12, marginTop: 4 }}>
          <select value={varianteId} onChange={(e) => setVarianteId(e.target.value)}>
            <option value="">Selecciona...</option>
            {producto.variantes.map((v) => (
              <option key={v.id} value={v.id} disabled={v.stockTotal === 0}>
                {[v.talla?.valor, v.color].filter(Boolean).join(' / ') || v.sku}
                {v.stockTotal === 0 ? ' (agotado)' : ` — ${v.stockTotal} disponibles`}
              </option>
            ))}
          </select>
        </div>

        <label style={{ fontSize: 13, fontWeight: 600 }}>Cantidad</label>
        <div style={{ marginBottom: 16, marginTop: 4 }}>
          <input
            type="number"
            min={1}
            max={variante?.stockTotal || 1}
            value={cantidad}
            onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
            style={{ width: 100 }}
          />
        </div>

        {mensaje && <p style={{ fontSize: 13, color: 'var(--color-primary-dark)', marginBottom: 10 }}>{mensaje}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={!variante || variante.stockTotal === 0} onClick={agregarAlCarrito}>
            Agregar al carrito
          </button>
          <button
            className="btn-secondary btn"
            disabled={!variante || variante.stockTotal === 0}
            onClick={() => {
              agregarAlCarrito();
              router.push('/tienda/carrito');
            }}
          >
            Comprar ahora
          </button>
        </div>
      </div>
    </div>
  );
}
