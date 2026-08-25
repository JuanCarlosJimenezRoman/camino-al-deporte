'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Truck as TruckIcon, MapPin, Banknote, Route as RouteIcon, Building2, Layers } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatoMonedaExacto } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';
import { toast } from '@/components/ui/use-toast';

// ---------------------------------------------------------------------------
// Envíos v2: paquetería nacional (solo el catálogo de transportistas, la
// guía se sigue generando a mano en Skydrop) y transporte local dentro de
// Oaxaca modelado en capas — RutaEnvio (sucursal de origen + transportista),
// PuntoEntrega (lugares físicos reutilizables), DestinoEnvio (dónde vive el
// cliente), CoberturaEnvio (una forma válida de atender un destino con una
// ruta) y TarifaEnvio (precio de una cobertura por tamaño de paquete). Ver
// comentarios junto a estos modelos en backend/prisma/schema.prisma,
// backend/src/routes/envios.js y docs/ARQUITECTURA.md.
// ---------------------------------------------------------------------------

type TipoTransportista = 'PAQUETERIA' | 'AUTOBUS' | 'SUBURBAN' | 'TAXI' | 'LINEA_TRANSPORTE' | 'OTRO';
type TamanoPaquete = 'CHICO' | 'MEDIANO' | 'GRANDE' | 'EXTRA_GRANDE';
type TipoEntrega = 'DOMICILIO' | 'PUNTO_RECOLECCION' | 'COTIZACION_MANUAL';

interface Sucursal {
  id: number;
  nombre: string;
}

interface Transportista {
  id: number;
  nombre: string;
  tipo: TipoTransportista;
  esNacional: boolean;
  telefono: string | null;
  notas: string | null;
  activo: boolean;
}

interface PuntoEntrega {
  id: number;
  nombre: string;
  estadoMx: string | null;
  municipio: string | null;
  localidad: string | null;
  direccion: string | null;
  telefono: string | null;
  notas: string | null;
  activo: boolean;
}

interface RutaPuntoEntrega {
  id: number;
  puntoEntregaId: number;
  puntoEntrega: PuntoEntrega;
  orden: number;
  activo: boolean;
}

interface RutaEnvio {
  id: number;
  nombre: string;
  sucursalOrigenId: number;
  sucursalOrigen: { id: number; nombre: string };
  transportistaId: number;
  transportista: Transportista;
  notas: string | null;
  activo: boolean;
  puntos: RutaPuntoEntrega[];
}

interface DestinoEnvio {
  id: number;
  nombre: string;
  estadoMx: string | null;
  municipio: string;
  localidad: string | null;
  codigoPostal: string | null;
  notas: string | null;
  activo: boolean;
}

interface TarifaEnvio {
  id: number;
  coberturaEnvioId: number;
  tamano: TamanoPaquete;
  costoReal: string;
  precioCliente: string;
  notas: string | null;
  activo: boolean;
}

interface CoberturaEnvio {
  id: number;
  destinoEnvioId: number;
  destinoEnvio: DestinoEnvio;
  rutaEnvioId: number;
  rutaEnvio: RutaEnvio;
  tipoEntrega: TipoEntrega;
  puntoEntregaId: number | null;
  puntoEntrega: PuntoEntrega | null;
  prioridad: number;
  notas: string | null;
  activo: boolean;
  tarifas: TarifaEnvio[];
}

const TIPO_TRANSPORTISTA_LABEL: Record<TipoTransportista, string> = {
  PAQUETERIA: 'Paquetería',
  AUTOBUS: 'Autobús',
  SUBURBAN: 'Suburban',
  TAXI: 'Taxi',
  LINEA_TRANSPORTE: 'Línea de transporte',
  OTRO: 'Otro',
};
const TIPOS_TRANSPORTISTA: TipoTransportista[] = [
  'PAQUETERIA',
  'AUTOBUS',
  'SUBURBAN',
  'TAXI',
  'LINEA_TRANSPORTE',
  'OTRO',
];

const TAMANO_LABEL: Record<TamanoPaquete, string> = {
  CHICO: 'Chico',
  MEDIANO: 'Mediano',
  GRANDE: 'Grande',
  EXTRA_GRANDE: 'Extra grande / bulto',
};
const TAMANOS: TamanoPaquete[] = ['CHICO', 'MEDIANO', 'GRANDE', 'EXTRA_GRANDE'];

const TIPO_ENTREGA_LABEL: Record<TipoEntrega, string> = {
  DOMICILIO: 'A domicilio',
  PUNTO_RECOLECCION: 'Punto de recolección',
  COTIZACION_MANUAL: 'Cotización manual',
};
const TIPOS_ENTREGA: TipoEntrega[] = ['DOMICILIO', 'PUNTO_RECOLECCION', 'COTIZACION_MANUAL'];

function textareaClass() {
  return 'flex w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary';
}

function mensajeError(err: unknown) {
  return err instanceof ApiError ? err.message : undefined;
}

