"""
AI Developer — Project inspector.
Read-only scanner over the project tree. Safe path validation.
Never touches secrets, .env, node_modules, .git, __pycache__, build artefacts.
"""
import os
import re
from pathlib import Path


def _resolve_app_root() -> Path:
    candidates = [Path("/app")]
    current = Path(__file__).resolve()
    candidates.extend(current.parents[:6])
    for candidate in candidates:
        if candidate.exists() and (candidate / "backend").exists() and (candidate / "frontend").exists() and (candidate / "memory").exists():
            return candidate.resolve()
    return Path("/app")


APP_ROOT = _resolve_app_root()

ALLOWED_ROOTS = [
    APP_ROOT / "backend",
    APP_ROOT / "frontend" / "src",
    APP_ROOT / "memory",
]

# Files or directories that must never be read
BLOCK_NAMES = {
    ".env", ".env.local", ".env.production",
    "node_modules", ".git", "__pycache__", ".venv",
    "build", "dist", ".next", ".cache", ".pytest_cache",
}
BLOCK_EXT = {".pyc", ".pyo", ".so", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff", ".woff2", ".ttf"}
MAX_FILE_BYTES = 200_000  # 200 KB safety cap


def _resolve(path_str: str) -> Path | None:
    """Resolve a relative path against APP_ROOT and enforce allow-list."""
    try:
        p = (APP_ROOT / path_str.lstrip("/")).resolve()
    except Exception:
        return None
    if any(part in BLOCK_NAMES for part in p.parts):
        return None
    if not any(str(p).startswith(str(root.resolve())) for root in ALLOWED_ROOTS):
        return None
    return p


def project_map() -> dict:
    """Compact tree of the allowed roots — file counts, sizes, folder structure."""
    tree: dict = {}
    for root in ALLOWED_ROOTS:
        if not root.exists():
            continue
        node: dict = {"type": "dir", "children": {}}
        _walk_into(root, node, depth=0)
        tree[root.relative_to(APP_ROOT).as_posix()] = node
    return {"root": "/app", "tree": tree}


def _walk_into(dir_path: Path, node: dict, depth: int) -> None:
    if depth > 5:
        return
    try:
        entries = sorted(dir_path.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
    except Exception:
        return
    for entry in entries:
        if entry.name in BLOCK_NAMES:
            continue
        if entry.suffix in BLOCK_EXT:
            continue
        if entry.is_dir():
            sub = {"type": "dir", "children": {}}
            _walk_into(entry, sub, depth + 1)
            node["children"][entry.name] = sub
        else:
            try:
                size = entry.stat().st_size
            except Exception:
                size = 0
            node["children"][entry.name] = {"type": "file", "size": size}


def read_file(path_str: str) -> dict:
    p = _resolve(path_str)
    if p is None or not p.exists() or not p.is_file():
        raise FileNotFoundError(path_str)
    if p.suffix in BLOCK_EXT:
        raise PermissionError("blocked file type")
    size = p.stat().st_size
    if size > MAX_FILE_BYTES:
        raise ValueError(f"file too large ({size} bytes > {MAX_FILE_BYTES})")
    text = p.read_text(encoding="utf-8", errors="replace")
    return {
        "path": p.relative_to(APP_ROOT).as_posix(),
        "size": size,
        "language": _language_for(p),
        "content": text,
    }


def _language_for(p: Path) -> str:
    return {
        ".py": "python", ".js": "javascript", ".jsx": "javascript",
        ".ts": "typescript", ".tsx": "typescript",
        ".css": "css", ".md": "markdown", ".json": "json",
        ".txt": "text", ".env": "text",
    }.get(p.suffix, "text")


def modules_inventory() -> list[dict]:
    """Backend module discovery — /app/backend/modules/* directories."""
    mods_dir = APP_ROOT / "backend" / "modules"
    out = []
    for entry in sorted(mods_dir.iterdir()):
        if not entry.is_dir() or entry.name in BLOCK_NAMES or entry.name.startswith("_"):
            continue
        files = []
        endpoints: list[str] = []
        for f in entry.rglob("*.py"):
            if any(x in BLOCK_NAMES for x in f.parts):
                continue
            rel = f.relative_to(APP_ROOT).as_posix()
            files.append(rel)
            try:
                content = f.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            endpoints += re.findall(r'@router\.(get|post|put|patch|delete)\("([^"]+)"', content)
        out.append({
            "module_id": entry.name,
            "files": files,
            "endpoints": [f"{m.upper()} {p}" for m, p in endpoints],
        })
    return out


def dependencies_report() -> dict:
    """Parse requirements.txt + package.json for a snapshot."""
    py: list[str] = []
    req = APP_ROOT / "backend" / "requirements.txt"
    if req.exists():
        for line in req.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                py.append(line)

    node_deps: dict[str, str] = {}
    pkg = APP_ROOT / "frontend" / "package.json"
    if pkg.exists():
        import json
        data = json.loads(pkg.read_text(encoding="utf-8"))
        node_deps = data.get("dependencies", {}) or {}

    return {
        "python": py,
        "node": node_deps,
        "python_count": len(py),
        "node_count": len(node_deps),
    }


def search_code(query: str, max_hits: int = 40) -> list[dict]:
    if not query or len(query) < 2:
        return []
    q = query.lower()
    hits: list[dict] = []
    for root in ALLOWED_ROOTS:
        for f in root.rglob("*"):
            if len(hits) >= max_hits:
                return hits
            if not f.is_file() or f.suffix in BLOCK_EXT:
                continue
            if any(part in BLOCK_NAMES for part in f.parts):
                continue
            try:
                text = f.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            for i, line in enumerate(text.splitlines(), start=1):
                if q in line.lower():
                    hits.append({
                        "path": f.relative_to(APP_ROOT).as_posix(),
                        "line": i,
                        "excerpt": line.strip()[:200],
                    })
                    if len(hits) >= max_hits:
                        return hits
    return hits
