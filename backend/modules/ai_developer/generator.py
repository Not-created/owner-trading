"""
Safe Development Engine.
Turns natural-language requests into structured change proposals via the AI
Core. Never writes to disk directly — always returns a proposal that must be
sandboxed, validated, and approved.

A proposal contains:
    task_id, kind (create_module | modify_file | refactor | new_feature),
    summary, files [{path, action, content}], tests, rollback, risk
"""
import json
import re

from modules.ai_core.service import chat, get_default_config
from modules.ai_developer import inspector, memory


PROPOSAL_JSON_SCHEMA = """{
  "kind": "modify_file" | "create_module" | "refactor" | "new_feature",
  "summary": "string",
  "files": [
    {"path": "backend/modules/foo/bar.py", "action": "write" | "delete", "content": "string"}
  ],
  "tests": "string describing how to test",
  "rollback": "string describing how to revert",
  "risk": "low" | "medium" | "high"
}"""


DEV_ENG_SYSTEM = f"""You are the Safe Development Engine inside Terminal/Pro.

Your ONLY output is a single JSON object matching this schema:

{PROPOSAL_JSON_SCHEMA}

Rules:
- Output NOTHING except that JSON — no markdown fences, no prose.
- Every path is RELATIVE to /app (e.g. "backend/modules/x/y.py" or "frontend/src/pages/Z.js").
- Preserve backward compatibility. Never remove an existing endpoint unless the Owner explicitly asked for it.
- For "create_module" produce full files under backend/modules/<name>/.
- For "modify_file" return the COMPLETE new content of every file you touch.
- Prefer minimal, surgical edits.
- No secrets, no hardcoded credentials, no eval/exec, no shell=True.
- Use existing framework: FastAPI + Motor + Pydantic v2 + get_current_user dep + AppError.
- Frontend uses React + Tailwind + shadcn + data-testid attributes.
- If the change is impossible or unsafe, return {{"kind": "refactor", "summary": "REJECTED: <reason>", "files": [], "tests": "", "rollback": "", "risk": "high"}}
"""


async def _load_relevant_files(paths: list[str]) -> str:
    """Return concatenated file contents for the AI, safely capped."""
    blocks = []
    total = 0
    for p in paths[:20]:
        try:
            f = inspector.read_file(p)
        except Exception:
            continue
        chunk = f"--- {p} ---\n{f['content']}\n"
        if total + len(chunk) > 40000:
            break
        blocks.append(chunk)
        total += len(chunk)
    return "\n".join(blocks)


async def generate_proposal(user_id: str, request: str, hint_paths: list[str] | None = None) -> dict:
    default = await get_default_config()

    mem = await memory.memory_context()
    arch = await memory.list_architecture(1)
    architecture_ctx = arch[0]["architecture"] if arch else {}

    file_ctx = await _load_relevant_files(hint_paths or [])
    prompt_parts = [
        "# Project memory",
        json.dumps(mem, default=str)[:4000],
        "# Architecture snapshot (partial)",
        json.dumps(architecture_ctx, default=str)[:4000],
    ]
    if file_ctx:
        prompt_parts += ["# Relevant existing files", file_ctx]
    prompt_parts += ["# Owner request", request]
    prompt = "\n\n".join(prompt_parts)

    raw = await chat(
        prompt=prompt,
        provider_id=default["provider"],
        model=default["model"],
        user_id=user_id,
        system=DEV_ENG_SYSTEM,
    )
    text = raw["text"].strip()

    # Strip accidental code fences
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", text).strip()

    try:
        proposal = json.loads(text)
    except Exception:
        # Try to extract the first {...} JSON object
        m = re.search(r"\{[\s\S]*\}", text)
        proposal = json.loads(m.group(0)) if m else {
            "kind": "refactor",
            "summary": "REJECTED: AI response was not valid JSON",
            "files": [], "tests": "", "rollback": "", "risk": "high",
        }

    # Normalise fields
    proposal.setdefault("kind", "modify_file")
    proposal.setdefault("files", [])
    proposal.setdefault("tests", "")
    proposal.setdefault("rollback", "")
    proposal.setdefault("risk", "medium")
    proposal["provider"] = raw.get("provider")
    proposal["model"] = raw.get("model")
    proposal["latency_ms"] = raw.get("latency_ms")
    return proposal
