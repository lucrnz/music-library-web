from pathlib import Path

from musicweb.exclusive.paths import default_companion_data_dir


def test_darwin():
    home = Path("/Users/luc")
    assert default_companion_data_dir(
        home, system="darwin", environ={}
    ) == home / "Library" / "Application Support" / "musicweb-companion"


def test_win32_with_localappdata():
    home = Path("C:/Users/luc")
    got = default_companion_data_dir(
        home,
        system="win32",
        environ={"LOCALAPPDATA": "D:/Local"},
    )
    assert got == Path("D:/Local") / "musicweb-companion"


def test_win32_without_localappdata():
    home = Path("C:/Users/luc")
    got = default_companion_data_dir(home, system="win32", environ={})
    assert got == home / "AppData" / "Local" / "musicweb-companion"


def test_posix_xdg():
    home = Path("/home/luc")
    got = default_companion_data_dir(
        home, system="linux", environ={"XDG_DATA_HOME": "/var/data"}
    )
    assert got == Path("/var/data") / "musicweb-companion"


def test_posix_default():
    home = Path("/home/luc")
    got = default_companion_data_dir(home, system="linux", environ={})
    assert got == home / ".local" / "share" / "musicweb-companion"
