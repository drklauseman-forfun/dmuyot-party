"""Characterisation tests for the document parser.

Every test here pins a rule the product actually depends on. If one of these
fails, the extraction behaviour changed — that is a regression, not a test that
needs updating.
"""

import pytest
import requests
from fastapi import HTTPException

import main
from main import clean_character_name, parse_characters_html, parse_characters_plain


def names(html: str) -> list[str]:
    return [c["name"] for c in parse_characters_html(html)]


def colors(html: str) -> list[str]:
    return [c["color"] for c in parse_characters_html(html)]


# --- RULE: only numbered lines are characters -------------------------------


def test_plain_paragraph_starting_with_digit_is_a_character():
    assert names('<p>1. Aragorn</p>') == ['Aragorn']


def test_paragraph_not_starting_with_a_digit_is_ignored():
    assert names('<p>Just a heading</p><p>1. Real</p>') == ['Real']


def test_ordered_list_item_is_a_character_without_a_typed_number():
    """Docs renders <ol> numbering via CSS, so the text carries no digit."""
    html = '<ol><li><p>Gandalf</p></li><li><p>Frodo</p></li></ol>'
    assert names(html) == ['Gandalf', 'Frodo']


def test_bulleted_list_is_never_a_character():
    assert names('<ul><li><p>1. Sauron</p></li></ul>') == []


def test_bulleted_list_is_excluded_even_when_nested_in_an_ordered_list():
    html = '<ol><li><p>Keeper</p><ul><li><p>2. Minion</p></li></ul></li></ol>'
    assert 'Minion' not in names(html)


def test_empty_lines_are_skipped():
    assert names('<p></p><p>   </p><p>1. Real</p>') == ['Real']


# --- RULE: "Name (Source): description" keeps only the part before the colon -


def test_colon_description_is_stripped_but_parenthetical_source_is_kept():
    html = '<p>7. Aragorn (LOTR): the ranger of the north</p>'
    assert names(html) == ['Aragorn (LOTR)']


def test_only_the_first_colon_splits():
    assert names('<p>2. Name: desc: more</p>') == ['Name']


# --- RULE: stripping the leading number must not mangle decimals ------------


def test_bare_decimal_name_survives_intact():
    assert clean_character_name('1.5') == '1.5'


def test_decimal_name_with_trailing_words_survives_intact():
    assert clean_character_name('1.5 Halfling') == '1.5 Halfling'


def test_numbered_entry_whose_name_is_a_decimal_keeps_the_decimal():
    assert clean_character_name('12. 1.5') == '1.5'


def test_bare_integer_name_survives():
    assert clean_character_name('11') == '11'


def test_name_beginning_with_a_digit_survives_the_strip():
    assert clean_character_name('1. 2nd Ranger') == '2nd Ranger'
    assert clean_character_name('4. 007 Bond') == '007 Bond'


@pytest.mark.parametrize(
    'line,expected',
    [
        ('1. Gandalf', 'Gandalf'),
        ('1) Gandalf', 'Gandalf'),
        ('1 Gandalf', 'Gandalf'),
        ('1-Sam', 'Sam'),
        ('001. Bob', 'Bob'),
        ('5.  Spaced', 'Spaced'),
    ],
)
def test_common_numbering_styles_are_stripped(line, expected):
    assert clean_character_name(line) == expected


def test_hebrew_names_are_untouched():
    assert clean_character_name('דיבי') == 'דיבי'
    assert clean_character_name('3. דיבי הרשע') == 'דיבי הרשע'


# --- RULE: black text becomes white for the dark theme ----------------------


@pytest.mark.parametrize('black', ['#000000', '#000', 'rgb(0, 0, 0)', 'rgb(0,0,0)'])
def test_black_is_converted_to_white(black):
    html = f'<p><span style="color: {black}">5. Boromir</span></p>'
    assert colors(html) == ['#ffffff']


def test_black_from_a_stylesheet_class_is_converted_to_white():
    html = '<style>.c3{color:#000000}</style><p class="c3">5. Boromir</p>'
    assert colors(html) == ['#ffffff']


def test_a_non_black_colour_is_preserved():
    html = '<style>.c4{color:#ff0000}</style><p><span class="c4">6. Merry</span></p>'
    assert colors(html) == ['#ff0000']


def test_rgb_colour_is_preserved():
    html = '<p><span style="color: rgb(0, 0, 255)">7. Pippin</span></p>'
    assert colors(html) == ['rgb(0, 0, 255)']


def test_missing_colour_defaults_to_white():
    assert colors('<p>1. Aragorn</p>') == ['#ffffff']


def test_span_colour_takes_precedence_over_the_paragraph():
    html = (
        '<style>.c1{color:#111111}.c2{color:#22ff22}</style>'
        '<p class="c1"><span class="c2">1. Legolas</span></p>'
    )
    assert colors(html) == ['#22ff22']


