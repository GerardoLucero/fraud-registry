import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
const SERVICE_KEY = SUPABASE_SECRET_KEYS['default'] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FUNCTION_SECRET = Deno.env.get('FUNCTION_SECRET')
const TOP_N = 400

const SOURCE_URL =
  'https://raw.githubusercontent.com/lapanquecita/incidencia-delictiva/master/data/timeseries_municipal.csv'

// Espejo comunitario en GitHub de los datos abiertos de SESNSP -- los endpoints
// oficiales (datos.gob.mx, gob.mx/sesnsp) bloquean trafico automatizado (Akamai WAF,
// links de SharePoint fragiles). Ver README para el detalle de esta decision.
const VIOLENT = new Set([
  'Homicidio doloso',
  'Secuestro',
  'Violación simple',
  'Violación equiparada',
  'Lesiones dolosas',
  'Extorsión',
  'Trata de personas',
])

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

// Este endpoint solo lo llama pg_cron (via pg_net), nunca el navegador.
Deno.serve(async (req) => {
  if (!FUNCTION_SECRET || req.headers.get('x-webhook-secret') !== FUNCTION_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  const csvRes = await fetch(SOURCE_URL)
  if (!csvRes.ok) {
    return new Response(`error fetching source csv: ${csvRes.status}`, { status: 502 })
  }
  const csvText = await csvRes.text()
  const lines = csvText.split('\n')
  lines.shift() // header: AÑO,CVE_MUN,DELITO,TOTAL

  type Agg = { total: number; robos: number; violentos: number }
  const agg = new Map<string, Agg>()
  let latestYear = 0

  for (const line of lines) {
    if (!line.trim()) continue
    const [yearStr, cve, delito, totalStr] = line.split(',')
    const year = parseInt(yearStr, 10)
    if (!year || !cve) continue
    if (year > latestYear) latestYear = year
  }

  for (const line of lines) {
    if (!line.trim()) continue
    const [yearStr, cve, delito, totalStr] = line.split(',')
    const year = parseInt(yearStr, 10)
    if (year !== latestYear) continue
    const total = parseInt(totalStr, 10) || 0

    const entry = agg.get(cve) ?? { total: 0, robos: 0, violentos: 0 }
    entry.total += total
    if (delito?.startsWith('Robo')) entry.robos += total
    if (VIOLENT.has(delito)) entry.violentos += total
    agg.set(cve, entry)
  }

  // Solo actualizamos municipios que ya tienen coordenadas sembradas -- FK constraint
  // lo exige, y evita crecer el set de municipios sin supervision cada mes.
  const { data: knownMunis, error: knownError } = await supabaseAdmin
    .from('municipio_coordinates')
    .select('cve_mun')

  if (knownError) {
    return new Response(`db error: ${knownError.message}`, { status: 500 })
  }
  const knownSet = new Set((knownMunis ?? []).map((r: { cve_mun: string }) => r.cve_mun))

  const rows = [...agg.entries()]
    .filter(([cve]) => knownSet.has(cve))
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, TOP_N)
    .map(([cve, v]) => ({
      cve_mun: cve,
      year: latestYear,
      total_delitos: v.total,
      total_robos: v.robos,
      total_violentos: v.violentos,
      updated_at: new Date().toISOString(),
    }))

  const { error: upsertError } = await supabaseAdmin
    .from('sesnsp_municipal_crime')
    .upsert(rows, { onConflict: 'cve_mun,year' })

  if (upsertError) {
    return new Response(`upsert error: ${upsertError.message}`, { status: 500 })
  }

  return new Response(`ok: updated ${rows.length} municipios for year ${latestYear}`, { status: 200 })
})
