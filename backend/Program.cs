using Microsoft.Extensions.Options;
using Personalities.Api.Configuration;
using Personalities.Api.Models;
using Personalities.Api.Repositories;
using Personalities.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<MongoDbSettings>(
    builder.Configuration.GetSection("MongoDbSettings"));
builder.Services.Configure<LlmSettings>(
    builder.Configuration.GetSection("LlmSettings"));

builder.Services.AddSingleton<PersonaCompilerService>();
builder.Services.AddSingleton<FactorCatalogService>();
builder.Services.AddSingleton<PersonaRepository>();
builder.Services.AddHttpClient<LlmOrchestratorService>()
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
    {
        ConnectTimeout = TimeSpan.FromSeconds(10),
        SslOptions = new System.Net.Security.SslClientAuthenticationOptions
        {
            EnabledSslProtocols = System.Security.Authentication.SslProtocols.Tls12
        }
    });

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy
            .WithOrigins("http://localhost:3000", "http://127.0.0.1:3000")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("FrontendPolicy");

// 1. System & Connection Status
app.MapGet("/api/status", async (
    PersonaRepository repo,
    LlmOrchestratorService orchestrator,
    IOptions<LlmSettings> llmOptions,
    IOptions<MongoDbSettings> mongoOptions) =>
{
    var personas = await repo.GetAllAsync();
    var llm = llmOptions.Value;
    var hasGeminiKey = !string.IsNullOrWhiteSpace(llm.Gemini.ApiKey) ||
                       !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("GEMINI_API_KEY"));
    var ollamaModels = await orchestrator.GetLocalOllamaModelsAsync();

    return Results.Ok(new
    {
        mongoConnected = repo.IsMongoConnected,
        databaseName = mongoOptions.Value.DatabaseName,
        personaCount = personas.Count,
        defaultProvider = llm.DefaultProvider,
        geminiConfigured = hasGeminiKey,
        geminiDefaultModel = llm.Gemini.DefaultModel,
        ollamaBaseUrl = llm.Ollama.BaseUrl,
        ollamaDefaultModel = llm.Ollama.DefaultModel,
        ollamaAvailableModels = ollamaModels
    });
});

// 2. Extensible Factor Catalog
app.MapGet("/api/factors/catalog", (FactorCatalogService catalogService) =>
{
    return Results.Ok(catalogService.GetCatalog());
});

// 3. Persona List & CRUD Operations
app.MapGet("/api/personas", async (PersonaRepository repo) =>
{
    var list = await repo.GetAllAsync();
    return Results.Ok(list);
});

app.MapGet("/api/personas/{id}", async (string id, PersonaRepository repo) =>
{
    var persona = await repo.GetByIdAsync(id);
    return persona is not null ? Results.Ok(persona) : Results.NotFound();
});

app.MapPost("/api/personas", async (PersonaCharacter persona, PersonaRepository repo) =>
{
    if (string.IsNullOrWhiteSpace(persona.Name))
    {
        return Results.BadRequest(new { error = "Persona name is required." });
    }

    var saved = await repo.UpsertAsync(persona);
    return Results.Ok(saved);
});

app.MapPost("/api/personas/preview-compile", (PersonaCharacter persona, PersonaCompilerService compiler) =>
{
    var compiled = compiler.CompilePersona(persona);
    return Results.Ok(compiled);
});

app.MapDelete("/api/personas/{id}", async (string id, PersonaRepository repo) =>
{
    var deleted = await repo.DeleteAsync(id);
    return deleted ? Results.NoContent() : Results.NotFound();
});

// 4. Multi-Persona Arena (Ask Question / Evaluate Options)
app.MapPost("/api/arena/ask", async (
    ArenaAskRequest request,
    PersonaRepository repo,
    LlmOrchestratorService orchestrator) =>
{
    if (string.IsNullOrWhiteSpace(request.Question))
    {
        return Results.BadRequest(new { error = "Please enter a question." });
    }

    if (request.PersonaIds == null || request.PersonaIds.Count == 0)
    {
        return Results.BadRequest(new { error = "Please select at least one persona." });
    }

    var personas = await repo.GetByIdsAsync(request.PersonaIds);
    if (personas.Count == 0)
    {
        return Results.NotFound(new { error = "Selected personas were not found." });
    }

    var response = await orchestrator.AskArenaAsync(personas, request);
    await repo.SaveArenaSessionAsync(response);

    return Results.Ok(response);
});

// 5. Persona Chat (1-on-1 & Group Chat with Cross-Session Memory & Token Optimization)
app.MapGet("/api/chat/sessions", async (string? personaId, PersonaRepository repo) =>
{
    var sessions = await repo.GetChatSessionsAsync(personaId);
    return Results.Ok(sessions);
});

app.MapGet("/api/chat/sessions/{id}", async (string id, PersonaRepository repo) =>
{
    var session = await repo.GetChatSessionByIdAsync(id);
    return session is not null ? Results.Ok(session) : Results.NotFound();
});

