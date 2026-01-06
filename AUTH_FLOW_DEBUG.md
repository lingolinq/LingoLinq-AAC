# Authentication Flow Debug Guide

## Authentication Flow Overview

### 1. Login Request
- **Endpoint**: `POST /token`
- **Route**: `post 'token' => 'session#token'`
- **Controller**: `app/controllers/session_controller.rb#token`
- **Parameters**:
  - `grant_type`: 'password'
  - `username`: user's username
  - `password`: user's password
  - `client_id`: 'browser'
  - `client_secret`: browser token (validated by `GoSecure.valid_browser_token?`)
  - `device_id`: optional device identifier

### 2. Token Generation
- Device is found or created: `Device.find_or_create_by(:user_id => u.id, :developer_key_id => 0, :device_key => device_key)`
- Token is generated via `device.tokens` which calls `device.generate_token!` if no keys exist
- Token format: `"#{device.global_id}~#{SHA512_hash}"`

### 3. Token Response
- **Method**: `JsonApi::Token.as_json(user, device)`
- **Returns**: Hash with:
  - `access_token`: The authentication token
  - `token_type`: 'bearer'
  - `user_name`: User's username
  - `user_id`: User's global ID
  - `modeling_session`: Boolean
  - `scopes`: Array of permission scopes
  - Other optional fields (2fa, long_token, etc.)

### 4. Response Rendering
- **Before Rails 7**: `render json: JsonApi::Token.as_json(u, d).to_json`
- **After Rails 7**: `render json: JsonApi::Token.as_json(u, d)` (Rails handles JSON encoding)

### 5. Frontend Token Storage
- Frontend should receive JSON response
- Extract `access_token` from response
- Store in IndexedDB/localStorage
- Include in subsequent API requests as:
  - Query parameter: `?access_token=...`
  - Or header: `Authorization: Bearer ...`

## What to Check in Browser Dev Tools

### Network Tab - Login Request
1. **Request**:
   - URL: `POST /token`
   - Headers: Check for `Content-Type: application/json` or `application/x-www-form-urlencoded`
   - Payload: Should include username, password, client_id, client_secret

2. **Response**:
   - Status: Should be `200 OK`
   - Content-Type: Should be `application/json; charset=utf-8`
   - Response Body: Should be valid JSON with `access_token` field
   - **IMPORTANT**: Check if response is double-encoded (would show as a string instead of an object)

### Network Tab - Token Check Request
1. **Request**:
   - URL: `GET /api/v1/token_check?access_token=...`
   - Check if `access_token` parameter is present and not "none"

2. **Response**:
   - Should return `{"authenticated": true, ...}` if token is valid
   - Should return `{"authenticated": false, ...}` if token is invalid/missing

### Application Tab - Storage
1. **IndexedDB**:
   - Check if token is stored in IndexedDB
   - Look for storage keys related to authentication

2. **LocalStorage/SessionStorage**:
   - Check if token is stored here (less common)

### Console Tab
- Look for JavaScript errors related to:
  - Token parsing
  - Storage operations
  - Authentication errors

## Known Issues Fixed

1. **Double JSON Encoding**: Fixed `render json: ...to_json` → `render json: ...`
   - Files fixed:
     - `app/controllers/session_controller.rb` (4 instances)
     - `app/controllers/application_controller.rb` (1 instance)
     - `app/controllers/api/search_controller.rb` (multiple instances)

2. **Parameter Access**: Added `params.permit!` early in request cycle
   - File: `app/controllers/application_controller.rb#check_api_token`

3. **Rails 7 Compatibility**: 
   - Added `config.action_controller.permit_all_parameters = true`
   - File: `config/initializers/permit_all_parameters.rb`

4. **Token Extraction from "none"**: Fixed backend to ignore `access_token=none` and check Authorization header
   - File: `app/controllers/application_controller.rb#check_api_token`
   - Now treats "none" as missing token and falls back to Authorization header

5. **Token Persistence Race Condition**: Fixed frontend to set `capabilities.access_token` immediately
   - Files fixed:
     - `app/frontend/app/utils/session.js`:
       - `persist()`: Sets `capabilities.access_token` immediately when token is persisted
       - `restore()`: Checks fallback data if storage doesn't have token yet
     - `app/frontend/app/components/login-form.js`:
       - `handle_auth()`: Sets `capabilities.access_token` immediately before persistence
       - `login_success()`: Verifies token is set and re-stores if needed

6. **Token Check Fallback**: Fixed `check_token()` to use fallback data when storage is empty
   - File: `app/frontend/app/utils/session.js#check_token`

7. **Premature Logout Prevention**: Fixed `app_state.js` to wait for token validation before logging out
   - File: `app/frontend/app/utils/app_state.js#find_user`
   - Only logs out if `tokenConfirmed === true` and `invalid_token === true`

8. **Explicit Store Service Injection**: Added explicit `@service store` injection to routes/controllers
   - Files fixed:
     - `app/frontend/app/routes/index.js`
     - `app/frontend/app/routes/user.js`
     - `app/frontend/app/controllers/index.js`
     - `app/frontend/app/controllers/user/index.js`

## Remaining Issues to Check

1. **Response Format**: Verify the actual response body format matches what frontend expects
2. **Content-Type**: Ensure `application/json` is set correctly
3. **Token Storage**: Verify frontend is storing token correctly after receiving it
4. **Token Retrieval**: Verify frontend is retrieving token correctly for subsequent requests

## Testing Steps

1. Open browser Dev Tools → Network tab
2. Attempt login
3. Check the `/token` POST request:
   - Status code
   - Response headers (especially Content-Type)
   - Response body (copy and validate JSON)
4. Check if token appears in subsequent requests
5. Check Application tab for stored token
6. Check Console for any errors


