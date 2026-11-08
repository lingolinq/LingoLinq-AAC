# Device trust on shared and personal AAC devices: standards research

Date: 2026-11-07. Author: Traci (with Claude). For: Scot, deciding the open Medium item on PR #1268.

## The question

Before PR #1268, a sign-in from an iPad Home Screen icon was marked "trusted" without asking. The PR now
asks "Trust this Device" or "This is a Shared Device", as the browser does. But the server keeps a device's
trusted mark forever (`app/models/device.rb:172` only ever raises it), so anyone who signed in from a Home
Screen icon before the PR stays trusted and is never asked. On a shared classroom iPad, those students stay
signed in for months.

Two candidate fixes:
1. **Reset once:** clear the trusted mark on those Home Screen devices.
2. **Ignore unchosen marks:** at the next Home Screen sign-in, ask again unless the person actually chose.

What do security standards and AAC practice say?

## Short answer

- Security standards treat a long-lived session as a choice the person makes, with limits, and say a
  shared device should not stay signed in. A mark nobody chose does not meet that bar, so it should stop
  counting.
- AAC practice says a person's own device is their voice and must work at all times. Unexpected sign-outs
  and password prompts on a communicator are harmful.
- **Recommendation: option 2, with the choice recorded.** Ask again at the next Home Screen sign-in when
  no choice is on record, and never cut off a session already running. Option 1 would downgrade running
  sessions to sign-out after 12 hours idle (`device.rb:284` checks on every request), which could sign a
  student out of their own communicator without warning.

## What the AAC field says

| Source | What it says | What it means here |
|---|---|---|
| NJC Communication Bill of Rights, item 12 (3rd ed., hosted by ASHA) | "The right to individualized, working augmentative and alternative communication (AAC) systems and other assistive technology (AT) at all times." | A personal AAC device must not be locked by a sign-out the user cannot recover from alone. |
| ASHA, "Back-to-School: Tips for Supporting Students Who Use AAC Devices" (Aug 13, 2026) | "Make sure AAC is available at all times." "Where the student goes, their AAC goes." Also: a low-tech backup for device or power failure. | Same principle in current practice guidance for schools. |
| AssistiveWare Proloquo (team setup) | An admin creates a "personal PIN"; "This PIN code makes sure your admin privileges are protected," so "the iPad can safely be shared with anyone." An account is optional to start. | Industry pattern: **speaking never needs a sign-in**; the supporter's powers are what get protected. |
| AssistiveWare Proloquo2Go (users) | "You can have as many Proloquo2Go user profiles as you want on your device." Teachers often keep one per student. | Shared classroom devices are normal in AAC and handled with per-user profiles on one device. |
| TD Snap, TouchChat, LAMP WFL (vendor and AbleNet support pages) | Editing is locked with a passcode; speech is gated by a license or subscription, not by a sign-in. iPad Guided Access keeps the device in the app. | Same pattern: lock editing and leaving the app, not communicating. |

