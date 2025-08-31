#!/usr/bin/env bash

# Gemini token usage monitoring and optimization helper
# Usage: ./monitor-gemini.sh [status|analyze|reset|help]

REPO_PATH="$(git rev-parse --show-toplevel)"
TOKEN_LOG="$REPO_PATH/.ai/logs/gemini-token-usage.log"
ANALYSIS_LOG="$REPO_PATH/.ai/logs/gemini-analysis.log"

case "$1" in
    status)
        echo "📊 Gemini Usage Analysis"
        echo "========================"
        
        if [[ ! -f "$TOKEN_LOG" ]]; then
            echo "No usage data found."
            exit 0
        fi
        
        echo "📈 Recent Activity (last 10 entries):"
        tail -10 "$TOKEN_LOG"
        echo ""
        
        echo "📊 Usage Statistics:"
        today=$(date +%Y-%m-%d)
        today_count=$(grep "$today" "$TOKEN_LOG" 2>/dev/null | wc -l)
        echo "  • Sessions today: $today_count"
        
        recent_activity=$(tail -20 "$TOKEN_LOG" 2>/dev/null | wc -l)
        if [[ $recent_activity -gt 10 ]]; then
            echo "  ⚠️ High recent activity detected!"
            echo "  💡 Consider using 'devin-gemini optimized' mode"
        fi
        
        # Check for potential loop patterns
        if grep -q "Ask command" "$TOKEN_LOG" 2>/dev/null; then
            ask_count=$(grep "Ask command" "$TOKEN_LOG" | wc -l)
            echo "  • Total ask commands: $ask_count"
            
            # Check for repeated similar questions
            recent_asks=$(tail -20 "$TOKEN_LOG" | grep "Ask command" | cut -d':' -f4- | sort | uniq -c | sort -nr)
            if echo "$recent_asks" | head -1 | awk '{print $1}' | grep -q '[3-9]'; then
                echo "  🔄 Potential loop detected in recent questions!"
            fi
        fi
        ;;
        
    analyze)
        echo "🔍 Analyzing Gemini usage patterns..."
        
        if [[ ! -f "$TOKEN_LOG" ]]; then
            echo "No usage data to analyze."
            exit 0
        fi
        
        {
            echo "# Gemini Usage Analysis - $(date)"
            echo "================================="
            echo ""
            
            echo "## Summary"
            echo "Total log entries: $(wc -l < "$TOKEN_LOG")"
            echo "Date range: $(head -1 "$TOKEN_LOG" | cut -d' ' -f1-2) to $(tail -1 "$TOKEN_LOG" | cut -d' ' -f1-2)"
            echo ""
            
            echo "## Command Usage"
            grep -o "Ask command\|Context request\|MCP context\|Optimized session\|Simple session" "$TOKEN_LOG" | sort | uniq -c | sort -nr
            echo ""
            
            echo "## Daily Activity"
            cut -d' ' -f1 "$TOKEN_LOG" | sort | uniq -c | sort
            echo ""
            
            echo "## Recommendations"
            ask_commands=$(grep -c "Ask command" "$TOKEN_LOG" 2>/dev/null || echo 0)
            sessions=$(grep -c "session start" "$TOKEN_LOG" 2>/dev/null || echo 0)
            
            if [[ $ask_commands -gt $((sessions * 3)) ]]; then
                echo "- ⚠️ High ask-to-session ratio. Consider longer sessions for related questions."
            fi
            
            if [[ $sessions -gt 20 ]]; then
                echo "- 💡 Consider using 'devin-gemini mcp' for context instead of full sessions."
            fi
            
            # Check for context escalation patterns
            if grep -q "Full context mode" "$TOKEN_LOG"; then
                echo "- 🔴 Full context mode detected. This consumes high tokens - use sparingly."
            fi
            
        } > "$ANALYSIS_LOG"
        
        echo "Analysis complete. Report saved to:"
        echo "$ANALYSIS_LOG"
        echo ""
        cat "$ANALYSIS_LOG"
        ;;
        
    reset)
        echo "🔄 Resetting Gemini usage logs..."
        if [[ -f "$TOKEN_LOG" ]]; then
            mv "$TOKEN_LOG" "${TOKEN_LOG}.backup.$(date +%Y%m%d_%H%M%S)"
            echo "Previous log backed up."
        fi
        
        if [[ -f "$ANALYSIS_LOG" ]]; then
            rm "$ANALYSIS_LOG"
            echo "Analysis log cleared."
        fi
        
        echo "✅ Logs reset. Fresh start for token usage tracking."
        ;;
        
    help|*)
        echo "Gemini Token Usage Monitor"
        echo "========================="
        echo ""
        echo "Commands:"
        echo "  status   - Show current usage status and warnings"
        echo "  analyze  - Generate detailed usage analysis report"
        echo "  reset    - Reset usage logs (backs up existing)"
        echo "  help     - Show this help message"
        echo ""
        echo "💡 Usage Tips:"
        echo "  • Run 'status' before long Gemini sessions"
        echo "  • Use 'analyze' weekly to identify usage patterns"
        echo "  • Reset logs monthly or when troubleshooting"
        echo ""
        echo "🔧 Integration:"
        echo "  • This script works with 'devin-gemini' command"
        echo "  • Logs are automatically created in .ai/logs/"
        echo "  • Use with 'devin-gemini optimized' for best results"
        ;;
esac