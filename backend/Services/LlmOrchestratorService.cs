using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using Personalities.Api.Configuration;
using Personalities.Api.Models;

namespace Personalities.Api.Services;

public class LlmOrchestratorService
{
    private readonly HttpClient _httpClient;
    private readonly LlmSettings _settings;
    private readonly ILogger<LlmOrchestratorService> _logger;
    private readonly string _arenaPromptTemplatePath;

    public LlmOrchestratorService(
        HttpClient httpClient,
        IOptions<LlmSettings> settings,
        ILogger<LlmOrchestratorService> logger,
        IWebHostEnvironment? env = null)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;

        var basePath = env?.ContentRootPath ?? Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "backend");
        _arenaPromptTemplatePath = Path.Combine(basePath, "Prompts", "arena-user-prompt-template.md");
    }

    public async Task<List<string>> GetLocalOllamaModelsAsync()
    {
        try
        {
            var baseUrl = _settings.Ollama.BaseUrl.TrimEnd('/');
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            using var res = await _httpClient.GetAsync($"{baseUrl}/api/tags", cts.Token);
            if (!res.IsSuccessStatusCode) return new List<string>();

            var json = await res.Content.ReadAsStringAsync(cts.Token);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("models", out var modelsArr) &&
                modelsArr.ValueKind == JsonValueKind.Array)
            {
                return modelsArr.EnumerateArray()
                    .Select(m => m.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "")
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .ToList();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Could not fetch local Ollama models: {Message}", ex.Message);
        }

        return new List<string>();
    }

    public async Task<ArenaAskResponse> AskArenaAsync(
        List<PersonaCharacter> personas,
        ArenaAskRequest request)
    {
        var tasks = personas.Select(p => AskSinglePersonaAsync(p, request));
        var results = await Task.WhenAll(tasks);

        return new ArenaAskResponse
        {
            Question = request.Question,
            Options = request.Options,
            Results = results.ToList(),
            CreatedAtUtc = DateTime.UtcNow
        };
    }

    public async Task<PersonaAnswerResult> AskSinglePersonaAsync(
        PersonaCharacter persona,
        ArenaAskRequest request)
    {
        var sw = Stopwatch.StartNew();
        var provider = string.IsNullOrWhiteSpace(request.Provider)
            ? _settings.DefaultProvider
            : request.Provider.Trim();

        var apiKey = !string.IsNullOrWhiteSpace(request.ApiKeyOverride)
            ? request.ApiKeyOverride.Trim()
            : (!string.IsNullOrWhiteSpace(_settings.Gemini.ApiKey)
                ? _settings.Gemini.ApiKey.Trim()
                : Environment.GetEnvironmentVariable("GEMINI_API_KEY") ?? "");

        string? autoSwitchNote = null;
        if (provider.Equals("Gemini", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(apiKey))
        {
            provider = "Ollama";
            autoSwitchNote = "Gemini API key is not configured; request was automatically routed to the local Ollama LLM engine.";
        }

        var userPrompt = BuildSemanticUserPrompt(request.Question, request.Options);

        try
        {
            PersonaAnswerResult result;
            if (provider.Equals("Ollama", StringComparison.OrdinalIgnoreCase))
            {
                var model = string.IsNullOrWhiteSpace(request.Model) ||
                            request.Model.StartsWith("gemini", StringComparison.OrdinalIgnoreCase)
                    ? _settings.Ollama.DefaultModel
                    : request.Model.Trim();

                result = await CallOllamaAsync(persona, userPrompt, model);
            }
            else
            {
                var model = string.IsNullOrWhiteSpace(request.Model)
                    ? _settings.Gemini.DefaultModel
                    : request.Model.Trim();

                result = await CallGeminiAsync(persona, userPrompt, model, apiKey);
            }

            sw.Stop();
            result.DurationMs = sw.ElapsedMilliseconds;
            if (!string.IsNullOrWhiteSpace(autoSwitchNote))
            {
                result.WarningMessage = autoSwitchNote;
            }
            return result;
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "LLM call failed ({Provider}). Persona: {Name}", provider, persona.Name);

            return new PersonaAnswerResult
            {
                PersonaId = persona.Id,
                PersonaName = persona.Name,
                AvatarEmoji = persona.AvatarEmoji,
                SummaryTagline = persona.SummaryTagline,
                Answer = $"[LLM Connection Error: Could not generate a response. Please verify that the {provider} service is running and the model name is valid.]",
                PreferenceRanking = new List<string>(),
                InnerMonologue = string.Empty,
                TriggeredFactors = new List<string>(),
                ProviderUsed = provider,
                ModelUsed = request.Model ?? "",
                DurationMs = sw.ElapsedMilliseconds,
                IsFallbackSimulation = false,
                HasError = true,
                WarningMessage = $"{provider} Error: {ex.Message}"
            };
        }
    }

    private string BuildSemanticUserPrompt(string question, List<string> options)
    {
        var optionsSb = new StringBuilder();
        if (options != null && options.Count > 0)
        {
            optionsSb.AppendLine();
            optionsSb.AppendLine("OPTIONS TO EVALUATE:");
            foreach (var opt in options)
            {
                optionsSb.AppendLine($"- {opt}");
            }
            optionsSb.AppendLine();
            optionsSb.AppendLine("Rank these options from your most preferred to least preferred in `preferenceRanking` and explain why based on your identity.");
        }

        if (File.Exists(_arenaPromptTemplatePath))
        {
            var template = File.ReadAllText(_arenaPromptTemplatePath);
            return template
                .Replace("{{QUESTION}}", question)
                .Replace("{{OPTIONS_BLOCK}}", optionsSb.ToString())
                .Trim();
        }

        return $"QUESTION: \"{question}\"\n{optionsSb}";
    }

    private static string BuildGeminiEndpointUrl(string model, string apiKey, bool useVertexEndpoint = false)
    {
        if (useVertexEndpoint)
        {
            return $"https://aiplatform.googleapis.com/v1/publishers/google/models/{model}:generateContent?key={Uri.EscapeDataString(apiKey)}";
        }
        return $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={Uri.EscapeDataString(apiKey)}";
    }

    public async Task<string> TestGeminiConnectionAsync(
        string message = "hello",
        string? modelOverride = null,
        string? apiKeyOverride = null)
    {
        var model = string.IsNullOrWhiteSpace(modelOverride)
            ? _settings.Gemini.DefaultModel
            : modelOverride.Trim();

        var apiKey = !string.IsNullOrWhiteSpace(apiKeyOverride)
            ? apiKeyOverride.Trim()
            : _settings.Gemini.ApiKey.Trim();

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("Gemini API key is not configured.");
        }

        var url = BuildGeminiEndpointUrl(model, apiKey);

        var payload = new
        {
            contents = new[]
            {
                new
                {
                    role = "user",
                    parts = new[] { new { text = message } }
                }
            }
        };

        var jsonPayload = JsonSerializer.Serialize(payload);
        using var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Version = System.Net.HttpVersion.Version11,
            VersionPolicy = HttpVersionPolicy.RequestVersionExact,
            Content = new StringContent(jsonPayload, Encoding.UTF8, "application/json")
        };

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        using var response = await _httpClient.SendAsync(req, cts.Token);
        var responseBody = await response.Content.ReadAsStringAsync(cts.Token);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Gemini API ({(int)response.StatusCode}): {responseBody}");
        }

        using var doc = JsonDocument.Parse(responseBody);
        return doc.RootElement
            .GetProperty("candidates")[0]
            .GetProperty("content")
            .GetProperty("parts")[0]
            .GetProperty("text")
            .GetString() ?? "";
    }

    private async Task<PersonaAnswerResult> CallGeminiAsync(
        PersonaCharacter persona,
        string userPrompt,
        string model,
        string apiKey)
    {
        var url = BuildGeminiEndpointUrl(model, apiKey);

        var payload = new
        {
            systemInstruction = new
            {
                parts = new[]
                {
                    new { text = persona.CompiledSystemPromptMd }
                }
            },
            contents = new[]
            {
                new
                {
                    role = "user",
                    parts = new[] { new { text = userPrompt } }
                }
            },
            generationConfig = new
            {
                temperature = 0.7,
                responseMimeType = "application/json"
            }
        };

        var jsonPayload = JsonSerializer.Serialize(payload);
        using var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Version = System.Net.HttpVersion.Version11,
            VersionPolicy = HttpVersionPolicy.RequestVersionExact,
            Content = new StringContent(jsonPayload, Encoding.UTF8, "application/json")
        };

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(45));
        using var response = await _httpClient.SendAsync(req, cts.Token);
        var responseBody = await response.Content.ReadAsStringAsync(cts.Token);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Gemini API ({(int)response.StatusCode}): {responseBody}");
        }

        using var doc = JsonDocument.Parse(responseBody);
        var text = doc.RootElement
            .GetProperty("candidates")[0]
            .GetProperty("content")
            .GetProperty("parts")[0]
            .GetProperty("text")
            .GetString() ?? "{}";

        return ParseStructuredLlmOutput(persona, text, "Gemini", model);
    }

    private async Task<PersonaAnswerResult> CallOllamaAsync(
        PersonaCharacter persona,
        string userPrompt,
        string model)
    {
        var baseUrl = _settings.Ollama.BaseUrl.TrimEnd('/');
        var url = $"{baseUrl}/api/chat";

        var payload = new
        {
            model = model,
            stream = false,
            messages = new[]
            {
                new { role = "system", content = persona.CompiledSystemPromptMd },
                new { role = "user", content = userPrompt }
            },
            options = new
            {
                temperature = 0.65
            }
        };

        var jsonPayload = JsonSerializer.Serialize(payload);
        using var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(90));
        using var response = await _httpClient.PostAsync(url, content, cts.Token);
        var responseBody = await response.Content.ReadAsStringAsync(cts.Token);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Ollama ({(int)response.StatusCode}): {responseBody}");
        }

        using var doc = JsonDocument.Parse(responseBody);
        var rawContent = doc.RootElement
            .GetProperty("message")
            .GetProperty("content")
            .GetString() ?? "";

        return ParseStructuredLlmOutput(persona, rawContent, "Ollama", model);
    }

    private PersonaAnswerResult ParseStructuredLlmOutput(
        PersonaCharacter persona,
        string rawText,
        string provider,
        string model)
    {
        string extractedThink = "";
        var thinkMatch = Regex.Match(rawText, @"<think>([\s\S]*?)</think>", RegexOptions.IgnoreCase);
        if (thinkMatch.Success)
        {
            extractedThink = thinkMatch.Groups[1].Value.Trim();
            rawText = Regex.Replace(rawText, @"<think>[\s\S]*?</think>", "", RegexOptions.IgnoreCase).Trim();
        }

        var cleaned = ExtractJsonObject(rawText);

        var result = new PersonaAnswerResult
        {
            PersonaId = persona.Id,
            PersonaName = persona.Name,
            AvatarEmoji = persona.AvatarEmoji,
            SummaryTagline = persona.SummaryTagline,
            ProviderUsed = provider,
            ModelUsed = model,
            IsFallbackSimulation = false
        };

        try
        {
            using var parsed = JsonDocument.Parse(cleaned);
            var root = parsed.RootElement;

            if (root.TryGetProperty("answer", out var ansProp) && ansProp.ValueKind == JsonValueKind.String)
                result.Answer = ansProp.GetString() ?? rawText;
            else
                result.Answer = rawText;

            if (root.TryGetProperty("preferenceRanking", out var rankProp) && rankProp.ValueKind == JsonValueKind.Array)
            {
                result.PreferenceRanking = rankProp.EnumerateArray()
                    .Select(x => x.ValueKind == JsonValueKind.String ? (x.GetString() ?? "") : x.ToString())
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .ToList();
            }

            if (root.TryGetProperty("innerMonologue", out var monoProp) && monoProp.ValueKind == JsonValueKind.String)
                result.InnerMonologue = monoProp.GetString() ?? extractedThink;
            else if (!string.IsNullOrWhiteSpace(extractedThink))
                result.InnerMonologue = extractedThink;

            if (root.TryGetProperty("triggeredFactors", out var trigProp) && trigProp.ValueKind == JsonValueKind.Array)
            {
                result.TriggeredFactors = trigProp.EnumerateArray()
                    .Select(x => x.ValueKind == JsonValueKind.String ? (x.GetString() ?? "") : x.ToString())
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .ToList();
            }
        }
        catch
        {
            result.Answer = rawText.Trim();
            if (!string.IsNullOrWhiteSpace(extractedThink))
            {
                result.InnerMonologue = extractedThink;
            }
        }

        return result;
    }

    private static string ExtractJsonObject(string text)
    {
        var trimmed = text.Trim();
        var firstBrace = trimmed.IndexOf('{');
        var lastBrace = trimmed.LastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace)
        {
            return trimmed.Substring(firstBrace, lastBrace - firstBrace + 1);
        }
        return trimmed;
    }
}
