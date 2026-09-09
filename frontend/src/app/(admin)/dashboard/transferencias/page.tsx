'use client';

import { Package, ArrowLeftRight, Search, LayoutGrid, Check, XCircle, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatearFechaHora } from '@/lib/utils';
import { useTransferencias } from '@/features/transferencias/hooks/useTransferencias';
import { TarjetaProducto } from '@/features/transferencias/components/TarjetaProducto';
import { ItemCarrito } from '@/features/transferencias/components/ItemCarrito';
import { SelectorCantidad } from '@/features/transferencias/components/SelectorCantidad';
import { FILTROS_ESTADO, ESTADO_TONO, ESTADO_LABEL } from '@/features/transferencias/constants';
import { agruparPorProducto, etiquetasVariantes, filtrarTransferencias } from '@/features/transferencias/utils';

export default function TransferenciasPage() {
  const {
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
    agregarAlCarrito,
    cambiarCantidad,
    quitarDelCarrito,
    enviarTraspaso,
    recibir,
    cancelar,
    limpiarFiltros,
  } = useTransferencias();

  if (!puedeGestionar) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title="Sin acceso"
        description="No tienes permiso para ver esta sección."
      />
    );
  }

  const productosAgrupados = agruparPorProducto(catalogoGrid);
  const hayFiltro = busqueda.trim().length >= 2 || categoriaId !== '';
  const productosVisibles = mostrarTodos || hayFiltro
    ? productosAgrupados
    : productosAgrupados.slice(0, 8);
  const enCarritoKeys = new Set(carrito.map((it) => it.key));
  const hayFiltrosHistorial = Boolean(filtroBusqueda || filtroEstado || filtroSucursalId);
  const transferenciasFiltradas = filtrarTransferencias(transferencias, filtroBusqueda);

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
        {/* Columna izquierda: origen/destino + catálogo */}
        <div className="card space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Sucursal de origen
              </label>
              <Select
                value={sucursalOrigenId}
                onChange={(e) => setSucursalOrigenId(e.target.value)}
              >
                <option value="">Selecciona...</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Sucursal de destino
              </label>
              <Select
                value={sucursalDestinoId}
                onChange={(e) => setSucursalDestinoId(e.target.value)}
              >
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
                          setProductoExpandidoId((actual) =>
                            actual === p.productoId ? null : p.productoId
                          );
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

        {/* Columna derecha: traspaso en curso */}
        <div className="lg:sticky lg:top-4 card space-y-4">
          <h2 className="text-base font-semibold">
            Traspaso en curso {carrito.length > 0 ? `(${carrito.length})` : ''}
          </h2>

          {carrito.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Busca y agrega uno o más productos para armar el traspaso.
            </p>
          ) : (
            <div className="space-y-2 max-h-[42vh] overflow-y-auto p-0.5">
              {carrito.map((it) => (
                <ItemCarrito
                  key={it.key}
                  item={it}
                  onCambiarCantidad={cambiarCantidad}
                  onQuitar={quitarDelCarrito}
                />
              ))}
            </div>
          )}

          {carrito.length > 0 && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Notas (opcional)</label>
              <Input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej. Urge para el fin de semana"
              />
            </div>
          )}

          <Button
            className="w-full"
            onClick={enviarTraspaso}
            disabled={enviando || carrito.length === 0 || !sucursalOrigenId || !sucursalDestinoId}
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
            {enviando
              ? 'Enviando...'
              : carrito.length > 1
              ? `Enviar ${carrito.length} traspasos`
              : 'Enviar traspaso'}
          </Button>
        </div>
      </div>

      {/* Historial */}
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
            <Select
              value={filtroSucursalId}
              onChange={(e) => setFiltroSucursalId(e.target.value)}
            >
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
            <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
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
              <div
                key={t.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 hover:bg-secondary/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{t.folio}</span>
                    <StatusBadge tono={ESTADO_TONO[t.estado]}>
                      {ESTADO_LABEL[t.estado]}
                    </StatusBadge>
                  </div>
                  <div className="text-sm truncate">
                    {t.variante.producto.nombre}{' '}
                    {t.variante.talla ? `(${t.variante.talla.valor})` : ''} · {t.cantidad}{' '}
                    {t.cantidad === 1 ? 'pieza' : 'piezas'}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.sucursalOrigen.nombre} → {t.sucursalDestino.nombre} · Solicitó{' '}
                    {t.solicitadoPor?.nombre ?? '—'} ·{' '}
                    {formatearFechaHora(t.createdAt, {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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