# Camino al Deporte

Sistema de gestión de inventarios y ventas, multiplataforma (web responsiva),
con roles: Administrador Principal, Desarrollo, Inventario, Ventas y Consulta.

- `backend/` — API en Node.js + Express + Prisma + PostgreSQL
- `frontend/` — App en Next.js (React)
- `docs/ARQUITECTURA.md` — diseño del sistema, modelo de datos, matriz de roles
- `docs/DESPLIEGUE_RENDER.md` — cómo desplegar paso a paso en Render

## Arrancar en local

### Backend
```
cd backend
npm install
cp .env.example .env   # completa DATABASE_URL con tu PostgreSQL local o de Render
npx prisma migrate dev --name init
npm run seed
npm run dev
```

### Frontend
```
cd frontend
npm install
cp .env.local.example .env.local   # apunta a http://localhost:4000 si el backend corre local
npm run dev
```

Abre `http://localhost:3000`, inicia sesión con el usuario que creó `npm run seed`.
