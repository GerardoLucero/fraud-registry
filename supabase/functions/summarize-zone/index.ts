const NVIDIA_NIM_API_KEY = Deno.env.get('NVIDIA_NIM_API_KEY')
const NIM_MODEL = 'deepseek-ai/deepseek-v4-flash-0731'
const MAX_REPORTS = 15

const ALLOWED_ORIGINS = new Set(['https://radarurbano.org', 'https://www.radarurbano.org'])

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://radarurbano.org'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function sesnspLine(sesnsp: any): string {
  if (!sesnsp) return ''
  return `Contexto oficial (SESNSP, ${sesnsp.municipio}, ${sesnsp.estado}, ultimo ano disponible): ${sesnsp.total_delitos} delitos totales, ${sesnsp.total_robos} robos, ${sesnsp.total_violentos} delitos violentos. Esto es un promedio historico del municipio, no reportes en vivo de esta app.`
}

// Llamada directa desde el navegador (boton "que tan segura es esta zona").
// Sin acceso a la base de datos: el cliente ya trajo los reportes cercanos via su
// propia sesion anon (RLS solo deja ver status=published), esta funcion solo resume.
Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers })
  }

  if (!NVIDIA_NIM_API_KEY) {
    return new Response(JSON.stringify({ summary: 'Resumen no disponible por ahora.' }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'bad payload' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }

  const reports = Array.isArray(body.reports) ? body.reports.slice(0, MAX_REPORTS) : []
  const sesnsp = body.sesnsp ?? null

  if (reports.length === 0 && !sesnsp) {
    return new Response(
      JSON.stringify({ summary: 'No hay reportes recientes en esta zona ni datos históricos disponibles todavía. Eso no significa que sea segura, solo que no tenemos información de esta zona.' }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } }
    )
  }

  const reportLines = reports.length > 0
    ? reports
        .map((r: any, i: number) => `${i + 1}. [${r.category || 'sin clasificar'}] ${r.description} (${r.created_at ? new Date(r.created_at).toLocaleDateString('es-MX') : 'fecha desconocida'})`)
        .join('\n')
    : 'Ninguno.'

  const prompt = `Eres el asistente de un radar urbano comunitario en Mexico. Un usuario quiere saber que tan segura es una zona ahora mismo. Tienes dos fuentes, no las confundas:

Reportes en vivo cercanos (de la app, recientes):
${reportLines}

${sesnspLine(sesnsp) || 'Sin contexto oficial SESNSP disponible para esta zona.'}

Escribe 2-3 frases cortas en espanol neutro de Mexico. El tono correcto es el de alguien que conoce la zona y te da un aviso rapido y directo -- ni el reporte de una dependencia de gobierno, ni un chat entre cuates con groserias o jerga de calle ("un chingo", "no manches", "aguas"). Nada de frases como "actividad delictiva considerable en terminos generales" o "te sugiero mantener precauciones habituales" -- pero tampoco caigas en slang. Punto medio: claro, humano, sin adornos. Ve al grano: que paso (o no paso), que tan grave es, y una recomendacion breve si aplica. No alarmista, pero tampoco le restes importancia. Si no hay reportes en vivo pero SI hay contexto SESNSP, dilo directo ("nadie ha reportado nada aqui todavia, pero esta zona historicamente tiene..."). Si hay reportes en vivo, esos van primero. No inventes datos que no esten arriba.`

  // NIM a veces responde 529 "temporarily overloaded" -- transitorio, un reintento
  // corto lo resuelve la mayoria de las veces en vez de mostrarle el error al usuario.
  async function callNimOnce() {
    return fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NVIDIA_NIM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: NIM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200,
      }),
    })
  }

  let nimRes = await callNimOnce()
  if (!nimRes.ok && (nimRes.status === 529 || nimRes.status === 503)) {
    console.warn(`NIM overloaded (${nimRes.status}), retrying once...`)
    await new Promise((r) => setTimeout(r, 1200))
    nimRes = await callNimOnce()
  }

  if (!nimRes.ok) {
    console.error('NIM error', await nimRes.text())
    return new Response(JSON.stringify({ summary: 'No se pudo generar el resumen. Intenta de nuevo.' }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }

  const nimData = await nimRes.json()
  const summary = nimData.choices?.[0]?.message?.content?.trim() || 'No se pudo generar el resumen.'

  return new Response(JSON.stringify({ summary }), {
    status: 200,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
})
