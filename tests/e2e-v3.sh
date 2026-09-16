#!/bin/bash
# ── Invokeil Pay v3 — New-modules E2E suite (runs alongside e2e-v2.sh) ───────
BASE="http://localhost:3000"
JAR="/tmp/ilp-cookies-v3.txt"
PASS=0; FAIL=0
say() { echo "· $1"; }
ok()  { PASS=$((PASS+1)); }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
has() { if echo "$1" | grep -q "$2"; then ok; else bad "$3 (missing: $2) got: $(echo "$1" | head -c 260)"; fi; }
eq()  { if [ "$1" = "$2" ]; then ok; else bad "$3 (expected $2, got $1)"; fi; }
code() { curl -s -b $JAR "$@" -o /dev/null -w "%{http_code}"; }
codeanon() { curl -s "$@" -o /dev/null -w "%{http_code}"; }

# ══ 1. AUTH ════════════════════════════════════════════════════════════════
say "AUTH"
R=$(curl -s -c $JAR -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@admin.com","password":"12345678"}')
has "$R" '"role"' "admin login"
eq "$(codeanon $BASE/api/admin/email/providers)" "401" "email providers unauth 401"
eq "$(codeanon $BASE/api/admin/risk/rules)" "401" "risk rules unauth 401"
eq "$(codeanon $BASE/api/admin/dev/console)" "401" "dev console unauth 401"
eq "$(codeanon $BASE/api/v1/device/notifications)" "401" "device notifications unauth 401"

# ══ 2. EMAIL SUITE ═════════════════════════════════════════════════════════
say "EMAIL"
R=$(curl -s -b $JAR $BASE/api/admin/email/providers)
has "$R" '"items"\|"providers"\|\[' "providers list"
R=$(curl -s -b $JAR $BASE/api/admin/email/identities)
has "$R" 'noreply@invokeil.com' "seeded identity"
R=$(curl -s -b $JAR "$BASE/api/admin/email/templates?q=payment_received&category=PAYMENT")
has "$R" '"key":"payment_received_f"' "template catalog"
has "$R" 'Dear' "template body rendered"
R=$(curl -s -b $JAR "$BASE/api/admin/email/templates?locale=bn&category=OTP")
has "$R" '_bn' "bengali templates"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/email/send -H 'Content-Type: application/json' -d '{"to":"e2e@example.com","subject":"E2E test","body":"Hello from e2e"}')
has "$R" '"ok":true' "sandbox send ok"
has "$R" 'simulated":true' "sandbox send simulated"
R=$(curl -s -b $JAR "$BASE/api/admin/email/messages")
has "$R" 'e2e@example.com' "message logged"
R=$(curl -s -b $JAR "$BASE/api/admin/email/analytics")
has "$R" '"sent"' "analytics"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/email/inbound -H 'Content-Type: application/json' -d '{"from":"customer@example.com","to":"support@invokeil.com","subject":"Need help","text":"Where is my order?"}')
has "$R" '"ok":true' "inbound received"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/email/providers -H 'Content-Type: application/json' -d '{"type":"RESEND","label":"E2E Resend","fromEmail":"noreply@invokeil.com","priority":10,"enabled":false,"config":{"apiKey":"re_test_abc123secret99"}}')
has "$R" '"ok":true' "provider create"
if echo "$R" | grep -q 're_test_abc123secret99'; then bad "provider config leaked plaintext"; else ok; fi
PID=$(echo "$R" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s -b $JAR $BASE/api/admin/email/providers)
has "$R" '••••' "config masked in list"
[ -n "$PID" ] && curl -s -b $JAR -X DELETE $BASE/api/admin/email/providers/$PID -o /dev/null && ok || bad "provider cleanup"

