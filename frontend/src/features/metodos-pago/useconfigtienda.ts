// Sub-hook: bloque "Configuración de la tienda en línea" (WhatsApp + costo
// de envío + toggle envío dinámico). Orquesta 3 guardados independientes,
// tal como el original.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { actualizarConfigTienda, obtenerConfigTienda } from './api';
import { validarCostoEnvio } from './utils';

export interface UseConfigTiendaReturn {
  cargando: boolean;

  // WhatsApp (número + phone number ID, guardados juntos)
  numero: string;
  setNumero: (v: string) => void;
  phoneNumberId: string;
  setPhoneNumberId: (v: string) => void;
  numeroGuardado: string;
  phoneNumberIdGuardado: string;
  guardandoNumero: boolean;
  mensajeNumero: string | null;
  guardarWhatsapp: () => Promise<void>;

  // Costo de envío fijo
  costoEnvio: string;
  setCostoEnvio: (v: string) => void;
  costoEnvioGuardado: string;
  guardandoEnvio: boolean;
  mensajeEnvio: string | null;
  guardarCostoEnvio: () => Promise<void>;

  // Toggle envío dinámico
  envioDinamico: boolean;
  guardandoEnvioDinamico: boolean;
  mensajeEnvioDinamico: string | null;
  cambiarEnvioDinamico: (valor: boolean) => Promise<void>;
}

export function useConfigTienda(enabled: boolean = true): UseConfigTiendaReturn {
  const [cargando, setCargando] = useState(true);

  const [numero, setNumero] = useState('');
  const [numeroGuardado, setNumeroGuardado] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [phoneNumberIdGuardado, setPhoneNumberIdGuardado] = useState('');
  const [guardandoNumero, setGuardandoNumero] = useState(false);
  const [mensajeNumero, setMensajeNumero] = useState<string | null>(null);

  const [costoEnvio, setCostoEnvio] = useState('0');
  const [costoEnvioGuardado, setCostoEnvioGuardado] = useState('0');
  const [guardandoEnvio, setGuardandoEnvio] = useState(false);
  const [mensajeEnvio, setMensajeEnvio] = useState<string | null>(null);

  const [envioDinamico, setEnvioDinamico] = useState(false);
  const [guardandoEnvioDinamico, setGuardandoEnvioDinamico] = useState(false);
  const [mensajeEnvioDinamico, setMensajeEnvioDinamico] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCargando(false);
      return;
    }
    obtenerConfigTienda()
      .then((data) => {
        setNumero(data.whatsappTienda ?? '');
        setNumeroGuardado(data.whatsappTienda ?? '');
        setPhoneNumberId(data.whatsappPhoneNumberId ?? '');
        setPhoneNumberIdGuardado(data.whatsappPhoneNumberId ?? '');
        const costoStr = String(data.costoEnvio ?? '0');
        setCostoEnvio(costoStr);
        setCostoEnvioGuardado(costoStr);
        setEnvioDinamico(Boolean(data.envioDinamicoActivo));
      })
      .finally(() => setCargando(false));
  }, [enabled]);

  const guardarWhatsapp = useCallback(async () => {
    setGuardandoNumero(true);
    setMensajeNumero(null);
    try {
      await actualizarConfigTienda({
        whatsappTienda: numero || null,
        whatsappPhoneNumberId: phoneNumberId || null,
      });
      setNumeroGuardado(numero);
      setPhoneNumberIdGuardado(phoneNumberId);
      setMensajeNumero('Guardado.');
    } catch (err) {
      setMensajeNumero(err instanceof ApiError ? err.message : 'Error al guardar.');
    } finally {
      setGuardandoNumero(false);
    }
  }, [numero, phoneNumberId]);

  const guardarCostoEnvio = useCallback(async () => {
    const validacion = validarCostoEnvio(costoEnvio);
    if (!validacion.ok) {
      setMensajeEnvio(validacion.error);
      return;
    }
    setGuardandoEnvio(true);
    setMensajeEnvio(null);
    try {
      await actualizarConfigTienda({ costoEnvio: validacion.monto });
      setCostoEnvioGuardado(costoEnvio);
      setMensajeEnvio('Guardado.');
    } catch (err) {
      setMensajeEnvio(err instanceof ApiError ? err.message : 'Error al guardar.');
    } finally {
      setGuardandoEnvio(false);
    }
  }, [costoEnvio]);

  const cambiarEnvioDinamico = useCallback(async (valor: boolean) => {
    setGuardandoEnvioDinamico(true);
    setMensajeEnvioDinamico(null);
    try {
      await actualizarConfigTienda({ envioDinamicoActivo: valor });
      setEnvioDinamico(valor);
    } catch (err) {
      setMensajeEnvioDinamico(err instanceof ApiError ? err.message : 'Error al guardar.');
    } finally {
      setGuardandoEnvioDinamico(false);
    }
  }, []);

  return {
    cargando,
    numero,
    setNumero,
    phoneNumberId,
    setPhoneNumberId,
    numeroGuardado,
    phoneNumberIdGuardado,
    guardandoNumero,
    mensajeNumero,
    guardarWhatsapp,
    costoEnvio,
    setCostoEnvio,
    costoEnvioGuardado,
    guardandoEnvio,
    mensajeEnvio,
    guardarCostoEnvio,
    envioDinamico,
    guardandoEnvioDinamico,
    mensajeEnvioDinamico,
    cambiarEnvioDinamico,
  };
}