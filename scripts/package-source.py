"""Package reviewable source without build products, dependencies or local vaults."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / "artifacts" / "2fas-desktop-source.zip"
excluded = {".git", "node_modules", "target", "dist", "artifacts"}
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if not path.is_file() or any(part in excluded for part in relative.parts):
            continue
        if path.suffix in {".log", ".tsbuildinfo", ".sqlite3"}:
            continue
        archive.write(path, Path("twofas-desktop") / relative)
with ZipFile(output) as archive:
    if archive.testzip() is not None:
        raise RuntimeError("Source archive validation failed")
    print(f"Packaged {len(archive.namelist())} files: {output}")
