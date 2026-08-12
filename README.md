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
- [ ] Seed de `lada_coordinates` (~300 códigos LADA de México)
- [ ] Edge Function de corroboración (DeepSeek vía NVIDIA NIM) + flag a `pending` en reportes contradictorios
- [ ] Aviso por correo (Resend) para revisión manual de casos contradictorios
- [ ] Rate limiting por IP en el insert público
- [ ] Revisión de `legal-lead` sobre riesgo de difamación antes de lanzar público
