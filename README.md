# Radar Urbano

Radar comunitario de seguridad en México: fraudes telefónicos, robos, asaltos y más. Reporta en segundos, consulta antes de contestar o de pasar por una zona. Sitio: [radarurbano.org](https://radarurbano.org).

## Cómo funciona

- **Buscar**: escribe un número y ve si ya lo reportaron, con un score de confianza (Wilson score sobre reportes únicos).
- **Reportar**: describe qué pasó — nada más. Sin dropdown de categorías, sin registro. La IA decide sola de qué tipo de incidente se trata a partir del texto.
- **Ubicación**: para incidentes sin número (robo, asalto), un botón usa el GPS del navegador (difuminado a ~1km antes de guardarse); si no hay permiso, una zona/colonia escrita a mano se geocodifica del lado del servidor.
- **Seguridad de mi zona**: botón flotante que centra el mapa en tu ubicación real y genera un resumen en lenguaje natural (IA) de lo reportado cerca, con alerta visual (rojo si hay reportes, verde si no).
- **Mapa**: dos capas — fraude telefónico agregado por región (LADA), e incidentes físicos como puntos individuales con ubicación aproximada. Filtro de ventana de tiempo (slider de días en el header) y por categoría (chips dinámicos). Toggle para ver como mapa de calor. Los puntos más recientes se ven más opacos/grandes (recencia visual); eventos duplicados reportados por varias personas se fusionan en uno con contador de confirmaciones.

## Arquitectura

- Frontend: HTML/JS estático en GitHub Pages, dominio propio `radarurbano.org` detrás de Cloudflare (WAF + proxy, origen nunca expuesto)
- Datos: Supabase (Postgres + RLS) — proyecto `ifcgwnbaiozuvjorkcoc`
- IA (NVIDIA NIM, modelo `deepseek-ai/deepseek-v4-flash-0731`), usos distintos:
  - **Clasificación + extracción de entidades**: todo reporte nuevo se etiqueta solo (categoría abierta, no un catálogo fijo) y se le extraen hora del día / arma / vehículo mencionados, sin pedirle más campos al usuario
  - **Corroboración** (solo fraude telefónico, que tiene una identidad natural — el número): compara descripciones de reportes repetidos del mismo número; si contradicen entre sí, el reporte pasa a revisión manual en vez de publicarse directo
  - **Fusión de duplicados** (incidentes físicos): reportes muy cercanos en tiempo/lugar se comparan por texto; si describen el mismo evento, se enlazan (`duplicate_of`) en vez de aparecer como puntos repetidos
  - **Resumen de zona**: bajo demanda, resume en 2-3 frases los reportes cercanos a una ubicación
- Geocoding: Nominatim (OpenStreetMap) del lado del servidor, tanto para el seed de LADAs como para `location_text` cuando no hay GPS
- Confianza: Wilson score confidence interval sobre reportes únicos por número
- Deploy: GitHub Actions → GitHub Pages en cada push a `main`
- Anti-abuso: rate limit de 8 reportes/hora por IP (PostgREST `pgrst.db_pre_request`) + `ip_hash` (sha256 + salt, nunca la IP cruda) en cada reporte para detectar patrones de la misma fuente

## Estado

- [x] Schema multi-categoría (`reports` con teléfono opcional, ubicación GPS/texto, categoría abierta por IA, `duplicate_of`)
- [x] Frontend reestructurado: acciones flotantes pareadas (buscar / zona / reportar), slider de días en header, filtros de categoría, toggle de calor
- [x] Dominio propio `radarurbano.org` detrás de Cloudflare (WAF, proxy, origen oculto)
- [x] Seed completo de `lada_coordinates`: 397 códigos LADA de México
- [x] Edge Function `corroborate-report`: geocoding + clasificación + entidades + corroboración (teléfono) + fusión de duplicados (incidentes físicos), verificado end-to-end
- [x] Edge Function `summarize-zone`: resumen de seguridad por zona bajo demanda
- [x] Rate limiting por IP (8/hora) + `ip_hash` no reversible por reporte
- [x] Recencia visual + heatmap + confirmación de duplicados en el mapa
- [ ] Capa de contexto con datos abiertos de incidencia delictiva (SESNSP) como fondo del mapa — pendiente confirmar fuente/formato vigente
- [ ] **Revisión de `legal-lead` sobre riesgo de difamación — pendiente, sitio ya público con reportes reales**
- [ ] Activar "Enforce HTTPS" en GitHub Pages cuando el certificado de origen termine de emitirse
- [ ] Clustering de marcadores (diferido hasta que haya más volumen de reportes reales)
