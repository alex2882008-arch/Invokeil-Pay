/** Echo endpoint for testing webhooks locally — always replies 200 with the received body. */
export async function POST(req: Request) {
  const body = await req.text().catch(() => '')
  return Response.json({
    ok: true,
    echo: true,
    receivedEvent: req.headers.get('x-invokeil-event'),
    signaturePresent: !!req.headers.get('x-invokeil-signature'),
    bodyLength: body.length,
  })
}

export async function GET() {
  return Response.json({ ok: true, hint: 'POST here to verify webhook delivery works end-to-end' })
}
