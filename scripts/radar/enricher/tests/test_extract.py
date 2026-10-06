import pytest
"""Testes unitários de scripts/radar/enricher/extract.py — 100% offline,
sem rede, só HTML/texto sintético."""

import extract


# ── Telefones ────────────────────────────────────────────────────────────

def test_normalize_phone_landline_with_country_code():
    assert extract.normalize_phone("+55 (49) 3544-1234") == "4935441234"


def test_normalize_phone_mobile():
    assert extract.normalize_phone("49 99911-2233") == "49999112233"


def test_normalize_phone_rejects_invalid_ddd():
    assert extract.normalize_phone("00 91234567") is None
    assert extract.normalize_phone("20 91234567") is None


def test_normalize_phone_rejects_wrong_length():
    assert extract.normalize_phone("123456789") is None  # 9 dígitos, sem DDD
    assert extract.normalize_phone("123456789012345") is None  # longo demais


def test_normalize_phone_rejects_repeated_or_sequential():
    assert extract.normalize_phone("49 00000000") is None
    assert extract.normalize_phone("49 12345678") is None


def test_normalize_phone_rejects_cnpj_as_phone():
    # 14 dígitos de um CNPJ não devem virar telefone mesmo se fatiados.
    assert extract.normalize_phone("12345678000190") is None


def test_extract_phones_from_text_ignores_cnpj_and_cep():
    text = "CNPJ: 12.345.678/0001-90, fone (49) 3544-1234, CEP 59600-000"
    assert extract.extract_phones_from_text(text) == ["4935441234"]


def test_extract_phones_from_text_dedupes():
    text = "Ligue (49) 3544-1234 ou (49) 3544-1234"
    assert extract.extract_phones_from_text(text) == ["4935441234"]


def test_extract_phones_from_tel_links():
    from scrapling import Selector

    sel = Selector('<a href="tel:+554935441234">Ligar</a>')
    assert extract.extract_phones_from_tel_links(sel) == ["4935441234"]


def test_likely_mobile():
    assert extract.likely_mobile("49999112233") is True
    assert extract.likely_mobile("4935441234") is False


# ── WhatsApp ─────────────────────────────────────────────────────────────

def test_extract_whatsapp_numbers_wa_me():
    html = '<a href="https://wa.me/5549998877665">chame</a>'
    assert extract.extract_whatsapp_numbers(html) == ["49998877665"]


def test_extract_whatsapp_numbers_api_whatsapp():
    html = '<a href="https://api.whatsapp.com/send?phone=5549998877665&text=oi">fale</a>'
    assert extract.extract_whatsapp_numbers(html) == ["49998877665"]


def test_extract_whatsapp_numbers_rejects_invalid():
    html = '<a href="https://wa.me/000000000000">chame</a>'
    assert extract.extract_whatsapp_numbers(html) == []


# ── E-mails ──────────────────────────────────────────────────────────────

def test_extract_emails_from_text_basic():
    assert extract.extract_emails_from_text("fale com contato@empresa.com.br") == [
        "contato@empresa.com.br"
    ]


def test_extract_emails_from_text_rejects_image_filenames():
    assert extract.extract_emails_from_text("logo@2x.png e icone@1x.jpg") == []


def test_extract_emails_from_text_rejects_version_like_domains():
    # Artefato comum de biblioteca JS minificada, não é e-mail de verdade.
    assert extract.extract_emails_from_text("import lenis@1.0.22 from 'lenis'") == []


def test_extract_emails_from_text_rejects_placeholder_domains():
    assert extract.extract_emails_from_text("teste@example.com") == []


def test_extract_emails_from_mailto():
    from scrapling import Selector

    sel = Selector('<a href="mailto:contato@empresa.com.br?subject=Oi">Fale</a>')
    assert extract.extract_emails_from_mailto(sel) == ["contato@empresa.com.br"]


def test_is_junk_email_rejects_no_at():
    assert extract.is_junk_email("nao-e-email") is True


# ── Nome da empresa / seleção de site ────────────────────────────────────

