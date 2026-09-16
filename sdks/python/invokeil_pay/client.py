"""Invokeil Pay Python client.

Usage:
    from invokeil_pay import InvokeilPay

    invokeil = InvokeilPay("https://pay.example.com", "sk_live_xxx")
    checkout = invokeil.create_checkout({
        "amount": 500,
        "customer_name": "Rahim Uddin",
        "customer_mobile": "01712345678",
    })
    result = invokeil.verify_payment(checkout["checkout_token"])
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional

import requests

REPLAY_WINDOW_MS = 300_000  # 5 minutes, mirrors the server


class InvokeilError(Exception):
    """Raised when the API returns an error response."""

    def __init__(self, message: str, status: int = 0, data: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.status = status
        self.data = data or {}


class InvokeilPay:
    """Client for the Invokeil Pay Merchant API v1."""

    def __init__(self, base_url: str, api_key: str, timeout: int = 30) -> None:
        if not base_url:
            raise ValueError("base_url is required")
        if not api_key:
            raise ValueError("api_key is required")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
                "User-Agent": "invokeil-pay-python/1.0",
            }
        )

    # ── low-level ────────────────────────────────────────────────────────

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        kwargs: Dict[str, Any] = {"timeout": self.timeout}
        if body is not None:
            kwargs["json"] = body
        res = self._session.request(method, self.base_url + path, **kwargs)
        try:
            data = res.json() if res.content else {}
        except (ValueError, json.JSONDecodeError):
            data = {}
        if not res.ok:
            msg = data.get("error") if isinstance(data, dict) else None
            raise InvokeilError(msg or f"HTTP {res.status_code}", res.status_code, data)
        return data

    # ── merchant API v1 ──────────────────────────────────────────────────

    def create_checkout(self, payment: Dict[str, Any]) -> Dict[str, Any]:
        """Create a hosted checkout. POST /api/v1/checkout"""
        return self._request("POST", "/api/v1/checkout", payment or {})

    def create_payment(self, payment: Dict[str, Any]) -> Dict[str, Any]:
        """PipraPay-compatible alias of create_checkout."""
        return self.create_checkout(payment)

    def verify_payment(self, pp_id: str) -> Dict[str, Any]:
        """Verify a payment by checkout id. POST /api/v1/verify-payment"""
        return self._request("POST", "/api/v1/verify-payment", {"pp_id": str(pp_id)})

    def get_checkout(self, token: str) -> Dict[str, Any]:
        """Fetch a checkout by token. GET /api/v1/checkout/{token}"""
        return self._request("GET", f"/api/v1/checkout/{token}")

    # ── webhook verification ─────────────────────────────────────────────

    def verify_webhook_signature(
        self,
        raw_body: bytes,
        header: str,
        secret: str,
        tolerance_ms: int = REPLAY_WINDOW_MS,
    ) -> bool:
        """Verify an X-Invokeil-Signature header.

        Scheme (identical to the server):
          t=<ms-epoch>,v1=hex(hmac_sha256(secret, "<t>.<raw_body>"))
        with a 5-minute replay window. Pass the RAW body bytes exactly as
        received — never a re-serialized dict.
        """
        if not raw_body or not header or not secret:
            return False
        parts: Dict[str, str] = {}
        for kv in str(header).split(","):
            i = kv.find("=")
            if i > 0:
                parts[kv[:i].strip()] = kv[i + 1 :].strip()
        t = parts.get("t")
        v1 = parts.get("v1")
        if not t or not v1 or not t.isdigit():
            return False
        if abs(int(time.time() * 1000) - int(t)) > tolerance_ms:
            return False
        expected = hmac.new(
            secret.encode("utf-8"),
            f"{t}.".encode("utf-8") + raw_body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, v1)
