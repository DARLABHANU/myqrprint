# UrQrPrint for Windows

The desktop app opens the same UrQrPrint website pages and shop workflows. Shopkeepers sign in with their existing shop credentials; the app exchanges the authenticated session for a protected desktop connection, discovers local printers, receives paid jobs, renders PDF/photo pages, and submits them to the Windows print spooler. The shopkeeper controls shop availability in the desktop app. The app starts when the Windows user signs in and stays in the notification area when its window is closed.

## Build the installer

From the repository root, run:

```powershell
npm ci
npm run build -w @printly/contracts
npm run make -w windows-agent
```

The installer is written to `windows-agent/out/v0.1.1/make/squirrel.windows/x64/printly-windows-agent-0.1.1 Setup.exe`.

## Sign in and connect a shop computer

1. Open UrQrPrint for Windows and sign in with the email and password for the shop.
2. The desktop app automatically connects this computer to the signed-in shop and discovers its installed printers.
3. Turn **Shop online** on in the desktop app when the shop is ready to accept customer orders.
4. Assign printers to the required paper, colour, and duplex routes from the desktop app.

Use **Quit UrQrPrint Agent** from its notification area menu to stop background printing. Disconnecting or revoking a computer in the dashboard removes its saved local token or makes the token unusable on its next request.

## Print status

When Windows reports a successful print response, the agent marks the order as printed and ready for pickup. No shopkeeper print confirmation or manual print retry is required. Windows and the printer provide the success response used for this status.
