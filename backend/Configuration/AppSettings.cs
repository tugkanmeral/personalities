namespace Personalities.Api.Configuration;

public class MongoDbSettings
{
    public string ConnectionString { get; set; } = "mongodb://localhost:27017";
    public string DatabaseName { get; set; } = "PersonalitiesDb";
    public string PersonasCollectionName { get; set; } = "Personas";
    public string ArenaHistoryCollectionName { get; set; } = "ArenaSessions";
}

public class LlmSettings
{
    public string DefaultProvider { get; set; } = "Gemini"; // "Gemini" or "Ollama"
    public GeminiSettings Gemini { get; set; } = new();
    public OllamaSettings Ollama { get; set; } = new();
}

public class GeminiSettings
{
    public string ApiKey { get; set; } = "";
    public string DefaultModel { get; set; } = "gemini-2.5-flash";
}

public class OllamaSettings
{
    public string BaseUrl { get; set; } = "http://localhost:11434";
    public string DefaultModel { get; set; } = "hf.co/inclusionAI/Ling-3.0-tiny-GGUF:Q4_K_M";
}
