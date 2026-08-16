using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Xml;

namespace GamePresenceDesktop
{
    public sealed class TrayApplication : IDisposable
    {
        private readonly NotifyIcon _notifyIcon;
        private readonly ProcessMonitor _monitor;
        private DashboardForm _dashboard;

        public TrayApplication(ProcessMonitor monitor)
        {
            _monitor = monitor;
            _notifyIcon = new NotifyIcon
            {
                Visible = true,
                Text = "Game Presence Tracker",
                Icon = System.Drawing.SystemIcons.Application
            };

            var contextMenu = new ContextMenuStrip();
            var open = new ToolStripMenuItem("Open Game Presence");
            open.Click += (_, _) => OpenDashboard();
            var signOut = new ToolStripMenuItem("Sign out");
            signOut.Click += (_, _) =>
            {
                _monitor.SignOut();
                _notifyIcon.Visible = false;
                Application.Exit();
            };
            var exit = new ToolStripMenuItem("Exit");
            exit.Click += (_, _) =>
            {
                _notifyIcon.Visible = false;
                Application.Exit();
            };
            contextMenu.Items.Add(open);
            contextMenu.Items.Add(signOut);
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add(exit);
            _notifyIcon.ContextMenuStrip = contextMenu;
            _notifyIcon.DoubleClick += (_, _) => OpenDashboard();

            monitor.OnStatusChanged += status =>
            {
                _notifyIcon.BalloonTipTitle = "Game Presence";
                _notifyIcon.BalloonTipText = status;
                _notifyIcon.ShowBalloonTip(2000);
            };
        }

        private void OpenDashboard()
        {
            if (_dashboard == null || _dashboard.IsDisposed)
            {
                _dashboard = new DashboardForm(_monitor);
                _dashboard.FormClosed += (_, _) => _dashboard = null;
                _dashboard.Show();
                return;
            }

            _dashboard.Show();
            _dashboard.WindowState = FormWindowState.Normal;
            _dashboard.BringToFront();
        }

        public void Dispose()
        {
            _dashboard?.Dispose();
            _notifyIcon.Dispose();
        }
    }

    public sealed class ProcessMonitor : IDisposable
    {
        private readonly System.Threading.Timer _timer;
        private readonly HttpClient _http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        private readonly SemaphoreSlim _scanLock = new SemaphoreSlim(1, 1);
        private readonly Dictionary<string, string> _whitelist = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { "dota2.exe", "Dota 2" },
            { "valorant.exe", "VALORANT" },
            { "cs2.exe", "Counter-Strike 2" }
        };
        private readonly DesktopConfiguration _configuration;
        private SupabaseAuth _auth;
        private string _currentExe;
        private string _activeSessionId;
        private DateTime? _startedAt;
        private DateTime _lastPresenceSyncAt;
        private bool _stopped;

        public event Action<string> OnStatusChanged;

        public ProcessMonitor()
        {
            _configuration = DesktopConfiguration.Load();
            if (_configuration.IsConfigured)
            {
                _auth = new SupabaseAuth(_configuration.SupabaseUrl, _configuration.SupabaseAnonKey);
            }

            _timer = new System.Threading.Timer(CheckProcesses, null, Timeout.Infinite, Timeout.Infinite);
        }

        public bool IsConfigured => _configuration.IsConfigured;
        public string UserEmail => _auth?.UserEmail;
        public string CurrentGame => _currentExe != null && _whitelist.TryGetValue(_currentExe, out var game) ? game : null;
        public DateTime LastPresenceSyncAt => _lastPresenceSyncAt;

        public async Task<bool> RestoreSessionAsync() =>
            _auth != null && await _auth.RestoreSessionAsync();

        public async Task<bool> SignInAsync(string email, string password)
        {
            if (!IsConfigured)
            {
                return false;
            }

            _auth?.Dispose();
            _auth = new SupabaseAuth(_configuration.SupabaseUrl, _configuration.SupabaseAnonKey);
            return await _auth.SignInAsync(email, password);
        }

