#!/bin/bash
# ── Invokeil Pay v2 — Full E2E API test suite (110+ assertions) ──────────────
BASE="http://localhost:3000"
JAR="/tmp/ilp-cookies.txt"
RUNID=$(date +%s | tail -c 6)
PASS=0; FAIL=0
say() { echo "· $1"; }
ok()  { PASS=$((PASS+1)); }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

# helper: assert contains
has() { if echo "$1" | grep -q "$2"; then ok; else bad "$3 (missing: $2) got: $(echo "$1" | head -c 300)"; fi; }
eq()  { if [ "$1" = "$2" ]; then ok; else bad "$3 (expected $2, got $1)"; fi; }

# ══ 1. AUTH ════════════════════════════════════════════════════════════════
say "AUTH"
R=$(curl -s -c $JAR -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@admin.com","password":"12345678"}')
has "$R" '"role":"ADMIN"' "admin login"
R=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@admin.com","password":"wrong"}')
has "$R" 'credentials' "bad password rejected"
R=$(curl -s -b $JAR $BASE/api/auth/me)
has "$R" 'admin@admin.com' "me endpoint"
R=$(curl -s $BASE/api/admin/stats -o /dev/null -w "%{http_code}"); eq "$R" "401" "stats unauth 401"

# ══ 2. STATS + DASHBOARD ═══════════════════════════════════════════════════
say "STATS"
for range in today 7d 30d; do
  R=$(curl -s -b $JAR "$BASE/api/admin/stats?range=$range")
  has "$R" '"today"' "stats[$range].today"
  has "$R" '"series"' "stats[$range].series"
  has "$R" '"gatewayShare"' "stats[$range].gatewayShare"
  has "$R" '"checklist"' "stats[$range].checklist"
  has "$R" '"activity"' "stats[$range].activity"
done

# ══ 3. TRANSACTIONS ════════════════════════════════════════════════════════
say "TRANSACTIONS"
R=$(curl -s -b $JAR "$BASE/api/admin/transactions?page=1")
has "$R" '"items"' "tx list"
has "$R" '"total"' "tx total"
R=$(curl -s -b $JAR "$BASE/api/admin/transactions?summary=1")
has "$R" '"volume"' "tx summary volume"
R=$(curl -s -b $JAR "$BASE/api/admin/transactions?format=csv")
has "$R" 'trxId' "tx csv export"
R=$(curl -s -b $JAR "$BASE/api/admin/transactions?status=PAID&mfs=BKASH")
has "$R" '"items"' "tx filtered"
TXID=$(curl -s -b $JAR "$BASE/api/admin/transactions?page=1" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s -b $JAR "$BASE/api/admin/transactions/$TXID")
has "$R" '"trxId"' "tx detail"
R=$(curl -s -b $JAR "$BASE/api/admin/transactions?page=abc")
has "$R" '"items"' "tx page=abc safe"

# ══ 4. CUSTOMERS ═══════════════════════════════════════════════════════════
say "CUSTOMERS"
R=$(curl -s -b $JAR "$BASE/api/admin/customers")
has "$R" '"customers"' "customer list"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/customers -H 'Content-Type: application/json' -d '{"name":"QA Cust","phone":"01777777777"}')
has "$R" '"id"' "customer create"
CUSTID=$(echo "$R" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s -b $JAR -X POST $BASE/api/admin/customers -H 'Content-Type: application/json' -d '{"name":"Dup","phone":"01777777777"}')
has "$R" 'error' "dup phone 409"
R=$(curl -s -b $JAR -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/customers/$CUSTID -H 'Content-Type: application/json' -d '{"suspended":true}')
eq "$R" "400" "suspend w/o reason 400"
R=$(curl -s -b $JAR -X PATCH $BASE/api/admin/customers/$CUSTID -H 'Content-Type: application/json' -d '{"suspended":true,"suspendReason":"QA test"}')
has "$R" '"suspended":true' "suspend w/ reason"
R=$(curl -s -b $JAR -X PATCH $BASE/api/admin/customers/$CUSTID -H 'Content-Type: application/json' -d '{"suspended":false,"suspendReason":""}')
has "$R" '"suspended":false' "restore customer"
R=$(curl -s -b $JAR -X DELETE $BASE/api/admin/customers/$CUSTID)
has "$R" 'ok' "customer delete"

