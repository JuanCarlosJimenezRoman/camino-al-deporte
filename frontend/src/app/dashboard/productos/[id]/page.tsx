'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  X,
  Archive,
  Package,
  Layers,
  Warehouse,
  ShoppingCart,
  History,
  Camera,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import { GaleriaFotos, Imagen } from '@/components/GaleriaFotos';
import { ProductoThumb, imagenPrincipal } from '@/components/ProductoThumb';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, tonoPorStock, etiquetaPorStock } from '@/components/ui/status-badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ActivityFeed, ActivityItem } from '@/components/ui/activity-feed';
import { toast } from '@/components/ui/use-toast';

// ---------------------------------------------------------------------------
// Tipos (mismo contrato del backend que ya usaba Productos — ver
// backend/src/routes/productos.js GET /:id).
// ---------------------------------------------------------------------------

interface Existencia {
  id: number | null;
  stockActual: number;
  stockMinimo: number;
  sucursal: { id: number; nombre: string } | null;
  proveedor: { id: number; nombre: string } | null;
}

interface Variante {
  id: number;
  sku: string;
  codigoInterno: string;
  color: string | null;
  talla: { id: number; valor: string } | null;
  proveedor: { id: number; nombre: string } | null;
  existencias: Existencia[];
}

interface Producto {
  id: number;
  nombre: string;
  descripcion: string | null;
  precioCompra: string;
  precioVenta: string;
  marcaId: number;
  modeloId: number | null;
  categoriaId: number;
  marca: { nombre: string };
  modelo: { nombre: string } | null;
  categoria: { nombre: string };
  atributosExtra: Record<string, string> | null;
  variantes: Variante[];
  imagenes: Imagen[];
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
interface Sucursal {
  id: number;
  nombre: string;
}
interface Proveedor {
  id: number;
  nombre: string;
}
interface CampoPersonalizado {
  id: number;
  clave: string;
  etiqueta: string;
  tipo: 'TEXTO' | 'NUMERO' | 'BOOLEANO' | 'FECHA' | 'SELECT';
  opciones: string[];
  requerido: boolean;
}

interface AtributoExtra {
  clave: string;
  valor: string;
}

interface EditProductoForm {
  nombre: string;
  marcaId: string;
  modeloId: string;
  categoriaId: string;
  precioCompra: string;
  precioVenta: string;
  descripcion: string;
  valoresDefinidos: Record<string, string>;
  atributos: AtributoExtra[];
}

function formVacioProducto(): EditProductoForm {
  return {
    nombre: '',
    marcaId: '',
    modeloId: '',
    categoriaId: '',
    precioCompra: '0',
    precioVenta: '0',
    descripcion: '',
    valoresDefinidos: {},
    atributos: [],
  };
}

interface EditVarianteForm {
  tallaId: string;
  color: string;
  sku: string;
}

interface NuevaVarianteForm {
  tallaId: string;
  color: string;
  sku: string;
  stockInicial: string;
  proveedorId: string;
}

function nuevaVarianteFormVacio(): NuevaVarianteForm {
  return { tallaId: '', color: '', sku: '', stockInicial: '0', proveedorId: '' };
}

// Historial de ventas del producto: se filtra en el cliente sobre GET /ventas
// (que ya trae items con variante.producto) — no existe (ni se agrega) un
// endpoint "ventas por producto" en el backend.
interface VentaItemDetalle {
  id: number;
  cantidad: number;
  precioUnitario: string;
  subtotal?: string;
  variante: {
    id: number;
    color: string | null;
    talla: { valor: string } | null;
    producto: { id: number };
  };
}
interface VentaDetalle {
  id: number;
  folio: string;
  total: string;
  estado: string;
  createdAt: string;
  sucursal: { nombre: string } | null;
  usuario: { nombre: string } | null;
  items: VentaItemDetalle[];
}

// Historial de movimientos de una variante — GET /inventario/movimientos/:varianteId
interface Movimiento {
  id: number;
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
  cantidad: number;
  motivo: string | null;
  createdAt: string;
  usuario: { nombre: string; email: string } | null;
  sucursal: { nombre: string } | null;
  proveedor: { nombre: string } | null;
}

type Tab = 'info' | 'variantes' | 'inventario' | 'ventas' | 'movimientos' | 'fotos';
const TABS_VALIDOS: Tab[] = ['info', 'variantes', 'inventario', 'ventas', 'movimientos', 'fotos'];

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatearFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// useSearchParams (para deep-linkear la pestaña activa, ?tab=variantes etc.)
// exige un límite de Suspense alrededor en build de producción — mismo
// patrón que ya usan tienda/login y tienda/registro.
export default function ProductoDetallePage() {
  return (
    <Suspense fallback={null}>
      <ProductoDetalleContenido />
    </Suspense>
  );
}

function ProductoDetalleContenido() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const productoId = Number(params.id);
  const { usuario } = useAuth();

