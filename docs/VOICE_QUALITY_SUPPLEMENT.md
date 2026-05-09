# Voice Quality & AI Capability Supplement

**Created:** 2026-05-09  
**Context:** Supplements VOICE_LATENCY_OPTIMIZATION_PLAN.md and MONA_AI_HOME_ARCHITECTURE.md  
**Addresses:** TTS quality, GPT web search, Homeway Sage limitations, PA speaker output

---

## The PA Speaker Context

Because the HA Voice satellite's audio output runs through a professional PA system (EV Voice 15" speakers in a 1,200 sq ft studio), TTS quality matters significantly more than in a typical home deployment. A robotic or low-fidelity voice that is passable on a small smart speaker becomes noticeably poor on full-range 15" PA speakers.

**Implication:** Default Piper voices (which are trained for intelligibility, not naturalness) are adequate for utility but not appropriate as the primary voice for daily use through this system. A higher-quality local or premium cloud TTS should be the primary voice.

---

## Problem 1: Homeway Sage 500-Character Response Limit

### The Issue
The Homeway Sage conversation agent caps responses at ~500 characters. This is a Homeway product constraint — it cannot be changed from the HA side.

### Impact
- Truncated answers to complex questions
- Unusable for multi-step instructions, detailed explanations, creative responses
- Fine for simple device commands; frustrating for anything conversational

### Solution: Direct OpenAI GPT-4o with Web Search

