# Team share draft — how-to guide + Playwright click paths

Copy/paste (or trim) for Slack / email / standup. Numbers match
[`click-efficiency-findings.md`](click-efficiency-findings.md) as of 2026-08.

---

Wanted to share more on the how-to guide and explain how I used Playwright to
figure out the fastest paths behind it.

For each task, I used Playwright to script out the click paths (both the
“typical” way someone might navigate from Home and the shortest way), run them
for real in the browser, and count the actual number of clicks each one took.
That way the how-to steps aren’t guesses — they’re based on paths that were
tested and confirmed working.

Here’s an example from the guide, requiring a PIN when exiting Speak Mode:

**How to require a PIN when exiting Speak Mode**

1. From the Home screen, click **Settings** (the gear icon at the top).
2. In the **Basics** section, check **Require a PIN when exiting Speak Mode**.
3. Type a 4-digit PIN in **Speak Mode PIN**.
4. Click **Save Preferences**.

On the click counts, here’s what I’ve confirmed so far comparing the typical
path (starting from Home) versus the shortest path:

- **Speaking a short message:** 2 clicks either way  
- **Creating a blank board:** 4 total (3 clicks + typing a name) typical,
  3 total shortest  
- **Toggling a preference:** 3 clicks typical, 2 clicks shortest  

The guide now has **8** published how-tos, all in the same plain,
step-by-step style: speaking a short message, creating a board, toggling
Start in Speak Mode, requiring a PIN, high contrast mode, changing the app
language, auto-capitalize, and notification email frequency.

Adding a symbol to an empty board cell is **not** in the guide yet — we hit a
real app bug where the new label doesn’t save, so that how-to stays blocked
until the fix lands.

Docs in the repo:

- User how-to: `docs/how-to/user-guide.md`  
- Click-count findings: `docs/how-to/click-efficiency-findings.md`  
- Shortest-path QA notes: `docs/task-management/efficient-navigation-guide.md`  
- Suite: `tests/click-efficiency.spec.ts`  

Once we’re further along, we can keep growing the findings doc and possibly
turn the how-to into an actual help page for the team or for users.
