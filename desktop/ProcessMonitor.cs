using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.IO;

namespace GamePresenceDesktop
{
    public class TrayApplication
    {
        private readonly NotifyIcon _notifyIcon;
        private readonly ProcessMonitor _monitor;

        public TrayApplication(ProcessMonitor monitor)
        {
            _monitor = monitor;
            _notifyIcon = new NotifyIcon();
            _notifyIcon.Visible = true;
            _notifyIcon.Text = "Game Presence Tracker";
            _notifyIcon.Icon = System.Drawing.SystemIcons.Application;

            var ctx = new ContextMenuStrip();
            var exit = new ToolStripMenuItem("Exit");
            exit.Click += (s, e) => {
                _notifyIcon.Visible = false;
                Application.Exit();
            };
            ctx.Items.Add(exit);
            _notifyIcon.ContextMenuStrip = ctx;

            _monitor.OnStatusChanged += status => {
                _notifyIcon.BalloonTipTitle = "Game Presence";
                _notifyIcon.BalloonTipText = status;
                _notifyIcon.ShowBalloonTip(2000);
            };
        }
    }

    public class ProcessMonitor
    {
        private readonly Timer _timer;
        private readonly HttpClient _http;
        private readonly Dictionary<string,string> _whitelist;
        private string _currentExe = null;
        private DateTime? _startedAt = null;

        // Supabase settings (can be provided in config file at %APPDATA%/GamePresence/config.json)
        private readonly string _supabaseUrl;
        private SupabaseAuth _auth;

        public event Action<string> OnStatusChanged;

        public ProcessMonitor()
        {
            _http = new HttpClient();

            // Load config if present
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var cfgPath = Path.Combine(appData, "GamePresence", "config.json");
            if (File.Exists(cfgPath))
            {
                try
                {
                    var cfg = JsonDocument.Parse(File.ReadAllText(cfgPath)).RootElement;
                    _supabaseUrl = cfg.GetProperty("supabase_url").GetString();
                    var email = cfg.GetProperty("email").GetString();
                    var password = cfg.GetProperty("password").GetString();
                    _auth = new SupabaseAuth(_supabaseUrl);
                    // Attempt sign-in (if token exists this is quick)
                    _auth.SignInAsync(email, password).Wait();
                }
                catch
                {
                    _supabaseUrl = "https://your-project.supabase.co";
                }
            }
            else
            {
                _supabaseUrl = "https://your-project.supabase.co";
            }
            _whitelist = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                {"dota2.exe","Dota 2"},
                {"valorant.exe","VALORANT"},
                {"cs2.exe","Counter-Strike 2"},
                // Add more mappings here
            };

            _timer = new Timer(CheckProcesses, null, Timeout.Infinite, Timeout.Infinite);
        }

        public bool IsAuthenticated => _auth != null;

        public async Task<bool> SignInAsync(string email, string password)
        {
            try
            {
                _auth = new SupabaseAuth(_supabaseUrl);
                var ok = await _auth.SignInAsync(email, password);
                if (!ok)
                {
                    _auth = null;
                    return false;
                }
                // Persist credentials (for convenience) - encrypted token file stored by SupabaseAuth
                SaveCredentials(email, password);
                return true;
            }
            catch
            {
                _auth = null;
                return false;
            }
        }

        public void SaveCredentials(string email, string password)
        {
            try
            {
                var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                var dir = Path.Combine(appData, "GamePresence");
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                var cfgPath = Path.Combine(dir, "config.json");
                var cfg = JsonSerializer.Serialize(new { supabase_url = _supabaseUrl, email = email, password = password });
                File.WriteAllText(cfgPath, cfg);
            }
            catch { }
        }

        public void Start()
        {
            _timer.Change(0, 5000);
        }

        public void Stop()
        {
            _timer.Change(Timeout.Infinite, Timeout.Infinite);
            _http.Dispose();
        }

