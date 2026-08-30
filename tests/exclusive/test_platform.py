from musicweb.exclusive.platform import hog_supported


def test_hog_supported_darwin_and_win32():
    assert hog_supported(system="darwin") is True
    assert hog_supported(system="win32") is True


def test_hog_supported_linux_and_other():
    assert hog_supported(system="linux") is False
    assert hog_supported(system="linux2") is False
    assert hog_supported(system="cygwin") is False
