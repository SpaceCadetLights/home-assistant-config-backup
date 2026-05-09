# AI-Assisted Home Assistant Workflow

## Overview

This document describes how the **Cursor + Homeway MCP + Git Backup** workflow is intended to operate at LaunchPad.

The goal is a clean, safe, auditable process for making Home Assistant changes — with AI assistance for speed and a human in the loop for all consequential actions.

---

## Stack

| Layer | Tool | Role |
|-------|------|------|
| Config editor | Cursor (AI IDE) | Read, plan, and write HA config files |
| HA connection | Homeway MCP (`https://homeway.io/api/mcp`) | Live entity queries, service calls, state reads |
| Local HA MCP | user-home-assistant (Cursor MCP) | File access, WebSocket API, template eval |
| Version control | Git Config Backup (HA add-on) | Automatic commit + push on config change |
| Safety rules | `.cursor/rules/homeassistant.mdc` | Enforces AI guardrails in every session |

---

## What the AI Agent Is Allowed to Do (No Approval Needed)

- Read any config file in `/config`
- Query entity states, attributes, area/device registry
- Evaluate Jinja2 templates to test logic
- Control lights, switches, media players (with your instruction)
- Draft new automations, scripts, scenes in a preview before writing
- Append to `automations.yaml`, `scripts.yaml`, or `scenes.yaml`
- Create new files in `docs/`, `packages/`, or `www/`
- Write to `.cursor/rules/` for persistent AI guidance

---

## What Requires Explicit User Approval

Say one of these phrases clearly to give approval:

| Action | Phrase needed |
|--------|--------------|
| Restart Home Assistant | "please restart HA" |
| Reload automations/scripts/YAML | "please reload [automations/scripts/config]" |
| Edit `configuration.yaml` | "please edit configuration.yaml" |
| Disable or delete an automation | "please disable/delete [automation name]" |
| Touch Zigbee / ZHA config | "please modify ZHA" |
| Touch Homeway/Alexa/Google config | "please modify Homeway config" |
| Modify backup schedules | "please modify backup" |
| Modify `.storage/` directory | "please modify storage" |

**Never implied by context — always requires the exact phrase.**

---

## How to Safely Test Automations

1. **Trace mode**: After triggering, check **Developer Tools → Traces** in HA UI
2. **Manual trigger**: Use Developer Tools → Services → `automation.trigger` with `skip_condition: true`
3. **Template test**: Use `home_assistant_eval_template` via MCP before embedding logic in automations
4. **Staging approach**: Create a new automation with `mode: single` and test before enabling
5. **Logbook**: Check **Logbook** for unexpected triggers after changes

For motion-based automations, use `binary_sensor` state as a test trigger rather than waiting for physical motion.

---

## How to Use Git/GitHub Backup for Rollback

The **Git Config Backup** add-on automatically commits config changes.

### To view history:
- Open the add-on UI or SSH into HA and run `git log --oneline`

### To roll back a file:
```bash
git show HEAD~1:automations.yaml > /tmp/automations_prev.yaml
# Review, then copy back if correct
cp /tmp/automations_prev.yaml automations.yaml
```

### To roll back all config to a specific commit:
```bash
git checkout <commit-hash> -- .
# Then reload or restart HA as needed
```

### After AI-assisted changes:
- The Git backup add-on should commit automatically
- If not, trigger a manual backup from the add-on UI
- Write a meaningful commit message describing what changed

---

## Recommended Process for Future Changes

### 1. Describe the goal
Tell Cursor what you want to achieve in plain language. Be specific about rooms, devices, and conditions.

### 2. Let AI inspect first
The agent will query entity IDs, check for duplicates, and read relevant config files before proposing anything.

### 3. Review the draft
The agent will show you the YAML or file change before writing. Review for:
- Correct entity IDs (not friendly names)
- Correct area/device IDs
- No duplicate automations
- YAML syntax correctness

### 4. Approve and write
Say "looks good, write it" or similar. The agent writes the file.

### 5. Reload (with your approval)
Say "please reload automations" (or scripts/scenes). The agent will call the appropriate HA service.

### 6. Test
Use HA Traces or manual trigger to verify the automation works as intended.

### 7. Commit
The Git backup add-on should auto-commit. Verify with a quick check of the add-on logs.

---

## File Organization Conventions

```
/config
├── automations.yaml        # All automations (!include from configuration.yaml)
├── scripts.yaml            # All scripts
├── scenes.yaml             # All scenes
├── configuration.yaml      # Core config — minimal, mostly !includes
├── secrets.yaml            # Credentials — NEVER EDIT via AI
├── packages/               # (create if needed) Modular config packages
│   └── presence.yaml       # Example: presence-related helpers + automations
├── blueprints/             # Blueprint YAML files
├── esphome/                # ESPHome device configs
├── www/                    # Static web assets
├── docs/                   # This folder — AI workflow docs and audits
│   ├── AI_HOME_ASSISTANT_WORKFLOW.md
│   └── HOME_ASSISTANT_AUDIT.md
└── .cursor/
    └── rules/
        └── homeassistant.mdc   # AI safety rules (always applied)
```

---

## Key Principles

- **Small changes, often** — easier to review, easier to roll back
- **Read before write** — always inspect the current state first
- **Entity IDs, not friendly names** — friendly names change; entity IDs are stable
- **Humans approve restarts** — the AI never reloads or restarts autonomously
- **Document as you go** — update `HOME_ASSISTANT_AUDIT.md` when adding significant new config