No AAC body publishes a rule on session length. The consistent pattern is: the communicator always
works, and supporter-level access (editing, other students' data) is what gets locked.

## What the security and privacy standards say

| Source | What it says | What it means here |
|---|---|---|
| NIST SP 800-63B-4, session management | Every session needs an overall timeout ("SHOULD be no more than 30 days at AAL1"; 24 hours and 1 hour inactivity at AAL2). "Cookies and similar 'remember my browser' features SHALL NOT be used instead of authentication." Logoff matters "particularly if the endpoint might be accessible to others." | A remembered device is a continuation of a real sign-in, never a substitute, and shared endpoints need shorter sessions. (NIST binds federal agencies; it is the reference others follow.) |
| OWASP Session Management Cheat Sheet | "All sessions should implement an absolute timeout" and "an idle or inactivity timeout." The session "must be renewed or regenerated ... after any privilege level change." Browser close "cannot reliably enforce logout." | When the rules for a session change, sessions granted under the old rules are re-established, not carried over. |
| HIPAA Security Rule, 45 CFR 164.312(a)(2)(iii) | Automatic logoff (Addressable): "Implement electronic procedures that terminate an electronic session after a predetermined time of inactivity." HHS proposed making most addressable specifications required (NPRM Jan 6, 2025); not final. | An inactivity limit is expected for patient data, and may become mandatory. |
| WCAG 2.2, SC 3.3.8 Accessible Authentication (AA) | Signing in must not require "a cognitive function test (such as remembering a password ...)" unless there is another way, such as password managers or copy and paste. | Each forced re-sign-in is an accessibility barrier for many AAC users, so avoid unnecessary ones. |
| WCAG 2.2, SC 2.2.5 Re-authenticating (AAA) | "When an authenticated session expires, the user can continue the activity without loss of data after re-authenticating." | If a session does end, the user must not lose work. |
| Apple Shared iPad (Platform Deployment and Security guides) | Schools can run guest "temporary sessions" whose data is deleted at sign-out, with an admin timeout. | The platform's own answer for shared school iPads: short-lived and cleared. |
| US Dept. of Education, Student Privacy (PTAC) | General security best practices; no specific shared-device rule found. | FERPA expects reasonable protection; it does not set a session length. |

## How LingoLinq compares today

From `app/models/device.rb` (`token_timeout`, inactivity timeout):

| Device | Longest session | Signed out after idle |
|---|---|---|
| Browser, trusted | 6 months | 28 days |
| Browser, shared | 28 days | 12 hours |
| Installed app, trusted | 5 years | 14 months |

When a token is rejected online, the app signs the user out ("This session has expired, please log back in",
`app/frontend/app/services/session.js:303`). On a personal communicator, that is the moment the user loses
access to their boards until a supporter signs back in.

Observation, not in scope for this decision: the trusted browser maximum (6 months) is longer than the NIST
AAL1 guidance of 30 days. For a personal AAC device this is a deliberate trade-off towards "available at all
times", and should be recorded as such rather than changed silently.

## Recommendation for the open Medium item

Option 2, done as follows:
- Record when a person actually answers the Trust or Shared question on a device.
- At a Home Screen sign-in, if no answer is on record, ask, even if the device row says trusted.
- Never change a session that is already running, so nobody is signed out mid-use.
- After that, a personal device is asked once and then stays trusted; a shared classroom iPad gets its
  short sessions.

Why not option 1: it would turn running sessions on personal devices into 12-hour idle sessions with no
warning, which breaks "available at all times" for the people the app exists for.

## Open questions for Scot

- Which assurance level does LingoLinq aim for (NIST AAL1 or AAL2)? It decides whether the 6-month trusted
  maximum needs a documented exception.
- Should a supporter's account (SLP, teacher) on a shared device get shorter limits than a communicator's own
  account? That matches the AAC pattern of protecting supporter powers, not speech.
- When a session ends offline on a personal device, do saved boards stay usable until the device is back
  online? Not verified here.

## Sources

- [NJC Communication Bill of Rights (ASHA)](https://www.asha.org/njc/communication-bill-of-rights/)
- [ASHA: Back-to-School Tips for Supporting Students Who Use AAC Devices (2026)](https://www.asha.org/news/2026/back-to-school-aac-classroom-tips/)
- [ASHA Practice Portal: AAC](https://www.asha.org/Practice-Portal/Professional-Issues/Augmentative-and-Alternative-Communication/)
- [AssistiveWare: Proloquo, manage team](https://www.assistiveware.com/support/proloquo/team/manage-team)
- [AssistiveWare: Proloquo2Go users](https://www.assistiveware.com/support/proloquo2go/basics/users)
- [AbleNet: Getting started with Proloquo](https://support.ablenetinc.com/guides/proloquo/getting-started-with-proloquo/)
- [AbleNet: Speech app passwords and editing locks](https://support.ablenetinc.com/quicktalker-freestyle/speech-app-master-passwords/)
- [NIST SP 800-63B-4: Session management](https://pages.nist.gov/800-63-4/sp800-63b/session)
- [NIST SP 800-63B-4: Authenticator assurance levels](https://pages.nist.gov/800-63-4/sp800-63b/aal)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [45 CFR 164.312 (Cornell LII)](https://www.law.cornell.edu/cfr/text/45/164.312)
- [HIPAA Security Rule NPRM, Federal Register, Jan 6, 2025](https://www.federalregister.gov/documents/2025/01/06/2024-30983/hipaa-security-rule-to-strengthen-the-cybersecurity-of-electronic-protected-health-information)
- [W3C: Understanding SC 3.3.8 Accessible Authentication (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html)
- [W3C: Understanding SC 2.2.5 Re-authenticating](https://www.w3.org/WAI/WCAG22/Understanding/re-authenticating.html)
- [Apple Platform Deployment: Shared iPad](https://support.apple.com/guide/deployment/dep9a34c2ba2)
- [Apple Platform Security: Shared iPad](https://support.apple.com/guide/security/secd99f373ef)
- [US Dept. of Education: Data security checklist](https://studentprivacy.ed.gov/resources/data-security-checklist)
