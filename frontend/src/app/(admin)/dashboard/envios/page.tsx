'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Truck as TruckIcon, MapPin, Banknote } from 'lucide-react';
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
// Envíos: paquetería nacional (solo el catálogo, la guía se sigue generando
// a mano en Skydrop) y transporte local dentro de Oaxaca (autobuses,
// Suburban, taxis, líneas de transporte) — ver comentario en
// backend/prisma/schema.prisma junto a los modelos Transportista/
// DestinoEnvio/TarifaEnvio y docs/ARQUITECTURA.md.
// ---------------------------------------------------------------------------

type TipoTransportista = 'PAQUETERIA' | 'AUTOBUS' | 'SUBURBAN' | 'TAXI' | 'LINEA_TRANSPORTE' | 'OTRO';
type TamanoPaquete = 'CHICO' | 'MEDIANO' | 'GRANDE' | 'EXTRA_GRANDE';

interface Transportista {
  id: number;
  nombre: string;
  tipo: TipoTransportista;
  esNacional: boolean;
  telefono: string | null;
  notas: string | null;
  activo: boolean;
}

interface DestinoEnvio {
  id: number;
  nombre: string;
  municipio: string;
  region: string | null;
  transportistaSugeridoId: number | null;
  transportistaSugerido: { id: number; nombre: string } | null;
  entregaDomicilio: boolean;
  puntoEntregaTexto: string | null;
  notas: string | null;
  activo: boolean;
}

interface TarifaEnvio {
  id: number;
  transportistaId: number;
  transportista: { id: number; nombre: string };
  destinoId: number;
  destino: { id: number; nombre: string; municipio: string };
  tamano: TamanoPaquete;
  precio: string;
  notas: string | null;
  activo: boolean;
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

export default function EnviosPage() {
  const [tab, setTab] = useState('transportistas');
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);
  const [destinos, setDestinos] = useState<DestinoEnvio[]>([]);
  const [cargando, setCargando] = useState(true);

  async function cargarTransportistas() {
    const data = await api<Transportista[]>('/envios/transportistas?todas=1');
    setTransportistas(data);
  }

  async function cargarDestinos() {
    const data = await api<DestinoEnvio[]>('/envios/destinos?todas=1');
    setDestinos(data);
  }