def test_normalize_name_tokens_strips_legal_suffix():
    tokens = extract.normalize_name_tokens("Agroexemplo Comércio de Rações Ltda")
    assert "agroexemplo" in tokens
    assert "racoes" in tokens or "raçoes" in tokens
    assert "ltda" not in tokens
    assert "de" not in tokens


def test_is_directory_domain():
    assert extract.is_directory_domain("https://www.cnpj.biz/empresa-x") is True
    assert extract.is_directory_domain("https://www.econodata.com.br/x") is True
    assert extract.is_directory_domain("https://www.google.com/search?q=x") is True
    assert extract.is_directory_domain("https://www.agroexemplo.com.br/") is False


def test_is_social_domain():
    assert extract.is_social_domain("https://www.instagram.com/agroexemplo/") == "instagram"
    assert extract.is_social_domain("https://www.facebook.com/agroexemplo/") == "facebook"
    assert extract.is_social_domain("https://www.agroexemplo.com.br/") is None


def test_is_social_domain_rejects_generic_non_profile_links():
    # Achado ao vivo: botão de "compartilhar no Facebook" que aponta só para
    # a raiz do domínio — não é o perfil da empresa, é ruído.
    assert extract.is_social_domain("https://www.facebook.com/") is None
    assert extract.is_social_domain("https://www.facebook.com/sharer/sharer.php?u=x") is None
    assert extract.is_social_domain("https://www.facebook.com/tr?id=123") is None
    assert extract.is_social_domain("https://www.instagram.com/accounts/login/") is None


def test_score_website_candidate_prefers_name_match():
    company = "Agroexemplo Comércio de Rações Ltda"
    good = extract.score_website_candidate("https://www.agroexemplo.com.br/", company)
    bad = extract.score_website_candidate("https://www.cnpj.biz/agroexemplo-ltda", company)
    unrelated = extract.score_website_candidate("https://www.outraempresa.com.br/", company)
    assert good > 0
    assert bad == 0  # é diretório, descartado mesmo citando o nome
    assert unrelated == 0


def test_pick_best_website_ignores_directories_and_social():
    company = "Agroexemplo Comércio de Rações Ltda"
    candidates = [
        "https://www.cnpj.biz/agroexemplo-ltda",
        "https://www.instagram.com/agroexemplo/",
        "https://www.agroexemplo.com.br/",
    ]
    assert extract.pick_best_website(candidates, company) == "https://www.agroexemplo.com.br/"


def test_pick_best_website_returns_none_without_relation():
    company = "Agroexemplo Comércio de Rações Ltda"
    candidates = ["https://www.blogpessoal.com.br/", "https://www.outrosite.net/"]
    assert extract.pick_best_website(candidates, company) is None


def test_normalize_website_url_strips_tracking_and_trailing_slash():
    assert (
        extract.normalize_website_url("http://WWW.Exemplo.com.br/pagina/?utm_source=x")
        == "https://www.exemplo.com.br/pagina"
    )


# ── Buscador (DuckDuckGo / Bing) ─────────────────────────────────────────

def test_parse_ddg_results(ddg_results_html):
    results = extract.parse_ddg_results(ddg_results_html)
    urls = [r["url"] for r in results]
    assert "https://www.agroexemplo.com.br/" in urls
    assert "https://www.instagram.com/agroexemplo/" in urls


def test_parse_ddg_results_detects_block(ddg_blocked_html):
    assert extract.is_search_blocked(ddg_blocked_html) is True
    assert extract.parse_ddg_results(ddg_blocked_html) == []


def test_parse_bing_results(bing_results_html):
    results = extract.parse_bing_results(bing_results_html)
    urls = [r["url"] for r in results]
    # O link real vem embrulhado em bing.com/ck/a?...&u=a1<base64> — o parser
    # precisa desembrulhar para a URL real (visto ao vivo durante o dev).
    assert "https://www.agroexemplo.com.br/" in urls


