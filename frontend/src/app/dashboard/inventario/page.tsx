'use client';

import { Fragment, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBranch } from '@/lib/branchContext';
import { ProductoThumb, imagenPrincipal } from '@/components/ProductoThumb';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, tonoPorStock, etiquetaPorStock } from '@/components/ui/status-badge';
import { toast } from '@/components/ui/use-toast';
import { Search, X, Warehouse, History, ChevronDown, ChevronRight, Plus, Minus } from 'lucide-react';
import Link from 'next/link';

// Valor de opción usado en el selector de "de qué proveedor sale" para
// distinguir "el usuario eligió explícitamente el bucket sin proveedor" de
// "todavía no ha elegido nada" — ambos no pueden ser '' o se confunden.
const SIN_PROVEEDOR = '__sin_proveedor__';

interface Proveedor {
  id: number;
  nombre: string;
}

interface Marca {
  id: number;
  nombre: string;
}
interface Modelo {
  id: number;
  nombre: string;
  marcaId: number;
}
interface Categoria {
  id: number;
  nombre: string;
}
interface Talla {
  id: number;
  valor: string;
  tipo: string;
}

// Desde que el stock se separa por proveedor, el backend ya no manda un
// renglón por variante: manda un renglón por (variante, proveedor) — si dos
// proveedores surten la misma talla en esta sucursal, llegan dos renglones
// con su propio stockActual. proveedorId/proveedor aquí es del bucket (de
// quién es ESTE stock), no del proveedor "por defecto" de la variante.
// `sucursal` viene siempre (aun en modo "todas las sucursales", donde
// sucursalId se omite en la petición) — se usa para poder mostrar de cuál es
// cada renglón cuando se está viendo más de una a la vez.
interface Existencia {
  id: number | null;
  sucursalId: number;
  sucursal: { id: number; nombre: string } | null;
  proveedorId: number | null;
  proveedor: { id: number; nombre: string } | null;
  stockActual: number;
  stockMinimo: number;
  variante: {
    id: number;
    sku: string;
    color: string | null;
    talla: { valor: string; orden?: number } | null;
    producto: {
      id: number;
      nombre: string;
      marca: { nombre: string };
      imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[];
    };
    // Proveedor "por defecto" asignado a esta variante en Productos — no es
    // necesariamente el mismo proveedor que tiene stock en este bucket
    // (b.proveedor), se usa para preseleccionar al registrar una entrada.
    proveedor: { id: number; nombre: string } | null;
  };
}

type GrupoVariante = { variante: Existencia['variante']; buckets: Existencia[] };
type GrupoProducto = { producto: Existencia['variante']['producto']; variantes: GrupoVariante[] };

