"""LaunchPad helpers: add current track to Music Assistant / Spotify playlists."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

from .const import (
    DEFAULT_PLAYER,
    DOMAIN,
    INDEX_BUILD_CONCURRENCY,
    INDEX_MAX_AGE_SECONDS,
    MASS_ENTRY_ID,
    MEMBERSHIP_CACHE_SECONDS,
    MEMBERSHIP_CONCURRENCY,
    SKIP_ADD_NAMES,
)

_LOGGER = logging.getLogger(__name__)


def _norm_name(value: str) -> str:
    text = (value or "").casefold().strip()
    text = re.sub(r"^[\s'\"]*(my|the)\s+", "", text)
    text = re.sub(r"\s+playlist\s*$", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" \t\"'")


def _playlist_id_from_uri(uri: str) -> str | None:
    if not uri:
        return None
    if uri.startswith("library://playlist/"):
        return uri.rsplit("/", 1)[-1]
    return None


def _spotify_track_ids(*values: str | None) -> set[str]:
    """Extract Spotify track IDs from MA/Spotify URI variants."""
    ids: set[str] = set()
    for value in values:
        if not value:
            continue
        text = str(value)
        for match in re.finditer(r"(?:track[:/]|spotify:track:)([A-Za-z0-9]{10,})", text):
            ids.add(match.group(1))
        for match in re.finditer(r"spotify--[^/]+://track/([A-Za-z0-9]{10,})", text):
            ids.add(match.group(1))
    return ids


def _track_match_keys(track_uri: str, spotify_id: str | None = None) -> set[str]:
    keys = {track_uri}
    if spotify_id:
        keys.add(f"spotify:track:{spotify_id}")
        keys.add(f"spotify://track/{spotify_id}")
        keys.add(spotify_id)
    keys |= _spotify_track_ids(track_uri, spotify_id)
    return keys


def _item_uris(item: Any) -> set[str]:
    uris: set[str] = set()
    if item is None:
        return uris
    if isinstance(item, dict):
        if uri := item.get("uri"):
            uris.add(str(uri))
        if item_id := item.get("item_id"):
            provider = str(item.get("provider") or "")
            if "spotify" in provider.lower() and item_id:
                uris.add(f"spotify:track:{item_id}")
                uris.add(f"spotify://track/{item_id}")
        for mapping in item.get("provider_mappings") or []:
            if not isinstance(mapping, dict):
                continue
            mid = mapping.get("item_id") or mapping.get("url")
            prov = str(
                mapping.get("provider_domain") or mapping.get("provider_instance") or ""
            )
            if mid and "spotify" in prov.lower():
                uris.add(f"spotify:track:{mid}")
                uris.add(f"spotify://track/{mid}")
            if mapping.get("url"):
                uris.add(str(mapping["url"]))
        nested = item.get("media_item")
        if isinstance(nested, dict):
            uris |= _item_uris(nested)
        for sid in _spotify_track_ids(*uris):
            uris.add(sid)
        return uris
    uri = getattr(item, "uri", None)
    if uri:
        uris.add(str(uri))
    for sid in _spotify_track_ids(*uris):
        uris.add(sid)
    return uris


def _serialize_playlist(item: dict[str, Any]) -> dict[str, Any]:
    name = item.get("name") or ""
    uri = item.get("uri") or ""
    image = item.get("image")
    if isinstance(image, dict):
        image = image.get("path") or image.get("url")
    return {
        "name": name,
        "uri": uri,
        "image": image,
        "id": _playlist_id_from_uri(uri),
        "can_add": _norm_name(name) not in SKIP_ADD_NAMES,
        "last_edited": 0.0,
        "contains": False,
    }


def _edits_store(hass: HomeAssistant) -> Store:
    store = hass.data.setdefault(DOMAIN, {}).get("edits_store")
    if store is None:
        store = Store(hass, 1, f"{DOMAIN}.playlist_edits")
        hass.data[DOMAIN]["edits_store"] = store
    return store


def _index_store(hass: HomeAssistant) -> Store:
    store = hass.data.setdefault(DOMAIN, {}).get("index_store")
    if store is None:
        store = Store(hass, 1, f"{DOMAIN}.track_index")
        hass.data[DOMAIN]["index_store"] = store
    return store


async def _load_playlist_edits(hass: HomeAssistant) -> dict[str, float]:
    cached = hass.data.setdefault(DOMAIN, {}).get("edits_cache")
    if isinstance(cached, dict):
        return cached
    data = await _edits_store(hass).async_load()
    edits: dict[str, float] = {}
    if isinstance(data, dict):
        raw = data.get("playlists") if isinstance(data.get("playlists"), dict) else data
        for key, val in (raw or {}).items():
            try:
                edits[str(key)] = float(val)
            except (TypeError, ValueError):
                continue
    hass.data[DOMAIN]["edits_cache"] = edits
    return edits


async def _touch_playlist(hass: HomeAssistant, uri: str) -> float:
    """Record that a playlist was edited; returns the new timestamp."""
    if not uri:
        return 0.0
    edits = dict(await _load_playlist_edits(hass))
    ts = time.time()
    edits[uri] = ts
    hass.data[DOMAIN]["edits_cache"] = edits
    await _edits_store(hass).async_save({"playlists": edits})
    return ts


def _apply_last_edited(playlists: list[dict[str, Any]], edits: dict[str, float]) -> None:
    for pl in playlists:
        pl["last_edited"] = float(edits.get(pl.get("uri") or "", 0) or 0)


def _sort_playlists(playlists: list[dict[str, Any]]) -> None:
    """Most recently edited first, then already-on, then name."""
    playlists.sort(
        key=lambda p: (
            -float(p.get("last_edited") or 0),
            not p.get("contains", False),
            (p.get("name") or "").casefold(),
        )
    )


async def _load_track_index(hass: HomeAssistant) -> dict[str, Any]:
    cached = hass.data.setdefault(DOMAIN, {}).get("track_index")
    if isinstance(cached, dict) and "track_to_playlists" in cached:
        return cached
    data = await _index_store(hass).async_load()
    index: dict[str, Any] = {
        "updated_at": 0.0,
        "full_rebuild_at": 0.0,
        "track_to_playlists": {},
    }
    if isinstance(data, dict):
        index["updated_at"] = float(data.get("updated_at") or 0)
        index["full_rebuild_at"] = float(data.get("full_rebuild_at") or 0)
        raw = data.get("track_to_playlists") or {}
        if isinstance(raw, dict):
            cleaned: dict[str, list[str]] = {}
            for key, val in raw.items():
                if isinstance(val, list):
                    cleaned[str(key)] = [str(v) for v in val if v]
            index["track_to_playlists"] = cleaned
    hass.data[DOMAIN]["track_index"] = index
    return index


async def _save_track_index(hass: HomeAssistant, index: dict[str, Any]) -> None:
    hass.data[DOMAIN]["track_index"] = index
    await _index_store(hass).async_save(
        {
            "updated_at": float(index.get("updated_at") or 0),
            "full_rebuild_at": float(index.get("full_rebuild_at") or 0),
            "track_to_playlists": index.get("track_to_playlists") or {},
        }
    )


def _index_is_warm(index: dict[str, Any]) -> bool:
    """True after a completed full rebuild within INDEX_MAX_AGE_SECONDS."""
    updated = float(index.get("full_rebuild_at") or 0)
    if updated <= 0:
        return False
    return (time.time() - updated) < INDEX_MAX_AGE_SECONDS


def _apply_membership_from_index(
    playlists: list[dict[str, Any]],
    track: dict[str, Any],
    index: dict[str, Any],
) -> int:
    """Set contains from inverted index. Returns number of hits."""
    keys = _track_match_keys(track.get("uri") or "", track.get("spotify_id"))
    mapping: dict[str, list[str]] = index.get("track_to_playlists") or {}
    hit_uris: set[str] = set()
    for key in keys:
        for uri in mapping.get(key) or []:
            hit_uris.add(uri)
    for pl in playlists:
        pl["contains"] = (pl.get("uri") or "") in hit_uris
    return len(hit_uris)


async def _index_add_track_to_playlist(
    hass: HomeAssistant,
    track: dict[str, Any],
    playlist_uri: str,
) -> None:
    if not playlist_uri:
        return
    index = await _load_track_index(hass)
    mapping: dict[str, list[str]] = dict(index.get("track_to_playlists") or {})
    keys = _track_match_keys(track.get("uri") or "", track.get("spotify_id"))
    changed = False
    for key in keys:
        cur = list(mapping.get(key) or [])
        if playlist_uri not in cur:
            cur.append(playlist_uri)
            mapping[key] = cur
            changed = True
    if changed:
        index["track_to_playlists"] = mapping
        await _save_track_index(hass, index)


async def _index_remove_track_from_playlist(
    hass: HomeAssistant,
    track: dict[str, Any],
    playlist_uri: str,
) -> None:
    if not playlist_uri:
        return
    index = await _load_track_index(hass)
    mapping: dict[str, list[str]] = dict(index.get("track_to_playlists") or {})
    keys = _track_match_keys(track.get("uri") or "", track.get("spotify_id"))
    changed = False
    for key in keys:
        cur = [u for u in (mapping.get(key) or []) if u != playlist_uri]
        if cur != list(mapping.get(key) or []):
            if cur:
                mapping[key] = cur
            else:
                mapping.pop(key, None)
            changed = True
    if changed:
        index["track_to_playlists"] = mapping
        await _save_track_index(hass, index)


async def _index_merge_scan(
    hass: HomeAssistant,
    track: dict[str, Any],
    playlists: list[dict[str, Any]],
) -> None:
    """Merge one track's membership scan into the inverted index."""
    index = await _load_track_index(hass)
    mapping: dict[str, list[str]] = dict(index.get("track_to_playlists") or {})
    keys = _track_match_keys(track.get("uri") or "", track.get("spotify_id"))
    hit_uris = [p["uri"] for p in playlists if p.get("contains") and p.get("uri")]
    changed = False
    for key in keys:
        before = set(mapping.get(key) or [])
        cur = set(hit_uris)
        if cur != before:
            mapping[key] = sorted(cur)
            changed = True
    if changed:
        index["track_to_playlists"] = mapping
        await _save_track_index(hass, index)