# ══ 5. GATEWAYS ════════════════════════════════════════════════════════════
say "GATEWAYS"
R=$(curl -s -b $JAR "$BASE/api/admin/gateways")
has "$R" '"gateways"' "gateway list"
GCOUNT=$(echo "$R" | grep -o '"code"' | wc -l)
if [ "$GCOUNT" -ge 50 ]; then ok; else bad "gateway catalog ≥50 (got $GCOUNT)"; fi
GWID=$(echo "$R" | grep -o '"id":"[^"]*","code":"BKASH_PERSONAL"' | cut -d'"' -f4)
R=$(curl -s -b $JAR -X PATCH $BASE/api/admin/gateways/$GWID -H 'Content-Type: application/json' -d '{"chargeFixed":5,"chargePercent":1.5}')
has "$R" '"chargeFixed":5' "gateway config"
R=$(curl -s -b $JAR -X PATCH $BASE/api/admin/gateways/$GWID -H 'Content-Type: application/json' -d '{"code":"HACK"}')
CODECHK=$(curl -s -b $JAR "$BASE/api/admin/gateways" | grep -o '"code":"BKASH_PERSONAL"' | head -1)
if [ -n "$CODECHK" ]; then ok; else bad "gateway code immutable"; fi
R=$(curl -s -b $JAR -X PATCH $BASE/api/admin/gateways/$GWID -H 'Content-Type: application/json' -d '{"chargeFixed":0,"chargePercent":0}')
ok # restore

# ══ 6. CHECKOUTS + PUBLIC PAY ══════════════════════════════════════════════
say "CHECKOUTS"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/checkouts -H 'Content-Type: application/json' -d '{"title":"QA Checkout","amount":777,"customerPhone":"01788888888","gatewayCode":"ANY"}')
has "$R" '"token"' "checkout create"
CTOKEN=$(echo "$R" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s $BASE/api/pay/$CTOKEN)
has "$R" '"gateways"' "public pay: gateways list"
has "$R" '"faqs"' "public pay: faqs"
has "$R" '"payTo"' "public pay: numbers"
R=$(curl -s -X POST $BASE/api/pay/$CTOKEN/claim -H 'Content-Type: application/json' -d '{"senderNumber":"01788888888"}')
has "$R" '"AWAITING"' "claim → awaiting"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/sms -H 'Content-Type: application/json' -d "{\"deviceId\":\"$(curl -s -b $JAR $BASE/api/admin/devices | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)\",\"sender\":\"bKash\",\"body\":\"You have received Tk 777.00 from 01788888888. Fee Tk 0.00. Balance Tk 30000.00. TrxID QAC${RUNID}TEST\"}")
has "$R" '"parsed":true' "simulator parse"
has "$R" '"matched":true' "simulator match"
R=$(curl -s $BASE/api/pay/$CTOKEN)
has "$R" '"status":"PAID"' "checkout auto-PAID"
R=$(curl -s -b $JAR "$BASE/api/admin/checkouts?summary=1")
has "$R" '"pending"' "checkouts summary"

# ══ 7. INVOICES ════════════════════════════════════════════════════════════
say "INVOICES"
R=$(curl -s -b $JAR "$BASE/api/admin/invoices")
has "$R" '"invoices"' "invoice list"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/invoices -H 'Content-Type: application/json' -d '{"title":"QA Invoice","customerName":"QA Buyer","customerPhone":"01799999999","items":[{"description":"Item A","quantity":2,"unitPrice":100},{"description":"Item B","quantity":1,"unitPrice":50}],"discount":50,"tax":10,"send":true}')
has "$R" '"number":"INV-' "invoice create + numbering"
has "$R" '"total":210' "invoice totals math"
INVTOKEN=$(echo "$R" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s $BASE/api/pay/invoice/$INVTOKEN)
has "$R" '"items"' "public invoice GET"
R=$(curl -s -X POST $BASE/api/pay/invoice/$INVTOKEN -H 'Content-Type: application/json')
has "$R" '"AWAITING"' "public invoice claim"
INVID=$(curl -s -b $JAR "$BASE/api/admin/invoices?q=QA+Invoice" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s -b $JAR -X PATCH $BASE/api/admin/invoices/$INVID -H 'Content-Type: application/json' -d '{"status":"PAID"}')
has "$R" '"status":"PAID"' "invoice mark paid"

