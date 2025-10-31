# Minimal seed data for LingoLinq-AAC
# Creates just the example user needed for testing

# Create example user with password authentication
user1 = User.create!(
  user_name: 'example',
  settings: {
    name: 'Example',
    email: 'admin@example.com',
    description: "I'm just here to help",
    location: "Anywhere and everywhere",
    public: false
  }
)

# Set password and admin status using the Passwords concern
user1.generate_password('password')
user1.settings['admin'] = true
user1.save!

# Create admin organization
org = Organization.create!(
  admin: true,
  settings: { name: "Admin Organization" }
)

puts "✅ Seed data created successfully!"
puts "   User: example / password"
puts "   Admin: true"
puts "   Organization: Admin Organization"
