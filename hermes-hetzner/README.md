# Installing Hermes Agent on a Hetzner Server

A copy-paste runbook + automated installer for running
[Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research,
MIT) on a Hetzner Cloud VPS, talking to **Slack**, backed by **Claude
(Anthropic)** as the model.

> **Why this exists:** the session that generated this kit runs in an isolated
> cloud sandbox with no SSH line to your Hetzner box, so it can't reach in and
> install for you. Instead it produced this — you SSH in and run one script.

---

## What you'll end up with

- A dedicated, non-root `hermes` Linux user running the agent.
- Hermes installed via the official one-line installer (Python, Node, ripgrep,
  ffmpeg all handled for you).
- A hardened **systemd** service (`hermes-gateway`) that auto-starts on boot and
  restarts on failure.
- Slack DMs/mentions wired to the agent, answered by Claude.

**Cost/size:** a 1 vCPU / 1 GB Hetzner instance (e.g. CX22) is plenty — the
heavy lifting is the Claude API, not local compute. Budget 2 GB+ only if you
later run local tools/models.

---

## Prerequisites

1. **A Hetzner Cloud server** running **Ubuntu 22.04/24.04 or Debian 12**, with
   SSH access as root (or a sudo user).
2. **An Anthropic API key** — https://console.anthropic.com → *API Keys*.
   (Hermes calls the Claude API; this is separate from the Claude Code CLI. See
   [note below](#a-note-on-claude-code-vs-the-claude-api).)
3. **A Slack workspace** where you can create an app (admin or app-creation
   rights). You'll make a Slack app in Step 2.

---

## Step 1 — Copy this kit to the server & run the installer

From your laptop, in this repo's directory:

```bash
# Replace with your server's IP / user
scp -r hermes-hetzner root@YOUR_SERVER_IP:/root/

ssh root@YOUR_SERVER_IP
cd /root/hermes-hetzner
sudo bash install.sh
```

`install.sh` is idempotent — re-running it is safe. It installs git, creates the
`hermes` user, runs the official Hermes installer as that user, and installs
(but does not yet start) the systemd service. It then prints the exact next
commands.

---

## Step 2 — Create the Slack app

Do this in your browser at <https://api.slack.com/apps> → **Create New App** →
*From scratch*. Pick your workspace.

**a. Bot token scopes** — *Features → OAuth & Permissions → Bot Token Scopes*,
add all of:

```
chat:write          app_mentions:read    channels:history    channels:read
groups:history      im:history           im:read             im:write
users:read          files:read           files:write
```

**b. Socket Mode (required)** — *Settings → Socket Mode* → enable. Create an
**App-Level Token** with the `connections:write` scope. It starts with `xapp-`.
**Copy it** → this is `SLACK_APP_TOKEN`.

**c. Event Subscriptions** — *Features → Event Subscriptions* → enable, and
subscribe to bot events:

```
message.im    message.channels    message.groups    app_mention
```

**d. App Home** — *Features → App Home* → toggle the **Messages Tab ON** and
check *"Allow users to send Slash commands and messages from the messages tab."*

**e. Install** — *Settings → Install App* → install to your workspace. Copy the
**Bot User OAuth Token** (starts `xoxb-`) → this is `SLACK_BOT_TOKEN`.

**f. Your member ID** — in Slack, click your avatar → *Profile* → **⋮** → *Copy
member ID* (looks like `U01ABC2DEF3`) → this is `SLACK_ALLOWED_USERS`.
Without this, Hermes denies all messages by default — it's the allowlist.

> Keep the three values handy: `xoxb-…`, `xapp-…`, and `U…`.

---

## Step 3 — Configure model + Slack (interactive)

Back on the server:

```bash
sudo -iu hermes          # become the hermes user

# Model: choose Claude (Anthropic) when prompted, then set your key
hermes setup
hermes config set ANTHROPIC_API_KEY sk-ant-your-key-here
hermes model             # pick the specific Claude model you want

# Slack: paste the xoxb-, xapp-, and U… values when prompted
hermes gateway setup
```

Quick smoke test before going daemon:

```bash
hermes                   # CLI chat — type "hi", confirm Claude replies, Ctrl-C
exit                     # back to root/sudo
```

The wizards write everything to `/home/hermes/.hermes/.env`. See
[`env.example`](./env.example) for what those keys are.

---

## Step 4 — Start the always-on service

```bash
sudo systemctl start hermes-gateway
sudo systemctl status hermes-gateway --no-pager
journalctl -u hermes-gateway -f        # live logs; Ctrl-C to stop tailing
```

It's already `enable`d, so it comes back after a reboot. In Slack, DM the bot or
`/invite @YourBot` into a channel and @mention it.

---

## Day-2 operations

| Task | Command |
|------|---------|
| Status / logs | `systemctl status hermes-gateway` · `journalctl -u hermes-gateway -f` |
| Restart after config change | `sudo systemctl restart hermes-gateway` |
| Stop / start | `sudo systemctl stop|start hermes-gateway` |
| Upgrade Hermes | `sudo -iu hermes hermes update` then `sudo systemctl restart hermes-gateway` |
| Edit secrets | `sudo -iu hermes nano ~/.hermes/.env` then restart |

### Firewall (recommended)

Hermes Slack uses **Socket Mode** — an *outbound* WebSocket — so you need **no
inbound ports** for it. Lock the box down:

```bash
sudo ufw allow OpenSSH
sudo ufw enable
```

Only open a port if you deliberately enable the OpenAI-compatible API server
(`API_SERVER_ENABLED=true`, default port `8642`) — and even then, prefer binding
it to localhost / behind a reverse proxy, never the public internet.

---

## Troubleshooting

- **Bot never responds in Slack:** almost always Socket Mode or the app token.
  Confirm Socket Mode is ON and `SLACK_APP_TOKEN` is the `xapp-` token with
  `connections:write`. Check `journalctl -u hermes-gateway -f` while you message.
- **"Denied" / silence for your messages:** your member ID isn't in
  `SLACK_ALLOWED_USERS`. Re-run `hermes gateway setup` or edit `~/.hermes/.env`.
- **Service won't start:** run it in the foreground to see the error —
  `sudo -iu hermes hermes gateway`.
- **Claude auth errors:** verify the key — `sudo -iu hermes hermes config get ANTHROPIC_API_KEY`.

---

## A note on "Claude Code" vs the Claude API

You picked **Claude Code** as the provider. Worth clarifying: *Claude Code* is
Anthropic's CLI coding tool — it isn't a model endpoint Hermes plugs into.
Hermes needs an LLM **API**, so this kit wires it to the **Claude models via the
Anthropic API** (`ANTHROPIC_API_KEY`), which is what you almost certainly want —
the same Claude models, driving your 24/7 agent.

If you'd rather reach Claude through **OpenRouter** (one key, many models,
sometimes handy for fallbacks), pick OpenRouter in `hermes model` and set
`hermes config set OPENROUTER_API_KEY …` instead — everything else here is
identical. Tell me and I'll adjust the kit.

---

### Sources

- Hermes Agent repo & docs: <https://github.com/NousResearch/hermes-agent> ·
  <https://hermes-agent.nousresearch.com/docs>
- Slack setup: <https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack>
