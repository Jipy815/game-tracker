using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace GamePresenceDesktop
{
    // Minimal GoTrue client. Only the encrypted session is persisted; passwords never leave memory.
    public sealed class SupabaseAuth : IDisposable
    {
        private readonly string _supabaseUrl;
        private readonly string _anonKey;
        private readonly HttpClient _http = new HttpClient();
        private readonly string _storagePath;
        private TokenInfo _token;

        public SupabaseAuth(string supabaseUrl, string anonKey)
        {
            _supabaseUrl = supabaseUrl?.TrimEnd('/') ?? throw new ArgumentNullException(nameof(supabaseUrl));
            _anonKey = string.IsNullOrWhiteSpace(anonKey) ? throw new ArgumentNullException(nameof(anonKey)) : anonKey;
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            _storagePath = Path.Combine(appData, "GamePresence", "token.bin");
            LoadToken();
        }

        public bool HasStoredSession => _token != null && !string.IsNullOrWhiteSpace(_token.RefreshToken);
        public string UserId => _token?.UserId;

        public async Task<bool> RestoreSessionAsync()
        {
            if (!HasStoredSession)
            {
                return false;
            }

            return !string.IsNullOrWhiteSpace(await GetAccessTokenAsync());
        }

        public async Task<bool> SignInAsync(string email, string password)
        {
            try
            {
                using var request = CreateRequest(HttpMethod.Post, "/auth/v1/token?grant_type=password");
                request.Content = new StringContent(
                    JsonSerializer.Serialize(new { email, password }),
                    Encoding.UTF8,
                    "application/json");

                using var response = await _http.SendAsync(request);
                if (!response.IsSuccessStatusCode)
                {
                    return false;
                }

                await SetTokenFromResponseAsync(response);
                return !string.IsNullOrWhiteSpace(UserId);
            }
            catch (HttpRequestException)
            {
                return false;
            }
            catch (JsonException)
            {
                return false;
            }
        }

        public async Task<string> GetAccessTokenAsync()
        {
            if (_token == null)
            {
                return null;
            }

            if (_token.ExpiresAt <= DateTime.UtcNow)
            {
                if (!await RefreshTokenAsync())
                {
                    ClearToken();
                    return null;
                }
            }

            return _token.AccessToken;
        }

        private async Task<bool> RefreshTokenAsync()
        {
            if (string.IsNullOrWhiteSpace(_token?.RefreshToken))
            {
                return false;
            }

            try
            {
                using var request = CreateRequest(HttpMethod.Post, "/auth/v1/token?grant_type=refresh_token");
                request.Content = new StringContent(
                    JsonSerializer.Serialize(new { refresh_token = _token.RefreshToken }),
                    Encoding.UTF8,
                    "application/json");
                using var response = await _http.SendAsync(request);
                if (!response.IsSuccessStatusCode)
                {
                    return false;
                }

                await SetTokenFromResponseAsync(response);
                return true;
            }
            catch (HttpRequestException)
            {
                return false;
            }
            catch (JsonException)
            {
                return false;
            }
        }

        private HttpRequestMessage CreateRequest(HttpMethod method, string path)
        {
            var request = new HttpRequestMessage(method, $"{_supabaseUrl}{path}");
            request.Headers.Add("apikey", _anonKey);
            return request;
        }

        private async Task SetTokenFromResponseAsync(HttpResponseMessage response)
        {
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var root = document.RootElement;
            var userId = root.TryGetProperty("user", out var user) && user.TryGetProperty("id", out var id)
                ? id.GetString()
                : GetSubject(root.GetProperty("access_token").GetString());

            _token = new TokenInfo
            {
                AccessToken = root.GetProperty("access_token").GetString(),
                RefreshToken = root.GetProperty("refresh_token").GetString(),
                UserId = userId,
                ExpiresAt = DateTime.UtcNow.AddSeconds(Math.Max(0, root.GetProperty("expires_in").GetInt32() - 30))
            };
            SaveToken();
        }

        private static string GetSubject(string accessToken)
        {
            if (string.IsNullOrWhiteSpace(accessToken))
            {
                return null;
            }

            try
            {
                var segment = accessToken.Split('.')[1].Replace('-', '+').Replace('_', '/');
                segment = segment.PadRight(segment.Length + (4 - segment.Length % 4) % 4, '=');
                using var document = JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(segment)));
                return document.RootElement.TryGetProperty("sub", out var subject) ? subject.GetString() : null;
            }
            catch (FormatException)
            {
                return null;
            }
            catch (IndexOutOfRangeException)
            {
                return null;
            }
            catch (JsonException)
            {
                return null;
            }
        }

        private void SaveToken()
        {
            var directory = Path.GetDirectoryName(_storagePath);
            Directory.CreateDirectory(directory);
            var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(_token));
            var protectedBytes = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(_storagePath, protectedBytes);
        }

        private void LoadToken()
        {
            try
            {
                if (!File.Exists(_storagePath))
                {
                    return;
                }

                var protectedBytes = File.ReadAllBytes(_storagePath);
                var bytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
                _token = JsonSerializer.Deserialize<TokenInfo>(Encoding.UTF8.GetString(bytes));
                if (string.IsNullOrWhiteSpace(_token?.UserId))
                {
                    _token.UserId = GetSubject(_token.AccessToken);
                }
            }
            catch (CryptographicException)
            {
                ClearToken();
            }
            catch (JsonException)
            {
                ClearToken();
            }
        }

        private void ClearToken()
        {
            _token = null;
            try
            {
                if (File.Exists(_storagePath))
                {
                    File.Delete(_storagePath);
                }
            }
            catch (IOException)
            {
                // A stale encrypted session is harmless and will be replaced after the next sign-in.
            }
        }

        public void Dispose() => _http.Dispose();

        private sealed class TokenInfo
        {
            public string AccessToken { get; set; }
            public string RefreshToken { get; set; }
            public string UserId { get; set; }
            public DateTime ExpiresAt { get; set; }
        }
    }
}