The HA OpenAI Conversation integration supports:
- **Unlimited response length** (bounded only by the model's context window)
- **Web search built-in** (for GPT-4o and GPT-4o-mini — see Problem 2)
- **Custom system prompts** (tailor the assistant's personality and knowledge of the space)

**Recommended configuration:**
- Model: `gpt-4o-mini` for speed + cost balance; `gpt-4o` for highest quality
- Web search: enabled
- Expose entities: yes (so it can control devices)
- System prompt: include space context (see template below)

**This replaces Sage for the "Home Assistant GPT" pipeline** — you get unlimited responses, web search, and full control — at the cost of direct OpenAI API billing (typically $0.01–0.10 per voice session at gpt-4o-mini rates).

---

## Problem 2: GPT Web Search in Home Assistant

### Current State
Web search **is natively supported** in the HA OpenAI Conversation integration as of 2025. No custom component needed.

### How to Enable
In HA: **Settings → Devices & Services → OpenAI Conversation → Configure**

Look for:
- ✅ **Enable web search** — toggle on
- **Search context size:** `medium` (recommended — balances detail vs speed)
- **Include home location:** optional — uses your HA location for local search relevance

### Supported Models
Web search works with:
- `gpt-4o`
- `gpt-4o-mini`
- `gpt-4.1` and variants (as of mid-2025)
- Most current GPT models (HA now auto-detects support)

### What This Gives You
- Real-time weather, news, sports scores
- Current product info, prices, documentation
- Live event lookups
- Anything Sage can search — but with unlimited response length

---

## Problem 3: TTS Voice Quality on PA System

### Current State
Piper (local) is the active TTS and is appropriate for utility. However, Piper voices are trained for intelligibility over naturalness and will not match ElevenLabs quality on a full PA system.

### Recommendation: Kokoro TTS — `bm_lewis` Voice

**Kokoro** is a high-quality neural TTS that runs locally via the Wyoming protocol — the same protocol HA already uses for Piper. It is a direct drop-in replacement.

**The `bm_lewis` voice** is a British Male voice — soft, natural, high-fidelity. This is the closest locally-run equivalent to your ElevenLabs British male voice.

#### Quality Comparison
| TTS | Quality | Latency | Cost | Local? |
|-----|---------|---------|------|--------|
| Piper (current) | Good — intelligible | 100–300ms | Free | ✅ |
| **Kokoro `bm_lewis`** | **Excellent — natural** | **200–500ms** | **Free** | ✅ |
| OpenAI TTS (`onyx`) | Excellent | 300–800ms | Paid per char | ❌ |
| ElevenLabs | Best | 400–1200ms | Paid per char | ❌ |

Kokoro runs at near-Piper latency on a capable mini PC, and the quality improvement on PA speakers will be immediately noticeable.

#### Available Kokoro Voices (Sample)
| Voice ID | Type | Description |
|----------|------|-------------|
| `bm_lewis` | British Male | Soft, clear, natural — **recommended** |
| `bm_george` | British Male | Deeper, more authoritative |
| `bm_daniel` | British Male | Conversational |
| `af_sky` | American Female | Natural, warm |
| `am_adam` | American Male | Standard |

> 52 voices total across English and other languages.

### How to Install Kokoro

**Method A: Wyoming Kokoro Add-on (simplest)**

Kokoro is available as a Wyoming-protocol add-on. Installation steps (to be done in HA UI):

1. Go to **Settings → Add-ons → Add-on Store**
2. Search for "Kokoro" or "Wyoming Kokoro"
3. Install and configure with voice: `bm_lewis`
4. Expose via Wyoming integration at port `10200` (or configured port)
5. In HA: **Settings → Devices & Services → Add Integration → Wyoming Protocol**
6. Point to the Kokoro server
7. A new TTS entity will appear: `tts.kokoro`

**Method B: Docker Container** (if running HA in Docker or on a separate server)
```bash
docker run -d \
  --name kokoro-wyoming \
  -p 10200:10200 \
  nullableeth/kokoro-wyoming \
  --voice bm_lewis
```
Then add the Wyoming integration pointing to the Docker host IP.

**Method C: HACS Custom Component**
If available via HACS — search "Kokoro" in HACS integrations.

### After Installation: Pipeline Configuration

Update (or create) the "MONA Fast" pipeline:
- **TTS:** Kokoro (`tts.kokoro`) with voice `bm_lewis`

Update the "Home Assistant GPT" pipeline:
- **Conversation:** OpenAI Conversation (with web search enabled)
- **TTS:** Kokoro (`tts.kokoro`) — so GPT responses sound premium on the PA

Keep Piper available as a fallback (it will still exist as `tts.piper`).

---

## Recommended System Prompt for OpenAI Conversation

Use this as a starting point. Set it in the OpenAI Conversation integration configuration:

```
You are MONA, the AI assistant for LaunchPad — a 1,200 sq ft creative studio and smart home.

LaunchPad has:
- A professional PA audio system (EV Voice 15" speakers + DB8 rear monitors — quadraphonic)
- Spotify music via MacBook Pro and Music Assistant
- WLED art lighting (Trillium, 1422 LEDs, + more being added)
- Workshop equipment (CNC, laser cutter, 3D printer)
- A stage area with DMX lighting
- 3 residents: Space Cadets, Isaac, and Jared

You can control lights, switches, media players, scenes, and WLED effects.
Keep responses concise and natural — they will be spoken aloud through PA speakers.
If asked something outside HA control, use web search to answer accurately.
Never expose API keys, passwords, or internal URLs.
```

---

## Updated Pipeline Recommendations

### Pipeline A: MONA Fast (Primary — "Hey Jarvis")
| Stage | Component | Notes |
|-------|-----------|-------|
| Wake | openWakeWord "Hey Jarvis" | Local |
| STT | faster-whisper (medium) | Local |
| Conversation | HA Built-in | Local — device commands |
| TTS | **Kokoro `bm_lewis`** | Local — premium voice |
| Total | ~700–1100ms | Fully local, beautiful voice |

### Pipeline B: MONA Smart (Secondary — "Hey Mycroft")
| Stage | Component | Notes |
|-------|-----------|-------|
| Wake | openWakeWord "Hey Mycroft" | Local |
| STT | faster-whisper (medium) | Local |
| Conversation | **OpenAI GPT-4o-mini + web search** | Cloud — unlimited, searchable |
| TTS | **Kokoro `bm_lewis`** | Local — premium voice |
| Total | ~1200–2000ms | Best capability, still local TTS |

### Pipeline C: MONA Pro (Button-triggered on HA Voice)
| Stage | Component | Notes |
|-------|-----------|-------|
| Trigger | HA Voice button press | Manual |
| STT | faster-whisper | Local |
| Conversation | **OpenAI GPT-4o + web search** | Cloud — highest quality |
| TTS | **Kokoro `bm_lewis`** | Local |
| Total | ~2000–3500ms | Best quality responses |

> **Sage pipeline:** Keep available as a 4th pipeline for comparison or specific use. It has web search and is free via Homeway, but the 500-char limit makes it unsuitable for complex queries. Useful as a backup if OpenAI API is unavailable.

---

## Basement Presence & mmWave Radar Notes

### Current State
- `binary_sensor.motion_sensor_1` (ZHA) detects motion in the Basement/Workshop
- Powers 2 automations: lights on when occupied, lights off after 15 min of no motion
- **This logic is working well and should not be changed**

### Limitation of Current Motion Sensor
Standard PIR motion sensors require physical movement. In a workshop where someone may be stationary at a bench, lathe, or computer, presence will time out even though a person is there.

### mmWave Radar Plan
- mmWave radar (24GHz) detects presence of stationary humans
- ESPHome integration is straightforward — same as any ESPHome device
- **Recommended sensor:** HiLink LD2410 or LD2450 (multi-target, up to 6m range)
- **Install in:** Basement/Workshop first; Main Studio second

### When You're Ready to Add Radar
1. Flash ESPHome to a compatible ESP32/ESP8266 board
2. Wire the radar module to the ESP board
3. Add to ESPHome via HA ESPHome integration
4. Two new entities will appear: `binary_sensor.workshop_radar_presence` (occupancy) + `sensor.workshop_radar_distance`
5. Update basement automations to use the radar `binary_sensor` instead of (or in addition to) the motion sensor
6. Create package: `packages/occupancy/radar.yaml`

The motion sensor can remain as a secondary trigger — radar for steady-state presence, motion sensor as a fast-response secondary.

---

## Summary of Actions (Priority Order)

| Priority | Action | Effort | What It Unlocks |
|----------|--------|--------|-----------------|
| 1 | Enable web search in OpenAI Conversation integration settings | 5 min | Unlimited GPT + web search immediately |
| 2 | Write MONA system prompt in OpenAI integration | 10 min | Context-aware AI assistant |
| 3 | Install Kokoro TTS add-on | 15–30 min | Premium British voice through PA |
| 4 | Create "MONA Fast" pipeline (Whisper + HA NLP + Kokoro) | 10 min | Fast local voice |
| 5 | Create "MONA Smart" pipeline (Whisper + GPT-4o-mini/search + Kokoro) | 10 min | Unlimited AI + web search |
| 6 | Assign MONA Fast as primary on both satellites | 5 min | Daily voice dramatically improved |
| 7 | Assign MONA Smart as secondary (Hey Mycroft) | 5 min | Complex queries routed to GPT |
| 8 | Order mmWave radar modules | — | Workshop presence detection |
| 9 | Flash + install radar when hardware arrives | 1–2 hr | True occupancy detection |

---

*No pipelines, integrations, or configurations have been modified. All steps above require explicit approval before implementation.*
