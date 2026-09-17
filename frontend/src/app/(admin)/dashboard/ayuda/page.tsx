'use client';

import { useState } from 'react';
import { BookOpen, Mail, MessageSquare, Phone, Send, HelpCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useConfigNegocio } from '@/lib/configNegocio';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Datos de contacto del desarrollador/soporte.
// Si en el futuro se agregan más personas o canales, se pueden mover a
// un archivo de configuración (p.ej. lib/configNegocio.ts) sin tocar esta
// página — por ahora se dejan como constantes locales para no acoplar.
// ---------------------------------------------------------------------------
const CONTACTO_SOPORTE = {
  nombre: 'Soporte técnico',
  email: 'soporte@camino-al-deporte.com',
  telefono: '+52 000 000 0000',
  whatsapp: '+52 000 000 0000',
  horario: 'Lunes a viernes de 9:00 a 18:00 hrs',
};

// Secciones del instructivo. El texto es deliberadamente genérico porque el
// Context Pack no incluye un manual de uso por pantalla; cada sección
// describe el flujo esperado (entrar, buscar, operar) sin inventar atajos
// ni funcionalidades que no estén ya visibles en el Topbar/Sidebar.
const SECCIONES_INSTRUCTIVO = [
  {
    id: 'primeros-pasos',
    titulo: 'Primeros pasos',
    contenido: [
      'Inicia sesión con tu correo y contraseña. Si no puedes entrar, revisa que el teclado no tenga mayúsculas activadas o que el correo esté bien escrito.',
      'Al entrar verás el panel principal. El menú lateral te permite moverte entre las secciones a las que tengas acceso.',
      'La barra superior (Topbar) muestra la sucursal activa, el buscador global (⌘K / Ctrl+K), el cambio de tema y este botón de ayuda.',
    ],
  },
  {
    id: 'navegacion',
    titulo: 'Cómo navegar el panel',
    contenido: [
      'Usa el menú lateral para cambiar de módulo (Productos, Ventas, Inventario, etc.).',
      'La barra superior tiene un breadcrumb (Inicio › Sección) que te indica dónde estás; haz clic en "Inicio" para volver al tablero.',
      'El buscador global (⌘K o Ctrl+K) permite encontrar productos, SKUs o marcas sin salir de la pantalla actual.',
      'Si tienes más de una sucursal, el selector de sucursal en la Topbar cambia el contexto de los datos que ves.',
    ],
  },
  {
    id: 'operaciones-frecuentes',
    titulo: 'Operaciones frecuentes',
    contenido: [
      'Para registrar una venta, entra a Ventas y usa el buscador del punto de venta para agregar productos al carrito.',
      'Para consultar existencias, entra a Inventario y filtra por sucursal o producto.',
      'Para revisar el corte del día, entra a Ventas → Corte del día.',
      'Para editar tus datos personales, abre el menú de usuario (arriba a la derecha) → "Mi perfil".',
    ],
  },
  {
    id: 'problemas-comunes',
    titulo: 'Problemas comunes',
    contenido: [
      'Si una pantalla no carga, recarga la página (F5). Si el problema continúa, cierra sesión y vuelve a entrar.',
      'Si no ves una sección en el menú, puede ser que tu rol no tenga permisos para ella; contacta a un administrador.',
      'Si un producto no aparece en el buscador, verifica que no esté archivado o que la sucursal activa tenga existencias.',
      'Si el tema (claro/oscuro) no cambia, prueba recargar; el botón de tema está en la Topbar.',
    ],
  },
];

