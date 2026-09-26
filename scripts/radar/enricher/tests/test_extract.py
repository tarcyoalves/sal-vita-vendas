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
