"""subprocess wrappers (CREATE_NO_WINDOW on Windows)."""

from __future__ import annotations

import subprocess
import sys
from typing import Any


def _with_flags(kwargs: dict[str, Any]) -> dict[str, Any]:
    if sys.platform != "win32":
        return kwargs
    flags = kwargs.get("creationflags", 0) | subprocess.CREATE_NO_WINDOW
    return {**kwargs, "creationflags": flags}


def run(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[Any]:
    return subprocess.run(*args, **_with_flags(kwargs))


def popen(*args: Any, **kwargs: Any) -> subprocess.Popen[Any]:
    return subprocess.Popen(*args, **_with_flags(kwargs))
