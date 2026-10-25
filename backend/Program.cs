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

app.Run();
