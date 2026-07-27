"""
Project Intelligence Engine.
Static analyses over the codebase — architecture graph, duplicates, security,
performance hints. Purely read-only; produces JSON reports.
"""
import ast
import hashlib
import re
from collections import defaultdict
from pathlib import Path

from modules.ai_developer.inspector import (
    APP_ROOT, ALLOWED_ROOTS, BLOCK_NAMES, BLOCK_EXT, read_file, _resolve,
)


def _iter_source_files():
    for root in ALLOWED_ROOTS:
        if not root.exists():
            continue
        for f in root.rglob("*"):
            if not f.is_file():
                continue
            if f.suffix in BLOCK_EXT or any(p in BLOCK_NAMES for p in f.parts):
                continue
            if f.suffix in (".py", ".js", ".jsx", ".ts", ".tsx"):
                yield f


# ---------- Architecture ----------

def architecture_summary() -> dict:
    """Enumerate modules, files, endpoints, service imports.  A structural overview."""
    mods_dir = APP_ROOT / "backend" / "modules"
    modules = []
    for entry in sorted(mods_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("_"):
            continue
        files: list[str] = []
        endpoints: list[str] = []
        classes: list[str] = []
        functions: list[str] = []
        for f in entry.rglob("*.py"):
            rel = f.relative_to(APP_ROOT).as_posix()
            files.append(rel)
            try:
                text = f.read_text(encoding="utf-8", errors="replace")
                tree = ast.parse(text)
            except Exception:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    classes.append(f"{rel}:{node.name}")
                elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    functions.append(f"{rel}:{node.name}")
            endpoints += [
                f"{m.upper()} {p}" for m, p in re.findall(r'@router\.(get|post|put|patch|delete)\("([^"]+)"', text)
            ]
        modules.append({
            "module_id": entry.name,
            "files": len(files),
            "endpoints": endpoints,
            "classes": len(classes),
            "functions": len(functions),
        })

    # Frontend surface
    fe_root = APP_ROOT / "frontend" / "src"
    fe_pages = sorted(
        (p.relative_to(APP_ROOT).as_posix() for p in fe_root.glob("pages/*.js"))
    )
    fe_components = sum(1 for _ in fe_root.rglob("components/**/*.js"))
    return {
        "backend_modules": modules,
        "backend_module_count": len(modules),
        "backend_endpoint_count": sum(len(m["endpoints"]) for m in modules),
        "frontend_pages": fe_pages,
        "frontend_component_files": fe_components,
    }


# ---------- Module relationships ----------

def module_graph() -> dict:
    """Which backend modules import which."""
    mods_dir = APP_ROOT / "backend" / "modules"
    module_names = [d.name for d in mods_dir.iterdir() if d.is_dir() and not d.name.startswith("_")]
    edges: list[dict] = []
    for mod in module_names:
        for f in (mods_dir / mod).rglob("*.py"):
            try:
                text = f.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            for m in re.finditer(r"from\s+modules\.([a-z_]+)", text):
                target = m.group(1)
                if target != mod and target in module_names:
                    edges.append({"from": mod, "to": target, "in_file": f.relative_to(APP_ROOT).as_posix()})
    unique = list({(e["from"], e["to"]) for e in edges})
    return {"nodes": module_names, "edges": edges, "unique_dependencies": len(unique)}


# ---------- Duplicates ----------

def duplicate_report(min_lines: int = 8) -> dict:
    """Detect duplicate contiguous code blocks across source files."""
    buckets: dict[str, list[dict]] = defaultdict(list)
    for f in _iter_source_files():
        try:
            lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
        except Exception:
            continue
        for i in range(0, max(0, len(lines) - min_lines + 1)):
            block = "\n".join(l.strip() for l in lines[i:i + min_lines] if l.strip())
            if len(block) < 80:
                continue
            h = hashlib.md5(block.encode()).hexdigest()
            buckets[h].append({"path": f.relative_to(APP_ROOT).as_posix(), "line": i + 1})
    dups = []
    for h, locs in buckets.items():
        # Only report locations in *different* files
        unique_files = {l["path"] for l in locs}
        if len(unique_files) > 1:
            dups.append({"hash": h[:12], "locations": locs[:6]})
    dups.sort(key=lambda d: -len(d["locations"]))
    return {"duplicate_blocks": dups[:30], "total": len(dups)}


# ---------- Missing feature heuristics ----------

def missing_features() -> dict:
    """Very high-signal checks that reveal work not yet done."""
    findings = []
    server = APP_ROOT / "backend" / "server.py"
    server_txt = server.read_text(encoding="utf-8", errors="replace") if server.exists() else ""
    # Every module directory should be included as a router if it has a router.py
    for d in (APP_ROOT / "backend" / "modules").iterdir():
        if not d.is_dir() or d.name.startswith("_"):
            continue
        router_file = d / "router.py"
        if router_file.exists():
            rname = f"{d.name}_router"
            if f"include_router({rname})" not in server_txt and f"import router as {rname}" not in server_txt:
                findings.append({
                    "severity": "medium",
                    "kind": "unwired_router",
                    "detail": f"Module '{d.name}' has router.py but is not included in server.py",
                })
    # TODO / FIXME markers
    for f in _iter_source_files():
        try:
            for i, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                if re.search(r"\b(TODO|FIXME|XXX)\b", line):
                    findings.append({
                        "severity": "low",
                        "kind": "todo_marker",
                        "path": f.relative_to(APP_ROOT).as_posix(),
                        "line": i,
                        "detail": line.strip()[:200],
                    })
        except Exception:
            continue
    return {"findings": findings[:200], "total": len(findings)}


# ---------- Security scan ----------

_SECURITY_PATTERNS: list[tuple[str, str, str]] = [
    ("high",   "hardcoded_secret", r"(secret|password|token|api[_-]?key)\s*=\s*[\"'][A-Za-z0-9_\-\.]{16,}[\"']"),
    ("high",   "eval_use",         r"\beval\s*\("),
    ("high",   "exec_use",         r"\bexec\s*\("),
    ("high",   "shell_true",       r"subprocess\.[a-zA-Z_]+\([^)]*shell\s*=\s*True"),
    ("medium", "insecure_random",  r"random\.(random|choice|randint|shuffle)"),
    ("medium", "cors_wildcard",    r'allow_origins\s*=\s*\[?[\"\']\*[\"\']\]?'),
    ("medium", "sql_string_fmt",   r'\.execute\([^)]*%s[^)]*%'),
]


def security_scan() -> dict:
    hits: list[dict] = []
    for f in _iter_source_files():
        if f.suffix not in (".py", ".js", ".jsx"):
            continue
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        rel = f.relative_to(APP_ROOT).as_posix()
        for severity, kind, patt in _SECURITY_PATTERNS:
            for m in re.finditer(patt, text):
                line = text[:m.start()].count("\n") + 1
                hits.append({
                    "severity": severity,
                    "kind": kind,
                    "path": rel,
                    "line": line,
                    "excerpt": text.splitlines()[line - 1].strip()[:200] if line - 1 < len(text.splitlines()) else "",
                })
    return {"hits": hits[:200], "total": len(hits)}


# ---------- Performance hints ----------

_PERF_PATTERNS: list[tuple[str, str]] = [
    ("blocking_in_async",  r"async\s+def[^\n]+\n(?:[^\n]*\n){0,50}?\s+(requests\.|urlopen|time\.sleep|open\s*\()"),
    ("missing_index_hint", r"await\s+db\.[a-z_]+\.find\("),
    ("large_find_no_limit",r"\.find\([^)]*\)\.to_list\(\d{5,}\)"),
    ("nplus1_hint",        r"for [a-zA-Z_]+ in [a-zA-Z_]+:\s*\n\s+await [a-zA-Z_]+\."),
]


def performance_hints() -> dict:
    hits: list[dict] = []
    for f in _iter_source_files():
        if f.suffix != ".py":
            continue
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        rel = f.relative_to(APP_ROOT).as_posix()
        for kind, patt in _PERF_PATTERNS:
            for m in re.finditer(patt, text):
                line = text[:m.start()].count("\n") + 1
                hits.append({
                    "kind": kind,
                    "path": rel,
                    "line": line,
                    "excerpt": text.splitlines()[line - 1].strip()[:200] if line - 1 < len(text.splitlines()) else "",
                })
    return {"hits": hits[:200], "total": len(hits)}


# ---------- Bug heuristics ----------

def bug_hints() -> dict:
    """Fast heuristics — catches common Python & JS mistakes without full type-check."""
    hits: list[dict] = []
    for f in _iter_source_files():
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        rel = f.relative_to(APP_ROOT).as_posix()
        if f.suffix == ".py":
            try:
                ast.parse(text)
            except SyntaxError as e:
                hits.append({"kind": "syntax_error", "path": rel, "line": e.lineno or 0, "excerpt": str(e)})
            # Unused imports skipped — ruff covers it below on demand
        if f.suffix in (".js", ".jsx"):
            for m in re.finditer(r"console\.log\(", text):
                line = text[:m.start()].count("\n") + 1
                hits.append({"kind": "console_log_in_source", "path": rel, "line": line})
    return {"hits": hits[:200], "total": len(hits)}


# ---------- Aggregate report ----------

def full_report() -> dict:
    return {
        "architecture": architecture_summary(),
        "module_graph": module_graph(),
        "duplicates": duplicate_report(),
        "missing": missing_features(),
        "security": security_scan(),
        "performance": performance_hints(),
        "bugs": bug_hints(),
    }
