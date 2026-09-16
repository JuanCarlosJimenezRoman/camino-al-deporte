'use client';

interface Props {
  url: string;
  onClose: () => void;
}

export function FotoLightbox({ url, onClose }: Props) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        cursor: 'pointer',
      }}
    >
      <img
        src={url}
        alt="Foto del paquete recibido"
        style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }}
      />
    </div>
  );
}