  // Mismo criterio de permisos que ya usaba Productos: VENTAS entra en modo
  // solo-consulta (puede ver, no editar), ADMIN_PRINCIPAL/DESARROLLO/
  // INVENTARIO sí pueden. Archivar sigue más restringido (solo lo que el
  // backend acepta en DELETE /productos/:id).
  const puedeEditar = usuario ? puedeVer('inventario', usuario.rol) && usuario.rol !== 'VENTAS' : false;
  const puedeArchivar = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';
  const puedeVerVentas = usuario ? puedeVer('ventas', usuario.rol) : false;
  const puedeVerMovimientos = usuario ? puedeVer('inventario', usuario.rol) : false;

  const tabInicial = TABS_VALIDOS.includes(searchParams.get('tab') as Tab) ? (searchParams.get('tab') as Tab) : 'info';
  const [tab, setTab] = useState<Tab>(tabInicial);

  const [producto, setProducto] = useState<Producto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Catálogos (marca/modelo/categoría/talla/sucursal/proveedor/campos)
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [modelosEdit, setModelosEdit] = useState<Modelo[]>([]);
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [camposDefinidos, setCamposDefinidos] = useState<CampoPersonalizado[]>([]);

  // Información básica (edición)
  const [editProductoForm, setEditProductoForm] = useState<EditProductoForm>(formVacioProducto());
  const [guardandoProducto, setGuardandoProducto] = useState(false);

  // Variantes: edición / alta / eliminación
  const [editandoVarianteId, setEditandoVarianteId] = useState<number | null>(null);
  const [editVarianteForm, setEditVarianteForm] = useState<EditVarianteForm>({ tallaId: '', color: '', sku: '' });
  const [guardandoEdicionVariante, setGuardandoEdicionVariante] = useState(false);
  const [confirmarVarianteId, setConfirmarVarianteId] = useState<number | null>(null);
  const [eliminandoVariante, setEliminandoVariante] = useState(false);
  const [nuevaTallaAbierta, setNuevaTallaAbierta] = useState(false);
  const [nuevaTallaForm, setNuevaTallaForm] = useState<NuevaVarianteForm>(nuevaVarianteFormVacio());
  const [nuevaTallaSucursalId, setNuevaTallaSucursalId] = useState('');
  const [guardandoTalla, setGuardandoTalla] = useState(false);

  // Archivar producto
  const [confirmarArchivar, setConfirmarArchivar] = useState(false);
  const [archivando, setArchivando] = useState(false);

  // Ventas (carga perezosa, solo cuando se entra a esa pestaña)
  const [ventasProducto, setVentasProducto] = useState<VentaDetalle[] | null>(null);
  const [cargandoVentas, setCargandoVentas] = useState(false);