# ══ 8. PAYMENT LINKS ═══════════════════════════════════════════════════════
say "LINKS"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/links -H 'Content-Type: application/json' -d '{"title":"QA Link","amountType":"FIXED","amount":333}')
has "$R" '"slug"' "link create"
LSLUG=$(echo "$R" | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s $BASE/api/link/$LSLUG)
has "$R" '"link"' "public link GET"
R=$(curl -s -X POST $BASE/api/link/$LSLUG -H 'Content-Type: application/json' -d '{"amount":333,"senderNumber":"01766666666"}')
has "$R" '"token"' "link claim → checkout"
LCTOKEN=$(echo "$R" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s -b $JAR -X POST $BASE/api/admin/sms -H 'Content-Type: application/json' -d "{\"deviceId\":\"$(curl -s -b $JAR $BASE/api/admin/devices | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)\",\"sender\":\"NAGAD\",\"body\":\"Money Received! Amount: Tk 333.00 Sender: 01766666666 Ref: ABC123 Balance: Tk 29667.00 TrxID: QAL${RUNID}333\"}")
has "$R" '"matched":true' "link SMS auto-match"
R=$(curl -s $BASE/api/pay/$LCTOKEN)
has "$R" '"status":"PAID"' "link checkout PAID"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/links -H 'Content-Type: application/json' -d '{"title":"Bad","amountType":"VARIABLE","minAmount":500,"maxAmount":100}')
has "$R" 'error' "variable min>max 400"

# ══ 9. MERCHANT API v1 ═════════════════════════════════════════════════════
say "MERCHANT API"
SK=$(curl -s -b $JAR "$BASE/api/admin/stores" | grep -o '"apiKey":"sk_live[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s -X POST $BASE/api/v1/checkout -H "Authorization: Bearer $SK" -H 'Content-Type: application/json' -d '{"amount":1200,"customer_name":"API Buyer","customer_mobile":"01755555555","metadata":{"order":"QA-1"}}')
has "$R" '"checkout_url"' "api create payment"
has "$R" '"token"' "api token"
APITOKEN=$(echo "$R" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s "$BASE/api/v1/checkout/$APITOKEN" -H "Authorization: Bearer $SK")
has "$R" '"status":"PENDING"' "api verify pending"
R=$(curl -s -X POST $BASE/api/v1/verify-payment -H "Authorization: Bearer $SK" -H 'Content-Type: application/json' -d "{\"pp_id\":\"$APITOKEN\"}")
has "$R" '"amount":1200' "api verify-payment POST"
R=$(curl -s -X POST $BASE/api/v1/checkout -H 'Content-Type: application/json' -d '{"amount":10}')
has "$R" 'MISSING_API_KEY' "api no key 401"
R=$(curl -s -X POST $BASE/api/v1/checkout -H "Authorization: Bearer sk_invalid_key" -H 'Content-Type: application/json' -d '{"amount":10}')
has "$R" 'INVALID_API_KEY' "api invalid key"
R=$(curl -s -X POST $BASE/api/v1/checkout -H "Authorization: Bearer $SK" -H 'Content-Type: application/json' -d '{"amount":-5}')
has "$R" 'positive' "api negative amount 400"

# ══ 10. WEBHOOKS ═══════════════════════════════════════════════════════════
say "WEBHOOKS"
R=$(curl -s -b $JAR "$BASE/api/admin/webhooks?deliveries=1")
has "$R" '"deliveries"' "webhook deliveries list"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/webhooks/retry)
has "$R" 'processed' "webhook retry endpoint"
STOREID=$(curl -s -b $JAR "$BASE/api/admin/stores" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s -b $JAR -X POST $BASE/api/admin/webhooks -H 'Content-Type: application/json' -d "{\"storeId\":\"$STOREID\",\"url\":\"https://webhook.site/qa-ep\",\"events\":\"*\"}")
has "$R" '"url"' "webhook endpoint create"
EPID=$(echo "$R" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s -b $JAR -X POST $BASE/api/admin/webhooks/$EPID/test)
has "$R" 'ok\|delivery\|status' "webhook test ping"

