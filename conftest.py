"""Every pytest invocation uses a disposable database, independent of local .env."""
import os
import tempfile
from pathlib import Path

_temporary_root=Path(__file__).resolve().parent/".pytest_tmp"
_temporary_root.mkdir(exist_ok=True)
_test_dir=tempfile.mkdtemp(prefix="run-",dir=_temporary_root)
os.environ["ENABLE_POSTGRES"]="false"
os.environ["FALLBACK_SQLITE_PATH"]=str(Path(_test_dir)/"test.db")
os.environ["LEGACY_SEED_DEMO"]="true"
