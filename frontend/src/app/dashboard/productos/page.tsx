'use client';

import { useEffect, useState } from 'react';
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
import { GaleriaFotos, Imagen } from '@/components/GaleriaFotos';
import { ProductoThumb, imagenPrincipal } from '@/components/ProductoThumb';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { StatusBadge, tonoPorStock, etiquetaPorStock } from '@/components/ui/status-badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  // Código propio del sistema, único de verdad (a diferencia del SKU de
  // fábrica, que en calzado se repite a propósito entre tallas del mismo
  // lote — ver docs/ARQUITECTURA.md).
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

interface EditVarianteForm {
  tallaId: string;
  color: string;
  sku: string;
}

// Un par clave/valor libre (ej. "Material" / "Piel sintética") para info
// extra opcional del producto — se guarda tal cual en Producto.atributosExtra
// (JSON). Sigue existiendo como respaldo para lo que no tiene un campo
// definido en Catálogo → "Campos personalizados": lo que sí tiene un campo
// definido ahí se edita con el input tipado correspondiente (ver
// CampoPersonalizado / valoresDefinidos abajo), no como par libre.
interface AtributoExtra {
  clave: string;
  valor: string;
}

// Definición de un campo creado en Catálogo → "Campos personalizados"
// (ver GET /catalogos/campos-personalizados?entidad=producto). Con esto el
// formulario ya no depende de que alguien escriba la clave "a mano" cada
// vez: para estos campos se renderiza el input correcto según `tipo` y se
// valida `requerido` antes de guardar.
interface CampoPersonalizado {
  id: number;
  clave: string;
  etiqueta: string;
  tipo: 'TEXTO' | 'NUMERO' | 'BOOLEANO' | 'FECHA' | 'SELECT';
  opciones: string[];
  requerido: boolean;
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

type DrawerTab = 'info' | 'variantes' | 'fotos';

export default function ProductosPage() {
  const { usuario } = useAuth();
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

  // Un solo drawer por producto, con pestañas — reemplaza lo que antes eran
  // tres expansiones inline independientes (editar / ver variantes / fotos).
  const [drawerProductoId, setDrawerProductoId] = useState<number | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('info');

  const [nuevaTallaAbiertaId, setNuevaTallaAbiertaId] = useState<number | null>(null);
  const [nuevaTallaForm, setNuevaTallaForm] = useState<VarianteForm>(nuevaVarianteForm());
  const [nuevaTallaSucursalId, setNuevaTallaSucursalId] = useState('');
  const [guardandoTalla, setGuardandoTalla] = useState(false);
  // Edición de una variante ya existente (corregir talla/color/SKU cuando se
  // cargó mal al registrar stock — ver docs/ARQUITECTURA.md).
  const [editandoVarianteId, setEditandoVarianteId] = useState<number | null>(null);
  const [editVarianteForm, setEditVarianteForm] = useState<EditVarianteForm>({ tallaId: '', color: '', sku: '' });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  // Confirmación antes de eliminar una variante (antes era un window.confirm
  // nativo — se reemplaza por el ConfirmDialog del sistema de diseño).
  const [confirmarVariante, setConfirmarVariante] = useState<{ productoId: number; varianteId: number } | null>(null);
  const [eliminandoVariante, setEliminandoVariante] = useState(false);

  // Editar datos generales del producto (precio, descripción, atributos
  // extra opcionales como materiales/información) sin tocar sus variantes.
  const [editProductoForm, setEditProductoForm] = useState<EditProductoForm>(formVacioProducto());
  const [modelosEdit, setModelosEdit] = useState<Modelo[]>([]);
  const [guardandoProducto, setGuardandoProducto] = useState(false);

  // Archivar producto (baja lógica) — con confirmación.
  const [archivando, setArchivando] = useState<Producto | null>(null);
  const [archivandoEnProceso, setArchivandoEnProceso] = useState(false);

  // Catálogos para el formulario de alta y para los filtros del listado
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  // Campos definidos en Catálogo → "Campos personalizados" para la entidad
  // "producto" (ver docs/ARQUITECTURA.md, sección "Campos personalizados").
  const [camposDefinidos, setCamposDefinidos] = useState<CampoPersonalizado[]>([]);
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
    api<CampoPersonalizado[]>('/catalogos/campos-personalizados?entidad=producto').then(setCamposDefinidos);
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

  async function cambiarProveedorVariante(productoId: number, varianteId: number, proveedorId: string) {
    try {
      await api(`/productos/${productoId}/variantes/${varianteId}`, {
        method: 'PUT',
        body: JSON.stringify({ proveedorId: proveedorId ? Number(proveedorId) : null }),
      });
      cargarProductos();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al asignar el proveedor.');
    }
  }

  // Corregir talla/color/SKU de una variante ya existente — para cuando se
  // cargó mal al registrar stock y no queda forma de arreglarlo salvo dar de
  // baja y recrear. El backend ya soportaba esto (PUT variantes/:varianteId),
  // solo faltaba conectarlo aquí.
  async function abrirEditarVariante(v: Variante) {
    if (tallas.length === 0) {
      const t = await api<Talla[]>('/catalogos/tallas');
      setTallas(t);
    }
    setEditVarianteForm({
      tallaId: v.talla ? String(v.talla.id) : '',
      color: v.color ?? '',
      sku: v.sku,
    });
    setMensaje(null);
    setEditandoVarianteId(v.id);
  }

  function cancelarEdicionVariante() {
    setEditandoVarianteId(null);
  }

  async function guardarEdicionVariante(productoId: number, varianteId: number) {
    if (!editVarianteForm.sku.trim()) {
      setMensaje('El SKU no puede quedar vacío.');
      return;
    }
    setGuardandoEdicion(true);
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
      cargarProductos();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar la variante.');
    } finally {
      setGuardandoEdicion(false);
    }
  }

