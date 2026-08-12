# Radar Urbano

Registro comunitario de números de teléfono usados en fraudes en México. Reporta en 10 segundos, busca antes de contestar.

## Cómo funciona

- **Buscar**: escribe un número y ve si ya lo reportaron, con un score de confianza (Wilson score sobre reportes únicos).
- **Reportar**: número + qué pasó, nada más. Sin registro, sin fricción.
- **Mapa**: vista agregada por región (LADA), no ubicación exacta.

## Arquitectura

- Frontend: HTML/JS estático en GitHub Pages (sin build step, sin framework)
- Datos: Supabase (Postgres + RLS) — proyecto `ifcgwnbaiozuvjorkcoc`
- Confianza: Wilson score confidence interval + corroboración de contenido vía DeepSeek (NVIDIA NIM)
- Deploy: GitHub Actions → GitHub Pages en cada push a `main`
- Anti-abuso: rate limit de 8 reportes/hora por IP (PostgREST `pgrst.db_pre_request`) + `ip_hash` (sha256 + salt, nunca la IP cruda) en cada reporte para detectar patrones de la misma fuente

## Estado

- [x] Schema de Supabase (`reports`, `lada_coordinates`, vistas `phone_confidence` y `fraud_counts_by_lada`)
- [x] Frontend MVP (búsqueda + formulario + mapa a pantalla completa + botón flotante para reportar)
- [x] Seed parcial de `lada_coordinates` (~50 zonas metropolitanas principales, se amplía sobre la marcha)
- [x] Edge Function `corroborate-report` activa y verificada end-to-end (modelo `deepseek-ai/deepseek-v4-flash-0731` vía NVIDIA NIM, alerta por Resend en reportes contradictorios)
- [x] Rate limiting por IP (8/hora) + `ip_hash` no reversible por reporte
- [ ] Dominio propio `radarurbano.org` (comprado en Cloudflare) detrás de WAF, sin exponer el nombre del dueño
- [ ] Revisión de `legal-lead` sobre riesgo de difamación antes de lanzar público
- [ ] Ampliar seed de LADAs (~250 faltantes) según lleguen reportes fuera de las zonas ya cubiertas
