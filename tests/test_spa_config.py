"""#musicweb-config injection and MUSICWEB_DEV_UNLOCK_PWA."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from musicweb.config import Settings
from musicweb.routes.pages import (
    EMPTY_CONFIG_JSON,
    _EMPTY_CONFIG_TAG,
    _spa_shell,
    shell_config_json,
)


def test_empty_config_json_is_compact_and_off_by_default():
    assert EMPTY_CONFIG_JSON == '{"publicOrigin":"","devUnlockPwa":false}'
    assert EMPTY_CONFIG_JSON in _EMPTY_CONFIG_TAG


def test_shell_config_json_unlock_true():
    assert (
        shell_config_json(public_origin="http://127.0.0.1:8765", dev_unlock_pwa=True)
        == '{"publicOrigin":"http://127.0.0.1:8765","devUnlockPwa":true}'
    )


def test_settings_dev_unlock_defaults_false(tmp_path, monkeypatch):
    monkeypatch.delenv("MUSICWEB_DEV_UNLOCK_PWA", raising=False)
    settings = Settings(
        music_library_path=tmp_path,
        musicweb_data_dir=tmp_path,
        _env_file=None,
    )
    assert settings.musicweb_dev_unlock_pwa is False


def test_settings_dev_unlock_from_env(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSICWEB_DEV_UNLOCK_PWA", "true")
    settings = Settings(
        music_library_path=tmp_path,
        musicweb_data_dir=tmp_path,
        _env_file=None,
    )
    assert settings.musicweb_dev_unlock_pwa is True


def _request(tmp_path, html: str, *, unlock: bool) -> SimpleNamespace:
    (tmp_path / "index.html").write_text(html, encoding="utf-8")
    settings = Settings(
        music_library_path=tmp_path,
        musicweb_data_dir=tmp_path,
        musicweb_dev_unlock_pwa=unlock,
        _env_file=None,
    )
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=settings)))


def test_spa_shell_replaces_empty_tag(tmp_path, monkeypatch):
    html = f"<html>{_EMPTY_CONFIG_TAG}</html>"
    monkeypatch.setattr(
        "musicweb.routes.pages.require_frontend_dist", lambda: tmp_path
    )
    req = _request(tmp_path, html, unlock=True)
    resp = _spa_shell(req)
    body = bytes(resp.body).decode("utf-8")
    assert '"devUnlockPwa":true' in body
    assert _EMPTY_CONFIG_TAG not in body


def test_spa_shell_unlock_false(tmp_path, monkeypatch):
    html = f"<html>{_EMPTY_CONFIG_TAG}</html>"
    monkeypatch.setattr(
        "musicweb.routes.pages.require_frontend_dist", lambda: tmp_path
    )
    req = _request(tmp_path, html, unlock=False)
    resp = _spa_shell(req)
    body = bytes(resp.body).decode("utf-8")
    assert '"devUnlockPwa":false' in body


def test_spa_shell_missing_empty_tag_raises(tmp_path, monkeypatch):
    html = "<html><script id='musicweb-config'>{}</script></html>"
    monkeypatch.setattr(
        "musicweb.routes.pages.require_frontend_dist", lambda: tmp_path
    )
    req = _request(tmp_path, html, unlock=False)
    with pytest.raises(RuntimeError, match="musicweb-config"):
        _spa_shell(req)
