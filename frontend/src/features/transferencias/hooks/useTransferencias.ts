'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import {
  listarSucursales,
  listarCategorias,
  listarExistencias,
  listarTransferencias,
  crearTransferencia,
  recibirTransferencia,
  cancelarTransferencia,
} from '../api';
import { agruparPorProducto, claveExistencia } from '../utils';
import type {
  Categoria,
  EstadoTransferencia,
  Existencia,
  ItemTraspaso,
  Sucursal,
  Transferencia,
} from '../types';

interface Mensaje {
  tipo: 'exito' | 'error';
  texto: string;
}

export function useTransferencias() {
  const { usuario } = useAuth();
  const puedeGestionar = puedeVer('transferencias', usuario?.rol);

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [sucursalOrigenId, setSucursalOrigenId] = useState('');
  const [sucursalDestinoId, setSucursalDestinoId] = useState('');

  // Catálogo visual
  const [busqueda, setBusqueda] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [catalogoGrid, setCatalogoGrid] = useState<Existencia[]>([]);
  const [cargandoGrid, setCargandoGrid] = useState(false);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [productoExpandidoId, setProductoExpandidoId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Traspaso en curso
  const [carrito, setCarrito] = useState<ItemTraspaso[]>([]);
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [mensaje, setMensaje] = useState<Mensaje | null>(null);

  // Historial
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoTransferencia | ''>('');
  const [filtroSucursalId, setFiltroSucursalId] = useState('');

  // Carga inicial. Se piden por separado (no con Promise.all) para que un
  // fallo en categorias no deje sin sucursales: antes, si /catalogos/categorias
  // fallaba, Promise.all rechazaba completo y sucursales tampoco se llenaba,
  // dejando la pantalla atorada en "Elige una sucursal de origen".
  useEffect(() => {
    listarSucursales().then((data) => {
      setSucursales(data);
      if (data[0]) setSucursalOrigenId(String(data[0].id));
    });
    listarCategorias().then(setCategorias).catch(() => {});
  }, []);

  // Cargar historial cuando cambian filtros
  useEffect(() => {
    async function cargar() {
      setCargandoLista(true);
      try {
        const params: { estado?: string; sucursalId?: string } = {};
        if (filtroEstado) params.estado = filtroEstado;
        if (filtroSucursalId) params.sucursalId = filtroSucursalId;
        const data = await listarTransferencias(params);
        setTransferencias(data);
      } finally {
        setCargandoLista(false);
      }
    }
    cargar();
  }, [filtroEstado, filtroSucursalId]);

  // Cargar catálogo cuando cambia origen, categoría o búsqueda
  useEffect(() => {
    if (!sucursalOrigenId) {
      setCatalogoGrid([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setCargandoGrid(true);
      try {
        const params: { sucursalId: string; categoriaId?: string; skuOProducto?: string } = {
          sucursalId: sucursalOrigenId,
        };
        if (categoriaId) params.categoriaId = categoriaId;
        if (busqueda.trim().length >= 2) params.skuOProducto = busqueda.trim();

        const data = await listarExistencias(params);
        setCatalogoGrid(data.filter((e) => e.stockActual > 0));
      } finally {
        setCargandoGrid(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sucursalOrigenId, categoriaId, busqueda]);

  // Limpiar carrito y filtros al cambiar origen
  useEffect(() => {
    setCarrito([]);
    setBusqueda('');
    setCategoriaId('');
    setMostrarTodos(false);
    setProductoExpandidoId(null);
    setMensaje(null);
    setSucursalDestinoId((actual) => (actual === sucursalOrigenId ? '' : actual));
  }, [sucursalOrigenId]);

  function agregarAlCarrito(e: Existencia) {
    setMensaje(null);
    const key = claveExistencia(e);
    setCarrito((actual) => {
      const existente = actual.find((it) => it.key === key);
      if (existente) {
        if (existente.cantidad >= e.stockActual) return actual;
        return actual.map((it) =>
          it.key === key ? { ...it, cantidad: it.cantidad + 1 } : it
        );
      }
      return [...actual, { key, existencia: e, cantidad: Math.min(1, e.stockActual) }];
    });
  }

  function cambiarCantidad(key: string, nuevaCantidad: number) {
    setCarrito((actual) =>
      actual.map((it) => {
        if (it.key !== key) return it;
        const max = it.existencia.stockActual;
        const cantidad = Number.isFinite(nuevaCantidad)
          ? Math.max(1, Math.min(nuevaCantidad, max))
          : 1;
        return { ...it, cantidad };
      })
    );
  }

  function quitarDelCarrito(key: string) {
    setCarrito((actual) => actual.filter((it) => it.key !== key));
  }

  async function enviarTraspaso() {
    setMensaje(null);

    if (!sucursalOrigenId || !sucursalDestinoId) {
      setMensaje({ tipo: 'error', texto: 'Elige sucursal de origen y destino.' });
      return;
    }

    if (sucursalOrigenId === sucursalDestinoId) {
      setMensaje({ tipo: 'error', texto: 'El origen y el destino no pueden ser la misma sucursal.' });
      return;
    }

    if (carrito.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Agrega al menos un producto para traspasar.' });
      return;
    }

    setEnviando(true);
    const pendientes = [...carrito];
    const fallidos: { nombre: string; error: string }[] = [];
    let exitosos = 0;

    for (const item of pendientes) {
      try {
        await crearTransferencia({
          varianteId: item.existencia.variante.id,
          proveedorId: item.existencia.proveedorId,
          cantidad: item.cantidad,
          sucursalOrigenId: Number(sucursalOrigenId),
          sucursalDestinoId: Number(sucursalDestinoId),
          ...(notas.trim() ? { notas: notas.trim() } : {}),
        });
        exitosos += 1;
        setCarrito((actual) => actual.filter((it) => it.key !== item.key));
      } catch (err) {
        fallidos.push({
          nombre: item.existencia.variante.producto.nombre,
          error: err instanceof ApiError ? err.message : 'Error al crear la transferencia.',
        });
      }
    }

    setEnviando(false);

    if (fallidos.length === 0) {
      setMensaje({
        tipo: 'exito',
        texto:
          exitosos === 1
            ? 'Transferencia creada. El stock ya se descontó del origen.'
            : `${exitosos} transferencias creadas. El stock ya se descontó del origen.`,
      });
      setNotas('');
      // Recargar historial
      const params: { estado?: string; sucursalId?: string } = {};
      if (filtroEstado) params.estado = filtroEstado;
      if (filtroSucursalId) params.sucursalId = filtroSucursalId;
      const data = await listarTransferencias(params);
      setTransferencias(data);
    } else {
      const detalle = fallidos.map((f) => `${f.nombre}: ${f.error}`).join(' · ');
      setMensaje({
        tipo: 'error',
        texto:
          exitosos > 0
            ? `${exitosos} de ${pendientes.length} traspasos creados. Los demás quedaron en el traspaso para corregir — ${detalle}`
            : `No se pudo crear el traspaso — ${detalle}`,
      });
      if (exitosos > 0) {
        const params: { estado?: string; sucursalId?: string } = {};
        if (filtroEstado) params.estado = filtroEstado;
        if (filtroSucursalId) params.sucursalId = filtroSucursalId;
        const data = await listarTransferencias(params);
        setTransferencias(data);
      }
    }
  }

  async function recibir(id: number) {
    try {
      await recibirTransferencia(id);
      const params: { estado?: string; sucursalId?: string } = {};
      if (filtroEstado) params.estado = filtroEstado;
      if (filtroSucursalId) params.sucursalId = filtroSucursalId;
      const data = await listarTransferencias(params);
      setTransferencias(data);
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: err instanceof ApiError ? err.message : 'Error al confirmar la recepción.',
      });
    }
  }

  async function cancelar(id: number) {
    if (!window.confirm('¿Cancelar esta transferencia? El stock regresa a la sucursal de origen.'))
      return;
    try {
      await cancelarTransferencia(id);
      const params: { estado?: string; sucursalId?: string } = {};
      if (filtroEstado) params.estado = filtroEstado;
      if (filtroSucursalId) params.sucursalId = filtroSucursalId;
      const data = await listarTransferencias(params);
      setTransferencias(data);
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: err instanceof ApiError ? err.message : 'Error al cancelar.',
      });
    }
  }

  return {
    // Estado
    puedeGestionar,
    sucursales,
    categorias,
    sucursalOrigenId,
    sucursalDestinoId,
    busqueda,
    categoriaId,
    catalogoGrid,
    cargandoGrid,
    mostrarTodos,
    productoExpandidoId,
    carrito,
    notas,
    enviando,
    mensaje,
    transferencias,
    cargandoLista,
    filtroBusqueda,
    filtroEstado,
    filtroSucursalId,

    // Setters
    setSucursalOrigenId,
    setSucursalDestinoId,
    setBusqueda,
    setCategoriaId,
    setMostrarTodos,
    setProductoExpandidoId,
    setNotas,
    setFiltroBusqueda,
    setFiltroEstado,
    setFiltroSucursalId,

    // Acciones
    agregarAlCarrito,
    cambiarCantidad,
    quitarDelCarrito,
    enviarTraspaso,
    recibir,
    cancelar,
    limpiarFiltros: () => {
      setFiltroBusqueda('');
      setFiltroEstado('');
      setFiltroSucursalId('');
    },
  };
}