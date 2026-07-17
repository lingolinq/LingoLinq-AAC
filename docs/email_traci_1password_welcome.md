# Email to Traci - 1Password Welcome

**To:** traci@lingolinq.com
**From:** scot@lingolinq.com
**Subject:** You're set up in 1Password (quick onboarding)

---

Hi Traci,

I just invited you to LingoLinq's 1Password account. You should see an invite email from 1Password (subject line usually "You've been invited to 1Password"). This note gives you the context it won't.

## What you have access to

You're a guest on one vault: **LingoLinq Collaborators**. It's a curated set of read-only dev credentials you might need when working on frontend or design-integrated work. Ten items, including:

- AI Keys (OpenAI, Gemini, etc.)
- OpenSymbols (symbol library API key)
- Google APIs (the keys for Maps, Places, etc. that get used in the app)
- AWS Dev Credentials + AWS S3 Config (for local dev that hits our S3 buckets)
- Rails Secrets, Stripe (test keys), Email Config, External Services, Seed Credentials

Read-only means you can view and copy values, but not edit or delete anything. That's by design.

You won't see our admin vaults, co-founder vault, or prod-specific vault. If you ever need something that isn't in Collaborators, just ping me and I'll either add it there or grab the specific value for you.

## Getting started

1. Click the invite link in the email from 1Password.
2. Create your master password. Make it strong and don't reuse a password you use elsewhere.
3. Download your **Emergency Kit** when prompted (it's a PDF with your Secret Key). Save it somewhere you won't lose access to. Losing both your master password and your Emergency Kit means losing the account permanently.
4. Install the 1Password app on your laptop and phone. One app. It handles everything.
5. Sign in. You should see the **LingoLinq Collaborators** vault appear in your sidebar.

That's it for basic use. When you need a credential, open 1Password, search for what you need, copy. The browser extension also auto-fills if you install that.

## A nudge on your own setup

Now that you have 1Password, consider using it for your **own** dev credentials too: your Render API key, your GitHub PAT, anything you use to work on LingoLinq. Store those in your **Private** vault (which only you can see). That way nothing lives loose in .env files or config files on your machine.

## Questions

Yell at me if the invite didn't show up, if you can't find something, or if any of this is confusing. This stuff is only useful if it stays out of your way.

Welcome aboard the vault.

Scot