# ══ 3. SMS SUITE ═══════════════════════════════════════════════════════════
say "SMS GATEWAY"
R=$(curl -s -b $JAR $BASE/api/admin/sms-providers)
has "$R" 'providers\|items\|\[' "sms providers list"
R=$(curl -s -b $JAR "$BASE/api/admin/message-templates?channel=SMS")
has "$R" 'PAYMENT_SUCCESS' "brand message templates"
R=$(curl -s -b $JAR "$BASE/api/admin/message-templates?channel=SMS&locale=bn")
has "$R" 'টাকা' "bn message template"
MTID=$(curl -s -b $JAR "$BASE/api/admin/message-templates?channel=SMS&locale=en" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s -b $JAR -X POST $BASE/api/admin/message-templates/test -H 'Content-Type: application/json' -d "{\"id\":\"$MTID\",\"to\":\"01711111111\"}")
has "$R" '"ok":true' "brand sms test send (sandbox)"
R=$(curl -s -b $JAR $BASE/api/admin/notification-prefs)
has "$R" 'PAYMENT_SUCCESS' "notification prefs matrix"
R=$(curl -s -b $JAR -X PUT $BASE/api/admin/notification-prefs -H 'Content-Type: application/json' -d '{"audience":"MERCHANT","event":"PAYMENT_FAILED","email":true,"sms":true,"webhook":true,"inapp":true}')
has "$R" '"ok":true\|event' "prefs upsert"
R=$(curl -s -b $JAR "$BASE/api/admin/sms-messages")
has "$R" '0171' "sms logs"

# ══ 4. AUTOMATIONS ═════════════════════════════════════════════════════════
say "AUTOMATIONS"
R=$(curl -s -b $JAR $BASE/api/admin/automations)
has "$R" 'Payment Success Flow' "seeded workflow automations"
R=$(curl -s -b $JAR $BASE/api/admin/automations/templates)
has "$R" 'Subscription Renewal' "template gallery"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/automations -H 'Content-Type: application/json' -d '{"name":"E2E auto","trigger":"MANUAL","conditions":[],"actions":[{"type":"TAG_CUSTOMER","value":"e2e"}],"enabled":true}')
has "$R" '"ok":true\|"id"' "automation create"
AID=$(echo "$R" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s -b $JAR -X POST $BASE/api/admin/automations/$AID/run -H 'Content-Type: application/json' -d '{"customerName":"E2E Bot","amount":123}')
has "$R" '"fired":1' "manual run"
R=$(curl -s -b $JAR $BASE/api/admin/automations/runs)
has "$R" 'E2E auto\|MANUAL' "run history"
[ -n "$AID" ] && curl -s -b $JAR -X DELETE $BASE/api/admin/automations/$AID -o /dev/null && ok || bad "automation cleanup"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/automations/tick)
has "$R" 'resumed\|scheduled' "tick processed"