def test_unwrap_bing_redirect():
    wrapped = (
        "https://www.bing.com/ck/a?!&&p=abc&u=a1aHR0cHM6Ly93d3cuYWdyb2V4ZW1wbG8uY29tLmJyLw&ntb=1"
    )
    assert extract._unwrap_bing_redirect(wrapped) == "https://www.agroexemplo.com.br/"
    # Um link normal (não embrulhado) passa direto.
    assert extract._unwrap_bing_redirect("https://www.agroexemplo.com.br/") == "https://www.agroexemplo.com.br/"


def test_find_social_links_in_results(ddg_results_html):
    results = extract.parse_ddg_results(ddg_results_html)
    social = extract.find_social_links_in_results(results)
    assert social["instagram"] == "https://www.instagram.com/agroexemplo/"
    assert social["facebook"] is None


def test_is_search_blocked_on_http_status():
    assert extract.is_search_blocked("<html>tudo bem</html>", status_code=429) is True
    assert extract.is_search_blocked("<html>tudo bem</html>", status_code=200) is False


# ── Login wall (Instagram/Facebook) ──────────────────────────────────────

def test_detect_login_wall_true(instagram_login_wall_html):
    assert extract.detect_login_wall(instagram_login_wall_html) is True


def test_detect_login_wall_false(instagram_public_bio_html):
    assert extract.detect_login_wall(instagram_public_bio_html) is False


def test_extract_social_bio_contacts(instagram_public_bio_html):
    bio = extract.extract_social_bio_contacts(instagram_public_bio_html)
    assert "49998877665" in bio["whatsapps"]
    assert "contato@agroexemplo.com.br" in bio["emails"]


# ── Google Maps ──────────────────────────────────────────────────────────

def test_parse_maps_place_match(maps_place_match_html):
    place = extract.parse_maps_place(maps_place_match_html, "https://maps.example/x")
    assert place["nome"] == "Agroexemplo Comércio de Rações Ltda"
    assert place["nota"] == 4.6
    assert place["avaliacoes"] == 87
    assert place["phone"] == "4932221234"
    assert place["website"] == "https://www.agroexemplo.com.br/"
    assert place["situacao"] == "aberto"


def test_parse_maps_place_none_when_empty():
    assert extract.parse_maps_place("<html><body>nada aqui</body></html>", "https://maps.example/x") is None


def test_matches_company_by_name_tokens(maps_place_match_html):
    place = extract.parse_maps_place(maps_place_match_html, "https://maps.example/x")
    assert extract.matches_company(
        place["nome"], place["endereco"], "Agroexemplo Comércio de Rações", "Chapecó"
    )


def test_matches_company_rejects_unrelated_place(maps_place_no_match_html):
    place = extract.parse_maps_place(maps_place_no_match_html, "https://maps.example/y")
    assert not extract.matches_company(
        place["nome"], place["endereco"], "Agroexemplo Comércio de Rações", "Chapecó"
    )


def test_matches_company_by_city_in_address():
    assert extract.matches_company(
        place_name="Nome Fantasia Diferente",
        address="Rua X, 10, Chapecó, SC",
        company_name="Razão Social Que Não Bate",
        city_name="Chapecó",
    )


def test_strip_legal_suffixes():
    assert (
        extract.strip_legal_suffixes("AGROSUL INDUSTRIA AGRICOLA LTDA EM RECUPERACAO JUDICIAL")
        == "AGROSUL INDUSTRIA AGRICOLA"
    )
    assert (
        extract.strip_legal_suffixes("BIOAROMAS DO BRASIL COMERCIO E IMPORTACAO DE PRODUTOS VETERINARIOS LTDA")
        == "BIOAROMAS DO BRASIL COMERCIO E IMPORTACAO DE PRODUTOS VETERINARIOS"
    )
    assert extract.strip_legal_suffixes("MERCEARIA MARONESI LTDA") == "MERCEARIA MARONESI"
    assert extract.strip_legal_suffixes("POSTO ESTRELA S/A") == "POSTO ESTRELA"
    assert extract.strip_legal_suffixes("POSTO ESTRELA S.A.") == "POSTO ESTRELA"
    assert extract.strip_legal_suffixes("DISTRIBUIDORA ALFA EPP") == "DISTRIBUIDORA ALFA"
    assert extract.strip_legal_suffixes("MERCADO MODELO - ME") == "MERCADO MODELO"
    assert extract.strip_legal_suffixes("AUTO PECAS BETA EIRELI") == "AUTO PECAS BETA"
    assert extract.strip_legal_suffixes("COOPERATIVA AGROINDUSTRIAL - S/A") == "COOPERATIVA AGROINDUSTRIAL"


