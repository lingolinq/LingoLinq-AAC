# LingoLinq AAC API Documentation

## Overview

LingoLinq AAC provides a comprehensive RESTful API that powers web, mobile, and desktop AAC applications. The API is designed for Augmentative and Alternative Communication systems with robust offline support, multi-platform compatibility, and extensive accessibility features.

**Base URL**: `/api/v1/`  
**Format**: JSON API with custom serializers  
**Authentication**: Bearer token-based  
**Rate Limiting**: Throttling and monitoring enabled  

## Authentication

### Bearer Token Authentication
```http
Authorization: Bearer <access_token>
```

### Alternative Authentication Methods
```http
# Query parameter (fallback)
GET /api/v1/users?access_token=<token>

# Temporary tokens (for specific flows)
POST /api/v1/users?tmp_token=<temp_token>
```

### Required Headers
```http
Authorization: Bearer <token>
Content-Type: application/json
X-LingoLinq-Version: <app_version>
X-INSTALLED-LINGOLINQ: true  # For mobile/desktop apps
```

### Admin/Supervisor Headers
```http
X-As-User-Id: <user_id>     # Admin masquerading as user
X-Disable-Logs: true        # Disable logging for admin actions
```

## Response Format

### Standard Success Response
```json
{
  "user": {
    "id": "1234_5678",
    "user_name": "john_doe",
    "email": "john@example.com",
    "permissions": ["view", "edit", "delete"],
    "settings": {...},
    "created": "2023-01-15T10:30:00Z"
  },
  "meta": {
    "offset": 0,
    "limit": 25,
    "next_url": "/api/v1/users?offset=25",
    "total_objects": 150,
    "more": true
  }
}
```

### Error Response Format
```json
{
  "error": "Not authorized",
  "unauthorized": true,
  "invalid_token": true,
  "errors": ["Specific error message", "Another error"],
  "status": 401
}
```

## Core Endpoints

## Users API

### List/Search Users
```http
GET /api/v1/users
```

**Query Parameters:**
- `q` - Search query
- `supervisees` - Include supervisees
- `organization_id` - Filter by organization
- `offset`, `limit` - Pagination

**Response:**
```json
{
  "users": [
    {
      "id": "1234_5678",
      "user_name": "john_doe",
      "email": "john@example.com",
      "avatar_url": "https://...",
      "permissions": ["view", "edit"],
      "subscription": {...}
    }
  ],
  "meta": {...}
}
```

### Create User
```http
POST /api/v1/users
```

**Request Body:**
```json
{
  "user": {
    "user_name": "new_user",
    "email": "user@example.com",
    "password": "securepassword",
    "name": "Display Name",
    "preferences": {
      "home_board": {"id": "board_id"},
      "voice": {"voice_id": "voice_1"}
    }
  }
}
```

### Get User Details
```http
GET /api/v1/users/{user_id}
```

**Query Parameters:**
- `include` - Include related data (supervisors, supervisees, boards)
- `stats` - Include usage statistics

### Update User
```http
PUT /api/v1/users/{user_id}
```

**Request Body:**
```json
{
  "user": {
    "name": "Updated Name",
    "preferences": {...},
    "settings": {...}
  }
}
```

### User Statistics
```http
GET /api/v1/users/{user_id}/stats/daily
GET /api/v1/users/{user_id}/stats/hourly
```

**Query Parameters:**
- `start_date`, `end_date` - Date range
- `timezone` - User timezone

### User Supervision
```http
GET /api/v1/users/{user_id}/supervisors
GET /api/v1/users/{user_id}/supervisees
POST /api/v1/users/{user_id}/supervisors
DELETE /api/v1/users/{user_id}/supervisors/{supervisor_id}
```

### User Subscription
```http
POST /api/v1/users/{user_id}/subscription
DELETE /api/v1/users/{user_id}/subscription
```

## Boards API

### List/Search Boards
```http
GET /api/v1/boards
```

**Query Parameters:**
- `q` - Search query
- `public` - Public boards only
- `user_id` - Boards by specific user
- `starred` - User's starred boards
- `locale` - Filter by locale
- `category` - Filter by category

