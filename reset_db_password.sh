#!/bin/bash

# Reset LingoLinq-AAC database password
NEW_PASSWORD="VL5L4+am4532eUTc9M08JWycRXA98ZF+"

echo "Connecting to database and resetting password..."

# Use flyctl to execute SQL command
/c/Users/skawa/.fly/bin/flyctl.exe ssh console \
  --app lingolinq-aac-db \
  --command "su - postgres -c \"psql -c \\\"ALTER USER lingolinq_aac WITH PASSWORD '$NEW_PASSWORD';\\\"\""

if [ $? -eq 0 ]; then
  echo "Password reset successfully!"
  echo ""
  echo "New DATABASE_URL:"
  echo "postgres://lingolinq_aac:$NEW_PASSWORD@lingolinq-aac-db.internal:5432/lingolinq_aac"
else
  echo "Failed to reset password"
  exit 1
fi