def test_build_query_maps():
    from sources.maps import build_query

    # Preferência por nome fantasia
    est1 = {
        "razao_social": "BIOAROMAS DO BRASIL COMERCIO E IMPORTACAO DE PRODUTOS VETERINARIOS LTDA",
        "nome_fantasia": "BIOAROMAS DO BRASIL",
    }
    assert build_query(est1, "Chapecó", "SC") == "BIOAROMAS DO BRASIL Chapecó SC"

    # Sem nome fantasia: limpa sufixos jurídicos da razão social
    est2 = {
        "razao_social": "AGROSUL INDUSTRIA AGRICOLA LTDA EM RECUPERACAO JUDICIAL",
        "nome_fantasia": None,
    }
    assert build_query(est2, "Chapecó", "SC") == "AGROSUL INDUSTRIA AGRICOLA Chapecó SC"


def test_parse_maps_place_search_list(maps_search_list_html):
    place = extract.parse_maps_place(maps_search_list_html, "https://maps.example/search")
    assert place is not None
    assert place["nome"] == "Agrosul Indústria Agrícola"
    assert place["nota"] == 5.0
    assert place["avaliacoes"] == 12
    assert place["phone"] == "4933286292"
    assert place["website"] == "http://agrosulindustria.com.br/"
    assert place["endereco"] == "R. Recife, 1007"
    assert place["categoria"] == "Atacadista de produtos agropecuários"

    assert extract.matches_company(
        place["nome"], place["endereco"], "AGROSUL INDUSTRIA AGRICOLA", "Chapecó"
    )


def test_parse_maps_place_ignores_generic_headings():
    html_template = """
    <html>
    <body>
    <h1>{heading}</h1>
    <div class="Nv2PK">
      <a class="hfpxzc" aria-label="Loja Modelo Real" href="https://maps.example/place/1"></a>
    </div>
    </body>
    </html>
    """
    for heading in ["Resultados", "Results", "Search results", "Resultados da pesquisa"]:
        place = extract.parse_maps_place(html_template.format(heading=heading), "https://maps.example/search")
        assert place is not None
        assert place["nome"] == "Loja Modelo Real"


# ── Circuit breaker ──────────────────────────────────────────────────────

def test_circuit_breaker_trips_and_recovers(monkeypatch):
    from sources.circuit_breaker import CircuitBreaker

    breaker = CircuitBreaker(pause_minutes=1 / 60)  # 1 segundo, para o teste ser rápido
    assert breaker.is_paused("maps") is False
    breaker.trip("maps", "captcha")
    assert breaker.is_paused("maps") is True
    assert breaker.note_if_paused("maps") == "pausado: bloqueio"
    assert breaker.is_paused("busca") is False  # outras fontes não são afetadas

    import time

    time.sleep(1.1)
    assert breaker.is_paused("maps") is False


# ── Forma do resultado final (RadarEnrichmentData) ───────────────────────

def test_empty_result_is_valid_shape():
    assert extract.validate_enrichment_shape(extract.empty_result()) == []


def test_finalize_result_caps_and_dedupes():
    result = extract.empty_result()
    for i in range(10):
        result["telefones"].append(extract.make_found(f"4990000000{i % 3}", "site", "https://x"))
    finalized = extract.finalize_result(result)
    assert len(finalized["telefones"]) <= 5
    assert extract.validate_enrichment_shape(finalized) == []


def test_validate_enrichment_shape_catches_missing_field():
    data = extract.empty_result()
    del data["website"]
    errors = extract.validate_enrichment_shape(data)
    assert any("faltam campos" in e for e in errors)


def test_validate_enrichment_shape_catches_bad_source():
    data = extract.empty_result()
    data["telefones"].append({"value": "4935441234", "source": "invalido", "url": None})
    errors = extract.validate_enrichment_shape(data)
    assert any("source inválido" in e for e in errors)