### Create Board
```http
POST /api/v1/boards
```

**Request Body:**
```json
{
  "board": {
    "name": "My New Board",
    "description": "Board description",
    "public": false,
    "grid": {
      "rows": 4,
      "columns": 6,
      "order": [["button1", "button2"], ["button3", null]]
    },
    "buttons": [
      {
        "id": "button1",
        "label": "Hello",
        "image_id": "image_123",
        "sound_id": "sound_456",
        "action": "speak"
      }
    ]
  }
}
```

### Get Board Details
```http
GET /api/v1/boards/{board_id}
```

**Query Parameters:**
- `include` - Include related data (images, sounds, stats)
- `locale` - Specific locale version

### Update Board
```http
PUT /api/v1/boards/{board_id}
```

### Delete Board
```http
DELETE /api/v1/boards/{board_id}
```

### Board Actions
```http
POST /api/v1/boards/{board_id}/stars        # Star/unstar board
DELETE /api/v1/boards/{board_id}/stars
GET /api/v1/boards/{board_id}/copies         # Get board copies
POST /api/v1/boards/{board_id}/download      # Generate download
POST /api/v1/boards/{board_id}/translate     # Translate board
GET /api/v1/boards/{board_id}/stats          # Usage statistics
```

### Export Board (OBF Format)
```http
GET /api/v1/boards/{board_id}/simple.obf
```

## Organizations API

### List Organizations
```http
GET /api/v1/organizations
```
*Admin only*

### Create Organization
```http
POST /api/v1/organizations
```
*Admin only*

**Request Body:**
```json
{
  "organization": {
    "name": "School District",
    "settings": {
      "licenses": 100,
      "allotted_licenses": 50
    }
  }
}
```

### Get Organization
```http
GET /api/v1/organizations/{org_id}
```

### Organization Users
```http
GET /api/v1/organizations/{org_id}/users
GET /api/v1/organizations/{org_id}/managers
GET /api/v1/organizations/{org_id}/supervisors
```

### Organization Statistics
```http
GET /api/v1/organizations/{org_id}/stats
GET /api/v1/organizations/{org_id}/admin_reports
```

### Set User Organization Status
```http
POST /api/v1/organizations/{org_id}/status/{user_id}
```

**Request Body:**
```json
{
  "user_status": {
    "role": "manager",
    "state": "approved"
  }
}
```

## Logs API

### Get User Logs
```http
GET /api/v1/logs
```

**Query Parameters:**
- `user_id` - Specific user's logs
- `start_date`, `end_date` - Date range
- `type` - Log type (session, note, assessment, etc.)
- `device_id` - Filter by device

### Create Log Entry
```http
POST /api/v1/logs
```

**Request Body:**
```json
{
  "log": {
    "type": "session",
    "events": [
      {
        "timestamp": 1642251600,
        "type": "button",
        "button": {...},
        "geo": {...}
      }
    ],
    "duration": 300,
    "started_at": "2023-01-15T10:00:00Z",
    "ended_at": "2023-01-15T10:05:00Z"
  }
}
```

### Get Specific Log
```http
GET /api/v1/logs/{log_id}
```

### Update Log
```http
PUT /api/v1/logs/{log_id}
```

### Import Logs
```http
POST /api/v1/logs/import
```

### Usage Trends
```http
GET /api/v1/logs/trends
GET /api/v1/logs/trends_slice
```

## Media APIs

### Images
```http
GET /api/v1/images                    # Search images
POST /api/v1/images                   # Upload image
GET /api/v1/images/{image_id}         # Get image details
PUT /api/v1/images/{image_id}         # Update image
DELETE /api/v1/images/{image_id}      # Delete image
```

### Sounds
```http
GET /api/v1/sounds                    # Search sounds
POST /api/v1/sounds                   # Upload sound
GET /api/v1/sounds/{sound_id}         # Get sound details
PUT /api/v1/sounds/{sound_id}         # Update sound
DELETE /api/v1/sounds/{sound_id}      # Delete sound
```

