import requests
import json

def debug_colors(url):
    print(f"Debugging Color Extraction for: {url}")
    payload = {"url": url}
    try:
        response = requests.post("http://localhost:8000/api/extract", json=payload)
        response.raise_for_status()
        data = response.json()
        characters = data.get("characters", [])
        print(f"Total characters: {len(characters)}")
        for i, char in enumerate(characters[:10]):
            print(f"Character {i+1}: Name='{char.get('name')}', Color='{char.get('color')}'")
    except Exception as e:
        print(f"Error: {e}")

# Test both docs
print("--- Doc 1 ---")
debug_colors("https://docs.google.com/document/d/1JXL6YX0rPmCxNaDH5DdcY6FadyL2pLMJsYtds-Ew1o4/edit?tab=t.0")
print("\n--- Doc 2 ---")
debug_colors("https://docs.google.com/document/d/1gjZpsLzm_sIMEx35Ajv5_5oOF02GZnxk1hDpA48NS-4/edit?tab=t.0")
