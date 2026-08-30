"""Data-dir exclusive lock: acquire, contend, release."""

from __future__ import annotations

import pytest

from musicweb.runtime.lock import DataDirLock, DataDirLockError, is_data_dir_locked


def test_first_lock_acquires(tmp_home):
    lock = DataDirLock(tmp_home.data)
    lock.acquire()
    try:
        assert lock.path.is_file()
        assert is_data_dir_locked(tmp_home.data)
    finally:
        lock.release()


def test_second_lock_raises(tmp_home):
    first = DataDirLock(tmp_home.data)
    first.acquire()
    try:
        second = DataDirLock(tmp_home.data)
        with pytest.raises(DataDirLockError, match="data directory lock"):
            second.acquire()
    finally:
        first.release()


def test_release_allows_reacquire(tmp_home):
    first = DataDirLock(tmp_home.data)
    first.acquire()
    first.release()
    assert not is_data_dir_locked(tmp_home.data)
    second = DataDirLock(tmp_home.data)
    second.acquire()
    try:
        assert is_data_dir_locked(tmp_home.data)
    finally:
        second.release()


def test_context_manager_releases(tmp_home):
    with DataDirLock(tmp_home.data) as held:
        assert is_data_dir_locked(tmp_home.data)
        assert held.path.is_file()
    assert not is_data_dir_locked(tmp_home.data)


def test_is_data_dir_locked_false_when_free(tmp_home):
    assert not is_data_dir_locked(tmp_home.data)
