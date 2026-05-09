# Proposed Package Architecture — LaunchPad Home Assistant

**Status:** Proposal — no files have been moved or modified  
**Created:** 2026-05-09  
**Purpose:** Migrate LaunchPad's HA config from a flat structure to a scalable, modular package system

---

## Current State Summary

```
/config
├── configuration.yaml      # monolithic (default_config + !includes + Homeway blocks)
├── automations.yaml        # 6 automations, flat list
├── scripts.yaml            # empty
├── scenes.yaml             # 1 scene
├── secrets.yaml            # credentials — never touch
├── blueprints/             # motion_light, notify_leaving_zone, confirmable_notification
├── custom_components/      # CAFE (visual automation editor), HACS, WLED
├── esphome/                # assist-mic-stream.yaml (HA Voice satellite)
├── www/                    # static web assets
└── docs/                   # AI workflow docs (new)
```

**Problems with flat structure at scale:**
- `automations.yaml` becomes a 2,000-line file with no logical grouping
- No way to safely hand sections to an AI agent or team member without touching everything
- Helpers, automations, scripts, and scenes related to the same domain live in separate files
- Hard to disable or test one subsystem without affecting others

---

## Proposed Package Structure

Each package is a self-contained YAML file that owns **all the HA objects for one logical domain** — helpers, automations, scripts, scenes, and templates together.

```
/config
├── configuration.yaml              # unchanged except: homeassistant: packages: !include_dir_named packages
├── automations.yaml                # keep as migration target; gradually emptied
├── scripts.yaml                    # keep; gradually emptied
├── scenes.yaml                     # keep; gradually emptied
├── secrets.yaml                    # never touch
│
├── packages/
│   ├── lighting/
│   │   ├── workshop.yaml           # CNC, laser, 3D printer, paint booth, clamp lamp lights
│   │   ├── lounge.yaml             # lounge lamps, desk LEDs, earth, leg lamp
│   │   ├── stage.yaml              # stage L/R, bar lights, DMX
│   │   ├── bathroom.yaml           # bathroom mirror (motion + manual)
│   │   ├── basement.yaml           # basement light (motion-driven)
│   │   └── outdoor.yaml            # outdoor white lights (sunset/sunrise)
│   │
│   ├── installations/
│   │   └── trillium.yaml           # Trillium WLED: helpers, presets, scenes, automations
│   │
│   ├── occupancy/
│   │   └── motion.yaml             # motion sensor logic, helpers (guest mode, override), shared templates
│   │
│   ├── presence/
│   │   └── persons.yaml            # persons, home/away helpers, arrival/departure automations
│   │
│   ├── media/
│   │   ├── audio.yaml              # PA speakers, Music Assistant, Spotify automations
│   │   └── projector.yaml          # Apple TV, projector control
│   │
│   ├── voice/
│   │   └── pipeline.yaml           # HA Voice satellite helpers, pipeline selection, mute toggle
│   │
│   ├── studio/
│   │   └── workshop.yaml           # workshop mode helper, machine safety automations, timers
│   │
│   ├── scenes/
│   │   └── common.yaml             # cross-area scenes (party mode, all off, morning, night)
│   │
│   ├── notifications/
│   │   └── alerts.yaml             # notification scripts, mobile push helpers, alert automations
│   │
│   └── security/
│       └── access.yaml             # entry button logic, lock/unlock automations (future)
│
├── blueprints/                     # unchanged
├── custom_components/              # unchanged (CAFE, HACS, WLED)
├── esphome/                        # unchanged
└── docs/                           # this folder
```

---

## Why This Structure

