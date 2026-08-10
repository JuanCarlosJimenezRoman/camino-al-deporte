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
  color: string | null;
  talla: { valor: string } | null;
  proveedor: { id: number; nombre: string } | null;
  existencias: Existencia[];
}

interface Producto {
  id: number;
  nombre: string;
  precioVenta: string;
  marca: { nombre: string };
  categoria: { nombre: string };
  variantes: Variante[];
  imagenes: Imagen[];
}

interface Marca {
  id: number;
  nombre: string;
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
  const puedeCrear = usuario ? puedeVer('inventario', usuario.rol) : false;

  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [galeriaAbiertaId, setGaleriaAbiertaId] = useState<number | null>(null);

  // Catálogos para el formulario de alta
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);

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

  async function cargarProductos() {
    setCargando(true);
    const data = await api<Producto[]>(`/productos${busqueda ? `?q=${encodeURIComponent(busqueda)}` : ''}`);
    setProductos(data);
    setCargando(false);
  }

  useEffect(() => {
    cargarProductos();
    api<Proveedor[]>('/proveedores').then(setProveedores);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function abrirFormulario() {
    if (marcas.length === 0) {
      const [m, c, t, s] = await Promise.all([
        api<Marca[]>('/catalogos/marcas'),
        api<Categoria[]>('/catalogos/categorias'),
        api<Talla[]>('/catalogos/tallas'),
        api<Sucursal[]>('/sucursales'),
      ]);
      setMarcas(m);
      setCategorias(c);
      setTallas(t);
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
            <Link href="/dashboard/productos/importar" className="btn-secondary btn" style={{ textDecoration: 'none' }}>
              Importar / exportar Excel
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
                placeholder="SKU"
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

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Buscar por nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && cargarProductos()}
        />
        <button className="btn" onClick={cargarProductos}>
          Buscar
        </button>
      </div>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Foto</th>
              <th>Producto</th>
              <th>Marca</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Variantes (talla / SKU / stock por sucursal)</th>
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
                    <td>{p.marca?.nombre}</td>
                    <td>{p.categoria?.nombre}</td>
                    <td>${p.precioVenta}</td>
                    <td>
                      {p.variantes.map((v) => (
                        <div key={v.id} style={{ fontSize: 12, marginBottom: 4 }}>
                          {v.talla?.valor ?? '—'} · {v.sku}
                          {v.existencias.length > 0 && (
                            <>
                              {' '}
                              ·{' '}
                              {v.existencias
                                .map((ex) => `${ex.sucursal.nombre}: ${ex.stockActual}`)
                                .join(', ')}
                            </>
                          )}
                          {puedeCrear ? (
                            <select
                              value={v.proveedor?.id ?? ''}
                              onChange={(e) => cambiarProveedorVariante(p.id, v.id, e.target.value)}
                              style={{ fontSize: 11, marginLeft: 6, maxWidth: 130 }}
                            >
                              <option value="">Sin proveedor</option>
                              {proveedores.map((prov) => (
                                <option key={prov.id} value={prov.id}>
                                  {prov.nombre}
                                </option>
                              ))}
                            </select>
                          ) : (
                            v.proveedor && (
                              <span style={{ color: 'var(--color-muted)' }}> · {v.proveedor.nombre}</span>
                            )
                          )}
                        </div>
                      ))}
                    </td>
                    <td>
                      {puedeCrear && (
                        <button
                          className="btn-secondary btn"
                          onClick={() => setGaleriaAbiertaId(galeriaAbiertaId === p.id ? null : p.id)}
                        >
                          {galeriaAbiertaId === p.id ? 'Cerrar fotos' : 'Fotos'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {galeriaAbiertaId === p.id && (
                    <tr>
                      <td colSpan={7} style={{ background: '#fafafa' }}>
                        <GaleriaFotos productoId={p.id} imagenes={p.imagenes} onCambio={cargarProductos} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {productos.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: 'var(--color-muted)' }}>
                  Sin productos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
