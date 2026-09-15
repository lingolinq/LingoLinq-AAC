# 1Password Decision: $24/month. Need your sign-off by Saturday.

**To:** Dominic
**From:** Scot
**Date:** 2026-04-17
**Decide by:** 2026-04-18 (trial ends)

---

## The 30-second version

I set up 1Password for the company. Free trial ends in 2 days. Monthly cost is **$23.97 for the 3 of us** (you, me, Melissa). Long-term contractors like Traci and Brian are free.

I looked at the main free alternative (Bitwarden) and it does not work for a company in our position. Details below. I recommend we keep 1Password.

---

## What a password manager actually does for you day-to-day

If you have not used one before, here is what changes:

1. You install 1Password on your phone and laptop. One app.
2. When you log in to any website (bank, Stripe, HubSpot, Google), 1Password fills in the username and password for you. You never type a password again.
3. You have one master password that unlocks the app on your devices. That is the only one you memorize.
4. When we need to share a login (like the LingoLinq AFCU account), I put it in a shared "vault" and it shows up on your device automatically. Same with Melissa for dev stuff.
5. It generates strong passwords for you when you sign up for new sites. No more reusing passwords.
6. It warns you when a password you use has been leaked in a breach somewhere on the internet.

The shared-vault part is the real unlock for us. Right now if I need to give you access to a new tool, I am sending passwords in text messages or email, which is both insecure and a nightmare when passwords change. With 1Password, I update it once and you see the new password instantly.

---

## Why a free option doesn't work for us

There are free password managers, most notably **Bitwarden Free**. Bitwarden Free is a great product for personal use. I use something like it for my own non-LingoLinq logins.

The problem: free tiers are built for individuals, not companies. Specifically, Bitwarden Free does not have:

- **Shared vaults for teams.** You and I literally cannot share a password through the free version. Everyone has their own silo.
- **Admin controls.** No way for me to say "Melissa can see dev secrets but not banking."
- **Audit logs.** No record of who accessed what password when. Required for compliance.
- **A Business Associate Agreement (BAA).** This is the legal document HIPAA requires from any vendor that touches healthcare data indirectly. Free tools do not sign BAAs.

So we are not really comparing 1Password Business vs "free." We are comparing 1Password Business vs the **paid business tier of Bitwarden**, because that is the only version of Bitwarden with the features a real company needs.

---

## Why this matters for LingoLinq specifically

We sell to schools, hospitals, and European clients. Every one of those buyers sends us a security questionnaire before they sign a contract. Questions like:

- "How do you manage administrative credentials?"
- "Do you have audit logs of who accesses production systems?"
- "Can you provide a BAA?"
- "How do you revoke access when someone leaves the team?"

If we answer "we use a shared Google Doc" or "free Bitwarden," we lose deals. Not because it's insecure in practice (though it is), but because district IT and hospital compliance teams have checklists and we need to check the boxes. This is a competitive issue, not just a risk issue.

We are also legally on the hook under:

- **HIPAA** (hospital clients process patient data)
- **FERPA** (schools process student education records)
- **COPPA** (most of our end users are children under 13)
- **GDPR** (European clients have EU data protection rules)

These frameworks all require controls around who accesses sensitive systems and proof of those controls. A real password manager with audit logs and individual accounts is how we provide that proof.

---

## The honest cost comparison

| Option | What it covers | Cost for us |
|---|---|---|
| **Bitwarden Free** | Personal use, one user only | $0, but **cannot be used for business** |
| **Bitwarden Teams** ($4/user) | Small teams, no BAA | Not HIPAA-eligible, ruled out |
| **Bitwarden Enterprise** ($6/user) | Comparable to 1Password Business | **$18/mo for 3 seats** |
| **1Password Business** ($7.99/user) | What we have now | **$24/mo for 3 seats** |

The real comparison is $18/mo vs $24/mo. **Bitwarden Enterprise would save us $72 per year.**

---

## Why I'm still recommending 1Password over Bitwarden

Three reasons:

### 1. Free contractor access

1Password Business includes 20 free guest seats. That covers Traci, Brian (OpenAAC, joining in a few weeks), and any AI interns or design contractors we bring on through the rest of this year.

Bitwarden charges for every user. If we add 3 contractors over the next 12 months, Bitwarden becomes **more expensive** than 1Password. That $72/year savings flips to a net loss.