async def _get_mass(hass: HomeAssistant):
    from homeassistant.components.music_assistant.helpers import get_music_assistant_client

    return get_music_assistant_client(hass, MASS_ENTRY_ID)


async def _sync_playlists_from_providers(hass: HomeAssistant) -> None:
    """Ask Music Assistant to pull playlist changes from Spotify (and others).

    Spotify does not push webhooks into MA — HA→Spotify is immediate on add/remove,
    but Spotify→HA only updates when MA syncs / force-refreshes. Triggering sync when
    the Save picker opens is the closest we get to “immediate” the other direction.
    """
    state = hass.data.setdefault(DOMAIN, {})
    if state.get("playlist_syncing"):
        return
    now = time.time()
    last = float(state.get("playlist_sync_at") or 0)
    if now - last < 20:
        return
    state["playlist_syncing"] = True
    state["playlist_sync_at"] = now
    try:
        mass = await _get_mass(hass)
        music = mass.music
        synced = False
        for meth_name, kwargs in (
            ("sync", {"media_types": ["playlist"]}),
            ("start_sync", {"media_types": ["playlist"]}),
            ("sync", {}),
            ("start_sync", {}),
        ):
            meth = getattr(music, meth_name, None)
            if not callable(meth):
                continue
            try:
                result = meth(**kwargs)
                if asyncio.iscoroutine(result):
                    await result
                synced = True
                break
            except TypeError:
                try:
                    result = meth()
                    if asyncio.iscoroutine(result):
                        await result
                    synced = True
                    break
                except Exception:  # noqa: BLE001
                    continue
            except Exception as err:  # noqa: BLE001
                _LOGGER.debug("MA %s failed: %s", meth_name, err)
        if synced:
            _LOGGER.info("LaunchPad triggered Music Assistant playlist sync")
        else:
            _LOGGER.debug("LaunchPad could not find a MA playlist sync method")
    except Exception:  # noqa: BLE001
        _LOGGER.exception("LaunchPad playlist sync failed")
    finally:
        state["playlist_syncing"] = False


