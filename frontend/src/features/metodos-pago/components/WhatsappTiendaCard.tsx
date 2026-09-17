// Vista: bloque "Configuración de la tienda en línea".
// Recibe el sub-hook ya resuelto por props (no conoce el API).

'use client';

import type { UseConfigTiendaReturn } from '../useconfigtienda';
import { costoEnvioSinCambios, whatsappSinCambios } from '../utils';

interface Props {
  config: UseConfigTiendaReturn;
}

export function WhatsappTiendaCard({ config }: Props) {
  return (
    <div className="card">
      <h2 style={{ fontSize: 15, marginBottom: 4 }}>Configuración de la tienda en línea</h2>

      {config.cargando ? (
        <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Cargando...</p>
      ) : (
        <>
          <p style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 12, marginBottom: 8 }}>
            <strong>WhatsApp de la tienda</strong> — a dónde llega el mensaje del cliente al continuar con el pago
            de su pedido. Todos los pedidos en línea usan siempre este número, ya no se reparte por proveedor.
            Incluye código de país si no es México (ej. 5216441234567).
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <input
              placeholder="Ej. 6441234567"
              value={config.numero}
              onChange={(e) => config.setNumero(e.target.value)}
              style={{ maxWidth: 220 }}
            />
          </div>

          <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 8 }}>
            <strong>WhatsApp Cloud API — Phone Number ID (opcional, técnico)</strong> — respaldo general para el
            ticket digital automático cuando una sucursal no tiene uno propio (ver Sucursales). Solo si ya
            conectaste este número a WhatsApp Business Platform en Meta Business Manager; no es el número de
            arriba, es el &quot;Phone Number ID&quot; que da Meta.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <input
              placeholder="Ej. 109876543212345"
              value={config.phoneNumberId}
              onChange={(e) => config.setPhoneNumberId(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <button
              className="btn"
              onClick={config.guardarWhatsapp}
              disabled={
                config.guardandoNumero ||
                whatsappSinCambios(
                  config.numero,
                  config.numeroGuardado,
                  config.phoneNumberId,
                  config.phoneNumberIdGuardado
                )
              }
            >
              {config.guardandoNumero ? 'Guardando...' : 'Guardar'}
            </button>
            {config.mensajeNumero && <span style={{ fontSize: 13 }}>{config.mensajeNumero}</span>}
          </div>

          <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 8, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
            <strong>Costo de envío</strong> — monto fijo que se suma al total de cada pedido nuevo en la tienda en
            línea. Por ahora es el mismo para todos los pedidos (más adelante se podrá variar por zona/peso).
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="Ej. 150"
              value={config.costoEnvio}
              onChange={(e) => config.setCostoEnvio(e.target.value)}
              style={{ maxWidth: 140 }}
            />
            <button
              className="btn"
              onClick={config.guardarCostoEnvio}
              disabled={config.guardandoEnvio || costoEnvioSinCambios(config.costoEnvio, config.costoEnvioGuardado)}
            >
              {config.guardandoEnvio ? 'Guardando...' : 'Guardar'}
            </button>
            {config.mensajeEnvio && <span style={{ fontSize: 13 }}>{config.mensajeEnvio}</span>}
          </div>

          <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 8, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
            <strong>Envío dinámico dentro de Oaxaca</strong> — con esto prendido, el checkout le ofrece al cliente
            elegir su destino dentro de Oaxaca y cotiza contra el catálogo de rutas/cobertura/tarifas (ver{' '}
            <a href="/dashboard/envios">Envíos</a>) en vez de cobrar siempre el monto fijo de arriba. Si el destino
            todavía no tiene cobertura cargada, cae de vuelta al monto fijo automáticamente — nunca bloquea la
            compra.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={config.envioDinamico}
                onChange={(e) => config.cambiarEnvioDinamico(e.target.checked)}
                disabled={config.guardandoEnvioDinamico}
              />
              {config.envioDinamico ? 'Activado' : 'Desactivado'}
            </label>
            {config.guardandoEnvioDinamico && (
              <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>Guardando...</span>
            )}
            {config.mensajeEnvioDinamico && (
              <span style={{ fontSize: 13, color: 'var(--color-danger)' }}>{config.mensajeEnvioDinamico}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}