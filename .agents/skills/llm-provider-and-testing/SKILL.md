---
name: llm-provider-and-testing
description: >-
  Use this skill when modifying LLM calls, updating Google Gemini or Ollama
  integration, editing prompt templates in backend/Prompts/, debugging LLM
  timeouts/errors, or running connection tests in backend.Tests for PersonaLab.
---

# LLM Provider & Connection Testing Skill

This skill defines the workflow and technical constraints for maintaining and testing the LLM orchestration layer (`backend/Services/LlmOrchestratorService.cs`) and external prompt templates (`backend/Prompts/`) in **PersonaLab**.

---

## Mandatory Guardrails

1. **Never Write Keyword Fallback Simulators:**
   - Do **NOT** add `if/else` keyword checks (`question.Contains(...)`) or mock/simulated persona answers when an LLM call fails. If an LLM provider is unreachable, return the clear connection error so the issue is visible.
2. **Keep Prompts Externalized in `backend/Prompts/`:**
   - Do **NOT** embed system prompt or user prompt directives inside C# code.
   - Edit `backend/Prompts/system-prompt-template.md` for character identity compilation and `backend/Prompts/arena-user-prompt-template.md` for Arena question/option evaluation.
3. **Never Overwrite `backend/appsettings.json`:**
   - `backend/appsettings.json` contains live user credentials (MongoDB Atlas URI and Gemini API Key) and is ignored by Git.
   - Read it only when necessary; if adding new configuration keys, document them in `backend/appsettings.Example.json`.
4. **Preserve macOS .NET 10 TLS 1.2 + HTTP/1.1 Settings for Gemini:**
   - On macOS, `.NET 10` `SocketsHttpHandler` hangs at `SslStream.EnsureFullTlsFrameAsync` when negotiating TLS 1.3 / HTTP/2 with `generativelanguage.googleapis.com`.
   - Always keep `EnabledSslProtocols = SslProtocols.Tls12` on the `SocketsHttpHandler` in `backend/Program.cs` and `Version = HttpVersion.Version11` on `HttpRequestMessage` in `backend/Services/LlmOrchestratorService.cs`.
   - Note: With `AQ.Ab8...` keys on `generativelanguage.googleapis.com`, `gemini-3.5-flash` (and `gemini-3.5-flash-lite` / `gemini-flash-latest`) responds with `200 OK`, whereas `gemini-3.8-flash` may stall on Google's backend.

---

## Testing Workflow (`backend.Tests`)

Whenever you change `LlmOrchestratorService.cs`, endpoint URLs, or payload formatting, verify connectivity using the xUnit test project (`backend.Tests/UnitTest1.cs`) before asking the user to test in the UI:

1. **Run the Gemini Connection Test:**
   ```bash
   dotnet test backend.Tests --logger "console;verbosity=detailed"
   ```
   *(Note: Requires network access / `BypassSandbox: true` to reach `generativelanguage.googleapis.com`.)*

2. **What the Test Verifies:**
   - Loads `LlmSettings` from `backend/appsettings.json`.
   - Sends a minimal `"hello"` prompt to Gemini using `SslProtocols.Tls12` and `HttpVersion.Version11`.
   - Logs the exact response time (ms), HTTP status code, and model reply.

3. **Testing Local Ollama (`hf.co/inclusionAI/Ling-3.0-tiny-GGUF:Q4_K_M`):**
   - Local Ollama runs at `http://localhost:11434/api/chat`.
   - Small quantized models (`tiny-GGUF:Q4_K_M`) may occasionally output `<think>...</think>` tags or non-strict JSON; `ParseStructuredLlmOutput` in `LlmOrchestratorService.cs` extracts `<think>` blocks into `InnerMonologue` and safely parses JSON blocks via `ExtractJsonObject`. Keep this parser resilient.