export default function InventarioPage() {
  const { usuario } = useAuth();
  // La sucursal que se está viendo ahora la controla el selector global del
  // topbar (ver lib/branchContext.tsx) — Inventario es una vista de
  // consulta, así que se conecta ahí en vez de tener su propio selector.
  // sucursalId null = "todas las sucursales" (solo ADMIN_PRINCIPAL/
  // DESARROLLO pueden elegir esa opción): en ese modo la pantalla es de solo
  // lectura, porque registrar una entrada/salida siempre necesita decir en
  // cuál sucursal ocurre.
  const { sucursalId, sucursalActual, cargando: cargandoSucursal } = useBranch();
  // VENTAS solo puede consultar existencias (de su sucursal o de otras, para
  // buscar un modelo y pedirlo si un cliente lo quiere) — no puede editar
  // stock desde aquí; eso sigue siendo trabajo de INVENTARIO/ADMIN.
  const puedeEditar = usuario?.rol !== 'VENTAS' && sucursalId !== null;

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedorFiltro, setProveedorFiltro] = useState('');
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  // Catálogos y filtros extra para encontrar más rápido qué tallas/marcas/
  // modelos hay disponibles, además de la búsqueda por texto y el proveedor.
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [modelosFiltro, setModelosFiltro] = useState<Modelo[]>([]);
  const [marcaFiltro, setMarcaFiltro] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [modeloFiltro, setModeloFiltro] = useState('');
  const [tallaFiltro, setTallaFiltro] = useState('');
  const hayFiltrosActivos = Boolean(busqueda || proveedorFiltro || marcaFiltro || categoriaFiltro || modeloFiltro || tallaFiltro);

  const [entradaVarianteId, setEntradaVarianteId] = useState<number | null>(null);
  const [entradaCantidad, setEntradaCantidad] = useState('1');
  const [entradaProveedorId, setEntradaProveedorId] = useState('');
  const [salidaVarianteId, setSalidaVarianteId] = useState<number | null>(null);
  const [salidaCantidad, setSalidaCantidad] = useState('1');
  const [salidaProveedorId, setSalidaProveedorId] = useState('');
  // Qué producto tiene desplegado el detalle por talla/color — la vista
  // inicial solo muestra una fila por producto para no abrumar cuando tiene
  // muchas variantes; el registro de entradas/salidas sigue viviendo a nivel
  // de variante, adentro del desplegable.
  const [productoAbiertoId, setProductoAbiertoId] = useState<number | null>(null);

  useEffect(() => {
    api<Proveedor[]>('/proveedores').then(setProveedores).catch(() => {});
    api<Marca[]>('/catalogos/marcas').then(setMarcas);
    api<Categoria[]>('/catalogos/categorias').then(setCategorias);
    api<Talla[]>('/catalogos/tallas').then(setTallas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Los modelos del filtro dependen de la marca elegida (si no hay ninguna,
  // se listan todos). Al cambiar de marca se limpia el modelo elegido, por
  // si ya no pertenece a la marca nueva.
  useEffect(() => {
    api<Modelo[]>(`/catalogos/modelos${marcaFiltro ? `?marcaId=${marcaFiltro}` : ''}`).then(setModelosFiltro);
    setModeloFiltro('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcaFiltro]);

  async function cargar() {
    if (cargandoSucursal) return;
    setCargando(true);
    const qs = new URLSearchParams();
    // sucursalId null ("todas") simplemente no se manda — el backend ya
    // soporta ese modo (ver GET /inventario/existencias).
    if (sucursalId !== null) qs.set('sucursalId', String(sucursalId));
    if (busqueda) qs.set('skuOProducto', busqueda);
    if (proveedorFiltro) qs.set('proveedorId', proveedorFiltro);
    if (marcaFiltro) qs.set('marcaId', marcaFiltro);
    if (categoriaFiltro) qs.set('categoriaId', categoriaFiltro);
    if (modeloFiltro) qs.set('modeloId', modeloFiltro);
    if (tallaFiltro) qs.set('tallaId', tallaFiltro);
    try {
      const data = await api<Existencia[]>(`/inventario/existencias?${qs.toString()}`);
      setExistencias(data);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId, cargandoSucursal, proveedorFiltro, marcaFiltro, categoriaFiltro, modeloFiltro, tallaFiltro]);

  function limpiarFiltros() {
    setBusqueda('');
    setProveedorFiltro('');
    setMarcaFiltro('');
    setCategoriaFiltro('');
    setModeloFiltro('');
    setTallaFiltro('');
  }

  // Preselecciona el proveedor "por defecto" de la variante (el que se le
  // asignó en Productos). Antes siempre arrancaba en "Sin proveedor" y, si el
  // usuario no se acordaba de cambiarlo, el stock quedaba cargado a un bucket
  // sin proveedor aunque la variante sí tuviera uno asignado — eso es lo que
  // hacía que luego, al filtrar Inventario por ese proveedor, no apareciera
  // nada.
  function abrirEntrada(variante: Existencia['variante']) {
    setSalidaVarianteId(null);
    setEntradaVarianteId(variante.id);
    setEntradaCantidad('1');
    setEntradaProveedorId(variante.proveedor ? String(variante.proveedor.id) : '');
  }

  // Como el stock se separa por proveedor, una salida/ajuste tiene que decir
  // siempre de cuál bucket sale — por eso también abre un mini-formulario en
  // vez del prompt simple que había antes.
  function abrirSalida(varianteId: number, buckets: Existencia[]) {
    setEntradaVarianteId(null);
    setSalidaVarianteId(varianteId);
    setSalidaCantidad('1');
    // Si solo hay un proveedor con stock aquí, se preselecciona; si hay
    // varios, se deja vacío para que el usuario elija a fuerza.
    const conStock = buckets.filter((b) => b.stockActual > 0);
    setSalidaProveedorId(
      conStock.length === 1 ? (conStock[0].proveedorId === null ? SIN_PROVEEDOR : String(conStock[0].proveedorId)) : ''
    );
  }

  async function confirmarEntrada() {
    if (!entradaVarianteId || sucursalId === null) return;
    const cantidad = Number(entradaCantidad);
    if (!cantidad || cantidad <= 0) return;

    try {
      await api('/inventario/movimientos', {
        method: 'POST',
        body: JSON.stringify({
          sucursalId,
          varianteId: entradaVarianteId,
          tipo: 'ENTRADA',
          cantidad,
          proveedorId: entradaProveedorId ? Number(entradaProveedorId) : null,
        }),
      });
      toast({ title: 'Entrada registrada', variant: 'success' });
      setEntradaVarianteId(null);
      cargar();
    } catch (err) {
      toast({ title: 'No se pudo registrar la entrada', description: err instanceof ApiError ? err.message : undefined, variant: 'destructive' });
    }
  }

  async function confirmarSalida(buckets: Existencia[]) {
    if (!salidaVarianteId || sucursalId === null) return;
    const cantidad = Number(salidaCantidad);
    if (!cantidad || cantidad <= 0) return;
    // Si hay más de un proveedor con stock en esta sucursal, obligamos a
    // elegir de cuál sale — no se adivina.
    if (buckets.filter((b) => b.stockActual > 0).length > 1 && !salidaProveedorId) {
      toast({ title: 'Elige de qué proveedor sale', description: 'Esta talla tiene stock de más de un proveedor.', variant: 'destructive' });
      return;
    }

    try {
      await api('/inventario/movimientos', {
        method: 'POST',
        body: JSON.stringify({
          sucursalId,
          varianteId: salidaVarianteId,
          tipo: 'SALIDA',
          cantidad,
          proveedorId: salidaProveedorId === SIN_PROVEEDOR ? null : Number(salidaProveedorId),
        }),
      });
      toast({ title: 'Salida registrada', variant: 'success' });
      setSalidaVarianteId(null);
      cargar();
    } catch (err) {
      toast({ title: 'No se pudo registrar la salida', description: err instanceof ApiError ? err.message : undefined, variant: 'destructive' });
    }
  }

  // Agrupa los renglones (uno por proveedor, y en modo "todas" también por
  // sucursal) en uno por variante, para mostrar una sola fila por talla con
  // el desglose de stock adentro, en vez de repetir SKU/foto/marca por cada
  // bucket.
  const gruposVariante: GrupoVariante[] = (() => {
    const mapa = new Map<number, GrupoVariante>();
    for (const e of existencias) {
      const existente = mapa.get(e.variante.id);
      if (existente) existente.buckets.push(e);
      else mapa.set(e.variante.id, { variante: e.variante, buckets: [e] });
    }
    return Array.from(mapa.values());
  })();

  // Y luego agrupa las variantes por producto, para la vista inicial: una
  // sola fila por producto con sus tallas/colores resumidos, en vez de una
  // fila por cada combinación de talla — eso era lo que hacía tediosa la
  // vista al entrar cuando un producto tenía muchas tallas.
  const gruposProducto: GrupoProducto[] = (() => {
    const mapa = new Map<number, GrupoProducto>();
    for (const g of gruposVariante) {
      const pid = g.variante.producto.id;
      const existente = mapa.get(pid);
      if (existente) existente.variantes.push(g);
      else mapa.set(pid, { producto: g.variante.producto, variantes: [g] });
    }
    return Array.from(mapa.values());
  })();

  const subtitulo =
    sucursalId === null
      ? `${gruposProducto.length} producto${gruposProducto.length === 1 ? '' : 's'} con existencias en todas las sucursales`
      : `${gruposProducto.length} producto${gruposProducto.length === 1 ? '' : 's'} con existencias en ${sucursalActual?.nombre ?? 'esta sucursal'}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventario"
        subtitle={subtitulo}
        breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Inventario' }]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/inventario/historial">
              <History className="w-4 h-4" />
              Historial de movimientos
            </Link>
          </Button>
        }
      />

      {sucursalId === null && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-sm text-foreground">
          Viendo <strong>todas las sucursales</strong> a la vez — para registrar entradas o salidas, elige una sucursal específica en la barra superior.
        </p>
      )}

      {/* Buscador */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por SKU o producto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cargar()}
            className="pl-9"
          />
        </div>
        <Button variant="secondary" onClick={cargar}>
          Buscar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select value={proveedorFiltro} onChange={(e) => setProveedorFiltro(e.target.value)}>
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={marcaFiltro} onChange={(e) => setMarcaFiltro(e.target.value)}>
            <option value="">Todas las marcas</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={modeloFiltro} onChange={(e) => setModeloFiltro(e.target.value)} disabled={modelosFiltro.length === 0}>
            <option value="">Todos los modelos</option>
            {modelosFiltro.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={tallaFiltro} onChange={(e) => setTallaFiltro(e.target.value)}>
            <option value="">Todas las tallas</option>
            {tallas.map((t) => (
              <option key={t.id} value={t.id}>{t.tipo}: {t.valor}</option>
            ))}
          </Select>
        </div>
        {hayFiltrosActivos && (
          <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
            <X className="w-3.5 h-3.5" />
            Limpiar filtros
          </Button>
        )}
      </div>

      {cargando || cargandoSucursal ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : gruposProducto.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title={hayFiltrosActivos ? 'Sin resultados' : 'Sin existencias registradas'}
          description={
            hayFiltrosActivos
              ? 'No encontramos productos que coincidan con estos filtros.'
              : sucursalId === null
                ? 'Ninguna sucursal tiene stock cargado todavía.'
                : 'Esta sucursal no tiene stock cargado todavía.'
          }
          action={
            hayFiltrosActivos && (
              <Button variant="outline" size="sm" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Producto</th>
              <th>Marca</th>
              <th>Tallas / colores</th>
              <th>Stock total</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {gruposProducto.map(({ producto, variantes }) => {
              const stockProducto = variantes.reduce((s, g) => s + g.buckets.reduce((s2, b) => s2 + b.stockActual, 0), 0);
              // Si cualquiera de las variantes está en o por debajo de su
              // mínimo, se marca el total del producto para que salte a la
              // vista sin tener que desplegar cada una a revisar.
              const minimoProducto = variantes.reduce((max, g) => Math.max(max, g.buckets.reduce((m, b) => Math.max(m, b.stockMinimo), 0)), 0);
              const etiquetas = variantes
                .slice()
                .sort((a, b) => (a.variante.talla?.orden ?? 0) - (b.variante.talla?.orden ?? 0))
                .map((g) => {
                  const talla = g.variante.talla?.valor ?? 'sin talla';
                  return g.variante.color ? `${talla} (${g.variante.color})` : talla;
                });
              const abierto = productoAbiertoId === producto.id;
              return (
                <Fragment key={producto.id}>
                  <tr className="cursor-pointer" onClick={() => setProductoAbiertoId(abierto ? null : producto.id)}>
                    <td>
                      <ProductoThumb url={imagenPrincipal(producto)} alt={producto?.nombre || ''} />
                    </td>
                    <td className="font-medium">{producto?.nombre}</td>
                    <td>{producto?.marca?.nombre}</td>
                    <td className="text-xs whitespace-normal">{etiquetas.join(', ') || '—'}</td>
                    <td className="tabular-nums">{stockProducto}</td>
                    <td>
                      <StatusBadge tono={tonoPorStock(stockProducto, minimoProducto)}>{etiquetaPorStock(stockProducto, minimoProducto)}</StatusBadge>
                    </td>
                    <td>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setProductoAbiertoId(abierto ? null : producto.id); }}>
                        {abierto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {variantes.length} {variantes.length === 1 ? 'talla' : 'tallas'}
                      </Button>
                    </td>
                  </tr>
                  {abierto && (
                    <tr>
                      <td colSpan={7} className="bg-secondary/40 p-0">
                        <table className="min-w-0">
                          <thead>
                            <tr>
                              <th>SKU</th>
                              <th>Talla</th>
                              <th>Color</th>
                              <th>Desglose de stock</th>
                              <th>Total</th>
                              {puedeEditar && <th></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {variantes.map(({ variante, buckets }) => {
                              const stockVariante = buckets.reduce((s, b) => s + b.stockActual, 0);
                              const minimo = buckets.reduce((max, b) => Math.max(max, b.stockMinimo), 0);
                              return (
                                <Fragment key={variante.id}>
                                  <tr>
                                    <td className="text-xs text-muted-foreground">{variante.sku}</td>
                                    <td>{variante.talla?.valor ?? '—'}</td>
                                    <td>{variante.color ?? '—'}</td>
                                    <td className="text-xs whitespace-normal">
                                      {buckets.map((b, i) => (
                                        <div key={b.id ?? `sin-${i}`}>
                                          {sucursalId === null && b.sucursal ? `${b.sucursal.nombre} · ` : ''}
                                          {b.proveedor?.nombre ?? 'Sin proveedor'}: {b.stockActual}
                                        </div>
                                      ))}
                                    </td>
                                    <td>
                                      <StatusBadge tono={tonoPorStock(stockVariante, minimo)}>{stockVariante}</StatusBadge>
                                    </td>
                                    {puedeEditar && (
                                      <td className="whitespace-nowrap">
                                        <Button variant="ghost" size="sm" onClick={() => abrirEntrada(variante)}>
                                          <Plus className="w-3.5 h-3.5" />
                                          Entrada
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => abrirSalida(variante.id, buckets)}>
                                          <Minus className="w-3.5 h-3.5" />
                                          Salida
                                        </Button>
                                      </td>
                                    )}
                                  </tr>
                                  {entradaVarianteId === variante.id && (
                                    <tr>
                                      <td colSpan={puedeEditar ? 6 : 5} className="bg-card">
                                        <div className="flex flex-wrap items-center gap-2 py-1.5">
                                          <span className="text-xs text-muted-foreground">Cantidad</span>
                                          <Input type="number" min={1} value={entradaCantidad} onChange={(ev) => setEntradaCantidad(ev.target.value)} className="w-20" />
                                          <span className="text-xs text-muted-foreground">Proveedor</span>
                                          <div className="w-44">
                                            <Select value={entradaProveedorId} onChange={(ev) => setEntradaProveedorId(ev.target.value)}>
                                              <option value="">Sin proveedor</option>
                                              {proveedores.map((p) => (
                                                <option key={p.id} value={p.id}>{p.nombre}</option>
                                              ))}
                                            </Select>
                                          </div>
                                          <Button size="sm" onClick={confirmarEntrada}>Confirmar</Button>
                                          <Button variant="ghost" size="sm" onClick={() => setEntradaVarianteId(null)}>Cancelar</Button>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                  {salidaVarianteId === variante.id && (
                                    <tr>
                                      <td colSpan={puedeEditar ? 6 : 5} className="bg-card">
                                        <div className="flex flex-wrap items-center gap-2 py-1.5">
                                          <span className="text-xs text-muted-foreground">Cantidad</span>
                                          <Input type="number" min={1} value={salidaCantidad} onChange={(ev) => setSalidaCantidad(ev.target.value)} className="w-20" />
                                          <span className="text-xs text-muted-foreground">De qué proveedor sale</span>
                                          <div className="w-52">
                                            <Select value={salidaProveedorId} onChange={(ev) => setSalidaProveedorId(ev.target.value)}>
                                              <option value="">Selecciona…</option>
                                              {buckets
                                                .filter((b) => b.stockActual > 0)
                                                .map((b) => (
                                                  <option key={b.id ?? 'sin'} value={b.proveedorId === null ? SIN_PROVEEDOR : b.proveedorId}>
                                                    {b.proveedor?.nombre ?? 'Sin proveedor'} (stock: {b.stockActual})
                                                  </option>
                                                ))}
                                            </Select>
                                          </div>
                                          <Button size="sm" onClick={() => confirmarSalida(buckets)}>Confirmar</Button>
                                          <Button variant="ghost" size="sm" onClick={() => setSalidaVarianteId(null)}>Cancelar</Button>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
