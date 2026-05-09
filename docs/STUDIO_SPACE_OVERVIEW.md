# LaunchPad — Studio Space Overview

**Last updated:** 2026-05-09  
**Purpose:** Physical space documentation for AI-assisted HA management. Update this file as the space evolves.

---

## The Space

**LaunchPad** is a ~1,200 sq ft open studio — one large single room that serves simultaneously as a creative workspace, makerspace, performance stage, living area, and AI-native smart home environment. There are no interior walls dividing the main floor.

**Floors:**
- LaunchPad Main Floor — the primary open studio (~1,200 sq ft)
- Basement / Workshop — dedicated build/workshop space below main floor
- Outside — patio and exterior areas

---

## Audio System

### Overview
The audio system is designed for high-fidelity, multi-source, quadraphonic playback. All audio sources route through a central mixer before reaching the main PA speakers. The Home Assistant Voice satellite shares the PA speaker system for voice output.

```
[MacBook Pro "Space's"] ─── Scarlett DAC ──► [Mixer] ──► [EV Voice 15" PA L]
                                                     └──► [EV Voice 15" PA R]
[HA Voice Satellite] ─────────────────────► [Mixer] ──► (same PA bus)
                                                     
[AirFoil (on Mac)] ─────────────────────────────────► [EV Voice 15" PA] (AirPlay)
                   └─────────────────────────────────► [DB8 Monitor L] (rear left)
                   └─────────────────────────────────► [DB8 Monitor R] (rear right)
```

### Speakers
| Speaker | Model | Role | Location |
|---------|-------|------|----------|
| Main PA Left | EV Voice 15" | Front stereo L | Front of studio |
| Main PA Right | EV Voice 15" | Front stereo R | Front of studio |
| Monitor Left | DB8 | Rear monitor / back fill | Back-left corner |
| Monitor Right | DB8 | Rear monitor / back fill | Back-right corner |

> Quadraphonic layout: Front PA (L/R) + Rear DB8 monitors (L/R) = 4-channel immersive audio.

### Audio Interfaces & Routing
| Device | Role |
|--------|------|
| Scarlett DAC | High-resolution audio output from MacBook Pro → Mixer |
| Mixer | Central audio hub — combines MacBook Pro + HA Voice; routes to PA |
| AirFoil (Mac app) | Sends MacBook Pro audio to EV Voice PA speakers via AirPlay + DB8 monitors |

### HA Voice Satellite
- **Model:** Home Assistant Voice 0aab68
- **Location:** Dead center of the 1,200 sq ft studio
- **Audio output:** Connected into the mixer → feeds through the main EV Voice PA system
- **Wake words:** "Hey Jarvis" (primary), "Hey Mycroft" (secondary)
- **Pipeline A:** Sage (Homeway, ChatGPT/Gemini)
- **Pipeline B:** Home Assistant GPT (OpenAI)
- **LED Ring:** Visual feedback on voice state

> The HA Voice satellite speaks through the room's main PA system — voice responses are heard through the EV Voice 15" speakers, not a small internal speaker. TTS quality matters more here than on a desktop device.

---

## Music / Media System

### Primary Music Source
- **MacBook Pro:** "Space's MacBook Pro" (`media_player.spaces_macbook_pro`)
- **Software:** Spotify desktop app, controlled via HA Spotify Connect integration
- **Audio path:** MacBook Pro → Scarlett DAC → Mixer → EV Voice PA

### Distribution
- **AirFoil** (running on Mac): Streams Mac audio to:
  - EV Voice 15" PA speakers (via AirPlay)
  - DB8 monitors (rear channels)
- This creates true quadraphonic playback when all four speakers are active

### HA Media Control
| Entity | Role |
|--------|------|
| `media_player.spotify_etcetre` | Spotify playback control (Spotify Connect) |
| `media_player.spaces_macbook_pro` | Mac media player state |
| `media_player.mission_control` | Secondary media target |
| `switch.p_a_speakers` | PA speaker power |

### Music Assistant
Music Assistant is installed and serves as an advanced music management layer above Spotify. It can target multiple media players simultaneously and handle cross-source playback.

---

## Presence & Occupancy

### People
| Person | Entity | Primary Tracking |
|--------|--------|-----------------|
| Space Cadets | `person.space_cadets` | Mobile app + iCloud |
| Isaac Norris | `person.isaac_norris` | iCloud (iPhone 14, Apple Watch) |
| Jared Lee Lyons | `person.jared_lee_lyons` | iCloud + mobile app |

### Current Presence Detection Methods
| Method | Coverage | Reliability |
|--------|----------|-------------|
| iCloud (3 people) | Home/away (zone-level) | Good outdoors |
| Mobile app | Fine-grained, notifications | Excellent when app is active |
| ZHA motion sensors (2) | Room-level occupancy | Excellent when present |

### Motion Sensors
| Sensor | Location | Automation |
|--------|----------|-----------|
| `binary_sensor.motion_sensor_1` | Basement / Workshop | Basement motion lights on/off |
| `binary_sensor.motion_sensor_2` | Bathroom | Bathroom mirror on/off |

> No motion sensor currently in the main studio. The HA Voice device is the only sensor in the main floor space. Presence in the main room is inferred from device trackers only.

### Planned: mmWave Radar
- **Devices:** Millimeter wave radar sensors (quantity TBD)
- **Integration:** ESPHome custom device → Home Assistant
- **Purpose:** True room-level occupancy detection (detects stationary presence, not just motion)
- **Planned areas:** Main studio (primary), potentially Basement/Workshop
- **Advantage over motion sensors:** Detects people sitting still — important in a creative studio where people may be stationary for long periods at a workbench, screen, or instrument
- **When ready:** Create `packages/occupancy/radar.yaml` for radar helpers + automations

---

## Lighting

### WLED / Art Lighting
| Device | Entity | LEDs | Status |
|--------|--------|------|--------|
| Trillium | `light.trillium` | 1,422 | Online |
| wegoiot LED controller | `light.wegoiot_led_controller` | Unknown | Offline |
| ~40 more devices | — | — | Planned |

Trillium syncs via UDP (send + receive both ON). Sync is currently configured for the whole space.

### Standard Lighting
Most room lights are TP-Link smart switches. See `HOME_ASSISTANT_AUDIT.md` for the full inventory. Notable areas:
- Workshop: CNC, laser station, 3D printer, paint booth, clamp lamp switches
- Stage: Stage lights L/R, bar lights, DMX
- Lounge: Desk LEDs, leg lamp, earth, front right lamp

---

## Connectivity & Infrastructure

| Component | Notes |
|-----------|-------|
| Home Assistant host | Mini PC, runs HA OS |
| Homeway | Remote access, MCP for Cursor, Sage AI, Alexa/Google Assistant bridge |
| Zigbee (ZHA) | Entry button remote, 2 motion sensors |
| ESPHome | HA Voice satellite, ESPHome assist mic |
| WiFi devices | WLED, TP-Link, flux_led bulbs |
| Cursor + MCP | Engineering agent, reads/writes `/Volumes/config` |
| Git Config Backup | Auto-commit HA config changes to Git |

---

## Space Changelog

| Date | Change |
|------|--------|
| 2026-05-09 | Initial documentation created from AI session |
| — | *(Update this table as the space changes)* |

---

*This document is maintained by the AI engineering agent and updated during HA sessions. It is not auto-generated — it represents real-world knowledge about the space.*
