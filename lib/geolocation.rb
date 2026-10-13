module Geolocation
  # The place lookup is retired: no places are returned and no request is made.
  # The users#places route stays so older clients still get an empty list.
  def self.find_places(lat, long)
    []
  end
end