def _schedule_playlist_sync(hass: HomeAssistant) -> None:
    hass.async_create_task(_sync_playlists_from_providers(hass))


def _spotify_provider_ref(mass: Any) -> str:
    """Best-effort Spotify provider instance/domain for create_playlist."""
    providers = []
    for attr in ("providers", "get_library_providers"):
        obj = getattr(mass.music, attr, None)
        if callable(obj):
            try:
                obj = obj()
            except Exception:  # noqa: BLE001
                obj = None
        if obj:
            providers = list(obj)
            break
    if not providers:
        providers = list(getattr(mass, "music_providers", None) or [])
    for prov in providers:
        domain = str(
            getattr(prov, "domain", None)
            or getattr(prov, "lookup_key", None)
            or ""
        ).lower()
        instance = str(getattr(prov, "instance_id", None) or "")
        if "spotify" in domain or instance.startswith("spotify"):
            return instance or domain or "spotify"
    return "spotify"


async def _track_positions_in_playlist(
    mass: Any,
    playlist_id: str,
    match_keys: set[str],
    *,
    force_refresh: bool = True,
) -> list[int]:
    """Return playlist positions for a track (required by MA remove_playlist_tracks)."""
    positions: list[int] = []
    fallback = 0
    async for track in _iter_playlist_tracks(
        mass, playlist_id, force_refresh=force_refresh
    ):
        if _item_uris(track) & match_keys:
            if isinstance(track, dict):
                pos = track.get("position")
            else:
                pos = getattr(track, "position", None)
            try:
                positions.append(int(pos) if pos is not None else fallback)
            except (TypeError, ValueError):
                positions.append(fallback)
        fallback += 1
    return positions


