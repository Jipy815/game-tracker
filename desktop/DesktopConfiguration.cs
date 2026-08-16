using System;
using System.IO;
using System.Text.Json;

namespace GamePresenceDesktop
{
    public sealed class DesktopConfiguration
    {
        public string SupabaseUrl { get; private set; }
        public string SupabaseAnonKey { get; private set; }

        public bool IsConfigured =>
            Uri.TryCreate(SupabaseUrl, UriKind.Absolute, out _) &&
            !string.IsNullOrWhiteSpace(SupabaseAnonKey);

        public static DesktopConfiguration Load()
        {
            var configuration = new DesktopConfiguration();
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var path = Path.Combine(appData, "GamePresence", "config.json");

            if (!File.Exists(path))
            {
                return configuration;
            }

            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(path));
                var root = document.RootElement;
                configuration.SupabaseUrl = root.TryGetProperty("supabase_url", out var url)
                    ? url.GetString()?.TrimEnd('/')
                    : null;
                configuration.SupabaseAnonKey = root.TryGetProperty("supabase_anon_key", out var key)
                    ? key.GetString()
                    : null;
            }
            catch (JsonException)
            {
                // Treat malformed local configuration as unconfigured. It is never logged because it can contain secrets.
            }

            return configuration;
        }
    }
}
