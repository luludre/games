# Assets

## lion-roar.ogg

A recording of a lion roaring in captivity (zoo, Tamil Nadu).

- Source: [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Lion_raring-sound1TamilNadu178.ogg)
- Uploaded by: தகவலுழவன் (Info-farmer)
- License: released into the **public domain** by the uploader — no attribution required
- Used in-game trimmed to the first ~2.2 seconds, with a short fade-out

## firework-burst.ogg

A field recording of New Year's fireworks heard from a distance in the Belgian countryside (2009).

- Source: [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Fireworks_in_distance_3.ogg), originally from [pdsounds.org](http://www.pdsounds.org/sounds/fireworks_in_distance_3)
- Author: ezwa
- License: released into the **public domain** by the author — no attribution required
- The full 46s recording is kept as-is; in-game playback starts ~22.75s in for about 1.5 seconds (the loudest, cleanest single burst in the file, found by scanning it for peak energy) with a short fade-in/out, rather than shipping a separately re-encoded clip

## icon-512.png

A 512x512 blocky pixel-art scout emblem — a gold fleur-de-lis and banner on a blue circular badge with a gold rim — on a transparent background, used as the game's favicon and bookmark/home-screen icon.

- Source: supplied directly by Andre for this game, downscaled from a 2048x2048 original.

## pledge-of-allegiance.m4a

A recitation of the Pledge of Allegiance, provided directly by Andre's family for this game.

- Source: supplied as a WAV/AIFF recording, converted to AAC (`.m4a`) for browser compatibility with `afconvert` (no re-encoding of the actual audio, just a container/codec change).
- Played in full (not trimmed) when the player left-clicks the giant flag at the cooking area.

## scout-oath.m4a

A recitation of the Scout Oath, provided directly by Andre's family for this game.

- Source: supplied as a WAV/AIFF recording, converted to AAC (`.m4a`) with `afconvert`, same as the Pledge above.
- Played in full (~14s) when the player right-clicks the 4-tall Scout Totem at the cooking area.

## outdoor-code.m4a

A recitation of the Outdoor Code, provided directly by Andre's family for this game.

- Source: supplied as a WAV/AIFF recording, converted to AAC (`.m4a`) with `afconvert`, same as the two clips above.
- Played in full (~11.5s) when the player right-clicks the 3-tall Scout Totem at the cooking area.

## eagle-scout-emblem.png

A 512x517 pixel-art Eagle Scout crest — eagle, "BE PREPARED" banner, and an "EAGLE SCOUT" ribbon — on a transparent background, used as the actual Eagle Scout rank badge everywhere `drawRankBadge` draws one (shirt patch, floating name tag, achievement share card), in place of the procedural medallion every rank below it gets.

- Source: an AI-generated (Gemini) image supplied directly by Andre for this game; background removed and cropped to the crest.

Everything else in the game (textures, other sound effects) is generated procedurally at runtime — these are the only seven real asset files.