### 2. We already built automation on top of 1Password

I have been setting this up for a few weeks. What is already working:

- Our server secrets (database passwords, API keys) auto-sync from 1Password to Render every hour via a GitHub Action. This fixed a real production bug last month where workers had stale keys.
- Claude Code and my other AI tools pull credentials from 1Password instead of having them sit in .env files on my laptop.
- We have vault structure, access rules, and service accounts configured.

Switching to Bitwarden means Melissa rebuilds all of that. Conservatively 2 to 3 days of her contractor time. At her rate, that is **more than a year of 1Password subscription cost** out the window in the first week.

### 3. Audit-ready today

If a district asks us tomorrow to prove we manage credentials properly, 1Password Business gives us the audit log, BAA, and SOC 2 report in one click. We do not have to scramble.

---

## Where Bitwarden would genuinely win

I want to be fair here. Bitwarden would be the better choice if:

- We were starting from scratch with no automation built (we are not)
- We had 15 or more employees where the per-seat math compounds (we have 3)
- We contractually needed to self-host our password manager (no client has asked)
- Open-source software was a company principle we market on (it is not)

None of those apply to us right now. If we grow to 15 people or land a client that requires self-hosted infrastructure, we revisit this decision. For now, 1Password is the right call.

---

## What I need from you

1. **Approve the $23.97/month charge** before Saturday so we do not lose the trial setup.
2. **Accept your pending 1Password invite** (check your email for a message from 1Password). Once you accept, I will add you to the Co-Founders vault where I already put the AFCU shared login.
3. **Tomorrow's meeting:** we will rotate the AFCU password and set up proper 2FA that works for both of us remotely. The current setup is not safe for a business bank account.

If you want to talk any of this through before Saturday, grab me on Chat or we can hop on a call.

---

## CALENDAR ITEM: Add to your task calendar for April 2027

**Title:** Revisit LingoLinq password manager choice (1Password vs Proton Pass)

**Date:** 2027-04-17 (approximately one year from today)

**Context:** Today we committed to 1Password Business for LingoLinq. At that time, Proton Pass for Business was an emerging alternative priced at roughly half the cost ($4.49/user vs $7.99/user) but too new to trust for our automation. Proton also offers a full Business Suite that bundles Mail, Drive, VPN, and Pass under a single BAA for $12.99/user, which could eventually replace Google Workspace.

**What to check in a year:**

1. Has Proton Pass CLI matured? (It launched November 2025, so by April 2027 it will have been in the wild for about 18 months.)
2. Is Proton Business Suite cheaper than our combined Google Workspace plus 1Password spend?
3. Does Proton offer a free guest seat model comparable to 1Password's 20 included guests?
4. Has our team grown past 15 people? If so, the per-seat math changes significantly.
5. Has any client contractually required self-hosted credential management?

**What would trigger an earlier re-evaluation:**
- 1Password raises prices by more than 20 percent
- A 1Password security incident
- A client signs a contract requiring self-hosted or EU-jurisdiction password management
- We grow past 15 full-time team members

If none of the above, 1Password remains the right call.

---

## Appendix: Market scan as of 2026-04-17

Before finalizing this decision, I ran a fresh scan of the business password manager market to make sure no new player had emerged that would be a better fit for us. Summary of findings:

- **Proton Pass Business** is the only genuinely new contender worth naming (CLI launched Nov 2025). Cheaper but with less mature automation. Revisit in 12 months.
- **Keeper Business** is comparable to 1Password but charges per guest seat.
- **Dashlane** killed its free tier in Sep 2025, no publicly confirmed BAA.
- **NordPass** has SOC 2 but does not publicly advertise HIPAA BAA support.
- **LastPass** ruled out permanently (2022 breach still causing damage, ICO penalty Nov 2025, unpatched DEF CON 33 vuln from Aug 2025).
- **Passbolt and Psono** are open-source self-hosted options. Not worth the operational burden for a 3-person team.

A February 2026 independent study from ETH Zurich and USI tested 27 theoretical attack scenarios against major password managers. **1Password had the fewest findings (2). Bitwarden had 12.** That matters for procurement questionnaires.

No breaches disclosed for 1Password, Bitwarden, Proton Pass, Keeper, or Dashlane during the 2023 through 2026 window.

Conclusion: 1Password Business remains the right choice for LingoLinq today.
