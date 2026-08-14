'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import { GaleriaFotos, Imagen } from '@/components/GaleriaFotos';

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
// (JSON), sin necesidad de definir un esquema de campos de antemano.
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
    atributos: [],
  };
}

export default function ProductosPage() {
  const { usuario } = useAuth();
  // VENTAS puede entrar a Productos para consultar (nombre, SKU, existencia),
  // pero por el momento no debe poder editar nada aquí: ni cambiar fotos, ni
  // editar el producto, ni dar de alta tallas nuevas — mismo criterio que en
  // Inventario, donde ese rol tampoco ve los botones de Entrada/Salida.
  const puedeCrear = usuario ? puedeVer('inventario', usuario.rol) && usuario.rol !== 'VENTAS' : false;

  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [galeriaAbiertaId, setGaleriaAbiertaId] = useState<number | null>(null);
  const [variantesAbiertasId, setVariantesAbiertasId] = useState<number | null>(null);
  const [nuevaTallaAbiertaId, setNuevaTallaAbiertaId] = useState<number | null>(null);
  const [nuevaTallaForm, setNuevaTallaForm] = useState<VarianteForm>(nuevaVarianteForm());
  const [nuevaTallaSucursalId, setNuevaTallaSucursalId] = useState('');
  const [guardandoTalla, setGuardandoTalla] = useState(false);
  // Edición de una variante ya existente (corregir talla/color/SKU cuando se
  // cargó mal al registrar stock — ver docs/ARQUITECTURA.md).
  const [editandoVarianteId, setEditandoVarianteId] = useState<number | null>(null);
  const [editVarianteForm, setEditVarianteForm] = useState<EditVarianteForm>({ tallaId: '', color: '', sku: '' });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Editar datos generales del producto (precio, descripción, atributos
  // extra opcionales como materiales/información) sin tocar sus variantes.
  const [editandoProductoId, setEditandoProductoId] = useState<number | null>(null);
  const [editProductoForm, setEditProductoForm] = useState<EditProductoForm>(formVacioProducto());
  const [modelosEdit, setModelosEdit] = useState<Modelo[]>([]);
  const [guardandoProducto, setGuardandoProducto] = useState(false);

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

  async function abrirFormulario() {
    if (sucursales.length === 0) {
      const s = await api<Sucursal[]>('/sucursales');
      setSucursales(s);
      setSucursalStockId(usuario?.sucursalId ? String(usuario.sucursalId) : s[0] ? String(s[0].id) : '');
    }
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
  // tener que abrir "Ver variantes" — normalmente es uno solo (un lote cubre
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
      setMensaje('Variante actualizada.');
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
  async function eliminarVariante(productoId: number, varianteId: number) {
    if (!window.confirm('¿Eliminar esta variante? Ya no aparecerá en Inventario ni en la tienda en línea.')) return;
    try {
      await api(`/productos/${productoId}/variantes/${varianteId}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: false }),
      });
      setMensaje('Variante eliminada.');
      cargarProductos();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al eliminar la variante.');
    }
  }

  // Editar los datos generales de un producto: precio, descripción y
  // atributos extra opcionales (materiales, información, etc.) — sin límite
  // fijo de campos, se guardan como pares clave/valor libres en
  // Producto.atributosExtra (JSON). No toca las variantes (eso ya se hace
  // arriba, en la tabla de "Ver variantes").
  async function abrirEditarProducto(p: Producto) {
    if (categorias.length === 0) {
      const c = await api<Categoria[]>('/catalogos/categorias');
      setCategorias(c);
    }
    const m = await api<Modelo[]>(`/catalogos/modelos?marcaId=${p.marcaId}`);
    setModelosEdit(m);
    setEditProductoForm({
      nombre: p.nombre,
      marcaId: String(p.marcaId),
      modeloId: p.modeloId ? String(p.modeloId) : '',
      categoriaId: String(p.categoriaId),
      precioCompra: p.precioCompra,
      precioVenta: p.precioVenta,
      descripcion: p.descripcion ?? '',
      atributos: Object.entries(p.atributosExtra ?? {}).map(([clave, valor]) => ({
        clave,
        valor: String(valor),
      })),
    });
    setMensaje(null);
    setEditandoProductoId(p.id);
  }

  function cancelarEdicionProducto() {
    setEditandoProductoId(null);
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
    // Solo se guardan los atributos con clave no vacía; el valor puede
    // quedar vacío (ej. un campo que aún no se llena).
    const atributosExtra: Record<string, string> = {};
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
      setEditandoProductoId(null);
      setMensaje('Producto actualizado.');
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
    if (tallas.length === 0 || sucursales.length === 0) {
      const [t, s] = await Promise.all([
        api<Talla[]>('/catalogos/tallas'),
        api<Sucursal[]>('/sucursales'),
      ]);
      setTallas(t);
      setSucursales(s);
      setNuevaTallaSucursalId(usuario?.sucursalId ? String(usuario.sucursalId) : s[0] ? String(s[0].id) : '');
    } else if (!nuevaTallaSucursalId) {
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
      setMensaje('Talla agregada.');
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
      setMensaje('Producto creado.');
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Productos</h1>
        {puedeCrear && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/dashboard/productos/buscar-externo" className="btn-secondary btn" style={{ textDecoration: 'none' }}>
              Buscar en KicksDB
            </Link>
            <Link href="/dashboard/productos/importar" className="btn-secondary btn" style={{ textDecoration: 'none' }}>
              Importar / exportar Excel
            </Link>
            <Link href="/dashboard/productos/fotos" className="btn-secondary btn" style={{ textDecoration: 'none' }}>
              Subir fotos por SKU
            </Link>
            <button className="btn" onClick={() => (mostrarForm ? setMostrarForm(false) : abrirFormulario())}>
              {mostrarForm ? 'Cerrar' : '+ Nuevo producto'}
            </button>
          </div>
        )}
      </div>

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 640 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Nuevo producto</h2>

          <label style={{ fontSize: 13 }}>Nombre</label>
          <div style={{ marginBottom: 10 }}>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tenis Runner Pro" />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Marca</label>
              <select value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
                <option value="">Selecciona...</option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Categoría</label>
              <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">Selecciona...</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Precio de compra</label>
              <input type="number" min={0} value={precioCompra} onChange={(e) => setPrecioCompra(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Precio de venta</label>
              <input type="number" min={0} value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} />
            </div>
          </div>

          <label style={{ fontSize: 13 }}>Sucursal donde cargar el stock inicial</label>
          <div style={{ marginBottom: 12 }}>
            <select value={sucursalStockId} onChange={(e) => setSucursalStockId(e.target.value)}>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>

          <label style={{ fontSize: 13, fontWeight: 600 }}>Variantes (talla / color / SKU / stock inicial)</label>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2, marginBottom: 4 }}>
            El SKU es el código de fábrica: en calzado puede repetirse entre varias tallas del mismo lote (ej. 26-32
            cm comparten SKU) — no hace falta inventar uno distinto por talla, el sistema genera un código interno
            propio para cada una.
          </p>
          {variantesForm.map((v, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
              <select
                value={v.tallaId}
                onChange={(e) => actualizarVariante(i, { tallaId: e.target.value })}
                style={{ maxWidth: 120 }}
              >
                <option value="">Sin talla</option>
                {tallas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.tipo}: {t.valor}
                  </option>
                ))}
              </select>
              <input
                placeholder="Color"
                value={v.color}
                onChange={(e) => actualizarVariante(i, { color: e.target.value })}
                style={{ maxWidth: 100 }}
              />
              <input
                placeholder="SKU de fábrica"
                value={v.sku}
                onChange={(e) => actualizarVariante(i, { sku: e.target.value })}
                style={{ maxWidth: 140 }}
              />
              <input
                type="number"
                placeholder="Stock"
                value={v.stockInicial}
                onChange={(e) => actualizarVariante(i, { stockInicial: e.target.value })}
                style={{ maxWidth: 90 }}
              />
              <select
                value={v.proveedorId}
                onChange={(e) => actualizarVariante(i, { proveedorId: e.target.value })}
                style={{ maxWidth: 140 }}
              >
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              {variantesForm.length > 1 && (
                <button className="btn-secondary btn" onClick={() => quitarVariante(i)}>
                  Quitar
                </button>
              )}
            </div>
          ))}
          <button className="btn-secondary btn" onClick={agregarVariante} style={{ marginTop: 10 }}>
            + Agregar variante
          </button>

          {mensaje && <p style={{ fontSize: 13, marginTop: 12 }}>{mensaje}</p>}

          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={guardarProducto} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar producto'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          placeholder="Buscar por nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && cargarProductos(1)}
          style={{ maxWidth: 240 }}
        />
        <button className="btn" onClick={() => cargarProductos(1)}>
          Buscar
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filtroMarcaId} onChange={(e) => setFiltroMarcaId(e.target.value)} style={{ maxWidth: 170 }}>
          <option value="">Todas las marcas</option>
          {marcas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        <select
          value={filtroModeloId}
          onChange={(e) => setFiltroModeloId(e.target.value)}
          disabled={modelosFiltro.length === 0}
          style={{ maxWidth: 170 }}
        >
          <option value="">Todos los modelos</option>
          {modelosFiltro.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        <select value={filtroCategoriaId} onChange={(e) => setFiltroCategoriaId(e.target.value)} style={{ maxWidth: 170 }}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select value={filtroTallaId} onChange={(e) => setFiltroTallaId(e.target.value)} style={{ maxWidth: 170 }}>
          <option value="">Todas las tallas</option>
          {tallas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.tipo}: {t.valor}
            </option>
          ))}
        </select>
        {(filtroMarcaId || filtroCategoriaId || filtroModeloId || filtroTallaId) && (
          <button
            className="btn-secondary btn"
            onClick={() => {
              setFiltroMarcaId('');
              setFiltroCategoriaId('');
              setFiltroModeloId('');
              setFiltroTallaId('');
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <>
        <table>
          <thead>
            <tr>
              <th>Foto</th>
              <th>Producto</th>
              <th>SKU</th>
              <th>Marca</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Variantes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => {
              const portada = p.imagenes.find((img) => img.esPrincipal) || p.imagenes[0];
              return (
                <Fragment key={p.id}>
                  <tr>
                    <td>
                      {portada ? (
                        <img
                          src={portada.url}
                          alt=""
                          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 6,
                            background: '#f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            color: 'var(--color-muted)',
                          }}
                        >
                          Sin foto
                        </div>
                      )}
                    </td>
                    <td>{p.nombre}</td>
                    <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>{skusUnicos(p)}</td>
                    <td>{p.marca?.nombre}</td>
                    <td>{p.categoria?.nombre}</td>
                    <td>${p.precioVenta}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-border)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {p.variantes.length} {p.variantes.length === 1 ? 'variante' : 'variantes'}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                          stock: {stockTotal(p)}
                        </span>
                        <button
                          className="btn-secondary btn"
                          style={{ fontSize: 11, padding: '3px 10px' }}
                          onClick={() =>
                            setVariantesAbiertasId(variantesAbiertasId === p.id ? null : p.id)
                          }
                        >
                          {variantesAbiertasId === p.id ? 'Ocultar' : 'Ver'}
                        </button>
                      </div>
                    </td>
                    <td>
                      {puedeCrear && (
                        <div style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
                          <button
                            className="btn-secondary btn"
                            onClick={() =>
                              editandoProductoId === p.id ? cancelarEdicionProducto() : abrirEditarProducto(p)
                            }
                          >
                            {editandoProductoId === p.id ? 'Cerrar edición' : 'Editar'}
                          </button>
                          <button
                            className="btn-secondary btn"
                            onClick={() => setGaleriaAbiertaId(galeriaAbiertaId === p.id ? null : p.id)}
                          >
                            {galeriaAbiertaId === p.id ? 'Cerrar fotos' : 'Fotos'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {editandoProductoId === p.id && (
                    <tr>
                      <td colSpan={8} style={{ background: '#fafafa' }}>
                        <div style={{ maxWidth: 640 }}>
                          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Editar producto</h3>

                          <label style={{ fontSize: 13 }}>Nombre</label>
                          <div style={{ marginBottom: 10 }}>
                            <input
                              value={editProductoForm.nombre}
                              onChange={(e) => setEditProductoForm((f) => ({ ...f, nombre: e.target.value }))}
                            />
                          </div>

                          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: 13 }}>Marca</label>
                              <select
                                value={editProductoForm.marcaId}
                                onChange={(e) => cambiarMarcaEditProducto(e.target.value)}
                              >
                                <option value="">Selecciona...</option>
                                {marcas.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.nombre}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: 13 }}>Modelo</label>
                              <select
                                value={editProductoForm.modeloId}
                                onChange={(e) => setEditProductoForm((f) => ({ ...f, modeloId: e.target.value }))}
                                disabled={modelosEdit.length === 0}
                              >
                                <option value="">Sin modelo</option>
                                {modelosEdit.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.nombre}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: 13 }}>Categoría</label>
                              <select
                                value={editProductoForm.categoriaId}
                                onChange={(e) => setEditProductoForm((f) => ({ ...f, categoriaId: e.target.value }))}
                              >
                                <option value="">Selecciona...</option>
                                {categorias.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nombre}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: 13 }}>Precio de compra</label>
                              <input
                                type="number"
                                min={0}
                                value={editProductoForm.precioCompra}
                                onChange={(e) => setEditProductoForm((f) => ({ ...f, precioCompra: e.target.value }))}
                              />
                            </div>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: 13 }}>Precio de venta</label>
                              <input
                                type="number"
                                min={0}
                                value={editProductoForm.precioVenta}
                                onChange={(e) => setEditProductoForm((f) => ({ ...f, precioVenta: e.target.value }))}
                              />
                            </div>
                          </div>

                          <label style={{ fontSize: 13 }}>Descripción (opcional)</label>
                          <div style={{ marginBottom: 12 }}>
                            <textarea
                              value={editProductoForm.descripcion}
                              onChange={(e) => setEditProductoForm((f) => ({ ...f, descripcion: e.target.value }))}
                              rows={3}
                              style={{ width: '100%', resize: 'vertical' }}
                              placeholder="Detalles del producto, uso recomendado, etc."
                            />
                          </div>

                          <label style={{ fontSize: 13, fontWeight: 600 }}>Atributos extra (opcional)</label>
                          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2, marginBottom: 4 }}>
                            Información adicional libre — materiales, cuidados, garantía, etc. Agrega los pares que
                            necesites; ninguno es obligatorio.
                          </p>
                          {editProductoForm.atributos.map((a, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                              <input
                                placeholder="Nombre (ej. Material)"
                                value={a.clave}
                                onChange={(e) => actualizarAtributo(i, { clave: e.target.value })}
                                style={{ maxWidth: 180 }}
                              />
                              <input
                                placeholder="Valor (ej. Piel sintética)"
                                value={a.valor}
                                onChange={(e) => actualizarAtributo(i, { valor: e.target.value })}
                                style={{ flex: 1 }}
                              />
                              <button className="btn-secondary btn" onClick={() => quitarAtributo(i)}>
                                Quitar
                              </button>
                            </div>
                          ))}
                          <button className="btn-secondary btn" onClick={agregarAtributo} style={{ marginTop: 10 }}>
                            + Agregar atributo
                          </button>

                          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                            <button
                              className="btn"
                              onClick={() => guardarEdicionProducto(p.id)}
                              disabled={guardandoProducto}
                            >
                              {guardandoProducto ? 'Guardando...' : 'Guardar cambios'}
                            </button>
                            <button className="btn-secondary btn" onClick={cancelarEdicionProducto}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {variantesAbiertasId === p.id && (
                    <tr>
                      <td colSpan={8} style={{ background: '#fafafa' }}>
                        <table style={{ minWidth: 0 }}>
                          <thead>
                            <tr>
                              <th>Talla</th>
                              <th>Color</th>
                              <th>SKU (fábrica)</th>
                              <th>Código interno</th>
                              <th style={{ whiteSpace: 'normal' }}>Stock por sucursal</th>
                              <th>Proveedor</th>
                              {puedeCrear && <th></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {p.variantes.map((v) =>
                              editandoVarianteId === v.id ? (
                                <tr key={v.id}>
                                  <td>
                                    <select
                                      value={editVarianteForm.tallaId}
                                      onChange={(e) => setEditVarianteForm((f) => ({ ...f, tallaId: e.target.value }))}
                                      style={{ fontSize: 12, maxWidth: 110 }}
                                    >
                                      <option value="">Sin talla</option>
                                      {tallas.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.tipo}: {t.valor}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td>
                                    <input
                                      value={editVarianteForm.color}
                                      onChange={(e) => setEditVarianteForm((f) => ({ ...f, color: e.target.value }))}
                                      placeholder="Color"
                                      style={{ fontSize: 12, maxWidth: 90 }}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      value={editVarianteForm.sku}
                                      onChange={(e) => setEditVarianteForm((f) => ({ ...f, sku: e.target.value }))}
                                      placeholder="SKU de fábrica"
                                      style={{ fontSize: 12, maxWidth: 130 }}
                                    />
                                  </td>
                                  <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>{v.codigoInterno}</td>
                                  <td style={{ whiteSpace: 'normal' }}>
                                    {v.existencias.length > 0
                                      ? v.existencias
                                          .map((ex) => `${ex.sucursal.nombre}: ${ex.stockActual}`)
                                          .join(', ')
                                      : '—'}
                                  </td>
                                  <td>{v.proveedor?.nombre ?? '—'}</td>
                                  <td style={{ whiteSpace: 'nowrap' }}>
                                    <button
                                      className="btn"
                                      style={{ fontSize: 11, padding: '3px 10px', marginRight: 4 }}
                                      onClick={() => guardarEdicionVariante(p.id, v.id)}
                                      disabled={guardandoEdicion}
                                    >
                                      {guardandoEdicion ? '...' : 'Guardar'}
                                    </button>
                                    <button
                                      className="btn-secondary btn"
                                      style={{ fontSize: 11, padding: '3px 10px' }}
                                      onClick={cancelarEdicionVariante}
                                    >
                                      Cancelar
                                    </button>
                                  </td>
                                </tr>
                              ) : (
                                <tr key={v.id}>
                                  <td>{v.talla?.valor ?? '—'}</td>
                                  <td>{v.color ?? '—'}</td>
                                  <td>{v.sku}</td>
                                  <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>{v.codigoInterno}</td>
                                  <td style={{ whiteSpace: 'normal' }}>
                                    {v.existencias.length > 0
                                      ? v.existencias
                                          .map((ex) => `${ex.sucursal.nombre}: ${ex.stockActual}`)
                                          .join(', ')
                                      : '—'}
                                  </td>
                                  <td>
                                    {puedeCrear ? (
                                      <select
                                        value={v.proveedor?.id ?? ''}
                                        onChange={(e) => cambiarProveedorVariante(p.id, v.id, e.target.value)}
                                        style={{ fontSize: 12, maxWidth: 160 }}
                                      >
                                        <option value="">Sin proveedor</option>
                                        {proveedores.map((prov) => (
                                          <option key={prov.id} value={prov.id}>
                                            {prov.nombre}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      v.proveedor?.nombre ?? '—'
                                    )}
                                  </td>
                                  {puedeCrear && (
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                      <button
                                        className="btn-secondary btn"
                                        style={{ fontSize: 11, padding: '3px 10px', marginRight: 4 }}
                                        onClick={() => abrirEditarVariante(v)}
                                      >
                                        Editar
                                      </button>
                                      <button
                                        className="btn-secondary btn"
                                        style={{ fontSize: 11, padding: '3px 10px' }}
                                        onClick={() => eliminarVariante(p.id, v.id)}
                                      >
                                        Eliminar
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>

                        {puedeCrear && (
                          <div style={{ marginTop: 10 }}>
                            {nuevaTallaAbiertaId === p.id ? (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <select
                                  value={nuevaTallaForm.tallaId}
                                  onChange={(e) => setNuevaTallaForm((f) => ({ ...f, tallaId: e.target.value }))}
                                  style={{ maxWidth: 120 }}
                                >
                                  <option value="">Sin talla</option>
                                  {tallas.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.tipo}: {t.valor}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  placeholder="Color"
                                  value={nuevaTallaForm.color}
                                  onChange={(e) => setNuevaTallaForm((f) => ({ ...f, color: e.target.value }))}
                                  style={{ maxWidth: 100 }}
                                />
                                <input
                                  placeholder="SKU de fábrica"
                                  value={nuevaTallaForm.sku}
                                  onChange={(e) => setNuevaTallaForm((f) => ({ ...f, sku: e.target.value }))}
                                  style={{ maxWidth: 140 }}
                                />
                                <select
                                  value={nuevaTallaSucursalId}
                                  onChange={(e) => setNuevaTallaSucursalId(e.target.value)}
                                  style={{ maxWidth: 150 }}
                                >
                                  {sucursales.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.nombre}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  placeholder="Stock inicial"
                                  value={nuevaTallaForm.stockInicial}
                                  onChange={(e) => setNuevaTallaForm((f) => ({ ...f, stockInicial: e.target.value }))}
                                  style={{ maxWidth: 100 }}
                                />
                                <select
                                  value={nuevaTallaForm.proveedorId}
                                  onChange={(e) => setNuevaTallaForm((f) => ({ ...f, proveedorId: e.target.value }))}
                                  style={{ maxWidth: 140 }}
                                >
                                  <option value="">Sin proveedor</option>
                                  {proveedores.map((prov) => (
                                    <option key={prov.id} value={prov.id}>
                                      {prov.nombre}
                                    </option>
                                  ))}
                                </select>
                                <button className="btn" onClick={() => guardarNuevaTalla(p.id)} disabled={guardandoTalla}>
                                  {guardandoTalla ? 'Guardando...' : 'Guardar talla'}
                                </button>
                                <button className="btn-secondary btn" onClick={() => setNuevaTallaAbiertaId(null)}>
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button className="btn-secondary btn" onClick={() => abrirNuevaTalla(p.id)}>
                                + Agregar talla
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  {galeriaAbiertaId === p.id && (
                    <tr>
                      <td colSpan={8} style={{ background: '#fafafa' }}>
                        <GaleriaFotos
                          productoId={p.id}
                          imagenes={p.imagenes}
                          colores={p.variantes.map((v) => v.color)}
                          onCambio={cargarProductos}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {productos.length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: 'var(--color-muted)' }}>
                  Sin productos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {totalProductos > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <button
              className="btn-secondary btn"
              onClick={() => cargarProductos(pagina - 1)}
              disabled={pagina <= 1}
            >
              Anterior
            </button>
            <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>
              Página {pagina} de {totalPaginas} · {totalProductos} {totalProductos === 1 ? 'producto' : 'productos'}
            </span>
            <button
              className="btn-secondary btn"
              onClick={() => cargarProductos(pagina + 1)}
              disabled={pagina >= totalPaginas}
            >
              Siguiente
            </button>
          </div>
        )}
        </>
      )}
    </div>
  );
}