| Package | Owns | Current source |
|---------|------|----------------|
| `lighting/workshop` | 3D printer, CNC, laser, paint booth, clamp lights | `automations.yaml` (none yet), switches exist |
| `lighting/lounge` | Desk LEDs, earth, leg lamp, front right lamp, red desk lamp | switches exist |
| `lighting/stage` | Stage L/R, bar lights, DMX | switches exist |
| `lighting/bathroom` | Bathroom mirror switch + motion automation | `automations.yaml` (2 automations) |
| `lighting/basement` | Basement light + motion automation | `automations.yaml` (2 automations) |
| `lighting/outdoor` | Outdoor white lights | switches exist |
| `installations/trillium` | Trillium WLED effects, sync, presets | `automations.yaml` (1 automation) |
| `occupancy/motion` | Shared motion helpers, guest mode toggle | no helpers yet |
| `presence/persons` | Person tracking, home/away | persons exist in UI |
| `media/audio` | PA speakers, Spotify sync | switches + media players exist |
| `media/projector` | Projector, Apple TV | media players exist |
| `voice/pipeline` | HA Voice satellite, mute, wake word | ESPHome + wyoming exist |
| `studio/workshop` | Workshop mode, machine timers | no helpers yet |
| `scenes/common` | Party mode, All Off, Morning, Night | `scenes.yaml` (1 scene) |
| `notifications/alerts` | Push scripts, alert automations | no helpers yet |
| `security/access` | Entry button, LaunchPad Entry automation | `automations.yaml` (2 automations) |

---

## How to Enable Packages in `configuration.yaml`

Add **one line** under `homeassistant:`:

```yaml
homeassistant:
  packages: !include_dir_named packages
```

This is the **only change** needed to `configuration.yaml`. HA will load every `.yaml` file inside `/config/packages/` and all subdirectories recursively.

> Note: Once packages are enabled, do NOT put duplicate domain keys in `configuration.yaml` and a package — HA will error. The `!include` lines for automations/scripts/scenes stay; packages add to those pools, they don't replace them.

---

## Migration Strategy

### Phase 0 — Foundation (safe, no automation changes)
1. Create `/config/packages/` directory
2. Add `homeassistant: packages: !include_dir_named packages` to `configuration.yaml`
3. Create empty placeholder files for each package (e.g., `packages/lighting/workshop.yaml` with a comment header)
4. Verify HA loads without errors (check logs)

### Phase 1 — New helpers first (zero migration risk)
For each package, create its **helper entities** (`input_boolean`, `input_select`, `timer`, etc.) inside the package file. These are purely additive — nothing breaks.

Examples:
- `input_boolean.occupancy_guest_mode` in `occupancy/motion.yaml`
- `input_boolean.studio_workshop_mode` in `studio/workshop.yaml`
- `input_boolean.installations_trillium_sync` in `installations/trillium.yaml`

### Phase 2 — New automations in packages (low risk)
Write **net-new automations** directly into package files. Do not move existing ones yet. This proves the package system works before migrating anything.

### Phase 3 — Migrate automations one at a time (medium risk)
Move automations from `automations.yaml` into the matching package file — **one at a time**, with a HA reload and test between each.

Order (safest first):
1. `lighting/basement.yaml` ← Basement Motion Lights On/Off (simple, self-contained)
2. `lighting/bathroom.yaml` ← Bathroom Mirror On/Off (simple, self-contained)
3. `scenes/common.yaml` ← Printer Lights On scene
4. `security/access.yaml` ← Entry button automations (resolve conflict first)
5. `installations/trillium.yaml` ← Toggle Trillium automation

### Phase 4 — Verify and clean up
- Confirm `automations.yaml` is empty or near-empty
- Keep the file in place (never delete it — HA expects it from `!include`)
- Same for `scripts.yaml` and `scenes.yaml`

---

## Naming Conventions

### Helpers (`input_boolean`, `input_number`, `input_select`, `timer`, `counter`)

Pattern: `{domain}_{specific_name}`

```
input_boolean.occupancy_guest_mode        # occupancy package
input_boolean.studio_workshop_mode        # studio package
input_boolean.installations_trillium_party_mode
input_select.media_audio_source           # media package
input_number.lighting_stage_brightness
timer.studio_machine_timeout
counter.presence_arrivals_today
```

### Automations

Pattern: `{package}_{trigger_noun}_{action_verb}`

```
automation.lighting_basement_motion_on
automation.lighting_basement_motion_off
automation.lighting_bathroom_mirror_on
automation.lighting_bathroom_mirror_off
automation.lighting_outdoor_sunset_on
automation.occupancy_guest_mode_suppress_motion
automation.presence_space_cadets_arrived
automation.media_spotify_stopped_pa_off
automation.security_entry_button_single_press
automation.security_entry_button_double_press
automation.installations_trillium_toggle
```

### Scripts

