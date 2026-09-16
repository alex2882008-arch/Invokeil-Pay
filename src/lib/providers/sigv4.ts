/**
 * Minimal AWS Signature V4 for SES (SendEmail) and SNS (Publish).
 * Node/Bun compatible — no AWS SDK dependency (keeps the bundle tiny for low-end self-hosting).
 */
import crypto from 'crypto'

export interface SigV4Opts {
  service: string // 'email' | 'sns'
  region: string
  accessKey: string
  secretKey: string
  method?: string
  host: string // email.us-east-1.amazonaws.com
  path?: string // '/' for SES, '/{topic}' optional for SNS
  body: string // url-encoded form body
  contentType?: string
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest()
}

function sha256hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex')
}

export async function sigv4Request(opts: SigV4Opts): Promise<{ ok: boolean; status: number; body: string }> {
  const method = opts.method ?? 'POST'
  const path = opts.path ?? '/'
  const contentType = opts.contentType ?? 'application/x-www-form-urlencoded; charset=utf-8'
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '') // YYYYMMDDThhmmssZ
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256hex(opts.body)
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${opts.host}\n` +
    `x-amz-date:${amzDate}\n`
  const signedHeaders = 'content-type;host;x-amz-date'
  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n')
  const kDate = hmac(`AWS4${opts.secretKey}`, dateStamp)
  const kRegion = hmac(kDate, opts.region)
  const kService = hmac(kRegion, opts.service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${opts.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(`https://${opts.host}${path}`, {
    method,
    headers: {
      'Content-Type': contentType,
      'X-Amz-Date': amzDate,
      Authorization: authorization,
    },
    body: method === 'POST' ? opts.body : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.text()
  return { ok: res.ok, status: res.status, body }
}

/** SES SendEmail. Returns messageId or throws with reason. */
export async function sesSend(params: {
  region: string
  accessKey: string
  secretKey: string
  from: string
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
}): Promise<string> {
  const enc = new URLSearchParams()
  enc.set('Action', 'SendEmail')
  enc.set('Source', params.from)
  enc.set('Destination.ToAddresses.member.1', params.to)
  enc.set('ReplyToAddresses.member.1', params.replyTo || params.from)
  enc.set('Message.Subject.Data', params.subject)
  enc.set('Message.Subject.Charset', 'UTF-8')
  enc.set('Message.Body.Html.Data', params.html)
  enc.set('Message.Body.Html.Charset', 'UTF-8')
  enc.set('Message.Body.Text.Data', params.text ?? '')
  enc.set('Message.Body.Text.Charset', 'UTF-8')
  const res = await sigv4Request({
    service: 'email',
    region: params.region || 'us-east-1',
    accessKey: params.accessKey,
    secretKey: params.secretKey,
    host: `email.${params.region || 'us-east-1'}.amazonaws.com`,
    body: enc.toString(),
  })
  if (!res.ok) throw new Error(`SES ${res.status}: ${res.body.slice(0, 300)}`)
  const m = res.body.match(/<MessageId>([^<]+)<\/MessageId>/)
  return m ? m[1] : 'ses-unknown'
}

/** SNS Publish (direct SMS to phone number). */
export async function snsSendSms(params: {
  region: string
  accessKey: string
  secretKey: string
  to: string
  message: string
  senderId?: string
}): Promise<string> {
  const enc = new URLSearchParams()
  enc.set('Action', 'Publish')
  enc.set('PhoneNumber', params.to)
  enc.set('Message', params.message)
  if (params.senderId) {
    enc.set('MessageAttributes.entry.1.Name', 'AWS.SNS.SMS.SenderID')
    enc.set('MessageAttributes.entry.1.Value.DataType', 'String')
    enc.set('MessageAttributes.entry.1.Value.StringValue', params.senderId)
  }
  const res = await sigv4Request({
    service: 'sns',
    region: params.region || 'us-east-1',
    accessKey: params.accessKey,
    secretKey: params.secretKey,
    host: `sns.${params.region || 'us-east-1'}.amazonaws.com`,
    body: enc.toString(),
  })
  if (!res.ok) throw new Error(`SNS ${res.status}: ${res.body.slice(0, 300)}`)
  const m = res.body.match(/<MessageId>([^<]+)<\/MessageId>/)
  return m ? m[1] : 'sns-unknown'
}
