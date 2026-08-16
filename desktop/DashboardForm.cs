using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace GamePresenceDesktop
{
    public sealed class DashboardForm : Form
    {
        private readonly ProcessMonitor _monitor;
        private readonly Label _partnerValue;
        private readonly Label _gameValue;
        private readonly Label _syncValue;
        private readonly Label _notice;
        private readonly System.Windows.Forms.Timer _refreshTimer;

        public DashboardForm(ProcessMonitor monitor)
        {
            _monitor = monitor;
            Text = "Game Presence";
            Width = 490;
            Height = 365;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.White;

            var title = new Label { Text = "Game Presence", Font = new Font("Segoe UI", 18, FontStyle.Bold), Left = 28, Top = 24, Width = 260, Height = 36 };
            var account = new Label { Text = _monitor.UserEmail ?? "Signed in", Font = new Font("Segoe UI", 10), ForeColor = Color.FromArgb(80, 80, 80), Left = 30, Top = 62, Width = 390, Height = 24 };
            var partnerLabel = LabelFor("Connected partner", 104);
            _partnerValue = ValueFor("Loading…", 128);
            var gameLabel = LabelFor("Tracker", 168);
            _gameValue = ValueFor("Looking for supported games", 192);
            var syncLabel = LabelFor("Presence sync", 232);
            _syncValue = ValueFor("Starting…", 256);
            _notice = new Label { Left = 30, Top = 284, Width = 410, Height = 25, Font = new Font("Segoe UI", 9), ForeColor = Color.FromArgb(80, 80, 80) };
            var disconnect = new Button { Text = "Disconnect partner", Left = 30, Top = 314, Width = 142, Height = 30 };
            var signOut = new Button { Text = "Sign out", Left = 350, Top = 314, Width = 90, Height = 30 };
            disconnect.Click += async (_, _) => await DisconnectAsync();
            signOut.Click += (_, _) =>
            {
                _monitor.SignOut();
                Application.Exit();
            };

            Controls.AddRange(new Control[] { title, account, partnerLabel, _partnerValue, gameLabel, _gameValue, syncLabel, _syncValue, _notice, disconnect, signOut });
            _refreshTimer = new System.Windows.Forms.Timer { Interval = 5000 };
            _refreshTimer.Tick += async (_, _) => await RefreshAsync();
            Load += async (_, _) =>
            {
                _monitor.OnStatusChanged += OnMonitorStatusChanged;
                await RefreshAsync();
                _refreshTimer.Start();
            };
            FormClosed += (_, _) =>
            {
                _refreshTimer.Dispose();
                _monitor.OnStatusChanged -= OnMonitorStatusChanged;
            };
        }

        private static Label LabelFor(string text, int top) => new Label
        {
            Text = text,
            Font = new Font("Segoe UI", 9, FontStyle.Bold),
            ForeColor = Color.FromArgb(85, 85, 85),
            Left = 30,
            Top = top,
            Width = 390,
            Height = 20
        };

        private static Label ValueFor(string text, int top) => new Label
        {
            Text = text,
            Font = new Font("Segoe UI", 12),
            Left = 30,
            Top = top,
            Width = 390,
            Height = 28
        };

        private async Task RefreshAsync()
        {
            _gameValue.Text = _monitor.CurrentGame ?? "Online — not playing a supported game";
            _syncValue.Text = _monitor.LastPresenceSyncAt == default
                ? "Connecting…"
                : $"Active — last update {_monitor.LastPresenceSyncAt.ToLocalTime():t}";
            try
            {
                var partner = await _monitor.GetLinkedPartnerAsync();
                _partnerValue.Text = partner?.Label ?? "No partner connected";
            }
            catch
            {
                _partnerValue.Text = "Unable to load partner status";
            }
        }

        private async Task DisconnectAsync()
        {
            if (MessageBox.Show("Disconnect this partner? You can connect again with a new code.", "Disconnect partner", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
            {
                return;
            }

            try
            {
                await _monitor.DisconnectPartnerAsync();
                using var connection = new ConnectWithPartnerForm(_monitor);
                connection.ShowDialog(this);
                await RefreshAsync();
            }
            catch
            {
                _notice.Text = "We could not disconnect your partner. Please try again.";
            }
        }

        private void OnMonitorStatusChanged(string message)
        {
            if (!IsHandleCreated || IsDisposed) return;
            BeginInvoke(new Action(() => _notice.Text = message));
        }
    }
}
