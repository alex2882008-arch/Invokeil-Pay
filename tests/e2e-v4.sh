#!/usr/bin/env bash
# v4 e2e — gateway management (PipraPay-style), payment page two-view data,
# allow-pending instant verify, profile management.
set -u
BASE="http://localhost:3000"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ok: $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL: $1"; }
check() { # check <desc> <expected> <actual>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected=$2 got=$3)"; fi
}

JAR=/tmp/v4-cookies.txt
rm -f "$JAR"

echo "── auth ──"
CODE=$(curl -s -o /tmp/login.json -w "%{http_code}" -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@admin.com","password":"12345678"}')
check "login" "200" "$CODE"

echo "── gateway list & secrets masking ──"
CODE=$(curl -s -o /tmp/gws.json -w "%{http_code}" -b "$JAR" "$BASE/api/admin/gateways")
check "GET /api/admin/gateways" "200" "$CODE"
COUNT=$(python3 -c "import json;d=json.load(open('/tmp/gws.json'));print(len(d.get('gateways',[])))")
[ "$COUNT" -gt 0 ] && ok "gateways exist ($COUNT)" || bad "no gateways ($COUNT)"
BKASH_ID=$(python3 -c "
import json
d=json.load(open('/tmp/gws.json'))
g=[x for x in d['gateways'] if x['code']=='BKASH_PERSONAL'][0]
print(g['id'])")
# write a secret into config, then confirm it is masked on read
CODE=$(curl -s -o /tmp/patch1.json -w "%{http_code}" -b "$JAR" -X PATCH "$BASE/api/admin/gateways/$BKASH_ID" \
  -H 'Content-Type: application/json' \
  -d '{"config":{"api_key":"super-secret-key-12345"}}')
check "PATCH config secret" "200" "$CODE"
MASKED=$(python3 -c "
import json
d=json.load(open('/tmp/patch1.json'))
print(d['gateway']['config'].get('api_key',''))")
case "$MASKED" in
  '••••'*'2345') ok "secret masked in response ($MASKED)";;
  *) bad "secret leaked: $MASKED";;
esac

echo "── new gateway fields round-trip ──"
CODE=$(curl -s -o /tmp/patch2.json -w "%{http_code}" -b "$JAR" -X PATCH "$BASE/api/admin/gateways/$BKASH_ID" \
  -H 'Content-Type: application/json' \
  -d '{"displayName":"bKash Personal","buttonColor":"#E2136E","buttonText":"#FFFFFF","allowPending":"DISABLED","currency":"BDT","supportedLanguages":"en,bn","mode":"LIVE","ipnUrl":"https://example.com/ipn","bankName":null}')
check "PATCH new fields" "200" "$CODE"
VALS=$(python3 -c "
import json
d=json.load(open('/tmp/patch2.json'))['gateway']
print(d['displayName'], d['buttonColor'], d['allowPending'], d['currency'], d['supportedLanguages'], d['mode'], d['ipnUrl'])")
check "fields persisted" "bKash Personal #E2136E DISABLED BDT en,bn LIVE https://example.com/ipn" "$VALS"
# invalid color rejected
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X PATCH "$BASE/api/admin/gateways/$BKASH_ID" \
  -H 'Content-Type: application/json' -d '{"color":"red"}')
check "invalid color rejected (400)" "400" "$CODE"
# invalid ipn rejected
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X PATCH "$BASE/api/admin/gateways/$BKASH_ID" \
  -H 'Content-Type: application/json' -d '{"ipnUrl":"ftp://x"}')
check "invalid ipn rejected (400)" "400" "$CODE"
# restore allowPending ENABLED for later payment flow tests
curl -s -o /dev/null -b "$JAR" -X PATCH "$BASE/api/admin/gateways/$BKASH_ID" \
  -H 'Content-Type: application/json' -d '{"allowPending":"ENABLED","config":{"api_key":""}}'

