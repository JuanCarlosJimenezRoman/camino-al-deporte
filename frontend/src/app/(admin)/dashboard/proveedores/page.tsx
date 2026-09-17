'use client';

import { ProveedorForm, ProveedoresTabla } from '@/features/proveedores';
import { useProveedores } from '@/features/proveedores/useproveedores';

export default function ProveedoresPage() {
  const {
    proveedores,
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
  } = useProveedores();

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

      {mensaje && !mostrarForm && <p style={{ fontSize: 13, marginBottom: 16 }}>{mensaje}</p>}

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