  // "Eliminar" una variante no la borra físicamente: la desactiva
  // (activo: false), igual que se hace con productos completos. Es más
  // seguro que un borrado real (no rompe historial de movimientos/ventas que
  // ya la referencian) y el efecto visible es el mismo: deja de aparecer
  // aquí, en Inventario y en la tienda en línea (los tres ya filtran por
  // variantes activas). Pensado sobre todo para variantes "fantasma" creadas
  // sin talla/color por error, que se quedaban mostrándose como agotadas en
  // el selector de tallas de la tienda.
  async function confirmarEliminarVariante() {
    if (!confirmarVariante) return;
    setEliminandoVariante(true);
    try {
      await api(`/productos/${confirmarVariante.productoId}/variantes/${confirmarVariante.varianteId}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: false }),
      });
      toast({ title: 'Variante eliminada', variant: 'success' });
      cargarProductos();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al eliminar la variante.');
    } finally {
      setEliminandoVariante(false);
      setConfirmarVariante(null);
    }
  }

  // Abre el detalle de un producto en el drawer, en la pestaña indicada.
  // Precarga siempre los datos de "Información" (categorías/modelos) sin
  // importar en qué pestaña se abra, para que cambiar de pestaña dentro del
  // drawer ya abierto no dependa de una nueva carga.
  async function abrirDrawer(p: Producto, tab: DrawerTab = 'info') {
    if (categorias.length === 0) {
      const c = await api<Categoria[]>('/catalogos/categorias');
      setCategorias(c);
    }
    if (sucursales.length === 0) {
      const s = await api<Sucursal[]>('/sucursales');
      setSucursales(s);
    }
    if (tallas.length === 0) {
      const t = await api<Talla[]>('/catalogos/tallas');
      setTallas(t);
    }
    const m = await api<Modelo[]>(`/catalogos/modelos?marcaId=${p.marcaId}`);
    setModelosEdit(m);
    // Lo que ya tenía guardado el producto en atributosExtra se reparte: lo
    // que coincide con la clave de un campo definido y activo va a
    // valoresDefinidos (se edita con el input tipado); el resto queda como
    // par libre, igual que antes de que existiera esta pantalla — así un
    // producto con datos viejos "sueltos" no pierde nada al abrirse aquí.
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
    setMensaje(null);
    setDrawerProductoId(p.id);
    setDrawerTab(tab);
  }

  function actualizarValorDefinido(clave: string, valor: string) {
    setEditProductoForm((f) => ({ ...f, valoresDefinidos: { ...f.valoresDefinidos, [clave]: valor } }));
  }

  function cerrarDrawer() {
    setDrawerProductoId(null);
    setEditandoVarianteId(null);
    setNuevaTallaAbiertaId(null);
  }

  // Al cambiar de marca en el formulario de edición, los modelos disponibles
  // cambian con ella (igual que en el filtro del listado).
  async function cambiarMarcaEditProducto(marcaId: string) {
    setEditProductoForm((f) => ({ ...f, marcaId, modeloId: '' }));
    if (!marcaId) {
      setModelosEdit([]);
      return;
    }
    const m = await api<Modelo[]>(`/catalogos/modelos?marcaId=${marcaId}`);
    setModelosEdit(m);
  }

  function actualizarAtributo(i: number, cambios: Partial<AtributoExtra>) {
    setEditProductoForm((f) => ({
      ...f,
      atributos: f.atributos.map((a, idx) => (idx === i ? { ...a, ...cambios } : a)),
    }));
  }

  function agregarAtributo() {
    setEditProductoForm((f) => ({ ...f, atributos: [...f.atributos, { clave: '', valor: '' }] }));
  }

  function quitarAtributo(i: number) {
    setEditProductoForm((f) => ({ ...f, atributos: f.atributos.filter((_, idx) => idx !== i) }));
  }

  async function guardarEdicionProducto(id: number) {
    if (!editProductoForm.nombre.trim() || !editProductoForm.marcaId || !editProductoForm.categoriaId) {
      setMensaje('Nombre, marca y categoría son obligatorios.');
      return;
    }
    // Los campos definidos como obligatorios (ver Catálogo → "Campos
    // personalizados") se validan antes de guardar, igual que nombre/marca/
    // categoría arriba.
    for (const campo of camposDefinidos) {
      if (campo.requerido && !(editProductoForm.valoresDefinidos[campo.clave] ?? '').trim()) {
        setMensaje(`El campo "${campo.etiqueta}" es obligatorio.`);
        return;
      }
    }
    // atributosExtra final = los campos definidos (con valor no vacío) +
    // los pares libres que sigan quedando (clave no vacía) — un solo objeto,
    // igual que espera el backend.
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
      await api(`/productos/${id}`, {
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
      cerrarDrawer();
      cargarProductos();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar el producto.');
    } finally {
      setGuardandoProducto(false);
    }
  }

  // Dar de alta una talla/color nueva en un producto que ya existe (por
  // ejemplo, llegó una talla que no se había registrado). Antes solo se podía
  // definir variantes al crear el producto o re-subiendo un Excel; el
  // backend ya tenía la ruta, solo faltaba conectarla aquí.
  async function abrirNuevaTalla(productoId: number) {
    if (!nuevaTallaSucursalId) {
      setNuevaTallaSucursalId(usuario?.sucursalId ? String(usuario.sucursalId) : sucursales[0] ? String(sucursales[0].id) : '');
    }
    // El SKU de fábrica suele repetirse entre tallas del mismo lote (ver nota
    // arriba), así que se precarga con el que ya tiene el producto para no
    // tener que volver a escribirlo — se puede cambiar si esta talla en
    // particular sí trae un SKU distinto.
    const producto = productos.find((p) => p.id === productoId);
    const skuExistente = producto?.variantes[0]?.sku ?? '';
    setNuevaTallaForm({ ...nuevaVarianteForm(), sku: skuExistente });
    setMensaje(null);
    setNuevaTallaAbiertaId(productoId);
  }

  async function guardarNuevaTalla(productoId: number) {
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
            ? [
                {
                  sucursalId: Number(nuevaTallaSucursalId),
                  stockActual: Number(nuevaTallaForm.stockInicial) || 0,
                },
              ]
            : [],
        }),
      });
      setNuevaTallaAbiertaId(null);
      setNuevaTallaForm(nuevaVarianteForm());
      toast({ title: 'Talla agregada', variant: 'success' });
      cargarProductos();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al agregar la talla.');
    } finally {
      setGuardandoTalla(false);
    }
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
      await api('/productos', {
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
      cargarProductos();
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
      if (drawerProductoId === archivando.id) cerrarDrawer();
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

  const productoActivo = productos.find((p) => p.id === drawerProductoId) ?? null;

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
                    onClick={() => abrirDrawer(p, 'info')}
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
                          <DropdownMenuItem onClick={() => abrirDrawer(p, 'info')}>
                            <Pencil className="w-4 h-4" />
                            {puedeCrear ? 'Ver / editar' : 'Ver producto'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => abrirDrawer(p, 'variantes')}>
                            <Layers className="w-4 h-4" />
                            Variantes e inventario
                          </DropdownMenuItem>
                          {puedeCrear && (
                            <DropdownMenuItem onClick={() => abrirDrawer(p, 'fotos')}>
                              <Camera className="w-4 h-4" />
                              Fotos
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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

      {/* Detalle / edición de producto */}
      <Drawer open={Boolean(productoActivo)} onOpenChange={(open) => !open && cerrarDrawer()}>
        <DrawerContent widthClassName="max-w-2xl">
          {productoActivo && (
            <Tabs value={drawerTab} onValueChange={(v) => setDrawerTab(v as DrawerTab)} className="flex flex-col h-full min-h-0">
              <DrawerHeader className="pb-0">
                <div className="flex items-center gap-3">
                  <ProductoThumb url={imagenPrincipal(productoActivo)} alt={productoActivo.nombre} size={44} />
                  <div className="min-w-0">
                    <DrawerTitle className="truncate">{productoActivo.nombre}</DrawerTitle>
                    <p className="text-sm text-muted-foreground truncate">
                      {productoActivo.marca?.nombre} · {skusUnicos(productoActivo)}
                    </p>
                  </div>
                </div>
                <TabsList className="mt-3 border-b-0">
                  <TabsTrigger value="info">Información</TabsTrigger>
                  <TabsTrigger value="variantes">Variantes</TabsTrigger>
                  {puedeCrear && <TabsTrigger value="fotos">Fotos</TabsTrigger>}
                </TabsList>
              </DrawerHeader>

              <div className="flex-1 min-h-0 overflow-y-auto border-t border-border">
                <TabsContent value="info" className="px-5 py-4 pt-4 space-y-6 mt-0">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Información básica</p>
                    <div>
                      <label>Nombre</label>
                      <Input
                        value={editProductoForm.nombre}
                        onChange={(e) => setEditProductoForm((f) => ({ ...f, nombre: e.target.value }))}
                        disabled={!puedeCrear}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label>Marca</label>
                        <Select
                          value={editProductoForm.marcaId}
                          onChange={(e) => cambiarMarcaEditProducto(e.target.value)}
                          disabled={!puedeCrear}
                        >
                          <option value="">Selecciona…</option>
                          {marcas.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nombre}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label>Modelo</label>
                        <Select
                          value={editProductoForm.modeloId}
                          onChange={(e) => setEditProductoForm((f) => ({ ...f, modeloId: e.target.value }))}
                          disabled={!puedeCrear || modelosEdit.length === 0}
                        >
                          <option value="">Sin modelo</option>
                          {modelosEdit.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nombre}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label>Categoría</label>
                        <Select
                          value={editProductoForm.categoriaId}
                          onChange={(e) => setEditProductoForm((f) => ({ ...f, categoriaId: e.target.value }))}
                          disabled={!puedeCrear}
                        >
                          <option value="">Selecciona…</option>
                          {categorias.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label>Precio de compra</label>
                        <Input
                          type="number"
                          min={0}
                          value={editProductoForm.precioCompra}
                          onChange={(e) => setEditProductoForm((f) => ({ ...f, precioCompra: e.target.value }))}
                          disabled={!puedeCrear}
                        />
                      </div>
                      <div>
                        <label>Precio de venta</label>
                        <Input
                          type="number"
                          min={0}
                          value={editProductoForm.precioVenta}
                          onChange={(e) => setEditProductoForm((f) => ({ ...f, precioVenta: e.target.value }))}
                          disabled={!puedeCrear}
                        />
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
                        disabled={!puedeCrear}
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
                                <input
                                  type="checkbox"
                                  checked={valor === 'true'}
                                  onChange={(e) => actualizarValorDefinido(campo.clave, e.target.checked ? 'true' : 'false')}
                                  disabled={!puedeCrear}
                                />
                              ) : campo.tipo === 'SELECT' ? (
                                <Select value={valor} onChange={(e) => actualizarValorDefinido(campo.clave, e.target.value)} disabled={!puedeCrear}>
                                  <option value="">— Selecciona —</option>
                                  {campo.opciones.map((op) => (
                                    <option key={op} value={op}>
                                      {op}
                                    </option>
                                  ))}
                                </Select>
                              ) : (
                                <Input
                                  type={campo.tipo === 'NUMERO' ? 'number' : campo.tipo === 'FECHA' ? 'date' : 'text'}
                                  value={valor}
                                  onChange={(e) => actualizarValorDefinido(campo.clave, e.target.value)}
                                  disabled={!puedeCrear}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {puedeCrear && (
                    <div className="space-y-3 border-t border-border pt-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atributos extra</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Información libre para lo que todavía no tiene un campo definido arriba — materiales, cuidados,
                          garantía, etc.
                        </p>
                      </div>
                      <div className="space-y-2">
                        {editProductoForm.atributos.map((a, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <Input
                              placeholder="Nombre (ej. Material)"
                              value={a.clave}
                              onChange={(e) => actualizarAtributo(i, { clave: e.target.value })}
                              className="w-40"
                            />
                            <Input
                              placeholder="Valor (ej. Piel sintética)"
                              value={a.valor}
                              onChange={(e) => actualizarAtributo(i, { valor: e.target.value })}
                              className="flex-1"
                            />
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
                </TabsContent>

                <TabsContent value="variantes" className="px-5 py-4 pt-4 space-y-4 mt-0">
                  <table>
                    <thead>
                      <tr>
                        <th>Talla</th>
                        <th>Color</th>
                        <th>SKU (fábrica)</th>
                        <th>Código interno</th>
                        <th>Stock por sucursal</th>
                        <th>Proveedor</th>
                        {puedeCrear && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {productoActivo.variantes.map((v) =>
                        editandoVarianteId === v.id ? (
                          <tr key={v.id}>
                            <td>
                              <Select
                                value={editVarianteForm.tallaId}
                                onChange={(e) => setEditVarianteForm((f) => ({ ...f, tallaId: e.target.value }))}
                                wrapperClassName="w-24"
                              >
                                <option value="">Sin talla</option>
                                {tallas.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.tipo}: {t.valor}
                                  </option>
                                ))}
                              </Select>
                            </td>
                            <td>
                              <Input
                                value={editVarianteForm.color}
                                onChange={(e) => setEditVarianteForm((f) => ({ ...f, color: e.target.value }))}
                                placeholder="Color"
                                className="w-20"
                              />
                            </td>
                            <td>
                              <Input
                                value={editVarianteForm.sku}
                                onChange={(e) => setEditVarianteForm((f) => ({ ...f, sku: e.target.value }))}
                                placeholder="SKU de fábrica"
                                className="w-28"
                              />
                            </td>
                            <td className="text-xs text-muted-foreground">{v.codigoInterno}</td>
                            <td className="whitespace-normal">
                              {v.existencias.length > 0
                                ? v.existencias.map((ex) => `${ex.sucursal.nombre}: ${ex.stockActual}`).join(', ')
                                : '—'}
                            </td>
                            <td>{v.proveedor?.nombre ?? '—'}</td>
                            <td className="whitespace-nowrap">
                              <Button size="sm" onClick={() => guardarEdicionVariante(productoActivo.id, v.id)} disabled={guardandoEdicion}>
                                {guardandoEdicion ? '…' : 'Guardar'}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={cancelarEdicionVariante}>
                                Cancelar
                              </Button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={v.id}>
                            <td>{v.talla?.valor ?? '—'}</td>
                            <td>{v.color ?? '—'}</td>
                            <td>{v.sku}</td>
                            <td className="text-xs text-muted-foreground">{v.codigoInterno}</td>
                            <td className="whitespace-normal">
                              {v.existencias.length > 0
                                ? v.existencias.map((ex) => `${ex.sucursal.nombre}: ${ex.stockActual}`).join(', ')
                                : '—'}
                            </td>
                            <td>
                              {puedeCrear ? (
                                <Select
                                  value={v.proveedor?.id ?? ''}
                                  onChange={(e) => cambiarProveedorVariante(productoActivo.id, v.id, e.target.value)}
                                  wrapperClassName="w-36"
                                >
                                  <option value="">Sin proveedor</option>
                                  {proveedores.map((prov) => (
                                    <option key={prov.id} value={prov.id}>
                                      {prov.nombre}
                                    </option>
                                  ))}
                                </Select>
                              ) : (
                                v.proveedor?.nombre ?? '—'
                              )}
                            </td>
                            {puedeCrear && (
                              <td className="whitespace-nowrap">
                                <Button variant="ghost" size="sm" onClick={() => abrirEditarVariante(v)}>
                                  Editar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                  onClick={() => setConfirmarVariante({ productoId: productoActivo.id, varianteId: v.id })}
                                >
                                  Eliminar
                                </Button>
                              </td>
                            )}
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>

                  {puedeCrear &&
                    (nuevaTallaAbiertaId === productoActivo.id ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="w-28">
                          <Select value={nuevaTallaForm.tallaId} onChange={(e) => setNuevaTallaForm((f) => ({ ...f, tallaId: e.target.value }))}>
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
                          value={nuevaTallaForm.color}
                          onChange={(e) => setNuevaTallaForm((f) => ({ ...f, color: e.target.value }))}
                          className="w-24"
                        />
                        <Input
                          placeholder="SKU de fábrica"
                          value={nuevaTallaForm.sku}
                          onChange={(e) => setNuevaTallaForm((f) => ({ ...f, sku: e.target.value }))}
                          className="w-32"
                        />
                        <div className="w-36">
                          <Select value={nuevaTallaSucursalId} onChange={(e) => setNuevaTallaSucursalId(e.target.value)}>
                            {sucursales.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nombre}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <Input
                          type="number"
                          placeholder="Stock inicial"
                          value={nuevaTallaForm.stockInicial}
                          onChange={(e) => setNuevaTallaForm((f) => ({ ...f, stockInicial: e.target.value }))}
                          className="w-24"
                        />
                        <div className="w-32">
                          <Select value={nuevaTallaForm.proveedorId} onChange={(e) => setNuevaTallaForm((f) => ({ ...f, proveedorId: e.target.value }))}>
                            <option value="">Sin proveedor</option>
                            {proveedores.map((prov) => (
                              <option key={prov.id} value={prov.id}>
                                {prov.nombre}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <Button size="sm" onClick={() => guardarNuevaTalla(productoActivo.id)} disabled={guardandoTalla}>
                          {guardandoTalla ? 'Guardando…' : 'Guardar talla'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setNuevaTallaAbiertaId(null)}>
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => abrirNuevaTalla(productoActivo.id)}>
                        <Plus className="w-3.5 h-3.5" />
                        Agregar talla
                      </Button>
                    ))}

                  {mensaje && <p className="text-sm text-destructive">{mensaje}</p>}
                </TabsContent>

                {puedeCrear && (
                  <TabsContent value="fotos" className="px-5 py-4 pt-4 mt-0">
                    <GaleriaFotos
                      productoId={productoActivo.id}
                      imagenes={productoActivo.imagenes}
                      colores={productoActivo.variantes.map((v) => v.color)}
                      onCambio={cargarProductos}
                    />
                  </TabsContent>
                )}
              </div>

              {drawerTab === 'info' && puedeCrear && (
                <DrawerFooter>
                  <Button variant="secondary" onClick={cerrarDrawer}>
                    Cancelar
                  </Button>
                  <Button onClick={() => guardarEdicionProducto(productoActivo.id)} disabled={guardandoProducto}>
                    {guardandoProducto ? 'Guardando…' : 'Guardar cambios'}
                  </Button>
                </DrawerFooter>
              )}
            </Tabs>
          )}
        </DrawerContent>
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirmarVariante)}
        onOpenChange={(open) => !open && setConfirmarVariante(null)}
        title="¿Eliminar esta variante?"
        description="Ya no aparecerá en Inventario ni en la tienda en línea."
        confirmLabel="Eliminar"
        onConfirm={confirmarEliminarVariante}
        loading={eliminandoVariante}
      />

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
