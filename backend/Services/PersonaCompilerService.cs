using System.Text;
using Personalities.Api.Models;

namespace Personalities.Api.Services;

public class PersonaCompilerService
{
    private readonly string _systemPromptTemplatePath;

    public PersonaCompilerService(IWebHostEnvironment? env = null)
    {
        var basePath = env?.ContentRootPath ?? AppContext.BaseDirectory;
        _systemPromptTemplatePath = Path.Combine(basePath, "Prompts", "system-prompt-template.md");
    }

    public PersonaCharacter CompilePersona(PersonaCharacter persona)
    {
        persona.SynthesizedProfile = BuildSynthesizedPsychology(persona);
        persona.CompiledSystemPromptMd = BuildMarkdownSystemPrompt(persona);
        if (string.IsNullOrWhiteSpace(persona.SummaryTagline))
        {
            persona.SummaryTagline = BuildDefaultTagline(persona);
        }
        persona.UpdatedAtUtc = DateTime.UtcNow;
        return persona;
    }

    private static string BuildDefaultTagline(PersonaCharacter p)
    {
        var age = p.Demographics.Age;
        var role = !string.IsNullOrWhiteSpace(p.SocioEconomic.Profession)
            ? p.SocioEconomic.Profession
            : p.SocioEconomic.EducationLevel;

        return $"{age}yo, {p.Demographics.Gender} • {role} ({p.Demographics.City})";
    }

    public SynthesizedPsychology BuildSynthesizedPsychology(PersonaCharacter p)
    {
        var psych = new SynthesizedPsychology
        {
            DevelopmentalSummary =
                $"Age {p.Demographics.Age} ({p.Demographics.Gender}), raised in {p.Demographics.GrowingUpEnvironment}, currently residing in {p.Demographics.City}, {p.Demographics.Country} ({p.Demographics.MaritalStatus}). " +
                $"Education: {p.SocioEconomic.EducationLevel}" +
                (string.IsNullOrWhiteSpace(p.SocioEconomic.EducationField) ? "." : $" in {p.SocioEconomic.EducationField}.") +
                (string.IsNullOrWhiteSpace(p.SocioEconomic.Profession) ? "" : $" Occupation: {p.SocioEconomic.Profession}."),

            FinancialPsychology =
                $"Childhood financial background: '{p.SocioEconomic.ChildhoodFinancialStatus}' -> Current financial status: '{p.SocioEconomic.CurrentFinancialStatus}'. " +
                $"Consumer & financial mindset: '{p.SocioEconomic.FinancialAttitude}'.",

            CognitiveAndDecisionFilter =
                $"Big-Five Scores — Openness: {p.BigFive.Openness}/100, Conscientiousness: {p.BigFive.Conscientiousness}/100, " +
                $"Extraversion: {p.BigFive.Extraversion}/100, Agreeableness: {p.BigFive.Agreeableness}/100, Neuroticism: {p.BigFive.Neuroticism}/100. " +
                $"Core Motivation: '{p.ValuesAndInterests.CoreMotivation}'. Decision Style: '{p.ValuesAndInterests.DecisionStyle}'.",

            LinguisticTone = !string.IsNullOrWhiteSpace(p.ValuesAndInterests.SpeechStyleNote)
                ? p.ValuesAndInterests.SpeechStyleNote
                : $"Authentic to a {p.Demographics.Age}-year-old with {p.SocioEconomic.EducationLevel} background and {p.ValuesAndInterests.DecisionStyle} thinking style."
        };

        var rules = new List<string>();
        foreach (var cf in p.CustomFactors)
        {
            if (!string.IsNullOrWhiteSpace(cf.Label) && !string.IsNullOrWhiteSpace(cf.Value))
            {
                var influence = !string.IsNullOrWhiteSpace(cf.InfluenceDescription)
                    ? $" ({cf.InfluenceDescription})"
                    : "";
                rules.Add($"[{cf.Category}] {cf.Label}: {cf.Value}{influence}");
            }
        }

        psych.BehavioralRules = rules;
        return psych;
    }

