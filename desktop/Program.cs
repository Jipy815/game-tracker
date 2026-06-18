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
            var trayApp = new TrayApplication(monitor);
            monitor.Start();
            Application.Run();
            monitor.Stop();
        }
    }
}
