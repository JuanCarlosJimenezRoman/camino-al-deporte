'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

// Alta de productos a partir del catálogo externo de KicksDB (kicks.dev):
// buscas el sneaker por nombre o SKU, eliges el resultado correcto y solo
// capturas lo que de verdad es tuyo (talla, color, stock, precio) — el
// resto (marca, modelo, colorway, imagen, SKU) llega ya resuelto. Ver
// "Catálogo externo (KicksDB)" en docs/ARQUITECTURA.md y los 3 endpoints en
// backend/src/routes/catalogoExterno.js.

interface ResultadoBusqueda {
  idExterno: string;
  slug: string | null;
  titulo: string;
  marca: string | null;
  modelo: string | null;
  genero: string | null;
  sku: string | null;
  imagen: string | null;
  precioMin: number | null;
  precioMax: number | null;
  precioPromedio: number | null;
}

interface DetalleSneaker {
  idExterno: string;
  slug: string | null;
  titulo: string;
  marca: string | null;
  modelo: string | null;
  genero: string | null;
  sku: string | null;
  imagen: string | null;
  colorway: string | null;
  descripcion: string | null;
  galeria: string[];
}

interface Sucursal {
  id: number;
  nombre: string;
}
interface Categoria {
  id: number;
  nombre: string;
}

interface VarianteExternaForm {
  talla: string;
  tipoTalla: string;
  color: string;
  sku: string;
  stockInicial: string;
  stockMinimo: string;
}

function nuevaVarianteForm(skuBase: string): VarianteExternaForm {
  return { talla: '', tipoTalla: 'MENS', color: '', sku: skuBase, stockInicial: '1', stockMinimo: '0' };
}

const TIPOS_TALLA = [
  { valor: 'MENS', etiqueta: "Men's (25–32 MX)" },
  { valor: 'WMNS', etiqueta: "Women's (22–28 MX)" },
  { valor: 'GS', etiqueta: 'Grade School (20–25 MX)' },
  { valor: 'PS', etiqueta: 'Preschool (13.5–19.5 MX)' },
  { valor: 'TD', etiqueta: 'Toddler (8–13 MX)' },
  { valor: 'ropa', etiqueta: 'Ropa' },
  { valor: 'general', etiqueta: 'General / otro' },
];

interface ResultadoImportacion {
  productoCreado: boolean;
  producto: { id: number; nombre: string };
  variantes: { id?: number; sku: string; omitida?: boolean; motivo?: string }[];
}

