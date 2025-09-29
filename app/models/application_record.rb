class ApplicationRecord < ActiveRecord::Base
  self.abstract_class = true

  if Rails.env.production?
    connects_to database: { writing: :primary, reading: :primary }
  end

  def self.using(conn, &block)
    # TODO: force db
    # Octopus.using(conn) do
    #   block.call
    # end
    block.call
  end
end
