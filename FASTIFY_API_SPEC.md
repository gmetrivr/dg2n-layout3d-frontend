# Fastify Backend API Specification

This document describes the expected request/response formats for all API endpoints routed through the Fastify backend server.

---

## Configuration Endpoints

### 1. Get Tolerance Defaults
**Endpoint:** `GET /config/tolerances/{pipeline_version}`

**Request:**
- Path Parameter: `pipeline_version` (string, e.g., "01", "02")

**Expected Response:**
```json
{
  "pipeline_version": "02",
  "default_tolerances": {
    "tolerance_key_1": 0.5,
    "tolerance_key_2": 1.0
  }
}
```

---

## Brand Endpoints

### 2. Get Brands
**Endpoint:** `GET /api/brands?pipeline_version={version}`

**Request:**
- Query Parameter: `pipeline_version` (string, default: "02")

**Expected Response:**
```json
{
  "brands": ["brand1", "brand2", "brand3"],
  "categories": {
    "brands": {
      "private_label": {
        "prefix": "PVL",
        "description": "Private Label",
        "items": ["PVL-brand1", "PVL-brand2"]
      },
      "external": {
        "prefix": "EXT",
        "description": "External Brands",
        "items": ["EXT-brand1", "EXT-brand2"]
      }
    },
    "areas": {
      "general": {
        "prefix": "GEN",
        "description": "General Areas",
        "items": ["GEN-area1"]
      },
      "architectural": {
        "prefix": "ARX",
        "description": "Architectural Areas",
        "items": ["ARX-area1"]
      },
      "other": {
        "prefix": "OTH",
        "description": "Other Areas",
        "items": ["OTH-area1"]
      }
    },
    "aliases": {
      "old_name": "new_name"
    },
    "summary": {
      "total_private_labels": 10,
      "total_external_brands": 5,
      "total_general_areas": 3,
      "total_architectural_areas": 2,
      "total_other_areas": 1
    }
  }
}
```

### 3. Get Brand Migrations
**Endpoint:** `GET /api/brands/migrations?pipeline_version={version}`

**Request:**
- Query Parameter: `pipeline_version` (string, default: "02")

**Expected Response:**
```json
{
  "pipeline_version": "02",
  "migrations": {
    "old_brand_name": "new_brand_name",
    "old_brand_2": "new_brand_2"
  },
  "total_migrations": 2
}
```

### 4. Migrate Brand Names
**Endpoint:** `POST /api/brands/migrate`

**Request:**
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "brand_names": ["brand_name_1", "brand_name_2", "old_brand_name"],
  "pipeline_version": "02"
}
```

**Expected Response:**
```json
{
  "pipeline_version": "02",
  "migrations": [
    {
      "old_name": "brand_name_1",
      "new_name": "brand_name_1",
      "changed": false
    },
    {
      "old_name": "old_brand_name",
      "new_name": "new_brand_name",
      "changed": true
    }
  ],
  "total_changed": 1
}
```

### 5. Get Brand Category Mapping
**Endpoint:** `GET /api/brands/category-mapping?pipeline_version={version}`

**Request:**
- Query Parameter: `pipeline_version` (string, default: "02")

**Expected Response:**
```json
{
  "brand_category_mapping": {
    "brand1": "private_label",
    "brand2": "external",
    "area1": "general"
  },
  "categories_grouped": {
    "private_label": ["brand1", "brand2"],
    "external": ["brand3"],
    "general": ["area1"]
  },
  "unique_categories": ["private_label", "external", "general"],
  "total_brands": 10,
  "total_categories": 3
}
```

---

## Fixture Endpoints

### 6. Get Fixture Blocks (Bulk)
**Endpoint:** `POST /api/fixtures/blocks?pipeline_version={version}`

**Request:**
- Query Parameter: `pipeline_version` (string, default: "02")
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "block_names": ["RTL-SR", "RTL-4W", "RTL-WPS-M-6Bays"]
}
```

**Expected Response:**
```json
[
  {
    "block_name": "RTL-SR",
    "fixture_type": "A-RAIL",
    "glb_url": "https://s.vrgmetri.com/gb-dtwin/fynd/fixtures/models/RTL-SR-A2.glb"
  },
  {
    "block_name": "RTL-4W",
    "fixture_type": "4-WAY",
    "glb_url": "https://s.vrgmetri.com/gb-dtwin/fynd/fixtures/models/RTL-4W.glb"
  }
]
```

### 7. Get All Fixture Types
**Endpoint:** `GET /api/fixtures/types?pipeline_version={version}`

**Request:**
- Query Parameter: `pipeline_version` (string, default: "02")

