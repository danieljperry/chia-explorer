# Re-org monitor

The re-org monitor is a background poller that watches the tip of the chain and detects re-orgs in real time. On each poll it fetches the last `lookback_blocks` heights and compares header hashes against what it saw previously — any hash change at a given height is a confirmed re-org.

Start it with `start_reorg_monitor`, read results with `get_reorg_monitor_status`, and stop it with `stop_reorg_monitor`. Only one monitor runs at a time per server.

## Standalone CLI

The same monitor can run as a long-running CLI process — useful when you want it up independently of an MCP host:

```bash
chia-explorer reorg_monitor \
  --network mainnet \
  --poll-interval 10 \
  --lookback 5 \
  --recipient oncall@example.com:1 \
  --recipient ops-lead@example.com:3 \
  --status-every 60
```

All flags are optional. Status snapshots, re-org events, and the full contents and metadata of every outgoing alert email are written to `~/logs/reorg_monitor.log` (configurable with `--log-file <path>` or disabled with `--no-log-file`) and mirrored to stderr. `Ctrl-C` (SIGINT) or SIGTERM stops the monitor cleanly. Run `chia-explorer reorg_monitor --help` for the full flag reference. Email alerts use the same SMTP env vars as the MCP tool (see below).

You can pass `--smtp-env-file <path>` to load the SMTP variables from a dotenv-style file (`KEY=VALUE` per line, `#` comments and quoted values supported) instead of exporting them in your shell. Shell-exported variables take precedence, so the file is a fallback rather than an override. The file contains secrets, so `chmod 600` it.

## Run as a system service

Templates are provided in `service/` for all three major platforms. Each template has placeholders you fill in (paths, recipient, SMTP env file).

**Linux (systemd, user-level — no root required):**

```bash
# Edit service/chia-reorg-monitor.service to set <node-bin>, <install-path>, <smtp-env-file>
mkdir -p ~/.config/systemd/user
cp service/chia-reorg-monitor.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now chia-reorg-monitor
# Optional: keep running after logout
sudo loginctl enable-linger $USER
# Logs:
journalctl --user -u chia-reorg-monitor -f     # stderr mirror
tail -f ~/logs/reorg_monitor.log               # the monitor's own log
# Stop:
systemctl --user disable --now chia-reorg-monitor
```

**macOS (launchd, per-user LaunchAgent):**

```bash
# Edit service/com.chia-explorer.reorg-monitor.plist to set the placeholders
mkdir -p ~/Library/LaunchAgents
cp service/com.chia-explorer.reorg-monitor.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.chia-explorer.reorg-monitor.plist
launchctl enable gui/$UID/com.chia-explorer.reorg-monitor
# Logs:
tail -f ~/logs/reorg_monitor.log
# Stop:
launchctl bootout gui/$UID/com.chia-explorer.reorg-monitor
```

**Windows (NSSM, https://nssm.cc):**

Download `nssm.exe`, then in an Administrator PowerShell:

```powershell
.\service\install-windows.ps1 `
  -InstallPath 'C:\Users\me\chia-explorer' `
  -Recipient   'you@example.com:1' `
  -SmtpEnvFile 'C:\Users\me\chia-explorer.env'
# Stop / uninstall:
nssm stop   ChiaReorgMonitor
nssm remove ChiaReorgMonitor confirm
```

The script installs an auto-start NSSM service running `node dist\index.js reorg_monitor` with your flags. Logs land in `%USERPROFILE%\logs\reorg_monitor.log` (the monitor) and `%USERPROFILE%\logs\reorg_monitor.nssm.err` (stderr captured by NSSM).

## Options

- `network` — `mainnet` (default) or `testnet11`
- `poll_interval_seconds` — 5–60 (default 5)
- `lookback_blocks` — 1–32 (default 5); how many recent heights to re-check each poll
- `alert_recipients` — (optional, disabled by default) Add up to 10 email addresses, each with an optional `min_blocks` threshold (default 1). An address only receives an alert when the re-org depth meets or exceeds its threshold. Duplicates are collapsed.

## Email alerts

To receive an email when a re-org is detected, set SMTP env vars before starting the server and pass `alert_recipients` to `start_reorg_monitor`:

- `SMTP_HOST` (required when `alert_recipients` is provided)
- `SMTP_PORT` (optional)
- `SMTP_USER`, `SMTP_PASS` (optional)
- `SMTP_FROM` (optional)
- `SMTP_SECURE=true` to use TLS (recommended for production)
- `SMTP_CA_CERT_PATH` — path to a PEM-encoded CA cert to trust a self-signed SMTP server (e.g. Proton Mail Bridge)

Recipient addresses are redacted in `get_reorg_monitor_status` output.

## Examples

Start the monitor with default settings, no alerts:

```json
{
  "name": "start_reorg_monitor",
  "arguments": {}
}
```

Start the monitor on testnet11 with two recipients at different depth thresholds — the first is alerted on every re-org, the second only when the re-org is 3 blocks deep or more:

```json
{
  "name": "start_reorg_monitor",
  "arguments": {
    "network": "testnet11",
    "alert_recipients": [
      { "email": "oncall@example.com", "min_blocks": 1 },
      { "email": "ops-lead@example.com", "min_blocks": 3 }
    ]
  }
}
```
