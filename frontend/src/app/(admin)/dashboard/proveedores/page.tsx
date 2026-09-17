'use client';

import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuth, puedeVer } from '@/lib/auth';
import { ProveedorForm, ProveedoresTabla } from '@/features/proveedores';
import { useProveedores } from '@/features/proveedores/useproveedores';

export default function ProveedoresPage() {
  const { usuario } = useAuth();
  const puedeAcceder = puedeVer('proveedores', usuario?.rol);

  const {
    proveedores,
    cargando,
    expandidoId,
    detalle,
    cargandoDetalle,
    toggleExpandir,
    mostrarForm,
    editandoId,
    form,
    setForm,
    abrirNuevo,
    abrirEdicion,
    cerrarForm,
    guardar,
    guardando,
    toggleActivo,
    registrarPago,
    mensaje,
    limpiarMensaje,
  } = useProveedores();

  if (!puedeAcceder) {
    return <EmptyState icon={Lock} title="Sin acceso" description="No tienes permiso para ver esta sección." />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Proveedores</h1>
        <button className="btn" onClick={() => (mostrarForm ? cerrarForm() : abrirNuevo())}>
          {mostrarForm ? 'Cerrar' : '+ Nuevo proveedor'}
        </button>
      </div>

      <p style={{ color: 'var(--color-muted)', marginBottom: 16, fontSize: 14 }}>
        Cada variante (talla/color) de un producto puede tener su propio proveedor asignado — útil cuando el
        mismo modelo lo surten distintos proveedores según el número. Al registrar una entrada de inventario
        también puedes indicar de qué proveedor vino ese lote.
      </p>

      {mensaje && !mostrarForm && (
        <p style={{ fontSize: 13, marginBottom: 16 }}>
          {mensaje}{' '}
          <button
            onClick={limpiarMensaje}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-muted)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Cerrar
          </button>
        </p>
      )}

      {mostrarForm && (
        <ProveedorForm
          editando={editandoId !== null}
          form={form}
          guardando={guardando}
          mensaje={mensaje}
          onChange={setForm}
          onGuardar={guardar}
        />
      )}

      <ProveedoresTabla
        proveedores={proveedores}
        cargando={cargando}
        expandidoId={expandidoId}
        detalle={detalle}
        cargandoDetalle={cargandoDetalle}
        onToggleExpandir={toggleExpandir}
        onEditar={abrirEdicion}
        onToggleActivo={toggleActivo}
        onPagoRegistrado={registrarPago}
      />
    </div>
  );
}
