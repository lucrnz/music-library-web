def test_musicweb_package_importable():
    import musicweb

    assert musicweb is not None
    assert musicweb.__name__ == "musicweb"
