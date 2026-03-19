# LingoLinq-AAC API Documentation

## Overview

LingoLinq-AAC provides a REST API following Rails conventions with JSON API serialization. All endpoints are prefixed with `/api/v1/` and use OAuth2-style bearer token authentication (README.md:52-54).

## Authentication Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/token` | POST | OAuth2 token exchange for authentication (routes.rb:48-52) |
| `/oauth2/token` | POST | OAuth2 token endpoint (routes.rb:48-52) |
| `/oauth2/token/login` | POST | OAuth2 login endpoint (routes.rb:48-52) |
| `/oauth2/token/status` | GET | Check token status (routes.rb:53) |
| `/oauth2/token` | DELETE | Logout/revoke token (routes.rb:52) |
| `/api/v1/auth/admin` | POST | Admin authentication (routes.rb:51) |
| `/saml/init` | GET | SAML authentication start (routes.rb:55-60) |
| `/saml/consume` | POST | SAML response handler (routes.rb:55-60) |

## Board Management Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/boards/:id` | GET | Retrieve board details |
| `/api/v1/boards/:id` | PUT | Update board |
| `/api/v1/boards/:id` | POST | Create new board |
| `/api/v1/boards/:id` | DELETE | Delete board |
| `/api/v1/boards/:id/download` | GET | Download board with full button set |
| `/api/v1/boards/:id/copy` | POST | Copy board with options |

## User Management Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/users/:id` | GET | Retrieve user profile |
| `/api/v1/users/:id` | PUT | Update user profile |
| `/api/v1/users/:id` | POST | Create user |
| `/api/v1/users/:id/supervisors` | GET | Get supervisor relationships |
| `/api/v1/users/:id/sync_stamp` | GET | Get user sync timestamp |

## Search Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/search/symbols` | GET | Search for symbols/images (search_controller.rb:31-52) |
| `/api/v1/search/protected_symbols` | GET | Search protected symbol libraries (search_controller.rb:54-93) |
| `/api/v1/search/external_resources` | GET | Search external resources (search_controller.rb:95-104) |
| `/api/v1/search/focuses` | GET | Search focus words (search_controller.rb:106-110) |
| `/api/v1/search/parts_of_speech` | GET | Get word parts of speech (search_controller.rb:112-132) |
| `/api/v1/search/proxy` | GET | Proxy external URLs (search_controller.rb:134-165) |
| `/api/v1/search/apps` | GET | Search apps (search_controller.rb:167-170) |
| `/api/v1/search/audio` | GET | Generate audio (search_controller.rb:172-180) |

## Word Data Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/words` | GET | List word data (admin only) (words_controller.rb:4-13) |
| `/api/v1/words/lang` | GET | Get language rules (words_controller.rb:15-32) |
| `/api/v1/words/reachable_core` | GET | Get reachable core words (words_controller.rb:34-49) |
| `/api/v1/words/:id` | PUT | Update word data (admin only) (words_controller.rb:51-60) |

## Button Set Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/button_sets/:id` | GET | Retrieve button set |
| `/api/v1/button_sets/:id` | PUT | Update button set |

## Logging Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/logs` | POST | Create log session |
| `/api/v1/logs` | GET | List log sessions |

## Organization Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/organizations/:id` | GET | Get organization details |
| `/api/v1/organizations/:id` | PUT | Update organization |
| `/api/v1/organizations/:id/users` | GET | List organization users |

## Authentication

All API requests require authentication via bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### Additional Headers

- `X-Device-Id`: Device identifier
- `X-INSTALLED-COUGHDROP`: Indicates mobile/desktop app
- `X-LingoLinq-Version`: App version

## Response Format

API responses follow JSON API format:

```json
{
  "board": {
    "id": "123",
    "key": "user/board-name",
    "name": "My Board",
    "buttons": [...],
    "grid": {"rows": 3, "columns": 4, "order": [[...]]}
  },
  "image": [...],
  "sound": [...],
  "meta": {"fakeXHR": {...}}
}
```

## Special Parameters

### User ID Parameter: `self`

When a parameter named `id` or ending in `_id` (e.g., `user_id`, `board_id`) is set to the string `"self"`, the API automatically replaces it with the current authenticated user's `global_id` before processing the request.

This happens in `ApplicationController.replace_helper_params` (application_controller.rb:118-128).

**Examples:**
- `GET /api/v1/users/self` → Resolved to current user's ID
- `GET /api/v1/boards?user_id=self` → Resolved to current user's ID
- `GET /api/v1/users/self/sync_stamp` → Resolved to current user's ID

## Notes

The API is currently undocumented as noted in the README, but this documentation covers all endpoints identified from the routes and controllers. The system uses a custom JSON API serializer located in `lib/json_api/` rather than standard Rails JSON generators (CODE_INVESTIGATION.md:177-179). The frontend communicates with these endpoints through the `persistence.js` utility which handles offline queuing and synchronization.

### Additional Resources

- [LingoLinq AAC Overview](https://github.com/lingolinq/LingoLinq-AAC/wiki)
