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

            // If not authenticated, show login dialog first
            if (!monitor.IsAuthenticated)
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

            var trayApp = new TrayApplication(monitor);
            monitor.Start();
            Application.Run();
            monitor.Stop();
        }
    }
}
