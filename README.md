# Registro de Fraude

Registro comunitario de números de teléfono usados en fraudes en México. Reporta en 10 segundos, busca antes de contestar.

## Cómo funciona

- **Buscar**: escribe un número y ve si ya lo reportaron, con un score de confianza (Wilson score sobre reportes únicos).
- **Reportar**: número + qué pasó, nada más. Sin registro, sin fricción.
- **Mapa**: vista agregada por región (LADA), no ubicación exacta.

## Arquitectura

- Frontend: HTML/JS estático en GitHub Pages (sin build step, sin framework)
- Datos: Supabase (Postgres + RLS) — proyecto `ifcgwnbaiozuvjorkcoc`
- Confianza: Wilson score confidence interval + corroboración de contenido vía DeepSeek (pendiente: Edge Function)
- Deploy: GitHub Actions → GitHub Pages en cada push a `main`

## Estado

- [x] Schema de Supabase (`reports`, `lada_coordinates`, vistas `phone_confidence` y `fraud_counts_by_lada`)
- [x] Frontend MVP (búsqueda + formulario + mapa)
- [x] Seed parcial de `lada_coordinates` (~50 zonas metropolitanas principales, se amplía sobre la marcha)
- [x] Edge Function `corroborate-report` desplegada — se dispara vía trigger de Postgres (pg_net + Vault de Supabase para el secreto compartido) en cada insert. No-op seguro si faltan las API keys.
- [ ] **Pendiente en Supabase Dashboard → Settings → Edge Functions → Secrets:** `NVIDIA_NIM_API_KEY`, `RESEND_API_KEY`, `ALERT_EMAIL`, `FUNCTION_SECRET` (ver detalle en la conversación de la sesión que lo desplegó)
- [ ] Rate limiting por IP en el insert público
- [ ] Revisión de `legal-lead` sobre riesgo de difamación antes de lanzar público
- [ ] Mejorar frontend: mapa más prominente, botón flotante para reportar
