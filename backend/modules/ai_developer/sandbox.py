"""
Sandbox Engine.
Materialises a proposed change set into an isolated workspace under
`/app/.sandbox/{task_id}/` and runs the validator against it. The production
project is never touched.

The sandbox is a *thin* copy: only the files referenced by the change set
(plus critical roots like backend/, memory/) are hard-linked or copied.
"""
import shutil
import uuid
from pathlib import Path

from modules.ai_developer.inspector import APP_ROOT, ALLOWED_ROOTS, _resolve
from modules.ai_developer import validator


SANDBOX_ROOT = Path("/app/.sandbox")


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _read_original(path_rel: str) -> str | None:
    p = _resolve(path_rel)
    if not p or not p.exists() or not p.is_file():
        return None
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None


def prepare(files: dict[str, str]) -> dict:
    """
    files: mapping of path (relative to /app) -> proposed content.
    Returns: {sandbox_id, path, before, after}
    """
    SANDBOX_ROOT.mkdir(parents=True, exist_ok=True)
    sandbox_id = _new_id()
    root = SANDBOX_ROOT / sandbox_id
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True)

    # Copy the whole backend/ tree so imports resolve during validation. This
    # is O(a few MB) so it stays fast. Only backend + memory + frontend/src.
    for rel in ("backend", "frontend/src", "memory"):
        src = APP_ROOT / rel
        if src.exists():
            shutil.copytree(src, root / rel, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "node_modules", ".venv"))

    # Write proposed changes on top
    before: dict[str, str] = {}
    after: dict[str, str] = {}
    for rel_path, new_content in files.items():
        # Validate path is inside allowed roots (reuse inspector resolver)
        p = _resolve(rel_path)
        if p is None:
            raise PermissionError(f"path not permitted: {rel_path}")
        # Path inside sandbox
        sandbox_target = root / p.relative_to(APP_ROOT)
        sandbox_target.parent.mkdir(parents=True, exist_ok=True)
        existing = _read_original(rel_path) or ""
        before[rel_path] = existing
        after[rel_path] = new_content
        sandbox_target.write_text(new_content, encoding="utf-8")

    return {"sandbox_id": sandbox_id, "path": str(root), "before": before, "after": after}


def validate(files: dict[str, str]) -> dict:
    """Prepare a sandbox, run the validator, return combined report."""
    sb = prepare(files)
    report = validator.run_all(
        before=sb["before"],
        after=sb["after"],
        sandbox_root=Path(sb["path"]),
    )
    return {
        "sandbox_id": sb["sandbox_id"],
        "sandbox_path": sb["path"],
        "validation": report,
    }


def cleanup(sandbox_id: str) -> bool:
    p = SANDBOX_ROOT / sandbox_id
    if p.exists():
        shutil.rmtree(p, ignore_errors=True)
        return True
    return False