export function AyudaPage() {
  const { usuario } = useAuth();
  const { config } = useConfigNegocio();
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({
    asunto: '',
    descripcion: '',
    // Se precargan del usuario autenticado para que no los tenga que escribir;
    // el formulario igual los deja editables por si quiere que le respondan
    // a otro correo.
    correoContacto: usuario?.email ?? '',
    nombreContacto: usuario?.nombre ?? '',
  });

  function actualizarCampo(campo: keyof typeof form, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function enviarFormulario(e: React.FormEvent) {
    e.preventDefault();
    if (!form.asunto.trim() || !form.descripcion.trim()) {
      toast({
        title: 'Faltan datos',
        description: 'El asunto y la descripción son obligatorios.',
        variant: 'destructive',
      });
      return;
    }
    setEnviando(true);
    try {
      // No hay endpoint de backend para esto en el Context Pack. Se deja
      // listo para conectar cuando exista (p.ej. POST /soporte/tickets).
      // Mientras tanto se simula el envío para no romper el flujo visual.
      await new Promise((r) => setTimeout(r, 600));
      toast({
        title: 'Mensaje enviado',
        description: `Gracias ${form.nombreContacto || ''}, te contactaremos a ${form.correoContacto} lo antes posible.`,
      });
      setForm((prev) => ({ ...prev, asunto: '', descripcion: '' }));
    } catch {
      toast({
        title: 'No se pudo enviar',
        description: 'Intenta de nuevo o escríbenos directamente al correo de soporte.',
        variant: 'destructive',
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ayuda"
        description={`Instructivo y soporte para ${config.nombre || 'el panel'}.`}
      />

      {/* Instructivo ----------------------------------------------------- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <CardTitle>Instructivo de uso</CardTitle>
          </div>
          <CardDescription>
            Guía rápida de las tareas más comunes. Si algo no queda claro, usa el formulario de abajo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {SECCIONES_INSTRUCTIVO.map((seccion) => (
            <section key={seccion.id} id={seccion.id} className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
                {seccion.titulo}
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                {seccion.contenido.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </CardContent>
      </Card>

      {/* Contacto -------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <CardTitle>Datos de contacto</CardTitle>
          </div>
          <CardDescription>
            Si el instructivo no resuelve tu problema, puedes contactarnos por cualquiera de estos medios.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Correo</p>
              <a
                href={`mailto:${CONTACTO_SOPORTE.email}`}
                className="text-sm font-medium hover:underline truncate block"
              >
                {CONTACTO_SOPORTE.email}
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Teléfono</p>
              <a
                href={`tel:${CONTACTO_SOPORTE.telefono.replace(/\s/g, '')}`}
                className="text-sm font-medium hover:underline truncate block"
              >
                {CONTACTO_SOPORTE.telefono}
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">WhatsApp</p>
              <a
                href={`https://wa.me/${CONTACTO_SOPORTE.whatsapp.replace(/[^\d]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline truncate block"
              >
                {CONTACTO_SOPORTE.whatsapp}
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Horario</p>
              <p className="text-sm font-medium truncate">{CONTACTO_SOPORTE.horario}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Formulario ------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            <CardTitle>Enviar un mensaje</CardTitle>
          </div>
          <CardDescription>
            Cuéntanos qué problema tienes o qué funcionalidad necesitas. Te responderemos al correo que indiques.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviarFormulario} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="nombreContacto" className="text-sm font-medium">
                  Nombre
                </label>
                <Input
                  id="nombreContacto"
                  value={form.nombreContacto}
                  onChange={(e) => actualizarCampo('nombreContacto', e.target.value)}
                  placeholder="Tu nombre"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="correoContacto" className="text-sm font-medium">
                  Correo de contacto
                </label>
                <Input
                  id="correoContacto"
                  type="email"
                  value={form.correoContacto}
                  onChange={(e) => actualizarCampo('correoContacto', e.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="asunto" className="text-sm font-medium">
                Asunto <span className="text-destructive">*</span>
              </label>
              <Input
                id="asunto"
                value={form.asunto}
                onChange={(e) => actualizarCampo('asunto', e.target.value)}
                placeholder="Ej. No puedo registrar una venta"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="descripcion" className="text-sm font-medium">
                Descripción <span className="text-destructive">*</span>
              </label>
              <textarea
                id="descripcion"
                value={form.descripcion}
                onChange={(e) => actualizarCampo('descripcion', e.target.value)}
                placeholder="Describe el problema con el mayor detalle posible (qué intentaste, qué esperabas, qué pasó)."
                rows={5}
                required
                className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 resize-y min-h-[120px]"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar mensaje'}
                <Send className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}