    public string BuildMarkdownSystemPrompt(PersonaCharacter p)
    {
        if (!File.Exists(_systemPromptTemplatePath))
        {
            return $"# {p.Name} ({p.AvatarEmoji})\nAge: {p.Demographics.Age}, {p.SocioEconomic.Profession}";
        }

        var template = File.ReadAllText(_systemPromptTemplatePath);
        var psych = p.SynthesizedProfile;

        var educationFieldSuffix = string.IsNullOrWhiteSpace(p.SocioEconomic.EducationField)
            ? ""
            : $" ({p.SocioEconomic.EducationField})";

        var dislikesLine = p.ValuesAndInterests.Dislikes.Count > 0
            ? $"- **Dislikes / Avoided Topics:** {string.Join(", ", p.ValuesAndInterests.Dislikes)}\n"
            : "";

        var speechStyleLine = !string.IsNullOrWhiteSpace(p.ValuesAndInterests.SpeechStyleNote)
            ? $"- **Speech Style Note:** {p.ValuesAndInterests.SpeechStyleNote}\n"
            : "";

        var customFactorsSb = new StringBuilder();
        if (p.CustomFactors.Count > 0)
        {
            customFactorsSb.AppendLine("## Custom Character Factors");
            foreach (var cf in p.CustomFactors)
            {
                var influence = string.IsNullOrWhiteSpace(cf.InfluenceDescription)
                    ? ""
                    : $" — *Influence: {cf.InfluenceDescription}*";
                customFactorsSb.AppendLine($"- **[{cf.Category}] {cf.Label}:** {cf.Value}{influence}");
            }
            customFactorsSb.AppendLine();
        }

        return template
            .Replace("{{NAME}}", p.Name)
            .Replace("{{AVATAR_EMOJI}}", p.AvatarEmoji)
            .Replace("{{AGE}}", p.Demographics.Age.ToString())
            .Replace("{{GENDER}}", p.Demographics.Gender)
            .Replace("{{CITY}}", p.Demographics.City)
            .Replace("{{COUNTRY}}", p.Demographics.Country)
            .Replace("{{GROWING_UP_ENVIRONMENT}}", p.Demographics.GrowingUpEnvironment)
            .Replace("{{MARITAL_STATUS}}", p.Demographics.MaritalStatus)
            .Replace("{{CHILDHOOD_FINANCIAL_STATUS}}", p.SocioEconomic.ChildhoodFinancialStatus)
            .Replace("{{CURRENT_FINANCIAL_STATUS}}", p.SocioEconomic.CurrentFinancialStatus)
            .Replace("{{EDUCATION_LEVEL}}", p.SocioEconomic.EducationLevel)
            .Replace("{{EDUCATION_FIELD_SUFFIX}}", educationFieldSuffix)
            .Replace("{{PROFESSION}}", string.IsNullOrWhiteSpace(p.SocioEconomic.Profession) ? "Unspecified" : p.SocioEconomic.Profession)
            .Replace("{{FINANCIAL_ATTITUDE}}", p.SocioEconomic.FinancialAttitude)
            .Replace("{{OPENNESS}}", p.BigFive.Openness.ToString())
            .Replace("{{CONSCIENTIOUSNESS}}", p.BigFive.Conscientiousness.ToString())
            .Replace("{{EXTRAVERSION}}", p.BigFive.Extraversion.ToString())
            .Replace("{{AGREEABLENESS}}", p.BigFive.Agreeableness.ToString())
            .Replace("{{NEUROTICISM}}", p.BigFive.Neuroticism.ToString())
            .Replace("{{INTERESTS}}", p.ValuesAndInterests.Interests.Count > 0 ? string.Join(", ", p.ValuesAndInterests.Interests) : "General")
            .Replace("{{DISLIKES_LINE}}", dislikesLine)
            .Replace("{{CORE_MOTIVATION}}", p.ValuesAndInterests.CoreMotivation)
            .Replace("{{DECISION_STYLE}}", p.ValuesAndInterests.DecisionStyle)
            .Replace("{{SPEECH_STYLE_LINE}}", speechStyleLine)
            .Replace("{{CUSTOM_FACTORS_BLOCK}}", customFactorsSb.ToString())
            .Replace("{{DEVELOPMENTAL_SUMMARY}}", psych.DevelopmentalSummary)
            .Replace("{{FINANCIAL_PSYCHOLOGY}}", psych.FinancialPsychology)
            .Replace("{{COGNITIVE_FILTER}}", psych.CognitiveAndDecisionFilter)
            .Replace("{{LINGUISTIC_TONE}}", psych.LinguisticTone)
            .Trim();
    }
}
