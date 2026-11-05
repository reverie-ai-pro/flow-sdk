"""Minimal, server-side client for REVERIE Flow API."""
import json
import re
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler, Request


class FlowApiError(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code
        super().__init__(f"Flow API returned HTTP {status} ({code})")


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _segment(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ValueError("Invalid Flow or run identifier")
    return value


class FlowClient:
    def __init__(self, base_url, token):
        url = urlsplit(base_url)
        local = url.scheme == "http" and url.hostname in ("127.0.0.1", "::1", "localhost")
        if (url.scheme != "https" and not local) or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
            raise ValueError("Use an HTTPS origin or local loopback")
        if not token or any(c.isspace() for c in token):
            raise ValueError("Missing or invalid server token")
        self._origin = base_url.rstrip("/")
        self._token = token
        self._http = build_opener(_NoRedirect())

    def _request(self, path, method="GET", data=None, key=None, stream=False, timeout=30):
        headers = {"Authorization": "Bearer " + self._token}
        body = None
        if data is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(data).encode()
        if key is not None:
            headers["Idempotency-Key"] = key
        request = Request(self._origin + path, data=body, headers=headers, method=method)
        try:
            response = self._http.open(request, timeout=timeout)
        except HTTPError as error:
            with error:
                try:
                    payload = json.load(error)
                    code = (payload.get("error") or {}).get("code") or payload.get("code")
                except (ValueError, AttributeError):
                    code = None
            raise FlowApiError(error.code, code or "request_failed") from None
        if stream:
            return response
        with response:
            return json.load(response)

    def describe(self, flow):
        return self._request("/v1/pipelines/" + _segment(flow))

    def start(self, flow, inputs, idempotency_key):
        if not idempotency_key or not idempotency_key.strip():
            raise ValueError("A stable idempotency key is required")
        return self._request("/v1/pipelines/" + _segment(flow) + "/runs", "POST", {"input": inputs}, idempotency_key)

    def get(self, run_id, timeout=30):
        return self._request("/v1/runs/" + _segment(run_id), timeout=timeout)

    def cancel(self, run_id):
        return self._request("/v1/runs/" + _segment(run_id) + "/cancel", "POST")

    def artifact(self, run_id, asset_id):
        return self._request("/v1/runs/" + _segment(run_id) + "/artifacts/" + _segment(asset_id), stream=True)

    def wait(self, run_id, timeout=120, interval=1):
        import math
        if not all(math.isfinite(x) and x > 0 for x in (timeout, interval)):
            raise ValueError("Positive timeout and interval required")
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            run = self.get(run_id, timeout=max(0.001, deadline - time.monotonic()))
            if run["status"] in ("succeeded", "failed", "canceled"):
                return run
            time.sleep(min(interval, max(0, deadline - time.monotonic())))
        raise TimeoutError("Polling timed out. Resume with the same run ID.")
