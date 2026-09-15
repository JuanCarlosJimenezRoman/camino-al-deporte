'use client';

import { useEffect, useState } from 'react';
import { api, apiUpload, apiPostBlob, ApiError } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import { useConfigNegocio } from '@/lib/configNegocio';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/use-toast';
import { Lock, Loader2, Trash2, Eye } from 'lucide-react';

// Deriva unas iniciales razonables a partir del nombre (ej. "Camino al
// Deporte" -> "CD", ignorando palabras cortas como "al"/"de"). Solo se usa
// como sugerencia al escribir el nombre; el usuario puede editarlas a mano.
function derivarIniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter((p) => p.length > 2);
  const letras = palabras.slice(0, 3).map((p) => p[0]).join('');
  return (letras || nombre.trim().slice(0, 2)).toUpperCase();
}

export default function ConfiguracionPage() {
  const { usuario } = useAuth();
  const { config, cargando: cargandoMarca } = useConfigNegocio();
  const puedeEditar = puedeVer('configuracion', usuario?.rol);

  const [nombre, setNombre] = useState(config.nombre);
  const [iniciales, setIniciales] = useState(config.iniciales);
  const [logoUrl, setLogoUrl] = useState<string | null>(config.logoUrl);

  // Configuración del ticket de venta (ver utils/ticketPdf.js en el
  // backend): mensaje libre de pie de página y qué mostrar/ocultar en cada
  // ticket impreso — todo nace en "mostrar" (true) para no cambiar nada en
  // negocios que no lo han tocado.
  const [mensajeTicketPie, setMensajeTicketPie] = useState('');
  const [mostrarCodigoBarrasTicket, setMostrarCodigoBarrasTicket] = useState(true);
  const [mostrarVendedorTicket, setMostrarVendedorTicket] = useState(true);
  const [mostrarSucursalTicket, setMostrarSucursalTicket] = useState(true);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardandoTicket, setGuardandoTicket] = useState(false);
  const [generandoVistaPrevia, setGenerandoVistaPrevia] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [quitando, setQuitando] = useState(false);

  // Al entrar se traen los valores reales guardados (el provider del layout
  // ya trae una copia, pero aquí se sincroniza por si se guardó y se navegó).
  useEffect(() => {
    api<{
      nombreNegocio: string;
      iniciales: string;
      logoTicketUrl: string | null;
      mensajeTicketPie: string | null;
      mostrarCodigoBarrasTicket: boolean;
      mostrarVendedorTicket: boolean;
      mostrarSucursalTicket: boolean;
    }>('/configuracion-tienda')
      .then((data) => {
        setNombre(data.nombreNegocio || 'Camino al Deporte');
        setIniciales(data.iniciales || 'CD');
        setLogoUrl(data.logoTicketUrl || null);
        setMensajeTicketPie(data.mensajeTicketPie || '');
        setMostrarCodigoBarrasTicket(data.mostrarCodigoBarrasTicket ?? true);
        setMostrarVendedorTicket(data.mostrarVendedorTicket ?? true);
        setMostrarSucursalTicket(data.mostrarSucursalTicket ?? true);
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  if (!puedeEditar) {
    return <EmptyState icon={Lock} title="Sin acceso" description="No tienes permiso para ver esta sección." />;
  }

  function cambiarNombre(valor: string) {
    setNombre(valor);
    setIniciales(derivarIniciales(valor));
  }

  async function guardarIdentidad() {
    if (!nombre.trim()) {
      toast({ title: 'El nombre no puede quedar vacío', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    try {
      await api('/configuracion-tienda', {
        method: 'PUT',
        body: JSON.stringify({ nombreNegocio: nombre.trim(), iniciales: iniciales.trim() || derivarIniciales(nombre) }),
      });
      toast({ title: 'Identidad guardada', variant: 'success' });
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err instanceof ApiError ? err.message : undefined, variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  async function subirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendo(true);
    try {
      const formData = new FormData();
      formData.append('logo', archivo);
      const res = await apiUpload<{ logoTicketUrl: string | null }>('/configuracion-tienda/logo', formData);
      setLogoUrl(res.logoTicketUrl || null);
      toast({ title: 'Logo guardado', variant: 'success' });
    } catch (err) {
      toast({ title: 'No se pudo subir el logo', description: err instanceof ApiError ? err.message : undefined, variant: 'destructive' });
    } finally {
      setSubiendo(false);
      e.target.value = '';
    }
  }

  async function quitarLogo() {
    setQuitando(true);
    try {
      await api('/configuracion-tienda/logo', { method: 'DELETE' });
      setLogoUrl(null);
      toast({ title: 'Logo quitado', description: 'El ticket volverá a mostrar las iniciales.', variant: 'success' });
    } catch (err) {
      toast({ title: 'No se pudo quitar el logo', description: err instanceof ApiError ? err.message : undefined, variant: 'destructive' });
    } finally {
      setQuitando(false);
    }
  }

  // Vista previa: arma un ticket de EJEMPLO (venta ficticia, ver
  // ventaEjemploTicket en el backend) con el nombre, iniciales, mensaje de
  // pie e interruptores que hay AHORA MISMO en pantalla, aunque todavía no
  // se hayan guardado — así se ve el efecto de cada cambio antes de decidir
  // si guardarlo. El logo sí es siempre el ya guardado (se sube/quita al
  // instante, no es un borrador).
  async function previsualizarTicket() {
    setGenerandoVistaPrevia(true);
    try {
      const blob = await apiPostBlob('/configuracion-tienda/vista-previa-ticket', {
        nombreNegocio: nombre.trim() || undefined,
        iniciales: iniciales.trim() || undefined,
        mensajeTicketPie: mensajeTicketPie.trim() || null,
        mostrarCodigoBarrasTicket,
        mostrarVendedorTicket,
        mostrarSucursalTicket,
      });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast({
        title: 'No se pudo generar la vista previa',
        description: err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setGenerandoVistaPrevia(false);
    }
  }

  async function guardarConfiguracionTicket() {
    setGuardandoTicket(true);
    try {
      await api('/configuracion-tienda', {
        method: 'PUT',
        body: JSON.stringify({
          mensajeTicketPie: mensajeTicketPie.trim() || null,
          mostrarCodigoBarrasTicket,
          mostrarVendedorTicket,
          mostrarSucursalTicket,
        }),
      });
      toast({ title: 'Configuración del ticket guardada', variant: 'success' });
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err instanceof ApiError ? err.message : undefined, variant: 'destructive' });
    } finally {
      setGuardandoTicket(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        subtitle="Identidad del negocio: nombre, iniciales y logo. Se usa en tickets, comprobantes y en el panel — así puedes reutilizar el sistema para otro negocio."
        breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Configuración' }]}
        actions={
          !cargando && !cargandoMarca ? (
            <Button
              variant="outline"
              onClick={previsualizarTicket}
              disabled={generandoVistaPrevia}
              title="Genera un ticket de ejemplo con lo que llevas en pantalla, aunque no lo hayas guardado"
            >
              <Eye className="w-4 h-4" />
              {generandoVistaPrevia ? 'Generando…' : 'Vista previa del ticket'}
            </Button>
          ) : undefined
        }
      />

      {cargando || cargandoMarca ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nombre e iniciales</CardTitle>
              <CardDescription>
                El nombre aparece en el encabezado de los tickets y en el panel; las iniciales son el respaldo cuando
                no hay logo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm">Nombre del negocio</label>
                <Input value={nombre} onChange={(e) => cambiarNombre(e.target.value)} placeholder="Camino al Deporte" />
              </div>
              <div className="max-w-[140px]">
                <label className="text-sm">Iniciales</label>
                <Input value={iniciales} onChange={(e) => setIniciales(e.target.value.toUpperCase())} maxLength={6} placeholder="CD" />
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={guardarIdentidad} disabled={guardando}>
                  {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar identidad'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Logo</CardTitle>
              <CardDescription>
                Imagen que aparece en el encabezado del ticket y de los comprobantes (en lugar de las iniciales).
                Conviene un logo cuadrado en PNG/JPG.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo del negocio"
                  className="w-16 h-16 rounded-lg object-contain border border-border bg-white"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg border border-dashed border-border flex items-center justify-center text-lg font-bold text-muted-foreground">
                  {iniciales || 'CD'}
                </div>
              )}

              <div className="flex items-center gap-2">
                <label className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer">
                  {subiendo ? 'Subiendo...' : logoUrl ? 'Reemplazar logo' : 'Subir logo'}
                  <input type="file" accept="image/*" onChange={subirLogo} disabled={subiendo} className="hidden" />
                </label>
                {logoUrl && (
                  <Button variant="outline" onClick={quitarLogo} disabled={quitando}>
                    <Trash2 className="w-4 h-4" />
                    Quitar logo
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ticket de venta</CardTitle>
              <CardDescription>
                Qué se imprime en el ticket (PDF) de cada venta, además del nombre, iniciales y logo de arriba. Usa
                "Vista previa del ticket" (arriba a la derecha) para ver el efecto de un cambio antes de guardarlo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm">Mensaje de pie de página (opcional)</label>
                <textarea
                  value={mensajeTicketPie}
                  onChange={(e) => setMensajeTicketPie(e.target.value)}
                  maxLength={300}
                  rows={3}
                  placeholder="Ej. Cambios y devoluciones dentro de 15 días con este ticket. Síguenos: @caminoaldeporte"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Se imprime debajo del aviso de "no es un comprobante fiscal". {mensajeTicketPie.length}/300.
                </p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={mostrarCodigoBarrasTicket}
                    onChange={(e) => setMostrarCodigoBarrasTicket(e.target.checked)}
                  />
                  Mostrar código de barras del folio
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={mostrarVendedorTicket}
                    onChange={(e) => setMostrarVendedorTicket(e.target.checked)}
                  />
                  Mostrar el nombre de quien vendió
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={mostrarSucursalTicket}
                    onChange={(e) => setMostrarSucursalTicket(e.target.checked)}
                  />
                  Mostrar la sucursal
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={guardarConfiguracionTicket} disabled={guardandoTicket}>
                  {guardandoTicket ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar configuración del ticket'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
