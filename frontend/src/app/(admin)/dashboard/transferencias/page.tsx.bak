'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Search, X, Package, LayoutGrid, Check, XCircle, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatearFechaHora } from '@/lib/utils';
import { useAuth, puedeVer } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, EstadoTono } from '@/components/ui/status-badge';
import { ProductoThumb, imagenPrincipal } from '@/components/admin/ProductoThumb';

interface Sucursal {
  id: number;
  nombre: string;
}

interface Categoria {
  id: number;
  nombre: string;
}

// Un renglón por (variante, proveedor) con stock en la sucursal de origen —
// la misma talla puede repetirse si más de un proveedor la surte ahí.
interface Existencia {
  id: number | null;
  sucursalId: number;
  proveedorId: number | null;
  proveedor: { id: number; nombre: string } | null;
  stockActual: number;
  variante: {
    id: number;
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: {
      id: number;
      nombre: string;
      marca?: { nombre: string } | null;
      imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[];
    };
  };
}

// Identifica un bucket concreto (variante + proveedor) para usarlo como
// key/value, ya que un mismo varianteId puede repetirse en la lista.
function claveExistencia(e: Existencia) {
  return `${e.variante.id}:${e.proveedorId ?? 'null'}`;
}

// Una tarjeta del catálogo visual es un PRODUCTO, no una existencia — un
// mismo tenis con 5 tallas ocupa una sola tarjeta. Agrupa la lista plana que
// regresa /inventario/existencias (un renglón por variante+proveedor) en una
// tarjeta por producto, igual que hace Ventas con su catálogo visual.
interface ProductoAgrupado {
  productoId: number;
  nombre: string;
  skuRef: string;
  imagenUrl: string | null;
  marca: string | null;
  stockTotal: number;
  variantes: Existencia[];
}

function agruparPorProducto(lista: Existencia[]): ProductoAgrupado[] {
  const mapa = new Map<number, ProductoAgrupado>();
  for (const e of lista) {
    const p = e.variante.producto;
    const existente = mapa.get(p.id);
    if (existente) {
      existente.stockTotal += e.stockActual;
      existente.variantes.push(e);
    } else {
      mapa.set(p.id, {
        productoId: p.id,
        nombre: p.nombre,
        skuRef: e.variante.sku,
        imagenUrl: imagenPrincipal(p, e.variante.color),
        marca: p.marca?.nombre ?? null,
        stockTotal: e.stockActual,
        variantes: [e],
      });
    }
  }
  return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Etiqueta de cada chip de variante dentro de una tarjeta: la talla (o el
// color, si no hay talla). Si dos proveedores surten la misma talla en esta
// sucursal, el mismo texto se repetiría dos veces sin forma de distinguirlas
// — en ese caso, y solo en ese caso, se le agrega el proveedor.
function etiquetasVariantes(variantes: Existencia[]): Map<string, string> {
  const base = variantes.map((v) => v.variante.talla?.valor ?? v.variante.color ?? 'Único');
  const conteo = new Map<string, number>();
  base.forEach((b) => conteo.set(b, (conteo.get(b) ?? 0) + 1));
  const etiquetas = new Map<string, string>();
  variantes.forEach((v, i) => {
    const b = base[i];
    const repetida = (conteo.get(b) ?? 0) > 1;
    etiquetas.set(claveExistencia(v), repetida ? `${b} · ${v.proveedor?.nombre ?? 'sin proveedor'}` : b);
  });
  return etiquetas;
}

// Botones +/- para cambiar cantidad sin borrar y volver a teclear — mismo
// componente que usa Ventas para su carrito.
function SelectorCantidad({
  cantidad,
  onCambiar,
  min = 1,
  max,
}: {
  cantidad: number;
  onCambiar: (nueva: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => onCambiar(cantidad - 1)}
        disabled={cantidad <= min}
        aria-label="Quitar uno"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
      >
        <span className="text-sm font-semibold leading-none">−</span>
      </button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums">{cantidad}</span>
      <button
        type="button"
        onClick={() => onCambiar(cantidad + 1)}
        disabled={max !== undefined && cantidad >= max}
        aria-label="Agregar uno"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
      >
        <span className="text-sm font-semibold leading-none">+</span>
      </button>
    </div>
  );
}

// Tarjeta del catálogo visual. Si el producto tiene una sola variante, tocar
// la tarjeta la agrega directo al traspaso; si tiene varias (tallas/colores),
// primero despliega los chips para elegir una o más — a diferencia de
// Ventas, aquí SÍ conviene poder elegir varios chips seguidos (varias tallas
// del mismo modelo van con frecuencia en un mismo traspaso), así que elegir
// una talla no cierra el desplegado.
function TarjetaProducto({
  producto,
  etiquetas,
  expandido,
  seleccionadas,
  onClic,
  onElegir,
}: {
  producto: ProductoAgrupado;
  etiquetas: Map<string, string>;
  expandido: boolean;
  seleccionadas: Set<string>;
  onClic: () => void;
  onElegir: (e: Existencia) => void;
}) {
  const multiple = producto.variantes.length > 1;
  const agregado = producto.variantes.some((v) => seleccionadas.has(claveExistencia(v)));
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
        agregado ? 'border-primary bg-accent/30' : 'border-border bg-card hover:border-primary/40'
      }`}
    >
      <button type="button" onClick={onClic} className="flex flex-1 flex-col gap-2 text-left">
        <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-secondary/50 p-2">
          {producto.imagenUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={producto.imagenUrl} alt={producto.nombre} className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="h-full w-full rounded bg-secondary" />
          )}
          {agregado && (
            <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="w-3 h-3" />
            </span>
          )}
        </div>
        <div>
          <div className="line-clamp-2 text-sm font-medium leading-tight">{producto.nombre}</div>
          <div className="truncate text-xs text-muted-foreground">{producto.marca ?? producto.skuRef}</div>
        </div>
      </button>

      <div className="text-xs text-muted-foreground">Stock en origen: {producto.stockTotal}</div>

      {multiple &&
        (expandido ? (
          <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
            {producto.variantes.map((v) => {
              const key = claveExistencia(v);
              const yaAgregado = seleccionadas.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onElegir(v)}
                  disabled={v.stockActual <= 0}
                  className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                    yaAgregado ? 'border-primary bg-accent text-primary' : 'border-border hover:border-primary hover:text-primary'
                  }`}
                >
                  {etiquetas.get(key)} · {v.stockActual}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">{producto.variantes.length} variantes · toca para elegir</div>
        ))}
    </div>
  );
}

