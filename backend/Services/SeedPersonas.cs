using System.Text.Json;
using Personalities.Api.Models;

namespace Personalities.Api.Services;

public static class SeedPersonas
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public static List<PersonaCharacter> LoadFromFile(string contentRootPath, PersonaCompilerService compiler)
    {
        var seedFilePath = Path.Combine(contentRootPath, "Seeds", "seed-personas.json");
        if (!File.Exists(seedFilePath))
        {
            return new List<PersonaCharacter>();
        }

        var json = File.ReadAllText(seedFilePath);
        var list = JsonSerializer.Deserialize<List<PersonaCharacter>>(json, JsonOptions)
                   ?? new List<PersonaCharacter>();

        foreach (var item in list)
        {
            compiler.CompilePersona(item);
        }

        return list;
    }
}