**Expected Response:**
```json
{
  "fixture_types": ["4-WAY", "A-RAIL", "WALL-BAY", "MANNEQUIN", "STAIRCASE"]
}
```

### 8. Get Fixture Type URL
**Endpoint:** `GET /api/fixtures/type/{fixture_type}/url?pipeline_version={version}`

**Request:**
- Path Parameter: `fixture_type` (string, URL-encoded)
- Query Parameter: `pipeline_version` (string, default: "02")

**Expected Response:**
```json
{
  "fixture_type": "4-WAY",
  "glb_url": "https://s.vrgmetri.com/gb-dtwin/fynd/fixtures/models/RTL-4W.glb"
}
```

### 9. Get Block Name for Fixture Type (Reverse Lookup)
**Endpoint:** `GET /api/fixtures/type/{fixture_type}/block-name?pipeline_version={version}`

**Request:**
- Path Parameter: `fixture_type` (string, URL-encoded)
- Query Parameter: `pipeline_version` (string, default: "02")

**Expected Response:**
```json
{
  "fixture_type": "4-WAY",
  "block_name": "RTL-4W",
  "all_block_names": ["RTL-4W", "RTL-4W-V2"]
}
```

**Note:** If not found, return `404` status code

### 10. Get Direct Render Fixture Types
**Endpoint:** `GET /api/fixtures/direct-render-types?pipeline_version={version}`

**Request:**
- Query Parameter: `pipeline_version` (string, default: "02")

**Expected Response:**
```json
{
  "pipeline_version": "02",
  "direct_render_fixture_types": ["MANNEQUIN", "PLANT", "SIGNAGE"],
  "count": 3
}
```

### 11. Get Fixture Types with Variants
**Endpoint:** `GET /api/fixtures/variants?pipeline_version={version}`

**Request:**
- Query Parameter: `pipeline_version` (string, default: "02")

**Expected Response:**
```json
{
  "pipeline_version": "02",
  "fixture_types_with_variants": ["STAIRCASE", "WINDOW", "PODIUM"],
  "count": 3
}
```

### 12. Get Variants for Specific Fixture Type
**Endpoint:** `GET /api/fixtures/type/{fixture_type}/variants?pipeline_version={version}`

**Request:**
- Path Parameter: `fixture_type` (string, URL-encoded)
- Query Parameter: `pipeline_version` (string, default: "02")

**Expected Response:**
```json
{
  "fixture_type": "STAIRCASE",
  "variants": [
    {
      "id": "stair_straight",
      "name": "Straight Staircase",
      "description": "A straight staircase design",
      "url": "https://s.vrgmetri.com/gb-dtwin/fynd/fixtures/models/stair_straight.glb",
      "thumbnail": "https://s.vrgmetri.com/gb-dtwin/fynd/fixtures/thumbnails/stair_straight.png"
    },
    {
      "id": "stair_spiral",
      "name": "Spiral Staircase",
      "description": "A spiral staircase design",
      "url": "https://s.vrgmetri.com/gb-dtwin/fynd/fixtures/models/stair_spiral.glb",
      "thumbnail": "https://s.vrgmetri.com/gb-dtwin/fynd/fixtures/thumbnails/stair_spiral.png"
    }
  ],
  "count": 2
}
```

### 13. Get Block Type Mapping
**Endpoint:** `GET /api/fixtures/block-types?pipeline_version={version}`

**Request:**
- Query Parameter: `pipeline_version` (string, default: "02")

**Expected Response:**
```json
{
  "block_fixture_types": {
    "RTL-4W": "4-WAY",
    "RTL-SR": "A-RAIL",
    "RTL-WPS-M-6Bays": "WALL-BAY"
  }
}
```

**Alternative Format (also supported):**
```json
[
  {
    "blockName": "RTL-4W",
    "fixtureType": "4-WAY"
  },
  {
    "block_name": "RTL-SR",
    "fixture_type": "A-RAIL"
  }
]
```

---

## Summary of Changes Needed

To match the frontend expectations, update your Fastify backend responses:

1. **Remove the wrapper format** - Don't wrap responses in `{ status: {...}, data: {...} }`
2. **Return data directly** - The frontend expects the data at the top level
3. **Use exact field names** - Match the field names shown above (e.g., `fixture_types`, `brands`, `glb_url`)
4. **Handle pipeline_version** - All endpoints should accept `pipeline_version` as a query parameter
5. **POST /api/fixtures/blocks** - Accept `{ block_names: [...] }` and return an array directly

---

## Error Handling

For all endpoints, if there's an error:
- Return appropriate HTTP status codes (400, 404, 500)
- Error response format (this can keep your current format):
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Error description here"
}
```