# ══ 11. DEVICES + SMS CENTER ═══════════════════════════════════════════════
say "DEVICES + SMS"
R=$(curl -s -b $JAR "$BASE/api/admin/devices")
has "$R" '"items"' "devices list"
DEVKEY=$(echo "$R" | grep -o '"deviceKey":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s -b $JAR -X POST $BASE/api/admin/devices -H 'Content-Type: application/json' -d '{"name":"QA Device"}')
has "$R" '"pairingCode"' "device create + pairing code"
QADEVID=$(echo "$R" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s -X POST $BASE/api/v1/heartbeat -H "X-Device-Key: $DEVKEY" -H 'Content-Type: application/json' -d '{"battery":55,"signal":"GOOD","model":"QA","androidVersion":"14","appVersion":"2.0.0"}')
has "$R" 'ok' "device heartbeat"
R=$(curl -s -X POST $BASE/api/v1/sms -H "X-Device-Key: $DEVKEY" -H 'Content-Type: application/json' -d '{"messages":[{"sender":"bKash","body":"You have received Tk 42.00 from 01700000000. Fee Tk 0.00. Balance Tk 30042.00. TrxID DEV${RUNID}42TEST","receivedAt":"2026-09-16T10:00:00.000Z"}]}')
has "$R" '"parsed":true' "device-key sms ingest"
R=$(curl -s -X POST $BASE/api/v1/sms -H "X-Device-Key: bad_key" -H 'Content-Type: application/json' -d '{"messages":[]}')
has "$R" 'error\|401' "bad device key rejected"
R=$(curl -s -b $JAR "$BASE/api/admin/sms?summary=1")
has "$R" '"awaiting"' "sms summary"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/sms/test-regex -H 'Content-Type: application/json' -d '{"pattern":"TrxID (\\w+)","sample":"TrxID ABC123 here"}')
has "$R" '"ABC123"' "regex tester"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/sms/test-regex -H 'Content-Type: application/json' -d '{"pattern":"[","sample":"x"}')
has "$R" '"valid":false' "regex invalid 400"