### Videos
```http
GET /api/v1/videos                    # List videos
POST /api/v1/videos                   # Upload video
GET /api/v1/videos/{video_id}         # Get video details
PUT /api/v1/videos/{video_id}         # Update video
DELETE /api/v1/videos/{video_id}      # Delete video
```

## Learning & Communication APIs

### Goals
```http
GET /api/v1/goals                     # List user goals
POST /api/v1/goals                    # Create goal
GET /api/v1/goals/{goal_id}           # Get goal details
PUT /api/v1/goals/{goal_id}           # Update goal
DELETE /api/v1/goals/{goal_id}        # Delete goal
```

### Lessons
```http
GET /api/v1/lessons                   # List lessons
POST /api/v1/lessons                  # Create lesson
GET /api/v1/lessons/{lesson_id}       # Get lesson
```

### Utterances
```http
GET /api/v1/utterances                # List utterances
POST /api/v1/utterances               # Create utterance
GET /api/v1/utterances/{utterance_id} # Get utterance
```

### Messages
```http
GET /api/v1/messages                  # List messages
POST /api/v1/messages                 # Send message
GET /api/v1/messages/{message_id}     # Get message
```

## Search APIs

### Symbol Search
```http
GET /api/v1/search/symbols
```

**Query Parameters:**
- `q` - Search query
- `locale` - Language locale
- `library` - Symbol library (opensymbols, lessonpix, etc.)
- `category` - Symbol category

### App Search
```http
GET /api/v1/search/apps
```

### Audio Search
```http
GET /api/v1/search/audio
```

## Integration APIs

### Webhooks
```http
GET /api/v1/webhooks                  # List webhooks
POST /api/v1/webhooks                 # Create webhook
GET /api/v1/webhooks/{webhook_id}     # Get webhook
PUT /api/v1/webhooks/{webhook_id}     # Update webhook
DELETE /api/v1/webhooks/{webhook_id}  # Delete webhook
POST /api/v1/webhooks/{webhook_id}/test # Test webhook
```

### External Integrations
```http
GET /api/v1/integrations              # List integrations
POST /api/v1/integrations             # Create integration
GET /api/v1/integrations/{integration_id} # Get integration
PUT /api/v1/integrations/{integration_id} # Update integration
DELETE /api/v1/integrations/{integration_id} # Delete integration
```

## Data Models

### User Model
```json
{
  "id": "1234_5678",
  "user_name": "unique_username",
  "email": "user@example.com",
  "name": "Display Name",
  "avatar_url": "https://...",
  "permissions": ["view", "edit", "delete", "supervise"],
  "settings": {
    "preferences": {...},
    "device": {...},
    "sidebar_boards": [...]
  },
  "subscription": {
    "active": true,
    "expires": "2024-12-31T23:59:59Z",
    "plan_id": "monthly_plus"
  },
  "organizations": [...],
  "created": "2023-01-15T10:30:00Z",
  "updated": "2023-01-20T14:45:00Z"
}
```

### Board Model
```json
{
  "id": "board_123_456",
  "key": "user/board-name",
  "name": "Board Name",
  "description": "Board description",
  "user_name": "owner_username",
  "public": false,
  "locale": "en",
  "grid": {
    "rows": 4,
    "columns": 6,
    "order": [["btn1", "btn2"], ["btn3", null]]
  },
  "buttons": [
    {
      "id": "btn1",
      "label": "Hello",
      "vocalization": "Hello there!",
      "image_id": "img_123",
      "sound_id": "snd_456",
      "background_color": "#ffffff",
      "border_color": "#000000",
      "action": "speak",
      "load_board": {...}
    }
  ],
  "categories": ["core", "communication"],
  "created": "2023-01-15T10:30:00Z",
  "updated": "2023-01-20T14:45:00Z"
}
```

### Organization Model
```json
{
  "id": "org_123",
  "name": "Organization Name",
  "settings": {
    "licenses": 100,
    "allotted_licenses": 75,
    "premium": true
  },
  "permissions": ["view", "edit", "manage_users"],
  "managers": [...],
  "users": [...],
  "created": "2023-01-15T10:30:00Z"
}
```

