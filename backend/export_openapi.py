"""Write the API's OpenAPI schema to frontend/src/api/openapi.json.

The frontend's types (frontend/src/api/schema.d.ts) are generated from that
file by `npm run gen:api`, so a change to schemas.py or to a route reaches
the frontend as a type error instead of a field silently missing on one side.

    python export_openapi.py          # rewrite the file
    python export_openapi.py --check  # exit 1 if the committed file is stale (CI)

Importing `main` builds the app without starting it, so no database is touched.
"""
import json
import sys
from pathlib import Path

from main import app

OUTPUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "api" / "openapi.json"


def render() -> str:
    return json.dumps(app.openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    text = render()
    if "--check" in argv:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        if current != text:
            print(
                f"{OUTPUT} is out of date with the backend. Run `python export_openapi.py` "
                "in backend/, then `npm run gen:api` in frontend/, and commit both files.",
                file=sys.stderr,
            )
            return 1
        print(f"{OUTPUT.name} is up to date.")
        return 0
    OUTPUT.write_text(text, encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
