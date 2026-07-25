"""Minimal OpenRouter/Perplexity caller — no litellm, stdlib only.

Skipped litellm: it's a multi-provider proxy library pulled in for one HTTP POST,
and its build failed here needing a Rust toolchain for a transitive dep. urllib
does the same call in ~15 lines. Add litellm back only if you need its
multi-provider routing/fallback features, not just OpenRouter.

Usage:
    $env:OPENROUTER_API_KEY = "sk-or-v1-..."
    python perplexity_query.py "your question here"
"""
import json
import os
import sys
import urllib.request

MODEL = "perplexity/sonar-pro"
URL = "https://openrouter.ai/api/v1/chat/completions"


def ask(query: str, model: str = MODEL) -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise SystemExit("OPENROUTER_API_KEY not set in this session's environment.")

    body = json.dumps({"model": model, "messages": [{"role": "user", "content": query}]}).encode()
    req = urllib.request.Request(
        URL,
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)
    return data["choices"][0]["message"]["content"]


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: python perplexity_query.py \"query\"")
    print(ask(sys.argv[1]))
