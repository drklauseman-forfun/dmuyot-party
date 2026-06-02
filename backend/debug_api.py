import requests

def test_extraction(url):
    print(f"Testing URL: {url}")
    payload = {"url": url}
    try:
        response = requests.post("http://localhost:8000/api/extract", json=payload)
        response.raise_for_status()
        characters = response.json().get("characters", [])
        print(f"Total characters found: {len(characters)}")
        for i, name in enumerate(characters[:5]):
            print(f"Result {i+1}: '{name}'")
    except Exception as e:
        print(f"Error: {e}")

# Testing the new doc
test_extraction("https://docs.google.com/document/d/1gjZpsLzm_sIMEx35Ajv5_5oOF02GZnxk1hDpA48NS-4/edit?tab=t.0")
