---
name: extend-persona-factors
description: >-
  Use this skill when adding new character traits, socio-economic/developmental
  factors, psychological sliders, or custom factor templates to PersonaLab across
  the external JSON catalogs, .NET backend, MongoDB schema, PersonaCompilerService,
  and React Studio UI.
---

# Extending Persona Factors Skill

This skill provides the standard workflow for adding new character development factors to **PersonaLab** while preserving backward compatibility in MongoDB, keeping seed/catalog data externalized, and maintaining 100% semantic LLM reasoning.

---

## Decision: Dynamic Template vs. Core Schema Field

Before modifying C# classes, decide which extension mechanism fits the request:

1. **Option A — Dynamic Factor Template (Preferred for domain/lifestyle traits):**
   - If the new factor is a selectable attribute (e.g., *Political Stance*, *Risk Tolerance*, *Media Consumption Habit*, *Childhood Experience*), add an entry to `extensibleFactorTemplates` in `backend/Seeds/factor-catalog.json`.
   - Zero C# schema changes are needed: `PersonaCharacter.CustomFactors` stores it in MongoDB, `PersonaCompilerService` automatically injects it into `backend/Prompts/system-prompt-template.md`, and the React Studio UI renders it automatically as a preset button.
2. **Option B — Core Section Property (For primary structural sections):**
   - If the user wants a dedicated first-class field or slider inside `DemographicsSection`, `SocioEconomicSection`, `BigFiveSection`, or `ValuesAndInterestsSection`, follow the steps below.

---

## Step-by-Step Procedure (Core Schema Extension)

### Step 1: Update C# Models & External Factor Catalog
1. Add the property to the appropriate section class in `backend/Models/PersonaModels.cs` with a sensible English default value so existing MongoDB documents deserialize cleanly.
2. Ensure `[BsonIgnoreExtraElements]` remains on every model class.
3. If the field uses dropdown options, add the option list property to `FactorCatalogResponse` in `backend/Models/ArenaModels.cs` and populate its values in `backend/Seeds/factor-catalog.json`.
4. If applicable, update initial persona definitions in `backend/Seeds/seed-personas.json` (never hardcode persona data inside C# code).

### Step 2: Update the Prompt Template & Compiler
1. Add the corresponding placeholder to `backend/Prompts/system-prompt-template.md` and bind it in `backend/Services/PersonaCompilerService.cs`.
2. **CRITICAL GUARDRAIL:** Frame the factor as a *psychological/developmental trait* of the character, **NEVER** as a hardcoded `if/else` rule that dictates specific answers to specific questions.

### Step 3: Update TypeScript Types & Studio UI (`frontend/src/types.ts` & `App.tsx`)
1. Add the field to the matching interface in `frontend/src/types.ts` and `DEFAULT_NEW_PERSONA` in `frontend/src/App.tsx`.
2. Render the input control (dropdown, slider, or tag selector) in the Studio tab of `frontend/src/App.tsx`.
3. Keep the `useEffect` for `/api/personas/preview-compile` restricted to `if (activeTab !== 'studio') return;`.

### Step 4: Verification
1. Build the backend:
   ```bash
   export DOTNET_CLI_HOME=/tmp && dotnet build backend --no-restore
   ```
2. Build the frontend:
   ```bash
   npm run build --prefix frontend
   ```