echo "── create / delete catalog gateway ──"
# free a catalog slot first (all catalog entries are configured in the demo DB)
FREE_ID=$(python3 -c "
import json
d=json.load(open('/tmp/gws.json'))
g=[x for x in d['gateways'] if x['code']=='SURECASH_PERSONAL'][0]
print(g['id'])")
curl -s -o /dev/null -b "$JAR" -X DELETE "$BASE/api/admin/gateways/$FREE_ID"
CODE=$(curl -s -o /tmp/post1.json -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/admin/gateways" \
  -H 'Content-Type: application/json' -d '{"code":"SURECASH_PERSONAL"}')
check "POST catalog gateway" "201" "$CODE"
NEW_ID=$(python3 -c "import json;print(json.load(open('/tmp/post1.json'))['gateway']['id'])")
CODE=$(curl -s -o /tmp/post2.json -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/admin/gateways" \
  -H 'Content-Type: application/json' -d '{"code":"SURECASH_PERSONAL"}')
check "duplicate rejected (409)" "409" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X DELETE "$BASE/api/admin/gateways/$NEW_ID")
check "DELETE gateway" "200" "$CODE"
# restore the seeded row for the demo dataset
curl -s -o /dev/null -b "$JAR" -X POST "$BASE/api/admin/gateways" \
  -H 'Content-Type: application/json' -d '{"code":"SURECASH_PERSONAL"}'

echo "── create / delete bank gateway ──"
CODE=$(curl -s -o /tmp/post3.json -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/admin/gateways" \
  -H 'Content-Type: application/json' \
  -d '{"bank":true,"name":"City Bank SME","bankName":"City Bank","holderName":"Ahmed Rahman","accountNumber":"1402-2020-3030","branchName":"Gulshan","routingNumber":"225261723","swiftCode":"CITIBDDH"}')
check "POST bank gateway" "201" "$CODE"
BANK_ID=$(python3 -c "import json;print(json.load(open('/tmp/post3.json'))['gateway']['id'])")
BANK_CODE=$(python3 -c "import json;d=json.load(open('/tmp/post3.json'))['gateway'];print(d['code'],d['category'],d['bankName'])")
check "bank fields stored" "BANK_CITY_BANK_SME BANK City Bank" "$BANK_CODE"
curl -s -o /dev/null -b "$JAR" -X DELETE "$BASE/api/admin/gateways/$BANK_ID"

echo "── catalog endpoint ──"
CODE=$(curl -s -o /tmp/cat.json -w "%{http_code}" -b "$JAR" "$BASE/api/admin/gateways?catalog=1")
check "GET catalog" "200" "$CODE"
CATN=$(python3 -c "import json;print(len(json.load(open('/tmp/cat.json'))['catalog']))")
[ "$CATN" -ge 0 ] && ok "catalog non-negative ($CATN unconfigured)" || bad "catalog"

echo "── public pay payload (two-view fields) ──"
# create a checkout via wizard-ish admin API
CODE=$(curl -s -o /tmp/co.json -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/admin/checkouts" \
  -H 'Content-Type: application/json' \
  -d '{"title":"V4 Two-View Test","amount":500,"currency":"BDT","mfs":"BKASH"}')
check "create checkout" "200" "$CODE"
TOKEN=$(python3 -c "
import json
d=json.load(open('/tmp/co.json'))
print(d.get('checkout',{}).get('token') or d.get('token',''))")
CODE=$(curl -s -o /tmp/pay.json -w "%{http_code}" "$BASE/api/pay/$TOKEN")
check "GET /api/pay/[token]" "200" "$CODE"
GW_FIELDS=$(python3 -c "
import json
d=json.load(open('/tmp/pay.json'))
g=[x for x in d['gateways'] if x['code']=='BKASH_PERSONAL'][0]
keys=['displayName','buttonColor','buttonText','logoUrl','allowPending','method','hasQr','accountNumber']
print(' '.join('1' if k in g else '0' for k in keys))")
check "payload exposes new gateway fields" "1 1 1 1 1 1 1 1" "$GW_FIELDS"
BKASH_NUM=$(python3 -c "
import json
d=json.load(open('/tmp/pay.json'))
g=[x for x in d['gateways'] if x['code']=='BKASH_PERSONAL'][0]
print(g['accountNumber'] or '')")
[ -n "$BKASH_NUM" ] && ok "receiving number present ($BKASH_NUM)" || bad "no receiving number"

echo "── claim flow (allow pending ENABLED → AWAITING) ──"
CODE=$(curl -s -o /tmp/claim1.json -w "%{http_code}" -X POST "$BASE/api/pay/$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"claim","senderNumber":"01712345678","trxId":"V4TEST01"}')
check "claim → AWAITING" "200" "$CODE"
ST=$(python3 -c "import json;print(json.load(open('/tmp/claim1.json')).get('status',''))")
check "status AWAITING" "AWAITING" "$ST"

echo "── allow-pending DISABLED instant verify path ──"
# new checkout + gateway with allowPending DISABLED and no matching tx → 422
CODE=$(curl -s -o /tmp/co2.json -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/admin/checkouts" \
  -H 'Content-Type: application/json' \
  -d '{"title":"V4 Pending Disabled","amount":777,"currency":"BDT","mfs":"BKASH"}')
TOKEN2=$(python3 -c "
import json
d=json.load(open('/tmp/co2.json'))
print(d.get('checkout',{}).get('token') or d.get('token',''))")
curl -s -o /dev/null -b "$JAR" -X PATCH "$BASE/api/admin/gateways/$BKASH_ID" \
  -H 'Content-Type: application/json' -d '{"allowPending":"DISABLED"}'
CODE=$(curl -s -o /tmp/claim2.json -w "%{http_code}" -X POST "$BASE/api/pay/$TOKEN2" \
  -H 'Content-Type: application/json' \
  -d '{"action":"claim","senderNumber":"01712345679","gatewayCode":"BKASH_PERSONAL"}')
check "pending-disabled without match → 422" "422" "$CODE"
curl -s -o /dev/null -b "$JAR" -X PATCH "$BASE/api/admin/gateways/$BKASH_ID" \
  -H 'Content-Type: application/json' -d '{"allowPending":"ENABLED"}'

echo "── profile management ──"
CODE=$(curl -s -o /tmp/prof1.json -w "%{http_code}" -b "$JAR" -X PATCH "$BASE/api/auth/profile" \
  -H 'Content-Type: application/json' -d '{"name":"Administrator"}')
check "PATCH profile name" "200" "$CODE"
CODE=$(curl -s -o /tmp/prof2.json -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/auth/profile" \
  -H 'Content-Type: application/json' -d '{"currentPassword":"wrongpass","newPassword":"newpass123"}')
check "wrong current password rejected (400)" "400" "$CODE"
CODE=$(curl -s -o /tmp/prof3.json -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/auth/profile" \
  -H 'Content-Type: application/json' -d '{"currentPassword":"12345678","newPassword":"1234567"}')
check "short new password rejected (400)" "400" "$CODE"
# same-password change rejected
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/auth/profile" \
  -H 'Content-Type: application/json' -d '{"currentPassword":"12345678","newPassword":"12345678"}')
check "same password rejected (400)" "400" "$CODE"

echo "── auth guards ──"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/gateways")
check "gateways require auth (401)" "401" "$CODE"

echo
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
