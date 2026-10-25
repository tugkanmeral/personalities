using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Personalities.Api.Models;

[BsonIgnoreExtraElements]
public class PersonaCharacter
{
    [BsonId]
    [BsonRepresentation(BsonType.String)]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    public string Name { get; set; } = string.Empty;
    public string AvatarEmoji { get; set; } = "🧑";
    public string SummaryTagline { get; set; } = string.Empty;

    public DemographicsSection Demographics { get; set; } = new();
    public SocioEconomicSection SocioEconomic { get; set; } = new();
    public BigFiveSection BigFive { get; set; } = new();
    public ValuesAndInterestsSection ValuesAndInterests { get; set; } = new();

    /// <summary>
    /// Extensible dynamic factor list allowing new character attributes to be added without schema changes.
    /// </summary>
    public List<CustomFactor> CustomFactors { get; set; } = new();

    /// <summary>
    /// Synthesized psychological profile derived from raw character factors.
    /// </summary>
    public SynthesizedPsychology SynthesizedProfile { get; set; } = new();

    /// <summary>
    /// Compiled Markdown System Prompt sent to the LLM as the system instruction.
    /// </summary>
    public string CompiledSystemPromptMd { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

[BsonIgnoreExtraElements]
public class DemographicsSection
{
    public int Age { get; set; } = 30;
    public string Gender { get; set; } = "Unspecified";
    public string Country { get; set; } = "United States";
    public string City { get; set; } = "Austin";
    public string GrowingUpEnvironment { get; set; } = "Metropolitan / Urban Center";
    public string MaritalStatus { get; set; } = "Single";
}

[BsonIgnoreExtraElements]
public class SocioEconomicSection
{
    /// <summary>
    /// Financial status during childhood / pre-adulthood (ages 0-18).
    /// </summary>
    public string ChildhoodFinancialStatus { get; set; } = "Standard Middle Class (Balanced)";

    /// <summary>
    /// Current financial status in adulthood (or "Dependent on Family" for children).
    /// </summary>
    public string CurrentFinancialStatus { get; set; } = "Standard / Balanced Salary Earner";

    public string EducationLevel { get; set; } = "Bachelor's Degree";
    public string EducationField { get; set; } = "";
    public string Profession { get; set; } = "";
    public string FinancialAttitude { get; set; } = "Value-for-Money & Functionality Focused (Analytical Consumer)";
}

[BsonIgnoreExtraElements]
public class BigFiveSection
{
    /// <summary>0-100: Conventional/Concrete <-> Curious/Innovative/Abstract</summary>
    public int Openness { get; set; } = 50;

    /// <summary>0-100: Spontaneous/Flexible <-> Organized/Disciplined/Analytical</summary>
    public int Conscientiousness { get; set; } = 50;

    /// <summary>0-100: Introverted/Reserved <-> Extraverted/Sociable/Energetic</summary>
    public int Extraversion { get; set; } = 50;

    /// <summary>0-100: Competitive/Skeptical/Direct <-> Cooperative/Empathetic/Warm</summary>
    public int Agreeableness { get; set; } = 50;

    /// <summary>0-100: Calm/Emotionally Stable <-> Anxious/Emotionally Reactive</summary>
    public int Neuroticism { get; set; } = 50;
}

[BsonIgnoreExtraElements]
public class ValuesAndInterestsSection
{
    public List<string> Interests { get; set; } = new();
    public List<string> Dislikes { get; set; } = new();
    public string CoreMotivation { get; set; } = "Acquiring Knowledge, Technology, and Competence";
    public string DecisionStyle { get; set; } = "Analytical, Data-Driven, and Engineering-Minded";
    public string SpeechStyleNote { get; set; } = "";
}

[BsonIgnoreExtraElements]
public class CustomFactor
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public string Category { get; set; } = "General";
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string InfluenceDescription { get; set; } = string.Empty;
}

[BsonIgnoreExtraElements]
public class SynthesizedPsychology
{
    public string DevelopmentalSummary { get; set; } = string.Empty;
    public string FinancialPsychology { get; set; } = string.Empty;
    public string CognitiveAndDecisionFilter { get; set; } = string.Empty;
    public string LinguisticTone { get; set; } = string.Empty;
    public List<string> BehavioralRules { get; set; } = new();
}