// Un renglón del traspaso que se está armando — puede haber varios productos
// (o varias tallas del mismo producto) antes de mandarlo. Al enviar, se crea
// una transferencia por renglón (mismo origen/destino), todas en un solo paso.
interface ItemTraspaso {
  key: string;
  existencia: Existencia;
  cantidad: number;
}

type EstadoTransferencia = 'SOLICITADA' | 'RECIBIDA' | 'CANCELADA';

interface Transferencia {
  id: number;
  folio: string;
  cantidad: number;
  estado: EstadoTransferencia;
  createdAt: string;
  variante: { sku: string; color: string | null; producto: { nombre: string }; talla: { valor: string } | null };
  sucursalOrigen: { id: number; nombre: string };
  sucursalDestino: { id: number; nombre: string };
  solicitadoPor: { nombre: string } | null;
}

const ESTADO_TONO: Record<EstadoTransferencia, EstadoTono> = {
  SOLICITADA: 'warning',
  RECIBIDA: 'success',
  CANCELADA: 'destructive',
};

const ESTADO_LABEL: Record<EstadoTransferencia, string> = {
  SOLICITADA: 'En camino',
  RECIBIDA: 'Recibida',
  CANCELADA: 'Cancelada',
};

const FILTROS_ESTADO: { valor: EstadoTransferencia | ''; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Todas' },
  { valor: 'SOLICITADA', etiqueta: 'En camino' },
  { valor: 'RECIBIDA', etiqueta: 'Recibidas' },
  { valor: 'CANCELADA', etiqueta: 'Canceladas' },
];