### Log Session Model
```json
{
  "id": "log_123_456",
  "type": "session",
  "user_id": "1234_5678",
  "device_id": "device_789",
  "started_at": "2023-01-15T10:00:00Z",
  "ended_at": "2023-01-15T10:05:00Z",
  "duration": 300,
  "events": [
    {
      "timestamp": 1642251600,
      "type": "button",
      "button": {...},
      "spoken": true,
      "geo": {...}
    }
  ],
  "stats": {
    "total_buttons": 25,
    "unique_buttons": 15,
    "words_per_minute": 8.5
  }
}
```

## Error Handling

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `422` - Unprocessable Entity
- `429` - Too Many Requests
- `500` - Internal Server Error

### Common Error Responses

#### Authentication Errors
```json
{
  "error": "Not authorized",
  "unauthorized": true,
  "invalid_token": true
}
```

#### Validation Errors
```json
{
  "error": "Invalid parameters",
  "errors": [
    "Name can't be blank",
    "Email must be valid"
  ]
}
```

#### Permission Errors
```json
{
  "error": "Not allowed",
  "errors": ["You don't have permission to access this resource"]
}
```

#### Rate Limiting
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 3600
}
```

## Rate Limits

- **General API**: 1000 requests/hour per user
- **Search endpoints**: 500 requests/hour per user
- **Upload endpoints**: 100 requests/hour per user
- **Bulk operations**: 50 requests/hour per user

## Pagination

All list endpoints support pagination:

**Query Parameters:**
- `offset` (default: 0)
- `limit` (default: 25, max: 50)

**Response includes:**
```json
{
  "meta": {
    "offset": 0,
    "limit": 25,
    "next_url": "/api/v1/users?offset=25",
    "more": true,
    "total_objects": 150
  }
}
```

## Offline Support

The API includes comprehensive offline support:

- **Application Cache**: `/application.manifest`
- **Progressive Web App**: Service worker enabled
- **Sync endpoints**: For offline data synchronization
- **Fallback responses**: Cached data when offline

## Multi-Platform Considerations

### Mobile Apps (Cordova)
- Use `X-INSTALLED-LINGOLINQ` header
- Support for app-specific features
- Offline synchronization

### Desktop Apps (Electron)
- Auto-update capabilities
- Local data storage
- Platform-specific integrations

### Web Applications
- Full feature parity
- Progressive Web App features
- Real-time updates via WebSockets

## Security Features

- **Two-Factor Authentication**: TOTP support
- **SAML SSO**: Enterprise authentication
- **IP Monitoring**: Geographic clustering
- **Valet Mode**: Restricted access mode
- **Audit Logging**: All actions logged
- **Permission Scoping**: Fine-grained access control

## Internationalization

- **Multi-locale boards**: Support for multiple languages
- **Symbol libraries**: Language-specific symbols
- **RTL support**: Right-to-left languages
- **Translation management**: Board translation tools

## WebSocket Integration

Real-time features via WebSocket connection:

- **Live collaboration**: Multiple users on same board
- **Status updates**: User online/offline status
- **Push notifications**: Real-time alerts
- **Sync events**: Data synchronization

Connect to: `wss://ws.lingolinq.com/cable`

## SDK and Libraries

### JavaScript SDK
```javascript
// Example usage
const api = new LingoLinqAPI({
  baseURL: 'https://api.lingolinq.com/api/v1',
  token: 'your_bearer_token'
});

const user = await api.users.get('1234_5678');
const boards = await api.boards.list({ public: true });
```

### Mobile SDKs
- iOS SDK available
- Android SDK available
- React Native support

## Rate Limiting & Monitoring

The API implements comprehensive monitoring:

- **Request throttling**: Per-user and global limits
- **Error tracking**: Automatic error reporting
- **Performance monitoring**: Response time tracking
- **Usage analytics**: API endpoint usage statistics

For production use, consider implementing:
- Request caching
- Retry logic with exponential backoff
- Error handling for all endpoints
- Proper token management and refresh