def test_validate_enrichment_shape_ok_with_maps():
    data = extract.empty_result()
    data["maps"] = {
        "url": "https://maps.example/x",
        "nome": "Agroexemplo",
        "categoria": None,
        "nota": 4.5,
        "avaliacoes": 10,
        "situacao": "aberto",
        "endereco": None,
    }
    assert extract.validate_enrichment_shape(data) == []


def test_full_build_result_example_matches_shape():
    """Simula o que worker.py monta e confere contra RadarEnrichmentData."""
    result = extract.empty_result()
    extract.add_fonte(result, "busca", True, None)
    extract.add_fonte(result, "site", True, None)
    extract.add_fonte(result, "maps", False, "nenhum resultado compatível")
    extract.add_fonte(result, "social", False, "perfil exige login")
    result["website"] = "https://www.agroexemplo.com.br"
    result["instagram"] = "https://www.instagram.com/agroexemplo/"
    result["whatsapps"].append(extract.make_found("49998877665", "site", "https://www.agroexemplo.com.br"))
    result["telefones"].append(extract.make_found("4932221234", "site", "https://www.agroexemplo.com.br"))
    result["emails"].append(extract.make_found("contato@agroexemplo.com.br", "site", "https://www.agroexemplo.com.br"))
    result = extract.finalize_result(result)
    assert extract.validate_enrichment_shape(result) == []


def test_search_list_marks_lista_and_requires_strict_match(maps_search_list_html):
    place = extract.parse_maps_place(maps_search_list_html, "https://maps.example/search")
    assert place["lista"] is True
    # Palavra distintiva em comum ("agrosul") → casa.
    assert extract.matches_company_strict(place["nome"], "AGROSUL INDUSTRIA AGRICOLA LTDA")
    # Só palavras de ramo em comum ("industria", "agricola") → NÃO casa: o 1º
    # cartão de uma lista pode ser outra empresa da cidade.
    assert not extract.matches_company_strict(place["nome"], "INDUSTRIA AGRICOLA SILVA LTDA")
    assert not extract.matches_company_strict("Rações Pet Center", "COMERCIO DE RACOES CHAPECO LTDA ME")
    # Nome só com palavras genéricas não casa com nada.
    assert not extract.matches_company_strict("Agropecuária Santa Rita", "AGROPECUARIA SANTA CLARA LTDA")


def test_place_page_is_not_lista_and_ignores_review_articles():
    html = """
    <html><body>
    <h1>Mercearia Maronesi</h1>
    <div role="article"><div class="W4Efsd"><span>Liguei no (45) 99999-0000 e ninguém atendeu</span></div></div>
    </body></html>
    """
    place = extract.parse_maps_place(html, "https://maps.example/place/1")
    assert place["nome"] == "Mercearia Maronesi"
    assert place["lista"] is False
    assert place["phone"] is None


def test_maps_run_rejects_unrelated_first_card(maps_search_list_html, monkeypatch):
    from sources import maps

    class _Breaker:
        def note_if_paused(self, _s):
            return None

        def trip(self, *_a):
            raise AssertionError("não deveria pausar")

    class _Rate:
        def wait(self, _s):
            return None

    monkeypatch.setattr(maps, "_fetch_html", lambda _url: maps_search_list_html)
    outra = {"razao_social": "INDUSTRIA AGRICOLA SILVA LTDA", "nome_fantasia": None}
    res = maps.run(outra, "Chapecó", "SC", _Breaker(), _Rate())
    assert res["ok"] is False and res["phone"] is None
    assert res["note"] == "nenhum resultado compatível"

    certa = {"razao_social": "AGROSUL INDUSTRIA AGRICOLA LTDA EM RECUPERACAO JUDICIAL", "nome_fantasia": None}
    res = maps.run(certa, "Chapecó", "SC", _Breaker(), _Rate())
    assert res["ok"] is True and res["phone"] == "4933286292"


