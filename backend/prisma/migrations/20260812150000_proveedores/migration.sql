-- Proveedores: catálogo de proveedores, proveedor por variante/movimiento,
-- y pagos que el negocio les hace.

-- ============================================================================
-- 1. Catálogo de proveedores
-- ============================================================================

CREATE TABLE "proveedores" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "telefono" TEXT,
    "banco" TEXT,
    "titular" TEXT,
    "numero_cuenta" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- 2. Proveedor "por defecto" de cada variante
-- ============================================================================

ALTER TABLE "producto_variantes" ADD COLUMN "proveedor_id" INTEGER;
ALTER TABLE "producto_variantes" ADD CONSTRAINT "producto_variantes_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 3. Proveedor real de cada movimiento de inventario (típicamente ENTRADA)
-- ============================================================================

ALTER TABLE "movimientos_inventario" ADD COLUMN "proveedor_id" INTEGER;
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 4. Pagos a proveedores
-- ============================================================================

CREATE TABLE "pagos_proveedor" (
    "id" SERIAL NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL DEFAULT 'EFECTIVO',
    "comprobante_url" TEXT,
    "comprobante_public_id" TEXT,
    "concepto" TEXT,
    "registrado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_proveedor_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pagos_proveedor" ADD CONSTRAINT "pagos_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pagos_proveedor" ADD CONSTRAINT "pagos_proveedor_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