export default function EnviosPage() {
  const [tab, setTab] = useState('transportistas');
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [rutas, setRutas] = useState<RutaEnvio[]>([]);
  const [puntosEntrega, setPuntosEntrega] = useState<PuntoEntrega[]>([]);
  const [destinos, setDestinos] = useState<DestinoEnvio[]>([]);
  const [cargando, setCargando] = useState(true);

  async function cargarTransportistas() {
    const data = await api<Transportista[]>('/envios/transportistas?todas=1');
    setTransportistas(data);
  }
  async function cargarSucursales() {
    const data = await api<Sucursal[]>('/sucursales');
    setSucursales(data);
  }
  async function cargarRutas() {
    const data = await api<RutaEnvio[]>('/envios/rutas?todas=1');
    setRutas(data);
  }
  async function cargarPuntosEntrega() {
    const data = await api<PuntoEntrega[]>('/envios/puntos-entrega?todas=1');
    setPuntosEntrega(data);
  }
  async function cargarDestinos() {
    const data = await api<DestinoEnvio[]>('/envios/destinos?todas=1');
    setDestinos(data);
  }

  useEffect(() => {
    Promise.all([
      cargarTransportistas(),
      cargarSucursales(),
      cargarRutas(),
      cargarPuntosEntrega(),
      cargarDestinos(),
    ]).finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rutas y coberturas necesitan la lista de transportistas/sucursales ya
  // cargada para armar sus selects, así que también recargamos rutas cuando
  // cambian (p. ej. al agregar un punto de entrega a una ruta).
  async function recargarRutasYPuntos() {
    await Promise.all([cargarRutas(), cargarPuntosEntrega()]);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Envíos"
        subtitle="Transportistas, rutas, puntos de entrega, destinos y tarifas dentro de Oaxaca"
        breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Envíos' }]}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="transportistas">Transportistas</TabsTrigger>
          <TabsTrigger value="rutas">Rutas</TabsTrigger>
          <TabsTrigger value="puntos">Puntos de entrega</TabsTrigger>
          <TabsTrigger value="destinos">Destinos</TabsTrigger>
          <TabsTrigger value="coberturas">Cobertura</TabsTrigger>
          <TabsTrigger value="tarifas">Tarifas</TabsTrigger>
        </TabsList>

        <TabsContent value="transportistas">
          <TransportistasTab transportistas={transportistas} cargando={cargando} onChange={cargarTransportistas} />
        </TabsContent>

        <TabsContent value="rutas">
          <RutasTab
            rutas={rutas}
            sucursales={sucursales}
            transportistas={transportistas}
            puntosEntrega={puntosEntrega}
            cargando={cargando}
            onChange={recargarRutasYPuntos}
          />
        </TabsContent>

        <TabsContent value="puntos">
          <PuntosEntregaTab puntosEntrega={puntosEntrega} cargando={cargando} onChange={cargarPuntosEntrega} />
        </TabsContent>

        <TabsContent value="destinos">
          <DestinosTab destinos={destinos} cargando={cargando} onChange={cargarDestinos} />
        </TabsContent>

        <TabsContent value="coberturas">
          <CoberturasTab
            destinos={destinos}
            rutas={rutas}
            puntosEntrega={puntosEntrega}
            cargandoCatalogos={cargando}
          />
        </TabsContent>

        <TabsContent value="tarifas">
          <TarifasTab cargandoCatalogos={cargando} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transportistas
// ---------------------------------------------------------------------------

function formTransportistaVacio() {
  return { nombre: '', tipo: 'AUTOBUS' as TipoTransportista, esNacional: false, telefono: '', notas: '' };
}

function TransportistasTab({
  transportistas,
  cargando,
  onChange,
}: {
  transportistas: Transportista[];
  cargando: boolean;
  onChange: () => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editando, setEditando] = useState<Transportista | null>(null);
  const [form, setForm] = useState(formTransportistaVacio());
  const [guardando, setGuardando] = useState(false);

  function abrirNuevo() {
    setEditando(null);
    setForm(formTransportistaVacio());
    setDrawerOpen(true);
  }

  function abrirEditar(t: Transportista) {
    setEditando(t);
    setForm({
      nombre: t.nombre,
      tipo: t.tipo,
      esNacional: t.esNacional,
      telefono: t.telefono || '',
      notas: t.notas || '',
    });
    setDrawerOpen(true);
  }

  async function guardar() {
    if (!form.nombre.trim()) {
      toast({ title: 'Falta el nombre', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    const datos = {
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      esNacional: form.esNacional,
      telefono: form.telefono || undefined,
      notas: form.notas || undefined,
    };
    try {
      if (editando) {
        await api(`/envios/transportistas/${editando.id}`, { method: 'PUT', body: JSON.stringify(datos) });
        toast({ title: 'Transportista actualizado', variant: 'success' });
      } else {
        await api('/envios/transportistas', { method: 'POST', body: JSON.stringify(datos) });
        toast({ title: 'Transportista agregado', variant: 'success' });
      }
      setDrawerOpen(false);
      onChange();
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: mensajeError(err), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(t: Transportista) {
    try {
      await api(`/envios/transportistas/${t.id}`, { method: 'PUT', body: JSON.stringify({ activo: !t.activo }) });
      onChange();
    } catch (err) {
      toast({ title: 'No se pudo actualizar', description: mensajeError(err), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={abrirNuevo}>
          <Plus className="w-4 h-4" />
          Nuevo transportista
        </Button>
      </div>

      {cargando ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : transportistas.length === 0 ? (
        <EmptyState
          icon={TruckIcon}
          title="Sin transportistas"
          description="Agrega paqueterías nacionales y transportistas locales para poder usarlos en rutas."
        />
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Alcance</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {transportistas.map((t) => (
                <tr key={t.id} className={!t.activo ? 'opacity-50' : ''}>
                  <td className="font-medium">{t.nombre}</td>
                  <td className="text-sm">{TIPO_TRANSPORTISTA_LABEL[t.tipo]}</td>
                  <td>
                    <StatusBadge tono={t.esNacional ? 'primary' : 'neutral'} withDot={false}>
                      {t.esNacional ? 'Nacional' : 'Local'}
                    </StatusBadge>
                  </td>
                  <td className="text-sm">{t.telefono || '—'}</td>
                  <td>
                    <StatusBadge tono={t.activo ? 'success' : 'neutral'}>{t.activo ? 'Activo' : 'Inactivo'}</StatusBadge>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(t)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActivo(t)}>
                      {t.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{editando ? 'Editar transportista' : 'Nuevo transportista'}</DrawerTitle>
            <DrawerDescription>
              Paqueterías nacionales (Estafeta, DHL, FedEx) o transporte local dentro de Oaxaca (autobús, Suburban,
              taxi, línea de transporte).
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div>
              <label className="text-sm">Nombre</label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej. Aragal"
              />
            </div>
            <div>
              <label className="text-sm">Tipo</label>
              <Select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoTransportista })}
              >
                {TIPOS_TRANSPORTISTA.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_TRANSPORTISTA_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.esNacional}
                onChange={(e) => setForm({ ...form, esNacional: e.target.checked })}
              />
              Es paquetería nacional (cubre todo México)
            </label>
            <div>
              <label className="text-sm">Teléfono (opcional)</label>
              <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </div>
            <div>
              <label className="text-sm">Notas (opcional)</label>
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                rows={2}
                className={textareaClass()}
              />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rutas: sucursal de origen + transportista, y sus puntos de entrega en
// orden. Es la unidad que después se usa para armar la cobertura de un
// destino (una ruta puede cubrir varios destinos).
// ---------------------------------------------------------------------------

function formRutaVacio() {
  return { nombre: '', sucursalOrigenId: '', transportistaId: '', notas: '' };
}

function RutasTab({
  rutas,
  sucursales,
  transportistas,
  puntosEntrega,
  cargando,
  onChange,
}: {
  rutas: RutaEnvio[];
  sucursales: Sucursal[];
  transportistas: Transportista[];
  puntosEntrega: PuntoEntrega[];
  cargando: boolean;
  onChange: () => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editando, setEditando] = useState<RutaEnvio | null>(null);
  const [form, setForm] = useState(formRutaVacio());
  const [guardando, setGuardando] = useState(false);
  const [puntoNuevoId, setPuntoNuevoId] = useState('');
  const [agregandoPunto, setAgregandoPunto] = useState(false);

  const rutaActual = editando ? rutas.find((r) => r.id === editando.id) || editando : null;

  function abrirNuevo() {
    setEditando(null);
    setForm(formRutaVacio());
    setPuntoNuevoId('');
    setDrawerOpen(true);
  }

  function abrirEditar(r: RutaEnvio) {
    setEditando(r);
    setForm({
      nombre: r.nombre,
      sucursalOrigenId: String(r.sucursalOrigenId),
      transportistaId: String(r.transportistaId),
      notas: r.notas || '',
    });
    setPuntoNuevoId('');
    setDrawerOpen(true);
  }

  async function guardar() {
    if (!form.nombre.trim() || !form.sucursalOrigenId || !form.transportistaId) {
      toast({ title: 'Falta nombre, sucursal de origen o transportista', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    const datos = {
      nombre: form.nombre.trim(),
      sucursalOrigenId: Number(form.sucursalOrigenId),
      transportistaId: Number(form.transportistaId),
      notas: form.notas || undefined,
    };
    try {
      if (editando) {
        await api(`/envios/rutas/${editando.id}`, { method: 'PUT', body: JSON.stringify(datos) });
        toast({ title: 'Ruta actualizada', variant: 'success' });
        onChange();
      } else {
        const creada = await api<RutaEnvio>('/envios/rutas', { method: 'POST', body: JSON.stringify(datos) });
        toast({ title: 'Ruta agregada', variant: 'success' });
        await onChange();
        // Deja el drawer abierto sobre la ruta recién creada para poder
        // agregarle puntos de entrega de inmediato.
        setEditando(creada);
      }
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: mensajeError(err), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(r: RutaEnvio) {
    try {
      await api(`/envios/rutas/${r.id}`, { method: 'PUT', body: JSON.stringify({ activo: !r.activo }) });
      onChange();
    } catch (err) {
      toast({ title: 'No se pudo actualizar', description: mensajeError(err), variant: 'destructive' });
    }
  }

  async function agregarPunto() {
    if (!editando || !puntoNuevoId) return;
    setAgregandoPunto(true);
    try {
      await api(`/envios/rutas/${editando.id}/puntos`, {
        method: 'POST',
        body: JSON.stringify({ puntoEntregaId: Number(puntoNuevoId), orden: rutaActual?.puntos.length || 0 }),
      });
      setPuntoNuevoId('');
      onChange();
    } catch (err) {
      toast({ title: 'No se pudo agregar el punto', description: mensajeError(err), variant: 'destructive' });
    } finally {
      setAgregandoPunto(false);
    }
  }

  async function quitarPunto(rutaPuntoId: number) {
    if (!editando) return;
    try {
      await api(`/envios/rutas/${editando.id}/puntos/${rutaPuntoId}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: false }),
      });
      onChange();
    } catch (err) {
      toast({ title: 'No se pudo quitar el punto', description: mensajeError(err), variant: 'destructive' });
    }
  }

  const puntosDisponibles = puntosEntrega.filter(
    (p) => p.activo && !rutaActual?.puntos.some((rp) => rp.puntoEntregaId === p.id)
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={abrirNuevo} disabled={sucursales.length === 0 || transportistas.length === 0}>
          <Plus className="w-4 h-4" />
          Nueva ruta
        </Button>
      </div>

      {cargando ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rutas.length === 0 ? (
        <EmptyState
          icon={RouteIcon}
          title="Sin rutas"
          description="Una ruta es un transportista saliendo de una sucursal — ej. 'Aragal desde Centro'. Luego se le agregan sus puntos de entrega."
        />
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Ruta</th>
                <th>Origen</th>
                <th>Transportista</th>
                <th>Puntos de entrega</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rutas.map((r) => (
                <tr key={r.id} className={!r.activo ? 'opacity-50' : ''}>
                  <td className="font-medium">{r.nombre}</td>
                  <td className="text-sm">{r.sucursalOrigen.nombre}</td>
                  <td className="text-sm">{r.transportista.nombre}</td>
                  <td className="text-sm">{r.puntos.length}</td>
                  <td>
                    <StatusBadge tono={r.activo ? 'success' : 'neutral'}>{r.activo ? 'Activa' : 'Inactiva'}</StatusBadge>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(r)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActivo(r)}>
                      {r.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent widthClassName="max-w-lg">
          <DrawerHeader>
            <DrawerTitle>{editando ? 'Editar ruta' : 'Nueva ruta'}</DrawerTitle>
            <DrawerDescription>
              De qué sucursal sale y con qué transportista. Guarda la ruta primero y luego agrégale sus puntos de
              entrega.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div>
              <label className="text-sm">Nombre de la ruta</label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej. Aragal — Costa"
              />
            </div>
            <div>
              <label className="text-sm">Sucursal de origen</label>
              <Select
                value={form.sucursalOrigenId}
                onChange={(e) => setForm({ ...form, sucursalOrigenId: e.target.value })}
              >
                <option value="">Selecciona una sucursal</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm">Transportista</label>
              <Select
                value={form.transportistaId}
                onChange={(e) => setForm({ ...form, transportistaId: e.target.value })}
              >
                <option value="">Selecciona un transportista</option>
                {transportistas
                  .filter((t) => t.activo)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <label className="text-sm">Notas (opcional)</label>
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                rows={2}
                className={textareaClass()}
              />
            </div>

            {editando && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium">Puntos de entrega de esta ruta</p>
                {rutaActual && rutaActual.puntos.length > 0 ? (
                  <ul className="space-y-1">
                    {rutaActual.puntos.map((rp) => (
                      <li key={rp.id} className="flex items-center justify-between text-sm">
                        <span>
                          {rp.orden + 1}. {rp.puntoEntrega.nombre}
                          {rp.puntoEntrega.municipio ? ` (${rp.puntoEntrega.municipio})` : ''}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => quitarPunto(rp.id)}>
                          Quitar
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Todavía no tiene puntos de entrega.</p>
                )}
                <div className="flex gap-2">
                  <Select value={puntoNuevoId} onChange={(e) => setPuntoNuevoId(e.target.value)}>
                    <option value="">Agregar punto de entrega…</option>
                    {puntosDisponibles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                        {p.municipio ? ` (${p.municipio})` : ''}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" onClick={agregarPunto} disabled={!puntoNuevoId || agregandoPunto}>
                    Agregar
                  </Button>
                </div>
                {puntosDisponibles.length === 0 && puntosEntrega.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Da de alta puntos de entrega en la pestaña &quot;Puntos de entrega&quot; primero.
                  </p>
                )}
              </div>
            )}
          </DrawerBody>
          <DrawerFooter>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={guardando}>
              Cerrar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear ruta'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Puntos de entrega: lugares físicos reutilizables (terminal, agencia,
// encomienda...) a los que se le puede pedir a un cliente que recoja.
// ---------------------------------------------------------------------------

function formPuntoVacio() {
  return { nombre: '', estadoMx: '', municipio: '', localidad: '', direccion: '', telefono: '', notas: '' };
}

function PuntosEntregaTab({
  puntosEntrega,
  cargando,
  onChange,
}: {
  puntosEntrega: PuntoEntrega[];
  cargando: boolean;
  onChange: () => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editando, setEditando] = useState<PuntoEntrega | null>(null);
  const [form, setForm] = useState(formPuntoVacio());
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return puntosEntrega;
    return puntosEntrega.filter(
      (p) => p.nombre.toLowerCase().includes(q) || (p.municipio || '').toLowerCase().includes(q)
    );
  }, [puntosEntrega, busqueda]);

  function abrirNuevo() {
    setEditando(null);
    setForm(formPuntoVacio());
    setDrawerOpen(true);
  }

  function abrirEditar(p: PuntoEntrega) {
    setEditando(p);
    setForm({
      nombre: p.nombre,
      estadoMx: p.estadoMx || '',
      municipio: p.municipio || '',
      localidad: p.localidad || '',
      direccion: p.direccion || '',
      telefono: p.telefono || '',
      notas: p.notas || '',
    });
    setDrawerOpen(true);
  }

  async function guardar() {
    if (!form.nombre.trim()) {
      toast({ title: 'Falta el nombre', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    const datos = {
      nombre: form.nombre.trim(),
      estadoMx: form.estadoMx || undefined,
      municipio: form.municipio || undefined,
      localidad: form.localidad || undefined,
      direccion: form.direccion || undefined,
      telefono: form.telefono || undefined,
      notas: form.notas || undefined,
    };
    try {
      if (editando) {
        await api(`/envios/puntos-entrega/${editando.id}`, { method: 'PUT', body: JSON.stringify(datos) });
        toast({ title: 'Punto de entrega actualizado', variant: 'success' });
      } else {
        await api('/envios/puntos-entrega', { method: 'POST', body: JSON.stringify(datos) });
        toast({ title: 'Punto de entrega agregado', variant: 'success' });
      }
      setDrawerOpen(false);
      onChange();
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: mensajeError(err), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(p: PuntoEntrega) {
    try {
      await api(`/envios/puntos-entrega/${p.id}`, { method: 'PUT', body: JSON.stringify({ activo: !p.activo }) });
      onChange();
    } catch (err) {
      toast({ title: 'No se pudo actualizar', description: mensajeError(err), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="w-64">
          <Input
            placeholder="Buscar por nombre o municipio…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={abrirNuevo}>
          <Plus className="w-4 h-4" />
          Nuevo punto de entrega
        </Button>
      </div>

      {cargando ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Sin puntos de entrega"
          description="Terminales, agencias u oficinas donde el cliente puede recoger su pedido cuando no llega a domicilio."
        />
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Municipio</th>
                <th>Dirección</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className={!p.activo ? 'opacity-50' : ''}>
                  <td className="font-medium">{p.nombre}</td>
                  <td className="text-sm">{p.municipio || '—'}</td>
                  <td className="text-sm">{p.direccion || '—'}</td>
                  <td className="text-sm">{p.telefono || '—'}</td>
                  <td>
                    <StatusBadge tono={p.activo ? 'success' : 'neutral'}>{p.activo ? 'Activo' : 'Inactivo'}</StatusBadge>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(p)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActivo(p)}>
                      {p.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{editando ? 'Editar punto de entrega' : 'Nuevo punto de entrega'}</DrawerTitle>
            <DrawerDescription>
              Un lugar físico reutilizable (terminal, agencia, encomienda) al que varias rutas pueden llegar.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div>
              <label className="text-sm">Nombre</label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej. Terminal de Autobuses Fletera"
              />
            </div>
            <div>
              <label className="text-sm">Municipio</label>
              <Input
                value={form.municipio}
                onChange={(e) => setForm({ ...form, municipio: e.target.value })}
                placeholder="Ej. San Pedro Pochutla"
              />
            </div>
            <div>
              <label className="text-sm">Estado (opcional)</label>
              <Input
                value={form.estadoMx}
                onChange={(e) => setForm({ ...form, estadoMx: e.target.value })}
                placeholder="Ej. Oaxaca"
              />
            </div>
            <div>
              <label className="text-sm">Localidad (opcional)</label>
              <Input value={form.localidad} onChange={(e) => setForm({ ...form, localidad: e.target.value })} />
            </div>
            <div>
              <label className="text-sm">Dirección (opcional)</label>
              <Input
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                placeholder="Ej. Salida a costa, junto a la gasolinera"
              />
            </div>
            <div>
              <label className="text-sm">Teléfono (opcional)</label>
              <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </div>
            <div>
              <label className="text-sm">Notas (opcional)</label>
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                rows={2}
                className={textareaClass()}
              />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Destinos: dónde vive el cliente. Ya no carga transportista sugerido ni
// forma de entrega — eso ahora vive en CoberturaEnvio (un destino puede
// tener varias formas válidas de ser atendido).
// ---------------------------------------------------------------------------

function formDestinoVacio() {
  return { nombre: '', estadoMx: '', municipio: '', localidad: '', codigoPostal: '', notas: '' };
}

function DestinosTab({
  destinos,
  cargando,
  onChange,
}: {
  destinos: DestinoEnvio[];
  cargando: boolean;
  onChange: () => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editando, setEditando] = useState<DestinoEnvio | null>(null);
  const [form, setForm] = useState(formDestinoVacio());
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const destinosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return destinos;
    return destinos.filter((d) => d.nombre.toLowerCase().includes(q) || d.municipio.toLowerCase().includes(q));
  }, [destinos, busqueda]);

  function abrirNuevo() {
    setEditando(null);
    setForm(formDestinoVacio());
    setDrawerOpen(true);
  }

  function abrirEditar(d: DestinoEnvio) {
    setEditando(d);
    setForm({
      nombre: d.nombre,
      estadoMx: d.estadoMx || '',
      municipio: d.municipio,
      localidad: d.localidad || '',
      codigoPostal: d.codigoPostal || '',
      notas: d.notas || '',
    });
    setDrawerOpen(true);
  }

  async function guardar() {
    if (!form.nombre.trim() || !form.municipio.trim()) {
      toast({ title: 'Falta el nombre o el municipio', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    const datos = {
      nombre: form.nombre.trim(),
      estadoMx: form.estadoMx || undefined,
      municipio: form.municipio.trim(),
      localidad: form.localidad || undefined,
      codigoPostal: form.codigoPostal || undefined,
      notas: form.notas || undefined,
    };
    try {
      if (editando) {
        await api(`/envios/destinos/${editando.id}`, { method: 'PUT', body: JSON.stringify(datos) });
        toast({ title: 'Destino actualizado', variant: 'success' });
      } else {
        await api('/envios/destinos', { method: 'POST', body: JSON.stringify(datos) });
        toast({ title: 'Destino agregado', variant: 'success' });
      }
      setDrawerOpen(false);
      onChange();
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: mensajeError(err), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(d: DestinoEnvio) {
    try {
      await api(`/envios/destinos/${d.id}`, { method: 'PUT', body: JSON.stringify({ activo: !d.activo }) });
      onChange();
    } catch (err) {
      toast({ title: 'No se pudo actualizar', description: mensajeError(err), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="w-64">
          <Input
            placeholder="Buscar por nombre o municipio…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={abrirNuevo}>
          <Plus className="w-4 h-4" />
          Nuevo destino
        </Button>
      </div>

      {cargando ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : destinosFiltrados.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Sin destinos"
          description="Agrega los lugares dentro de Oaxaca a los que ya sabes cómo enviar. Luego dale cobertura en la pestaña 'Cobertura'."
        />
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Destino</th>
                <th>Municipio</th>
                <th>Estado</th>
                <th>C.P.</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {destinosFiltrados.map((d) => (
                <tr key={d.id} className={!d.activo ? 'opacity-50' : ''}>
                  <td className="font-medium">{d.nombre}</td>
                  <td className="text-sm">{d.municipio}</td>
                  <td className="text-sm">{d.estadoMx || '—'}</td>
                  <td className="text-sm">{d.codigoPostal || '—'}</td>
                  <td>
                    <StatusBadge tono={d.activo ? 'success' : 'neutral'}>{d.activo ? 'Activo' : 'Inactivo'}</StatusBadge>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(d)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActivo(d)}>
                      {d.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{editando ? 'Editar destino' : 'Nuevo destino'}</DrawerTitle>
            <DrawerDescription>
              Un lugar donde vive un cliente dentro de Oaxaca. Cómo se le atiende (ruta, punto de entrega, precio) se
              configura después en &quot;Cobertura&quot;.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div>
              <label className="text-sm">Nombre del destino</label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej. Pochutla centro"
              />
            </div>
            <div>
              <label className="text-sm">Municipio</label>
              <Input
                value={form.municipio}
                onChange={(e) => setForm({ ...form, municipio: e.target.value })}
                placeholder="Ej. San Pedro Pochutla"
              />
            </div>
            <div>
              <label className="text-sm">Estado (opcional)</label>
              <Input
                value={form.estadoMx}
                onChange={(e) => setForm({ ...form, estadoMx: e.target.value })}
                placeholder="Ej. Oaxaca"
              />
            </div>
            <div>
              <label className="text-sm">Localidad (opcional)</label>
              <Input value={form.localidad} onChange={(e) => setForm({ ...form, localidad: e.target.value })} />
            </div>
            <div>
              <label className="text-sm">Código postal (opcional)</label>
              <Input value={form.codigoPostal} onChange={(e) => setForm({ ...form, codigoPostal: e.target.value })} />
            </div>
            <div>
              <label className="text-sm">Notas (opcional)</label>
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                rows={2}
                className={textareaClass()}
              />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cobertura: una forma válida de atender un destino (ruta + tipo de
// entrega + punto de entrega si aplica). Un destino puede tener varias,
// ordenadas por prioridad — la primera es la que se ofrece primero al
// cotizar (ver GET /envios/cotizar).
// ---------------------------------------------------------------------------

function formCoberturaVacio() {
  return {
    destinoEnvioId: '',
    rutaEnvioId: '',
    tipoEntrega: 'PUNTO_RECOLECCION' as TipoEntrega,
    puntoEntregaId: '',
    prioridad: '0',
    notas: '',
  };
}

function CoberturasTab({
  destinos,
  rutas,
  puntosEntrega,
  cargandoCatalogos,
}: {
  destinos: DestinoEnvio[];
  rutas: RutaEnvio[];
  puntosEntrega: PuntoEntrega[];
  cargandoCatalogos: boolean;
}) {
  const [coberturas, setCoberturas] = useState<CoberturaEnvio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroDestinoId, setFiltroDestinoId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editando, setEditando] = useState<CoberturaEnvio | null>(null);
  const [form, setForm] = useState(formCoberturaVacio());
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const qs = filtroDestinoId ? `?destinoId=${filtroDestinoId}&todas=1` : '?todas=1';
      const data = await api<CoberturaEnvio[]>(`/envios/coberturas${qs}`);
      setCoberturas(data);
    } catch (err) {
      toast({ title: 'No se pudo cargar la cobertura', description: mensajeError(err), variant: 'destructive' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroDestinoId]);

  function abrirNuevo() {
    setEditando(null);
    setForm({ ...formCoberturaVacio(), destinoEnvioId: filtroDestinoId });
    setDrawerOpen(true);
  }

  function abrirEditar(c: CoberturaEnvio) {
    setEditando(c);
    setForm({
      destinoEnvioId: String(c.destinoEnvioId),
      rutaEnvioId: String(c.rutaEnvioId),
      tipoEntrega: c.tipoEntrega,
      puntoEntregaId: c.puntoEntregaId ? String(c.puntoEntregaId) : '',
      prioridad: String(c.prioridad),
      notas: c.notas || '',
    });
    setDrawerOpen(true);
  }

  async function guardar() {
    if (!form.destinoEnvioId || !form.rutaEnvioId) {
      toast({ title: 'Selecciona destino y ruta', variant: 'destructive' });
      return;
    }
    if (form.tipoEntrega === 'PUNTO_RECOLECCION' && !form.puntoEntregaId) {
      toast({ title: 'Indica el punto de recolección', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    const datos = {
      destinoEnvioId: Number(form.destinoEnvioId),
      rutaEnvioId: Number(form.rutaEnvioId),
      tipoEntrega: form.tipoEntrega,
      puntoEntregaId: form.tipoEntrega === 'PUNTO_RECOLECCION' ? Number(form.puntoEntregaId) : null,
      prioridad: Number(form.prioridad) || 0,
      notas: form.notas || undefined,
    };
    try {
      if (editando) {
        await api(`/envios/coberturas/${editando.id}`, { method: 'PUT', body: JSON.stringify(datos) });
        toast({ title: 'Cobertura actualizada', variant: 'success' });
      } else {
        await api('/envios/coberturas', { method: 'POST', body: JSON.stringify(datos) });
        toast({ title: 'Cobertura agregada', variant: 'success' });
      }
      setDrawerOpen(false);
      cargar();
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: mensajeError(err), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(c: CoberturaEnvio) {
    try {
      await api(`/envios/coberturas/${c.id}`, { method: 'PUT', body: JSON.stringify({ activo: !c.activo }) });
      cargar();
    } catch (err) {
      toast({ title: 'No se pudo actualizar', description: mensajeError(err), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="w-64">
          <Select value={filtroDestinoId} onChange={(e) => setFiltroDestinoId(e.target.value)}>
            <option value="">Todos los destinos</option>
            {destinos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre} ({d.municipio})
              </option>
            ))}
          </Select>
        </div>
        <Button size="sm" onClick={abrirNuevo} disabled={destinos.length === 0 || rutas.length === 0}>
          <Plus className="w-4 h-4" />
          Nueva cobertura
        </Button>
      </div>

      {(destinos.length === 0 || rutas.length === 0) && !cargandoCatalogos && (
        <p className="text-sm text-muted-foreground">
          Da de alta al menos un destino y una ruta antes de configurar cobertura.
        </p>
      )}

      {cargando ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : coberturas.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Sin cobertura configurada"
          description="Une un destino con una ruta para definir cómo se le puede entregar (a domicilio, en un punto de recolección o cotización manual)."
        />
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Destino</th>
                <th>Ruta</th>
                <th>Tipo de entrega</th>
                <th>Punto de entrega</th>
                <th>Tarifas</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {coberturas.map((c) => (
                <tr key={c.id} className={!c.activo ? 'opacity-50' : ''}>
                  <td className="font-medium">
                    {c.destinoEnvio.nombre}{' '}
                    <span className="text-muted-foreground text-xs">({c.destinoEnvio.municipio})</span>
                  </td>
                  <td className="text-sm">
                    {c.rutaEnvio.nombre} <span className="text-muted-foreground text-xs">({c.rutaEnvio.transportista.nombre})</span>
                  </td>
                  <td>
                    <StatusBadge tono={c.tipoEntrega === 'DOMICILIO' ? 'success' : c.tipoEntrega === 'PUNTO_RECOLECCION' ? 'warning' : 'neutral'} withDot={false}>
                      {TIPO_ENTREGA_LABEL[c.tipoEntrega]}
                    </StatusBadge>
                  </td>
                  <td className="text-sm">{c.puntoEntrega?.nombre || '—'}</td>
                  <td className="text-sm">{c.tarifas.length} tamaño(s)</td>
                  <td className="text-sm">{c.prioridad}</td>
                  <td>
                    <StatusBadge tono={c.activo ? 'success' : 'neutral'}>{c.activo ? 'Activa' : 'Inactiva'}</StatusBadge>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(c)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActivo(c)}>
                      {c.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{editando ? 'Editar cobertura' : 'Nueva cobertura'}</DrawerTitle>
            <DrawerDescription>
              Une un destino con una ruta y define cómo se entrega. Después captura las tarifas por tamaño en la
              pestaña &quot;Tarifas&quot;.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div>
              <label className="text-sm">Destino</label>
              <Select
                value={form.destinoEnvioId}
                onChange={(e) => setForm({ ...form, destinoEnvioId: e.target.value })}
                disabled={!!editando}
              >
                <option value="">Selecciona un destino</option>
                {destinos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre} ({d.municipio})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm">Ruta</label>
              <Select
                value={form.rutaEnvioId}
                onChange={(e) => setForm({ ...form, rutaEnvioId: e.target.value })}
                disabled={!!editando}
              >
                <option value="">Selecciona una ruta</option>
                {rutas
                  .filter((r) => r.activo)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre} ({r.transportista.nombre})
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <label className="text-sm">Tipo de entrega</label>
              <Select
                value={form.tipoEntrega}
                onChange={(e) => setForm({ ...form, tipoEntrega: e.target.value as TipoEntrega })}
              >
                {TIPOS_ENTREGA.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_ENTREGA_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            {form.tipoEntrega === 'PUNTO_RECOLECCION' && (
              <div>
                <label className="text-sm">Punto de recolección</label>
                <Select
                  value={form.puntoEntregaId}
                  onChange={(e) => setForm({ ...form, puntoEntregaId: e.target.value })}
                >
                  <option value="">Selecciona un punto de entrega</option>
                  {puntosEntrega
                    .filter((p) => p.activo)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                        {p.municipio ? ` (${p.municipio})` : ''}
                      </option>
                    ))}
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm">Prioridad</label>
              <Input
                type="number"
                value={form.prioridad}
                onChange={(e) => setForm({ ...form, prioridad: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Con varias coberturas para el mismo destino, la de menor número se ofrece primero al cotizar.
              </p>
            </div>
            <div>
              <label className="text-sm">Notas (opcional)</label>
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                rows={2}
                className={textareaClass()}
              />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarifas: precio de una cobertura por tamaño de paquete (costo real vs.
// precio al cliente).
// ---------------------------------------------------------------------------

function formTarifaVacio() {
  return { coberturaEnvioId: '', tamano: 'CHICO' as TamanoPaquete, costoReal: '', precioCliente: '', notas: '' };
}

function TarifasTab({ cargandoCatalogos }: { cargandoCatalogos: boolean }) {
  const [tarifas, setTarifas] = useState<TarifaEnvio[]>([]);
  const [coberturas, setCoberturas] = useState<CoberturaEnvio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editando, setEditando] = useState<TarifaEnvio | null>(null);
  const [form, setForm] = useState(formTarifaVacio());
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const [datosTarifas, datosCoberturas] = await Promise.all([
        api<(TarifaEnvio & { coberturaEnvio: CoberturaEnvio })[]>('/envios/tarifas'),
        api<CoberturaEnvio[]>('/envios/coberturas?todas=1'),
      ]);
      setTarifas(datosTarifas);
      setCoberturas(datosCoberturas);
    } catch (err) {
      toast({ title: 'No se pudieron cargar las tarifas', description: mensajeError(err), variant: 'destructive' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function etiquetaCobertura(coberturaEnvioId: number) {
    const c = coberturas.find((c) => c.id === coberturaEnvioId);
    if (!c) return `Cobertura #${coberturaEnvioId}`;
    return `${c.destinoEnvio.nombre} — ${c.rutaEnvio.nombre} (${TIPO_ENTREGA_LABEL[c.tipoEntrega]})`;
  }

  function abrirNuevo() {
    setEditando(null);
    setForm(formTarifaVacio());
    setDrawerOpen(true);
  }

  function abrirEditar(t: TarifaEnvio) {
    setEditando(t);
    setForm({
      coberturaEnvioId: String(t.coberturaEnvioId),
      tamano: t.tamano,
      costoReal: t.costoReal,
      precioCliente: t.precioCliente,
      notas: t.notas || '',
    });
    setDrawerOpen(true);
  }

  async function guardar() {
    if (!form.coberturaEnvioId) {
      toast({ title: 'Selecciona una cobertura', variant: 'destructive' });
      return;
    }
    const costoReal = Number(form.costoReal);
    const precioCliente = Number(form.precioCliente);
    if (!(costoReal >= 0) || !(precioCliente >= 0)) {
      toast({ title: 'Captura un costo real y un precio al cliente válidos', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    const datos = {
      coberturaEnvioId: Number(form.coberturaEnvioId),
      tamano: form.tamano,
      costoReal,
      precioCliente,
      notas: form.notas || undefined,
    };
    try {
      if (editando) {
        await api(`/envios/tarifas/${editando.id}`, { method: 'PUT', body: JSON.stringify(datos) });
        toast({ title: 'Tarifa actualizada', variant: 'success' });
      } else {
        await api('/envios/tarifas', { method: 'POST', body: JSON.stringify(datos) });
        toast({ title: 'Tarifa agregada', variant: 'success' });
      }
      setDrawerOpen(false);
      cargar();
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: mensajeError(err), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(t: TarifaEnvio) {
    try {
      await api(`/envios/tarifas/${t.id}`, { method: 'PUT', body: JSON.stringify({ activo: !t.activo }) });
      cargar();
    } catch (err) {
      toast({ title: 'No se pudo actualizar', description: mensajeError(err), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={abrirNuevo} disabled={coberturas.length === 0}>
          <Plus className="w-4 h-4" />
          Nueva tarifa
        </Button>
      </div>

      {coberturas.length === 0 && !cargandoCatalogos && (
        <p className="text-sm text-muted-foreground">
          Configura al menos una cobertura (destino + ruta) antes de capturar tarifas.
        </p>
      )}

      {cargando ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : tarifas.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="Sin tarifas"
          description="Captura el costo real y el precio al cliente la primera vez que lo cotices y ya no lo vuelvas a preguntar."
        />
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Cobertura</th>
                <th>Tamaño</th>
                <th>Costo real</th>
                <th>Precio cliente</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tarifas.map((t) => (
                <tr key={t.id} className={!t.activo ? 'opacity-50' : ''}>
                  <td className="font-medium">{etiquetaCobertura(t.coberturaEnvioId)}</td>
                  <td className="text-sm">{TAMANO_LABEL[t.tamano]}</td>
                  <td className="tabular-nums text-sm text-muted-foreground">{formatoMonedaExacto(t.costoReal)}</td>
                  <td className="tabular-nums font-medium">{formatoMonedaExacto(t.precioCliente)}</td>
                  <td>
                    <StatusBadge tono={t.activo ? 'success' : 'neutral'}>{t.activo ? 'Vigente' : 'Inactiva'}</StatusBadge>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(t)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActivo(t)}>
                      {t.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{editando ? 'Editar tarifa' : 'Nueva tarifa'}</DrawerTitle>
            <DrawerDescription>
              Precio de una cobertura (destino + ruta + tipo de entrega), por tamaño de paquete. El costo real es lo
              que de verdad cuesta enviar; el precio cliente es lo que se le cobra.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div>
              <label className="text-sm">Cobertura</label>
              <Select
                value={form.coberturaEnvioId}
                onChange={(e) => setForm({ ...form, coberturaEnvioId: e.target.value })}
                disabled={!!editando}
              >
                <option value="">Selecciona una cobertura</option>
                {coberturas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.destinoEnvio.nombre} — {c.rutaEnvio.nombre} ({TIPO_ENTREGA_LABEL[c.tipoEntrega]})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm">Tamaño de paquete</label>
              <Select
                value={form.tamano}
                onChange={(e) => setForm({ ...form, tamano: e.target.value as TamanoPaquete })}
                disabled={!!editando}
              >
                {TAMANOS.map((t) => (
                  <option key={t} value={t}>
                    {TAMANO_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm">Costo real</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.costoReal}
                onChange={(e) => setForm({ ...form, costoReal: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">Precio al cliente</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.precioCliente}
                onChange={(e) => setForm({ ...form, precioCliente: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">Notas (opcional)</label>
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                rows={2}
                className={textareaClass()}
              />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
