# Sealnote

## App

Secure notes app built with Next.js, Prisma, and PostgreSQL.

## Short Description

Sealnote stores user notes with Google authentication, PostgreSQL persistence, and a Docker setup that can run locally or behind Cloudflare Tunnel.

## Require

- Node.js 20+
- npm
- Docker with Docker Compose

## How To Run Local

1. Copy env file:

```bash
cp .env.example .env
```

2. Keep local app overrides in `.env.local`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:55432/sealnote"
NEXTAUTH_URL="http://localhost:3041"
```

3. Start PostgreSQL:

```bash
docker compose up -d postgres
```

4. Apply migrations:

```bash
npm run db:migrate:deploy
```

5. Start app:

```bash
PORT=3041 npm run dev
```

Open `http://localhost:3041`.

## How To Run Docker

1. Copy env file:

```bash
cp .env.example .env
```

2. Fill required values in `.env`:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `TUNNEL_TOKEN`

3. Start app and database:

```bash
docker compose up -d --build
```

4. Start production stack with Cloudflare Tunnel:

```bash
docker compose --profile prod up -d --build
```
