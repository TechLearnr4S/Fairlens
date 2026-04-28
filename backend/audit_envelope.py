"""Uniform JSON envelopes for audit API success responses."""

from __future__ import annotations

from typing import Any


def audit_success(data: Any) -> dict[str, Any]:
    return {"success": True, "data": data, "error": None}
