'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Meta Pixel de "Camino al Deporte" — solo debe cargar en el sitio de ventas (/tienda).
const META_PIXEL_ID = '1429672342401977';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// Se inserta como <script> literal (no con next/script) para que el código
// quede presente en el HTML que devuelve el servidor. El verificador
// automático de Meta ("No se detectó un píxel...") lee el código fuente de
// la página sin ejecutar JavaScript, así que necesita encontrar el texto
// fbq('init', ...) directamente en el HTML, no inyectado después por JS.
const PIXEL_BASE_CODE = `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');
`;

export default function MetaPixel() {
  const pathname = usePathname();
  const esPrimerRender = useRef(true);

  // La tienda es una SPA (Next.js App Router), así que las navegaciones entre
  // páginas no recargan el documento. Disparamos un PageView manual en cada
  // cambio de ruta para que Meta reciba las vistas de cada página del catálogo.
  // El primer render se ignora porque el script base ya envía ese PageView.
  useEffect(() => {
    if (esPrimerRender.current) {
      esPrimerRender.current = false;
      return;
    }
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'PageView');
    }
  }, [pathname]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script dangerouslySetInnerHTML={{ __html: PIXEL_BASE_CODE }} />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height={1}
          width={1}
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
