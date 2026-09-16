import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity, safeInt } from '@/lib/auth'
import { randomToken } from '@/lib/auth'

const TYPES = ['CUSTOMERS', 'INVOICES'] as const
const ERROR_LOG_CAP = 50

function str(v: unknown, max = 320): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** Minimal CSV splitter: comma-delimited, double-quote escaping, CRLF safe. */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

type ImportError = { row: number; reason: string }

/** GET /api/admin/imports — import history. */
export async function GET(req: Request) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'FINANCE', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)
    const take = Math.min(safeInt(url.searchParams.get('take'), 25, 1), 100)
    const rows = await db.importJob.findMany({ orderBy: { createdAt: 'desc' }, take })
    const total = await db.importJob.count()
    return Response.json({ ok: true, data: { items: rows, total } })
  } catch (e) {
    return jsonError(e)
  }
}

/**
 * POST /api/admin/imports — { type: CUSTOMERS|INVOICES, csv, fileName? }
 * Parses the CSV synchronously, creates rows, records an ImportJob with counts + errorLog.
 */
export async function POST(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'FINANCE', 'AGENT'])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const type = str(b.type, 20).toUpperCase()
    if (!(TYPES as readonly string[]).includes(type)) throw new HttpError(400, 'type must be CUSTOMERS or INVOICES')

    const csv = typeof b.csv === 'string' ? b.csv : ''
    if (!csv.trim()) throw new HttpError(400, 'csv content is required')

    // Split into lines (CRLF + LF), drop a potential UTF-8 BOM and trailing empties
    const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l, idx, arr) => l.trim() !== '' || idx < arr.length - 1)
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
    if (lines.length < 2) throw new HttpError(400, 'CSV needs a header row plus at least one data row')

    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'))
    const errors: ImportError[] = []

    if (type === 'CUSTOMERS') {
      const iName = header.indexOf('name')
      const iEmail = header.indexOf('email')
      const iPhone = header.indexOf('phone')
      if (iName === -1) throw new HttpError(400, 'CSV must start with a header row containing at least a "name" column (name,email,phone)')

      let processed = 0
      for (let idx = 1; idx < lines.length; idx++) {
        const cols = parseCsvLine(lines[idx])
        const name = (cols[iName] ?? '').trim()
        const email = iEmail >= 0 ? (cols[iEmail] ?? '').trim() : ''
        const phone = iPhone >= 0 ? (cols[iPhone] ?? '').trim() : ''
        if (!name && !email && !phone) continue // silently drop fully-empty lines
        if (!name) {
          errors.push({ row: idx + 1, reason: 'name is required' })
          continue
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push({ row: idx + 1, reason: `invalid email "${email}"` })
          continue
        }
        if (phone && !/^\+?[0-9\- ]{6,20}$/.test(phone)) {
          errors.push({ row: idx + 1, reason: `invalid phone "${phone}"` })
          continue
        }
        try {
          await db.customer.create({
            data: {
              name,
              email: email || null,
              phone: phone || null,
              insertedVia: 'MANUAL',
            },
          })
          processed++
        } catch {
          errors.push({ row: idx + 1, reason: 'database insert failed' })
        }
      }

      const job = await db.importJob.create({
        data: {
          type: 'CUSTOMERS',
          fileName: str(b.fileName, 200) || null,
          status: 'DONE',
          total: lines.length - 1,
          processed,
          failed: errors.length,
          errorLog: JSON.stringify(errors.slice(0, ERROR_LOG_CAP)),
          finishedAt: new Date(),
        },
      })
      await logActivity(me, 'import.customers', `importJob:${job.id}`, { processed, failed: errors.length })
      return Response.json({ ok: true, data: { id: job.id, type: job.type, total: job.total, processed, failed: errors.length, errors: errors.slice(0, ERROR_LOG_CAP) } }, { status: 201 })
    }

    // INVOICES
    const iTitle = header.indexOf('title')
    const iCName = header.indexOf('customer_name')
    const iCEmail = header.indexOf('customer_email')
    const iTotal = header.indexOf('total')
    const iDue = header.indexOf('due_date')
    if (iTitle === -1 || iTotal === -1) {
      throw new HttpError(400, 'CSV must start with a header row containing at least "title" and "total" (title,customer_name,customer_email,total,due_date)')
    }

    let processed = 0
    for (let idx = 1; idx < lines.length; idx++) {
      const cols = parseCsvLine(lines[idx])
      const title = (cols[iTitle] ?? '').trim()
      const customerName = iCName >= 0 ? (cols[iCName] ?? '').trim() : ''
      const customerEmail = iCEmail >= 0 ? (cols[iCEmail] ?? '').trim() : ''
      const totalRaw = (cols[iTotal] ?? '').trim()
      const dueRaw = iDue >= 0 ? (cols[iDue] ?? '').trim() : ''
      if (!title && !customerName && !totalRaw) continue
      if (!title) {
        errors.push({ row: idx + 1, reason: 'title is required' })
        continue
      }
      const total = Number(totalRaw)
      if (!Number.isFinite(total) || total <= 0) {
        errors.push({ row: idx + 1, reason: `invalid total "${totalRaw}"` })
        continue
      }
      if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        errors.push({ row: idx + 1, reason: `invalid customer_email "${customerEmail}"` })
        continue
      }
      let dueDate: Date | null = null
      if (dueRaw) {
        const d = new Date(dueRaw)
        if (Number.isNaN(d.getTime())) {
          errors.push({ row: idx + 1, reason: `invalid due_date "${dueRaw}" (use YYYY-MM-DD)` })
          continue
        }
        dueDate = d
      }
      try {
        // Link (or create) the customer by email so the invoice shows up under their name
        let customerId: string | null = null
        if (customerEmail) {
          const existing = await db.customer.findFirst({ where: { email: customerEmail }, select: { id: true } })
          if (existing) customerId = existing.id
          else {
            const created = await db.customer.create({
              data: { name: customerName || customerEmail, email: customerEmail, insertedVia: 'MANUAL' },
            })
            customerId = created.id
          }
        }
        // Allocate INV-000001 style number (collision-safe)
        const count = await db.invoice.count()
        let number: string | null = null
        for (let k = 0; k < 6; k++) {
          const candidate = `INV-${String(count + 1 + k).padStart(6, '0')}`
          const clash = await db.invoice.findUnique({ where: { number: candidate }, select: { id: true } })
          if (!clash) {
            number = candidate
            break
          }
        }
        if (!number) throw new Error('no unique number')
        await db.invoice.create({
          data: {
            number,
            token: randomToken(16),
            title,
            status: 'DRAFT',
            customerId,
            customerName: customerName || null,
            customerEmail: customerEmail || null,
            subtotal: total,
            total,
            dueDate,
          },
        })
        processed++
      } catch {
        errors.push({ row: idx + 1, reason: 'database insert failed' })
      }
    }

    const job = await db.importJob.create({
      data: {
        type: 'INVOICES',
        fileName: str(b.fileName, 200) || null,
        status: 'DONE',
        total: lines.length - 1,
        processed,
        failed: errors.length,
        errorLog: JSON.stringify(errors.slice(0, ERROR_LOG_CAP)),
        finishedAt: new Date(),
      },
    })
    await logActivity(me, 'import.invoices', `importJob:${job.id}`, { processed, failed: errors.length })
    return Response.json({ ok: true, data: { id: job.id, type: job.type, total: job.total, processed, failed: errors.length, errors: errors.slice(0, ERROR_LOG_CAP) } }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
