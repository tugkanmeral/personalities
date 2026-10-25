# PersonaLab — Synthetic Persona Builder & Multi-Agent Decision Arena

A hybrid (`JSON DNA + Compiled Markdown System Prompt`) platform for creating synthetic AI personas with distinct demographic, socio-economic, and psychological (**Big-Five**) backgrounds, and querying multiple personas simultaneously to compare their natural responses, option rankings, and inner monologues.

---

## Architecture

1. **Backend (`backend/` - .NET 10 Web API + MongoDB)**
   - **Data Model (`Models/PersonaModels.cs`):**
     - `Demographics`, `SocioEconomic` (Childhood ages 0-18 financial status $\rightarrow$ Adulthood financial status), `BigFive` (0-100 sliders), `ValuesAndInterests`, and an extensible `CustomFactors` list that requires zero database migrations.
     - All classes carry `[BsonIgnoreExtraElements]` for full backward and forward compatibility in MongoDB.
   - **Externalized Seeds & Prompts (`Seeds/` & `Prompts/`):**
     - `backend/Seeds/seed-personas.json`: Initial seed personas loaded when the database collection is empty.
     - `backend/Seeds/factor-catalog.json`: Configurable catalog of demographic, socio-economic, and extensible factor templates.
     - `backend/Prompts/system-prompt-template.md` & `backend/Prompts/arena-user-prompt-template.md`: External Markdown prompt templates used by `PersonaCompilerService` and `LlmOrchestratorService`.
   - **Hybrid Persona Compiler (`Services/PersonaCompilerService.cs`):**
     - Synthesizes a character's psychological profile (`SynthesizedProfile`) and compiles the Markdown System Prompt (`CompiledSystemPromptMd`).
   - **Multi-Provider LLM Orchestrator (`Services/LlmOrchestratorService.cs`):**
     - Queries all selected personas concurrently (`Task.WhenAll`) using either **Google Gemini API** (`gemini-3.5-flash`) or **Local Ollama** (`hf.co/inclusionAI/Ling-3.0-tiny-GGUF:Q4_K_M`).

2. **Frontend (`frontend/` - React + TypeScript + Vite + Tailwind CSS)**
   - **Multi-Persona Arena:** Select multiple personas and ask open-ended or multiple-choice questions to compare their first-person answers, priority rankings (`1st Choice`, `2nd Choice`), psychological inner monologues, and triggered factors side by side.
   - **Persona Studio:** Adjust demographic, socio-economic, and Big-Five sliders while previewing the live-compiled `.md` System Prompt and `.json` DNA document in real time.

---

## Configuration (`backend/appsettings.json`)

Copy `backend/appsettings.Example.json` to `backend/appsettings.json` and configure your **MongoDB Connection String** and **Google Gemini API Key** / **Ollama** settings:

```json
{
  "MongoDbSettings": {
    "ConnectionString": "mongodb://localhost:27017",
    "DatabaseName": "PersonalitiesDb",
    "PersonasCollectionName": "Personas",
    "ArenaHistoryCollectionName": "ArenaSessions"
  },
  "LlmSettings": {
    "DefaultProvider": "Gemini",
    "Gemini": {
      "ApiKey": "YOUR_GEMINI_API_KEY",
      "DefaultModel": "gemini-3.5-flash"
    },
    "Ollama": {
      "BaseUrl": "http://localhost:11434",
      "DefaultModel": "hf.co/inclusionAI/Ling-3.0-tiny-GGUF:Q4_K_M"
    }
  }
}
```

---

## Running the Project

### 1. Backend (.NET API - Port 5022)
```bash
cd backend
dotnet run
```

### 2. Frontend (React UI - Port 3000)
```bash
cd frontend
npm install
npm run dev
```

### 3. Running Connection Tests
```bash
dotnet test backend.Tests
```

---

## Roadmap & TODOs

- [ ] **Interactive Multi-Persona Group Chat:**
  - Select any combination of personas and start a live, multi-participant group chat where you can converse with them together, address specific characters (`@mention`), and watch them reply both to you and to one another in real time based on their distinct personalities and backgrounds.
- [ ] **Long-Term Episodic Memory (RAG & MongoDB Atlas Vector Search):**
  - Embed and index past Arena responses so personas can recall their previous answers, life events, and evolving opinions across sessions while keeping core identity in the hybrid `JSON DNA + Compiled Markdown` format.
- [ ] **Arena Session History & Diff Viewer:**
  - Add a dedicated UI panel to browse saved `ArenaSessions` from MongoDB, replay past questions, and compare how a persona's response shifts before and after tweaking their developmental or Big-Five factors.
- [ ] **Multi-Turn Persona Debate & Roundtable Mode:**
  - Allow selected personas to see and respond to each other's arguments in a multi-turn discussion to simulate group dynamics, consensus building, and conflict based on Agreeableness, Extraversion, and Openness scores.
- [ ] **AI-Assisted Persona & Cohort Generator:**
  - Generate complete structured `PersonaCharacter` DNA profiles (or balanced demographic cohorts) from a brief natural-language prompt.
- [ ] **Progressive Streaming (SSE) & Automatic Retry Policy:**
  - Stream each persona card's response independently via Server-Sent Events (SSE) as soon as that persona finishes thinking, rather than waiting for `Task.WhenAll`, and add configurable exponential backoff for transient `503` / `429` LLM rate-limit spikes.
- [ ] **Cohort Analytics & Preference Distribution Charts:**
  - Visualize aggregate option rankings, consensus heatmaps, and correlations between socio-economic/Big-Five traits and decision outcomes when querying larger persona pools.
- [ ] **Export & Evaluation Benchmarks:**
  - Export Arena runs and persona cohorts as `JSON`, `CSV`, or `Markdown` reports for external research and product decision analysis.

---

## License

This project is licensed under the **PolyForm Noncommercial License 1.0.0** — see the [LICENSE](LICENSE) file for full details.

- **Personal, Hobbyist, Academic & Educational Use:** You are free to clone, use, modify, and experiment with this project for personal learning, hobby projects, and non-commercial research.
- **No Commercial Use:** Commercial use, paid SaaS/API offerings, or internal business use by for-profit organizations is strictly prohibited without prior written permission from the author.


