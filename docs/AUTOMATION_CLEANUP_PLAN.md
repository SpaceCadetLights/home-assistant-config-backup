# Automation Cleanup Plan — LaunchPad

**Status:** Analysis and plan only — no automations modified  
**Created:** 2026-05-09  
**Current automation count:** 6  
**Scripts:** 0  
**Scenes:** 1

---

## Current Automation Inventory (Full Analysis)

### 1. `LaunchPad Entry Button Trigger` (id: 1755885323435)

```
Trigger: ZHA button short press OR double press (device: 04f313ea1...)
Action:  CAFE state machine
         - Single press → toggle light (f5c195.../ entity_id reference)
         - Double press → toggle Spotify media player
Mode: single
```

**Issues:**
- Uses raw `device_id` and `entity_id` hex references — not human-readable
- CAFE state machine pattern adds significant complexity for a simple 2-action button
- **Conflicts with automation #6** (`Toggle Trillium Power with Entry Button`) — both fire on short press
- Double press action seems intentional and useful; single press is the conflict source

**Verdict:** Needs consolidation with #6. The double-press Spotify toggle is good. The single-press should be unified.

---

### 2. `Basement Motion Lights Off` (id: 1755885936052)

```
Trigger: Motion Sensor 1 not occupied for 15 minutes (ZHA device 74f84bb3...)
Action:  switch.turn_off → area_id: basement
Mode: single
```

**Quality:** Good. Area-targeted. Clean.  
**Issues:** Uses raw `device_id` in trigger — if ZHA re-pairs, this breaks silently.  
**Verdict:** Keep as-is; migrate to `packages/lighting/basement.yaml` in Phase 3.

---

### 3. `Basement Motion Lights On` (id: 1755886052898)

```
Trigger: Motion Sensor 1 occupied (ZHA device 74f84bb3...)
Action:  switch.turn_on → area_id: basement
Mode: single
```

**Quality:** Good. Clean pair with #2.  
**Issues:** Same raw device_id concern as #2.  
**Verdict:** Keep as-is; migrate alongside #2.

---

### 4. `Bathroom Mirror Auto On` (id: 1756185544633)

```
Trigger: Motion Sensor 2 occupied (ZHA device 061b9b51...)
Condition: between sunrise and sunset
Action:  switch.turn_on → device_id: 4c193640... entity_id: ce518609...
Mode: single
```

**Quality:** Reasonable. Sun condition is a nice touch.  
**Issues:**
- Uses raw device_id and entity_id hex in action — not readable
- No "override" capability (if you manually turn off the mirror, it re-triggers on motion)
- Should probably use `switch.bathroom_mirror` entity ID directly

**Verdict:** Keep logic; clean up entity references; add optional override helper later.

---

### 5. `Turn Off Bathroom Mirror` (id: 1756185594930)

```
Trigger: Motion Sensor 2 not occupied for 10 minutes (ZHA device 061b9b51...)
Action:  switch.turn_off → device_id/entity_id hex
Mode: single
```

**Quality:** Reasonable pair with #4.  
**Issues:** Same raw device/entity ID concerns.  
**Verdict:** Keep; clean up references with #4.

---

### 6. `Toggle Trillium Power with Entry Button` (id: 1777064054568)

```
Trigger: ZHA button short press (device: 04f313ea1...) ← SAME device as #1
Action:  light.toggle → Trillium (entity hex reference)
Mode: single
```

**Issues:**
- **CRITICAL: Conflicts with automation #1** — both trigger on the same ZHA short press
- On every short press: Trillium toggles AND the CAFE flow also runs (toggling a different light)
- Likely unintentional — created later to replace or supplement #1 but both left active
- Uses raw entity hex ID

**Verdict:** This conflict is the most important cleanup task. Choose one of:
- **Option A:** Delete #6, update #1 CAFE to handle single press = Trillium toggle
- **Option B:** Delete the single-press branch from #1, keep #6 for Trillium
- **Option C:** Merge both into a new clean `security/access.yaml` package automation

**Recommended:** Option C during migration. For now, document the conflict.

---

## Clutter Issues Summary

| Issue | Severity | Automations Affected |
|-------|----------|---------------------|
| Entry button conflict (two autos on same trigger) | **Critical** | #1, #6 |
| Raw device_id/entity_id hex references | Medium | #1, #4, #5, #6 |
| CAFE complexity for a 2-branch button | Low | #1 |
| No override mechanism for motion-triggered lights | Low | #2, #3, #4, #5 |
| No descriptions/comments on any automation | Low | All |

---

## Naming Inconsistencies

Current names are inconsistent in pattern:

| Current Name | Proposed Name |
|-------------|---------------|
| `Basement Motion Lights Off` | `lighting.basement.motion_lights_off` |
| `Basement Motion Lights On` | `lighting.basement.motion_lights_on` |
| `Bathroom mirror auto on` | `lighting.bathroom.mirror_motion_on` |
| `Turn off bathroom mirror` | `lighting.bathroom.mirror_motion_off` |
| `LaunchPad Entry Button Trigger` | `security.access.entry_button` (consolidated) |
| `Toggle Trillium Power with entry button` | *(merged into above)* |

