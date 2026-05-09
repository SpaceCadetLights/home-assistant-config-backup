# Home Assistant Audit — LaunchPad

**Generated:** 2026-05-09  
**HA Version:** 2026.4.4  
**Location:** LaunchPad (Asheville area, NC, US)  
**Time Zone:** America/New_York  

---

## Floors & Areas

### Floors
| Floor | Level | Aliases |
|-------|-------|---------|
| LaunchPad Main Floor | 1 | Ground Floor, Upstairs |
| Basement | 0 | Workshop, Basement, Downstairs |
| Outside | — | — |

### Areas
| Area | Floor | Icon |
|------|-------|------|
| Bathroom | LaunchPad Main Floor | — |
| Build Space | LaunchPad Main Floor | mdi:wrench |
| Kitchen | LaunchPad Main Floor | — |
| LaunchPad Upstairs | LaunchPad Main Floor | — |
| Lounge (Living Room) | LaunchPad Main Floor | mdi:sofa |
| Stage | LaunchPad Main Floor | mdi:speaker-wireless |
| Patio | Outside | — |
| Workshop | Basement | mdi:hammer-wrench |
| Projector | *(unassigned)* | — |

---

## Entity Categories

### Lights
| Entity | Name | State | Notes |
|--------|------|-------|-------|
| `light.trillium` | Trillium | on | WLED, 1422 LEDs, full effect list |
| `light.bulb_rgbw_c0c80d` | Bulb RGBW C0C80D | on | flux_led |
| `light.bulb_rgbw_8afe1a` | Elephant Light | off | flux_led |
| `light.home_assistant_voice_0aab68_led_ring` | HA Voice LED Ring | off | ESPHome satellite |
| `light.bulb_rgbcw_ea3128` | bulb rgbcw ea3128 | **unavailable** | flux_led — offline |
| `light.bulb_rgbcw_ea9a98` | bulb rgbcw ea9a98 | **unavailable** | flux_led — offline |
| `light.wegoiot_led_controller` | wegoiot led controller | **unavailable** | WLED — offline |

### Switches (Notable)
| Entity | Name | State |
|--------|------|-------|
| `switch.3d_printer_light` | 3D Printer Light | off |
| `switch.bar_lights` | Bar Lights | on |
| `switch.basement_light` | Basement Light | off |
| `switch.bathroom_mirror` | Bathroom mirror | off |
| `switch.ceiling_fan` | Ceiling Fan | on |
| `switch.clamp_lamp` | Clamp Lamp | off |
| `switch.cnc_table_light` | CNC Table Light | off |
| `switch.desk_leds` | Desk LEDs | off |
| `switch.dmx` | DMX | off |
| `switch.earth` | Earth | on |
| `switch.front_right_lamp` | Front Right Lamp | on |
| `switch.laser_station_light` | Laser Station Light | off |
| `switch.leg_lamp` | Leg Lamp | off |
| `switch.outdoor_white_lights` | Outdoor White Lights | off |
| `switch.p_a_speakers` | PA Speakers | on |
| `switch.paint_booth_light` | Paint Booth Light | off |
| `switch.red_desk_lamp` | Red Desk Lamp | off |
| `switch.stage_lights_left` | Stage Lights Left | off |
| `switch.stage_lights_right` | Stage Lights Right | off |

> Many switches have a paired `_led` switch (TP-Link status indicator LED). These are separate entities.

### Motion / Occupancy Sensors
| Entity | Name | State | Location |
|--------|------|-------|----------|
| `binary_sensor.motion_sensor_1` | Motion Sensor 1 | off | Basement (ZHA) |
| `binary_sensor.motion_sensor_1_occupancy` | Motion Sensor 1 Occupancy | off | Basement (ZHA) |
| `binary_sensor.motion_sensor_2` | Motion Sensor 2 | off | Bathroom (ZHA) |
| `binary_sensor.motion_sensor_2_occupancy` | Motion Sensor 2 Occupancy | off | Bathroom (ZHA) |

### Media Players
| Entity | Name | State |
|--------|------|-------|
| `media_player.spotify_etcetre` | Spotify etcétre | **playing** |
| `media_player.mission_control` | Mission Control | off |
| `media_player.projector` | Projector | paused |
| `media_player.bathroom_homepod` | Bathroom HomePod | idle |
| `media_player.home_assistant_voice_0aab68` | HA Voice | idle |
| `media_player.spaces_macbook_pro` | Space's MacBook Pro | idle |
| `media_player.isaacs_macbook_pro` | Isaac's MacBook Pro | idle |

> Several AirPlay variants show as `unavailable` — normal for AirPlay when devices are asleep.

### Persons & Presence
| Entity | Name | State |
|--------|------|-------|
| `person.space_cadets` | Space Cadets | home |
| `person.isaac_norris` | Isaac Norris | home |
| `person.jared_lee_lyons` | Jared Lee Lyons | home |

### Helpers
None defined (no `input_boolean`, `input_select`, `input_number`, `timer`, or `counter` entities found). All configuration is currently storage-only via the HA UI.

---

## Automations (6)

| ID | Alias | Trigger | Status |
|----|-------|---------|--------|
| 1755885323435 | LaunchPad Entry Button Trigger | ZHA button short press OR double press | on |
| 1755885936052 | Basement Motion Lights Off | Motion Sensor 1 not occupied for 15 min | on |
| 1755886052898 | Basement Motion Lights On | Motion Sensor 1 occupied | on |
| 1756185544633 | Bathroom Mirror Auto On | Motion Sensor 2 occupied + between sunrise/sunset | on |
| 1756185594930 | Turn Off Bathroom Mirror | Motion Sensor 2 not occupied for 10 min | on |
| 1777064054568 | Toggle Trillium Power with Entry Button | ZHA button short press | on |