export default function TransferenciasPage() {
  const { usuario } = useAuth();
  const puedeGestionar = puedeVer('transferencias', usuario?.rol);

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [sucursalOrigenId, setSucursalOrigenId] = useState('');
  const [sucursalDestinoId, setSucursalDestinoId] = useState('');

  // Buscador + catálogo visual del origen: filtra en vivo (con debounce),
  // igual que el buscador de productos de Ventas — ya no es un <select>
  // gigante con todo el texto encimado.
  const [busqueda, setBusqueda] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [catalogoGrid, setCatalogoGrid] = useState<Existencia[]>([]);
  const [cargandoGrid, setCargandoGrid] = useState(false);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [productoExpandidoId, setProductoExpandidoId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Traspaso en curso: uno o más productos/tallas antes de enviarlos todos
  // de una vez (mismo origen/destino).
  const [carrito, setCarrito] = useState<ItemTraspaso[]>([]);
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  // Historial: lista + filtros (estado y sucursal se piden al servidor; el
  // texto libre filtra en el cliente sobre lo ya cargado).
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoTransferencia | ''>('');
  const [filtroSucursalId, setFiltroSucursalId] = useState('');

  async function cargarListado() {
    setCargandoLista(true);
    try {
      const qs = new URLSearchParams();
      if (filtroEstado) qs.set('estado', filtroEstado);
      if (filtroSucursalId) qs.set('sucursalId', filtroSucursalId);
      const query = qs.toString();
      const t = await api<Transferencia[]>(`/transferencias${query ? `?${query}` : ''}`);
      setTransferencias(t);
    } finally {
      setCargandoLista(false);
    }
  }

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then((data) => {
      setSucursales(data);
      if (data[0]) setSucursalOrigenId(String(data[0].id));
    });
    api<Categoria[]>('/catalogos/categorias')
      .then(setCategorias)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarListado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, filtroSucursalId]);

  // Al cambiar la sucursal de origen, el traspaso que se estaba armando ya
  // no aplica (el stock disponible es otro) — se limpia en vez de arrastrar
  // renglones que ya no son válidos.
  useEffect(() => {
    setCarrito([]);
    setBusqueda('');
    setCategoriaId('');
    setMostrarTodos(false);
    setProductoExpandidoId(null);
    setMensaje(null);
    // Si el destino elegido resulta ser igual al nuevo origen, se limpia:
    // ya no aparece en las opciones del <select> de destino y se vería en
    // blanco sin explicación.
    setSucursalDestinoId((actual) => (actual === sucursalOrigenId ? '' : actual));
  }, [sucursalOrigenId]);

  // Catálogo visual de la sucursal de origen: se vuelve a pedir cada vez que
  // cambia el origen, la categoría o el texto buscado (con debounce).
  useEffect(() => {
    if (!sucursalOrigenId) {
      setCatalogoGrid([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setCargandoGrid(true);
      try {
        const params = new URLSearchParams({ sucursalId: sucursalOrigenId });
        if (categoriaId) params.set('categoriaId', categoriaId);
        if (busqueda.trim().length >= 2) params.set('skuOProducto', busqueda.trim());
        const data = await api<Existencia[]>(`/inventario/existencias?${params.toString()}`);
        setCatalogoGrid(data.filter((e) => e.stockActual > 0));
      } finally {
        setCargandoGrid(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sucursalOrigenId, categoriaId, busqueda]);

  function agregarAlCarrito(e: Existencia) {
    setMensaje(null);
    const key = claveExistencia(e);
    setCarrito((actual) => {
      const existente = actual.find((it) => it.key === key);
      if (existente) {
        if (existente.cantidad >= e.stockActual) return actual;
        return actual.map((it) => (it.key === key ? { ...it, cantidad: it.cantidad + 1 } : it));
      }
      return [...actual, { key, existencia: e, cantidad: Math.min(1, e.stockActual) }];
    });
  }

  function cambiarCantidad(key: string, nuevaCantidad: number) {
    setCarrito((actual) =>
      actual.map((it) => {
        if (it.key !== key) return it;
        const max = it.existencia.stockActual;
        const cantidad = Number.isFinite(nuevaCantidad) ? Math.max(1, Math.min(nuevaCantidad, max)) : 1;
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

    // Uno a la vez (no en paralelo): así, si el stock cambia a medio camino
    // (alguien más lo vendió), el error de un renglón no tira a los demás —
    // los que ya se enviaron quedan hechos y solo el que falló se queda en
    // el carrito para corregir.
    for (const item of pendientes) {
      try {
        await api('/transferencias', {
          method: 'POST',
          body: JSON.stringify({
            varianteId: item.existencia.variante.id,
            proveedorId: item.existencia.proveedorId,
            cantidad: item.cantidad,
            sucursalOrigenId: Number(sucursalOrigenId),
            sucursalDestinoId: Number(sucursalDestinoId),
            ...(notas.trim() ? { notas: notas.trim() } : {}),
          }),
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
      cargarListado();
    } else {
      const detalle = fallidos.map((f) => `${f.nombre}: ${f.error}`).join(' · ');
      setMensaje({
        tipo: 'error',
        texto:
          exitosos > 0
            ? `${exitosos} de ${pendientes.length} traspasos creados. Los demás quedaron en el traspaso para corregir — ${detalle}`
            : `No se pudo crear el traspaso — ${detalle}`,
      });
      if (exitosos > 0) cargarListado();
    }
  }

  async function recibir(id: number) {
    try {
      await api(`/transferencias/${id}/recibir`, { method: 'POST' });
      cargarListado();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al confirmar la recepción.' });
    }
  }

  async function cancelar(id: number) {
    if (!window.confirm('¿Cancelar esta transferencia? El stock regresa a la sucursal de origen.')) return;
    try {
      await api(`/transferencias/${id}/cancelar`, { method: 'POST' });
      cargarListado();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al cancelar.' });
    }
  }

  if (!puedeGestionar) {
    return <EmptyState icon={ArrowLeftRight} title="Sin acceso" description="No tienes permiso para ver esta sección." />;
  }

  const transferenciasFiltradas = transferencias.filter((t) => {
    const q = filtroBusqueda.trim().toLowerCase();
    if (!q) return true;
    return (
      t.folio.toLowerCase().includes(q) ||
      t.variante.producto.nombre.toLowerCase().includes(q) ||
      t.variante.sku.toLowerCase().includes(q) ||
      t.sucursalOrigen.nombre.toLowerCase().includes(q) ||
      t.sucursalDestino.nombre.toLowerCase().includes(q)
    );
  });

  const productosAgrupados = agruparPorProducto(catalogoGrid);
  const hayFiltro = busqueda.trim().length >= 2 || categoriaId !== '';
  const productosVisibles = mostrarTodos || hayFiltro ? productosAgrupados : productosAgrupados.slice(0, 8);
  const enCarritoKeys = new Set(carrito.map((it) => it.key));
  const hayFiltrosHistorial = Boolean(filtroBusqueda || filtroEstado || filtroSucursalId);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transferencias"
        subtitle="Mueve mercancía entre sucursales: busca, arma el traspaso y confírmalo cuando llegue."
        breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Transferencias' }]}
      />

      {mensaje && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            mensaje.tipo === 'exito'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        {/* Columna izquierda: origen/destino + buscador visual, como el
            catálogo de Ventas — ya no un <select> con todo el texto
            encimado. */}
        <div className="card space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Sucursal de origen</label>
              <Select value={sucursalOrigenId} onChange={(e) => setSucursalOrigenId(e.target.value)}>
                <option value="">Selecciona...</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Sucursal de destino</label>
              <Select value={sucursalDestinoId} onChange={(e) => setSucursalDestinoId(e.target.value)}>
                <option value="">Selecciona...</option>
                {sucursales
                  .filter((s) => String(s.id) !== sucursalOrigenId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
              </Select>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Busca un producto o SKU con stock en el origen"
              className="pl-9 h-11"
              disabled={!sucursalOrigenId}
            />
          </div>

          {categorias.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoriaId('')}
                className={`flex items-center gap-1.5 rounded-lg border px-3 h-9 text-sm font-medium transition-colors ${
                  categoriaId === ''
                    ? 'border-primary bg-accent text-primary'
                    : 'border-border bg-card text-foreground hover:bg-secondary'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Todas
              </button>
              {categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoriaId(String(c.id))}
                  className={`rounded-lg border px-3 h-9 text-sm font-medium transition-colors ${
                    categoriaId === String(c.id)
                      ? 'border-primary bg-accent text-primary'
                      : 'border-border bg-card text-foreground hover:bg-secondary'
                  }`}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          )}

          {!sucursalOrigenId ? (
            <EmptyState
              icon={Package}
              title="Elige una sucursal de origen"
              description="Para ver qué mercancía tiene disponible y poder armar el traspaso."
            />
          ) : (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                {hayFiltro ? `Resultados (${productosAgrupados.length})` : 'Con stock en esta sucursal'}
              </h2>

              {cargandoGrid ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
                  ))}
                </div>
              ) : productosAgrupados.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Sin existencias"
                  description={
                    hayFiltro
                      ? 'No hay productos con stock que coincidan con este filtro.'
                      : 'Esta sucursal no tiene stock disponible para traspasar.'
                  }
                />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {productosVisibles.map((p) => (
                    <TarjetaProducto
                      key={p.productoId}
                      producto={p}
                      etiquetas={etiquetasVariantes(p.variantes)}
                      expandido={productoExpandidoId === p.productoId}
                      seleccionadas={enCarritoKeys}
                      onClic={() => {
                        if (p.variantes.length === 1) {
                          agregarAlCarrito(p.variantes[0]);
                        } else {
                          setProductoExpandidoId((actual) => (actual === p.productoId ? null : p.productoId));
                        }
                      }}
                      onElegir={(v) => agregarAlCarrito(v)}
                    />
                  ))}
                </div>
              )}

              {!hayFiltro && !mostrarTodos && productosAgrupados.length > 8 && (
                <button
                  type="button"
                  onClick={() => setMostrarTodos(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
                >
                  <LayoutGrid className="w-4 h-4" />
                  Ver todo el catálogo con stock
                </button>
              )}
            </div>
          )}
        </div>

        {/* Columna derecha: el traspaso que se está armando — se queda fija
            en pantalla mientras se sigue buscando a la izquierda, igual que
            el ticket de Ventas. */}
        <div className="lg:sticky lg:top-4 card space-y-4">
          <h2 className="text-base font-semibold">Traspaso en curso {carrito.length > 0 ? `(${carrito.length})` : ''}</h2>

          {carrito.length === 0 ? (
            <p className="text-sm text-muted-foreground">Busca y agrega uno o más productos para armar el traspaso.</p>
          ) : (
            <div className="space-y-2 max-h-[42vh] overflow-y-auto p-0.5">
              {carrito.map((it) => {
                const p = it.existencia.variante.producto;
                const detalle = [it.existencia.variante.talla?.valor, it.existencia.variante.color]
                  .filter(Boolean)
                  .join(' / ');
                return (
                  <div key={it.key} className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5">
                    <ProductoThumb url={imagenPrincipal(p, it.existencia.variante.color)} alt="" size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.nombre}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {detalle || 'Único'} · {it.existencia.proveedor?.nombre ?? 'sin proveedor'}
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <SelectorCantidad
                          cantidad={it.cantidad}
                          onCambiar={(n) => cambiarCantidad(it.key, n)}
                          max={it.existencia.stockActual}
                        />
                        <span className="text-xs text-muted-foreground">disp. {it.existencia.stockActual}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => quitarDelCarrito(it.key)}
                      aria-label="Quitar del traspaso"
                      className="shrink-0 text-destructive"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {carrito.length > 0 && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Notas (opcional)</label>
              <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. Urge para el fin de semana" />
            </div>
          )}

          <Button
            className="w-full"
            onClick={enviarTraspaso}
            disabled={enviando || carrito.length === 0 || !sucursalOrigenId || !sucursalDestinoId}
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
            {enviando ? 'Enviando...' : carrito.length > 1 ? `Enviar ${carrito.length} traspasos` : 'Enviar traspaso'}
          </Button>
        </div>
      </div>

      {/* Historial: buscador de texto + filtro de estado (píldoras) +
          sucursal, igual de fácil de acotar que el resto de la app. */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Historial de traspasos</h2>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64 max-w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={filtroBusqueda}
              onChange={(e) => setFiltroBusqueda(e.target.value)}
              placeholder="Buscar por folio, producto o sucursal"
              className="pl-9"
            />
          </div>
          <div className="w-44">
            <Select value={filtroSucursalId} onChange={(e) => setFiltroSucursalId(e.target.value)}>
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTROS_ESTADO.map((f) => (
              <button
                key={f.valor || 'todas'}
                type="button"
                onClick={() => setFiltroEstado(f.valor)}
                className={`rounded-lg border px-3 h-9 text-sm font-medium transition-colors ${
                  filtroEstado === f.valor
                    ? 'border-primary bg-accent text-primary'
                    : 'border-border bg-card text-foreground hover:bg-secondary'
                }`}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>
          {hayFiltrosHistorial && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFiltroBusqueda('');
                setFiltroEstado('');
                setFiltroSucursalId('');
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>

        {cargandoLista ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : transferenciasFiltradas.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Sin traspasos"
            description={
              hayFiltrosHistorial
                ? 'Ningún traspaso coincide con estos filtros.'
                : 'Todavía no se ha hecho ningún traspaso entre sucursales.'
            }
          />
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {transferenciasFiltradas.map((t) => (
              <div key={t.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 hover:bg-secondary/40 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{t.folio}</span>
                    <StatusBadge tono={ESTADO_TONO[t.estado]}>{ESTADO_LABEL[t.estado]}</StatusBadge>
                  </div>
                  <div className="text-sm truncate">
                    {t.variante.producto.nombre} {t.variante.talla ? `(${t.variante.talla.valor})` : ''} · {t.cantidad}{' '}
                    {t.cantidad === 1 ? 'pieza' : 'piezas'}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.sucursalOrigen.nombre} → {t.sucursalDestino.nombre} · Solicitó {t.solicitadoPor?.nombre ?? '—'} ·{' '}
                    {formatearFechaHora(t.createdAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {t.estado === 'SOLICITADA' && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => recibir(t.id)}>
                      <Check className="w-3.5 h-3.5" />
                      Recibir
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => cancelar(t.id)}>
                      <XCircle className="w-3.5 h-3.5" />
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
