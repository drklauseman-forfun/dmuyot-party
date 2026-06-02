import requests
from bs4 import BeautifulSoup
import re
from typing import List, Dict

def parse_characters_with_colors(html: str) -> List[Dict[str, str]]:
    soup = BeautifulSoup(html, 'html.parser')
    characters = []
    
    # Google Docs export html structure:
    # Paragraphs are <p>, names/lines are often inside <span> tags with style="color: #..."
    
    for p in soup.find_all('p'):
        text = p.get_text().strip()
        if not text:
            continue
            
        # Basic line cleaning (same as before)
        match = re.match(r"^(\d+[\.\)]\s*)?(.+)$", text)
        if not match:
            continue
            
        clean_name = match.group(2).strip()
        
        # Try to find color in spans within this paragraph
        color = None
        spans = p.find_all('span')
        for span in spans:
            style = span.get('style', '')
            # Look for color: #123456 or color: rgb(...)
            color_match = re.search(r'color:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))', style)
            if color_match:
                color = color_match.group(1)
                break # Take the first color found in the line
        
        characters.append({
            "name": clean_name,
            "color": color or "#ffffff" # Default to white if no color found
        })
        
    return characters

# Mock HTML for testing
test_html = """
<p><span style="color: #ff0000;">1. Red Character</span></p>
<p><span style="color: #00ff00;">2. Green Character</span></p>
<p>3. Normal Character</p>
<p><span style="color: rgb(0, 0, 255);">4. Blue Character</span></p>
"""

print(parse_characters_with_colors(test_html))
