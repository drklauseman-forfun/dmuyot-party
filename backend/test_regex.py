import re

def parse_characters(text: str):
    pattern = re.compile(r"^\d+\.\s+(.+)$", re.MULTILINE)
    matches = pattern.findall(text)
    return [name.strip() for name in matches]

test_text = """
Some random text
1. Orion
2. Lyra
3. Cygnus
Other text
4. Draco
"""

print(parse_characters(test_text))
