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
    public const int SlidingWindowSize = 8;
    public const int AutoCompactThreshold = 12;

    private readonly HttpClient _httpClient;
    private readonly LlmSettings _settings;
    private readonly ILogger<LlmOrchestratorService> _logger;
    private readonly string _arenaPromptTemplatePath;
    private readonly string _chatTurnPromptTemplatePath;
    private readonly string _chatSummaryPromptTemplatePath;

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
        _chatTurnPromptTemplatePath = Path.Combine(basePath, "Prompts", "chat-turn-prompt-template.md");
        _chatSummaryPromptTemplatePath = Path.Combine(basePath, "Prompts", "chat-summary-prompt-template.md");
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
        var (provider, model, apiKey, autoSwitchNote) = ResolveProviderAndModel(
            request.Provider, request.Model, request.ApiKeyOverride);

        var userPrompt = BuildSemanticUserPrompt(request.Question, request.Options);

        try
        {
            PersonaAnswerResult result;
            if (provider.Equals("Ollama", StringComparison.OrdinalIgnoreCase))
            {
                result = await CallOllamaAsync(persona, userPrompt, model);
            }
            else
            {
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
                ModelUsed = model,
                DurationMs = sw.ElapsedMilliseconds,
                IsFallbackSimulation = false,
                HasError = true,
                WarningMessage = $"{provider} Error: {ex.Message}"
            };
        }
    }

    // ================= PERSONA CHAT (1-ON-1 & GROUP CHAT) ORCHESTRATION =================

    public async Task<ChatMessageTurnResponse> ProcessChatTurnAsync(
        ChatSession session,
        List<PersonaCharacter> sessionPersonas,
        SendChatMessageRequest request,
        Func<string, PersonaMemoryFact, Task<PersonaMemoryFact?>> onNewMemoryFactAsync)
    {
        var (provider, model, apiKey, autoSwitchNote) = ResolveProviderAndModel(
            request.Provider, request.Model, request.ApiKeyOverride);

        ChatMessage? explicitReplyTarget = null;
        if (!string.IsNullOrWhiteSpace(request.ReplyToMessageId))
        {
            explicitReplyTarget = session.Messages.FirstOrDefault(m => m.Id == request.ReplyToMessageId);
        }

        var newMessages = new List<ChatMessage>();
        ChatMessage? userMsg = null;

        if (!string.IsNullOrWhiteSpace(request.Content))
        {
            var userTokens = EstimateTokens(request.Content);
            var targetSenderLabel = explicitReplyTarget == null
                ? null
                : (explicitReplyTarget.Role == "user" ? "User" : (explicitReplyTarget.PersonaName ?? "Persona"));

            userMsg = new ChatMessage
            {
                Id = Guid.NewGuid().ToString("N")[..12],
                Role = "user",
                Content = request.Content.Trim(),
                ReplyToMessageId = explicitReplyTarget?.Id,
                ReplyToSenderName = targetSenderLabel,
                ReplyToContentPreview = explicitReplyTarget != null ? TruncatePreview(explicitReplyTarget.Content) : null,
                EstimatedTokens = userTokens,
                PromptTokens = userTokens,
                CompletionTokens = 0,
                TotalTokens = userTokens,
                CreatedAtUtc = DateTime.UtcNow
            };

            session.Messages.Add(userMsg);
            newMessages.Add(userMsg);

            if (session.Messages.Count == 1 &&
                (string.IsNullOrWhiteSpace(session.Title) || session.Title == "New Conversation"))
            {
                var preview = userMsg.Content.Length > 42
                    ? userMsg.Content[..42].Trim() + "..."
                    : userMsg.Content;
                session.Title = preview;
            }
        }

        // Determine which participants respond in this turn
        var respondingPersonas = sessionPersonas;
        if (request.TargetPersonaIds != null && request.TargetPersonaIds.Count > 0)
        {
            var targetSet = new HashSet<string>(request.TargetPersonaIds);
            var filtered = sessionPersonas.Where(p => targetSet.Contains(p.Id)).ToList();
            if (filtered.Count > 0)
            {
                respondingPersonas = filtered;
            }
        }
        else if (userMsg == null && explicitReplyTarget != null && !string.IsNullOrWhiteSpace(explicitReplyTarget.PersonaId))
        {
            // When triggering a direct Persona-to-Persona reply without specifying targets, exclude the message author
            var others = sessionPersonas.Where(p => p.Id != explicitReplyTarget.PersonaId).ToList();
            if (others.Count > 0)
            {
                respondingPersonas = others;
            }
        }

        var newlyLearnedFacts = new List<PersonaMemoryFact>();
        var turnErrors = new List<ChatTurnError>();
        var successfulAssistantReplies = 0;

        // Clean any legacy error messages that may have been persisted previously
        session.Messages.RemoveAll(m => m.HasError || (m.Content != null && m.Content.StartsWith("[LLM Connection Error")));

        // Message that the personas are directly replying to in this turn
        var effectiveTargetMsg = userMsg ?? explicitReplyTarget ?? session.Messages.LastOrDefault();

        // Respond sequentially so in Group Chat each subsequent persona sees what the previous persona just said
        foreach (var speaker in respondingPersonas)
        {
            var sw = Stopwatch.StartNew();
            var chatPrompt = BuildChatTurnPrompt(session, speaker, sessionPersonas, effectiveTargetMsg, explicitReplyTarget);

            var replySenderLabel = effectiveTargetMsg == null
                ? null
                : (effectiveTargetMsg.Role == "user" ? "User" : (effectiveTargetMsg.PersonaName ?? "Persona"));

            try
            {
                var (rawOutput, promptTok, completionTok, totalTok) = await CallRawLlmWithUsageAsync(
                    speaker.CompiledSystemPromptMd,
                    chatPrompt,
                    provider,
                    model,
                    apiKey);

                sw.Stop();
                var (replyText, newFactText, isConfidential) = ParseChatTurnOutput(rawOutput);

                var assistantMsg = new ChatMessage
                {
                    Id = Guid.NewGuid().ToString("N")[..12],
                    Role = "assistant",
                    PersonaId = speaker.Id,
                    PersonaName = speaker.Name,
                    AvatarEmoji = speaker.AvatarEmoji,
                    ReplyToMessageId = effectiveTargetMsg?.Id,
                    ReplyToSenderName = replySenderLabel,
                    ReplyToContentPreview = effectiveTargetMsg != null ? TruncatePreview(effectiveTargetMsg.Content) : null,
                    Content = replyText,
                    ProviderUsed = provider,
                    ModelUsed = model,
                    DurationMs = sw.ElapsedMilliseconds,
                    EstimatedTokens = EstimateTokens(replyText),
                    PromptTokens = promptTok,
                    CompletionTokens = completionTok,
                    TotalTokens = totalTok,
                    WarningMessage = autoSwitchNote,
                    CreatedAtUtc = DateTime.UtcNow
                };

                session.Messages.Add(assistantMsg);
                newMessages.Add(assistantMsg);
                successfulAssistantReplies++;

                if (!string.IsNullOrWhiteSpace(newFactText))
                {
                    var factCandidate = new PersonaMemoryFact
                    {
                        Id = Guid.NewGuid().ToString("N")[..10],
                        PersonaId = speaker.Id,
                        PersonaName = speaker.Name,
                        Fact = newFactText.Trim(),
                        // Only 1-on-1 disclosures or explicitly sensitive facts are marked confidential
                        IsConfidential = isConfidential,
                        SourceMode = session.IsGroupChat ? "group" : "1on1",
                        SourceSessionId = session.Id,
                        CreatedAtUtc = DateTime.UtcNow
                    };

                    var savedFact = await onNewMemoryFactAsync(speaker.Id, factCandidate);
                    if (savedFact != null)
                    {
                        assistantMsg.ExtractedMemoryFact = savedFact;
                        session.MemoryFacts ??= new List<PersonaMemoryFact>();
                        if (session.MemoryFacts.All(f => f.Id != savedFact.Id))
                        {
                            session.MemoryFacts.Add(savedFact);
                        }
                        newlyLearnedFacts.Add(savedFact);
                    }
                }
            }
            catch (Exception ex)
            {
                sw.Stop();
                _logger.LogError(ex, "Chat turn LLM call failed ({Provider}) for persona {Name}", provider, speaker.Name);

                // Do NOT add an assistant ChatMessage on error; report it in Errors for the UI Warning Toast View
                turnErrors.Add(new ChatTurnError
                {
                    PersonaId = speaker.Id,
                    PersonaName = speaker.Name,
                    AvatarEmoji = speaker.AvatarEmoji,
                    Provider = provider,
                    Model = model,
                    ErrorMessage = FormatCleanLlmError(provider, model, ex.Message)
                });
            }
        }

        // If every responding persona failed in this turn, roll back the user message so it is not left unanswered in DB
        if (successfulAssistantReplies == 0 && userMsg != null)
        {
            session.Messages.Remove(userMsg);
            newMessages.Remove(userMsg);
        }

        // Auto-compact older turns into RollingSummary if unsummarized messages exceed AutoCompactThreshold
        var unsummarizedCount = session.Messages.Count - session.SummarizedUpToIndex;
        if (unsummarizedCount > AutoCompactThreshold)
        {
            await CompactChatSessionAsync(
                session,
                sessionPersonas,
                request.Provider,
                request.Model,
                request.ApiKeyOverride);
        }
        else
        {
            UpdateSessionContextMetrics(session, sessionPersonas);
        }

        return new ChatMessageTurnResponse
        {
            Session = session,
            NewMessages = newMessages,
            NewlyLearnedFacts = newlyLearnedFacts,
            Errors = turnErrors
        };
    }

    private static string FormatCleanLlmError(string provider, string model, string rawError)
    {
        try
        {
            var braceIdx = rawError.IndexOf('{');
            if (braceIdx >= 0)
            {
                var jsonPart = ExtractJsonObject(rawError[braceIdx..]);
                using var doc = JsonDocument.Parse(jsonPart);
                if (doc.RootElement.TryGetProperty("error", out var errObj) &&
                    errObj.ValueKind == JsonValueKind.Object)
                {
                    var code = errObj.TryGetProperty("code", out var cProp) ? cProp.ToString() : "";
                    var status = errObj.TryGetProperty("status", out var sProp) ? sProp.GetString() ?? "" : "";
                    var msg = errObj.TryGetProperty("message", out var mProp) ? mProp.GetString() ?? "" : "";

                    var firstLine = msg.Split('\n', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? msg;
                    if (code == "429" || status == "RESOURCE_EXHAUSTED")
                    {
                        return $"{provider} Quota Exceeded (429) for model '{model}': {firstLine} Tip: Switch model in Settings (e.g., gemini-3.5-flash-lite) or use Local Ollama.";
                    }

                    return $"{provider} API Error ({code} {status}): {firstLine}";
                }
            }
        }
        catch
        {
            // Ignore JSON parse failure and fall back to concise string
        }

        return rawError.Length > 280 ? rawError[..280] + "..." : rawError;
    }

    /// <summary>
    /// Compresses older messages outside the active sliding window into RollingSummary so the
    /// beginning of the conversation is preserved forever while keeping prompt tokens bounded.
    /// </summary>
    public async Task<ChatSession> CompactChatSessionAsync(
        ChatSession session,
        List<PersonaCharacter> sessionPersonas,
        string? providerOverride = null,
        string? modelOverride = null,
        string? apiKeyOverride = null)
    {
        var total = session.Messages.Count;
        // Keep the most recent 4 messages in the active window when compacting manually, or SlidingWindowSize when auto-compacting
        var keepRecentCount = Math.Min(SlidingWindowSize, Math.Max(2, total / 2));
        var targetSummarizeEndIndex = total - keepRecentCount;

        if (targetSummarizeEndIndex <= session.SummarizedUpToIndex)
        {
            UpdateSessionContextMetrics(session, sessionPersonas);
            return session;
        }

        var messagesToCompact = session.Messages
            .Skip(session.SummarizedUpToIndex)
            .Take(targetSummarizeEndIndex - session.SummarizedUpToIndex)
            .Where(m => !m.HasError)
            .ToList();

        if (messagesToCompact.Count == 0)
        {
            session.SummarizedUpToIndex = targetSummarizeEndIndex;
            UpdateSessionContextMetrics(session, sessionPersonas);
            return session;
        }

        var (provider, model, apiKey, _) = ResolveProviderAndModel(providerOverride, modelOverride, apiKeyOverride);

        var turnsSb = new StringBuilder();
        foreach (var msg in messagesToCompact)
        {
            var speakerLabel = msg.Role == "user" ? "User" : (msg.PersonaName ?? "Persona");
            turnsSb.AppendLine($"[{speakerLabel}]: {msg.Content}");
        }

        var existingSummary = string.IsNullOrWhiteSpace(session.RollingSummary)
            ? "(No prior summary — this is the beginning of the conversation.)"
            : session.RollingSummary;

        string summaryPrompt;
        if (File.Exists(_chatSummaryPromptTemplatePath))
        {
            var template = await File.ReadAllTextAsync(_chatSummaryPromptTemplatePath);
            summaryPrompt = template
                .Replace("{{EXISTING_SUMMARY}}", existingSummary)
                .Replace("{{MESSAGES_TO_COMPACT}}", turnsSb.ToString().Trim())
                .Trim();
        }
        else
        {
            summaryPrompt = $"Existing Summary:\n{existingSummary}\n\nNew Turns:\n{turnsSb}";
        }

        try
        {
            var (rawSummaryResponse, _, _, compactionTotalTok) = await CallRawLlmWithUsageAsync(
                string.Empty,
                summaryPrompt,
                provider,
                model,
                apiKey);

            session.CompactionTokensSpent += compactionTotalTok;

            var cleaned = ExtractJsonObject(RemoveThinkBlocks(rawSummaryResponse));
            using var doc = JsonDocument.Parse(cleaned);
            if (doc.RootElement.TryGetProperty("updatedSummary", out var sumProp) &&
                sumProp.ValueKind == JsonValueKind.String &&
                !string.IsNullOrWhiteSpace(sumProp.GetString()))
            {
                session.RollingSummary = sumProp.GetString()!.Trim();
                session.SummarizedUpToIndex = targetSummarizeEndIndex;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "LLM summary compaction failed; applying deterministic extractive fallback summary.");
            var fallbackLines = messagesToCompact
                .Select(m => $"{(m.Role == "user" ? "User" : m.PersonaName)}: {(m.Content.Length > 90 ? m.Content[..90] + "..." : m.Content)}");
            var merged = string.IsNullOrWhiteSpace(session.RollingSummary)
                ? string.Join(" | ", fallbackLines)
                : $"{session.RollingSummary} | {string.Join(" | ", fallbackLines)}";
            session.RollingSummary = merged.Length > 750 ? merged[..750] + "..." : merged;
            session.SummarizedUpToIndex = targetSummarizeEndIndex;
        }

        UpdateSessionContextMetrics(session, sessionPersonas);
        return session;
    }

    public void UpdateSessionContextMetrics(ChatSession session, List<PersonaCharacter> sessionPersonas)
    {
        var totalMessages = session.Messages.Count;
        var activeStartIndex = Math.Max(session.SummarizedUpToIndex, Math.Max(0, totalMessages - SlidingWindowSize));
        var activeWindowMessages = session.Messages.Skip(activeStartIndex).ToList();

        var systemPromptTokens = sessionPersonas.Count > 0
            ? EstimateTokens(sessionPersonas[0].CompiledSystemPromptMd)
            : 380;

        var memoryVaultTokens = sessionPersonas.Count > 0 && sessionPersonas[0].MemoryFacts != null
            ? sessionPersonas[0].MemoryFacts.Sum(f => EstimateTokens(f.Fact) + 6)
            : 0;

        var summaryTokens = EstimateTokens(session.RollingSummary);
        var activeWindowTokens = activeWindowMessages.Sum(m => EstimateTokens(m.Content) + 8);

        var optimizedPromptTokens = systemPromptTokens + memoryVaultTokens + summaryTokens + activeWindowTokens;

        // Compare against unoptimized raw history (all messages sent every turn + Arena-style innerMonologue/triggeredFactors overhead)
        var allMessagesRawTokens = session.Messages.Sum(m =>
            EstimateTokens(m.Content) + (m.Role == "assistant" ? 135 : 10));

        var rawUncompressedTokens = systemPromptTokens + memoryVaultTokens + allMessagesRawTokens;

        var savedPct = 0;
        if (rawUncompressedTokens > 0 && totalMessages > 0 && rawUncompressedTokens > optimizedPromptTokens)
        {
            savedPct = (int)Math.Round(
                (double)(rawUncompressedTokens - optimizedPromptTokens) / rawUncompressedTokens * 100.0);
        }

        // Calculate cumulative tokens spent in this chat session across all messages + compaction calls
        var assistantMsgs = session.Messages.Where(m => m.Role == "assistant" && !m.HasError).ToList();
        var sessionPromptSpent = assistantMsgs.Sum(m => m.PromptTokens > 0 ? m.PromptTokens : EstimateTokens(m.Content));
        var sessionCompletionSpent = assistantMsgs.Sum(m => m.CompletionTokens > 0 ? m.CompletionTokens : m.EstimatedTokens);
        var sessionTotalSpent = sessionPromptSpent + sessionCompletionSpent + session.CompactionTokensSpent;

        session.ContextMetrics = new ChatContextMetrics
        {
            TotalMessageCount = totalMessages,
            ActiveWindowCount = activeWindowMessages.Count,
            CompactedMessageCount = session.SummarizedUpToIndex,
            EstimatedPromptTokens = optimizedPromptTokens,
            RawUncompressedTokens = rawUncompressedTokens,
            SavedPercentage = Math.Clamp(savedPct, 0, 95),
            SessionPromptTokensSpent = sessionPromptSpent,
            SessionCompletionTokensSpent = sessionCompletionSpent,
            SessionTotalTokensSpent = sessionTotalSpent
        };
    }

    private string BuildChatTurnPrompt(
        ChatSession session,
        PersonaCharacter speaker,
        List<PersonaCharacter> allParticipants,
        ChatMessage? targetMessage = null,
        ChatMessage? quotedMessage = null)
    {
        var isGroup = allParticipants.Count > 1;
        var otherParticipants = allParticipants
            .Where(p => p.Id != speaker.Id)
            .Select(p => $"{p.Name} ({p.SummaryTagline})")
            .ToList();

        var roomModeLabel = isGroup
            ? "Group Conversation (Multiple Personas & User Present — Protect 1-on-1 Secrets!)"
            : "Private 1-on-1 Conversation (Only You and the User)";

        var participantsList = isGroup
            ? $"User, You ({speaker.Name}), and other participants: {string.Join(", ", otherParticipants)}"
            : $"User and You ({speaker.Name})";

        // Strict Prompt Isolation: Only inject THIS speaker's MemoryFacts!
        var speakerFacts = speaker.MemoryFacts ?? new List<PersonaMemoryFact>();
        var confidentialFacts = speakerFacts.Where(f => f.IsConfidential).ToList();
        var generalFacts = speakerFacts.Where(f => !f.IsConfidential).ToList();

        var confidentialSb = new StringBuilder();
        if (confidentialFacts.Count == 0)
        {
            confidentialSb.AppendLine("- (None recorded)");
        }
        else
        {
            foreach (var f in confidentialFacts)
            {
                confidentialSb.AppendLine($"- [CONFIDENTIAL 1-ON-1 SECRET] {f.Fact}");
            }
        }

        var generalSb = new StringBuilder();
        if (generalFacts.Count == 0)
        {
            generalSb.AppendLine("- (None recorded)");
        }
        else
        {
            foreach (var f in generalFacts)
            {
                generalSb.AppendLine($"- {f.Fact}");
            }
        }

        var summaryBlock = string.IsNullOrWhiteSpace(session.RollingSummary)
            ? "(Conversation started recently; see recent window below.)"
            : session.RollingSummary;

        // Sliding window of recent messages
        var total = session.Messages.Count;
        var windowStart = Math.Max(session.SummarizedUpToIndex, Math.Max(0, total - SlidingWindowSize));
        var windowMessages = session.Messages.Skip(windowStart).ToList();

        var recentSb = new StringBuilder();
        if (windowMessages.Count == 0)
        {
            recentSb.AppendLine("(This is the opening exchange of this session.)");
        }
        else
        {
            foreach (var msg in windowMessages)
            {
                var sender = msg.Role == "user" ? "User" : (msg.PersonaName ?? "Persona");
                if (!string.IsNullOrWhiteSpace(msg.ReplyToSenderName))
                {
                    recentSb.AppendLine($"[{sender} -> replying to {msg.ReplyToSenderName}]: {msg.Content}");
                }
                else
                {
                    recentSb.AppendLine($"[{sender}]: {msg.Content}");
                }
            }
        }

        var latestMsg = targetMessage ?? windowMessages.LastOrDefault();
        var latestSender = latestMsg == null
            ? "User"
            : (latestMsg.Role == "user" ? "User" : (latestMsg.PersonaName ?? "Persona"));

        string latestBlock;
        if (latestMsg == null)
        {
            latestBlock = "";
        }
        else if (quotedMessage != null && quotedMessage.Id != latestMsg.Id)
        {
            var quotedSender = quotedMessage.Role == "user" ? "User" : (quotedMessage.PersonaName ?? "Persona");
            latestBlock = $"[Quoted Message from {quotedSender}]: \"{quotedMessage.Content}\"\n[{latestSender}]: {latestMsg.Content}";
        }
        else
        {
            latestBlock = $"[Target Message from {latestSender} — Reply directly to {latestSender}]: \"{latestMsg.Content}\"";
        }

        if (File.Exists(_chatTurnPromptTemplatePath))
        {
            var template = File.ReadAllText(_chatTurnPromptTemplatePath);
            return template
                .Replace("{{PERSONA_NAME}}", speaker.Name)
                .Replace("{{ROOM_MODE_CONTEXT}}", roomModeLabel)
                .Replace("{{ROOM_MODE_LABEL}}", roomModeLabel)
                .Replace("{{PARTICIPANTS_LIST}}", participantsList)
                .Replace("{{CONFIDENTIAL_MEMORIES_BLOCK}}", confidentialSb.ToString().TrimEnd())
                .Replace("{{GENERAL_MEMORIES_BLOCK}}", generalSb.ToString().TrimEnd())
                .Replace("{{SESSION_SUMMARY_BLOCK}}", summaryBlock)
                .Replace("{{RECENT_MESSAGES_BLOCK}}", recentSb.ToString().TrimEnd())
                .Replace("{{LATEST_USER_MESSAGE}}", latestBlock)
                .Trim();
        }

        return $"{roomModeLabel}\n{recentSb}\n{latestBlock}";
    }

    private static string TruncatePreview(string? text, int maxLen = 90)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;
        var clean = text.Replace("\r", " ").Replace("\n", " ").Trim();
        return clean.Length > maxLen ? clean[..maxLen] + "..." : clean;
    }

    private (string Provider, string Model, string ApiKey, string? AutoSwitchNote) ResolveProviderAndModel(
        string? requestedProvider,
        string? requestedModel,
        string? apiKeyOverride)
    {
        var provider = string.IsNullOrWhiteSpace(requestedProvider)
            ? _settings.DefaultProvider
            : requestedProvider.Trim();

        var apiKey = !string.IsNullOrWhiteSpace(apiKeyOverride)
            ? apiKeyOverride.Trim()
            : (!string.IsNullOrWhiteSpace(_settings.Gemini.ApiKey)
                ? _settings.Gemini.ApiKey.Trim()
                : Environment.GetEnvironmentVariable("GEMINI_API_KEY") ?? "");

        string? autoSwitchNote = null;
        if (provider.Equals("Gemini", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(apiKey))
        {
            provider = "Ollama";
            autoSwitchNote = "Gemini API key is not configured; request was automatically routed to the local Ollama LLM engine.";
        }

        string model;
        if (provider.Equals("Ollama", StringComparison.OrdinalIgnoreCase))
        {
            model = string.IsNullOrWhiteSpace(requestedModel) ||
                    requestedModel.StartsWith("gemini", StringComparison.OrdinalIgnoreCase)
                ? _settings.Ollama.DefaultModel
                : requestedModel.Trim();
        }
        else
        {
            model = string.IsNullOrWhiteSpace(requestedModel)
                ? _settings.Gemini.DefaultModel
                : requestedModel.Trim();
        }

        return (provider, model, apiKey, autoSwitchNote);
    }

    private async Task<string> CallRawLlmTextAsync(
        string systemPrompt,
        string userPrompt,
        string provider,
        string model,
        string apiKey)
    {
        var (text, _, _, _) = await CallRawLlmWithUsageAsync(systemPrompt, userPrompt, provider, model, apiKey);
        return text;
    }

    private async Task<(string RawText, int PromptTokens, int CompletionTokens, int TotalTokens)> CallRawLlmWithUsageAsync(
        string systemPrompt,
        string userPrompt,
        string provider,
        string model,
        string apiKey)
    {
        var fallbackPromptTok = EstimateTokens(systemPrompt) + EstimateTokens(userPrompt);

        if (provider.Equals("Ollama", StringComparison.OrdinalIgnoreCase))
        {
            var baseUrl = _settings.Ollama.BaseUrl.TrimEnd('/');
            var url = $"{baseUrl}/api/chat";

            var messages = new List<object>();
            if (!string.IsNullOrWhiteSpace(systemPrompt))
            {
                messages.Add(new { role = "system", content = systemPrompt });
            }
            messages.Add(new { role = "user", content = userPrompt });

            var payload = new
            {
                model = model,
                stream = false,
                messages = messages,
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
            var root = doc.RootElement;
            var rawText = root
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "";

            var promptTok = root.TryGetProperty("prompt_eval_count", out var pProp) && pProp.ValueKind == JsonValueKind.Number
                ? pProp.GetInt32()
                : fallbackPromptTok;
            var completionTok = root.TryGetProperty("eval_count", out var cProp) && cProp.ValueKind == JsonValueKind.Number
                ? cProp.GetInt32()
                : EstimateTokens(rawText);

            return (rawText, promptTok, completionTok, promptTok + completionTok);
        }
        else
        {
            var url = BuildGeminiEndpointUrl(model, apiKey);

            object payload;
            if (!string.IsNullOrWhiteSpace(systemPrompt))
            {
                payload = new
                {
                    systemInstruction = new
                    {
                        parts = new[] { new { text = systemPrompt } }
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
            }
            else
            {
                payload = new
                {
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
                        temperature = 0.4,
                        responseMimeType = "application/json"
                    }
                };
            }

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
            var root = doc.RootElement;
            var rawText = root
                .GetProperty("candidates")[0]
                .GetProperty("content")
                .GetProperty("parts")[0]
                .GetProperty("text")
                .GetString() ?? "{}";

            var promptTok = fallbackPromptTok;
            var completionTok = EstimateTokens(rawText);
            var totalTok = promptTok + completionTok;

            if (root.TryGetProperty("usageMetadata", out var usage) && usage.ValueKind == JsonValueKind.Object)
            {
                if (usage.TryGetProperty("promptTokenCount", out var pt) && pt.ValueKind == JsonValueKind.Number)
                    promptTok = pt.GetInt32();
                if (usage.TryGetProperty("candidatesTokenCount", out var ct) && ct.ValueKind == JsonValueKind.Number)
                    completionTok = ct.GetInt32();
                if (usage.TryGetProperty("totalTokenCount", out var tt) && tt.ValueKind == JsonValueKind.Number)
                    totalTok = tt.GetInt32();
                else
                    totalTok = promptTok + completionTok;
            }

            return (rawText, promptTok, completionTok, totalTok);
        }
    }

    private static (string Reply, string NewMemoryFact, bool IsConfidential) ParseChatTurnOutput(string rawText)
    {
        var stripped = RemoveThinkBlocks(rawText);
        var cleaned = ExtractJsonObject(stripped);

        try
        {
            using var parsed = JsonDocument.Parse(cleaned);
            var root = parsed.RootElement;

            var reply = "";
            if (root.TryGetProperty("reply", out var replyProp) && replyProp.ValueKind == JsonValueKind.String)
            {
                reply = replyProp.GetString() ?? "";
            }
            else if (root.TryGetProperty("answer", out var ansProp) && ansProp.ValueKind == JsonValueKind.String)
            {
                reply = ansProp.GetString() ?? "";
            }

            var newFact = "";
            if (root.TryGetProperty("newMemoryFact", out var factProp) && factProp.ValueKind == JsonValueKind.String)
            {
                newFact = factProp.GetString() ?? "";
            }
            else if (root.TryGetProperty("memoryFact", out var mfProp) && mfProp.ValueKind == JsonValueKind.String)
            {
                newFact = mfProp.GetString() ?? "";
            }
            else if (root.TryGetProperty("pinnedFact", out var pfProp) && pfProp.ValueKind == JsonValueKind.String)
            {
                newFact = pfProp.GetString() ?? "";
            }

            var isConfidential = false;
            if (root.TryGetProperty("isConfidential", out var confProp) &&
                (confProp.ValueKind == JsonValueKind.True || confProp.ValueKind == JsonValueKind.False))
            {
                isConfidential = confProp.GetBoolean();
            }

            if (!string.IsNullOrWhiteSpace(reply))
            {
                return (reply.Trim(), newFact.Trim(), isConfidential);
            }
        }
        catch
        {
            // Resilient fallback if a local tiny model outputs plain text instead of strict JSON
        }

        return (stripped.Trim(), string.Empty, false);
    }

    private static string RemoveThinkBlocks(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;
        return Regex.Replace(text, @"<think>[\s\S]*?</think>", "", RegexOptions.IgnoreCase).Trim();
    }

    private static int EstimateTokens(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return 0;
        return Math.Max(1, (int)Math.Ceiling(text.Length / 4.0));
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
        var text = await CallRawLlmTextAsync(persona.CompiledSystemPromptMd, userPrompt, "Gemini", model, apiKey);
        return ParseStructuredLlmOutput(persona, text, "Gemini", model);
    }

    private async Task<PersonaAnswerResult> CallOllamaAsync(
        PersonaCharacter persona,
        string userPrompt,
        string model)
    {
        var rawContent = await CallRawLlmTextAsync(persona.CompiledSystemPromptMd, userPrompt, "Ollama", model, "");
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