def test_stylesheet_classes_outside_the_cN_convention_are_ignored():
    """Only Google's own `.c0`, `.c1`… naming is understood.

    Not a defect — it is what Docs emits — but it means an export with a
    different class scheme degrades to white rather than failing loudly.
    """
    html = '<style>.custom{color:#ff0000}</style><p class="custom">1. Legolas</p>'
    assert colors(html) == ['#ffffff']


# --- Plain-text parsing -----------------------------------------------------


def test_plain_text_from_a_document_keeps_only_numbered_lines():
    text = 'Heading\n1. Aragorn\nnot a character\n2. Legolas\n'
    result = parse_characters_plain(text, is_manual_input=False)
    assert [c['name'] for c in result] == ['Aragorn', 'Legolas']


def test_manual_input_accepts_every_non_empty_line():
    """Pasted text is taken at face value — the numbering rule is doc-only."""
    text = 'Aragorn\n\nLegolas\n'
    result = parse_characters_plain(text, is_manual_input=True)
    assert [c['name'] for c in result] == ['Aragorn', 'Legolas']


def test_plain_text_characters_default_to_white():
    result = parse_characters_plain('1. Aragorn', is_manual_input=False)
    assert result == [{'name': 'Aragorn', 'color': '#ffffff'}]


# --- Ordering ---------------------------------------------------------------


def test_document_order_is_preserved():
    """originalIndex is assigned from this order and is the app's identity."""
    html = '<p>1. A</p><p>2. B</p><p>3. C</p>'
    assert names(html) == ['A', 'B', 'C']


# --- Document fetching: which export wins, and what happens when one fails ---


class _Boom(requests.RequestException):
    def __str__(self):
        return 'boom'


def _stub_exports(monkeypatch, **bodies):
    """Replace the network with a {format: body-or-exception} lookup."""
    calls = []

    def fake(doc_id, fmt):
        calls.append(fmt)
        body = bodies[fmt]
        if isinstance(body, Exception):
            raise body
        return body

    monkeypatch.setattr(main, 'fetch_export', fake)
    return calls


def test_html_export_is_preferred_and_short_circuits_the_txt_fallback(monkeypatch):
    calls = _stub_exports(monkeypatch, html='<p>1. Aragorn</p>', txt='1. Wrong')
    result = main.fetch_characters_from_doc('doc')
    assert [c['name'] for c in result] == ['Aragorn']
    assert calls == ['html']


def test_txt_export_is_used_when_the_html_export_fails(monkeypatch):
    calls = _stub_exports(monkeypatch, html=_Boom(), txt='1. Aragorn')
    result = main.fetch_characters_from_doc('doc')
    assert [c['name'] for c in result] == ['Aragorn']
    assert calls == ['html', 'txt']


def test_txt_export_is_used_when_the_html_export_yields_nothing(monkeypatch):
    calls = _stub_exports(monkeypatch, html='<p>no characters here</p>', txt='1. Aragorn')
    result = main.fetch_characters_from_doc('doc')
    assert [c['name'] for c in result] == ['Aragorn']
    assert calls == ['html', 'txt']


def test_an_inaccessible_document_raises_a_400(monkeypatch):
    """Google answers 404 for both private and nonexistent docs."""
    _stub_exports(monkeypatch, html=_Boom(), txt=_Boom())
    with pytest.raises(HTTPException) as excinfo:
        main.fetch_characters_from_doc('doc')
    assert excinfo.value.status_code == 400
    assert 'boom' in excinfo.value.detail


def test_both_exports_empty_is_an_empty_list_not_an_error(monkeypatch):
    _stub_exports(monkeypatch, html='<p>nothing</p>', txt='nothing')
    assert main.fetch_characters_from_doc('doc') == []


def test_outbound_requests_carry_a_timeout(monkeypatch):
    """Without one, a hung Google response holds a worker indefinitely."""
    seen = {}

    class _Response:
        content = b'<p>1. Aragorn</p>'

        def raise_for_status(self):
            pass

    def fake_get(url, **kwargs):
        seen.update(kwargs)
        return _Response()

    monkeypatch.setattr(main.requests, 'get', fake_get)
    main.fetch_export('doc', 'html')
    assert seen.get('timeout')


# --- URL parsing ------------------------------------------------------------


def test_document_id_is_extracted_from_a_share_url():
    url = 'https://docs.google.com/document/d/1AbC-dEf_123/edit?tab=t.0'
    assert main.extract_doc_id(url) == '1AbC-dEf_123'


def test_a_url_without_a_document_id_is_rejected():
    assert main.extract_doc_id('https://example.com/nope') is None
