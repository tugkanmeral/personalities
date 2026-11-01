using System.Text.Json;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Personalities.Api.Configuration;
using Personalities.Api.Models;
using Personalities.Api.Services;

namespace Personalities.Api.Repositories;

public class PersonaRepository
{
    private const int MaxMemoryFactsPerPersona = 15;

    private readonly MongoDbSettings _settings;
    private readonly PersonaCompilerService _compiler;
    private readonly ILogger<PersonaRepository> _logger;
    private readonly string _contentRootPath;
    private readonly string _fallbackFilePath;
    private readonly string _chatFallbackFilePath;
    private readonly SemaphoreSlim _lock = new(1, 1);

    private IMongoCollection<PersonaCharacter>? _personasCollection;
    private IMongoCollection<ArenaAskResponse>? _arenaHistoryCollection;
    private IMongoCollection<ChatSession>? _chatSessionsCollection;
    private bool _mongoChecked;
    private bool _mongoAvailable;

    public PersonaRepository(
        IOptions<MongoDbSettings> settings,
        PersonaCompilerService compiler,
        IWebHostEnvironment env,
        ILogger<PersonaRepository> logger)
    {
        _settings = settings.Value;
        _compiler = compiler;
        _logger = logger;
        _contentRootPath = env.ContentRootPath;

        var dataDir = Path.Combine(env.ContentRootPath, "Data");
        Directory.CreateDirectory(dataDir);
        _fallbackFilePath = Path.Combine(dataDir, "personas_store.json");
        _chatFallbackFilePath = Path.Combine(dataDir, "chat_sessions_store.json");
    }

    public bool IsMongoConnected => _mongoAvailable;
    public string ActiveDatabaseName => _settings.DatabaseName;

