# Radar Urbano

Radar comunitario de seguridad en México: fraudes telefónicos, robos, asaltos y más. Reporta en segundos, consulta antes de contestar o de pasar por una zona. Sitio: [radarurbano.org](https://radarurbano.org).

## Cómo funciona

- **Buscar**: escribe un número y ve si ya lo reportaron, con un score de confianza (Wilson score sobre reportes únicos).
- **Reportar**: describe qué pasó — nada más. Sin dropdown de categorías, sin registro. La IA decide sola de qué tipo de incidente se trata a partir del texto.
- **Ubicación**: para incidentes sin número (robo, asalto), un botón usa el GPS del navegador (difuminado a ~1km antes de guardarse) o, si no hay permiso, una zona/colonia escrita a mano.
- **Mapa**: dos capas — fraude telefónico agregado por región (LADA), e incidentes físicos como puntos individuales con ubicación aproximada.

## Arquitectura

- Frontend: HTML/JS estático en GitHub Pages, dominio propio `radarurbano.org` detrás de Cloudflare (WAF + proxy, origen nunca expuesto)
- Datos: Supabase (Postgres + RLS) — proyecto `ifcgwnbaiozuvjorkcoc`
- IA (NVIDIA NIM, modelo `deepseek-ai/deepseek-v4-flash-0731`), dos usos distintos:
  - **Clasificación**: todo reporte nuevo se etiqueta solo, categoría abierta (no un catálogo fijo)
  - **Corroboración** (solo fraude telefónico, que tiene una identidad natural — el número): compara descripciones de reportes repetidos del mismo número; si contradicen entre sí, el reporte pasa a revisión manual en vez de publicarse directo
- Confianza: Wilson score confidence interval sobre reportes únicos por número
- Deploy: GitHub Actions → GitHub Pages en cada push a `main`
- Anti-abuso: rate limit de 8 reportes/hora por IP (PostgREST `pgrst.db_pre_request`) + `ip_hash` (sha256 + salt, nunca la IP cruda) en cada reporte para detectar patrones de la misma fuente

## Estado

- [x] Schema multi-categoría (`reports` con teléfono opcional, ubicación GPS/texto, categoría abierta por IA)
- [x] Frontend (búsqueda + formulario adaptativo + mapa de dos capas + botón flotante)
- [x] Dominio propio `radarurbano.org` detrás de Cloudflare (WAF, proxy, origen oculto)
- [x] Seed parcial de `lada_coordinates` (~50 zonas metropolitanas principales, se amplía sobre la marcha)
- [x] Edge Function `corroborate-report`: clasificación en todo reporte + corroboración en fraude telefónico, verificada end-to-end
- [x] Rate limiting por IP (8/hora) + `ip_hash` no reversible por reporte
- [ ] Capa de contexto con datos abiertos de incidencia delictiva (SESNSP) como fondo del mapa — pendiente confirmar fuente/formato vigente
- [ ] Revisión de `legal-lead` sobre riesgo de difamación antes de lanzar público
- [ ] Ampliar seed de LADAs (~250 faltantes) según lleguen reportes fuera de las zonas ya cubiertas
- [ ] Activar "Enforce HTTPS" en GitHub Pages cuando el certificado de origen termine de emitirse
