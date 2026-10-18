# F25 Completion Report

**Branch:** main
**Commit:** 7565880 `fix(frontend): F25 defect pass — nudge off the composer, RTL scene anchored, join no longer resurrected`
**Pushed to:** origin/main

## Summary

Four defects identified and fixed during the F25 whole-frontend review:

### 1. InstallNudge composing placement (Phone)

- **Problem:** InstallNudge sat exactly on the composer on phones with `left-4 right-4 bottom-16 z-80`, intercepting the `+` / field / send mid-session
- **Fix:** InstallNudge now never shows while `[data-app-state="connected"]` owns the screen, steps aside when a room opens, and re-arms for a later calm moment

### 2. HeroDeviceDemo RTL scene anchoring

- **Problem:** HeroDeviceDemo's fixed-px scene obeyed inherited direction: in Arabic RTL it started at the host's right edge and cropped ~90px off the laptop screen
- **Fix:** Pinned to the physical top-left, so the crop lands on the same edge in every locale; mock text still mirrors

### 3. OverlaySheet close button hit box

- **Problem:** Close button shipped 32px against the house 40px tap contract
- **Fix:** Updated to 40px hit box, same visual center

### 4. Cancelled in-flight room creation resurrected phantom pairing screen

- **Problem:** Create → cancel → receive → valid code never landed (phantom pairing screen swallowed the next join)
- **Fix:** `handleSend` now has a synchronous re-entry guard and abandons a superseded room; `handleCodeComplete` gets the same abort-ref treatment