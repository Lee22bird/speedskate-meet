# Hardware Foundation

This directory is reserved for future timing hardware integrations.

Potential adapters:

- Photo Finish
- GoPro Timing
- Speed Gates
- Timing Sensors
- External Timing Systems

Conceptual adapter architecture:

```text
Hardware Adapter
  -> connects to device or import source
  -> normalizes timing events
  -> validates event shape
  -> writes candidate times into SSM race-day state
  -> keeps raw device payloads for audit/debugging
```

Common adapter contract, concept only:

```js
{
  name: 'adapter-name',
  connect: async () => {},
  disconnect: async () => {},
  status: async () => ({ connected: false }),
  onTimingEvent: callback => {},
}
```

Future safety rules:

- Manual time entry remains available.
- Hardware-provided times should be reviewable before becoming official.
- Raw timing payloads should be auditable.
- Adapters should not know about SSL identity or licensing internals.
- No hardware integration is implemented by this foundation.
