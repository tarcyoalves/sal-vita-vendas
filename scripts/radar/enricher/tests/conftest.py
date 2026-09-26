"""Deixa `extract`, `config`, `db`, `sources.*` importáveis nos testes,
exatamente como o worker.py os importa quando rodado de dentro de
scripts/radar/enricher/ (sem precisar instalar isto como pacote)."""

import pathlib
import sys

import pytest

_ENRICHER_DIR = pathlib.Path(__file__).resolve().parent.parent
if str(_ENRICHER_DIR) not in sys.path:
    sys.path.insert(0, str(_ENRICHER_DIR))

_FIXTURES_DIR = pathlib.Path(__file__).resolve().parent / "fixtures"


def _load(name: str) -> str:
    return (_FIXTURES_DIR / name).read_text(encoding="utf-8")


@pytest.fixture
def ddg_results_html() -> str:
    return _load("ddg_results.html")


@pytest.fixture
def ddg_blocked_html() -> str:
    return _load("ddg_blocked.html")


@pytest.fixture
def bing_results_html() -> str:
    return _load("bing_results.html")


@pytest.fixture
def instagram_login_wall_html() -> str:
    return _load("instagram_login_wall.html")


@pytest.fixture
def instagram_public_bio_html() -> str:
    return _load("instagram_public_bio.html")


@pytest.fixture
def maps_place_match_html() -> str:
    return _load("maps_place_match.html")


@pytest.fixture
def maps_place_no_match_html() -> str:
    return _load("maps_place_no_match.html")


@pytest.fixture
def site_home_html() -> str:
    return _load("site_home.html")
