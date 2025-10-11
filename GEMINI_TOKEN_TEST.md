# Gemini Token Usage Test

Run this command to test what Gemini is loading:

```bash
gemini "List all files you can see in your context right now, showing their estimated line counts or sizes. Do not read any files - just list what's visible to you automatically."
```

This will reveal if Gemini is auto-loading massive context that we can't see.

## Expected Output
Should only see:
- GEMINI.md (~95 lines)
- GEMINI_START_HERE.md (~60 lines)
- Maybe CLAUDE.md (~200 lines)

## Red Flags
If Gemini mentions seeing:
- DEBUGGING_LOG.md (should be in .geminiignore)
- COMPLETE_DEPLOYMENT_DIAGNOSTICS_OCT6.md (should be in .geminiignore)
- Vendor directories (should be in .geminiignore)
- Log files (should be in .geminiignore)

Then `.geminiignore` is not being respected or Gemini CLI has different behavior than expected.

## Token Counting Test

After getting the file list, run:
```bash
gemini "Count the total number of tokens in your current context window and tell me the breakdown by file."
```

This will show us exactly where tokens are going.
