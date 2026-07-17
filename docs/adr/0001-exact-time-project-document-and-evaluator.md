# ADR 0001: Exact-Time Project Document and Evaluator

## Status

Accepted

## Context

The editor needs one durable source of editorial truth that can be consumed by
the browser UI, persistence, preview, and export without retaining React,
decoder, media-library, cache, or session state. Floating-point timeline values
would make trim boundaries and later variable-frame-rate support drift between
those consumers.

## Decision

The editor core owns a versioned plain-JSON project document. Version 1 has one
1080x1920 Rec.709, 30 fps project preset, video then audio tracks, typed clips,
and optional linked video/audio pairs. Document
arrays have canonical ordering: assets and link groups by ID, tracks in
bottom-to-top video/audio order, and clips by timeline start then ID.

All timeline and source times are normalized safe-integer rational values with
positive denominators. The core centralizes arithmetic, comparison,
microsecond conversion, and non-drop-frame 30 fps timecode. Documents reject
negative placement, source ranges outside their stream, clip durations shorter
than one output frame, same-track overlap, and invalid linked-pair timing.

`evaluateProject(project, timelineTime)` is the renderer-neutral boundary for
preview and export. It returns black as the background plus ordered active
visual layers and audio segments with exact resolved source times. Empty layer
and segment lists represent visual and audio gaps. Evaluation does no I/O,
decoding, canvas work, or framework access.

Domain failures use stable error codes with structured context. The application
message boundary maps those codes to user messages and must not branch on
exception text.

## Consequences

Preview and export share timeline semantics. Persistence can store the document
as canonical JSON without serializing runtime objects. Later clip types and
project schema versions must extend this core through explicit validation and
evaluator behavior rather than introducing another editorial state path.
