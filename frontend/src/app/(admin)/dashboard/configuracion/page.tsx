'use client';

import { useEffect, useState } from 'react';
import { api, apiUpload, ApiError } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import { useConfigNegocio } from '@/lib/configNegocio';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/use-toast';
import { Lock, Loader2, Trash2 } from 'lucide-react';

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

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [quitando, setQuitando] = useState(false);

  // Al entrar se traen los valores reales guardados (el provider del layout
  // ya trae una copia, pero aquí se sincroniza por si se guardó y se navegó).
  useEffect(() => {
    api<{
      nombreNegocio: string;
      iniciales: string;
      logoTicketUrl: string | null;
    }>('/configuracion-tienda')
      .then((data) => {
        setNombre(data.nombreNegocio || 'Camino al Deporte');
        setIniciales(data.iniciales || 'CD');
        setLogoUrl(data.logoTicketUrl || null);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        subtitle="Identidad del negocio: nombre, iniciales y logo. Se usa en tickets, comprobantes y en el panel — así puedes reutilizar el sistema para otro negocio."
        breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Configuración' }]}
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
        </>
      )}
    </div>
  );
}
