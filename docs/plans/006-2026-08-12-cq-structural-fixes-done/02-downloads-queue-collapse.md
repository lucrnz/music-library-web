# Stage 02: Collapse downloads queue into queue.js

## Status
done

## Description

Hard-cutover merge of the queue micro-graph into a single **`queue.js`**.

**Merge into `queue.js` (delete old files in the same stage — no long-lived shims):**

- `queueEvents.js`
- `queueRuntime.js`
- `queueTransitions.js`
- `queueProgress.js`
- `queueStore.js`
- current barrel `queue.js` (replace in place)

**Keep separate:**

- `queuePolicy.js` — pause / network / health policy
- `worker.js` — pump + job execution

Preserve behavior: states, live progress, abort controllers, change buses, enqueue/retry, partial discard. Enqueue wrappers that need `getUserPaused` keep the existing policy→queue direction (no new cycles).

## Rationale

Queue was split across micro-files plus a pure re-export barrel without deleting concepts. One cohesive `queue.js` is the ownership unit; policy and worker remain real boundaries.

## Implementation

1. Inventory exports and importers (`worker.js`, `queuePolicy.js`, `index.js`, others).
2. Build merged `queue.js` with clear section order: transitions/state constants → runtime/abort → progress → IDB store → events → public enqueue/retry.
3. Update all imports; delete the five micro-files (hard cutover).
4. Exercise: enqueue, pause/resume all, cancel, retry, network auto-pause, clear finished, disable-with-wipe mid-queue.
