module Geolocation
  # The place lookup is retired: no places are returned and no request is made.
  # The route (app/controllers/api/users_controller.rb:58) stays so older
  # clients still get an empty list.
  def self.find_places(lat, long)
    []
  end
end
