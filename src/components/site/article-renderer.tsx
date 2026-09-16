import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { CopyButton } from '@/components/site/copy-button'
import { DOC_SECTIONS, getAdjacent, type DocBlock, type DocArticle, ARTICLES } from '@/lib/site/docs-content'

/** Renders one typed content block (no HTML injection — plain React nodes). */
function Block({ block }: { block: DocBlock }) {
  switch (block.type) {
    case 'h2':
      return <h2 className="mt-10 scroll-mt-24 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{block.text}</h2>
    case 'p':
      return <p className="mt-4 leading-relaxed text-muted-foreground">{block.text}</p>
    case 'list':
      return block.ordered ? (
        <ol className="mt-4 list-decimal space-y-2 pl-5 leading-relaxed text-muted-foreground marker:text-foreground/70">
          {block.items.map((li, i) => <li key={i}>{li}</li>)}
        </ol>
      ) : (
        <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-muted-foreground marker:text-foreground/70">
          {block.items.map((li, i) => <li key={i}>{li}</li>)}
        </ul>
      )
    case 'table':
      return (
        <div className="mt-5 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {block.headers.map((h, i) => <th key={i} scope="col" className="px-4 py-2.5 font-semibold text-foreground">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  {row.map((cell, j) => <td key={j} className="px-4 py-2.5 align-top text-muted-foreground">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'note':
      return (
        <aside
          role="note"
          className={`mt-5 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
            block.tone === 'warn'
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
              : 'border-primary/25 bg-primary/5 text-foreground/90'
          }`}
        >
          {block.text}
        </aside>
      )
    case 'code':
      return (
        <div className="mt-5">
          <div className="flex items-center justify-between pb-2">
            {block.title
              ? <p className="font-mono text-xs text-muted-foreground">{block.title}</p>
              : <span />}
            <CopyButton text={block.code} />
          </div>
          <pre className="overflow-x-auto rounded-xl bg-muted p-4 font-mono text-xs leading-relaxed text-foreground" tabIndex={0} aria-label={`Code example${block.lang ? ` (${block.lang})` : ''}`}>
            <code>{block.code}</code>
          </pre>
        </div>
      )
    default:
      return null
  }
}

/** Sidebar used by both the docs index and article pages. */
export function DocsSidebar({ current }: { current?: string }) {
  return (
    <nav aria-label="Documentation" className="lg:sticky lg:top-24">
      {DOC_SECTIONS.map((section) => (
        <div key={section} className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section}</h2>
          <ul className="mt-2 space-y-0.5">
            {ARTICLES.filter((a) => a.section === section).map((a) => {
              const active = a.slug === current
              return (
                <li key={a.slug}>
                  <Link
                    href={`/docs/${a.slug}`}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-[36px] items-center rounded-lg px-3 py-1.5 text-sm transition-colors ${
                      active ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {a.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Full article view (header + blocks + prev/next). */
export function ArticleView({ article }: { article: DocArticle }) {
  const { prev, next } = getAdjacent(article.slug)
  return (
    <article className="min-w-0">
      <header className="anim-fade-up">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/docs" className="hover:text-foreground">Docs</Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span>{article.section}</span>
        </nav>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{article.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{article.intro}</p>
        <p className="mt-2 text-xs text-muted-foreground">Last updated {article.updated}</p>
      </header>

      <div className="anim-fade-up" style={{ animationDelay: '60ms' }}>
        {article.blocks.map((b, i) => <Block key={i} block={b} />)}
      </div>

      <nav aria-label="Article pagination" className="mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2">
        {prev ? (
          <Link href={`/docs/${prev.slug}`} className="press group rounded-xl border bg-card p-4 transition-colors hover:bg-muted">
            <p className="text-xs text-muted-foreground">← Previous</p>
            <p className="mt-1 text-sm font-semibold text-foreground group-hover:text-primary">{prev.title}</p>
          </Link>
        ) : <span aria-hidden="true" />}
        {next && (
          <Link href={`/docs/${next.slug}`} className="press group rounded-xl border bg-card p-4 text-right transition-colors hover:bg-muted sm:col-start-2">
            <p className="text-xs text-muted-foreground">Next →</p>
            <p className="mt-1 text-sm font-semibold text-foreground group-hover:text-primary">{next.title}</p>
          </Link>
        )}
      </nav>
    </article>
  )
}
