"""Private control plane (JSON frames over UDS or loopback TCP)."""

from musicweb.control.client import ControlClient
from musicweb.control.server import ControlServer

__all__ = ["ControlClient", "ControlServer"]
