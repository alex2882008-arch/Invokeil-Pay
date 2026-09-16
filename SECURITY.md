# Security Policy

## Supported versions

Only the latest release line (v3.x) receives security fixes. Older versions
and the archived v1/v2 demo zips are unsupported — please upgrade.

## Reporting a vulnerability

**Do not open a public GitHub issue for security problems.**

Email **security@invokeil.com** with:

- A description of the issue and its impact
- Step-by-step reproduction (or a proof-of-concept)
- Affected version / commit hash
- Any logs or evidence (redacted)

You will receive an acknowledgement within **72 hours**. If you don't hear
back in that window, follow up on the same thread before using another
channel.

## 90-day disclosure policy

- We aim to triage within 3 business days and publish a fix within **90 days**
  of the initial report, depending on severity.
- After a fix ships (or 90 days elapse), we will publish a coordinated
  disclosure (advisory / changelog entry). You are welcome to publish your
  findings then — earlier coordinated disclosure is fine if agreed.
- Please give us a reasonable window before any public or exploit-first
  disclosure.

## Safe harbor

We consider good-faith security research to be authorized access under this
policy, provided you:

- Only test against instances you own or have explicit permission to test;
- Avoid actions that degrade service (no DoS, no bulk spam, no data
  exfiltration beyond a minimal proof);
- Stop and report immediately if you encounter real user data;
- Do not demand payment, extort users, or weaponize findings.

We will not pursue legal action for reports that follow this policy.

## Scope

In scope: this repository (web panel, API routes, SDKs, CLI, Android app) and
official distributions. Out of scope: third-party services and gateways
(bKash/Nagad/etc.), individual deployments' misconfiguration that is not a
code flaw, and volumetric/DoS attacks.

## Hardening notes for operators

- Change the seeded admin credentials immediately.
- Keep `appMode: SANDBOX` until providers are configured; sandbox simulates
  outbound calls.
- Use HTTPS (the bundled Caddyfile terminates TLS) and keep `db/*.db` out of
  any web-served path.
- Rotate store API keys (`sk_…`) and webhook secrets (`whsec_…`) periodically;
  every key rotation is audited in the activity log.
