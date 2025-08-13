# Claude with MCP/DeepWiki support
Start-Process -FilePath "powershell.exe" -ArgumentList '-NoExit','-Command','cd C:\Users\skawa\LingoLinq-AAC; claude' -WindowStyle Normal

# Gemini in standalone mode (no MCP coordination)
Start-Process -FilePath "powershell.exe" -ArgumentList '-NoExit','-Command','cd C:\Users\skawa\LingoLinq-AAC; ./bin/devin-gemini simple' -WindowStyle Normal
