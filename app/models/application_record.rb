class ApplicationRecord < ActiveRecord::Base
  self.abstract_class = true

  # Read replica disabled for single-database deployment
  # if Rails.env.production?
  #   connects_to database: { writing: :primary, reading: :primary_replica }
  # end

  def self.using(conn, &block)
    # TODO: force db
    # Octopus.using(conn) do
    #   block.call
    # end
    block.call
  end
end