### Automation Notes
- **Entry button conflict**: Both `LaunchPad Entry Button Trigger` (id: 1755885323435) and `Toggle Trillium Power with Entry Button` (id: 1777064054568) trigger on the same ZHA button short press. On a single press, both will fire simultaneously — one toggles Trillium, the other runs a CAFE flow that also toggles a light. This is likely unintentional and may need consolidation.
- Basement motion automation uses `area_id: basement` for targeting — clean pattern.
- Bathroom mirror automation uses raw `entity_id` references via device IDs — less readable.
- Entry button CAFE automation uses a state machine pattern for single/double press routing — sophisticated but complex.

---

## Scripts
None. `scripts.yaml` exists but is empty.

---

## Scenes (1)

| Entity | Name | Entities |
|--------|------|---------|
| `scene.printer_lights_on` | Printer Lights On | `switch.3d_printer_light` → on |

---

## Dashboards (3)

| ID | Title | Sidebar | Mode |
|----|-------|---------|------|
| `lovelace` | Overview | yes | storage |
| `dashboard_main` | Main | yes | storage |
| `map` | Map | yes | storage |

---

## Key Integrations

| Integration | Component | Purpose |
|-------------|-----------|---------|
| ZHA | `zha` | Zigbee coordinator (motion sensors, entry button) |
| ESPHome | `esphome` | HA Voice satellite, custom ESP devices |
| WLED | `wled` | Trillium LED strip (1422 LEDs) |
| flux_led | `flux_led` | WiFi bulbs (some unavailable) |
| TP-Link | `tplink` | Smart switches and plugs (most of the switch.* entities) |
| iCloud | `icloud` | Person/device tracking for Isaac |
| Music Assistant | `music_assistant` | Advanced media management |
| Spotify | `spotify` | Streaming (etcétre account) |
| Apple TV | `apple_tv` | Projector + media control |
| OpenAI Conversation | `openai_conversation` | AI conversation agent + TTS |
| Wyoming | `wyoming` | Local voice pipeline (STT/TTS) |
| Homeway | *(configuration.yaml)* | Alexa, Google Assistant, WebRTC proxy, MCP |
| Mobile App | `mobile_app` | iOS presence + notifications |
| HACS | `hacs` | Custom component management |
| Google Assistant | `google_assistant` | Voice control via Homeway |

---

## Potential Cleanup Opportunities

1. **Duplicate entry button automation** — `Toggle Trillium Power with Entry Button` conflicts with `LaunchPad Entry Button Trigger` on single press. Consider consolidating into one automation or assigning different buttons.
2. **Unavailable light entities** — `bulb_rgbcw_ea3128`, `bulb_rgbcw_ea9a98`, and `wegoiot_led_controller` are persistently unavailable. Determine if devices are offline, removed, or replaced.
3. **Duplicate media player entries** — Two `Bathroom HomePod` entries, two `Isaac's MacBook Pro` entries, two `Space Cadets AirPort` entries. Likely AirPlay vs. native integrations. Review and disable unused ones.
4. **Raw device IDs in automations** — The bathroom mirror and entry button automations reference devices by opaque hex IDs (e.g., `device_id: 04f313ea1a2693cd38586a4d1ba6fbb6`). Consider using entity IDs with labels for maintainability.
5. **No helper entities** — No `input_boolean`, `input_number`, or `input_select` helpers exist. Adding a few (e.g., `input_boolean.guest_mode`, `input_boolean.party_mode`) could power useful automations.
6. **Unassigned Projector area** — The `projector` area has no floor assignment.
7. **Empty scripts.yaml** — Consider creating at least one script to serve as a template pattern.

---

## Potential Future Automations

1. **"All off" at bedtime** — Turn off all non-essential switches at a set time or when everyone is in bed
2. **Guest mode** — Helper toggle that modifies automation behavior (e.g., suppresses motion lights at night)
3. **PA speaker auto-off** — Turn off PA speakers when Spotify stops playing
4. **Stage lights with Spotify** — Sync stage lights to playing/paused state of Spotify
5. **Entry announcement** — Play a sound or flash Trillium when someone arrives home
6. **Workshop safety** — Alert when Workshop motion detected at unusual hours
7. **Outdoor lights at sunset** — Automate outdoor white lights based on sun position
8. **Printer light on print start** — Integrate with 3D printer status to automate the printer light
9. **Morning routine** — Gradual light increase + music start based on first person up

---

## Risks & Confusing Config Patterns

| Risk | Details |
|------|---------|
| **Entry button double-trigger** | Two automations fire on the same ZHA short press — behavior is currently additive and potentially conflicting |
| **Homeway-managed config blocks** | Several blocks in `configuration.yaml` are auto-managed by Homeway (Alexa, Google Assistant, HTTP, WebRTC). Do not edit these manually — they may be overwritten |
| **Zigbee device IDs in automations** | If ZHA is reset or re-paired, device IDs change and automations break silently |
| **No YAML backup of UI automations** | Automations in `automations.yaml` are managed by the UI — edits via both UI and file editor can cause conflicts |
| **Missing `packages/` directory** | Without a packages folder, any new config blocks go directly into `configuration.yaml`, increasing clutter risk |

---

*Last updated by AI audit — 2026-05-09. Re-run after significant config changes.*