async def _get_current_track(hass: HomeAssistant, entity_id: str) -> dict[str, Any]:
    resp = await hass.services.async_call(
        "music_assistant",
        "get_queue",
        target={"entity_id": entity_id},
        blocking=True,
        return_response=True,
    )
    payload = (resp or {}).get(entity_id) or {}
    current = payload.get("current_item")
    if not current:
        raise ServiceValidationError("Nothing is playing right now.")
    media = current.get("media_item") or {}
    stream = current.get("stream_details") or {}
    spotify_id = (
        stream.get("item_id")
        if "spotify" in str(stream.get("provider") or "").lower()
        else None
    )
    uri = media.get("uri") or current.get("uri")
    if not uri:
        raise ServiceValidationError("Current track has no Music Assistant URI.")
    artists = [
        a.get("name")
        for a in (media.get("artists") or [])
        if isinstance(a, dict) and a.get("name")
    ]
    return {
        "uri": uri,
        "name": media.get("name") or current.get("name") or "Unknown",
        "artists": artists,
        "artist": ", ".join(artists),
        "album": (media.get("album") or {}).get("name")
        if isinstance(media.get("album"), dict)
        else None,
        "image": media.get("image"),
        "spotify_id": spotify_id,
        "player": entity_id,
    }


async def _list_playlists(hass: HomeAssistant) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    try:
        resp = await hass.services.async_call(
            "music_assistant",
            "get_library",
            {
                "config_entry_id": MASS_ENTRY_ID,
                "media_type": "playlist",
                "limit": 500,
            },
            blocking=True,
            return_response=True,
        )
        items = list((resp or {}).get("items") or [])
        if not items:
            raise RuntimeError("get_library returned no playlists")
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("get_library playlists failed (%s); using Mass client", err)
        mass = await _get_mass(hass)
        offset = 0
        limit = 50
        while True:
            page = await mass.music.get_library_playlists(limit=limit, offset=offset)
            batch = page
            if isinstance(page, dict):
                batch = page.get("items") or []
            elif hasattr(page, "items"):
                batch = page.items
            batch = list(batch or [])
            for p in batch:
                if isinstance(p, dict):
                    items.append(p)
                else:
                    items.append(
                        {
                            "name": getattr(p, "name", "") or "",
                            "uri": getattr(p, "uri", "") or "",
                            "image": None,
                        }
                    )
            if len(batch) < limit:
                break
            offset += limit
            if offset > 2000:
                break
    return [_serialize_playlist(p) for p in items if isinstance(p, dict)]


async def _iter_playlist_tracks(
    mass: Any,
    playlist_id: str,
    *,
    force_refresh: bool = False,
):
    page = 0
    while page < 40:
        try:
            result = await mass.music.get_playlist_tracks(
                item_id=str(playlist_id),
                provider_instance_id_or_domain="library",
                force_refresh=force_refresh,
                page=page,
            )
        except TypeError:
            result = await mass.music.get_playlist_tracks(
                item_id=str(playlist_id),
                provider_instance_id_or_domain="library",
                force_refresh=force_refresh,
            )
            page = 999
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("playlist %s tracks failed: %s", playlist_id, err)
            return

        tracks = result
        if isinstance(result, dict):
            tracks = result.get("items") or result.get("tracks") or []
        elif hasattr(result, "items"):
            tracks = result.items
        tracks = list(tracks or [])
        if not tracks:
            return
        for track in tracks:
            yield track
        if len(tracks) < 25 or page >= 999:
            return
        page += 1


async def _playlist_contains(
    mass: Any,
    playlist_id: str,
    match_keys: set[str],
    *,
    force_refresh: bool = False,
) -> bool:
    async for track in _iter_playlist_tracks(
        mass, playlist_id, force_refresh=force_refresh
    ):
        if _item_uris(track) & match_keys:
            return True
    return False