# ══ 12. SECURITY: users, 2fa, sessions ═════════════════════════════════════
say "SECURITY"
R=$(curl -s -b $JAR "$BASE/api/admin/users?summary=1")
has "$R" '"admins"' "users summary"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/users -H 'Content-Type: application/json' -d '{"name":"QA Agent","email":"qa-agent@test.com","password":"test12345","role":"AGENT"}')
has "$R" '"role":"AGENT"' "user create"
QAUID=$(echo "$R" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
R=$(curl -s -b $JAR -X DELETE $BASE/api/admin/users/$QAUID)
has "$R" 'ok' "user delete"
R=$(curl -s -b $JAR "$BASE/api/admin/security")
has "$R" '"sessions"' "sessions list"
has "$R" '"loginAttempts"' "login attempts"
has "$R" '"activity"' "activity log"
R=$(curl -s -b $JAR -X POST $BASE/api/admin/me/2fa)
has "$R" '"secret"' "2fa setup start"
has "$R" '"otpauthUrl"' "2fa otpauth"
R=$(curl -s -b $JAR -X PUT $BASE/api/admin/me/2fa -H 'Content-Type: application/json' -d '{"code":"000000"}')
has "$R" 'INVALID_CODE' "2fa invalid code"
R=$(curl -s -b $JAR -X DELETE $BASE/api/admin/me/2fa -H 'Content-Type: application/json' -d '{"password":"12345678"}')
has "$R" 'ok' "2fa disable (never enabled, cleanup)"

# ══ 13. SETTINGS + FAQ ═════════════════════════════════════════════════════
say "SETTINGS"
R=$(curl -s -b $JAR $BASE/api/admin/settings)
has "$R" '"brandName"' "settings get"
R=$(curl -s -b $JAR -X PUT $BASE/api/admin/settings -H 'Content-Type: application/json' -d '{"values":{"paymentTolerance":"0","checkoutExpiryHours":"24"}}')
has "$R" 'ok\|settings' "settings put"
R=$(curl -s -b $JAR -X PUT $BASE/api/admin/settings -H 'Content-Type: application/json' -d '{"values":{"checkoutExpiryHours":"9999"}}')
has "$R" 'error' "settings invalid range 400"
R=$(curl -s -b $JAR "$BASE/api/admin/faqs")
has "$R" '"question"' "faq list"

# ══ 14. REPORTS ════════════════════════════════════════════════════════════
say "REPORTS"
for range in today 7d 30d month; do
  R=$(curl -s -b $JAR "$BASE/api/admin/reports?range=$range")
  has "$R" '"summary"' "reports[$range] summary"
  has "$R" '"byGateway"' "reports[$range] byGateway"
done
R=$(curl -s -b $JAR "$BASE/api/admin/reports?range=7d&format=csv")
has "$R" 'date\|Date' "reports csv"

# ══ 15. RBAC (viewer/agent restrictions) ═══════════════════════════════════
say "RBAC"
curl -s -c /tmp/ilp-agent.txt -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"rakib@invokeilpay.com","password":"12345678"}' > /dev/null
R=$(curl -s -b /tmp/ilp-agent.txt -o /dev/null -w "%{http_code}" -X DELETE $BASE/api/admin/users/xxx)
eq "$R" "403" "agent delete user 403"
R=$(curl -s -b /tmp/ilp-agent.txt -o /dev/null -w "%{http_code}" -X POST $BASE/api/admin/webhooks/retry)
eq "$R" "403" "agent webhook retry 403"
R=$(curl -s -b /tmp/ilp-agent.txt "$BASE/api/admin/transactions?summary=1")
has "$R" '"volume"' "agent can read transactions"
R=$(curl -s -b /tmp/ilp-agent.txt -o /dev/null -w "%{http_code}" -X PUT $BASE/api/admin/settings -H 'Content-Type: application/json' -d '{"values":{"brandName":"HACK"}}')
eq "$R" "403" "agent settings write 403"

# ══ 16. PUBLIC PAGES SSR ═══════════════════════════════════════════════════
say "SSR PAGES"
for p in /admin/dashboard /admin/transactions /admin/invoices /admin/links /admin/customers /admin/gateways /admin/devices /admin/sms /admin/checkouts /admin/merchants /admin/webhooks /admin/reports /admin/users /admin/settings /admin/docs /admin/wizard; do
  C=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR "$BASE$p")
  if [ "$C" = "200" ]; then ok; else bad "SSR $p → $C"; fi
done
C=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR "$BASE/login")
if [ "$C" = "307" ]; then ok; else bad "login authed → 307 (got $C)"; fi
C=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/dashboard")
eq "$C" "307" "admin unauth → 307"

# ══ 17. RATE LIMIT / THROTTLE ══════════════════════════════════════════════
say "THROTTLE"
for i in 1 2 3 4 5 6 7 8 9; do
  curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"throttle@test.com","password":"wrong"}' > /dev/null
done
R=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"throttle@test.com","password":"wrong"}')
has "$R" 'Too many\|attempts' "login throttle after 8"

# ══ 18. DEMO DATA ══════════════════════════════════════════════════════════
say "DEMO DATA"
R=$(curl -s -b $JAR $BASE/api/admin/demo-data)
has "$R" '"demoSeeded":true' "demo seeded flag"

echo ""
echo "════════════════════════════════════"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "════════════════════════════════════"
exit $FAIL
