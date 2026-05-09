# WLED Control Architecture — LaunchPad

**Status:** Architecture plan — no config changes made  
**Created:** 2026-05-09  
**Scope:** Scalable management of current + planned ~42 WLED devices

---

## Current WLED Inventory

| Device | Entity | LED Count | Status | Sync |
|--------|--------|-----------|--------|------|
| Trillium | `light.trillium` | 1,422 | Online | Send ON / Receive ON |
| wegoiot LED Controller | `light.wegoiot_led_controller` | Unknown | **Offline** | N/A |

> 40+ additional WLED devices planned.

---

## The Core Challenge: 40+ Devices

A naive approach (one entity card per device in the dashboard, one automation per device) produces:
- 40+ light entities cluttering the dashboard
- 40+ sets of speed/intensity/palette/effect selects
- Complex, fragile automations
- Impossible-to-navigate UI

The architecture below solves this with **groups**, **packages**, **scripts**, **presets**, and **a master control abstraction**.

---

## Naming Conventions

### Device Naming (WLED firmware + HA friendly name)

Pattern: `{Area} {Descriptor}` — Title Case, short, no abbreviations

```
Trillium             ← main installation piece (existing)
Stage Rail Left      ← area + position
Stage Rail Right
Bar Underglow
Workshop Ceiling
Workshop Bench
Kitchen Counter
Lounge Ambient
Lounge Couch Back
Bathroom Mirror Strip
Entry Arch
Patio Rail
Patio Post Left
Patio Post Right
```

> Set the friendly name in the WLED web UI AND in HA via the device settings to keep them in sync.

### Entity ID Conventions

HA auto-generates entity IDs from friendly names. For WLED devices, expect:

```
light.trillium
light.stage_rail_left
light.stage_rail_right
light.bar_underglow
light.workshop_ceiling
light.workshop_bench
light.kitchen_counter
light.lounge_ambient
...
```

### Helper Entity Naming (Package-defined)

Pattern: `{domain}_{area}_{function}`

```
input_boolean.wled_sync_global_enabled     ← master sync toggle
input_boolean.wled_sync_stage_enabled      ← stage group sync
input_boolean.wled_sync_lounge_enabled
input_boolean.wled_sync_workshop_enabled
input_select.wled_scene_active             ← current scene name
input_select.wled_master_effect            ← effect for global set
input_number.wled_master_brightness        ← 0–255 master brightness
```

---

## Area/Room Grouping

Group WLED devices by physical area. Each group becomes:
1. A **HA Light Group** (for unified on/off/brightness/color)
2. A **HA Label** for cross-cutting queries
3. A section in the WLED dashboard

### Proposed Groups

| Group Name | Entity ID | Devices |
|------------|-----------|---------|
| Stage Group | `light.wled_group_stage` | Stage Rail L/R, Bar Underglow, DMX strip (if WLED) |
| Lounge Group | `light.wled_group_lounge` | Lounge Ambient, Couch Back |
| Workshop Group | `light.wled_group_workshop` | Workshop Ceiling, Workshop Bench |
| Kitchen Group | `light.wled_group_kitchen` | Kitchen Counter |
| Bathroom Group | `light.wled_group_bathroom` | Bathroom Mirror Strip |
| Entry Group | `light.wled_group_entry` | Entry Arch, Entry (others) |
| Outdoor Group | `light.wled_group_outdoor` | Patio Rail, Patio Posts |
| Installations Group | `light.wled_group_installations` | Trillium + large art pieces |
| All WLED | `light.wled_group_all` | Every WLED device |

Define these in `packages/installations/wled_groups.yaml`:
```yaml
light:
  - platform: group
    name: "WLED Stage"
    unique_id: wled_group_stage
    entities:
      - light.stage_rail_left
      - light.stage_rail_right
      - light.bar_underglow
```

---

## UDP Sync Control Strategy

WLED devices can sync over UDP: one device sends, others receive. This is fast and doesn't go through HA at all.

### The Problem at Scale
With 40+ devices, you need:
- Ability to break individual devices out of sync (solo a single strip)
- Ability to re-join sync without touching each device manually
- Clear indication in the dashboard of which devices are synced

### Solution: Sync Groups via Helpers + Scripts