    private async Task<bool> EnsureStorageReadyAsync()
    {
        if (_mongoChecked)
        {
            return _mongoAvailable;
        }

        await _lock.WaitAsync();
        try
        {
            if (_mongoChecked)
            {
                return _mongoAvailable;
            }

            try
            {
                var mongoUrl = MongoUrl.Create(_settings.ConnectionString);
                var clientSettings = MongoClientSettings.FromUrl(mongoUrl);
                clientSettings.ServerSelectionTimeout = TimeSpan.FromSeconds(2);
                clientSettings.ConnectTimeout = TimeSpan.FromSeconds(2);

                var client = new MongoClient(clientSettings);
                var database = client.GetDatabase(_settings.DatabaseName);

                await database.RunCommandAsync((Command<MongoDB.Bson.BsonDocument>)"{ping:1}");

                _personasCollection = database.GetCollection<PersonaCharacter>(_settings.PersonasCollectionName);
                _arenaHistoryCollection = database.GetCollection<ArenaAskResponse>(_settings.ArenaHistoryCollectionName);
                _chatSessionsCollection = database.GetCollection<ChatSession>(_settings.ChatSessionsCollectionName);
                _mongoAvailable = true;

                await EnsureIndexesAsync();

                // Backfill MemoryFacts field on any existing Personas or ChatSessions documents in MongoDB
                await _personasCollection.UpdateManyAsync(
                    Builders<PersonaCharacter>.Filter.Exists(x => x.MemoryFacts, false),
                    Builders<PersonaCharacter>.Update.Set(x => x.MemoryFacts, new List<PersonaMemoryFact>()));

                await _chatSessionsCollection.UpdateManyAsync(
                    Builders<ChatSession>.Filter.Exists(x => x.MemoryFacts, false),
                    Builders<ChatSession>.Update.Set(x => x.MemoryFacts, new List<PersonaMemoryFact>()));

                var count = await _personasCollection.CountDocumentsAsync(FilterDefinition<PersonaCharacter>.Empty);
                var seeds = SeedPersonas.LoadFromFile(_contentRootPath, _compiler);
                if (count == 0 && seeds.Count > 0)
                {
                    await _personasCollection.InsertManyAsync(seeds);
                    _logger.LogInformation("Seeded {Count} initial personas into MongoDB collection '{Collection}'.",
                        seeds.Count, _settings.PersonasCollectionName);
                }
            }
            catch (Exception ex)
            {
                _mongoAvailable = false;
                _logger.LogWarning("Could not connect to MongoDB ({Message}). Using local JSON fallback store: {Path}",
                    ex.Message, _fallbackFilePath);

                if (!File.Exists(_fallbackFilePath))
                {
                    var seeds = SeedPersonas.LoadFromFile(_contentRootPath, _compiler);
                    await SaveFallbackFileAsync(seeds);
                }
            }

            _mongoChecked = true;
            return _mongoAvailable;
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>
    /// Ensures all MongoDB queries and sorts across Personas, ArenaSessions, and ChatSessions
    /// are backed by dedicated B-Tree indexes following the ESR (Equality, Sort, Range) rule.
    /// </summary>
    private async Task EnsureIndexesAsync()
    {
        try
        {
            if (_personasCollection != null)
            {
                var personaUpdatedIndex = new CreateIndexModel<PersonaCharacter>(
                    Builders<PersonaCharacter>.IndexKeys.Descending(x => x.UpdatedAtUtc),
                    new CreateIndexOptions { Name = "ix_personas_updatedAtUtc_desc" });

                await _personasCollection.Indexes.CreateOneAsync(personaUpdatedIndex);
            }

            if (_arenaHistoryCollection != null)
            {
                var arenaCreatedIndex = new CreateIndexModel<ArenaAskResponse>(
                    Builders<ArenaAskResponse>.IndexKeys.Descending(x => x.CreatedAtUtc),
                    new CreateIndexOptions { Name = "ix_arenaSessions_createdAtUtc_desc" });

                await _arenaHistoryCollection.Indexes.CreateOneAsync(arenaCreatedIndex);
            }

            if (_chatSessionsCollection != null)
            {
                var chatUpdatedIndex = new CreateIndexModel<ChatSession>(
                    Builders<ChatSession>.IndexKeys.Descending(x => x.UpdatedAtUtc),
                    new CreateIndexOptions { Name = "ix_chatSessions_updatedAtUtc_desc" });

                // ESR Rule: Equality on ParticipantPersonaIds (multikey) + Sort on UpdatedAtUtc (-1)
                var chatParticipantUpdatedIndex = new CreateIndexModel<ChatSession>(
                    Builders<ChatSession>.IndexKeys
                        .Ascending(x => x.ParticipantPersonaIds)
                        .Descending(x => x.UpdatedAtUtc),
                    new CreateIndexOptions { Name = "ix_chatSessions_participant_updatedAtUtc_desc" });

                await _chatSessionsCollection.Indexes.CreateManyAsync(new[]
                {
                    chatUpdatedIndex,
                    chatParticipantUpdatedIndex
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Could not ensure MongoDB indexes: {Message}", ex.Message);
        }
    }

    public async Task<List<PersonaCharacter>> GetAllAsync()
    {
        if (await EnsureStorageReadyAsync() && _personasCollection != null)
        {
            // Uses ix_personas_updatedAtUtc_desc
            return await _personasCollection
                .Find(FilterDefinition<PersonaCharacter>.Empty)
                .SortByDescending(x => x.UpdatedAtUtc)
                .ToListAsync();
        }

        return await LoadFallbackFileAsync();
    }

    public async Task<PersonaCharacter?> GetByIdAsync(string id)
    {
        if (await EnsureStorageReadyAsync() && _personasCollection != null)
        {
            // Uses built-in _id_ unique index
            return await _personasCollection
                .Find(x => x.Id == id)
                .FirstOrDefaultAsync();
        }

        var list = await LoadFallbackFileAsync();
        return list.FirstOrDefault(x => x.Id == id);
    }

    public async Task<List<PersonaCharacter>> GetByIdsAsync(List<string> ids)
    {
        if (await EnsureStorageReadyAsync() && _personasCollection != null)
        {
            // Uses built-in _id_ unique index
            var filter = Builders<PersonaCharacter>.Filter.In(x => x.Id, ids);
            return await _personasCollection.Find(filter).ToListAsync();
        }

        var list = await LoadFallbackFileAsync();
        return list.Where(x => ids.Contains(x.Id)).ToList();
    }

    public async Task<PersonaCharacter> UpsertAsync(PersonaCharacter persona)
    {
        if (string.IsNullOrWhiteSpace(persona.Id))
        {
            persona.Id = Guid.NewGuid().ToString("N");
        }

        // Preserve existing MemoryFacts if the Studio form payload did not include them
        if (persona.MemoryFacts == null || persona.MemoryFacts.Count == 0)
        {
            var existing = await GetByIdAsync(persona.Id);
            if (existing?.MemoryFacts != null && existing.MemoryFacts.Count > 0)
            {
                persona.MemoryFacts = existing.MemoryFacts;
            }
        }

        _compiler.CompilePersona(persona);

        if (await EnsureStorageReadyAsync() && _personasCollection != null)
        {
            // Uses built-in _id_ unique index
            await _personasCollection.ReplaceOneAsync(
                x => x.Id == persona.Id,
                persona,
                new ReplaceOptions { IsUpsert = true });
            return persona;
        }

        var list = await LoadFallbackFileAsync();
        var existingIndex = list.FindIndex(x => x.Id == persona.Id);
        if (existingIndex >= 0)
        {
            list[existingIndex] = persona;
        }
        else
        {
            list.Insert(0, persona);
        }

        await SaveFallbackFileAsync(list);
        return persona;
    }

    public async Task<bool> DeleteAsync(string id)
    {
        if (await EnsureStorageReadyAsync() && _personasCollection != null)
        {
            // Uses built-in _id_ unique index
            var result = await _personasCollection.DeleteOneAsync(x => x.Id == id);
            return result.DeletedCount > 0;
        }

        var list = await LoadFallbackFileAsync();
        var removed = list.RemoveAll(x => x.Id == id);
        if (removed > 0)
        {
            await SaveFallbackFileAsync(list);
            return true;
        }

        return false;
    }

    /// <summary>
    /// Adds a persistent cross-session memory fact to a persona's vault, deduplicating and capping
    /// at MaxMemoryFactsPerPersona so cross-session prompt token usage stays O(1).
    /// </summary>
    public async Task<PersonaMemoryFact?> AddPersonaMemoryFactAsync(string personaId, PersonaMemoryFact newFact)
    {
        if (string.IsNullOrWhiteSpace(newFact.Fact))
        {
            return null;
        }

        var persona = await GetByIdAsync(personaId);
        if (persona == null)
        {
            return null;
        }

        persona.MemoryFacts ??= new List<PersonaMemoryFact>();
        var normalizedNew = newFact.Fact.Trim();

        // Check if an equivalent fact already exists
        var existing = persona.MemoryFacts.FirstOrDefault(f =>
            string.Equals(f.Fact.Trim(), normalizedNew, StringComparison.OrdinalIgnoreCase));

        if (existing != null)
        {
            if (newFact.IsConfidential && !existing.IsConfidential)
            {
                existing.IsConfidential = true;
                persona.UpdatedAtUtc = DateTime.UtcNow;
                await SavePersonaDirectAsync(persona);
            }
            return existing;
        }

        newFact.Fact = normalizedNew;
        persona.MemoryFacts.Add(newFact);

        // Bound vault size to MaxMemoryFactsPerPersona (prioritize keeping confidential secrets + newest facts)
        if (persona.MemoryFacts.Count > MaxMemoryFactsPerPersona)
        {
            var victim = persona.MemoryFacts
                .OrderBy(f => f.IsConfidential ? 1 : 0)
                .ThenBy(f => f.CreatedAtUtc)
                .First();
            persona.MemoryFacts.Remove(victim);
        }

        persona.UpdatedAtUtc = DateTime.UtcNow;
        await SavePersonaDirectAsync(persona);
        return newFact;
    }

    public async Task<bool> DeletePersonaMemoryFactAsync(string personaId, string factId)
    {
        var persona = await GetByIdAsync(personaId);
        if (persona?.MemoryFacts == null)
        {
            return false;
        }

        var removed = persona.MemoryFacts.RemoveAll(f => f.Id == factId);
        if (removed == 0)
        {
            return false;
        }

        persona.UpdatedAtUtc = DateTime.UtcNow;
        await SavePersonaDirectAsync(persona);
        return true;
    }

    private async Task SavePersonaDirectAsync(PersonaCharacter persona)
    {
        if (await EnsureStorageReadyAsync() && _personasCollection != null)
        {
            // Uses built-in _id_ unique index
            await _personasCollection.ReplaceOneAsync(
                x => x.Id == persona.Id,
                persona,
                new ReplaceOptions { IsUpsert = true });
            return;
        }

        var list = await LoadFallbackFileAsync();
        var idx = list.FindIndex(x => x.Id == persona.Id);
        if (idx >= 0)
        {
            list[idx] = persona;
            await SaveFallbackFileAsync(list);
        }
    }

    public async Task SaveArenaSessionAsync(ArenaAskResponse session)
    {
        if (await EnsureStorageReadyAsync() && _arenaHistoryCollection != null)
        {
            try
            {
                await _arenaHistoryCollection.InsertOneAsync(session);
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Could not save Arena session to MongoDB: {Message}", ex.Message);
            }
        }
    }

    // ================= CHAT SESSIONS REPOSITORY METHODS =================

    public async Task<List<ChatSession>> GetChatSessionsAsync(string? personaId = null)
    {
        List<ChatSession> list;
        if (await EnsureStorageReadyAsync() && _chatSessionsCollection != null)
        {
            if (!string.IsNullOrWhiteSpace(personaId))
            {
                // Uses compound multikey index: ix_chatSessions_participant_updatedAtUtc_desc
                // ESR Rule: Equality on ParticipantPersonaIds, Sort on UpdatedAtUtc (-1)
                var filter = Builders<ChatSession>.Filter.AnyEq(x => x.ParticipantPersonaIds, personaId);
                list = await _chatSessionsCollection
                    .Find(filter)
                    .SortByDescending(x => x.UpdatedAtUtc)
                    .ToListAsync();
            }
            else
            {
                // Uses ix_chatSessions_updatedAtUtc_desc
                list = await _chatSessionsCollection
                    .Find(FilterDefinition<ChatSession>.Empty)
                    .SortByDescending(x => x.UpdatedAtUtc)
                    .ToListAsync();
            }
        }
        else
        {
            var sessions = await LoadChatFallbackFileAsync();
            if (!string.IsNullOrWhiteSpace(personaId))
            {
                sessions = sessions
                    .Where(s => s.ParticipantPersonaIds.Contains(personaId))
                    .ToList();
            }

            list = sessions
                .OrderByDescending(s => s.UpdatedAtUtc)
                .ToList();
        }

        foreach (var s in list)
        {
            s.Messages?.RemoveAll(m => m.HasError || (m.Content != null && m.Content.StartsWith("[LLM Connection Error")));
        }

        return list;
    }

    public async Task<ChatSession?> GetChatSessionByIdAsync(string id)
    {
        ChatSession? session;
        if (await EnsureStorageReadyAsync() && _chatSessionsCollection != null)
        {
            // Uses built-in _id_ unique index
            session = await _chatSessionsCollection
                .Find(x => x.Id == id)
                .FirstOrDefaultAsync();
        }
        else
        {
            var sessions = await LoadChatFallbackFileAsync();
            session = sessions.FirstOrDefault(s => s.Id == id);
        }

        session?.Messages?.RemoveAll(m => m.HasError || (m.Content != null && m.Content.StartsWith("[LLM Connection Error")));
        return session;
    }

    public async Task<ChatSession> SaveChatSessionAsync(ChatSession session)
    {
        if (string.IsNullOrWhiteSpace(session.Id))
        {
            session.Id = Guid.NewGuid().ToString("N");
        }

        // Never persist LLM error messages into the chat message stream
        session.Messages?.RemoveAll(m => m.HasError || (m.Content != null && m.Content.StartsWith("[LLM Connection Error")));

        session.ParticipantPersonaIds = session.Participants
            .Select(p => p.PersonaId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();
        session.IsGroupChat = session.Participants.Count > 1;
        session.UpdatedAtUtc = DateTime.UtcNow;

        if (await EnsureStorageReadyAsync() && _chatSessionsCollection != null)
        {
            // Uses built-in _id_ unique index
            await _chatSessionsCollection.ReplaceOneAsync(
                x => x.Id == session.Id,
                session,
                new ReplaceOptions { IsUpsert = true });
            return session;
        }

        var sessions = await LoadChatFallbackFileAsync();
        var existingIdx = sessions.FindIndex(s => s.Id == session.Id);
        if (existingIdx >= 0)
        {
            sessions[existingIdx] = session;
        }
        else
        {
            sessions.Insert(0, session);
        }

        await SaveChatFallbackFileAsync(sessions);
        return session;
    }

    public async Task<bool> DeleteChatSessionAsync(string id)
    {
        if (await EnsureStorageReadyAsync() && _chatSessionsCollection != null)
        {
            // Uses built-in _id_ unique index
            var res = await _chatSessionsCollection.DeleteOneAsync(x => x.Id == id);
            return res.DeletedCount > 0;
        }

        var sessions = await LoadChatFallbackFileAsync();
        var removed = sessions.RemoveAll(s => s.Id == id);
        if (removed > 0)
        {
            await SaveChatFallbackFileAsync(sessions);
            return true;
        }

        return false;
    }

    private async Task<List<PersonaCharacter>> LoadFallbackFileAsync()
    {
        if (!File.Exists(_fallbackFilePath))
        {
            var seeds = SeedPersonas.LoadFromFile(_contentRootPath, _compiler);
            await SaveFallbackFileAsync(seeds);
            return seeds;
        }

        var json = await File.ReadAllTextAsync(_fallbackFilePath);
        return JsonSerializer.Deserialize<List<PersonaCharacter>>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? new List<PersonaCharacter>();
    }

    private async Task SaveFallbackFileAsync(List<PersonaCharacter> list)
    {
        var json = JsonSerializer.Serialize(list, new JsonSerializerOptions
        {
            WriteIndented = true
        });
        await File.WriteAllTextAsync(_fallbackFilePath, json);
    }

    private async Task<List<ChatSession>> LoadChatFallbackFileAsync()
    {
        if (!File.Exists(_chatFallbackFilePath))
        {
            return new List<ChatSession>();
        }

        var json = await File.ReadAllTextAsync(_chatFallbackFilePath);
        return JsonSerializer.Deserialize<List<ChatSession>>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? new List<ChatSession>();
    }

    private async Task SaveChatFallbackFileAsync(List<ChatSession> sessions)
    {
        var json = JsonSerializer.Serialize(sessions, new JsonSerializerOptions
        {
            WriteIndented = true
        });
        await File.WriteAllTextAsync(_chatFallbackFilePath, json);
    }
}