Pattern: `{package}_{action_verb}_{object}`

```
script.lighting_set_stage_performance
script.lighting_all_off
script.media_announce_arrival
script.notifications_push_alert
script.installations_trillium_set_effect
script.studio_start_workshop_session
```

### Scenes

Pattern: `{area_or_scope}_{mood_or_mode}`

```
scene.lounge_evening
scene.lounge_party
scene.stage_performance
scene.stage_off
scene.workshop_work_mode
scene.all_night_mode
scene.all_morning
scene.installations_trillium_warm
```

### Entity Labels (HA Labels Feature)

Use HA Labels to tag entities across packages for cross-cutting queries:

```
label: workshop_machine     → all workshop machine switches
label: stage_av             → stage lights + PA + DMX
label: motion_sensor        → all motion/occupancy binary sensors
label: presence_critical    → switches that should stay off in guest mode
label: trillium             → all Trillium-related entities
```

---

## AI Agent Interaction Model

### Safe pattern for AI-assisted package creation

```
1. AI reads the relevant package file (e.g., packages/lighting/basement.yaml)
2. AI queries entity IDs from HA state — never guesses
3. AI proposes YAML as a draft in the chat
4. Human reviews and says "write it"
5. AI writes to the package file only
6. Human approves reload: "please reload automations"
7. AI checks logs for errors
8. Human confirms behavior in HA UI
```

### Package ownership rules for AI

| Package | AI can create freely | Requires human review |
|---------|---------------------|----------------------|
| `lighting/*` | New automations, helpers | Changes to existing motion automations |
| `installations/*` | WLED effect automations, helpers | Changes to sync or live override |
| `occupancy/*` | New helper entities | Any change that touches motion sensors |
| `presence/*` | Draft automations | Any change to person entities or device trackers |
| `media/*` | New automations | Anything touching Spotify or Music Assistant config |
| `voice/*` | Helper entities | Any change to pipeline or wake word config |
| `studio/*` | New timers, helpers | Machine safety automations |
| `security/*` | Draft only — never write without review | Everything |
| `notifications/*` | New scripts, helper flags | Mobile push automations |

### What AI should always do before touching a package file

1. Read the package file first
2. Query all entity IDs involved from live HA state
3. Check for existing automations with the same trigger to avoid duplicates
4. Show the full proposed YAML block before writing

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Duplicate automation fires (same trigger in package + automations.yaml) | **High** during migration | Migrate one at a time, delete from automations.yaml immediately after |
| Package YAML syntax error prevents HA from loading | Medium | Validate YAML syntax before saving; keep backups |
| `!include_dir_named` loads unexpected files | Low | Only `.yaml` files in `/packages/` — keep non-package YAMLs elsewhere |
| Domain conflict (e.g., `homeassistant:` in both configuration.yaml and a package) | Low | Never put `homeassistant:` in packages; only use `automation:`, `script:`, `scene:`, `input_boolean:`, etc. |
| Homeway auto-updates overwrite `configuration.yaml` | Low | Homeway only touches its own blocks; our `homeassistant:` key is safe |

---

## Low-Risk First Steps (Do These First)

In order:

1. **Create the `packages/` directory** — no HA change needed yet
2. **Create empty package skeleton files** with comment headers — zero HA impact
3. **Add `homeassistant: packages: !include_dir_named packages`** to `configuration.yaml` — one-line change, safe
4. **Reload HA config** (with approval) and confirm no errors in logs
5. **Add first helper**: `input_boolean.occupancy_guest_mode` in `packages/occupancy/motion.yaml`
6. **Confirm helper appears in HA UI** before writing any automations
7. **Write one new automation** (e.g., outdoor lights at sunset) directly into a package — proves the workflow end-to-end
8. **Begin migration** of basement motion automations (simplest, safest pair)

---

## What NOT to Do During Migration

- Do not move all automations at once
- Do not rename entity IDs during migration (breaks other automations silently)
- Do not edit `secrets.yaml` or any Homeway config blocks
- Do not use `homeassistant:` key inside any package file
- Do not delete `automations.yaml`, `scripts.yaml`, or `scenes.yaml` — keep them even when empty

---

*This is a planning document only. No files have been modified. Review and approve before beginning Phase 0.*
