# Frontend API Contract

The browser keeps image pixels, project state, `BlockGrid` editing, material counts, and file encoding local. The backend only needs to report model readiness and return a validated `StructurePlan`; the browser's existing engine converts that plan to a preview and writes Litematic/Schematic files.

## 1. Model readiness

`GET /api/ai/status`

```json
{
  "ok": true,
  "text": true,
  "vision": false,
  "textModel": "text-model-name",
  "visionModel": null
}
```

Return booleans by capability and safe model identifiers only. Never return endpoint credentials, API keys, or provider headers. The frontend uses `text` for prompt-only requests and requires `vision` whenever an image is attached.

## 2. Plan a structure

`POST /api/ai/structure-plan`

Content type: `application/json`. The frontend resizes a reference to at most 512 pixels on its longest edge and sends JPEG data URL to keep the request bounded.

```json
{
  "prompt": "A compact stone observatory with a copper roof",
  "seed": 42,
  "constraints": {
    "type": "tower",
    "style": "fantasy",
    "floors": 3,
    "width": 24,
    "length": 20
  },
  "referenceImage": {
    "width": 512,
    "height": 384,
    "dataUrl": "data:image/jpeg;base64,...",
    "sourceName": "observatory.jpg"
  }
}
```

`prompt` may be empty only when a valid reference image is included. `referenceImage` is optional. Validate dimensions, MIME type, encoded size, and prompt length before calling the model. The client can abort the HTTP request when the user cancels generation; propagate disconnect/abort to the upstream provider.

Success: `200`

```json
{
  "ok": true,
  "plan": {
    "version": 1,
    "name": "Stone Observatory",
    "type": "tower",
    "style": "fantasy",
    "dimensions": { "width": 24, "height": 18, "length": 20 },
    "floors": 3,
    "rooms": [],
    "regions": [
      { "name": "main", "role": "main structure", "x": 0, "y": 0, "z": 0, "width": 24, "height": 14, "length": 20 },
      { "name": "roof", "role": "roof", "x": 0, "y": 14, "z": 0, "width": 24, "height": 4, "length": 20 }
    ],
    "components": [],
    "palette": {
      "wall": "minecraft:stone_bricks",
      "floor": "minecraft:polished_andesite",
      "roof": "minecraft:copper_block",
      "window": "minecraft:glass_pane"
    },
    "seed": 42,
    "notes": []
  }
}
```

`plan` must satisfy `StructurePlan` version 1 and the schema in `packages/ai-planner/src/vision.ts`. The browser validates it again before creating blocks. Keep all region coordinates within `dimensions`.

## 3. Error shape

All errors use one safe shape; messages are user-visible and must not contain prompts, image data, provider response bodies, or secrets.

```json
{
  "ok": false,
  "error": {
    "code": "MODEL_NOT_CONFIGURED",
    "message": "The vision model is not configured."
  }
}
```

Expected status/code pairs: `400 INVALID_REQUEST`, `413 IMAGE_TOO_LARGE`, `422 INVALID_STRUCTURE_PLAN`, `429 RATE_LIMITED`, `502 MODEL_REQUEST_FAILED`, and `503 MODEL_NOT_CONFIGURED`. Keep the request open only while planning; a disconnected client must not leave expensive model work running.

## Not backend endpoints

No export, materials, project-save, or BlockGrid endpoints are required for this frontend. The existing browser engine creates the preview, summarizes materials, stores/restores projects locally, and serializes Litematic/Schematic files. Keep API keys exclusively in server environment configuration.