export default function BuscarExternoPage() {
  const [query, setQuery] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoBusqueda[] | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);

  const [seleccionado, setSeleccionado] = useState<DetalleSneaker | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [sucursales, setSucursales] = useState<Sucursal[] | null>(null);
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);

  // Formulario de alta (se pre-llena al elegir un resultado)
  const [nombre, setNombre] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [colorway, setColorway] = useState('');
  const [genero, setGenero] = useState('');
  const [precioCompra, setPrecioCompra] = useState('0');
  const [precioVenta, setPrecioVenta] = useState('0');
  const [sucursalId, setSucursalId] = useState('');
  const [incluirGaleria, setIncluirGaleria] = useState(true);
  const [variantes, setVariantes] = useState<VarianteExternaForm[]>([]);

  const [guardando, setGuardando] = useState(false);
  const [mensajeGuardar, setMensajeGuardar] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);

  async function cargarCatalogosSiHaceFalta() {
    if (!sucursales) {
      const s = await api<Sucursal[]>('/sucursales');
      setSucursales(s);
      setSucursalId((actual) => actual || (s[0] ? String(s[0].id) : ''));
    }
    if (!categorias) {
      setCategorias(await api<Categoria[]>('/catalogos/categorias'));
    }
  }

  async function buscar() {
    const q = query.trim();
    if (q.length < 2) {
      setErrorBusqueda('Escribe al menos 2 caracteres.');
      return;
    }
    setBuscando(true);
    setErrorBusqueda(null);
    setResultados(null);
    try {
      const data = await api<{ data: ResultadoBusqueda[] }>(`/productos/buscar-externo?q=${encodeURIComponent(q)}`);
      setResultados(data.data);
    } catch (err) {
      setErrorBusqueda(
        err instanceof ApiError
          ? err.status === 503
            ? 'La integración con KicksDB no está configurada todavía (falta la API key en el servidor).'
            : err.message
          : 'No se pudo buscar en KicksDB.'
      );
    } finally {
      setBuscando(false);
    }
  }

  async function elegir(r: ResultadoBusqueda) {
    setCargandoDetalle(true);
    setResultado(null);
    setMensajeGuardar(null);
    await cargarCatalogosSiHaceFalta();
    try {
      const detalle = await api<DetalleSneaker>(`/productos/buscar-externo/${encodeURIComponent(r.idExterno)}`);
      setSeleccionado(detalle);
      setNombre(detalle.titulo || r.titulo || '');
      setMarca(detalle.marca || r.marca || '');
      setModelo(detalle.modelo || r.modelo || '');
      setCategoria('');
      setDescripcion(detalle.descripcion || '');
      setColorway(detalle.colorway || '');
      setGenero(detalle.genero || r.genero || '');
      setIncluirGaleria(true);
      setVariantes([nuevaVarianteForm(detalle.sku || r.sku || '')]);
    } catch (err) {
      setMensajeGuardar(
        err instanceof ApiError ? err.message : 'No se pudo traer el detalle de este producto desde KicksDB.'
      );
    } finally {
      setCargandoDetalle(false);
    }
  }

  function actualizarVariante(i: number, cambios: Partial<VarianteExternaForm>) {
    setVariantes((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...cambios } : v)));
  }

  function agregarVariante() {
    setVariantes((prev) => [...prev, nuevaVarianteForm(seleccionado?.sku || '')]);
  }

  function quitarVariante(i: number) {
    setVariantes((prev) => prev.filter((_, idx) => idx !== i));
  }

  function empezarDeNuevo() {
    setSeleccionado(null);
    setResultado(null);
    setMensajeGuardar(null);
    setVariantes([]);
  }

  async function guardar() {
    if (!seleccionado) return;
    if (!categoria.trim()) {
      setMensajeGuardar('Elige o escribe una categoría (ej. "Tenis").');
      return;
    }
    if (!sucursalId) {
      setMensajeGuardar('Elige la sucursal donde vas a cargar el stock.');
      return;
    }
    if (variantes.length === 0 || variantes.some((v) => !v.sku.trim())) {
      setMensajeGuardar('Cada talla necesita un SKU (puede repetirse entre tallas del mismo lote).');
      return;
    }

    setGuardando(true);
    setMensajeGuardar(null);
    try {
      const data = await api<ResultadoImportacion>('/productos/importar-externo', {
        method: 'POST',
        body: JSON.stringify({
          nombre,
          marca,
          modelo: modelo || undefined,
          categoria,
          descripcion: descripcion || undefined,
          precioCompra: Number(precioCompra) || 0,
          precioVenta: Number(precioVenta) || 0,
          colorway: colorway || undefined,
          genero: genero || undefined,
          fuenteExterna: 'kicksdb',
          idExterno: seleccionado.idExterno,
          skuExterno: seleccionado.sku || undefined,
          imagenUrl: seleccionado.imagen || undefined,
          galeria:
            incluirGaleria && seleccionado.galeria?.length
              ? seleccionado.galeria
                  .filter((url) => url && url !== seleccionado.imagen)
                  .slice(0, 8)
                  .map((url) => ({ url }))
              : undefined,
          sucursalId: Number(sucursalId),
          variantes: variantes.map((v) => ({
            talla: v.talla || undefined,
            tipoTalla: v.tipoTalla || undefined,
            color: v.color || undefined,
            sku: v.sku.trim(),
            stockInicial: Number(v.stockInicial) || 0,
            stockMinimo: Number(v.stockMinimo) || 0,
          })),
        }),
      });
      setResultado(data);
    } catch (err) {
      setMensajeGuardar(err instanceof ApiError ? err.message : 'No se pudo guardar el producto.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Agregar producto desde KicksDB</h1>
        <Link href="/dashboard/productos" className="btn-secondary btn" style={{ textDecoration: 'none' }}>
          ← Volver a Productos
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 20, maxWidth: 640 }}>
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>1. Busca el sneaker</h2>
        <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 10 }}>
          Por nombre ("GT Cut 3", "Jordan Luka 3") o por SKU de fábrica.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="Nike GT Cut 3"
          />
          <button className="btn" onClick={buscar} disabled={buscando} style={{ whiteSpace: 'nowrap' }}>
            {buscando ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
        {errorBusqueda && <p style={{ fontSize: 13, marginTop: 10, color: 'var(--color-danger)' }}>{errorBusqueda}</p>}
      </div>

      {resultados && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>
            {resultados.length === 0 ? 'Sin resultados' : `${resultados.length} resultados`}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {resultados.map((r) => (
              <div
                key={r.idExterno}
                className="card"
                style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <div
                  style={{
                    height: 120,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--color-panel)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  {r.imagen ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imagen} alt={r.titulo} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Sin imagen</span>
                  )}
                </div>
                <strong style={{ fontSize: 13, lineHeight: 1.3 }}>{r.titulo}</strong>
                <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  {r.marca || '—'} {r.sku ? `· ${r.sku}` : ''}
                </span>
                {(r.precioMin || r.precioMax) && (
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                    Reventa aprox: ${r.precioMin ?? '?'}–${r.precioMax ?? '?'} (referencia, no tu precio de venta)
                  </span>
                )}
                <button className="btn-secondary btn" onClick={() => elegir(r)} disabled={cargandoDetalle}>
                  {cargandoDetalle ? 'Cargando...' : 'Elegir este'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {seleccionado && !resultado && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 640 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>2. Completa y confirma</h2>

          <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
            {seleccionado.imagen && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={seleccionado.imagen}
                alt={nombre}
                style={{ width: 90, height: 90, objectFit: 'contain', borderRadius: 8, background: 'var(--color-panel)' }}
              />
            )}
            <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              {seleccionado.galeria?.length > 1 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={incluirGaleria} onChange={(e) => setIncluirGaleria(e.target.checked)} />
                  Incluir también las otras {seleccionado.galeria.length - 1} fotos de la galería de KicksDB
                </label>
              )}
              <p style={{ marginTop: 6 }}>
                Todas las fotos se vuelven a subir a tu Cloudinary (no se depende del link externo).
              </p>
            </div>
          </div>

          <label style={{ fontSize: 13 }}>Nombre</label>
          <div style={{ marginBottom: 10 }}>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Marca</label>
              <input value={marca} onChange={(e) => setMarca(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Modelo (opcional)</label>
              <input value={modelo} onChange={(e) => setModelo(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Categoría</label>
              <input
                list="lista-categorias"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Tenis"
              />
              <datalist id="lista-categorias">
                {categorias?.map((c) => (
                  <option key={c.id} value={c.nombre} />
                ))}
              </datalist>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Colorway</label>
              <input value={colorway} onChange={(e) => setColorway(e.target.value)} placeholder="Flash Crimson/Black" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Género</label>
              <input value={genero} onChange={(e) => setGenero(e.target.value)} placeholder="men" />
            </div>
          </div>

          <label style={{ fontSize: 13 }}>Descripción (opcional)</label>
          <div style={{ marginBottom: 10 }}>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
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

          <label style={{ fontSize: 13 }}>Sucursal donde cargar el stock</label>
          <div style={{ marginBottom: 14 }}>
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              <option value="">Selecciona...</option>
              {sucursales?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>

          <label style={{ fontSize: 13, fontWeight: 600 }}>Tallas que tienes físicamente</label>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2, marginBottom: 4 }}>
            El SKU viene pre-llenado con el de fábrica; en calzado puede repetirse entre varias tallas del mismo lote,
            es normal. Si la talla no existe todavía en tu catálogo, se crea sola.
          </p>
          {variantes.map((v, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={v.talla}
                onChange={(e) => actualizarVariante(i, { talla: e.target.value })}
                placeholder="Talla (ej. 27)"
                style={{ maxWidth: 100 }}
              />
              <select
                value={v.tipoTalla}
                onChange={(e) => actualizarVariante(i, { tipoTalla: e.target.value })}
                style={{ maxWidth: 190 }}
              >
                {TIPOS_TALLA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
              <input
                value={v.color}
                onChange={(e) => actualizarVariante(i, { color: e.target.value })}
                placeholder="Color (opcional)"
                style={{ maxWidth: 140 }}
              />
              <input
                value={v.sku}
                onChange={(e) => actualizarVariante(i, { sku: e.target.value })}
                placeholder="SKU"
                style={{ maxWidth: 140 }}
              />
              <input
                type="number"
                min={0}
                value={v.stockInicial}
                onChange={(e) => actualizarVariante(i, { stockInicial: e.target.value })}
                placeholder="Stock"
                style={{ maxWidth: 80 }}
              />
              <input
                type="number"
                min={0}
                value={v.stockMinimo}
                onChange={(e) => actualizarVariante(i, { stockMinimo: e.target.value })}
                placeholder="Mínimo"
                style={{ maxWidth: 80 }}
              />
              {variantes.length > 1 && (
                <button className="btn-secondary btn" onClick={() => quitarVariante(i)} style={{ padding: '6px 10px' }}>
                  Quitar
                </button>
              )}
            </div>
          ))}
          <div style={{ marginTop: 10 }}>
            <button className="btn-secondary btn" onClick={agregarVariante}>
              + Agregar otra talla
            </button>
          </div>

          {mensajeGuardar && <p style={{ fontSize: 13, marginTop: 12, color: 'var(--color-danger)' }}>{mensajeGuardar}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Agregar a mi inventario'}
            </button>
            <button className="btn-secondary btn" onClick={empezarDeNuevo}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <div className="card" style={{ maxWidth: 480 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>
            {resultado.productoCreado ? 'Producto creado' : 'Producto actualizado'}
          </h2>
          <p style={{ fontSize: 14, marginBottom: 4 }}>{resultado.producto.nombre}</p>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 4 }}>
            {resultado.variantes.filter((v) => !v.omitida).length} talla(s) agregada(s)
            {resultado.variantes.some((v) => v.omitida) &&
              ` · ${resultado.variantes.filter((v) => v.omitida).length} ya existían y se omitieron`}
          </p>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <Link href="/dashboard/productos" className="btn" style={{ textDecoration: 'none' }}>
              Ver productos
            </Link>
            <button
              className="btn-secondary btn"
              onClick={() => {
                empezarDeNuevo();
                setResultados(null);
                setQuery('');
              }}
            >
              Buscar otro
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