  useEffect(() => {
    Promise.all([cargarTransportistas(), cargarDestinos()]).finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Envíos"
        subtitle="Transportistas, destinos dentro de Oaxaca y tarifas conocidas"
        breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Envíos' }]}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="transportistas">Transportistas</TabsTrigger>
          <TabsTrigger value="destinos">Destinos</TabsTrigger>
          <TabsTrigger value="tarifas">Tarifas</TabsTrigger>
        </TabsList>

        <TabsContent value="transportistas">
          <TransportistasTab transportistas={transportistas} cargando={cargando} onChange={cargarTransportistas} />
        </TabsContent>

        <TabsContent value="destinos">
          <DestinosTab
            destinos={destinos}
            transportistas={transportistas}
            cargando={cargando}
            onChange={cargarDestinos}
          />
        </TabsContent>

        <TabsContent value="tarifas">
          <TarifasTab destinos={destinos} transportistas={transportistas} cargandoCatalogos={cargando} />
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
      toast({
        title: 'No se pudo guardar',
        description: err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(t: Transportista) {
    try {
      await api(`/envios/transportistas/${t.id}`, { method: 'PUT', body: JSON.stringify({ activo: !t.activo }) });
      onChange();
    } catch (err) {
      toast({
        title: 'No se pudo actualizar',
        description: err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
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
          description="Agrega paqueterías nacionales y transportistas locales para poder usarlos en destinos y tarifas."
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
                className="flex w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary"
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
// Destinos
// ---------------------------------------------------------------------------

function formDestinoVacio() {
  return {
    nombre: '',
    municipio: '',
    region: '',
    transportistaSugeridoId: '',
    entregaDomicilio: true,
    puntoEntregaTexto: '',
    notas: '',
  };
}

function DestinosTab({
  destinos,
  transportistas,
  cargando,
  onChange,
}: {
  destinos: DestinoEnvio[];
  transportistas: Transportista[];
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
      municipio: d.municipio,
      region: d.region || '',
      transportistaSugeridoId: d.transportistaSugeridoId ? String(d.transportistaSugeridoId) : '',
      entregaDomicilio: d.entregaDomicilio,
      puntoEntregaTexto: d.puntoEntregaTexto || '',
      notas: d.notas || '',
    });
    setDrawerOpen(true);
  }

  async function guardar() {
    if (!form.nombre.trim() || !form.municipio.trim()) {
      toast({ title: 'Falta el nombre o el municipio', variant: 'destructive' });
      return;
    }
    if (!form.entregaDomicilio && !form.puntoEntregaTexto.trim()) {
      toast({
        title: 'Falta el punto de entrega',
        description: 'Si no llega a domicilio, indica dónde recoge el cliente (terminal, encomienda, etc.).',
        variant: 'destructive',
      });
      return;
    }
    setGuardando(true);
    const datos = {
      nombre: form.nombre.trim(),
      municipio: form.municipio.trim(),
      region: form.region || undefined,
      transportistaSugeridoId: form.transportistaSugeridoId ? Number(form.transportistaSugeridoId) : null,
      entregaDomicilio: form.entregaDomicilio,
      puntoEntregaTexto: form.entregaDomicilio ? null : form.puntoEntregaTexto || undefined,
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
      toast({
        title: 'No se pudo guardar',
        description: err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(d: DestinoEnvio) {
    try {
      await api(`/envios/destinos/${d.id}`, { method: 'PUT', body: JSON.stringify({ activo: !d.activo }) });
      onChange();
    } catch (err) {
      toast({
        title: 'No se pudo actualizar',
        description: err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
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
          description="Agrega los lugares dentro de Oaxaca a los que ya sabes cómo enviar."
        />
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Destino</th>
                <th>Municipio</th>
                <th>Región</th>
                <th>Entrega</th>
                <th>Transportista sugerido</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {destinosFiltrados.map((d) => (
                <tr key={d.id} className={!d.activo ? 'opacity-50' : ''}>
                  <td className="font-medium">{d.nombre}</td>
                  <td className="text-sm">{d.municipio}</td>
                  <td className="text-sm">{d.region || '—'}</td>
                  <td>
                    {d.entregaDomicilio ? (
                      <StatusBadge tono="success">A domicilio</StatusBadge>
                    ) : (
                      <StatusBadge tono="warning" withDot={false}>
                        {d.puntoEntregaTexto ? `Recoge: ${d.puntoEntregaTexto}` : 'No llega a domicilio'}
                      </StatusBadge>
                    )}
                  </td>
                  <td className="text-sm">{d.transportistaSugerido?.nombre || '—'}</td>
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
              Un lugar dentro de Oaxaca al que ya sabes cómo enviar. Si ningún transportista llega a la puerta del
              cliente, indica dónde debe recogerlo.
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
              <label className="text-sm">Región (opcional)</label>
              <Input
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="Ej. Costa"
              />
            </div>
            <div>
              <label className="text-sm">Transportista sugerido (opcional)</label>
              <Select
                value={form.transportistaSugeridoId}
                onChange={(e) => setForm({ ...form, transportistaSugeridoId: e.target.value })}
              >
                <option value="">Sin definir</option>
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
              <label className="text-sm">¿Llega a domicilio?</label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  size="sm"
                  variant={form.entregaDomicilio ? 'default' : 'outline'}
                  onClick={() => setForm({ ...form, entregaDomicilio: true })}
                >
                  Sí, a domicilio
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!form.entregaDomicilio ? 'default' : 'outline'}
                  onClick={() => setForm({ ...form, entregaDomicilio: false })}
                >
                  No, hay que recogerlo
                </Button>
              </div>
            </div>
            {!form.entregaDomicilio && (
              <div>
                <label className="text-sm">Dónde recoge el cliente</label>
                <textarea
                  value={form.puntoEntregaTexto}
                  onChange={(e) => setForm({ ...form, puntoEntregaTexto: e.target.value })}
                  rows={2}
                  placeholder="Ej. Terminal de Autobuses Fletera, salida a costa"
                  className="flex w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Este texto se le muestra al cliente al marcar su pedido como enviado.
                </p>
              </div>
            )}
            <div>
              <label className="text-sm">Notas (opcional)</label>
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                rows={2}
                className="flex w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary"
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
// Tarifas
// ---------------------------------------------------------------------------

function formTarifaVacio() {
  return { destinoId: '', transportistaId: '', tamano: 'CHICO' as TamanoPaquete, precio: '', notas: '' };
}

function TarifasTab({
  destinos,
  transportistas,
  cargandoCatalogos,
}: {
  destinos: DestinoEnvio[];
  transportistas: Transportista[];
  cargandoCatalogos: boolean;
}) {
  const [tarifas, setTarifas] = useState<TarifaEnvio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroDestinoId, setFiltroDestinoId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editando, setEditando] = useState<TarifaEnvio | null>(null);
  const [form, setForm] = useState(formTarifaVacio());
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const qs = filtroDestinoId ? `?destinoId=${filtroDestinoId}` : '';
      const data = await api<TarifaEnvio[]>(`/envios/tarifas${qs}`);
      setTarifas(data);
    } catch (err) {
      toast({
        title: 'No se pudieron cargar las tarifas',
        description: err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
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
    setForm({ ...formTarifaVacio(), destinoId: filtroDestinoId });
    setDrawerOpen(true);
  }

  function abrirEditar(t: TarifaEnvio) {
    setEditando(t);
    setForm({
      destinoId: String(t.destinoId),
      transportistaId: String(t.transportistaId),
      tamano: t.tamano,
      precio: t.precio,
      notas: t.notas || '',
    });
    setDrawerOpen(true);
  }

  async function guardar() {
    if (!form.destinoId || !form.transportistaId) {
      toast({ title: 'Selecciona destino y transportista', variant: 'destructive' });
      return;
    }
    const precio = Number(form.precio);
    if (!precio || precio <= 0) {
      toast({ title: 'Captura un precio válido', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    const datos = {
      destinoId: Number(form.destinoId),
      transportistaId: Number(form.transportistaId),
      tamano: form.tamano,
      precio,
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
      toast({
        title: 'No se pudo guardar',
        description: err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(t: TarifaEnvio) {
    try {
      await api(`/envios/tarifas/${t.id}`, { method: 'PUT', body: JSON.stringify({ activo: !t.activo }) });
      cargar();
    } catch (err) {
      toast({
        title: 'No se pudo actualizar',
        description: err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
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
        <Button size="sm" onClick={abrirNuevo} disabled={destinos.length === 0 || transportistas.length === 0}>
          <Plus className="w-4 h-4" />
          Nueva tarifa
        </Button>
      </div>

      {(destinos.length === 0 || transportistas.length === 0) && !cargandoCatalogos && (
        <p className="text-sm text-muted-foreground">
          Da de alta al menos un transportista y un destino antes de capturar tarifas.
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
          description="Captura el precio la primera vez que lo cotices y ya no lo vuelvas a preguntar."
        />
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Destino</th>
                <th>Transportista</th>
                <th>Tamaño</th>
                <th>Precio</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tarifas.map((t) => (
                <tr key={t.id} className={!t.activo ? 'opacity-50' : ''}>
                  <td className="font-medium">
                    {t.destino.nombre} <span className="text-muted-foreground text-xs">({t.destino.municipio})</span>
                  </td>
                  <td className="text-sm">{t.transportista.nombre}</td>
                  <td className="text-sm">{TAMANO_LABEL[t.tamano]}</td>
                  <td className="tabular-nums font-medium">{formatoMonedaExacto(t.precio)}</td>
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
            <DrawerDescription>Precio conocido de un transportista hacia un destino, por tamaño de paquete.</DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div>
              <label className="text-sm">Destino</label>
              <Select value={form.destinoId} onChange={(e) => setForm({ ...form, destinoId: e.target.value })}>
                <option value="">Selecciona un destino</option>
                {destinos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre} ({d.municipio})
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
              <label className="text-sm">Tamaño de paquete</label>
              <Select value={form.tamano} onChange={(e) => setForm({ ...form, tamano: e.target.value as TamanoPaquete })}>
                {TAMANOS.map((t) => (
                  <option key={t} value={t}>
                    {TAMANO_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm">Precio</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.precio}
                onChange={(e) => setForm({ ...form, precio: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">Notas (opcional)</label>
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                rows={2}
                className="flex w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary"
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
