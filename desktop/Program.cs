using System;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace GamePresenceDesktop
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            var monitor = new ProcessMonitor();

            if (!monitor.IsConfigured)
            {
                MessageBox.Show(
                    "Create %APPDATA%\\GamePresence\\config.json from desktop\\config.example.json before signing in.",
                    "Game Presence configuration",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            // Restore the encrypted refresh-token session before prompting for credentials.
            if (!monitor.RestoreSessionAsync().GetAwaiter().GetResult())
            {
                using (var login = new LoginForm(monitor))
                {
                    var result = login.ShowDialog();
                    if (result != System.Windows.Forms.DialogResult.OK)
                    {
                        // user cancelled - exit
                        return;
                    }
                }
            }

            using var trayApp = new TrayApplication(monitor);
            try
            {
                monitor.Start();
                Application.Run();
            }
            finally
            {
                monitor.Stop();
                monitor.Dispose();
            }
        }
    }
}
