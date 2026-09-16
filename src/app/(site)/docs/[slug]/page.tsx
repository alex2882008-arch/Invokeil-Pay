import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArticleView, DocsSidebar } from '@/components/site/article-renderer'
import { ARTICLES, getArticle } from '@/lib/site/docs-content'

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const article = getArticle(slug)
  if (!article) return { title: 'Not found — Invokeil Pay Docs' }
  return {
    title: `${article.title} — Invokeil Pay Docs`,
    description: article.intro,
    alternates: { canonical: `/docs/${article.slug}` },
  }
}

export default async function DocArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = getArticle(slug)
  if (!article) notFound()

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Mobile: back link + inline section nav */}
      <div className="mb-8 lg:hidden">
        <a href="/docs" className="text-sm font-medium text-primary hover:underline">← All documentation</a>
      </div>
      <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
        <div className="hidden lg:block">
          <DocsSidebar current={article.slug} />
        </div>
        <div className="lg:hidden">
          <nav aria-label="All documentation" className="flex flex-wrap gap-2">
            {ARTICLES.map((a) => (
              <a
                key={a.slug}
                href={`/docs/${a.slug}`}
                aria-current={a.slug === article.slug ? 'page' : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  a.slug === article.slug
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {a.title}
              </a>
            ))}
          </nav>
        </div>
        <ArticleView article={article} />
      </div>
    </div>
  )
}
