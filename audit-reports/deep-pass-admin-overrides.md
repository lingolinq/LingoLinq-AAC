# deep-pass `--admin` override log

One entry per override, per `docs/process/deep-pass-admin-exception-policy.md`.
Every field in that policy's evidence block is mandatory. Do not abbreviate
required-check results to "all green": `--admin` bypasses all of them at once.

_Entries below, newest last._

---

## 2026-07-29 - PR #705 (one-time bootstrapping exception)

The policy could not govern its own merge, because it was not yet in effect when
PR #705 landed it. Recorded here to the standard the policy requires from every
override onward.

```
--admin merge, one-time emergency exception (policy not yet active)

PR:                   #705
Head SHA:             668c367610bca313690f2829e4f3e02755fd3673
Merge commit:         9238da23593bbd02c0fe043b2c29ae99242b5cc5
Merged (UTC):         2026-07-29T07:54:20Z
Reason for exception: Lands the deep-pass --admin exception policy itself.
                      deep-pass has no funded reviewer route, so this PR could
                      not pass the gate it exists to govern. Bootstrapping only.

Auth-failure evidence (condition 1):
  deep-pass run URL:  https://github.com/lingolinq/LingoLinq-AAC/actions/runs/30425705022
  Failing step:       Authenticate Codex CLI    <- auth, NOT the review step
  Run conclusion:     failure
  Status timeline:    2026-07-29T05:39:18Z pending
                   -> 2026-07-29T06:20:56Z failure
                      "Timed out after 41min with no result (watchdog)"

Human diff reviewer:  Scot Wahlquist (SAME AS APPROVER - no second reviewer available)
Approver:             Scot Wahlquist (swahlquist)

Required-check results (condition 2, each green on its own):
  rspec:                      pass
  build-and-test:             pass
  audit-artifacts-integrity:  pass
  secret-detection:           pass
  codex-review-tests:         pass
  security-scan:              pass
  comment-preview-url:        skipping (not required)
  codex-review/deep-pass:     failure  <- the check this exception covers

Data-bearing path (condition 3): no
  classifier: data_bearing=false compliance_path=true
```

Source of record: https://github.com/lingolinq/LingoLinq-AAC/pull/705#issuecomment-5114730846
