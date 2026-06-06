from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import re
from typing import Optional, List, Dict
from bs4 import BeautifulSoup

app = FastAPI()

# Allow CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExtractionRequest(BaseModel):
    text: Optional[str] = None
    url: Optional[str] = None

class ExtractionResponse(BaseModel):
    characters: List[Dict[str, str]]

def extract_doc_id(url: str) -> Optional[str]:
    match = re.search(r"/document/d/([a-zA-Z0-9-_]+)", url)
    return match.group(1) if match else None

def clean_character_name(line: str) -> str:
    name = line.strip()
    
    # 1. Smartly strip leading numbers: e.g. "1. Name", "1) Name", "1 Name"
    # It ensures we don't accidentally strip a character named "11" or "1.5"
    m = re.match(r"^\s*\d+([\.\)\-]\s*|\s+)(.*)$", name)
    if m:
        prefix = m.group(1)
        remainder = m.group(2).strip()
        
        # Prevent stripping decimal numbers like "1.5"
        if prefix in ['.', ')', '-'] and remainder and remainder[0].isdigit():
            pass # Keep it intact
        elif remainder:
            name = remainder
    
    # 2. For the format "Name (Source): Description...", 
    # we only want the "Name (Source)" part.
    if ':' in name:
        name = name.split(':', 1)[0].strip()
        
    return name

def parse_characters_html(html: str) -> List[Dict[str, str]]:
    soup = BeautifulSoup(html, 'html.parser')
    characters = []
    
    # Map CSS classes to colors
    class_colors = {}
    style_tag = soup.find('style')
    if style_tag:
        styles = style_tag.get_text()
        color_defs = re.findall(r'\.(c\d+)\s*\{[^}]*?color:\s*([^;\}]+)', styles, re.IGNORECASE)
        for class_name, color_val in color_defs:
            m = re.search(r'(#[0-9a-fA-F]{3,6}|rgb\s*\([^)]+\)|rgba\s*\([^)]+\))', color_val, re.IGNORECASE)
            if m:
                class_colors[class_name] = m.group(1).strip()

    # We iterate through paragraphs and list items
    for item in soup.find_all(['p', 'li']):
        line = item.get_text().strip()
        if not line:
            continue
            
        # RULE: A character must start with a number in the user's view.
        # 1. Identify if it's part of a bulleted (unordered) list
        is_in_bullet_list = False
        if item.name == 'li':
            parent = item.find_parent(['ol', 'ul'])
            if parent and parent.name == 'ul':
                is_in_bullet_list = True
        elif item.find_parent('ul'):
            is_in_bullet_list = True

        # 2. If it's in a bullet list, it's NEVER a character (user rule)
        if is_in_bullet_list:
            continue

        # 3. Check for starting digit or explicitly numbered list item
        starts_with_digit = bool(re.match(r'^\d', line))
        is_numbered_li = (item.name == 'li') # We already excluded ul items above
        
        if not (starts_with_digit or is_numbered_li):
            continue

        name = clean_character_name(line)
        
        if name:
            color = None
            # Find the color in spans or the item itself
            for span in item.find_all('span'):
                # Try class first
                classes = span.get('class', [])
                for cls in classes:
                    if cls in class_colors:
                        color = class_colors[cls]
                        break
                if color: break
                
                # Try inline style
                style_attr = span.get('style', '')
                m = re.search(r'color:\s*(#[0-9a-fA-F]{3,6}|rgb\s*\([^)]+\))', style_attr, re.IGNORECASE)
                if m:
                    color = m.group(1)
                    break
            
            if not color:
                classes = item.get('class', [])
                for cls in classes:
                    if cls in class_colors:
                        color = class_colors[cls]
                        break
                if not color:
                    style_attr = item.get('style', '')
                    m = re.search(r'color:\s*(#[0-9a-fA-F]{3,6}|rgb\s*\([^)]+\))', style_attr, re.IGNORECASE)
                    if m: color = m.group(1)

            # Readability: Convert black/dark to white for dark theme
            if color:
                c_low = color.lower().replace(' ', '')
                if c_low in ['#000', '#000000', 'black', 'rgb(0,0,0)', 'rgba(0,0,0,1)']:
                    color = "#ffffff"
            
            characters.append({
                "name": name,
                "color": color or "#ffffff"
            })
            
    return characters

def parse_characters_plain(text: str, is_manual_input: bool = False) -> List[Dict[str, str]]:
    lines = text.splitlines()
    characters = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        if not is_manual_input:
            # RULE: must start with a number
            if not re.match(r'^\d', line):
                continue

        name = clean_character_name(line)
        if name:
            characters.append({"name": name, "color": "#ffffff"})
                
    return characters

@app.post("/api/extract", response_model=ExtractionResponse)
async def extract_characters(request: ExtractionRequest):
    characters = []
    
    if request.url:
        doc_id = extract_doc_id(request.url)
        if not doc_id:
            raise HTTPException(status_code=400, detail="Invalid Google Docs URL")
        
        # Try HTML first for colors
        export_url_html = f"https://docs.google.com/document/d/{doc_id}/export?format=html"
        try:
            response = requests.get(export_url_html)
            response.raise_for_status()
            html_content = response.content.decode('utf-8-sig', errors='replace')
            characters = parse_characters_html(html_content)
            
            # Fallback to TXT if HTML is empty (though parse_characters_html is robust now)
            if not characters:
                export_url_txt = f"https://docs.google.com/document/d/{doc_id}/export?format=txt"
                txt_response = requests.get(export_url_txt)
                txt_response.raise_for_status()
                txt_content = txt_response.content.decode('utf-8-sig', errors='replace')
                characters = parse_characters_plain(txt_content, is_manual_input=False)
                
        except requests.RequestException as e:
            try:
                export_url_txt = f"https://docs.google.com/document/d/{doc_id}/export?format=txt"
                txt_response = requests.get(export_url_txt)
                txt_response.raise_for_status()
                txt_content = txt_response.content.decode('utf-8-sig', errors='replace')
                characters = parse_characters_plain(txt_content, is_manual_input=False)
            except Exception:
                raise HTTPException(status_code=400, detail=f"Failed to fetch document: {str(e)}")
    elif request.text:
        characters = parse_characters_plain(request.text, is_manual_input=True)
    else:
        raise HTTPException(status_code=400, detail="Either text or url must be provided")

    return ExtractionResponse(characters=characters)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
