using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Personalities.Api.Models;

public class ArenaAskRequest
{
    public List<string> PersonaIds { get; set; } = new();
    public string Question { get; set; } = string.Empty;

    /// <summary>
    /// Optional list of choices presented to the personas for ranking and evaluation.
    /// </summary>
    public List<string> Options { get; set; } = new();

    /// <summary>
    /// LLM provider ("Gemini" or "Ollama"). Defaults to configured DefaultProvider if omitted.
    /// </summary>
    public string? Provider { get; set; }

    /// <summary>
    /// Model identifier (e.g., "gemini-3.5-flash" or "hf.co/inclusionAI/Ling-3.0-tiny-GGUF:Q4_K_M").
    /// </summary>
    public string? Model { get; set; }

    /// <summary>
    /// Optional runtime Gemini API key override from the UI settings modal.
    /// </summary>
    public string? ApiKeyOverride { get; set; }
}

public class PersonaAnswerResult
{
    public string PersonaId { get; set; } = string.Empty;
    public string PersonaName { get; set; } = string.Empty;
    public string AvatarEmoji { get; set; } = string.Empty;
    public string SummaryTagline { get; set; } = string.Empty;

    /// <summary>Natural first-person answer in the character's voice.</summary>
    public string Answer { get; set; } = string.Empty;

    /// <summary>Ordered list of preferences (1st choice, 2nd choice, etc.).</summary>
    public List<string> PreferenceRanking { get; set; } = new();

    /// <summary>Psychological and developmental reasoning behind the response.</summary>
    public string InnerMonologue { get; set; } = string.Empty;

    /// <summary>Character DNA factors that influenced this decision.</summary>
    public List<string> TriggeredFactors { get; set; } = new();

    public string ProviderUsed { get; set; } = string.Empty;
    public string ModelUsed { get; set; } = string.Empty;
    public long DurationMs { get; set; }
    public bool IsFallbackSimulation { get; set; }
    public bool HasError { get; set; }
    public string? WarningMessage { get; set; }
}

[BsonIgnoreExtraElements]
public class ArenaAskResponse
{
    [BsonId]
    [BsonRepresentation(BsonType.String)]
    public string SessionId { get; set; } = Guid.NewGuid().ToString("N");
    public string Question { get; set; } = string.Empty;
    public List<string> Options { get; set; } = new();
    public List<PersonaAnswerResult> Results { get; set; } = new();
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class FactorPresetTemplate
{
    public string Category { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public List<string> SuggestedOptions { get; set; } = new();
    public string DefaultInfluenceHint { get; set; } = string.Empty;
}

public class FactorCatalogResponse
{
    public List<string> Genders { get; set; } = new();
    public List<string> GrowingUpEnvironments { get; set; } = new();
    public List<string> MaritalStatuses { get; set; } = new();
    public List<string> ChildhoodFinancialStatuses { get; set; } = new();
    public List<string> CurrentFinancialStatuses { get; set; } = new();
    public List<string> EducationLevels { get; set; } = new();
    public List<string> EducationFields { get; set; } = new();
    public List<string> FinancialAttitudes { get; set; } = new();
    public List<string> CoreMotivations { get; set; } = new();
    public List<string> DecisionStyles { get; set; } = new();
    public List<string> SuggestedInterests { get; set; } = new();
    public List<FactorPresetTemplate> ExtensibleFactorTemplates { get; set; } = new();
}
