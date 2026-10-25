using System.Text.Json;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Personalities.Api.Configuration;
using Personalities.Api.Models;
using Personalities.Api.Services;

namespace Personalities.Api.Repositories;

public class PersonaRepository
{
    private readonly MongoDbSettings _settings;
    private readonly PersonaCompilerService _compiler;
    private readonly ILogger<PersonaRepository> _logger;
    private readonly string _contentRootPath;
    private readonly string _fallbackFilePath;
    private readonly SemaphoreSlim _lock = new(1, 1);

    private IMongoCollection<PersonaCharacter>? _personasCollection;
    private IMongoCollection<ArenaAskResponse>? _arenaHistoryCollection;
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
                _mongoAvailable = true;

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

    public async Task<List<PersonaCharacter>> GetAllAsync()
    {
        if (await EnsureStorageReadyAsync() && _personasCollection != null)
        {
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

        _compiler.CompilePersona(persona);

        if (await EnsureStorageReadyAsync() && _personasCollection != null)
        {
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
}