# ══ 5. MONEY OPS ═══════════════════════════════════════════════════════════
say "MONEY OPS"
R=$(curl -s -b $JAR $BASE/api/admin/refunds)
has "$R" 'PROCESSED' "seeded refund"
R=$(curl -s -b $JAR $BASE/api/admin/disputes)
has "$R" 'OPEN' "seeded dispute"
R=$(curl -s -b $JAR $BASE/api/admin/settlements)
has "$R" 'RECONCILED' "seeded settlement"
R=$(curl -s -b $JAR "$BASE/api/admin/accounting")
has "$R" 'revenue\|net\|gross' "accounting payload"
TX=$(curl -s -b $JAR "$BASE/api/admin/transactions?page=1" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$TX" ]; then
  R=$(curl -s -b $JAR -X POST $BASE/api/admin/refunds -H 'Content-Type: application/json' -d "{\"transactionId\":\"$TX\",\"type\":\"PARTIAL\",\"amount\":10,\"reason\":\"e2e partial\"}")
  has "$R" '"ok":true\|"id"' "refund create"
  RID=$(echo "$R" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  R=$(curl -s -b $JAR -X PATCH $BASE/api/admin/refunds/$RID -H 'Content-Type: application/json' -d '{"action":"reject","note":"e2e reject"}')
  has "$R" 'REJECTED\|"ok":true' "refund reject"
  curl -s -b $JAR -X DELETE $BASE/api/admin/refunds/$RID -o /dev/null && ok || bad "refund cleanup"
fi
eq "$(code $BASE/api/admin/settlements/$(curl -s -b $JAR $BASE/api/admin/settlements | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)/export)" "200" "settlement CSV"

# ══ 6. TRUST & SAFETY ══════════════════════════════════════════════════════
say "TRUST & SAFETY"
R=$(curl -s -b $JAR $BASE/api/admin/risk/rules)
has "$R" 'High velocity' "default risk rules"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/risk/evaluate -H 'Content-Type: application/json' -d '{"amount":999999,"phone":"01711234567"}')
has "$R" 'verdict\|action\|score' "risk evaluate"
R=$(curl -s -b $JAR $BASE/api/admin/risk/cases)
has "$R" 'status\|cases\|\[' "risk cases list"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/risk/lists -H 'Content-Type: application/json' -d '{"list":"BLOCK","type":"PHONE","value":"01900000000","reason":"e2e"}')
has "$R" '"ok":true\|"id"' "block list add"
LID=$(echo "$R" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$LID" ] && curl -s -b $JAR -X DELETE $BASE/api/admin/risk/lists/$LID -o /dev/null && ok || bad "list cleanup"
R=$(curl -s -b $JAR $BASE/api/admin/approvals)
has "$R" 'PENDING' "seeded approval"
R=$(curl -s -b $JAR $BASE/api/admin/kyc)
has "$R" 'Invokeil Digital Ltd' "seeded kyc"
R=$(curl -s -b $JAR $BASE/api/admin/security)
has "$R" 'securityScore\|passkeys\|ipAllowlist' "security v2 payload"

# ══ 7. OPERATIONS ══════════════════════════════════════════════════════════
say "OPERATIONS"
R=$(curl -s -b $JAR $BASE/api/admin/operations)
has "$R" 'emailProviders' "ops payload"
has "$R" 'backlog' "ops backlog"
R=$(curl -s -b $JAR $BASE/api/admin/incidents)
has "$R" 'webhook delivery latency' "seeded incident"
R=$(curl -s -b $JAR $BASE/api/admin/status-components)
has "$R" 'API & Checkout' "status components"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/imports -H 'Content-Type: application/json' -d '{"type":"CUSTOMERS","csv":"name,email,phone\nE2E Import,e2e.import@test.com,01700900900"}')
has "$R" '"processed":1\|processed' "csv import"
R=$(curl -s -b $JAR $BASE/api/admin/marketplace)
has "$R" 'woocommerce' "marketplace catalog"
R=$(curl -s -b $JAR -X PATCH $BASE/api/admin/marketplace -H 'Content-Type: application/json' -d '{"key":"discord","enabled":true,"config":{"webhookUrl":"https://discord.com/api/webhooks/x"}}')
has "$R" '"ok":true\|discord' "marketplace enable"
R=$(curl -s -b $JAR -X PATCH $BASE/api/admin/marketplace -H 'Content-Type: application/json' -d '{"key":"discord","enabled":false}')
has "$R" '"ok":true\|discord' "marketplace disable"
R=$(curl -s -b $JAR $BASE/api/admin/brands)
has "$R" 'Invokeil Digital' "brands list"
R=$(curl -s -b $JAR $BASE/api/admin/flags)
has "$R" 'passkeys' "feature flags"
R=$(curl -s -b $JAR "$BASE/api/admin/customers?page=1&q=e2e.import")
has "$R" 'E2E Import' "imported customer queryable"

# ══ 8. CUSTOMER 360 + SUBSCRIPTIONS ════════════════════════════════════════
say "CUSTOMER 360 + SUBSCRIPTIONS"
CID=$(curl -s -b $JAR "$BASE/api/admin/customers?page=1" | grep -o '"id":"[^"]*"' | tail -1 | cut -d'"' -f4)
R=$(curl -s -b $JAR $BASE/api/admin/customers/$CID/timeline)
has "$R" '"items"' "customer timeline"
if [ $(echo "$R" | grep -o '"type"' | wc -l) -gt 0 ]; then ok; else bad "timeline has events"; fi
R=$(curl -s -b $JAR -X POST $BASE/api/admin/customers/$CID/notes -H 'Content-Type: application/json' -d '{"note":"e2e note"}')
has "$R" '"ok":true' "note append"
R=$(curl -s -b $JAR $BASE/api/admin/customers/$CID/portal-link)
has "$R" '"token"' "portal link"
R=$(curl -s -b $JAR $BASE/api/admin/subscriptions)
has "$R" 'Starter' "seeded subscriptions"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/subscriptions/tick)
has "$R'" 'ok\|created\|billed' "billing tick"