  // Movimientos (por variante, con selector)
  const [varianteMovimientosId, setVarianteMovimientosId] = useState<number | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);

  const cambiarTab = useCallback(
    (nuevo: string) => {
      setTab(nuevo as Tab);
      const qs = new URLSearchParams(searchParams.toString());
      qs.set('tab', nuevo);
      router.replace(`/dashboard/productos/${productoId}?${qs.toString()}`, { scroll: false });
    },
    [productoId, router, searchParams]
  );

  const cargarProducto = useCallback(async () => {
    try {
      const p = await api<Producto>(`/productos/${productoId}`);
      setProducto(p);

      const clavesDefinidas = new Set(camposDefinidos.map((c) => c.clave));
      const valoresDefinidos: Record<string, string> = {};
      const atributosLibres: AtributoExtra[] = [];
      for (const [clave, valor] of Object.entries(p.atributosExtra ?? {})) {
        if (clavesDefinidas.has(clave)) {
          valoresDefinidos[clave] = String(valor);
        } else {
          atributosLibres.push({ clave, valor: String(valor) });
        }
      }
      setEditProductoForm({
        nombre: p.nombre,
        marcaId: String(p.marcaId),
        modeloId: p.modeloId ? String(p.modeloId) : '',
        categoriaId: String(p.categoriaId),
        precioCompra: p.precioCompra,
        precioVenta: p.precioVenta,
        descripcion: p.descripcion ?? '',
        valoresDefinidos,
        atributos: atributosLibres,
      });
      const m = await api<Modelo[]>(`/catalogos/modelos?marcaId=${p.marcaId}`);
      setModelosEdit(m);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNoEncontrado(true);
      } else {
        toast({ title: 'No se pudo cargar el producto', description: err instanceof ApiError ? err.message : undefined, variant: 'destructive' });
      }
    } finally {
      setCargando(false);
    }
    // camposDefinidos se usa solo para repartir atributosExtra al cargar; no
    // debe disparar una recarga del producto si cambia después.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId]);

  useEffect(() => {
    api<Marca[]>('/catalogos/marcas').then(setMarcas);
    api<Categoria[]>('/catalogos/categorias').then(setCategorias);
    api<Talla[]>('/catalogos/tallas').then(setTallas);
    api<Sucursal[]>('/sucursales').then((s) => {
      setSucursales(s);
      setNuevaTallaSucursalId(usuario?.sucursalId ? String(usuario.sucursalId) : s[0] ? String(s[0].id) : '');
    });
    api<Proveedor[]>('/proveedores').then(setProveedores);
    api<CampoPersonalizado[]>('/catalogos/campos-personalizados?entidad=producto').then(setCamposDefinidos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarProducto();
  }, [cargarProducto]);

  const cargarVentas = useCallback(async () => {
    setCargandoVentas(true);
    try {
      const todas = await api<VentaDetalle[]>('/ventas');
      setVentasProducto(todas.filter((v) => v.items.some((it) => it.variante.producto.id === productoId)));
    } catch (err) {
      toast({ title: 'No se pudieron cargar las ventas', description: err instanceof ApiError ? err.message : undefined, variant: 'destructive' });
    } finally {
      setCargandoVentas(false);
    }
  }, [productoId]);

  useEffect(() => {
    if (tab === 'ventas' && puedeVerVentas && ventasProducto === null && !cargandoVentas) cargarVentas();
  }, [tab, puedeVerVentas, ventasProducto, cargandoVentas, cargarVentas]);

  const cargarMovimientos = useCallback(async (varianteId: number) => {
    setCargandoMovimientos(true);
    try {
      const datos = await api<Movimiento[]>(`/inventario/movimientos/${varianteId}`);
      setMovimientos(datos);
    } catch (err) {
      toast({ title: 'No se pudieron cargar los movimientos', description: err instanceof ApiError ? err.message : undefined, variant: 'destructive' });
    } finally {
      setCargandoMovimientos(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'movimientos' && puedeVerMovimientos && producto && varianteMovimientosId === null) {
      setVarianteMovimientosId(producto.variantes[0]?.id ?? null);
    }
  }, [tab, puedeVerMovimientos, producto, varianteMovimientosId]);

  useEffect(() => {
    if (varianteMovimientosId !== null) cargarMovimientos(varianteMovimientosId);
  }, [varianteMovimientosId, cargarMovimientos]);

  // -- Información básica ----------------------------------------------------

  async function cambiarMarcaEditProducto(marcaId: string) {
    setEditProductoForm((f) => ({ ...f, marcaId, modeloId: '' }));
    if (!marcaId) {
      setModelosEdit([]);
      return;
    }
    const m = await api<Modelo[]>(`/catalogos/modelos?marcaId=${marcaId}`);
    setModelosEdit(m);
  }

  function actualizarValorDefinido(clave: string, valor: string) {
    setEditProductoForm((f) => ({ ...f, valoresDefinidos: { ...f.valoresDefinidos, [clave]: valor } }));
  }
  function actualizarAtributo(i: number, cambios: Partial<AtributoExtra>) {
    setEditProductoForm((f) => ({ ...f, atributos: f.atributos.map((a, idx) => (idx === i ? { ...a, ...cambios } : a)) }));
  }
  function agregarAtributo() {
    setEditProductoForm((f) => ({ ...f, atributos: [...f.atributos, { clave: '', valor: '' }] }));
  }
  function quitarAtributo(i: number) {
    setEditProductoForm((f) => ({ ...f, atributos: f.atributos.filter((_, idx) => idx !== i) }));
  }

  async function guardarEdicionProducto() {
    if (!editProductoForm.nombre.trim() || !editProductoForm.marcaId || !editProductoForm.categoriaId) {
      setMensaje('Nombre, marca y categoría son obligatorios.');
      return;
    }
    for (const campo of camposDefinidos) {
      if (campo.requerido && !(editProductoForm.valoresDefinidos[campo.clave] ?? '').trim()) {
        setMensaje(`El campo "${campo.etiqueta}" es obligatorio.`);
        return;
      }
    }
    const atributosExtra: Record<string, string> = {};
    for (const [clave, valor] of Object.entries(editProductoForm.valoresDefinidos)) {
      if (valor.trim()) atributosExtra[clave] = valor;
    }
    for (const a of editProductoForm.atributos) {
      if (a.clave.trim()) atributosExtra[a.clave.trim()] = a.valor;
    }
    setGuardandoProducto(true);
    setMensaje(null);
    try {
      await api(`/productos/${productoId}`, {
        method: 'PUT',
        body: JSON.stringify({
          nombre: editProductoForm.nombre.trim(),
          marcaId: Number(editProductoForm.marcaId),
          modeloId: editProductoForm.modeloId ? Number(editProductoForm.modeloId) : null,
          categoriaId: Number(editProductoForm.categoriaId),
          precioCompra: Number(editProductoForm.precioCompra) || 0,
          precioVenta: Number(editProductoForm.precioVenta) || 0,
          descripcion: editProductoForm.descripcion.trim() || null,
          atributosExtra,
        }),
      });
      toast({ title: 'Producto actualizado', variant: 'success' });
      cargarProducto();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar el producto.');
    } finally {
      setGuardandoProducto(false);
    }
  }

  // -- Variantes ---------------------------------------------------------------

  function abrirEditarVariante(v: Variante) {
    setEditVarianteForm({ tallaId: v.talla ? String(v.talla.id) : '', color: v.color ?? '', sku: v.sku });
    setMensaje(null);
    setEditandoVarianteId(v.id);
  }
  function cancelarEdicionVariante() {
    setEditandoVarianteId(null);
  }

  async function guardarEdicionVariante(varianteId: number) {
    if (!editVarianteForm.sku.trim()) {
      setMensaje('El SKU no puede quedar vacío.');
      return;
    }
    setGuardandoEdicionVariante(true);
    setMensaje(null);
    try {
      await api(`/productos/${productoId}/variantes/${varianteId}`, {
        method: 'PUT',
        body: JSON.stringify({
          tallaId: editVarianteForm.tallaId ? Number(editVarianteForm.tallaId) : null,
          color: editVarianteForm.color || null,
          sku: editVarianteForm.sku.trim(),
        }),
      });
      setEditandoVarianteId(null);
      toast({ title: 'Variante actualizada', variant: 'success' });
      cargarProducto();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar la variante.');
    } finally {
      setGuardandoEdicionVariante(false);
    }
  }

  async function cambiarProveedorVariante(varianteId: number, proveedorId: string) {
    try {
      await api(`/productos/${productoId}/variantes/${varianteId}`, {
        method: 'PUT',
        body: JSON.stringify({ proveedorId: proveedorId ? Number(proveedorId) : null }),
      });
      cargarProducto();
    } catch (err) {
      toast({ title: 'No se pudo asignar el proveedor', description: err instanceof ApiError ? err.message : undefined, variant: 'destructive' });
    }
  }

  async function confirmarEliminarVariante() {
    if (confirmarVarianteId === null) return;
    setEliminandoVariante(true);
    try {
      await api(`/productos/${productoId}/variantes/${confirmarVarianteId}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: false }),
      });
      toast({ title: 'Variante eliminada', variant: 'success' });
      cargarProducto();
    } catch (err) {
      toast({ title: 'No se pudo eliminar la variante', description: err instanceof ApiError ? err.message : undefined, variant: 'destructive' });
    } finally {
      setEliminandoVariante(false);
      setConfirmarVarianteId(null);
    }
  }

  function abrirNuevaTalla() {
    const skuExistente = producto?.variantes[0]?.sku ?? '';
    setNuevaTallaForm({ ...nuevaVarianteFormVacio(), sku: skuExistente });
    setMensaje(null);
    setNuevaTallaAbierta(true);
  }

  async function guardarNuevaTalla() {
    if (!nuevaTallaForm.sku.trim()) {
      setMensaje('La talla nueva necesita un SKU.');
      return;
    }
    setGuardandoTalla(true);
    setMensaje(null);
    try {
      await api(`/productos/${productoId}/variantes`, {
        method: 'POST',
        body: JSON.stringify({
          tallaId: nuevaTallaForm.tallaId ? Number(nuevaTallaForm.tallaId) : undefined,
          color: nuevaTallaForm.color || undefined,
          sku: nuevaTallaForm.sku.trim(),
          proveedorId: nuevaTallaForm.proveedorId ? Number(nuevaTallaForm.proveedorId) : undefined,
          existencias: nuevaTallaSucursalId
            ? [{ sucursalId: Number(nuevaTallaSucursalId), stockActual: Number(nuevaTallaForm.stockInicial) || 0 }]
            : [],
        }),
      });
      setNuevaTallaAbierta(false);
      setNuevaTallaForm(nuevaVarianteFormVacio());
      toast({ title: 'Talla agregada', variant: 'success' });
      cargarProducto();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al agregar la talla.');
    } finally {
      setGuardandoTalla(false);
    }
  }

  // -- Archivar ------------------------------------------------------------

  async function confirmarArchivarProducto() {
    setArchivando(true);
    try {
      await api(`/productos/${productoId}`, { method: 'DELETE' });
      toast({ title: 'Producto archivado', description: 'Ya no aparece en el catálogo activo.', variant: 'success' });
      router.push('/dashboard/productos');
    } catch (err) {
      toast({ title: 'No se pudo archivar', description: err instanceof ApiError ? err.message : 'Intenta de nuevo.', variant: 'destructive' });
      setConfirmarArchivar(false);
    } finally {
      setArchivando(false);
    }
  }

  // ---------------------------------------------------------------------------

  if (cargando) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (noEncontrado || !producto) {
    return (
      <EmptyState
        icon={Package}
        title="Producto no encontrado"
        description="Puede que ya haya sido archivado o que el enlace esté equivocado."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/productos">Volver a Productos</Link>
          </Button>
        }
      />
    );
  }

  const stock = producto.variantes.reduce((total, v) => total + v.existencias.reduce((s, ex) => s + ex.stockActual, 0), 0);
  const skus = Array.from(new Set(producto.variantes.map((v) => v.sku).filter(Boolean)));

  return (
    <div className="space-y-5">
      <PageHeader
        title={producto.nombre}
        subtitle={`${producto.marca?.nombre ?? ''}${producto.modelo ? ` · ${producto.modelo.nombre}` : ''} · ${producto.categoria?.nombre ?? ''}`}
        breadcrumbs={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Productos', href: '/dashboard/productos' },
          { label: producto.nombre },
        ]}
        actions={
          puedeArchivar && (
            <Button variant="outline" size="sm" onClick={() => setConfirmarArchivar(true)} className="text-destructive hover:bg-destructive/10">
              <Archive className="w-4 h-4" />
              Archivar
            </Button>
          )
        }
      />

      {/* Resumen */}
      <div className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-card p-4">
        <ProductoThumb url={imagenPrincipal(producto)} alt={producto.nombre} size={64} />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">SKU</p>
            <p className="font-medium">{skus.length > 0 ? skus.join(', ') : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Precio de venta</p>
            <p className="font-medium tabular-nums">${producto.precioVenta}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Precio de compra</p>
            <p className="font-medium tabular-nums">${producto.precioCompra}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Variantes</p>
            <p className="font-medium">{producto.variantes.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Stock total</p>
            <StatusBadge tono={tonoPorStock(stock)}>
              {stock} {stock === 1 ? 'unidad' : 'unidades'} · {etiquetaPorStock(stock)}
            </StatusBadge>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={cambiarTab}>
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="variantes">Variantes</TabsTrigger>
          <TabsTrigger value="inventario">Inventario</TabsTrigger>
          {puedeVerVentas && <TabsTrigger value="ventas">Ventas</TabsTrigger>}
          {puedeVerMovimientos && <TabsTrigger value="movimientos">Movimientos</TabsTrigger>}
          <TabsTrigger value="fotos">Fotos</TabsTrigger>
        </TabsList>

        {/* Información -------------------------------------------------- */}
        <TabsContent value="info" className="space-y-6 max-w-2xl">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Información básica</p>
            <div>
              <label>Nombre</label>
              <Input value={editProductoForm.nombre} onChange={(e) => setEditProductoForm((f) => ({ ...f, nombre: e.target.value }))} disabled={!puedeEditar} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label>Marca</label>
                <Select value={editProductoForm.marcaId} onChange={(e) => cambiarMarcaEditProducto(e.target.value)} disabled={!puedeEditar}>
                  <option value="">Selecciona…</option>
                  {marcas.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label>Modelo</label>
                <Select value={editProductoForm.modeloId} onChange={(e) => setEditProductoForm((f) => ({ ...f, modeloId: e.target.value }))} disabled={!puedeEditar || modelosEdit.length === 0}>
                  <option value="">Sin modelo</option>
                  {modelosEdit.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label>Categoría</label>
                <Select value={editProductoForm.categoriaId} onChange={(e) => setEditProductoForm((f) => ({ ...f, categoriaId: e.target.value }))} disabled={!puedeEditar}>
                  <option value="">Selecciona…</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label>Precio de compra</label>
                <Input type="number" min={0} value={editProductoForm.precioCompra} onChange={(e) => setEditProductoForm((f) => ({ ...f, precioCompra: e.target.value }))} disabled={!puedeEditar} />
              </div>
              <div>
                <label>Precio de venta</label>
                <Input type="number" min={0} value={editProductoForm.precioVenta} onChange={(e) => setEditProductoForm((f) => ({ ...f, precioVenta: e.target.value }))} disabled={!puedeEditar} />
              </div>
            </div>
            <div>
              <label>Descripción (opcional)</label>
              <textarea
                value={editProductoForm.descripcion}
                onChange={(e) => setEditProductoForm((f) => ({ ...f, descripcion: e.target.value }))}
                rows={3}
                style={{ resize: 'vertical' }}
                placeholder="Detalles del producto, uso recomendado, etc."
                disabled={!puedeEditar}
              />
            </div>
          </div>

          {camposDefinidos.length > 0 && (
            <div className="space-y-3 border-t border-border pt-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campos personalizados</p>
                <p className="text-xs text-muted-foreground mt-1">Definidos en Catálogo → &quot;Campos personalizados&quot;.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {camposDefinidos.map((campo) => {
                  const valor = editProductoForm.valoresDefinidos[campo.clave] ?? '';
                  return (
                    <div key={campo.id}>
                      <label>
                        {campo.etiqueta}
                        {campo.requerido && <span className="text-destructive"> *</span>}
                      </label>
                      {campo.tipo === 'BOOLEANO' ? (
                        <input type="checkbox" checked={valor === 'true'} onChange={(e) => actualizarValorDefinido(campo.clave, e.target.checked ? 'true' : 'false')} disabled={!puedeEditar} />
                      ) : campo.tipo === 'SELECT' ? (
                        <Select value={valor} onChange={(e) => actualizarValorDefinido(campo.clave, e.target.value)} disabled={!puedeEditar}>
                          <option value="">— Selecciona —</option>
                          {campo.opciones.map((op) => (
                            <option key={op} value={op}>{op}</option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          type={campo.tipo === 'NUMERO' ? 'number' : campo.tipo === 'FECHA' ? 'date' : 'text'}
                          value={valor}
                          onChange={(e) => actualizarValorDefinido(campo.clave, e.target.value)}
                          disabled={!puedeEditar}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {puedeEditar && (
            <div className="space-y-3 border-t border-border pt-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atributos extra</p>
                <p className="text-xs text-muted-foreground mt-1">Información libre para lo que todavía no tiene un campo definido arriba — materiales, cuidados, garantía, etc.</p>
              </div>
              <div className="space-y-2">
                {editProductoForm.atributos.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input placeholder="Nombre (ej. Material)" value={a.clave} onChange={(e) => actualizarAtributo(i, { clave: e.target.value })} className="w-40" />
                    <Input placeholder="Valor (ej. Piel sintética)" value={a.valor} onChange={(e) => actualizarAtributo(i, { valor: e.target.value })} className="flex-1" />
                    <Button variant="ghost" size="icon" onClick={() => quitarAtributo(i)} aria-label="Quitar atributo">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={agregarAtributo}>
                <Plus className="w-3.5 h-3.5" />
                Agregar atributo
              </Button>
            </div>
          )}

          {mensaje && <p className="text-sm text-destructive">{mensaje}</p>}

          {puedeEditar && (
            <div className="flex justify-end gap-2 border-t border-border pt-5">
              <Button onClick={guardarEdicionProducto} disabled={guardandoProducto}>
                {guardandoProducto ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Variantes ------------------------------------------------------ */}
        <TabsContent value="variantes" className="space-y-4">
          <table>
            <thead>
              <tr>
                <th>Talla</th>
                <th>Color</th>
                <th>SKU (fábrica)</th>
                <th>Código interno</th>
                <th>Stock por sucursal</th>
                <th>Proveedor</th>
                {puedeEditar && <th></th>}
              </tr>
            </thead>
            <tbody>
              {producto.variantes.map((v) =>
                editandoVarianteId === v.id ? (
                  <tr key={v.id}>
                    <td>
                      <Select value={editVarianteForm.tallaId} onChange={(e) => setEditVarianteForm((f) => ({ ...f, tallaId: e.target.value }))} wrapperClassName="w-24">
                        <option value="">Sin talla</option>
                        {tallas.map((t) => (
                          <option key={t.id} value={t.id}>{t.tipo}: {t.valor}</option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      <Input value={editVarianteForm.color} onChange={(e) => setEditVarianteForm((f) => ({ ...f, color: e.target.value }))} placeholder="Color" className="w-20" />
                    </td>
                    <td>
                      <Input value={editVarianteForm.sku} onChange={(e) => setEditVarianteForm((f) => ({ ...f, sku: e.target.value }))} placeholder="SKU de fábrica" className="w-28" />
                    </td>
                    <td className="text-xs text-muted-foreground">{v.codigoInterno}</td>
                    <td className="whitespace-normal">
                      {v.existencias.length > 0 ? v.existencias.map((ex) => `${ex.sucursal?.nombre ?? '—'}: ${ex.stockActual}`).join(', ') : '—'}
                    </td>
                    <td>{v.proveedor?.nombre ?? '—'}</td>
                    <td className="whitespace-nowrap">
                      <Button size="sm" onClick={() => guardarEdicionVariante(v.id)} disabled={guardandoEdicionVariante}>
                        {guardandoEdicionVariante ? '…' : 'Guardar'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={cancelarEdicionVariante}>Cancelar</Button>
                    </td>
                  </tr>
                ) : (
                  <tr key={v.id}>
                    <td>{v.talla?.valor ?? '—'}</td>
                    <td>{v.color ?? '—'}</td>
                    <td>{v.sku}</td>
                    <td className="text-xs text-muted-foreground">{v.codigoInterno}</td>
                    <td className="whitespace-normal">
                      {v.existencias.length > 0 ? v.existencias.map((ex) => `${ex.sucursal?.nombre ?? '—'}: ${ex.stockActual}`).join(', ') : '—'}
                    </td>
                    <td>
                      {puedeEditar ? (
                        <Select value={v.proveedor?.id ?? ''} onChange={(e) => cambiarProveedorVariante(v.id, e.target.value)} wrapperClassName="w-36">
                          <option value="">Sin proveedor</option>
                          {proveedores.map((prov) => (
                            <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                          ))}
                        </Select>
                      ) : (
                        v.proveedor?.nombre ?? '—'
                      )}
                    </td>
                    {puedeEditar && (
                      <td className="whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => abrirEditarVariante(v)}>Editar</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmarVarianteId(v.id)}>Eliminar</Button>
                      </td>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>

          {puedeEditar &&
            (nuevaTallaAbierta ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="w-28">
                  <Select value={nuevaTallaForm.tallaId} onChange={(e) => setNuevaTallaForm((f) => ({ ...f, tallaId: e.target.value }))}>
                    <option value="">Sin talla</option>
                    {tallas.map((t) => (
                      <option key={t.id} value={t.id}>{t.tipo}: {t.valor}</option>
                    ))}
                  </Select>
                </div>
                <Input placeholder="Color" value={nuevaTallaForm.color} onChange={(e) => setNuevaTallaForm((f) => ({ ...f, color: e.target.value }))} className="w-24" />
                <Input placeholder="SKU de fábrica" value={nuevaTallaForm.sku} onChange={(e) => setNuevaTallaForm((f) => ({ ...f, sku: e.target.value }))} className="w-32" />
                <div className="w-36">
                  <Select value={nuevaTallaSucursalId} onChange={(e) => setNuevaTallaSucursalId(e.target.value)}>
                    {sucursales.map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </Select>
                </div>
                <Input type="number" placeholder="Stock inicial" value={nuevaTallaForm.stockInicial} onChange={(e) => setNuevaTallaForm((f) => ({ ...f, stockInicial: e.target.value }))} className="w-24" />
                <div className="w-32">
                  <Select value={nuevaTallaForm.proveedorId} onChange={(e) => setNuevaTallaForm((f) => ({ ...f, proveedorId: e.target.value }))}>
                    <option value="">Sin proveedor</option>
                    {proveedores.map((prov) => (
                      <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                    ))}
                  </Select>
                </div>
                <Button size="sm" onClick={guardarNuevaTalla} disabled={guardandoTalla}>{guardandoTalla ? 'Guardando…' : 'Guardar talla'}</Button>
                <Button variant="ghost" size="sm" onClick={() => setNuevaTallaAbierta(false)}>Cancelar</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={abrirNuevaTalla}>
                <Plus className="w-3.5 h-3.5" />
                Agregar talla
              </Button>
            ))}

          {mensaje && <p className="text-sm text-destructive">{mensaje}</p>}
        </TabsContent>

        {/* Inventario (solo lectura — entradas/salidas se hacen en Inventario) */}
        <TabsContent value="inventario" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Existencias por sucursal y proveedor.</p>
            {puedeVerMovimientos && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/inventario">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Ir a Inventario
                </Link>
              </Button>
            )}
          </div>
          {(() => {
            const filas = producto.variantes.flatMap((v) =>
              v.existencias.length > 0
                ? v.existencias.map((ex) => ({ variante: v, existencia: ex }))
                : [{ variante: v, existencia: null as Existencia | null }]
            );
            if (filas.length === 0) {
              return <EmptyState icon={Warehouse} title="Sin existencias registradas" description="Este producto todavía no tiene stock cargado en ninguna sucursal." />;
            }
            return (
              <table>
                <thead>
                  <tr>
                    <th>Talla</th>
                    <th>Color</th>
                    <th>Sucursal</th>
                    <th>Proveedor</th>
                    <th>Stock</th>
                    <th>Mínimo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(({ variante, existencia }, i) => {
                    const actual = existencia?.stockActual ?? 0;
                    return (
                      <tr key={`${variante.id}-${existencia?.id ?? 'sin-existencia'}-${i}`}>
                        <td>{variante.talla?.valor ?? '—'}</td>
                        <td>{variante.color ?? '—'}</td>
                        <td>{existencia?.sucursal?.nombre ?? '—'}</td>
                        <td>{existencia?.proveedor?.nombre ?? '—'}</td>
                        <td className="tabular-nums">{actual}</td>
                        <td className="tabular-nums text-muted-foreground">{existencia?.stockMinimo ?? 0}</td>
                        <td>
                          <StatusBadge tono={tonoPorStock(actual, existencia?.stockMinimo ?? 5)}>{etiquetaPorStock(actual, existencia?.stockMinimo ?? 5)}</StatusBadge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </TabsContent>

        {/* Ventas ----------------------------------------------------------- */}
        {puedeVerVentas && (
          <TabsContent value="ventas" className="space-y-4">
            {cargandoVentas ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !ventasProducto || ventasProducto.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="Sin ventas todavía" description="Este producto no aparece en ninguna venta registrada." />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Fecha</th>
                    <th>Sucursal</th>
                    <th>Talla / color</th>
                    <th>Cantidad</th>
                    <th>Importe</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ventasProducto.map((v) =>
                    v.items
                      .filter((it) => it.variante.producto.id === productoId)
                      .map((it) => (
                        <tr key={`${v.id}-${it.id}`}>
                          <td className="font-medium">{v.folio}</td>
                          <td className="text-muted-foreground">{formatearFecha(v.createdAt)}</td>
                          <td>{v.sucursal?.nombre ?? '—'}</td>
                          <td>{[it.variante.talla?.valor, it.variante.color].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="tabular-nums">{it.cantidad}</td>
                          <td className="tabular-nums font-medium">${it.subtotal ?? (Number(it.precioUnitario) * it.cantidad).toFixed(2)}</td>
                          <td>
                            <StatusBadge tono={v.estado === 'CANCELADA' ? 'destructive' : v.estado === 'COMPLETADA' ? 'success' : 'neutral'}>{v.estado}</StatusBadge>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            )}
          </TabsContent>
        )}

        {/* Movimientos -------------------------------------------------- */}
        {puedeVerMovimientos && (
          <TabsContent value="movimientos" className="space-y-4">
            <div className="w-64">
              <Select value={varianteMovimientosId ?? ''} onChange={(e) => setVarianteMovimientosId(Number(e.target.value))}>
                {producto.variantes.map((v) => (
                  <option key={v.id} value={v.id}>
                    {[v.talla?.valor, v.color].filter(Boolean).join(' · ') || v.sku}
                  </option>
                ))}
              </Select>
            </div>
            {cargandoMovimientos ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !movimientos || movimientos.length === 0 ? (
              <EmptyState icon={History} title="Sin movimientos todavía" description="Esta variante no tiene entradas, salidas ni ajustes registrados." />
            ) : (
              <ActivityFeed
                items={movimientos.map(
                  (m): ActivityItem => ({
                    id: String(m.id),
                    icon: m.tipo === 'ENTRADA' ? TrendingUp : m.tipo === 'SALIDA' ? TrendingDown : RefreshCw,
                    tone: m.tipo === 'ENTRADA' ? 'success' : m.tipo === 'SALIDA' ? 'destructive' : 'neutral',
                    title: `${m.tipo === 'ENTRADA' ? 'Entrada' : m.tipo === 'SALIDA' ? 'Salida' : 'Ajuste'} de ${Math.abs(m.cantidad)} · ${m.sucursal?.nombre ?? '—'}`,
                    detail: [m.usuario?.nombre, m.proveedor?.nombre, m.motivo].filter(Boolean).join(' · ') || undefined,
                    timestamp: formatearFechaHora(m.createdAt),
                  })
                )}
              />
            )}
          </TabsContent>
        )}

        {/* Fotos ------------------------------------------------------------ */}
        <TabsContent value="fotos">
          {puedeEditar ? (
            <GaleriaFotos productoId={producto.id} imagenes={producto.imagenes} colores={producto.variantes.map((v) => v.color)} onCambio={cargarProducto} />
          ) : producto.imagenes.length === 0 ? (
            <EmptyState icon={Camera} title="Sin fotos" description="Este producto todavía no tiene fotos cargadas." />
          ) : (
            <div className="flex flex-wrap gap-3">
              {producto.imagenes.map((img) => (
                <ProductoThumb key={img.id} url={img.url} alt={producto.nombre} size={90} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmarVarianteId !== null}
        onOpenChange={(open) => !open && setConfirmarVarianteId(null)}
        title="¿Eliminar esta variante?"
        description="Ya no aparecerá en Inventario ni en la tienda en línea."
        confirmLabel="Eliminar"
        onConfirm={confirmarEliminarVariante}
        loading={eliminandoVariante}
      />

      <ConfirmDialog
        open={confirmarArchivar}
        onOpenChange={setConfirmarArchivar}
        title={`¿Archivar "${producto.nombre}"?`}
        description="Dejará de aparecer en el catálogo activo, en Inventario y en la tienda en línea. No se pierde su historial de ventas."
        confirmLabel="Archivar"
        onConfirm={confirmarArchivarProducto}
        loading={archivando}
      />
    </div>
  );
}
