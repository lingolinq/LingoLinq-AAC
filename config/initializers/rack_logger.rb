module Rails
  module Rack
    class Logger < ActiveSupport::LogSubscriber
      def started_request_message(request)
         'Started %s "%s" for %s at %s' % [
          request.request_method,
          request.filtered_path,
          anonymized_ip(request),
          Time.now.iso8601 ]
      end

      def anonymized_ip(request)
        ip = IPAddr.new(request.ip)

        if ip.ipv4?
          ip.mask(24).to_s
        else
          ip.mask(48).to_s
        end
      end
    end
  end
end
