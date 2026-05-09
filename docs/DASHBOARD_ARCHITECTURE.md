# Dashboard Architecture — LaunchPad

**Status:** Architecture plan — no dashboard changes made  
**Created:** 2026-05-09  
**Current dashboards:** Overview, Main, Map

---

## Design Principles

1. **Fast first** — the most-used controls are one tap away
2. **Progressive disclosure** — advanced controls live in subviews, not the home screen
3. **Group, don't list** — show WLED zones and room groups, not 40 individual entities
4. **Mobile-first layout, tablet-optimized** — design for phone, enhance for wall panel
5. **Beautiful, not busy** — dark theme, consistent icons, section headers, whitespace
6. **Voice-first** — the dashboard confirms and adjusts what voice already controls
7. **Naming discipline** — every card title matches the entity friendly name or area name

---

## Recommended Dashboard Set

| Dashboard | URL | Audience | Purpose |
|-----------|-----|----------|---------|
| **Home** | `/lovelace` | Everyone | Daily use — scenes, music, status |
| **Rooms** | `/dashboard-rooms` | Everyone | Per-room light/device control |
| **Lighting** | `/dashboard-lighting` | Everyone | All switches + WLED groups |
| **Installations** | `/dashboard-installations` | Operator | WLED art + individual device control |
| **Voice & AI** | `/dashboard-voice` | Operator | Pipeline status, conversation, AI tasks |
| **System** | `/dashboard-system` | Admin | HA health, updates, logs, Git backup status |

> The current "Main" dashboard becomes the new "Home" dashboard. "Overview" can be repurposed or hidden.

---

## Dashboard 1: Home (Daily Use)

**Goal:** One screen that handles 90% of daily interactions. No clutter, no entity lists.

### Layout (Mobile — vertical cards)

```
┌─────────────────────────────────────┐
│  🏠 LaunchPad          [Time/Date]  │  ← header
├─────────────────────────────────────┤
│  ╔═══════════════════════════════╗  │
│  ║  SCENE QUICK LAUNCH           ║  │  ← button-card row
│  ║  [Cozy] [Party] [Focus] [Off] ║  │
│  ╚═══════════════════════════════╝  │
├─────────────────────────────────────┤
│  ╔═══════════════════════════════╗  │
│  ║  MUSIC                        ║  │  ← mini media card
│  ║  ♫ Spotify etcétre            ║  │
│  ║  [◀◀] [⏯] [▶▶]  ────●──      ║  │
│  ╚═══════════════════════════════╝  │
├─────────────────────────────────────┤
│  ROOMS AT A GLANCE                  │
│  [Lounge ●] [Stage ●] [Workshop ○] │  ← area cards (on/off indicator)
│  [Bathroom ○] [Kitchen ○]           │
├─────────────────────────────────────┤
│  WLED                               │
│  [Trillium ●] [Stage ●] [All ○]    │  ← light group toggles
│  Master Brightness ══════●══        │  ← slider
├─────────────────────────────────────┤
│  WHO'S HOME                         │
│  👤 Space  👤 Isaac  👤 Jared       │
├─────────────────────────────────────┤
│  QUICK CONTROLS                     │
│  [PA Speakers ●] [Ceiling Fan ●]   │
│  [Outdoor Lights ○]                 │
└─────────────────────────────────────┘
```

### Card Types
- **Scene Quick Launch:** `button` cards triggering scripts (not scenes directly — scripts can handle complex multi-domain actions)
- **Music:** `mini-media-player` from HACS or built-in media control card
- **Rooms at a Glance:** `area` cards or custom `mushroom-room-card`
- **WLED:** `light` cards for groups + `input_number` slider for master brightness
- **Who's Home:** `person` or `entity` cards with presence icons
- **Quick Controls:** `mushroom-entity-card` or `tile` cards for common switches

### Tablet Enhancement
On a wall-mounted tablet, use a 3-column grid layout. Scenes column left, music center, rooms right. Add a clock widget. Dark background.

---

## Dashboard 2: Rooms

**Goal:** Tap a room → see everything in that room.

### Layout
Top-level: room selector grid (one card per area, tap to navigate to subview)

```
┌──────────┬──────────┬──────────┐
│ Lounge   │ Stage    │ Kitchen  │
│ 3 lights │ 4 lights │ 1 light  │
├──────────┼──────────┼──────────┤
│ Bathroom │ Workshop │ Outdoor  │
│ 1 light  │ 5 lights │ 2 lights │
└──────────┴──────────┴──────────┘
```

Each room card navigates to a **subview** (tab) with:
- All lights/switches in the room (grouped, not individual unless needed)
- Motion sensor state
- Media player in room (if applicable)
- Temperature/humidity (if sensors exist)
- Room-specific quick actions (e.g., Workshop: "Start work session")

### Naming Convention for Room Subviews
`{Area Name} Controls` — e.g., "Workshop Controls", "Lounge Controls"

---

## Dashboard 3: Lighting

**Goal:** Full overview of every light and switch. Used for debugging or bulk control.

### Layout (two-column on mobile, three-column on tablet)

Sections:
1. **WLED Groups** — group light cards for each zone
2. **Room Switches** — by area (Lounge, Stage, Workshop, Bathroom, etc.)
3. **TP-Link Smart Switches** — all the named switches (3D printer, CNC, laser, etc.)
4. **Outdoor** — outdoor white lights, patio

> **Important:** The `_led` status indicator switches (e.g., `switch.3d_printer_light_led`) should be in a collapsible "Device LEDs" section at the bottom — not mixed with primary controls.

