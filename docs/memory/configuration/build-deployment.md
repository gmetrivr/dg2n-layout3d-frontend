# Build & Deployment

## Overview

The app is built with Vite 7, deployed to Vercel, and uses TypeScript with a path alias for shadcn/ui components. The dev server proxies API requests to avoid CORS and ISP-blocking issues.

## Requirements

- The `@/shadcn` path alias MUST resolve to `./src/shadcn` in both TypeScript and Vite.
- The Vite dev server proxy MUST forward `/(api|config)` to `http://localhost:4260` (Fastify backend).
- The Vite dev server proxy MUST forward `/api/tooling/processStore3DZip` to `https://stockflow-core.rc.dg2n.com`.
- Production builds MUST set `MODE` to `production` to use absolute backend URLs.
- `VITE_SUPABASE_URL` MUST be proxied via the backend in production (Jio ISP blocks direct Supabase connections — see commit `3e1a68f`).

## Design Decisions

### Vite Configuration

```ts
// vite.config.ts
{
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@/shadcn": "./src/shadcn" }
  },
  server: {
    proxy: {
      '/api/tooling/processStore3DZip': {
        target: 'https://stockflow-core.rc.dg2n.com',
        changeOrigin: true, secure: true
      },
      '^/(api|config)': {
        target: 'http://localhost:4260',  // Fastify backend in dev
        changeOrigin: true, secure: false
      }
    }
  }
}
```

Note: Production Stockflow URL (`https://stockflow-core.dg2n.com`) is commented out — RC URL used universally.

### TypeScript Path Aliases

```json
// tsconfig.json paths
"@/shadcn/*": ["./src/shadcn/*"]
```

Three tsconfig files:
- `tsconfig.json` — root, references app and node configs
- `tsconfig.app.json` — browser code compiler options
- `tsconfig.node.json` — Vite/Node tool compiler options

### Vercel Deployment

`vercel.json` configures Vercel deployment. Likely includes SPA routing rewrites (all paths → `index.html`) given the React Router setup. [INFERRED]

### Jio ISP Supabase Proxy

Commit `3e1a68f` introduced a backend proxy for `VITE_SUPABASE_URL` to work around Jio ISP blocking direct connections to Supabase. The backend (Fastify) acts as a relay. This affects how `VITE_SUPABASE_URL` is configured in production — it should point to the backend proxy endpoint, not the raw Supabase URL.

### npm Scripts (package.json)

Standard Vite scripts (inferred):

```json
{
  "dev": "vite",
  "build": "vite build",
  "build:rc": "vite build --mode rc",
  "build:prod": "vite build --mode production",
  "preview": "vite preview"
}
```

### Dependencies Summary

| Category | Key Packages |
|---|---|
| Framework | react@19.1.0, react-router-dom@7.7.1 |
| 3D | three@0.179.1, @react-three/fiber@9.3.0, @react-three/drei@10.6.1 |
| Backend | @supabase/supabase-js@2.57.4, jszip@3.10.1 |
| UI | tailwindcss@4.1.11, lucide-react@0.534.0, radix-ui |
| Build | vite@7.0.4, typescript~5.8.3 |

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
