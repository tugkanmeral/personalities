using System.Diagnostics;
using System.Security.Authentication;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Personalities.Api.Configuration;
using Xunit.Abstractions;

namespace Personalities.Api.Tests;

public class GeminiConnectionTests
{
    private readonly ITestOutputHelper _output;

    public GeminiConnectionTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact]
    public async Task Gemini_ShouldRespondTo_Hello_FromAppsettings()
    {
        var repoRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
        var appSettingsPath = Path.Combine(repoRoot, "backend", "appsettings.json");
        var config = new ConfigurationBuilder()
            .AddJsonFile(appSettingsPath, optional: false)
            .Build();

        var llmSettings = new LlmSettings();
        config.GetSection("LlmSettings").Bind(llmSettings);

        var apiKey = llmSettings.Gemini.ApiKey.Trim();
        var configuredModel = llmSettings.Gemini.DefaultModel.Trim();

        using var handler = new SocketsHttpHandler
        {
            ConnectTimeout = TimeSpan.FromSeconds(8),
            SslOptions = new System.Net.Security.SslClientAuthenticationOptions
            {
                EnabledSslProtocols = SslProtocols.Tls12
            }
        };

        using var httpClient = new HttpClient(handler);

        var candidateModels = new[]
        {
            configuredModel,
            "gemini-3.5-flash",
            "gemini-3.5-flash-lite",
            "gemini-flash-latest"
        }.Distinct().ToArray();

        string? workingResponse = null;

        foreach (var model in candidateModels)
        {
            var sw = Stopwatch.StartNew();
            var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={Uri.EscapeDataString(apiKey)}";
            var payload = JsonSerializer.Serialize(new
            {
                contents = new[]
                {
                    new { role = "user", parts = new[] { new { text = "hello" } } }
                }
            });

            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
                using var req = new HttpRequestMessage(HttpMethod.Post, url)
                {
                    Version = System.Net.HttpVersion.Version11,
                    VersionPolicy = HttpVersionPolicy.RequestVersionExact,
                    Content = new StringContent(payload, Encoding.UTF8, "application/json")
                };

                using var res = await httpClient.SendAsync(req, cts.Token);
                var body = await res.Content.ReadAsStringAsync(cts.Token);
                _output.WriteLine($"Model '{model}' ({sw.ElapsedMilliseconds} ms) -> HTTP {(int)res.StatusCode}: {body[..Math.Min(300, body.Length)]}");

                if (res.IsSuccessStatusCode)
                {
                    workingResponse = body;
                    break;
                }
            }
            catch (Exception ex)
            {
                _output.WriteLine($"Model '{model}' ({sw.ElapsedMilliseconds} ms) -> ERROR: {ex.GetType().Name}: {ex.Message}");
            }
        }

        Assert.False(string.IsNullOrWhiteSpace(workingResponse), "No model returned HTTP 200 OK. Check test output for details.");
    }
}