### Filter Strategy
Use HA Labels to filter cards:
- Label `primary_switch` → show in Lighting dashboard
- Label `device_led` → hide by default, show only in Advanced subview

---

## Dashboard 4: Installations (WLED Art Control)

**Goal:** Full control over art lighting. Power-user dashboard.

### Layout

```
┌─────────────────────────────────────┐
│  INSTALLATIONS              [Sync●] │
├──────────────┬──────────────────────┤
│  MASTER      │  ACTIVE SCENE        │
│  [All ON]    │  [Cozy ▼]            │
│  [All OFF]   │  Master Brightness   │
│              │  ══════════●══       │
├──────────────┴──────────────────────┤
│  ZONES                              │
│  Trillium    ════●══  [Effect ▼]   │
│  Stage       ═══●═══  [Effect ▼]   │
│  Lounge      ══●════  [Effect ▼]   │
│  Workshop    ●═══════  [Effect ▼]   │
├─────────────────────────────────────┤
│  QUICK SCENES                       │
│  [Party] [Show] [Cozy] [Focus]     │
│  [Rainbow] [Fire] [Breathe] [Off]  │
├─────────────────────────────────────┤
│  ▼ INDIVIDUAL DEVICES (advanced)   │  ← collapsible
│    Trillium  Speed ══●══ Int ══●══  │
│    Preset [▼] Palette [▼]          │
│    Sync Send ● Sync Receive ●      │
└─────────────────────────────────────┘
```

### Individual Device Section (hidden by default)
For each WLED device:
- On/off + color + brightness
- Effect, palette dropdowns
- Speed + intensity sliders
- Sync send/receive toggles
- Preset and playlist selectors
- Link button to WLED web UI (using sensor IP)

---

## Dashboard 5: Voice & AI

**Goal:** Monitor and configure the AI voice system. Operator/admin use.

### Layout

```
┌─────────────────────────────────────┐
│  MONA — VOICE & AI SYSTEM           │
├─────────────────────────────────────┤
│  SATELLITES                         │
│  HA Voice 0aab68        [idle ●]   │
│  Assist Microphone      [idle ●]   │
├─────────────────────────────────────┤
│  PIPELINE STATUS                    │
│  Sage (primary)         Homeway     │
│  HA GPT (secondary)     OpenAI      │
│  STT: faster-whisper    Local ✓     │
│  TTS: Piper             Local ✓     │
├─────────────────────────────────────┤
│  WAKE WORDS                         │
│  Hey Jarvis             Active      │
│  Hey Mycroft            Active      │
├─────────────────────────────────────┤
│  MUTE CONTROLS                      │
│  [HA Voice Mute ○]                  │
│  [ESPHome Mic Mute ○]               │
├─────────────────────────────────────┤
│  AI MODELS                          │
│  Homeway Sage           Connected   │
│  OpenAI                 Connected   │
│  Home Assistant NLP     Built-in    │
└─────────────────────────────────────┘
```

---

## Dashboard 6: System Health

**Goal:** At-a-glance health monitoring. Admin use.

### Sections
1. **HA Core Status** — version, uptime, safe mode indicator
2. **Pending Updates** — HA Core, OS, Supervisor, integrations, add-ons
3. **Connectivity** — Homeway connected, cloud connected, network
4. **Storage** — disk space sensor (if available)
5. **Git Backup** — last backup timestamp, status
6. **Unavailable Entities** — list of entities currently unavailable (template sensor)
7. **Zigbee (ZHA)** — device count, network status

---

## Naming Conventions

### Dashboard Titles
- Short, plain English, title case
- No abbreviations: "Installations" not "WLED", "Rooms" not "Rm Ctrl"

### View/Subview Titles
- `{Area} Controls` for room subviews
- `{Category} — Advanced` for hidden power-user sections

### Card Titles
- Match the entity or group friendly name exactly
- If no card title is needed (e.g., a full-width media card), set `show_header: false`

### Icon Conventions
| Domain | Icon |
|--------|------|
| Lights/WLED | `mdi:led-strip-variant` |
| Scenes | `mdi:palette` |
| Voice | `mdi:microphone` |
| Music | `mdi:music` |
| Workshop | `mdi:wrench` |
| Stage | `mdi:spotlight` |
| Outdoor | `mdi:outdoor-lamp` |
| System | `mdi:server` |
| AI | `mdi:robot` |
| Security | `mdi:shield-home` |

---

## Mobile-First Layout Recommendations

- Use `panel: false` on all views so cards stack naturally
- Max 2-column grid on mobile (`grid-template-columns: repeat(2, 1fr)`)
- Scene buttons: minimum 44×44px touch target
- Sliders: full-width, `height: 40px` minimum
- Avoid horizontal scroll — never use fixed-width card grids

## Tablet / Wall-Panel Recommendations

- Set browser to kiosk mode (hide sidebar, header)
- 3-column grid layout
- Clock widget top-right (HACS: `time-date-card`)
- Auto-refresh every 30s for presence indicators
- Touch targets minimum 60×60px
- Dark theme (`homeassistant-dark` or custom)
- Set as default dashboard for the wall tablet person account

---

## What NOT to Show on Main Dashboard

- Individual WLED device entities (use groups)
- `_led` status indicator switches
- `_remote_access` switches
- Unavailable entities (use a filter or visibility condition)
- Raw device trackers (show persons instead)
- Debug sensors (IP addresses, LED counts) → System dashboard only

---

*Architecture plan only. No dashboards have been modified.*
