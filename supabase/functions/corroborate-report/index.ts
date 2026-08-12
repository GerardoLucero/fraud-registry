import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
const SERVICE_KEY = SUPABASE_SECRET_KEYS['default'] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const NVIDIA_NIM_API_KEY = Deno.env.get('NVIDIA_NIM_API_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const ALERT_EMAIL = Deno.env.get('ALERT_EMAIL')
const FUNCTION_SECRET = Deno.env.get('FUNCTION_SECRET')

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

// Este endpoint solo lo llama el trigger de Postgres (via pg_net), nunca el navegador.
// Autenticacion propia por header compartido en vez de JWT de usuario -- por eso verify_jwt=false.
Deno.serve(async (req) => {
  if (!FUNCTION_SECRET || req.headers.get('x-webhook-secret') !== FUNCTION_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response('bad payload', { status: 400 })
  }

  const newRow = payload.record
  if (!newRow?.phone_number || !newRow?.id || !newRow?.description) {
    return new Response('bad payload', { status: 400 })
  }

  const { data: existing, error } = await supabaseAdmin
    .from('reports')
    .select('id, description')
    .eq('phone_number', newRow.phone_number)
    .eq('status', 'published')
    .neq('id', newRow.id)

  if (error) {
    console.error('db error fetching prior reports', error)
    return new Response('db error', { status: 500 })
  }

  if (!existing || existing.length === 0) {
    return new Response('ok: no prior reports to corroborate', { status: 200 })
  }

  if (!NVIDIA_NIM_API_KEY) {
    console.error('NVIDIA_NIM_API_KEY not set, skipping corroboration check')
    return new Response('ok: corroboration skipped, no API key configured', { status: 200 })
  }

  const priorDescriptions = existing
    .map((r: { description: string }, i: number) => `Reporte previo ${i + 1}: ${r.description}`)
    .join('\n')

  const prompt = `Eres un analista antifraude. Dos o mas personas reportaron el MISMO numero telefonico como fraude en un registro publico mexicano. Decide si las descripciones describen el MISMO patron de estafa (corroboran) o describen situaciones INCOMPATIBLES entre si (contradicen -- senal de posible abuso del sistema para danar a un tercero, no fraude real).

${priorDescriptions}

Reporte nuevo: ${newRow.description}

Responde UNICAMENTE con JSON valido, sin texto adicional: {"verdict": "corroborates" | "contradicts", "reason": "una frase breve"}`

  const nimResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NVIDIA_NIM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-ai/deepseek-v4-flash-0731',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    }),
  })

  if (!nimResponse.ok) {
    console.error('NIM error', await nimResponse.text())
    return new Response('ok: nim error, left as published', { status: 200 })
  }

  const nimData = await nimResponse.json()
  const raw = nimData.choices?.[0]?.message?.content ?? ''

  let verdict: { verdict: string; reason: string }
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    verdict = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
  } catch {
    console.error('unparseable NIM response', raw)
    return new Response('ok: unparseable, left as published', { status: 200 })
  }

  if (verdict.verdict !== 'contradicts') {
    return new Response('ok: corroborates', { status: 200 })
  }

  await supabaseAdmin.from('reports').update({ status: 'pending' }).eq('id', newRow.id)

  if (RESEND_API_KEY && ALERT_EMAIL) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Fraud Registry <onboarding@resend.dev>',
        to: [ALERT_EMAIL],
        subject: `Reportes contradictorios: ${newRow.phone_number}`,
        text: `El numero ${newRow.phone_number} tiene reportes que no coinciden.\n\nMotivo (DeepSeek): ${verdict.reason}\n\nRevisa en el Table Editor de Supabase, tabla "reports", status=pending, id=${newRow.id}.`,
      }),
    })
  } else {
    console.warn('RESEND_API_KEY or ALERT_EMAIL not set, skipping email alert. Row flagged pending regardless.')
  }

  return new Response('ok: flagged pending', { status: 200 })
})