Each WLED device has two HA switches:
- `switch.{name}_sync_send` — this device broadcasts to others
- `switch.{name}_sync_receive` — this device listens for broadcasts

**Master sync script** (`script.wled_sync_all_on`):
```yaml
sequence:
  - service: switch.turn_on
    target:
      entity_id:
        - switch.trillium_sync_send
        - switch.trillium_sync_receive
        - switch.stage_rail_left_sync_receive
        # ... all WLED sync_receive switches
```

**Solo a device** (`script.wled_solo_{name}`):
```yaml
# Turns off sync_receive for one device so it's independent
sequence:
  - service: switch.turn_off
    target:
      entity_id: switch.trillium_sync_receive
```

**Rejoin sync** (`script.wled_rejoin_{name}`):
```yaml
sequence:
  - service: switch.turn_on
    target:
      entity_id: switch.trillium_sync_receive
```

### Recommended Sync Architecture

```
Sync Zones:
  Zone A — Installations (Trillium + art pieces)     UDP port 21324
  Zone B — Stage (rails, bar, DMX)                   UDP port 21325
  Zone C — Ambient (lounge, kitchen, bathroom)        UDP port 21326
  Zone D — Outdoor (patio, entry)                     UDP port 21327
  Zone E — Workshop                                   UDP port 21328
```

Each zone has one designated **sync leader** (send=ON) and all others set to receive. To cross-zone sync (e.g., Installations + Stage for a show), temporarily enable receive on both zones.

Configure sync ports in the WLED web UI under LED Settings → Sync Interfaces.

---

## Individual Control vs Synchronized Control

### Control Modes

| Mode | How | When |
|------|-----|------|
| **All synced** | Master sync ON across a zone | Live performances, full room shows |
| **Group control** | HA light group | Set color/brightness for an area without sync |
| **Individual** | Direct entity + sync_receive OFF | Focus one device, tune it separately |
| **Scene apply** | WLED preset or HA scene | Recall a curated look across devices |
| **AI-driven** | Script triggered by voice or automation | Dynamic, context-aware lighting |

### Voice Commands → Control Mode

```
"Set stage to rainbow"           → script.wled_set_stage_effect (effect: rainbow, synced)
"Solo Trillium and set it blue"  → script.wled_solo_trillium + light.trillium color
"Party mode"                     → scene.installations_party (applies presets across zones)
"Workshop work mode"             → script.wled_workshop_focus (warm white, low brightness)
"All WLED off"                   → light.wled_group_all turn_off
```

---

## Presets

WLED presets are stored on each device and recalled instantly (no HA round-trip for the effect itself — just a trigger). Presets are faster than scripting effects from HA.

### Preset Naming Convention (in WLED web UI)

Pattern: `{number}: {Category} {Name}`

```
1:  Base Warm White
2:  Base Cool White
3:  Base Off
10: Mood Cozy
11: Mood Focus
12: Mood Party
13: Mood Chill
20: Show Opening
21: Show Performance
22: Show Curtain Call
23: Show Intermission
30: Holiday Christmas
31: Holiday Halloween
32: Holiday July4
40: Music Bass Pulse
41: Music Spectrum
42: Music Reactive
50: Installation Trillium Slow
51: Installation Trillium Fast
```

Activate a preset from HA:
```yaml
service: select.select_option
target:
  entity_id: select.trillium_preset
data:
  option: "10: Mood Cozy"
```

### Playlists

WLED playlists auto-cycle through presets with configurable timing. Use for:
- Ambient background cycling (slow transitions between presets 10–13)
- Party mode (fast cycling through festive effects)
- Art installation loops

Activate via `select.{device}_playlist`.

---

## Effect Categories

With 100+ WLED effects, organize them for AI and dashboard use:

| Category | Effects | Use case |
|----------|---------|---------|
| **Static** | Solid, Solid Pattern | Work, focus |
| **Subtle** | Breathe, Fade, Candle | Ambient, bedtime |
| **Dynamic** | Colorloop, Rainbow, Sweep | Background mood |
| **Reactive** | Music-reactive (*) effects | Live performance |
| **Theatrical** | Strobe, Police Chase, Lightning | Shows, events |
| **Installations** | Fireworks, Plasma 2D, Fluid | Art pieces |
| **2D** | Fire 2D, DNA 2D, Matrix 2D | 2D LED panels |

