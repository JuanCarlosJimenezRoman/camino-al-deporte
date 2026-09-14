-- Pago mixto en el punto de venta: una venta puede cobrarse combinando dos
-- métodos de pago (ej. parte en efectivo, parte con tarjeta). Las ventas
-- existentes quedan igual (pago_mixto = false, sin filas en venta_pagos).

ALTER TABLE "ventas" ADD COLUMN "pago_mixto" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "venta_pagos" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "cuenta_transferencia_id" INTEGER,
    "comprobante_url" TEXT,
    "comprobante_public_id" TEXT,
    "efectivo_recibido" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venta_pagos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "venta_pagos" ADD CONSTRAINT "venta_pagos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "venta_pagos" ADD CONSTRAINT "venta_pagos_cuenta_transferencia_id_fkey" FOREIGN KEY ("cuenta_transferencia_id") REFERENCES "cuentas_transferencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
