# Printly for Windows

The desktop app opens the same Printly website pages and shop workflows. Its Windows-only work is to discover local printers, connect this computer from the Printers page, receive paid jobs, render PDF/photo pages, and submit them to the Windows print spooler. The app starts when the Windows user signs in and stays in the notification area when its window is closed.

## Build the installer

From the repository root, run:

```powershell
npm ci
npm run build -w @printly/contracts
npm run make -w windows-agent
```

The installer is written to `windows-agent/out/v0.1.1/make/squirrel.windows/x64/printly-windows-agent-0.1.1 Setup.exe`.

## Pair a shop computer

1. Open Printly for Windows and sign into your shop.
2. Go to **Printers** and choose **Connect this computer**.
3. Printly securely pairs this Windows computer and discovers its installed printers.
4. Assign printers to the required paper, colour, and duplex routes in the dashboard.

Use **Quit Printly Agent** from its notification area menu to stop background printing. Disconnecting or revoking a computer in the dashboard removes its saved local token or makes the token unusable on its next request.

## Print status

The agent marks an order as submitted after Windows reports that the spooler accepted the job. That acknowledgement does not confirm that a printer physically produced the pages; paper, toner, jams, and device-side errors remain controlled by Windows and the printer.
