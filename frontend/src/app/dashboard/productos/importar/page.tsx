'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, apiUpload, apiDownload, ApiError } from '@/lib/api';

interface Sucursal {
  id: number;
  nombre: string;
}

interface FilaAnalizada {
  fila: number;
  nombre: string;
  marca: string;
  categoria: string;
  talla: string;
  color: string | null;
  sku: string;
  stockInicial: number;
  estado: 'ok' | 'omitida' | 'error';
  motivo?: string;
}

interface Analisis {
  filas: FilaAnalizada[];
  resumen: {
    totalFilas: number;
    validas: number;
    omitidas: number;
    conError: number;
    productosDistintos: number;
  };
}

interface ResultadoImportacion {
  productosCreados: number;
  productosExtendidos: number;
  variantesCreadas: number;
  filasOmitidas: number;
  filasConError: number;
}

const ESTADO_STYLE: Record<string, { color: string; label: string }> = {
  ok: { color: '#1a7d36', label: 'Se va a crear' },
  omitida: { color: '#a06a00', label: 'Omitida' },
  error: { color: 'var(--color-danger)', label: 'Error' },
};

export default function ImportarProductosPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then((data) => {
      setSucursales(data);
      if (data[0]) setSucursalId(String(data[0].id));
    });
  }, []);

  function elegirArchivo(file: File | null) {
    setArchivo(file);
    setAnalisis(null);
    setResultado(null);
    setMensaje(null);
  }

  async function verVistaPrevia() {
    if (!archivo) return;
    setCargando(true);
    setMensaje(null);
    try {
      const formData = new FormData();
      formData.append('archivo', archivo);
      const data = await apiUpload<Analisis>('/productos/importar-excel/vista-previa', formData);
      setAnalisis(data);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al leer el archivo.');
    } finally {
      setCargando(false);
    }
  }

  async function confirmarImportacion() {
    if (!archivo || !sucursalId) return;
    setCargando(true);
    setMensaje(null);
    try {
      const formData = new FormData();
      formData.append('archivo', archivo);
      const data = await apiUpload<ResultadoImportacion>(
        `/productos/importar-excel/confirmar?sucursalId=${sucursalId}`,
        formData
      );
      setResultado(data);
      setAnalisis(null);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al confirmar la importación.');
    } finally {
      setCargando(false);
    }
  }

  function reiniciar() {
    setArchivo(null);
    setAnalisis(null);
    setResultado(null);
    setMensaje(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Importar / exportar productos</h1>
        <Link href="/dashboard/productos" className="btn-secondary btn" style={{ textDecoration: 'none' }}>
          ← Volver a Productos
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 260 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>1. Descarga la plantilla</h2>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 10 }}>
            Trae dos filas de ejemplo y una hoja de instrucciones. Solo nombre, marca, categoría y SKU son
            obligatorios por fila.
          </p>
          <button
            className="btn-secondary btn"
            onClick={() => apiDownload('/productos/plantilla-excel', 'plantilla-productos.xlsx')}
          >
            Descargar plantilla
          </button>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 260 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>Exportar catálogo actual</h2>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 10 }}>
            Un Excel con todos tus productos y su stock por sucursal, para respaldo o revisión.
          </p>
          <button
            className="btn-secondary btn"
            onClick={() => apiDownload('/productos/exportar-excel', `catalogo-${Date.now()}.xlsx`)}
          >
            Exportar catálogo
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, maxWidth: 640 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>2. Sube tu Excel lleno</h2>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => elegirArchivo(e.target.files?.[0] || null)}
          style={{ marginBottom: 12 }}
        />

        {mensaje && <p style={{ fontSize: 13, marginBottom: 10, color: 'var(--color-danger)' }}>{mensaje}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={verVistaPrevia} disabled={!archivo || cargando}>
            {cargando ? 'Procesando...' : 'Ver vista previa'}
          </button>
          {(archivo || analisis || resultado) && (
            <button className="btn-secondary btn" onClick={reiniciar}>
              Empezar de nuevo
            </button>
          )}
        </div>
      </div>

      {analisis && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>3. Vista previa</h2>

          <p style={{ fontSize: 14, marginBottom: 12 }}>
            {analisis.resumen.totalFilas} filas · <strong style={{ color: '#1a7d36' }}>{analisis.resumen.validas} se van a crear</strong> ·{' '}
            <span style={{ color: '#a06a00' }}>{analisis.resumen.omitidas} omitidas</span> ·{' '}
            <span style={{ color: 'var(--color-danger)' }}>{analisis.resumen.conError} con error</span> ·{' '}
            {analisis.resumen.productosDistintos} productos distintos detectados
          </p>

          <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Producto</th>
                  <th>Marca</th>
                  <th>Talla</th>
                  <th>SKU</th>
                  <th>Stock</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {analisis.filas.map((f) => (
                  <tr key={f.fila}>
                    <td>{f.fila}</td>
                    <td>{f.nombre}</td>
                    <td>{f.marca}</td>
                    <td>{f.talla || '—'}</td>
                    <td>{f.sku}</td>
                    <td>{f.stockInicial}</td>
                    <td style={{ color: ESTADO_STYLE[f.estado].color, fontSize: 12 }}>
                      {ESTADO_STYLE[f.estado].label}
                      {f.motivo ? ` — ${f.motivo}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {analisis.resumen.validas === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
              No hay filas válidas para importar. Corrige el archivo y vuelve a subirlo.
            </p>
          ) : (
            <>
              <label style={{ fontSize: 13 }}>Sucursal donde cargar el stock inicial</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} style={{ maxWidth: 220 }}>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
                <button className="btn" onClick={confirmarImportacion} disabled={cargando || !sucursalId}>
                  {cargando ? 'Importando...' : `Confirmar e importar ${analisis.resumen.validas} filas`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {resultado && (
        <div className="card" style={{ maxWidth: 480 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Importación completada</h2>
          <p style={{ fontSize: 14, marginBottom: 4 }}>Productos nuevos creados: {resultado.productosCreados}</p>
          <p style={{ fontSize: 14, marginBottom: 4 }}>
            Productos existentes a los que se agregaron variantes: {resultado.productosExtendidos}
          </p>
          <p style={{ fontSize: 14, marginBottom: 4 }}>Variantes/SKU creados: {resultado.variantesCreadas}</p>
          {resultado.filasOmitidas > 0 && (
            <p style={{ fontSize: 14, marginBottom: 4, color: '#a06a00' }}>Filas omitidas: {resultado.filasOmitidas}</p>
          )}
          {resultado.filasConError > 0 && (
            <p style={{ fontSize: 14, marginBottom: 4, color: 'var(--color-danger)' }}>
              Filas con error: {resultado.filasConError}
            </p>
          )}
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <Link href="/dashboard/productos" className="btn" style={{ textDecoration: 'none' }}>
              Ver productos
            </Link>
            <button className="btn-secondary btn" onClick={reiniciar}>
              Importar otro archivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
