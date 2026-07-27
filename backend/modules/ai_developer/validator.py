"""
Safe Validation Engine.
Runs a battery of checks on a proposed change set. Every check returns a
structured result; a change is only safe when every check passes or is
explicitly acknowledged by the Owner.
"""
import ast
import re
import subprocess
from pathlib import Path
from typing import Iterable


CheckResult = dict


def check_python_syntax(files: dict[str, str]) -> CheckResult:
    """files: {relative_path: new_content}. Any .py file must parse."""
    problems = []
    for path, content in files.items():
        if not path.endswith(".py"):
            continue
        try:
            ast.parse(content, filename=path)
        except SyntaxError as e:
            problems.append({"path": path, "line": e.lineno or 0, "detail": e.msg})
    return {"name": "python_syntax", "ok": not problems, "problems": problems}


def check_forbidden_patterns(files: dict[str, str]) -> CheckResult:
    """Reject changes that introduce clearly unsafe patterns."""
    patterns = [
        ("hardcoded_secret", r"(secret|password|token|api[_-]?key)\s*=\s*[\"'][A-Za-z0-9_\-\.]{16,}[\"']"),
        ("eval_use",         r"\beval\s*\("),
        ("exec_use",         r"\bexec\s*\("),
        ("shell_true",       r"subprocess\.[a-zA-Z_]+\([^)]*shell\s*=\s*True"),
        ("os_system",        r"\bos\.system\s*\("),
    ]
    problems = []
    for path, content in files.items():
        for name, patt in patterns:
            for m in re.finditer(patt, content):
                line = content[:m.start()].count("\n") + 1
                problems.append({"path": path, "line": line, "kind": name})
    return {"name": "forbidden_patterns", "ok": not problems, "problems": problems}


def check_breaking_endpoints(before: dict[str, str], after: dict[str, str]) -> CheckResult:
    """Every endpoint present in `before` must remain in `after` (paths only added)."""
    def collect(sources: dict[str, str]) -> set[str]:
        eps: set[str] = set()
        for path, content in sources.items():
            if not path.endswith(".py"):
                continue
            for m, p in re.findall(r'@router\.(get|post|put|patch|delete)\("([^"]+)"', content):
                eps.add(f"{m.upper()} {p}")
        return eps

    before_eps = collect(before)
    after_eps = collect(after)
    removed = sorted(before_eps - after_eps)
    added = sorted(after_eps - before_eps)
    return {
        "name": "breaking_endpoints",
        "ok": not removed,
        "removed": removed,
        "added": added,
    }


def check_ruff(sandbox_root: Path, files: Iterable[str]) -> CheckResult:
    """Run ruff on the sandbox copies. ruff is already installed in this env."""
    py_files = [str(sandbox_root / f) for f in files if f.endswith(".py")]
    if not py_files:
        return {"name": "ruff", "ok": True, "output": "no python files"}
    try:
        proc = subprocess.run(
            ["ruff", "check", "--select", "E,F", "--no-cache", *py_files],
            capture_output=True, text=True, timeout=30,
        )
        return {
            "name": "ruff",
            "ok": proc.returncode == 0,
            "output": (proc.stdout + proc.stderr).strip()[:4000],
        }
    except FileNotFoundError:
        return {"name": "ruff", "ok": True, "output": "ruff not available (skipped)"}
    except Exception as e:
        return {"name": "ruff", "ok": False, "output": str(e)[:500]}


def check_pytest(sandbox_root: Path) -> CheckResult:
    """Run pytest inside the sandbox if a tests/ folder exists. Best-effort."""
    tests_dir = sandbox_root / "backend" / "tests"
    if not tests_dir.exists():
        return {"name": "pytest", "ok": True, "output": "no tests present"}
    try:
        proc = subprocess.run(
            ["python", "-m", "pytest", "-x", "-q", "--no-header", "--disable-warnings", str(tests_dir)],
            capture_output=True, text=True, timeout=60, cwd=str(sandbox_root / "backend"),
        )
        return {
            "name": "pytest",
            "ok": proc.returncode == 0,
            "output": (proc.stdout + proc.stderr).strip()[:4000],
        }
    except Exception as e:
        return {"name": "pytest", "ok": False, "output": str(e)[:500]}


def run_all(
    *,
    before: dict[str, str],
    after: dict[str, str],
    sandbox_root: Path | None = None,
) -> dict:
    checks: list[CheckResult] = []
    checks.append(check_python_syntax(after))
    checks.append(check_forbidden_patterns(after))
    checks.append(check_breaking_endpoints(before, after))
    if sandbox_root is not None:
        checks.append(check_ruff(sandbox_root, after.keys()))
        checks.append(check_pytest(sandbox_root))
    return {"ok": all(c["ok"] for c in checks), "checks": checks}
