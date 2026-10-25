using System.Text.Json;
using Personalities.Api.Models;

namespace Personalities.Api.Services;

public class FactorCatalogService
{
    private readonly string _catalogFilePath;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public FactorCatalogService(IWebHostEnvironment env)
    {
        _catalogFilePath = Path.Combine(env.ContentRootPath, "Seeds", "factor-catalog.json");
    }

    public FactorCatalogResponse GetCatalog()
    {
        if (!File.Exists(_catalogFilePath))
        {
            return new FactorCatalogResponse();
        }

        var json = File.ReadAllText(_catalogFilePath);
        return JsonSerializer.Deserialize<FactorCatalogResponse>(json, JsonOptions)
               ?? new FactorCatalogResponse();
    }
}
