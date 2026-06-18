using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Security.Cryptography;

namespace GamePresenceDesktop
{
    // Minimal Supabase GoTrue auth helper for desktop apps.
    // Stores tokens encrypted in %APPDATA%/GamePresence/token.bin using DPAPI (CurrentUser scope).
    public class SupabaseAuth
    {
        private readonly string _supabaseUrl;
        private readonly HttpClient _http = new HttpClient();
        private TokenInfo _token;
        private readonly string _storagePath;

        public SupabaseAuth(string supabaseUrl)
        {
            _supabaseUrl = supabaseUrl.TrimEnd('/');
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            _storagePath = Path.Combine(appData, "GamePresence", "token.bin");
            LoadToken();
        }

        public async Task<bool> SignInAsync(string email, string password)
        {
            try
            {
                var url = $"{_supabaseUrl}/auth/v1/token?grant_type=password";
                var payload = new { email = email, password = password };
                var resp = await _http.PostAsync(url, new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"));
                if (!resp.IsSuccessStatusCode) return false;
                var json = await resp.Content.ReadAsStringAsync();
                var doc = JsonDocument.Parse(json).RootElement;
                _token = new TokenInfo
                {
                    AccessToken = doc.GetProperty("access_token").GetString(),
                    RefreshToken = doc.GetProperty("refresh_token").GetString(),
                    ExpiresAt = DateTime.UtcNow.AddSeconds(doc.GetProperty("expires_in").GetInt32() - 30)
                };
                SaveToken();
                return true;
            }
            catch
            {
                return false;
            }
        }

        public async Task<string> GetAccessTokenAsync()
        {
            if (_token == null) return null;
            if (_token.ExpiresAt <= DateTime.UtcNow)
            {
                var ok = await RefreshTokenAsync();
                if (!ok) return null;
            }
            return _token.AccessToken;
        }

        private async Task<bool> RefreshTokenAsync()
        {
            try
            {
                var url = $"{_supabaseUrl}/auth/v1/token?grant_type=refresh_token";
                var payload = new { refresh_token = _token.RefreshToken };
                var resp = await _http.PostAsync(url, new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"));
                if (!resp.IsSuccessStatusCode) return false;
                var json = await resp.Content.ReadAsStringAsync();
                var doc = JsonDocument.Parse(json).RootElement;
                _token.AccessToken = doc.GetProperty("access_token").GetString();
                _token.RefreshToken = doc.GetProperty("refresh_token").GetString();
                _token.ExpiresAt = DateTime.UtcNow.AddSeconds(doc.GetProperty("expires_in").GetInt32() - 30);
                SaveToken();
                return true;
            }
            catch
            {
                return false;
            }
        }

        private void SaveToken()
        {
            try
            {
                var dir = Path.GetDirectoryName(_storagePath);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(_token));
                var protectedBytes = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser);
                File.WriteAllBytes(_storagePath, protectedBytes);
            }
            catch { }
        }

        private void LoadToken()
        {
            try
            {
                if (!File.Exists(_storagePath)) return;
                var protectedBytes = File.ReadAllBytes(_storagePath);
                var bytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
                _token = JsonSerializer.Deserialize<TokenInfo>(Encoding.UTF8.GetString(bytes));
            }
            catch { }
        }

        private class TokenInfo
        {
            public string AccessToken { get; set; }
            public string RefreshToken { get; set; }
            public DateTime ExpiresAt { get; set; }
        }
    }
}
