-- El rol INVENTARIO ya no puede desactivar catálogos (marca/categoría/
-- modelo/talla) ni editar o desactivar proveedores directamente: esas
-- acciones quedan pendientes de aprobación de ADMIN_PRINCIPAL/DESARROLLO.

-- ============================================================================
-- 1. Tallas: ahora se pueden desactivar igual que marcas/categorías/modelos.
-- ============================================================================

ALTER TABLE "tallas" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;

-- ============================================================================
-- 2. Solicitudes de permiso
-- ============================================================================

CREATE TYPE "TipoSolicitud" AS ENUM ('MARCA', 'CATEGORIA', 'MODELO', 'TALLA', 'PROVEEDOR');
CREATE TYPE "AccionSolicitud" AS ENUM ('EDITAR', 'DESACTIVAR');
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

CREATE TABLE "solicitudes_permiso" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoSolicitud" NOT NULL,
    "accion" "AccionSolicitud" NOT NULL,
    "entidad_id" INTEGER NOT NULL,
    "entidad_nombre" TEXT,
    "datos_cambio" JSONB,
    "motivo" TEXT,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "solicitado_por_id" INTEGER NOT NULL,
    "solicitado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisado_por_id" INTEGER,
    "revisado_at" TIMESTAMP(3),
    "nota_revision" TEXT,

    CONSTRAINT "solicitudes_permiso_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "solicitudes_permiso" ADD CONSTRAINT "solicitudes_permiso_solicitado_por_id_fkey" FOREIGN KEY ("solicitado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "solicitudes_permiso" ADD CONSTRAINT "solicitudes_permiso_revisado_por_id_fkey" FOREIGN KEY ("revisado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
