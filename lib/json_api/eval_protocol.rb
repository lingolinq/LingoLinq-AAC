module JsonApi::EvalProtocol
  extend JsonApi::Json

  TYPE_KEY = 'eval_protocol'
  DEFAULT_PAGE = 25
  MAX_PAGE = 50

  def self.build_json(protocol, args = {})
    json = {}
    json['id'] = protocol.global_id || protocol.public_protocol_id
    json['public_protocol_id'] = protocol.public_protocol_id
    json['protocol_version'] = protocol.protocol_version
    json['population_profile'] = protocol.population_profile
    json['public'] = ((protocol.settings || {})['public'] || false).to_s
    json['protocol'] = (protocol.settings || {})['protocol'] || {}
    json['protocol']['template_id'] = protocol.global_id if protocol.id
    json['protocol']['id'] ||= protocol.public_protocol_id if protocol.public_protocol_id
    if args[:permissions]
      json['permissions'] = protocol.permissions_for(args[:permissions])
    end
    json
  end
end
