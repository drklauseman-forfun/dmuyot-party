import sys
from pathlib import Path

# Tests import the app module directly, so the backend package root has to be
# importable regardless of where pytest was invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
