# Contributing to Invokeil Pay

Thanks for helping improve Invokeil Pay! Please keep these rules in mind.

## Ground rules

1. **License** — the project is under the Invokeil Pay Community License 1.0
   (`LICENSE`). By contributing you agree your work is distributed under the
   same license.
2. **No secrets, ever** — never commit API keys (`sk_…`), device keys
   (`ilp_…`), webhook secrets (`whsec_…`), passwords, real customer data, or
   production database files (`db/*.db`). Use `.env` (git-ignored) for local
   configuration.
3. **Keep the demo data clean** — don't commit database state; the seed script
   (`src/lib/seed.ts`) is the source of truth for demo content.

## Conventional commits

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(checkouts): add bulk export
fix(webhooks): sign replayed deliveries with fresh timestamps
docs(readme): update quickstart for bun
chore(deps): bump okhttp to 4.12.0
refactor(risk): extract velocity rule evaluation
```

Scope hints: `checkouts`, `invoices`, `links`, `transactions`, `gateways`,
`devices`, `webhooks`, `email`, `sms`, `risk`, `refunds`, `settlements`,
`subscriptions`, `devconsole`, `android`, `sdk`, `cli`, `docs`, `ci`.

## PR checklist

Before you hit "Create pull request":

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `bunx eslint src --quiet` is clean for the files you touched
- [ ] New UI strings exist in **both** English and Bengali
      (`src/lib/i18n/*.ts` for panel views, `values-bn/strings.xml` for Android)
- [ ] Android changes pass `python3 scripts/check-android.py`
      (XML parse, Kotlin braces, resource references, EN/BN parity)
- [ ] No secrets or personal data in commits, logs, or screenshots
- [ ] Every mutation shows a toast / error state; every list has an empty state
- [ ] `README.md` / module docs are updated on significant changes — per
      release convention, the readme/description must be updated whenever a
      release adds, changes, or removes user-visible functionality
- [ ] Commits follow Conventional Commits

## Development notes

- **Stack**: Next.js 16 (App Router) + TypeScript strict + Tailwind 4 +
  shadcn/ui + Prisma/SQLite. Bun is the reference runtime.
- **APIs**: use route handlers under `src/app/api/**` (no server actions);
  follow the auth patterns in `src/lib/auth.ts` (`requireRole`, device-key
  guard for `/api/v1/device/*`, store API keys for `/api/v1/*`).
- **Views**: `src/components/panel/<module>-view.tsx` + semantic tokens only
  (dark-mode safe); see `agent-ctx/v3-conventions.md` for the full style guide.
- **Android**: `android/` mirrors the website UX; keep `minSdk 29`, viewBinding
  architecture, and the EN/BN string parity.
- **SDKs/CLI**: all under `sdks/` and `cli/`, self-contained with zero
  third-party dependencies (PHP/Go/JS/CLI) or their declared single dependency
  (Python `requests`, Flutter `http`, .NET runtime libs). Include a README.

## Reporting bugs

Open a GitHub issue with: what you did, what you expected, what happened, and
your setup (deployment mode, appMode SANDBOX/PRODUCTION, relevant logs).
Redact anything sensitive. Security vulnerabilities are NOT reported via
issues — see `SECURITY.md`.
