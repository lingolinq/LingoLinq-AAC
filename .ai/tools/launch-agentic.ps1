# Claude with MCP/DeepWiki support
Start-Process -FilePath "powershell.exe" -ArgumentList '-NoExit','-Command','cd C:\Users\skawa\LingoLinq-AAC; claude' -WindowStyle Normal

# Gemini in standalone mode (native context window)
Start-Process -FilePath "powershell.exe" -ArgumentList '-NoExit','-Command','cd C:\Users\skawa\LingoLinq-AAC; gemini --all-files' -WindowStyle Normal
