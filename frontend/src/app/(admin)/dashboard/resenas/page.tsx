'use client';

import { useResenas } from '@/features/resenas/useResenas';
import { promedioCalificacionEnvio, promedioCalificacionProducto } from '@/features/resenas/utils';
import { ResenasResumen } from '@/features/resenas/components/ResenasResumen';
import { ResenaCard } from '@/features/resenas/components/ResenaCard';
import { FotoLightbox } from '@/features/resenas/components/FotoLightbox';

export default function ResenasPage() {
  const { resenas, error, fotoAbierta, abrirFoto, cerrarFoto, alternarVisibilidad } = useResenas();

  if (error) return <p style={{ color: 'var(--color-danger)' }}>{error}</p>;

  const promedioProducto = resenas ? promedioCalificacionProducto(resenas) : 0;
  const promedioEnvio = resenas ? promedioCalificacionEnvio(resenas) : 0;

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Reseñas de clientes</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 16, fontSize: 14 }}>
        Calificaciones y fotos que los clientes dejan después de recibir su pedido en la tienda en línea. Por
        default se muestran como testimonio en la tienda (con solo el primer nombre del cliente, sin teléfono);
        puedes ocultar cualquiera puntual sin borrarla.
      </p>

      {resenas === null && <p style={{ color: 'var(--color-muted)' }}>Cargando...</p>}

      {resenas && resenas.length === 0 && (
        <p style={{ color: 'var(--color-muted)' }}>Todavía no hay reseñas de clientes.</p>
      )}

      {resenas && resenas.length > 0 && (
        <>
          <ResenasResumen promedioProducto={promedioProducto} promedioEnvio={promedioEnvio} />
          {resenas.map((r) => (
            <ResenaCard
              key={r.id}
              resena={r}
              onAlternarVisibilidad={alternarVisibilidad}
              onAbrirFoto={abrirFoto}
            />
          ))}
        </>
      )}

      {fotoAbierta && <FotoLightbox url={fotoAbierta} onClose={cerrarFoto} />}
    </div>
  );
}