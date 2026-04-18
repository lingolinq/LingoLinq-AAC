class Api::ProfilesController < ApplicationController
  before_action :require_api_token

  def show
    profile = ProfileTemplate.find_by_code(params['id'])
    profile ||= ProfileTemplate.static_template(params['id'])
    return unless exists?(profile, params['id'])
    return unless allowed?(profile, 'view')
    render json: JsonApi::Profile.as_json(profile, :wrapper => true, :permissions => @api_user)
  end

  def index
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'supervise')
    defaults = ProfileTemplate.static_templates(user.settings['preferences']['role'] == 'communicator' ? 'communicator' : 'supervisor')
    global_templates = ProfileTemplate.where(organization_id: nil, communicator: user.communicator_role?)
    org_ids = Organization.attached_orgs(user).map{|o| o['id'] }
    org_templates = ProfileTemplate.where(organization_id: User.local_ids(org_ids), communicator: user.communicator_role?)
    list = (org_templates + defaults + global_templates).uniq
    render json: list.map{|s| template_or_session(s) }
  end
  
  def latest
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'supervise')
    if params['profile_id']
      sessions = LogSession.where(user: user, profile_id: params['profile_id']).where('started_at IS NOT NULL').order('started_at DESC').limit(10)
    else
      sessions = LogSession.where(user: user, log_type: 'profile').where('profile_id IS NOT NULL AND started_at IS NOT NULL').order('started_at DESC').limit(10)
    end
    sessions = sessions.to_a
    if params['include_suggestions']
      original_sessions = [] + sessions
      # UserLink order for org_user vs org_supervisor is DB-dependent; sort so suggestions are stable
      # (communicator org profile before supervisor org profile when both exist).
      profile_org_rank = {'user' => 0, 'supervisor' => 1, 'manager' => 2}
      attached = Organization.attached_orgs(user).sort_by do |org|
        [profile_org_rank[org['type']] || 99, org['id'].to_s]
      end
      attached.each do |org|
        if org['profile']
          # For every profile-configured org, check for frequency
          # and update any actual sessions with frequency data
          shown_sessions = original_sessions.select{|s| s.profile_id == org['profile']['profile_id'] }
          org['profile']['frequency'] ||= 12.months.to_i
          if org['profile']['frequency']
            shown_sessions.each do |session|
              session.data['expected'] = [session.data['expected'], session.started_at + org['profile']['frequency']].compact.min
            end
          end
          # If there are no sessions for the org's desired profile,
          # then return a blank template at the end
          if shown_sessions.length == 0
            template = ProfileTemplate.find_by_code(org['profile']['template_id'] || org['profile']['profile_id'])
            template ||= ProfileTemplate.static_template(org['profile']['profile_id'])
            template ||= ProfileTemplate.static_template(ProfileTemplate.default_profile_id(org['type'] == 'user' ? 'communicator' : 'supervisor')) if org['profile']['profile_id'] == 'default'
            template.settings['profile']['from_org'] = true if template
            sessions << template if template
          end
        end
      end
      
      if sessions.count == 0
        template = ProfileTemplate.static_template(ProfileTemplate.default_profile_id(user.settings['preferences']['role'] == 'communicator' ? 'communicator' : 'supervisor'))
        sessions << template if template
      end
    end
    list = sessions.map{|s| template_or_session(s) }
    render json: list
  end

  protected
  def template_or_session(session)
    if session.respond_to?(:author)
      # actual session
      author = session.author
      expected = nil
      expected = 'due_soon' if session.data['expected'] && session.data['expected'] < 1.month.from_now
      expected = 'overdue' if session.data['expected'] && session.data['expected'] < Time.now
      profile = session.data['profile'].except('results', 'encrypted_results')
      {
        started: session.started_at,
        expected: expected,
        log_id: session.global_id,
        profile: profile,
        profile_id: profile['id'],
        author: {user_name: author.user_name, id: author.global_id}
      }
    else
      prof = session.settings['profile']
      prof['id'] = session.public_profile_id
      prof['template_id'] = session.global_id
      # profile template
      {
        id: session.global_id,
        profile_id: session.public_profile_id,
        profile: session.settings['profile']
      }
    end
  end
end