The `alias` field in the automation YAML is human-readable but has no enforced convention. Adopt the pattern: `{package}.{area}.{trigger_action}` for all future automations.

---

## What Should Become Scripts (Not Automations)

Automations should react to events. Scripts should be the reusable action sequences.

| Current Pattern | Should Be |
|----------------|-----------|
| Multi-step "turn on stage lights + bar + DMX" (future) | `script.lighting_set_stage_performance` |
| "All WLED off" triggered by voice | `script.wled_all_off` |
| "Morning routine" sequence | `script.mode_morning` |
| Spotify toggle | `script.media_toggle_spotify` (callable from button, voice, automation) |

---

## What Should Become Scenes

| Current Pattern | Should Be |
|----------------|-----------|
| `Printer Lights On` (scene.printer_lights_on) | ✓ Already a scene — keep |
| "Stage performance" lighting state | `scene.stage_performance` |
| "Workshop work mode" lighting state | `scene.workshop_work_mode` |
| "All off" state | `scene.all_lights_off` |
| "Cozy evening" lighting | `scene.lounge_cozy_evening` |

---

## What Should Become Packages

| Current Location | Target Package |
|-----------------|----------------|
| Basement motion automations (#2, #3) | `packages/lighting/basement.yaml` |
| Bathroom mirror automations (#4, #5) | `packages/lighting/bathroom.yaml` |
| Entry button automation (consolidated) | `packages/security/access.yaml` |
| Trillium toggle (merged) | `packages/security/access.yaml` or `packages/installations/trillium.yaml` |

---

## Cleanup Steps by Risk Level

### Low Risk (Do These First — No HA Restart Needed)

1. **Add descriptions** to all 6 automations via HA UI
   - Describe what each does, why it exists, and any known issues
   - No code change, just metadata — zero risk

2. **Add `alias` comments** consistent with proposed naming convention
   - Purely cosmetic, reversible

3. **Document the entry button conflict** in the automation descriptions
   - Makes the conflict visible to any future editor (human or AI)

4. **Create `packages/` folder structure** (empty skeleton files)
   - No HA impact until `homeassistant: packages:` is added to configuration.yaml

### Medium Risk (Require Reload After Each Change)

5. **Enable packages** in `configuration.yaml`
   - One-line addition: `homeassistant: packages: !include_dir_named packages`
   - Reload config (with your approval), verify no errors

6. **Migrate Basement automations** to `packages/lighting/basement.yaml`
   - Copy #2 and #3 into the package file
   - Delete from `automations.yaml`
   - Replace raw `device_id` in trigger with `entity_id: binary_sensor.motion_sensor_1`
   - Reload, test motion trigger

7. **Migrate Bathroom automations** to `packages/lighting/bathroom.yaml`
   - Copy #4 and #5
   - Replace raw hex references with `switch.bathroom_mirror`
   - Reload, test

8. **Migrate Printer Lights On** scene to `packages/lighting/lounge.yaml` or scenes package
   - Low-stakes, simple scene

### Changes That Should Wait (Higher Risk / Need Design Decision)

9. **Resolve the entry button conflict** (#1 vs #6)
   - Requires deciding which automation "wins" or writing a merged replacement
   - Test carefully before deleting either — ZHA button behavior can be subtle
   - Write the new version first, test it, then disable the old ones

10. **Rewrite CAFE automation** (#1) in plain YAML
    - CAFE is a visual editor that generates complex YAML; the output is hard to maintain
    - Replace with simple `choose:` block once the button conflict is resolved
    - Low priority until the conflict is fixed

11. **Add override helpers** to motion automations
    - Add `input_boolean.occupancy_bathroom_override` and `input_boolean.occupancy_basement_override`
    - Update automations to check: if override ON, don't auto-on/off
    - Medium complexity; medium risk

---

## Safe Migration Order

```
Week 1:  Add descriptions to all automations (UI, no reload)
Week 1:  Create empty packages/ skeleton
Week 2:  Enable packages (1 reload, verify)
Week 2:  Migrate basement motion pair (1 reload, test)
Week 3:  Migrate bathroom mirror pair (1 reload, test)
Week 4:  Decide on entry button strategy, draft merged automation
Week 5:  Deploy merged entry button, disable old ones (do NOT delete yet)
Week 6:  Test for 1 week, then delete disabled automations
Ongoing: Add new automations directly to packages (never to automations.yaml)
```

---

## What Should NOT Be Touched Yet

- The CAFE custom component — understand it before changing
- Any automation that uses ZHA device triggers — ZHA device IDs can change on re-pair
- The Homeway-added blocks in `configuration.yaml`
- Any integration-level settings

---

*No automations were modified during this analysis. All proposed changes require explicit approval.*
