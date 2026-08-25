from pathlib import Path

import pytest

from musicweb.exclusive import blob_store


def test_jail_rejects_parent_absolute_and_nul(tmp_path: Path):
    with pytest.raises(blob_store.BlobJailError):
        blob_store.safe_key("../x")
    with pytest.raises(blob_store.BlobJailError):
        blob_store.safe_key("/etc/passwd")
    with pytest.raises(blob_store.BlobJailError):
        blob_store.safe_key("a\x00b")
    dest = blob_store.resolve(tmp_path, "audio/t1.flac")
    assert dest.is_relative_to(tmp_path.resolve())


def test_put_stat_delete(tmp_path: Path):
    n = blob_store.put_bytes(tmp_path, "audio/a.bin", b"abcd")
    assert n == 4
    exists, size = blob_store.stat(tmp_path, "audio/a.bin")
    assert exists is True
    assert size == 4
    blob_store.delete(tmp_path, "audio/a.bin")
    exists, size = blob_store.stat(tmp_path, "audio/a.bin")
    assert exists is False
    assert size == 0


def test_partial_resume_size(tmp_path: Path):
    blob_store.append_chunk(tmp_path, "audio/a.bin", b"ab", offset=0)
    exists, size = blob_store.stat(tmp_path, "audio/a.bin")
    assert exists is False
    assert size == 2
    blob_store.append_chunk(tmp_path, "audio/a.bin", b"cd", offset=2)
    n = blob_store.promote_partial(tmp_path, "audio/a.bin")
    assert n == 4
    exists, size = blob_store.stat(tmp_path, "audio/a.bin")
    assert exists is True
    assert size == 4


def test_disk_free(tmp_path: Path):
    assert blob_store.disk_free(tmp_path) >= 0
    missing = tmp_path / "not-created-yet"
    assert not missing.exists()
    assert blob_store.disk_free(missing) >= 0
    assert not missing.exists()


def test_put_chunks_and_iter_span(tmp_path: Path):
    n = blob_store.put_chunks(tmp_path, "audio/a.bin", (b"ab", b"cd", b"ef"))
    assert n == 6
    path = blob_store.open_read(tmp_path, "audio/a.bin")
    assert b"".join(blob_store.iter_file_span(path, 1, 4)) == b"bcde"