app.MapPost("/api/chat/sessions", async (
    CreateChatSessionRequest request,
    PersonaRepository repo,
    LlmOrchestratorService orchestrator) =>
{
    if (request.PersonaIds == null || request.PersonaIds.Count == 0)
    {
        return Results.BadRequest(new { error = "Please select at least one persona to start a chat." });
    }

    var distinctIds = request.PersonaIds.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().ToList();
    var personas = await repo.GetByIdsAsync(distinctIds);
    if (personas.Count == 0)
    {
        return Results.NotFound(new { error = "Selected personas were not found." });
    }

    // Preserve requested persona order
    var orderedPersonas = distinctIds
        .Select(id => personas.FirstOrDefault(p => p.Id == id))
        .Where(p => p != null)
        .Cast<PersonaCharacter>()
        .ToList();

    var isGroup = orderedPersonas.Count > 1;
    var defaultTitle = !string.IsNullOrWhiteSpace(request.Title)
        ? request.Title.Trim()
        : isGroup
            ? $"Group: {string.Join(", ", orderedPersonas.Select(p => p.Name))}"
            : $"Chat with {orderedPersonas[0].Name}";

    var session = new ChatSession
    {
        Id = Guid.NewGuid().ToString("N"),
        Title = defaultTitle,
        IsGroupChat = isGroup,
        ParticipantPersonaIds = orderedPersonas.Select(p => p.Id).ToList(),
        Participants = orderedPersonas.Select(p => new ChatParticipant
        {
            PersonaId = p.Id,
            Name = p.Name,
            AvatarEmoji = p.AvatarEmoji,
            SummaryTagline = p.SummaryTagline
        }).ToList(),
        CreatedAtUtc = DateTime.UtcNow,
        UpdatedAtUtc = DateTime.UtcNow
    };

    orchestrator.UpdateSessionContextMetrics(session, orderedPersonas);
    var saved = await repo.SaveChatSessionAsync(session);
    return Results.Ok(saved);
});

app.MapPost("/api/chat/sessions/{id}/messages", async (
    string id,
    SendChatMessageRequest request,
    PersonaRepository repo,
    LlmOrchestratorService orchestrator) =>
{
    if (string.IsNullOrWhiteSpace(request.Content) && string.IsNullOrWhiteSpace(request.ReplyToMessageId))
    {
        return Results.BadRequest(new { error = "Provide message content or select a message to reply to." });
    }

    var session = await repo.GetChatSessionByIdAsync(id);
    if (session == null)
    {
        return Results.NotFound(new { error = "Chat session not found." });
    }

    var participantIds = session.Participants.Select(p => p.PersonaId).ToList();
    var personas = await repo.GetByIdsAsync(participantIds);
    var orderedPersonas = participantIds
        .Select(pid => personas.FirstOrDefault(p => p.Id == pid))
        .Where(p => p != null)
        .Cast<PersonaCharacter>()
        .ToList();

    if (orderedPersonas.Count == 0)
    {
        return Results.BadRequest(new { error = "Participating personas no longer exist." });
    }

    var turnResponse = await orchestrator.ProcessChatTurnAsync(
        session,
        orderedPersonas,
        request,
        async (personaId, newFact) =>
        {
            var savedFact = await repo.AddPersonaMemoryFactAsync(personaId, newFact);
            // Also refresh in-memory speaker object so subsequent turns or metrics reflect it
            var targetPersona = orderedPersonas.FirstOrDefault(p => p.Id == personaId);
            if (targetPersona != null && savedFact != null)
            {
                targetPersona.MemoryFacts ??= new List<PersonaMemoryFact>();
                if (targetPersona.MemoryFacts.All(f => f.Id != savedFact.Id))
                {
                    targetPersona.MemoryFacts.Add(savedFact);
                }
            }
            return savedFact;
        });

    await repo.SaveChatSessionAsync(turnResponse.Session);
    return Results.Ok(turnResponse);
});

app.MapPost("/api/chat/sessions/{id}/compact", async (
    string id,
    CompactChatSessionRequest? request,
    PersonaRepository repo,
    LlmOrchestratorService orchestrator) =>
{
    var session = await repo.GetChatSessionByIdAsync(id);
    if (session == null)
    {
        return Results.NotFound(new { error = "Chat session not found." });
    }

    var participantIds = session.Participants.Select(p => p.PersonaId).ToList();
    var personas = await repo.GetByIdsAsync(participantIds);

    await orchestrator.CompactChatSessionAsync(
        session,
        personas,
        request?.Provider,
        request?.Model,
        request?.ApiKeyOverride);

    var saved = await repo.SaveChatSessionAsync(session);
    return Results.Ok(saved);
});

app.MapDelete("/api/chat/sessions/{id}", async (string id, PersonaRepository repo) =>
{
    var deleted = await repo.DeleteChatSessionAsync(id);
    return deleted ? Results.NoContent() : Results.NotFound();
});

app.MapDelete("/api/personas/{personaId}/memories/{factId}", async (
    string personaId,
    string factId,
    PersonaRepository repo) =>
{
    var deleted = await repo.DeletePersonaMemoryFactAsync(personaId, factId);
    return deleted ? Results.NoContent() : Results.NotFound();
});

app.Run();
