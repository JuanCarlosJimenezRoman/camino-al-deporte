'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import { useConfigNegocio } from '@/lib/configNegocio';
import { toast } from '@/components/ui/use-toast';
import {
  generarVistaPreviaTicket,
  guardarConfiguracionTicket,
  guardarIdentidad,
  obtenerConfiguracionTienda,
  quitarLogo,
  subirLogo,
} from './api';
import { derivarIniciales } from './utils';

export function useConfiguracion() {
  const { usuario } = useAuth();
  const { config, cargando: cargandoMarca } = useConfigNegocio();

  const puedeEditar = puedeVer('configuracion', usuario?.rol);

  const [nombre, setNombre] = useState(config.nombre);
  const [iniciales, setIniciales] = useState(config.iniciales);
  const [logoUrl, setLogoUrl] = useState<string | null>(config.logoUrl);

  const [mensajeTicketPie, setMensajeTicketPie] = useState('');
  const [mostrarCodigoBarrasTicket, setMostrarCodigoBarrasTicket] =
    useState(true);
  const [mostrarVendedorTicket, setMostrarVendedorTicket] = useState(true);
  const [mostrarSucursalTicket, setMostrarSucursalTicket] = useState(true);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardandoTicket, setGuardandoTicket] = useState(false);
  const [generandoVistaPrevia, setGenerandoVistaPrevia] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [quitando, setQuitando] = useState(false);

  useEffect(() => {
    obtenerConfiguracionTienda()
      .then((data) => {
        setNombre(data.nombreNegocio || 'Camino al Deporte');
        setIniciales(data.iniciales || 'CD');
        setLogoUrl(data.logoTicketUrl || null);
        setMensajeTicketPie(data.mensajeTicketPie || '');
        setMostrarCodigoBarrasTicket(
          data.mostrarCodigoBarrasTicket ?? true,
        );
        setMostrarVendedorTicket(data.mostrarVendedorTicket ?? true);
        setMostrarSucursalTicket(data.mostrarSucursalTicket ?? true);
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  function cambiarNombre(valor: string) {
    setNombre(valor);
    setIniciales(derivarIniciales(valor));
  }

  async function handleGuardarIdentidad() {
    if (!nombre.trim()) {
      toast({
        title: 'El nombre no puede quedar vacío',
        variant: 'destructive',
      });
      return;
    }

    setGuardando(true);

    try {
      await guardarIdentidad({
        nombreNegocio: nombre.trim(),
        iniciales:
          iniciales.trim() || derivarIniciales(nombre),
      });

      toast({
        title: 'Identidad guardada',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description:
          err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setGuardando(false);
    }
  }

  async function handleSubirLogo(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const archivo = event.target.files?.[0];

    if (!archivo) return;

    setSubiendo(true);

    try {
      const response = await subirLogo(archivo);

      setLogoUrl(response.logoTicketUrl || null);

      toast({
        title: 'Logo guardado',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'No se pudo subir el logo',
        description:
          err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSubiendo(false);
      event.target.value = '';
    }
  }

  async function handleQuitarLogo() {
    setQuitando(true);

    try {
      await quitarLogo();

      setLogoUrl(null);

      toast({
        title: 'Logo quitado',
        description:
          'El ticket volverá a mostrar las iniciales.',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'No se pudo quitar el logo',
        description:
          err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setQuitando(false);
    }
  }

  async function handlePrevisualizarTicket() {
    setGenerandoVistaPrevia(true);

    try {
      const blob = await generarVistaPreviaTicket({
        nombreNegocio: nombre.trim() || undefined,
        iniciales: iniciales.trim() || undefined,
        mensajeTicketPie: mensajeTicketPie.trim() || null,
        mostrarCodigoBarrasTicket,
        mostrarVendedorTicket,
        mostrarSucursalTicket,
      });

      const url = window.URL.createObjectURL(blob);

      window.open(url, '_blank');

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 60_000);
    } catch (err) {
      toast({
        title: 'No se pudo generar la vista previa',
        description:
          err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setGenerandoVistaPrevia(false);
    }
  }

  async function handleGuardarConfiguracionTicket() {
    setGuardandoTicket(true);

    try {
      await guardarConfiguracionTicket({
        mensajeTicketPie: mensajeTicketPie.trim() || null,
        mostrarCodigoBarrasTicket,
        mostrarVendedorTicket,
        mostrarSucursalTicket,
      });

      toast({
        title: 'Configuración del ticket guardada',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description:
          err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setGuardandoTicket(false);
    }
  }

  return {
    puedeEditar,

    nombre,
    iniciales,
    logoUrl,

    mensajeTicketPie,
    mostrarCodigoBarrasTicket,
    mostrarVendedorTicket,
    mostrarSucursalTicket,

    cargando,
    cargandoMarca,
    guardando,
    guardandoTicket,
    generandoVistaPrevia,
    subiendo,
    quitando,

    cambiarNombre,
    setIniciales,
    setMensajeTicketPie,
    setMostrarCodigoBarrasTicket,
    setMostrarVendedorTicket,
    setMostrarSucursalTicket,

    guardarIdentidad: handleGuardarIdentidad,
    subirLogo: handleSubirLogo,
    quitarLogo: handleQuitarLogo,
    previsualizarTicket: handlePrevisualizarTicket,
    guardarConfiguracionTicket: handleGuardarConfiguracionTicket,
  };
}