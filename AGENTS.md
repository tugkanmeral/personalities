# PersonaLab — Agent Architecture & Guardrails (`AGENTS.md`)

This project is a **.NET 10 + MongoDB + React (TypeScript)** simulation and decision arena where synthetic characters (AI Persona Agents) with distinct demographic, socio-economic, and psychological (**Big-Five**) backgrounds respond to questions and rank options from their own authentic perspectives.

Every AI agent working on this repository must strictly adhere to the following rules without exception:

---

## 1. Strictly Prohibited Approaches (Zero Hardcoded Rules & Directives)

1. **No Keyword-Based `if/else` Interception or Mock Simulators:**
   - When generating character responses or ranking options, **NEVER** write keyword-based conditions (such as `if (question.Contains("football"))` or `if (age < 10 && question.Contains("color"))`), rule-based mock simulators (`RuleBasedSimulation`), or static response templates.
   - All reasoning and responses must be produced **100% semantically by the LLM** using the character's compiled system prompt (`CompiledSystemPromptMd`).
2. **No Hardcoded Persona Definitions or Prompt Directives in C# Code:**
   - Do **NOT** hardcode seed personas, prompt directives, or factor catalogs inside C# classes.
   - All initial seed personas must reside in [`backend/Seeds/seed-personas.json`](file:///Users/tugkanmeral/Projects/personalities/backend/Seeds/seed-personas.json).
   - All factor catalog presets must reside in [`backend/Seeds/factor-catalog.json`](file:///Users/tugkanmeral/Projects/personalities/backend/Seeds/factor-catalog.json).
   - All prompt templates must reside in [`backend/Prompts/system-prompt-template.md`](file:///Users/tugkanmeral/Projects/personalities/backend/Prompts/system-prompt-template.md) and [`backend/Prompts/arena-user-prompt-template.md`](file:///Users/tugkanmeral/Projects/personalities/backend/Prompts/arena-user-prompt-template.md).
3. **No Answer-Spoiling Hints in Persona Definitions:**
   - Never add instructions to a persona definition that pre-script answers to specific test questions (e.g., *"If asked X, answer Y"* or *"Rank Technology 1st and MotoGP 2nd"*).
   - Provide only authentic developmental factors (Age, Education Field, Childhood $\rightarrow$ Adulthood Financial Status, Profession, Big-Five scores, Interests) and let the LLM infer the behavior.
4. **Never Overwrite `backend/appsettings.json`:**
   - `backend/appsettings.json` contains the user's live **MongoDB Atlas Connection String** and **Google Gemini API Key** and is tracked in `.gitignore`.
   - **NEVER** overwrite or reset `backend/appsettings.json` using `write_file` (`Overwrite: true`). If a new configuration key is introduced, update [`backend/appsettings.Example.json`](file:///Users/tugkanmeral/Projects/personalities/backend/appsettings.Example.json) instead.
5. **100% English Codebase & UI:**
   - All source code, comments, UI labels, prompt templates, seed files, and documentation in this repository must be written in English.

---

## 2. Architectural Principles

1. **Hybrid Character Output (`JSON DNA` + `Compiled Markdown System Prompt`):**
   - Each character is stored in the MongoDB `Personas` collection as a `PersonaCharacter` document.
   - Whenever a character is created or updated, `PersonaCompilerService` compiles:
     1. `SynthesizedProfile` (Developmental summary, financial trajectory psychology, Big-Five cognitive decision filter, linguistic tone)
     2. `CompiledSystemPromptMd` (The Markdown identity card loaded from `backend/Prompts/system-prompt-template.md` and passed to the LLM as the `system` instruction).
2. **Schema Extensibility & Backward Compatibility:**
   - Preserve `[BsonIgnoreExtraElements]` on all MongoDB model classes (`backend/Models/PersonaModels.cs`).
   - When introducing new character factors, use `CustomFactors` (`List<CustomFactor>`) or extend `backend/Seeds/factor-catalog.json` so existing MongoDB documents never break.
3. **Long-Term Memory (RAG / Embeddings) Boundary:**
   - Embeddings are not used to define a character's core identity (identity uses the hybrid `JSON + Markdown` structure). Embeddings / Vector Search should only be added in the future when characters need to recall past conversation history (Long-Term Memory) via MongoDB Atlas Vector Search.

---

## 3. Technical & Platform Rules (.NET & React)

1. **macOS .NET 10 Gemini API TLS / HTTP Rules:**
   - On macOS, `.NET 10` `SocketsHttpHandler` stalls for 100 seconds at `SslStream.EnsureFullTlsFrameAsync` when negotiating TLS 1.3 and HTTP/2 multiplexing with `generativelanguage.googleapis.com`.
   - Always keep `EnabledSslProtocols = SslProtocols.Tls12` and `HttpVersion.Version11` enabled in `Program.cs` and `LlmOrchestratorService.cs`.
   - The verified default Gemini model is `gemini-3.5-flash` (tested via `backend.Tests`), and the local Ollama model is `hf.co/inclusionAI/Ling-3.0-tiny-GGUF:Q4_K_M`.
2. **LLM Connection Tests (`backend.Tests`):**
   - Whenever modifying the LLM orchestrator or endpoint configuration, run `dotnet test backend.Tests` (`GeminiConnectionTests`) to verify connectivity before testing in the UI.
3. **UI Render & Performance Rules (`frontend/`):**
   - The `/api/personas/preview-compile` effect in `App.tsx` must only run when `activeTab === 'studio'` is active, preventing unnecessary background compilation calls or render loops while in the Arena view.
