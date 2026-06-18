using System;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace GamePresenceDesktop
{
    public class LoginForm : Form
    {
        private readonly ProcessMonitor _monitor;
        private TextBox _emailBox;
        private TextBox _passwordBox;
        private Button _loginBtn;
        private Button _cancelBtn;

        public LoginForm(ProcessMonitor monitor)
        {
            _monitor = monitor;
            InitializeComponents();
        }

        private void InitializeComponents()
        {
            this.Text = "Sign in - Game Presence";
            this.Width = 360;
            this.Height = 200;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.StartPosition = FormStartPosition.CenterScreen;

            var lblEmail = new Label { Left = 12, Top = 20, Text = "Email", Width = 300 };
            _emailBox = new TextBox { Left = 12, Top = 40, Width = 320 };
            var lblPass = new Label { Left = 12, Top = 70, Text = "Password", Width = 300 };
            _passwordBox = new TextBox { Left = 12, Top = 90, Width = 320, UseSystemPasswordChar = true };

            _loginBtn = new Button { Text = "Sign in", Left = 160, Width = 80, Top = 130, DialogResult = DialogResult.OK };
            _cancelBtn = new Button { Text = "Cancel", Left = 250, Width = 80, Top = 130, DialogResult = DialogResult.Cancel };

            _loginBtn.Click += async (s, e) => await OnLoginClicked();

            this.Controls.Add(lblEmail);
            this.Controls.Add(_emailBox);
            this.Controls.Add(lblPass);
            this.Controls.Add(_passwordBox);
            this.Controls.Add(_loginBtn);
            this.Controls.Add(_cancelBtn);
        }

        private async Task OnLoginClicked()
        {
            _loginBtn.Enabled = false;
            _cancelBtn.Enabled = false;
            var email = _emailBox.Text.Trim();
            var password = _passwordBox.Text;
            if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
            {
                MessageBox.Show("Please enter email and password.", "Validation", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                _loginBtn.Enabled = true;
                _cancelBtn.Enabled = true;
                return;
            }

            var ok = await _monitor.SignInAsync(email, password);
            if (ok)
            {
                this.DialogResult = DialogResult.OK;
                this.Close();
            }
            else
            {
                MessageBox.Show("Sign-in failed. Check credentials.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                _loginBtn.Enabled = true;
                _cancelBtn.Enabled = true;
            }
        }
    }
}
