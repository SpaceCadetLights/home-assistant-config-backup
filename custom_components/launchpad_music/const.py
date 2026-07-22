"""Constants for LaunchPad Music Playlists."""

DOMAIN = "launchpad_music"

# Music Assistant config entry for this home.
MASS_ENTRY_ID = "01K50H4V9P53VZ36HSWHBZ13WP"

DEFAULT_PLAYER = "media_player.full_studio"

# Builtin / synthetic playlists that are not useful "save to" targets.
SKIP_ADD_NAMES = {
    "all favorited tracks",
    "500 random tracks (from library)",
}

INDEX_MAX_AGE_SECONDS = 6 * 60 * 60  # rebuild at most every 6h in background
INDEX_BUILD_CONCURRENCY = 4
MEMBERSHIP_CACHE_SECONDS = 120
MEMBERSHIP_CONCURRENCY = 8
