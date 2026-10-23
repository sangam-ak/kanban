import os
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from openai import LengthFinishReasonError

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


def test_chat_returns_none_when_output_is_cut_off(monkeypatch):
    def parse(**kwargs):
        raise LengthFinishReasonError(completion=SimpleNamespace(usage=None))

    fake_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(parse=parse)))
    monkeypatch.setattr(ai, "client", lambda: fake_client)
    assert ai.chat([{"role": "user", "content": "Hi"}]) is None


@pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set")
def test_real_openrouter_call():
    assert "4" in ai.ask("What is 2+2? Reply with just the number.")
