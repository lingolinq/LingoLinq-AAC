# Resetting an account's two-factor authentication

For an account holder who can no longer produce codes (authenticator app lost, phone replaced
or wiped). In production, admin accounts (`User#admin?`) must use two-factor authentication
(`Passwords.mandatory_admin_2fa_environment?`, `app/models/concerns/passwords.rb`), so the
profile page offers no Disable button for them and the server refuses one (`update_2fa` in
`app/controllers/api/users_controller.rb`). Their 2FA is reset from the console.

For an account that does not have to use 2FA, the same console steps turn it off; a supporter can
then turn it on again from their profile page.

## Before you start

- Confirm the request comes from the account holder, the same way the team confirms any account
  change made on someone's behalf.
- Use the audited console, `bin/audit_console`, from a Cloud Run exec shell or the
  `lingolinq-migrate` job (`docs/INFRASTRUCTURE.md`, "Console and one-off work"). It records the
  session and attributes the change.
- Decide whether a device signed in to the account may be lost too (for example the phone that
  held the authenticator). If you are not sure, treat it as lost and do step 3.

## Steps

1. Find the account:

   ```ruby
   user = User.find_by_path('<user name>')
   ```

2. Remove its 2FA secret, including one still waiting to be confirmed:

   ```ruby
   user.settings.delete('2fa')
   user.settings.delete('tmp_2fa')
   user.save!
   ```

3. Only when a signed-in device may be lost: sign out every device on the account and clear the
   devices' 2FA trust.

   ```ruby
   Device.where(user_id: user.id).find_each do |device|
     device.revoke_all_tokens!
     device.reload
     device.settings.delete('2fa')
     device.save!
   end
   ```

   Removing the secret alone (step 2) does not sign out a device that already entered a code
   (`Device#predates_2fa?`, `app/models/device.rb`). Revoking its tokens signs it out, but a
   trusted device that entered a code in the last 30 days could sign in again without one
   (`Device#generate_token!`), because sign-in reuses the same device record. Clearing
   `settings['2fa']` on the device removes that trust. If the password may be known as well, the
   account holder also changes it.

4. Check the secret is gone:

   ```ruby
   user.reload.settings.key?('2fa')  # => false
   ```

## What happens next

- For an admin account in production, the next time the account is loaded (`Passwords#state_2fa`)
  a new secret is created and devices that never entered a code are signed out.
- At the next sign-in the account holder is shown a QR code, scans it into their authenticator
  app and enters a code (`lib/json_api/token.rb`, `set_2fa`). That device is then trusted as
  usual.
- Do not read or share the new secret or its QR code from the console; the account holder sets
  it up at sign-in.
