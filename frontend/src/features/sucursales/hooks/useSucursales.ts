'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  actualizarWhatsappSucursal,
  crearSucursal,
  listarSucursales,
  obtenerExistenciasSucursal,
} from '../api';
import type { ExistenciaDetalle, NuevaSucursalInput, Sucursal } from '../types';

// Orquesta la pantalla de Sucursales: carga el catálogo de sucursales y las
// existencias de la seleccionada, y expone las acciones (crear sucursal,
// guardar su WhatsApp) para que la página y sus componentes de UI no
// necesiten saber nada de la API.
export function useSucursales() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [existencias, setExistencias] = useState<ExistenciaDetalle[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Edición del WhatsApp de la sucursal seleccionada (independiente del
  // formulario de "nueva sucursal").
  const [telefonoEdicion, setTelefonoEdicion] = useState('');
  const [phoneNumberIdEdicion, setPhoneNumberIdEdicion] = useState('');
  const [guardandoTelefono, setGuardandoTelefono] = useState(false);
  const [mensajeTelefono, setMensajeTelefono] = useState<string | null>(null);

  async function cargarSucursales() {
    const data = await listarSucursales();
    setSucursales(data);
    if (!seleccionada && data.length > 0) setSeleccionada(data[0].id);
  }

  useEffect(() => {
    cargarSucursales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!seleccionada) return;
    obtenerExistenciasSucursal(seleccionada).then((data) => setExistencias(data.existencias));
  }, [seleccionada]);

  // Al cambiar de sucursal seleccionada, refleja su WhatsApp actual en el
  // campo de edición.
  useEffect(() => {
    const s = sucursales.find((s) => s.id === seleccionada);
    setTelefonoEdicion(s?.telefono || '');
    setPhoneNumberIdEdicion(s?.whatsappPhoneNumberId || '');
    setMensajeTelefono(null);
  }, [seleccionada, sucursales]);

  async function crear(data: NuevaSucursalInput) {
    try {
      await crearSucursal(data);
      setMensaje('Sucursal creada.');
      await cargarSucursales();
      return true;
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear la sucursal.');
      return false;
    }
  }

  async function guardarTelefono() {
    if (!seleccionada) return;
    setGuardandoTelefono(true);
    setMensajeTelefono(null);
    try {
      await actualizarWhatsappSucursal(seleccionada, {
        telefono: telefonoEdicion || null,
        whatsappPhoneNumberId: phoneNumberIdEdicion || null,
      });
      setMensajeTelefono('WhatsApp de la sucursal actualizado.');
      cargarSucursales();
    } catch (err) {
      setMensajeTelefono(err instanceof ApiError ? err.message : 'Error al actualizar el WhatsApp.');
    } finally {
      setGuardandoTelefono(false);
    }
  }

  return {
    esAdmin,
    sucursales,
    seleccionada,
    setSeleccionada,
    existencias,
    mensaje,
    crear,
    telefonoEdicion,
    setTelefonoEdicion,
    phoneNumberIdEdicion,
    setPhoneNumberIdEdicion,
    guardandoTelefono,
    mensajeTelefono,
    guardarTelefono,
  };
}
