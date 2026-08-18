'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Layers,
  Camera,
  Sparkles,
  FileSpreadsheet,
  Archive,
  X,
  Package,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import { Imagen } from '@/components/admin/GaleriaFotos';
import { ProductoThumb, imagenPrincipal } from '@/components/admin/ProductoThumb';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { StatusBadge, tonoPorStock, etiquetaPorStock } from '@/components/ui/status-badge';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter } from '@/components/ui/drawer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';

interface Existencia {
  stockActual: number;
  sucursal: { id: number; nombre: string };
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

interface ProductosPaginados {
  data: Producto[];
  total: number;
  page: number;
  totalPages: number;
}

const PRODUCTOS_POR_PAGINA = 30;

interface VarianteForm {
  tallaId: string;
  color: string;
  sku: string;
  stockInicial: string;
  proveedorId: string;
}

function nuevaVarianteForm(): VarianteForm {
  return { tallaId: '', color: '', sku: '', stockInicial: '0', proveedorId: '' };
}

export default function ProductosPage() {
  const { usuario } = useAuth();
  const router = useRouter();
  // VENTAS puede entrar a Productos para consultar (nombre, SKU, existencia),
  // pero por el momento no debe poder editar nada aquí: ni cambiar fotos, ni
  // editar el producto, ni dar de alta tallas nuevas — mismo criterio que en
  // Inventario, donde ese rol tampoco ve los botones de Entrada/Salida.
  const puedeCrear = usuario ? puedeVer('inventario', usuario.rol) && usuario.rol !== 'VENTAS' : false;
  // Archivar (baja lógica) está más restringido en el backend (DELETE
  // /productos/:id solo acepta ADMIN_PRINCIPAL/DESARROLLO) — el menú de
  // acciones solo debe ofrecerlo a quien realmente puede usarlo.
  const puedeArchivar = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';

  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);

  // Archivar producto (baja lógica) — con confirmación.
  const [archivando, setArchivando] = useState<Producto | null>(null);
  const [archivandoEnProceso, setArchivandoEnProceso] = useState(false);

  // Catálogos para el formulario de alta y para los filtros del listado
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  // Modelos del filtro: dependen de la marca elegida en el filtro (no del
  // formulario de alta), se recargan cada vez que cambia esa marca.
  const [modelosFiltro, setModelosFiltro] = useState<Modelo[]>([]);

  // Filtros del listado (además de la búsqueda por texto que ya existía)
  const [filtroMarcaId, setFiltroMarcaId] = useState('');
  const [filtroCategoriaId, setFiltroCategoriaId] = useState('');
  const [filtroModeloId, setFiltroModeloId] = useState('');
  const [filtroTallaId, setFiltroTallaId] = useState('');
  const hayFiltrosActivos = Boolean(filtroMarcaId || filtroCategoriaId || filtroModeloId || filtroTallaId || busqueda);

  // Paginación: con el catálogo creciendo (600+ productos) traer todo de una
  // vez volvía lento tanto el backend como el render de la tabla.
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [totalProductos, setTotalProductos] = useState(0);

