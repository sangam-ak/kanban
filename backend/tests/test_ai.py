import os

import pytest
from fastapi.testclient import TestClient

from app import ai
from app.main import app


def test_ai_test_requires_login():
    with TestClient(app) as client:
        assert client.post("/api/ai/test").status_code == 401


def test_ai_test_returns_reply(client, monkeypatch):
    prompts = []
    monkeypatch.setattr(ai, "ask", lambda prompt: prompts.append(prompt) or "4")
    response = client.post("/api/ai/test")
    assert response.status_code == 200
    assert response.json() == {"reply": "4"}
    assert prompts == ["What is 2+2?"]


@pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set")
def test_real_openrouter_call():
    assert "4" in ai.ask("What is 2+2? Reply with just the number.")