The `*` prefix in the effect list indicates music-reactive effects (require microphone input configured in WLED).

---

## Recommended Helper Entities

Define in `packages/installations/wled_helpers.yaml`:

```yaml
input_boolean:
  wled_sync_global:
    name: "WLED Global Sync"
    icon: mdi:sync

  wled_sync_stage:
    name: "WLED Stage Sync"
    icon: mdi:theater

  wled_party_mode:
    name: "WLED Party Mode"
    icon: mdi:party-popper

  wled_show_mode:
    name: "WLED Show Mode"
    icon: mdi:spotlight

input_select:
  wled_active_scene:
    name: "WLED Active Scene"
    options:
      - "None"
      - "Cozy"
      - "Party"
      - "Performance"
      - "Focus"
      - "Holiday"
    icon: mdi:palette

input_number:
  wled_master_brightness:
    name: "WLED Master Brightness"
    min: 0
    max: 255
    step: 5
    mode: slider
    icon: mdi:brightness-6
```

---

## Recommended Scripts

Define in `packages/installations/wled_scripts.yaml`:

| Script | Action |
|--------|--------|
| `script.wled_all_on` | Turn on `light.wled_group_all` |
| `script.wled_all_off` | Turn off `light.wled_group_all` |
| `script.wled_sync_all_enable` | Turn on all sync_send/receive switches |
| `script.wled_sync_all_disable` | Turn off all sync switches |
| `script.wled_set_scene_cozy` | Apply preset 10 across all zones |
| `script.wled_set_scene_party` | Apply preset 12, enable party mode |
| `script.wled_set_scene_performance` | Apply preset 21, enable stage sync |
| `script.wled_set_scene_focus` | Warm white, low brightness, static |
| `script.wled_solo_device` | Takes `device_entity_id` param; disables sync_receive |
| `script.wled_rejoin_sync` | Takes `device_entity_id` param; re-enables sync_receive |
| `script.wled_apply_master_brightness` | Reads `input_number.wled_master_brightness`, applies to all |

---

## Recommended Package Structure

```
packages/installations/
├── wled_groups.yaml        # HA light groups for each zone
├── wled_helpers.yaml       # input_boolean, input_select, input_number
├── wled_scripts.yaml       # all WLED control scripts
├── wled_scenes.yaml        # cross-device scenes using presets
└── wled_automations.yaml   # sync with HA modes, party triggers, etc.
```

---

## Dashboard Controls (Brief — see DASHBOARD_ARCHITECTURE.md)

### Master Controls (always visible)
- WLED All On / Off toggle
- Master Brightness slider
- Active Scene selector (input_select.wled_active_scene)
- Party Mode / Show Mode toggles

### Per-Room Controls (in room subview)
- Group light card (color + brightness)
- Effect selector (dropdown)
- Sync toggle for that zone

### Individual Device Controls (in "Advanced" hidden subview)
- Each device: on/off, brightness, effect, palette, speed, intensity
- Sync send/receive switches
- Preset/playlist selectors
- IP address sensor (for direct web UI link)

---

## How to Avoid Clutter with 40+ Devices

1. **Never show individual devices on the main dashboard** — only groups
2. **Use input_select for effect/scene selection** rather than 40 effect dropdowns
3. **Use scripts as the interface** — dashboard buttons call scripts, not services directly
4. **Hide LED status switches** — the `_led` switches for TP-Link are noise; filter them into a hidden view
5. **Use WLED presets** — don't recreate complex effects in HA YAML; store them on the device
6. **Label-based targeting** — use HA Labels so automations target `label: wled_stage` instead of listing 10 entity IDs

---

## Migration Plan for New Devices

When adding each new WLED device:

1. Flash WLED firmware, set device name per naming convention
2. Configure sync zone (UDP port) in WLED web UI
3. Add to HA via WLED integration
4. Set friendly name in HA device settings to match convention
5. Add entity to appropriate light group in `wled_groups.yaml`
6. Add sync switches to the relevant script (`wled_sync_zone_X_enable/disable`)
7. Update WLED dashboard with the new device (in individual device subview only)
8. Test preset recall from HA
9. Commit to Git

---

*Plan only — no WLED configuration has been changed. Review and approve before implementation.*
