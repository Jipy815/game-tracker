using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace GamePresenceDesktop
{
    public sealed class ConnectWithPartnerForm : Form
    {
        private readonly ProcessMonitor _monitor;
        private readonly Label _codeLabel;
        private readonly Label _statusLabel;
        private readonly Button _regenerateButton;
        private readonly System.Windows.Forms.Timer _pollTimer;
        private bool _loading;

        public ConnectWithPartnerForm(ProcessMonitor monitor)
        {
            _monitor = monitor;
            Text = "Connect with partner - Game Presence";
            Width = 480;
            Height = 315;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.White;

            var title = new Label
            {
                Text = "Connect with your partner",
                Font = new Font("Segoe UI", 18, FontStyle.Bold),
                Left = 28,
                Top = 26,
                Width = 400,
                Height = 35
            };
            var description = new Label
            {
                Text = "Give this one-time code to your partner. They can enter it in the mobile app to connect your accounts.",
                Font = new Font("Segoe UI", 10),
                ForeColor = Color.FromArgb(70, 70, 70),
                Left = 30,
                Top = 72,
                Width = 400,
                Height = 45
            };
            _codeLabel = new Label
            {
                Text = "Generating…",
                Font = new Font("Consolas", 23, FontStyle.Bold),
                ForeColor = Color.FromArgb(32, 81, 165),
                TextAlign = ContentAlignment.MiddleCenter,
                BorderStyle = BorderStyle.FixedSingle,
                Left = 30,
                Top = 126,
                Width = 400,
                Height = 58
            };
            _statusLabel = new Label
            {
                Text = "Creating a secure 15-minute code…",
                Font = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(80, 80, 80),
                TextAlign = ContentAlignment.MiddleCenter,
                Left = 30,
                Top = 193,
                Width = 400,
                Height = 25
            };
            _regenerateButton = new Button
            {
                Text = "Generate a new code",
                Left = 155,
                Top = 228,
                Width = 150,
                Height = 32
            };
            _regenerateButton.Click += async (_, _) => await GenerateCodeAsync();

            Controls.AddRange(new Control[] { title, description, _codeLabel, _statusLabel, _regenerateButton });
            _pollTimer = new System.Windows.Forms.Timer { Interval = 3000 };
            _pollTimer.Tick += async (_, _) => await CheckConnectionAsync();
            Load += async (_, _) =>
            {
                await GenerateCodeAsync();
                _pollTimer.Start();
            };
            FormClosed += (_, _) => _pollTimer.Dispose();
        }

        private async Task GenerateCodeAsync()
        {
            if (_loading) return;
            _loading = true;
            _regenerateButton.Enabled = false;
            _statusLabel.Text = "Creating a secure 15-minute code…";
            try
            {
                var connectionCode = await _monitor.CreatePartnerConnectionCodeAsync();
                _codeLabel.Text = FormatCode(connectionCode.Code);
                _statusLabel.Text = $"Waiting for your partner… expires at {connectionCode.ExpiresAt.ToLocalTime():t}.";
            }
            catch
            {
                _codeLabel.Text = "Try again";
                _statusLabel.Text = "We could not create a code. Check your connection and try again.";
            }
            finally
            {
                _regenerateButton.Enabled = true;
                _loading = false;
            }
        }

        private async Task CheckConnectionAsync()
        {
            if (_loading) return;
            try
            {
                var partner = await _monitor.GetLinkedPartnerAsync();
                if (partner == null) return;

                _pollTimer.Stop();
                _codeLabel.ForeColor = Color.FromArgb(30, 120, 70);
                _codeLabel.Text = "Connected";
                _statusLabel.Text = $"You are now connected with {partner.Label}.";
                _regenerateButton.Visible = false;
                await Task.Delay(1200);
                DialogResult = DialogResult.OK;
                Close();
            }
            catch
            {
                // A temporary poll error should not interrupt a displayed code.
            }
        }

        private static string FormatCode(string code) =>
            string.IsNullOrWhiteSpace(code) || code.Length <= 5 ? code : code.Insert(5, " ");
    }
}
