"""Check the intended public source tree without printing matched secret values."""
from pathlib import Path
import argparse
import base64
import json
import re
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
EXCLUDED={".git","node_modules","venv",".venv","__pycache__",".pytest_cache",".pytest_tmp","dist","dist-validation"}

def check(paths):
    problems=[]
    for path in paths:
        rel=path.relative_to(ROOT)
        name=path.name
        if any(part in EXCLUDED for part in rel.parts):
            problems.append(f"Generated/private directory tracked: {rel}")
            continue
        if name in {"env.local",".envrc"} or (name.startswith(".env") and name!=".env.example"):
            problems.append(f"Local environment tracked: {rel}")
        if path.suffix.lower() in {".db",".sqlite",".sqlite3",".tif",".tiff",".zip",".pyc"}:
            problems.append(f"Local data/binary archive tracked: {rel}")
        if not path.is_file(): continue
        if path.stat().st_size>2_000_000: problems.append(f"Review oversized source: {rel}")
        if path.suffix.lower() in {".png",".ico"}: continue
        text=path.read_text(encoding="utf-8-sig",errors="replace")
        patterns=[r"sb_secret_[A-Za-z0-9_-]{20,}",r"gh[pousr]_[A-Za-z0-9]{25,}",r"og_[A-Za-z0-9_-]{20,}"]
        if any(re.search(pattern,text) for pattern in patterns): problems.append(f"Possible private credential in {rel}")
        for token in re.findall(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",text):
            try:
                segment=token.split('.')[1]
                payload=json.loads(base64.urlsafe_b64decode(segment+'='*(-len(segment)%4)))
                if payload.get('role')=='service_role': problems.append(f"Privileged JWT in {rel}")
            except (ValueError,TypeError): pass
        if any(line.startswith("-----BEGIN ") and "PRIVATE KEY-----" in line for line in text.splitlines()):
            problems.append(f"Private key in {rel}")
    return problems

if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--tracked",action="store_true");args=parser.parse_args()
    if args.tracked:
        data=subprocess.check_output(["git","ls-files","-z"],cwd=ROOT)
        paths=[ROOT/p for p in data.decode().split("\0") if p]
    else:
        paths=[p for p in ROOT.rglob("*") if p.is_file() and not any(x in EXCLUDED for x in p.relative_to(ROOT).parts)]
    errors=check(paths)
    for error in errors: print(error)
    print(f"Public source check: {len(paths)} files, {len(errors)} issues")
    sys.exit(bool(errors))