  // Campos del nuevo producto
  const [nombre, setNombre] = useState('');
  const [marcaId, setMarcaId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [precioCompra, setPrecioCompra] = useState('0');
  const [precioVenta, setPrecioVenta] = useState('0');
  const [sucursalStockId, setSucursalStockId] = useState('');
  const [variantesForm, setVariantesForm] = useState<VarianteForm[]>([nuevaVarianteForm()]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargarProductos(paginaDestino = pagina) {
    setCargando(true);
    const qs = new URLSearchParams();
    if (busqueda) qs.set('q', busqueda);
    if (filtroMarcaId) qs.set('marcaId', filtroMarcaId);
    if (filtroCategoriaId) qs.set('categoriaId', filtroCategoriaId);
    if (filtroModeloId) qs.set('modeloId', filtroModeloId);
    if (filtroTallaId) qs.set('tallaId', filtroTallaId);
    qs.set('page', String(paginaDestino));
    qs.set('limit', String(PRODUCTOS_POR_PAGINA));
    const resultado = await api<ProductosPaginados>(`/productos?${qs.toString()}`);
    setProductos(resultado.data);
    setTotalPaginas(resultado.totalPages);
    setTotalProductos(resultado.total);
    setPagina(resultado.page);
    setCargando(false);
  }

  useEffect(() => {
    // Marca/categoría/talla se cargan de una vez al entrar a la página: ya
    // no son solo del formulario de alta, también alimentan los filtros del
    // listado.
    api<Marca[]>('/catalogos/marcas').then(setMarcas);
    api<Categoria[]>('/catalogos/categorias').then(setCategorias);
    api<Talla[]>('/catalogos/tallas').then(setTallas);
    api<Proveedor[]>('/proveedores').then(setProveedores);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Un solo efecto controla la carga del listado: se dispara al entrar y
  // cada vez que cambia alguno de los filtros de selección (igual que en
  // Inventario); la búsqueda por texto sigue siendo manual (botón/Enter).
  // Cambiar un filtro siempre vuelve a la página 1: la página en la que
  // estabas puede ya no existir con el nuevo filtro aplicado.
  useEffect(() => {
    cargarProductos(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroMarcaId, filtroCategoriaId, filtroModeloId, filtroTallaId]);

  // Los modelos del filtro dependen de la marca elegida ahí (si no hay
  // ninguna, se listan todos). Al cambiar la marca del filtro se limpia el
  // modelo elegido, porque puede que ya no pertenezca a la marca nueva.
  useEffect(() => {
    api<Modelo[]>(`/catalogos/modelos${filtroMarcaId ? `?marcaId=${filtroMarcaId}` : ''}`).then(setModelosFiltro);
    setFiltroModeloId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroMarcaId]);

  function limpiarFiltros() {
    setBusqueda('');
    setFiltroMarcaId('');
    setFiltroCategoriaId('');
    setFiltroModeloId('');
    setFiltroTallaId('');
    cargarProductos(1);
  }

  async function abrirFormulario() {
    if (sucursales.length === 0) {
      const s = await api<Sucursal[]>('/sucursales');
      setSucursales(s);
      setSucursalStockId(usuario?.sucursalId ? String(usuario.sucursalId) : s[0] ? String(s[0].id) : '');
    }
    setMensaje(null);
    setMostrarForm(true);
  }

  function actualizarVariante(i: number, cambios: Partial<VarianteForm>) {
    setVariantesForm((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...cambios } : v)));
  }

  function agregarVariante() {
    setVariantesForm((prev) => [...prev, nuevaVarianteForm()]);
  }

  function quitarVariante(i: number) {
    setVariantesForm((prev) => prev.filter((_, idx) => idx !== i));
  }

  function stockTotal(p: Producto) {
    return p.variantes.reduce(
      (total, v) => total + v.existencias.reduce((s, ex) => s + ex.stockActual, 0),
      0
    );
  }

  // SKU(s) de fábrica del producto, para verlo en la tabla principal sin
  // tener que abrir el detalle — normalmente es uno solo (un lote cubre
  // todas las tallas), pero se listan todos si el producto tiene más de uno
  // (varios lotes, o colores/modelos distintos con SKU propio).
  function skusUnicos(p: Producto) {
    const skus = Array.from(new Set(p.variantes.map((v) => v.sku).filter(Boolean)));
    return skus.length > 0 ? skus.join(', ') : '—';
  }

  async function guardarProducto() {
    if (!nombre || !marcaId || !categoriaId) {
      setMensaje('Nombre, marca y categoría son obligatorios.');
      return;
    }
    const variantesValidas = variantesForm.filter((v) => v.sku.trim());
    if (variantesValidas.length === 0) {
      setMensaje('Agrega al menos una variante con SKU.');
      return;
    }

    setGuardando(true);
    setMensaje(null);
    try {
      const creado = await api<Producto>('/productos', {
        method: 'POST',
        body: JSON.stringify({
          nombre,
          marcaId: Number(marcaId),
          categoriaId: Number(categoriaId),
          precioCompra: Number(precioCompra) || 0,
          precioVenta: Number(precioVenta) || 0,
          variantes: variantesValidas.map((v) => ({
            tallaId: v.tallaId ? Number(v.tallaId) : undefined,
            color: v.color || undefined,
            sku: v.sku.trim(),
            proveedorId: v.proveedorId ? Number(v.proveedorId) : undefined,
            existencias: sucursalStockId
              ? [
                  {
                    sucursalId: Number(sucursalStockId),
                    stockActual: Number(v.stockInicial) || 0,
                  },
                ]
              : [],
          })),
        }),
      });
      toast({ title: 'Producto creado', variant: 'success' });
      setNombre('');
      setMarcaId('');
      setCategoriaId('');
      setPrecioCompra('0');
      setPrecioVenta('0');
      setVariantesForm([nuevaVarianteForm()]);
      setMostrarForm(false);
      // Va directo al detalle del producto recién creado — ahí puede seguir
      // completando descripción, fotos, etc. sin tener que volver a buscarlo.
      router.push(`/dashboard/productos/${creado.id}`);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear el producto.');
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarArchivarProducto() {
    if (!archivando) return;
    setArchivandoEnProceso(true);
    try {
      await api(`/productos/${archivando.id}`, { method: 'DELETE' });
      toast({ title: 'Producto archivado', description: 'Ya no aparece en el catálogo activo.', variant: 'success' });
      cargarProductos();
    } catch (err) {
      toast({
        title: 'No se pudo archivar',
        description: err instanceof ApiError ? err.message : 'Intenta de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setArchivandoEnProceso(false);
      setArchivando(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Productos"
        subtitle={`${totalProductos} producto${totalProductos === 1 ? '' : 's'} en catálogo`}
        breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Productos' }]}
        actions={
          puedeCrear && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Más opciones
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/productos/importar">
                      <FileSpreadsheet className="w-4 h-4" />
                      Importar / exportar Excel
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/productos/fotos">
                      <Camera className="w-4 h-4" />
                      Subir fotos por SKU
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/productos/buscar-externo">
                      <Sparkles className="w-4 h-4" />
                      Buscar en KicksDB
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" onClick={abrirFormulario}>
                <Plus className="w-4 h-4" />
                Nuevo producto
              </Button>
            </>
          )
        }
      />

      {/* Buscador */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cargarProductos(1)}
            className="pl-9"
          />
        </div>
        <Button variant="secondary" onClick={() => cargarProductos(1)}>
          Buscar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40">
          <Select value={filtroMarcaId} onChange={(e) => setFiltroMarcaId(e.target.value)}>
            <option value="">Todas las marcas</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={filtroModeloId} onChange={(e) => setFiltroModeloId(e.target.value)} disabled={modelosFiltro.length === 0}>
            <option value="">Todos los modelos</option>
            {modelosFiltro.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={filtroCategoriaId} onChange={(e) => setFiltroCategoriaId(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={filtroTallaId} onChange={(e) => setFiltroTallaId(e.target.value)}>
            <option value="">Todas las tallas</option>
            {tallas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.tipo}: {t.valor}
              </option>
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

      {/* Tabla */}
      {cargando ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : productos.length === 0 ? (
        <EmptyState
          icon={Package}
          title={hayFiltrosActivos ? 'Sin resultados' : 'No hay productos todavía'}
          description={
            hayFiltrosActivos
              ? 'No encontramos productos que coincidan con estos filtros.'
              : 'Agrega tu primer producto para comenzar a construir tu catálogo.'
          }
          action={
            hayFiltrosActivos ? (
              <Button variant="outline" size="sm" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            ) : (
              puedeCrear && (
                <Button size="sm" onClick={abrirFormulario}>
                  <Plus className="w-4 h-4" />
                  Nuevo producto
                </Button>
              )
            )
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Producto</th>
                <th>SKU</th>
                <th>Marca / categoría</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => {
                const stock = stockTotal(p);
                return (
                  <tr
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/productos/${p.id}`)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <ProductoThumb url={imagenPrincipal(p)} alt={p.nombre} size={40} />
                    </td>
                    <td className="font-medium">{p.nombre}</td>
                    <td className="text-xs text-muted-foreground">{skusUnicos(p)}</td>
                    <td>
                      <span>{p.marca?.nombre}</span>
                      <span className="text-muted-foreground"> · {p.categoria?.nombre}</span>
                    </td>
                    <td className="font-medium tabular-nums">${p.precioVenta}</td>
                    <td className="tabular-nums">
                      {stock} {stock === 1 ? 'unidad' : 'unidades'}
                    </td>
                    <td>
                      <StatusBadge tono={tonoPorStock(stock)}>{etiquetaPorStock(stock)}</StatusBadge>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Acciones">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/productos/${p.id}`}>
                              <Pencil className="w-4 h-4" />
                              {puedeCrear ? 'Ver / editar' : 'Ver producto'}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/productos/${p.id}?tab=variantes`}>
                              <Layers className="w-4 h-4" />
                              Variantes e inventario
                            </Link>
                          </DropdownMenuItem>
                          {puedeCrear && (
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/productos/${p.id}?tab=fotos`}>
                                <Camera className="w-4 h-4" />
                                Fotos
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {puedeArchivar && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setArchivando(p)}
                                className="text-destructive focus:bg-destructive/10"
                              >
                                <Archive className="w-4 h-4" />
                                Archivar
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          <Pagination
            page={pagina}
            totalPages={totalPaginas}
            onPageChange={(pg) => cargarProductos(pg)}
            totalLabel={`${totalProductos} ${totalProductos === 1 ? 'producto' : 'productos'}`}
          />
        </>
      )}

      {/* Alta de producto */}
      <Drawer open={mostrarForm} onOpenChange={setMostrarForm}>
        <DrawerContent widthClassName="max-w-xl">
          <DrawerHeader>
            <DrawerTitle>Nuevo producto</DrawerTitle>
            <DrawerDescription>Captura la información básica y al menos una variante con SKU.</DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Información básica</p>
              <div>
                <label>Nombre</label>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tenis Runner Pro" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label>Marca</label>
                  <Select value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
                    <option value="">Selecciona…</option>
                    {marcas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label>Categoría</label>
                  <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                    <option value="">Selecciona…</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label>Precio de compra</label>
                  <Input type="number" min={0} value={precioCompra} onChange={(e) => setPrecioCompra(e.target.value)} />
                </div>
                <div>
                  <label>Precio de venta</label>
                  <Input type="number" min={0} value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} />
                </div>
              </div>
              <div>
                <label>Sucursal donde cargar el stock inicial</label>
                <Select value={sucursalStockId} onChange={(e) => setSucursalStockId(e.target.value)}>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variantes</p>
                <p className="text-xs text-muted-foreground mt-1">
                  El SKU es el código de fábrica: en calzado puede repetirse entre varias tallas del mismo lote — no
                  hace falta inventar uno distinto por talla, el sistema genera un código interno propio para cada una.
                </p>
              </div>
              <div className="space-y-2">
                {variantesForm.map((v, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5">
                    <div className="w-28">
                      <Select value={v.tallaId} onChange={(e) => actualizarVariante(i, { tallaId: e.target.value })}>
                        <option value="">Sin talla</option>
                        {tallas.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.tipo}: {t.valor}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Input
                      placeholder="Color"
                      value={v.color}
                      onChange={(e) => actualizarVariante(i, { color: e.target.value })}
                      className="w-24"
                    />
                    <Input
                      placeholder="SKU de fábrica"
                      value={v.sku}
                      onChange={(e) => actualizarVariante(i, { sku: e.target.value })}
                      className="w-32"
                    />
                    <Input
                      type="number"
                      placeholder="Stock"
                      value={v.stockInicial}
                      onChange={(e) => actualizarVariante(i, { stockInicial: e.target.value })}
                      className="w-20"
                    />
                    <div className="w-32">
                      <Select value={v.proveedorId} onChange={(e) => actualizarVariante(i, { proveedorId: e.target.value })}>
                        <option value="">Sin proveedor</option>
                        {proveedores.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {variantesForm.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => quitarVariante(i)} aria-label="Quitar variante">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={agregarVariante}>
                <Plus className="w-3.5 h-3.5" />
                Agregar variante
              </Button>
            </div>

            {mensaje && <p className="text-sm text-destructive">{mensaje}</p>}
          </DrawerBody>
          <DrawerFooter>
            <Button variant="secondary" onClick={() => setMostrarForm(false)}>
              Cancelar
            </Button>
            <Button onClick={guardarProducto} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar producto'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <ConfirmDialog
        open={Boolean(archivando)}
        onOpenChange={(open) => !open && setArchivando(null)}
        title={`¿Archivar "${archivando?.nombre}"?`}
        description="Dejará de aparecer en el catálogo activo, en Inventario y en la tienda en línea. No se pierde su historial de ventas."
        confirmLabel="Archivar"
        onConfirm={confirmarArchivarProducto}
        loading={archivandoEnProceso}
      />
    </div>
  );
}