async def _scan_membership(
    hass: HomeAssistant,
    track: dict[str, Any],
    playlists: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Live scan with progressive index writes (recent playlists first)."""
    cache = hass.data.setdefault(DOMAIN, {}).setdefault("membership_cache", {})
    cache_key = track["uri"]
    now = time.time()
    cached = cache.get(cache_key)
    if cached and now - cached["ts"] < MEMBERSHIP_CACHE_SECONDS:
        by_uri = {p["uri"]: p.get("contains", False) for p in cached["playlists"]}
        out = []
        for pl in playlists:
            row = dict(pl)
            row["contains"] = by_uri.get(pl["uri"], False)
            out.append(row)
        _sort_playlists(out)
        return out

    mass = await _get_mass(hass)
    match_keys = _track_match_keys(track["uri"], track.get("spotify_id"))
    sem = asyncio.Semaphore(MEMBERSHIP_CONCURRENCY)

    # Recent edits first — most likely to contain the current song.
    ordered = sorted(
        playlists,
        key=lambda p: (
            -float(p.get("last_edited") or 0),
            (p.get("name") or "").casefold(),
        ),
    )
    by_uri: dict[str, dict[str, Any]] = {
        (pl.get("uri") or f"anon-{i}"): {**pl, "contains": False}
        for i, pl in enumerate(playlists)
    }

    async def _one(pl: dict[str, Any]) -> tuple[str, bool]:
        uri = pl.get("uri") or ""
        pid = pl.get("id")
        if not pid or not uri:
            return uri, False
        async with sem:
            # Recent playlists: force_refresh so Spotify→MA edits show up quickly.
            freshen = bool(pl.get("_force_refresh"))
            hit = await _playlist_contains(
                mass, str(pid), match_keys, force_refresh=freshen
            )
        return uri, hit

    batch_size = 12
    hits = 0
    for i, pl in enumerate(ordered):
        # First ~24 (most recently edited) get a live Spotify refresh.
        if i < 24:
            pl = dict(pl)
            pl["_force_refresh"] = True
            ordered[i] = pl

    for i in range(0, len(ordered), batch_size):
        batch = ordered[i : i + batch_size]
        results = await asyncio.gather(*[_one(pl) for pl in batch])
        batch_hits: list[str] = []
        for uri, contains in results:
            if not uri or uri not in by_uri:
                continue
            by_uri[uri]["contains"] = contains
            if contains:
                hits += 1
                batch_hits.append(uri)
        # Persist hits immediately so the Save UI can paint green outlines while scanning.
        for uri in batch_hits:
            await _index_add_track_to_playlist(hass, track, uri)
        if i == 0 or (i // batch_size) % 5 == 0:
            _LOGGER.warning(
                "LaunchPad membership scan progress: %s/%s playlists, %s hits (%s)",
                min(i + batch_size, len(ordered)),
                len(ordered),
                hits,
                track.get("name") or cache_key,
            )

    scanned = list(by_uri.values())
    _sort_playlists(scanned)
    cache[cache_key] = {"ts": time.time(), "playlists": scanned}
    return scanned


async def _rebuild_track_index(hass: HomeAssistant) -> None:
    """Build inverted index of track keys → playlist URIs (background)."""
    state = hass.data.setdefault(DOMAIN, {})
    if state.get("index_building"):
        return
    state["index_building"] = True
    started = time.time()
    try:
        playlists = await _list_playlists(hass)
        mass = await _get_mass(hass)
        mapping: dict[str, set[str]] = {}
        sem = asyncio.Semaphore(INDEX_BUILD_CONCURRENCY)

        async def _index_one(pl: dict[str, Any]) -> None:
            pid = pl.get("id")
            puri = pl.get("uri") or ""
            if not pid or not puri or not pl.get("can_add", True):
                return
            async with sem:
                async for track in _iter_playlist_tracks(
                    mass, str(pid), force_refresh=False
                ):
                    for key in _item_uris(track):
                        mapping.setdefault(key, set()).add(puri)

        await asyncio.gather(*[_index_one(pl) for pl in playlists])
        index = {
            "updated_at": time.time(),
            "full_rebuild_at": time.time(),
            "track_to_playlists": {k: sorted(v) for k, v in mapping.items()},
        }
        await _save_track_index(hass, index)
        _LOGGER.info(
            "LaunchPad track index rebuilt: %s keys across %s playlists in %.1fs",
            len(mapping),
            len(playlists),
            time.time() - started,
        )
    except Exception:  # noqa: BLE001
        _LOGGER.exception("LaunchPad track index rebuild failed")
    finally:
        state["index_building"] = False


def _schedule_index_rebuild(hass: HomeAssistant, *, force: bool = False) -> None:
    index = hass.data.setdefault(DOMAIN, {}).get("track_index") or {}
    if not force and _index_is_warm(index):
        return
    if hass.data[DOMAIN].get("index_building"):
        return
    hass.async_create_task(_rebuild_track_index(hass))


def _schedule_current_track_scan(
    hass: HomeAssistant,
    track: dict[str, Any],
    playlists: list[dict[str, Any]],
) -> None:
    """Background: scan which playlists contain this track, merge into index."""
    state = hass.data.setdefault(DOMAIN, {})
    key = track.get("uri") or ""
    scanning = state.setdefault("track_scans", set())
    if not key or key in scanning:
        return
    scanning.add(key)

    async def _run() -> None:
        try:
            scanned = await _scan_membership(hass, track, playlists)
            await _index_merge_scan(hass, track, scanned)
            _LOGGER.info(
                "LaunchPad membership scan for %s: %s playlists",
                track.get("name") or key,
                sum(1 for p in scanned if p.get("contains")),
            )
            # Once the urgent track is indexed, slowly build the full map.
            index = await _load_track_index(hass)
            if not _index_is_warm(index):
                _schedule_index_rebuild(hass, force=True)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("LaunchPad current-track membership scan failed")
        finally:
            scanning.discard(key)

    hass.async_create_task(_run())


def _find_playlist(playlists: list[dict[str, Any]], query: str) -> dict[str, Any] | None:
    needle = _norm_name(query)
    if not needle:
        return None
    exact = [p for p in playlists if _norm_name(p["name"]) == needle]
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        editable = [p for p in exact if p.get("can_add")]
        return editable[0] if editable else exact[0]
    starts = [p for p in playlists if _norm_name(p["name"]).startswith(needle)]
    if len(starts) == 1:
        return starts[0]
    contains = [p for p in playlists if needle in _norm_name(p["name"])]
    if not contains:
        return None
    contains.sort(key=lambda p: abs(len(_norm_name(p["name"])) - len(needle)))
    return contains[0]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up LaunchPad music playlist services."""
    hass.data.setdefault(DOMAIN, {})
    await _load_playlist_edits(hass)
    await _load_track_index(hass)
    # Defer heavy index rebuild — first picker / cold path schedules a light
    # per-track scan; full rebuild runs only when explicitly scheduled.

    async def handle_get_current_track(call: ServiceCall) -> dict[str, Any]:
        entity_id = call.data.get("entity_id") or DEFAULT_PLAYER
        track = await _get_current_track(hass, entity_id)
        return {"track": track}

    async def handle_list_playlists(call: ServiceCall) -> dict[str, Any]:
        playlists = await _list_playlists(hass)
        edits = await _load_playlist_edits(hass)
        _apply_last_edited(playlists, edits)
        _sort_playlists(playlists)
        return {"playlists": playlists, "count": len(playlists)}

    async def handle_playlist_picker(call: ServiceCall) -> dict[str, Any]:
        entity_id = call.data.get("entity_id") or DEFAULT_PLAYER
        check = call.data.get("check_membership", True)
        # Pull Spotify→MA playlist changes (no webhooks; this is a sync kick).
        _schedule_playlist_sync(hass)
        track = await _get_current_track(hass, entity_id)
        playlists = await _list_playlists(hass)
        edits = await _load_playlist_edits(hass)
        _apply_last_edited(playlists, edits)

        index = await _load_track_index(hass)
        # Always answer from the inverted index — never block the UI on a live scan.
        _apply_membership_from_index(playlists, track, index)
        warm = _index_is_warm(index)

        if check and not warm:
            # Cold: only scan this track in the background (keeps Core responsive).
            # Full inverted-index rebuild starts after that scan finishes.
            _schedule_current_track_scan(hass, track, playlists)
        elif check:
            _schedule_index_rebuild(hass)

        _sort_playlists(playlists)
        already = [p for p in playlists if p.get("contains")]
        return {
            "track": track,
            "playlists": playlists,
            "count": len(playlists),
            "already_on": already,
            "membership_source": "index",
            "membership_hits": len(already),
            "index_warm": warm,
            "sync_kicked": True,
        }

    async def handle_add_to_playlist(call: ServiceCall) -> dict[str, Any]:
        entity_id = call.data.get("entity_id") or DEFAULT_PLAYER
        # Playlist names like "2026" may arrive as ints from YAML/Assist.
        playlist_query = str(
            call.data.get("playlist") or call.data.get("playlist_name") or ""
        ).strip()
        playlist_uri = str(call.data.get("playlist_uri") or "").strip()
        track_uri = str(call.data.get("track_uri") or "").strip()

        if track_uri:
            track = {
                "uri": track_uri,
                "name": call.data.get("track_name") or "Track",
                "artist": call.data.get("track_artist") or "",
                "spotify_id": call.data.get("spotify_id"),
                "player": entity_id,
            }
        else:
            track = await _get_current_track(hass, entity_id)

        playlists = await _list_playlists(hass)
        target = None
        if playlist_uri:
            target = next((p for p in playlists if p["uri"] == playlist_uri), None)
            if target is None:
                pid = _playlist_id_from_uri(playlist_uri)
                if pid:
                    target = {
                        "name": call.data.get("playlist_name") or pid,
                        "uri": playlist_uri,
                        "id": pid,
                        "can_add": True,
                    }
        elif playlist_query:
            target = _find_playlist(playlists, playlist_query)
        else:
            raise ServiceValidationError("Provide playlist name or playlist_uri.")

        if not target or not target.get("id"):
            raise ServiceValidationError(
                f"Could not find a playlist matching '{playlist_query or playlist_uri}'."
            )
        if not target.get("can_add", True):
            raise ServiceValidationError(
                f"Playlist '{target['name']}' is not a writable playlist target."
            )

        mass = await _get_mass(hass)
        match_keys = _track_match_keys(track["uri"], track.get("spotify_id"))

        # Prefer instant index for already-check; fall back to live verify.
        index = await _load_track_index(hass)
        index_hit = False
        if _index_is_warm(index):
            temp = [dict(target)]
            _apply_membership_from_index(temp, track, index)
            index_hit = bool(temp[0].get("contains"))

        already = index_hit
        if not already:
            already = await _playlist_contains(
                mass, str(target["id"]), match_keys, force_refresh=False
            )

        if already:
            ts = await _touch_playlist(hass, target["uri"])
            await _index_add_track_to_playlist(hass, track, target["uri"])
            target = dict(target)
            target["last_edited"] = ts
            target["contains"] = True
            return {
                "status": "already",
                "message": (
                    f"{track.get('name') or 'This song'} is already on "
                    f"{target['name']}. We're all good."
                ),
                "track": track,
                "playlist": target,
                "added": False,
            }

        try:
            await mass.music.add_playlist_tracks(target["id"], [track["uri"]])
        except Exception as err:  # noqa: BLE001
            _LOGGER.exception("Failed adding track to playlist")
            raise HomeAssistantError(
                f"Could not add track to {target['name']}: {err}"
            ) from err

        cache = hass.data.get(DOMAIN, {}).get("membership_cache", {})
        cache.pop(track["uri"], None)

        ts = await _touch_playlist(hass, target["uri"])
        await _index_add_track_to_playlist(hass, track, target["uri"])
        target = dict(target)
        target["last_edited"] = ts
        target["contains"] = True

        return {
            "status": "added",
            "message": (
                f"Added {track.get('name') or 'the track'}"
                + (f" by {track['artist']}" if track.get("artist") else "")
                + f" to {target['name']}."
            ),
            "track": track,
            "playlist": target,
            "added": True,
        }

    async def handle_remove_from_playlist(call: ServiceCall) -> dict[str, Any]:
        entity_id = call.data.get("entity_id") or DEFAULT_PLAYER
        playlist_uri = str(call.data.get("playlist_uri") or "").strip()
        playlist_query = str(
            call.data.get("playlist") or call.data.get("playlist_name") or ""
        ).strip()
        track_uri = str(call.data.get("track_uri") or "").strip()

        if track_uri:
            track = {
                "uri": track_uri,
                "name": call.data.get("track_name") or "Track",
                "artist": call.data.get("track_artist") or "",
                "spotify_id": call.data.get("spotify_id"),
                "player": entity_id,
            }
        else:
            track = await _get_current_track(hass, entity_id)

        playlists = await _list_playlists(hass)
        target = None
        if playlist_uri:
            target = next((p for p in playlists if p["uri"] == playlist_uri), None)
            if target is None:
                pid = _playlist_id_from_uri(playlist_uri)
                if pid:
                    target = {
                        "name": call.data.get("playlist_name") or pid,
                        "uri": playlist_uri,
                        "id": pid,
                        "can_add": True,
                    }
        elif playlist_query:
            target = _find_playlist(playlists, playlist_query)
        else:
            raise ServiceValidationError("Provide playlist name or playlist_uri.")

        if not target or not target.get("id"):
            raise ServiceValidationError(
                f"Could not find a playlist matching '{playlist_query or playlist_uri}'."
            )
        if not target.get("can_add", True):
            raise ServiceValidationError(
                f"Playlist '{target['name']}' is not a writable playlist target."
            )

        mass = await _get_mass(hass)
        match_keys = _track_match_keys(track["uri"], track.get("spotify_id"))
        positions = await _track_positions_in_playlist(
            mass, str(target["id"]), match_keys, force_refresh=True
        )
        if not positions:
            await _index_remove_track_from_playlist(hass, track, target["uri"])
            ts = await _touch_playlist(hass, target["uri"])
            target = dict(target)
            target["last_edited"] = ts
            target["contains"] = False
            return {
                "status": "absent",
                "message": (
                    f"{track.get('name') or 'This song'} is not on {target['name']}."
                ),
                "track": track,
                "playlist": target,
                "removed": False,
            }

        try:
            await mass.music.remove_playlist_tracks(
                target["id"], tuple(sorted(set(positions)))
            )
        except Exception as err:  # noqa: BLE001
            _LOGGER.exception("Failed removing track from playlist")
            raise HomeAssistantError(
                f"Could not remove track from {target['name']}: {err}"
            ) from err

        cache = hass.data.get(DOMAIN, {}).get("membership_cache", {})
        cache.pop(track["uri"], None)
        await _index_remove_track_from_playlist(hass, track, target["uri"])
        ts = await _touch_playlist(hass, target["uri"])
        target = dict(target)
        target["last_edited"] = ts
        target["contains"] = False
        return {
            "status": "removed",
            "message": (
                f"Removed {track.get('name') or 'the track'} from {target['name']}."
            ),
            "track": track,
            "playlist": target,
            "removed": True,
        }

    async def handle_create_playlist(call: ServiceCall) -> dict[str, Any]:
        name = str(call.data.get("name") or call.data.get("playlist") or "").strip()
        if not name:
            raise ServiceValidationError("Provide a playlist name.")
        entity_id = call.data.get("entity_id") or DEFAULT_PLAYER
        add_current = bool(call.data.get("add_current", True))
        provider = str(call.data.get("provider") or "").strip() or None

        mass = await _get_mass(hass)
        if not provider:
            provider = _spotify_provider_ref(mass)

        playlist_obj = None
        last_err: Exception | None = None
        for prov in (provider, "spotify", "builtin", None):
            try:
                if prov:
                    playlist_obj = await mass.music.create_playlist(
                        name, provider_instance_or_domain=prov
                    )
                else:
                    playlist_obj = await mass.music.create_playlist(name)
                break
            except Exception as err:  # noqa: BLE001
                last_err = err
                _LOGGER.debug("create_playlist via %s failed: %s", prov, err)
                playlist_obj = None

        if playlist_obj is None:
            raise HomeAssistantError(
                f"Could not create playlist '{name}': {last_err}"
            )

        if isinstance(playlist_obj, dict):
            pl_name = playlist_obj.get("name") or name
            pl_uri = playlist_obj.get("uri") or ""
            pl_id = _playlist_id_from_uri(pl_uri) or str(
                playlist_obj.get("item_id") or playlist_obj.get("id") or ""
            )
            pl_image = playlist_obj.get("image")
        else:
            pl_name = getattr(playlist_obj, "name", None) or name
            pl_uri = str(getattr(playlist_obj, "uri", "") or "")
            pl_id = _playlist_id_from_uri(pl_uri) or str(
                getattr(playlist_obj, "item_id", "") or ""
            )
            pl_image = None

        target = {
            "name": pl_name,
            "uri": pl_uri,
            "id": pl_id,
            "image": pl_image,
            "can_add": True,
            "contains": False,
            "last_edited": 0.0,
        }
        ts = await _touch_playlist(hass, pl_uri) if pl_uri else time.time()
        target["last_edited"] = ts

        track = None
        added = False
        if add_current and pl_id:
            try:
                track = await _get_current_track(hass, entity_id)
                await mass.music.add_playlist_tracks(pl_id, [track["uri"]])
                await _index_add_track_to_playlist(hass, track, pl_uri)
                target["contains"] = True
                added = True
            except Exception as err:  # noqa: BLE001
                _LOGGER.warning("Created playlist but could not add current track: %s", err)

        return {
            "status": "created",
            "message": (
                f"Created playlist {pl_name}"
                + (f" and added {track.get('name')}" if added and track else "")
                + "."
            ),
            "playlist": target,
            "track": track,
            "added": added,
        }

    hass.services.async_register(
        DOMAIN,
        "get_current_track",
        handle_get_current_track,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        "list_playlists",
        handle_list_playlists,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        "playlist_picker",
        handle_playlist_picker,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        "add_to_playlist",
        handle_add_to_playlist,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN,
        "remove_from_playlist",
        handle_remove_from_playlist,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN,
        "create_playlist",
        handle_create_playlist,
        supports_response=SupportsResponse.OPTIONAL,
    )

    _LOGGER.info("LaunchPad music playlist services registered")
    return True
