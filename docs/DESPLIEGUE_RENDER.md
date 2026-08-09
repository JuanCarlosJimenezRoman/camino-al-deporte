# Guía de despliegue — Render

Vas a crear un **proyecto nuevo en Render**, separado de `mayoreo-facil`,
específico para Camino al Deporte.

## 1. Subir el código a GitHub

Este scaffold vive por ahora en tu carpeta local. Crea un repositorio nuevo
(ej. `camino-al-deporte`) y sube por separado las carpetas `backend/` y
`frontend/` — lo más simple es un repo con ambas carpetas dentro (monorepo),
Render permite indicar el "Root Directory" de cada servicio.

```
git init
git add .
git commit -m "Scaffold inicial Camino al Deporte"
git branch -M main
git remote add origin https://github.com/JuanCarlosJimenezRoman/camino-al-deporte.git
git push -u origin main
```

## 2. Base de datos PostgreSQL en Render

1. Dashboard de Render → **New > PostgreSQL**.
2. Nombre: `camino-al-deporte-db`, plan Free para empezar.
3. Una vez creada, copia la **Internal Database URL** (si el backend va a
   vivir en el mismo proyecto/región de Render) o la **External Database
   URL** si te conectas desde fuera.

## 3. Backend (Web Service)

1. Dashboard de Render → **New > Web Service** → conecta el repo.
2. **Root Directory**: `backend`
3. **Build Command**: `npm install && npx prisma generate && npx prisma migrate deploy`
4. **Start Command**: `npm start`
5. Variables de entorno (Environment):
   - `DATABASE_URL` → la Internal Database URL del paso 2
   - `JWT_SECRET` → genera un valor largo y aleatorio
   - `JWT_EXPIRES_IN` → `8h`
   - `FRONTEND_URL` → la URL de tu frontend (la agregas después de desplegarlo)
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NOMBRE` → para el
     usuario administrador inicial
6. Después del primer deploy exitoso, corre el seed una sola vez desde la
   **Shell** de Render (pestaña "Shell" del servicio):
   ```
   npm run seed
   ```
   Esto crea los 5 roles y el usuario administrador principal.

## 4. Frontend

Tienes dos opciones igual de válidas:

### Opción A: Vercel (recomendado para Next.js)
1. Importa el repo en [vercel.com](https://vercel.com), **Root Directory**: `frontend`
2. Variable de entorno: `NEXT_PUBLIC_API_URL` → URL pública de tu backend en Render
3. Deploy automático con cada push.

### Opción B: Render (todo en un solo lugar)
1. Dashboard de Render → **New > Web Service** → mismo repo
2. **Root Directory**: `frontend`
3. **Build Command**: `npm install && npm run build`
4. **Start Command**: `npm start`
5. Variable de entorno: `NEXT_PUBLIC_API_URL` → URL pública de tu backend

Una vez tengas la URL final del frontend, vuelve al backend y actualiza
`FRONTEND_URL` con esa URL (para que CORS lo permita).

## 5. Primer login

1. Entra a la URL de tu frontend.
2. Usa el email/password que definiste en `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
3. Cambia esa contraseña cuanto antes (por ahora no hay pantalla de "cambiar
   contraseña" en el scaffold — se puede agregar como siguiente paso, o
   cambiarla directo en la base de datos).

## 6. Nota sobre este scaffold

El código se generó en este entorno sandbox, que **no tiene acceso al
registro de npm** por políticas de red, así que no pude correr `npm install`
ni `npm run build` aquí para verificarlo de punta a punta. Sí verifiqué la
sintaxis de todos los archivos `.js`/`.ts`/`.tsx`. Te recomiendo, como primer
paso en tu máquina o en Render, correr:

```
cd backend && npm install && npx prisma generate
cd ../frontend && npm install && npm run build
```

y avisarme si algo truena — lo resolvemos de inmediato.