        public async Task<PartnerProfile> GetLinkedPartnerAsync()
        {
            var userId = await GetAuthenticatedUserIdAsync();
            using var ownResponse = await SendJsonAsync(
                HttpMethod.Get,
                "/rest/v1/profiles?select=partner_id&id=eq." + Uri.EscapeDataString(userId) + "&limit=1",
                null,
                null);
            using var ownDocument = JsonDocument.Parse(await ownResponse.Content.ReadAsStringAsync());
            var ownProfile = ownDocument.RootElement.EnumerateArray().FirstOrDefault();
            if (ownProfile.ValueKind != JsonValueKind.Object ||
                !ownProfile.TryGetProperty("partner_id", out var partnerIdElement) ||
                partnerIdElement.ValueKind == JsonValueKind.Null ||
                string.IsNullOrWhiteSpace(partnerIdElement.GetString()))
            {
                return null;
            }

            var partnerId = partnerIdElement.GetString();
            using var partnerResponse = await SendJsonAsync(
                HttpMethod.Get,
                "/rest/v1/profiles?select=id,display_name,email&id=eq." + Uri.EscapeDataString(partnerId) + "&limit=1",
                null,
                null);
            using var partnerDocument = JsonDocument.Parse(await partnerResponse.Content.ReadAsStringAsync());
            var partner = partnerDocument.RootElement.EnumerateArray().FirstOrDefault();
            if (partner.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            return new PartnerProfile
            {
                Id = partner.GetProperty("id").GetString(),
                DisplayName = partner.TryGetProperty("display_name", out var name) && name.ValueKind != JsonValueKind.Null ? name.GetString() : null,
                Email = partner.TryGetProperty("email", out var email) && email.ValueKind != JsonValueKind.Null ? email.GetString() : null
            };
        }

        public async Task<ConnectionCode> CreatePartnerConnectionCodeAsync()
        {
            using var response = await SendJsonAsync(HttpMethod.Post, "/rest/v1/rpc/create_partner_connection_code", new { }, null);
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var code = document.RootElement.EnumerateArray().FirstOrDefault();
            if (code.ValueKind != JsonValueKind.Object || !code.TryGetProperty("code", out var codeValue))
            {
                throw new JsonException("Supabase did not return a connection code.");
            }

            return new ConnectionCode
            {
                Code = codeValue.GetString(),
                ExpiresAt = code.TryGetProperty("expires_at", out var expiresAt) ? expiresAt.GetDateTime() : DateTime.UtcNow.AddMinutes(15)
            };
        }

        public async Task DisconnectPartnerAsync()
        {
            using var _ = await SendJsonAsync(HttpMethod.Post, "/rest/v1/rpc/disconnect_partner", new { }, null);
            OnStatusChanged?.Invoke("Partner disconnected.");
        }

        public void SignOut()
        {
            _auth?.SignOut();
            OnStatusChanged?.Invoke("Signed out.");
        }

        public void Start()
        {
            if (_stopped)
            {
                throw new InvalidOperationException("A stopped monitor cannot be restarted.");
            }

            _timer.Change(0, 5000);
        }

        public void Stop()
        {
            if (_stopped)
            {
                return;
            }

            _stopped = true;
            _timer.Change(Timeout.Infinite, Timeout.Infinite);
            StopAsync().GetAwaiter().GetResult();
        }

        private async Task StopAsync()
        {
            await _scanLock.WaitAsync();
            try
            {
                if (_currentExe != null)
                {
                    await EndCurrentGameAsync(true);
                }
                else if (_auth != null)
                {
                    await SendPresenceAsync("offline", null, null, null);
                }
            }
            catch (Exception)
            {
                // The next sign-in can recover an open session; do not disclose auth or network details in UI notifications.
            }
            finally
            {
                _scanLock.Release();
            }
        }

        private async void CheckProcesses(object state)
        {
            if (_stopped || !await _scanLock.WaitAsync(0))
            {
                return;
            }

            try
            {
                var foundExe = FindRunningWhitelistedExecutable();
                if (foundExe != null && !string.Equals(_currentExe, foundExe, StringComparison.OrdinalIgnoreCase))
                {
                    await BeginGameAsync(foundExe, _whitelist[foundExe]);
                }
                else if (foundExe == null && _currentExe != null)
                {
                    await EndCurrentGameAsync(false);
                }
                else if (ShouldSyncPresence())
                {
                    await SendPresenceAsync(
                        foundExe == null ? "online" : "playing",
                        foundExe == null ? null : _whitelist[foundExe],
                        foundExe == null ? null : _startedAt,
                        foundExe);
                }
            }
            catch (UnauthorizedAccessException)
            {
                OnStatusChanged?.Invoke("Session expired. Please sign in again.");
            }
            catch (HttpRequestException)
            {
                OnStatusChanged?.Invoke("Unable to update game presence. Retrying shortly.");
            }
            catch (JsonException)
            {
                OnStatusChanged?.Invoke("Supabase returned an unexpected response. Retrying shortly.");
            }
            finally
            {
                _scanLock.Release();
            }
        }

        private string FindRunningWhitelistedExecutable()
        {
            foreach (var process in Process.GetProcesses())
            {
                using (process)
                {
                    try
                    {
                        var executable = Path.GetFileName(process.MainModule?.FileName);
                        if (!string.IsNullOrWhiteSpace(executable) && _whitelist.ContainsKey(executable))
                        {
                            return executable;
                        }
                    }
                    catch (InvalidOperationException) { }
                    catch (System.ComponentModel.Win32Exception) { }
                }
            }

            return null;
        }

        private async Task BeginGameAsync(string executable, string gameName)
        {
            var existingSession = await FindOpenSessionAsync(executable);
            _activeSessionId = existingSession?.Id;
            _startedAt = existingSession?.StartTime ?? DateTime.UtcNow;

            await SendPresenceAsync("playing", gameName, _startedAt, executable);
            if (_activeSessionId == null)
            {
                _activeSessionId = await InsertSessionStartAsync(gameName, executable, _startedAt.Value);
            }

            _currentExe = executable;
            OnStatusChanged?.Invoke(existingSession == null
                ? $"Started playing {gameName}"
                : $"Resumed tracking {gameName}");
        }

        private async Task EndCurrentGameAsync(bool goingOffline)
        {
            var executable = _currentExe;
            var gameName = _whitelist.TryGetValue(executable, out var mappedName) ? mappedName : executable;
            var startedAt = _startedAt ?? DateTime.UtcNow;
            var endedAt = DateTime.UtcNow;

            if (_activeSessionId == null)
            {
                _activeSessionId = (await FindOpenSessionAsync(executable))?.Id;
            }

            if (_activeSessionId != null)
            {
                await CompleteSessionAsync(_activeSessionId, startedAt, endedAt);
            }

            await SendPresenceAsync(goingOffline ? "offline" : "online", null, null, null);
            _currentExe = null;
            _activeSessionId = null;
            _startedAt = null;
            OnStatusChanged?.Invoke($"Stopped playing {gameName}");
        }

        private bool ShouldSyncPresence() => DateTime.UtcNow - _lastPresenceSyncAt >= TimeSpan.FromSeconds(30);

        private async Task SendPresenceAsync(string status, string gameName, DateTime? startedAt, string executable)
        {
            var userId = await GetAuthenticatedUserIdAsync();
            var payload = new Dictionary<string, object>
            {
                ["user_id"] = userId,
                ["status"] = status,
                ["current_game"] = gameName,
                ["current_executable"] = executable,
                ["started_at"] = startedAt?.ToString("o"),
                ["updated_at"] = DateTime.UtcNow.ToString("o")
            };
            using var response = await SendJsonAsync(HttpMethod.Post, "/rest/v1/presence", payload, "resolution=merge-duplicates,return=minimal");
            _lastPresenceSyncAt = DateTime.UtcNow;
        }

        private async Task<string> InsertSessionStartAsync(string gameName, string executable, DateTime startedAt)
        {
            var userId = await GetAuthenticatedUserIdAsync();
            var payload = new
            {
                user_id = userId,
                game_name = gameName,
                executable_name = executable,
                start_time = startedAt.ToString("o")
            };

            using var response = await SendJsonAsync(HttpMethod.Post, "/rest/v1/game_sessions", payload, "return=representation");
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var session = document.RootElement.EnumerateArray().FirstOrDefault();
            if (session.ValueKind != JsonValueKind.Object || !session.TryGetProperty("id", out var id))
            {
                throw new JsonException("Supabase did not return the created game session.");
            }

            return id.GetString();
        }

        private async Task CompleteSessionAsync(string sessionId, DateTime startedAt, DateTime endedAt)
        {
            var duration = endedAt - startedAt;
            var payload = new
            {
                end_time = endedAt.ToString("o"),
                duration = XmlConvert.ToString(duration)
            };
            using var response = await SendJsonAsync(HttpMethod.Patch, $"/rest/v1/game_sessions?id=eq.{Uri.EscapeDataString(sessionId)}", payload, "return=minimal");
        }

        private async Task<OpenSession> FindOpenSessionAsync(string executable)
        {
            var userId = await GetAuthenticatedUserIdAsync();
            var path = "/rest/v1/game_sessions?select=id,start_time&user_id=eq." + Uri.EscapeDataString(userId) +
                       "&executable_name=eq." + Uri.EscapeDataString(executable) +
                       "&end_time=is.null&order=start_time.desc&limit=1";
            using var response = await SendJsonAsync(HttpMethod.Get, path, null, null);
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var session = document.RootElement.EnumerateArray().FirstOrDefault();
            if (session.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            return new OpenSession
            {
                Id = session.GetProperty("id").GetString(),
                StartTime = session.GetProperty("start_time").GetDateTime()
            };
        }

        private async Task<string> GetAuthenticatedUserIdAsync()
        {
            if (_auth == null || string.IsNullOrWhiteSpace(await _auth.GetAccessTokenAsync()) || string.IsNullOrWhiteSpace(_auth.UserId))
            {
                throw new UnauthorizedAccessException();
            }

            return _auth.UserId;
        }

        private async Task<HttpResponseMessage> SendJsonAsync(HttpMethod method, string path, object payload, string prefer)
        {
            if (_auth == null)
            {
                throw new UnauthorizedAccessException();
            }

            var accessToken = await _auth.GetAccessTokenAsync();
            if (string.IsNullOrWhiteSpace(accessToken))
            {
                throw new UnauthorizedAccessException();
            }

            var request = new HttpRequestMessage(method, _configuration.SupabaseUrl + path);
            request.Headers.Add("apikey", _configuration.SupabaseAnonKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            if (!string.IsNullOrWhiteSpace(prefer))
            {
                request.Headers.Add("Prefer", prefer);
            }
            if (payload != null)
            {
                request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            }

            var response = await _http.SendAsync(request);
            response.EnsureSuccessStatusCode();
            return response;
        }

        public void Dispose()
        {
            Stop();
            _timer.Dispose();
            _scanLock.Dispose();
            _http.Dispose();
            _auth?.Dispose();
        }

        private sealed class OpenSession
        {
            public string Id { get; set; }
            public DateTime StartTime { get; set; }
        }

        public sealed class PartnerProfile
        {
            public string Id { get; set; }
            public string DisplayName { get; set; }
            public string Email { get; set; }
            public string Label => !string.IsNullOrWhiteSpace(DisplayName) ? DisplayName : Email ?? "Connected partner";
        }

        public sealed class ConnectionCode
        {
            public string Code { get; set; }
            public DateTime ExpiresAt { get; set; }
        }
    }
}
