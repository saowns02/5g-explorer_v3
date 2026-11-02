import unicodedata


def search_key(name: str) -> str:
    """Lower case without accents. Same rule as db/load.py and mock.js searchKey()."""
    decomposed = unicodedata.normalize("NFKD", name)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower().strip()


def like_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
