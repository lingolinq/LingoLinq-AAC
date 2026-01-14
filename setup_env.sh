#!/bin/bash
# Helper script to create .env file with generated secrets

set -e

echo "Creating .env file from .env.example..."

if [ -f .env ]; then
    echo "Warning: .env file already exists!"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted. Keeping existing .env file."
        exit 0
    fi
fi

# Generate random keys
SECURE_ENCRYPTION_KEY=$(ruby -rsecurerandom -e 'puts SecureRandom.hex(32)')
SECURE_NONCE_KEY=$(ruby -rsecurerandom -e 'puts SecureRandom.hex(32)')
COOKIE_KEY=$(ruby -rsecurerandom -e 'puts SecureRandom.hex(32)')

# Get user email for console auditing
read -p "Enter your email for console auditing (USER_KEY): " USER_EMAIL

cat > .env << EOF
# Set end to development when, you know, developing
RACK_ENV=development

# REQUIRED - Generated encryption keys
SECURE_ENCRYPTION_KEY=$SECURE_ENCRYPTION_KEY
SECURE_NONCE_KEY=$SECURE_NONCE_KEY
COOKIE_KEY=$COOKIE_KEY

# REQUIRED - Redis connection
REDIS_URL=redis://localhost:6379/

# REQUIRED - Default host for URL generation
DEFAULT_HOST=localhost:3000

# REQUIRED - Console auditing (local only)
USER_KEY=$USER_EMAIL

# REQUIRED - Email configuration
DEFAULT_EMAIL_FROM=LingoLinq Dev <dev@localhost>
SYSTEM_ERROR_EMAIL=$USER_EMAIL
NEW_REGISTRATION_EMAIL=$USER_EMAIL

# Optional: AWS S3 for file uploads (leave commented for local development)
# STATIC_S3_BUCKET=
# AWS_KEY=
# AWS_SECRET=
# UPLOADS_S3_BUCKET=
# OPENSYMBOLS_SECRET=
# OPENSYMBOLS_TOKEN=

# Optional: Email via SES (leave commented for local development)
# SES_KEY=
# SES_SECRET=
# SES_REGION=us-east-1

# Optional: Stripe for purchases (leave commented for local development)
# STRIPE_SECRET_KEY=
# STRIPE_PUBLIC_KEY=

# Optional: External API keys (leave commented for local development)
# GCSE_KEY=
# FLICKR_KEY=
# GOOGLE_PLACES_TOKEN=
# GOOGLE_TRANSLATE_TOKEN=
# MAPS_KEY=
# PIXABAY_KEY=

EOF

echo ""
echo "✓ .env file created successfully!"
echo ""
echo "Generated secure random keys for:"
echo "  - SECURE_ENCRYPTION_KEY"
echo "  - SECURE_NONCE_KEY"
echo "  - COOKIE_KEY"
echo ""
echo "You can now run: bundle install"