# Casos reais do lote de 05/10 (relatório do Hermes): (razão social, nome no Maps, esperado)
@pytest.mark.parametrize("empresa,maps_nome,esperado", [
    ("COOPERATIVA AGROINDUSTRIAL ALFA COOPERALFA", "Cooperalfa - São José do Cedro - Agropecuária e Supermercado", True),
    ("CARMINATTI CEREAIS LTDA", "Avícola Carminatti Ltda", True),
    ("SUPER HACK", "Super Hack São Cristovão", True),
    ("REAL COMERCIAL LTDA", "Real Color", False),
    ("JC COM IMP & EXP LTDA", "JC Distribuição Log Exp Prod Ind", False),
    ("99 PETS INDUSTRIA DE PETISCOS LTDA", "Braspet Industria e Comercio de Embalagens Ltda.", False),
    ("SUPERMERCADO MFB LTDA", "Supermercado Boniatti", False),
    ("GRANDI SERVICOS ADMINISTRATIVOS LTDA", "Prefeitura Municipal de Santa Lúcia", False),
    ("GELOW BAR E LANCHONETE", "Pajé Lanchonete E Petiscaria", False),
])
def test_matches_company_strict_casos_reais(empresa, maps_nome, esperado):
    assert extract.matches_company_strict(maps_nome, empresa) is esperado


def test_phone_ddd_conflicts_uf():
    assert extract.phone_ddd_conflicts_uf("11956560587", "SC") is True   # SP em empresa de SC
    assert extract.phone_ddd_conflicts_uf("1132849142", "SC") is True
    assert extract.phone_ddd_conflicts_uf("49991163708", "SC") is False
    assert extract.phone_ddd_conflicts_uf("4635638100", "PR") is False
    assert extract.phone_ddd_conflicts_uf("4635638100", "SC") is True
    assert extract.phone_ddd_conflicts_uf(None, "SC") is False


@pytest.mark.parametrize("empresa,maps_nome", [
    ("DEUSDEDITH EMPREENDIMENTOS IMOBILIARIOS", "D Costa Empreendimentos Imobiliários"),
    ("RJS UTILIDADES LTDA", "Lojão Total Utilidades"),
    ("SANTA CATARINA BUSINESS LTDA", "Holiday & Business Hotel"),
    ("ATENDE TUDO INDUSTRIAL LTDA", "FAZ TUDO GOIÂNIA"),
])
def test_matches_company_strict_rejeita_palavra_generica_do_lote(empresa, maps_nome):
    assert extract.matches_company_strict(maps_nome, empresa) is False


@pytest.mark.parametrize("empresa,maps_nome", [
    ("SUPERMERCADO UNIAO", "supermercado União"),
    ("BUNGE ALIMENTOS S/A", "Bunge Alimentos"),
    ("AMERICANAS S.A - EM RECUPERACAO JUDICIAL", "Americanas"),
    ("DOCES VOVO ANA", "Laticínio Caminhos Verdes - Doces Vovó Ana"),
])
def test_matches_company_exact_aceita_marca_de_palavra_comum(empresa, maps_nome):
    assert extract.matches_company_exact(maps_nome, empresa) is True


@pytest.mark.parametrize("empresa,maps_nome", [
    ("REAL COMERCIAL LTDA", "Real Color"),
    ("PEGADA ALIMENTOS LTDA", "Pegada Natural"),
    ("SILVA TAVARES LATICINIOS LTDA", "Laticínios Silva"),
    ("MTM COMERCIO DE PRODUTOS ALIMENTICIOS LTDA", "MTM Containers"),
])
def test_matches_company_exact_rejeita_homonimas(empresa, maps_nome):
    assert extract.matches_company_exact(maps_nome, empresa) is False


