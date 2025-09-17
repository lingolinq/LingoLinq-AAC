# Feature Location Protocol for the LingoLinq-AAC Project

This document outlines the strict, efficient protocol to be followed when locating features, code, or functionality within this Rails application. The primary goal is to minimize token usage by avoiding broad, unnecessary file reading and searching. This protocol overrides any default, general-purpose code-browsing strategies.

## The Protocol

When asked to locate a feature, answer a question about implementation, or find a piece of code, the following steps must be executed in order. Do not skip steps.

### Step 1: Analyze `config/routes.rb`

For any feature that might be exposed via a URL, the first step is **always** to read and analyze `config/routes.rb`. This file is the primary source of truth for mapping URLs and user actions to specific controllers. This step should be used to identify the exact controller and action method responsible for the feature in question.

### Step 2: Use Rails Naming Conventions with `glob`

Once a controller or model is identified, use its name to find the relevant file paths using the `glob` tool. Do not use a broad `search_file_content` at this stage.

*   **Example:** If `routes.rb` points to `Api::V1::UsersController#create`, the next immediate actions should be:
    *   `glob` for `app/controllers/api/v1/users_controller.rb`
    *   `glob` for `app/models/user.rb`
    *   `glob` for `app/views/users/*` (if applicable)

### Step 3: Read and Analyze Targeted Files

After using `glob` to identify a small, precise set of candidate files (typically 1-3 files), use `read_file` to read their contents and understand the logic.

### Step 4: Controlled `search_file_content`

If the initial files do not fully explain the feature, use `search_file_content` in a tightly controlled manner. The search should be restricted to the most relevant directories.

*   **Example:** To find where the `current_user` method is used, search only within the `app/controllers/` directory first: `search_file_content --pattern "current_user" --include "app/controllers/**/*.rb"`

### Step 5: Escalate with User Permission

If the above steps fail to locate the feature, **stop**. Do not proceed with a full-codebase search. Inform the user that the targeted search was unsuccessful and that the next step would be a comprehensive search of the entire codebase, which may consume a significant number of tokens. Ask for explicit permission before proceeding with a command like `search_file_content --pattern "feature_name"`.