        private void CheckProcesses(object state)
        {
            try
            {
                var procs = Process.GetProcesses();
                string foundExe = null;

                foreach (var p in procs)
                {
                    string name = null;
                    try { name = p.MainModule.FileName; } catch { }
                    if (string.IsNullOrEmpty(name))
                        continue;
                    var exe = System.IO.Path.GetFileName(name);
                    if (_whitelist.TryGetValue(exe, out var gameName))
                    {
                        foundExe = exe;
                        if (_currentExe != exe)
                        {
                            // new game started
                            _currentExe = exe;
                            _startedAt = DateTime.UtcNow;
                            SendPresence("playing", gameName, _startedAt.Value).Wait();
                            OnStatusChanged?.Invoke($"Started playing {gameName}");
                            // Insert session start
                            InsertSessionStart(gameName, exe, _startedAt.Value).Wait();
                        }
                        break;
                    }
                }

                if (foundExe == null && _currentExe != null)
                {
                    // game ended
                    var endedExe = _currentExe;
                    var gameName = _whitelist.ContainsKey(endedExe) ? _whitelist[endedExe] : endedExe;
                    var start = _startedAt ?? DateTime.UtcNow;
                    var end = DateTime.UtcNow;
                    var duration = end - start;

                    // Update session with end time
                    InsertSessionEnd(gameName, endedExe, start, end, duration).Wait();

                    // Clear presence
                    _currentExe = null;
                    _startedAt = null;
                    SendPresence("offline", null, null).Wait();
                    OnStatusChanged?.Invoke($"Stopped playing {gameName} ({duration:c})");
                }

                if (foundExe == null && _currentExe == null)
                {
                    // remain offline - optional keepalive
                }
            }
            catch (Exception ex)
            {
                // swallow exceptions, but could log
            }
        }

        private async Task SendPresence(string status, string game, DateTime? startedAt)
        {
            var payload = new Dictionary<string, object>
            {
                {"user_id", "REPLACE_WITH_USER_UUID"},
                {"status", status}
            };
            if (status == "playing")
            {
                payload["current_game"] = game;
                payload["started_at"] = startedAt?.ToString("o");
            }

            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            // Upsert into presence (use REST or RPC depending on your Supabase setup)
            var url = $"{_supabaseUrl}/rest/v1/presence"; // requires PostgREST configured
            var req = new HttpRequestMessage(new HttpMethod("POST"), url);
            req.Content = content;
            // Use upsert header to allow upsert (if PostgREST supports)
            req.Headers.Add("Prefer", "resolution=merge-duplicates");

            var resp = await _http.SendAsync(req);
            // Optionally handle response and errors
        }

        private async Task InsertSessionStart(string gameName, string exe, DateTime startTime)
        {
            var payload = new Dictionary<string, object>
            {
                {"user_id", "REPLACE_WITH_USER_UUID"},
                {"game_name", gameName},
                {"executable_name", exe},
                {"start_time", startTime.ToString("o")}
            };
            var json = JsonSerializer.Serialize(payload);
            var resp = await _http.PostAsync($"{_supabaseUrl}/rest/v1/game_sessions", new StringContent(json, Encoding.UTF8, "application/json"));
        }

        private async Task InsertSessionEnd(string gameName, string exe, DateTime startTime, DateTime endTime, TimeSpan duration)
        {
            // This example inserts a new session row with start and end; alternatively update the previously-created row
            var payload = new Dictionary<string, object>
            {
                {"user_id", "REPLACE_WITH_USER_UUID"},
                {"game_name", gameName},
                {"executable_name", exe},
                {"start_time", startTime.ToString("o")},
                {"end_time", endTime.ToString("o")},
                {"duration", XmlConvert.ToString(duration)}
            };
            var json = JsonSerializer.Serialize(payload);
            var resp = await _http.PostAsync($"{_supabaseUrl}/rest/v1/game_sessions", new StringContent(json, Encoding.UTF8, "application/json"));
        }
    }
}