def test_maps_run_ddd_de_outro_estado_mantem_lugar_so_se_nome_igual(monkeypatch):
    from sources import maps

    class _B:
        def note_if_paused(self, _s):
            return None

    class _R:
        def wait(self, _s):
            return None

    def html(nome, fone):
        return f'<html><body><h1>{nome}</h1><button data-item-id="phone:tel:{fone}" aria-label="Telefone: {fone}"></button></body></html>'

    monkeypatch.setattr(extract, "parse_maps_place", lambda _h, _u: {"nome": maps._T["nome"], "phone": maps._T["fone"], "endereco": None, "website": None, "categoria": None, "nota": None, "avaliacoes": None, "situacao": None, "lista": False})
    monkeypatch.setattr(maps, "_fetch_html", lambda _u: "<html></html>")
    maps._T = {"nome": "Bunge Alimentos", "fone": "11972063752"}
    r = maps.run({"razao_social": "BUNGE ALIMENTOS S/A", "nome_fantasia": None, "uf": "SC"}, "Gaspar", "SC", _B(), _R())
    assert r["ok"] is True and r["phone"] is None and r["maps"]["nome"] == "Bunge Alimentos"
    maps._T = {"nome": "Pegada Natural", "fone": "11956560587"}
    r = maps.run({"razao_social": "PEGADA ALIMENTOS LTDA", "nome_fantasia": None, "uf": "SC"}, "Chapecó", "SC", _B(), _R())
    assert r["ok"] is False and r["note"] == "nenhum resultado compatível"


def test_generic_tokens_da_base_carregados_e_marcas_de_rede_preservadas():
    # Lista gerada da base (generic_tokens.txt) está ativa...
    assert "silva" in extract._GENERIC_NAME_TOKENS
    assert "agropecuaria" in extract._GENERIC_NAME_TOKENS
    # ...mas marcas de rede continuam identificando a empresa.
    assert "atacadao" not in extract._GENERIC_NAME_TOKENS
    assert extract.matches_company_strict(
        "Atacadão Dia a Dia - Goiânia (Jd. Balneário Meia Ponte)", "ATACADAO DIA A DIA S.A"
    )
    assert extract.matches_company_strict("Havan Chapecó", "HAVAN LOJAS DE DEPARTAMENTOS LTDA")
    # Sobrenome comum sozinho não basta.
    assert not extract.matches_company_strict("Mercado Silva", "PADARIA SILVA LTDA")


@pytest.mark.parametrize("empresa,maps_nome", [
    ("QUATRO PATAS", "Quatro Patas Clínica Veterinária"),
    ("PET MANIA", "Pet Mania | Penha | Pet Shop Barbacena"),
])
def test_matches_company_exact_nome_com_acrescimo_do_maps(empresa, maps_nome):
    assert extract.matches_company_exact(maps_nome, empresa) is True


def _est(razao, fantasia=None):
    return {"razao_social": razao, "nome_fantasia": fantasia}


def test_revalidate_maps_avaliar():
    import revalidate_maps as rv

    def res(nome, fone=None):
        return {"maps": {"nome": nome}, "telefones": [{"value": fone, "source": "maps", "url": None}] if fone else []}

    assert rv.avaliar(res("Cooperalfa - São José do Cedro", "4936430300"), _est("COOPERATIVA ALFA", "COOPERALFA"), "SC") == "ok"
    assert rv.avaliar(res("Supermercado Boniatti", "4532481002"), _est("SUPERMERCADO MFB LTDA"), "PR") == "rejeitar"
    assert rv.avaliar(res("Prefeitura Municipal de Santa Lúcia"), _est("GRANDI SERVICOS ADMINISTRATIVOS LTDA"), "PR") == "rejeitar"
    assert rv.avaliar(res("Bunge Alimentos", "11972063752"), _est("BUNGE ALIMENTOS S/A"), "SC") == "tirar_telefone"
    assert rv.avaliar(res("Pegada Natural", "11956560587"), _est("PEGADA ALIMENTOS LTDA"), "SC") == "rejeitar"
    assert rv.avaliar({"maps": None, "telefones": []}, _est("X"), "SC") == "sem_maps"


def test_revalidate_maps_sem_maps_preserva_outras_fontes():
    import revalidate_maps as rv

    r = {"maps": {"nome": "x"}, "telefones": [
        {"value": "4933286292", "source": "maps", "url": None},
        {"value": "4933000000", "source": "site", "url": "http://a"},
    ]}
    novo = rv.sem_maps(r)
    assert novo["maps"] is None
    assert [t["source"] for t in novo["telefones"]] == ["site"]
