"""Server-only access to the legacy academic API; not resident authentication."""
import os
import secrets
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)

def require_admin(credentials: HTTPAuthorizationCredentials = Security(bearer)):
    expected = os.getenv("LEGACY_ADMIN_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Operação administrativa desabilitada.")
    if not credentials or not secrets.compare_digest(credentials.credentials.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Autenticação administrativa obrigatória.", headers={"WWW-Authenticate": "Bearer"})
