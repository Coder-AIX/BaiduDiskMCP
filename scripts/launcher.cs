using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;

internal static class Program
{
    private static int Main(string[] args)
    {
        try
        {
            Console.OutputEncoding = Encoding.UTF8;
        }
        catch
        {
        }

        Console.Title = "studio-drive";

        bool openBrowser = true;
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i].Equals("--no-browser", StringComparison.OrdinalIgnoreCase))
            {
                openBrowser = false;
            }
        }

        string dir = AppDomain.CurrentDomain.BaseDirectory;
        Directory.SetCurrentDirectory(dir);

        string envPath = Path.Combine(dir, ".env");
        string nodePath = Path.Combine(dir, "node.exe");
        string buildPath = Path.Combine(dir, "build", "index.js");

        if (!File.Exists(envPath))
        {
            Console.WriteLine("未找到 .env，无法启动。");
            Pause();
            return 1;
        }

        if (!File.Exists(nodePath))
        {
            Console.WriteLine("未找到 node.exe，无法启动。");
            Pause();
            return 1;
        }

        if (!File.Exists(buildPath))
        {
            Console.WriteLine("未找到 build/index.js，请重新生成便携包。");
            Pause();
            return 1;
        }

        Directory.CreateDirectory(Path.Combine(dir, "data"));

        int port = ReadPort(envPath, 3000);
        string url = "http://localhost:" + port + "/admin";

        if (IsPortOpen(port))
        {
            Console.WriteLine("端口 " + port + " 已被占用，可能服务已在运行。");
            Console.WriteLine("管理端地址: " + url);
            if (openBrowser)
            {
                OpenBrowser(url);
            }
            Thread.Sleep(1000);
            return 0;
        }

        ProcessStartInfo startInfo = new ProcessStartInfo();
        startInfo.FileName = nodePath;
        startInfo.Arguments = "--env-file=.env build";
        startInfo.WorkingDirectory = dir;
        startInfo.UseShellExecute = false;

        Process server;
        try
        {
            server = Process.Start(startInfo);
        }
        catch (Exception ex)
        {
            Console.WriteLine("启动服务失败: " + ex.Message);
            Pause();
            return 1;
        }

        bool ready = false;
        for (int i = 0; i < 60; i++)
        {
            if (server.HasExited)
            {
                Console.WriteLine("服务启动失败，退出码: " + server.ExitCode);
                Pause();
                return server.ExitCode;
            }

            if (IsPortOpen(port))
            {
                ready = true;
                break;
            }

            Thread.Sleep(500);
        }

        if (ready)
        {
            Console.WriteLine();
            Console.WriteLine("服务已启动: " + url);
            Console.WriteLine("按 Ctrl+C 或关闭窗口停止服务。");
            Console.WriteLine();
            if (openBrowser)
            {
                OpenBrowser(url);
            }
        }
        else
        {
            Console.WriteLine("等待服务启动超时，请检查上方日志。");
        }

        server.WaitForExit();
        return server.ExitCode;
    }

    private static int ReadPort(string envPath, int fallback)
    {
        try
        {
            string[] lines = File.ReadAllLines(envPath);
            for (int i = 0; i < lines.Length; i++)
            {
                string line = lines[i].Trim();
                if (line.Length == 0 || line.StartsWith("#"))
                {
                    continue;
                }

                int eq = line.IndexOf('=');
                if (eq <= 0)
                {
                    continue;
                }

                string key = line.Substring(0, eq).Trim();
                if (!key.Equals("PORT", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                string value = line.Substring(eq + 1).Trim().Trim('"').Trim('\'');
                int port;
                if (int.TryParse(value, out port) && port > 0 && port < 65536)
                {
                    return port;
                }
            }
        }
        catch
        {
        }

        return fallback;
    }

    private static bool IsPortOpen(int port)
    {
        try
        {
            using (TcpClient client = new TcpClient())
            {
                client.Connect("127.0.0.1", port);
                return true;
            }
        }
        catch
        {
            return false;
        }
    }

    private static void OpenBrowser(string url)
    {
        try
        {
            ProcessStartInfo startInfo = new ProcessStartInfo(url);
            startInfo.UseShellExecute = true;
            Process.Start(startInfo);
        }
        catch (Exception ex)
        {
            Console.WriteLine("无法自动打开浏览器: " + ex.Message);
            Console.WriteLine("请手动访问: " + url);
        }
    }

    private static void Pause()
    {
        Console.WriteLine();
        Console.WriteLine("按任意键退出...");
        try
        {
            Console.ReadKey(true);
        }
        catch
        {
        }
    }
}