# ══ 9. DEVELOPER CONSOLE + SANDBOX ═════════════════════════════════════════
say "DEV CONSOLE + SANDBOX"
R=$(curl -s -b $JAR $BASE/api/admin/dev/console)
has "$R" 'stores' "console overview"
R=$(curl -s -b $JAR $BASE/api/admin/dev/snippets)
has "$R" 'curl' "snippets"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/dev/scenarios -H 'Content-Type: application/json' -d '{"scenario":"success","amount":777}')
has "$R" 'checkout.created' "sandbox success scenario"
has "$R" 'SBX' "sandbox trx id"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/dev/scenarios -H 'Content-Type: application/json' -d '{"scenario":"chargeback"}')
has "$R" 'dispute.opened' "sandbox chargeback scenario"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/dev/explorer -H 'Content-Type: application/json' -d '{"method":"GET","path":"/api/admin/stats"}')
has "$R" '"ok":true\|today' "api explorer proxy"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/dev/explorer -H 'Content-Type: application/json' -d '{"method":"GET","path":"https://evil.com"}')
has "$R" 'error\|400' "explorer blocks external"
R=$(curl -s -b $JAR $BASE/api/admin/dev/requests)
has "$R" 'items\|requests\|\[' "request inspector"

# ══ 10. PUBLIC SITE + PORTAL + VERIFY ══════════════════════════════════════
say "PUBLIC"
for p in / /docs /docs/webhooks /docs/api-reference /pricing /changelog /status /contact /legal/terms /legal/privacy /legal/aml-kyc /legal/grievance /legal/license; do
  eq "$(codeanon $BASE$p)" "200" "public page $p"
done
R=$(curl -s $BASE/api/public/status)
has "$R" 'API & Checkout' "public status API"
eq "$(codeanon $BASE/api/portal/badtoken123)" "404" "portal bad token 404"
eq "$(codeanon $BASE/api/verify/badref123)" "404" "verify bad ref 404"
TOKEN=$(curl -s -b $JAR $BASE/api/admin/customers/$CID/portal-link | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
eq "$(codeanon $BASE/api/portal/$TOKEN)" "200" "portal good token 200"
eq "$(codeanon $BASE/portal/$TOKEN)" "200" "portal page 200"
VTX=$(curl -s -b $JAR "$BASE/api/admin/transactions?page=1" | grep -o '"trxId":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$VTX" ]; then
  eq "$(codeanon $BASE/api/verify/$VTX)" "200" "verify good trx 200"
  eq "$(codeanon $BASE/verify/$VTX)" "200" "verify page 200"
fi

# ══ 11. ADMIN PAGES SSR ════════════════════════════════════════════════════
say "ADMIN SSR PAGES"
for p in /admin/email /admin/sms-gateway /admin/notifications /admin/automations /admin/refunds /admin/settlements /admin/accounting /admin/risk /admin/approvals /admin/kyc /admin/security-center /admin/operations /admin/incidents /admin/imports /admin/marketplace /admin/brands /admin/subscriptions /admin/developers /admin/customers; do
  eq "$(code $BASE$p)" "200" "SSR $p"
done
eq "$(code $BASE/admin/customers/$CID)" "200" "SSR customer 360"

# ══ 12. IDEMPOTENCY / EVENT LEDGER ═════════════════════════════════════════
say "EVENT LEDGER"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/dev/scenarios -H 'Content-Type: application/json' -d '{"scenario":"success","amount":555}')
R2=$(curl -s -b $JAR "$BASE/api/admin/dev/requests")
has "$R2" 'ledger\|requests\|\[' "ledger queryable"

echo "════════════════════════════════"
echo "V3 E2E RESULTS: PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ] && echo "ALL GREEN" || echo "FIX NEEDED"
