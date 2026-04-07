class UserExtra < ApplicationRecord
  belongs_to :user

  include GlobalId
  include Async
  include SecureSerialize

  secure_serialize :settings
  before_save :generate_defaults

  def generate_defaults
    self.settings ||= {}
    true
  end

  def process_focus_words(hash)
    merged = {}
    existing = self.settings['focus_words'] || {}
    hash.each do |name, opts|
      if existing[name]
        if opts['updated'] > existing[name]['updated'] - 60 && !opts['deleted'] && opts['updated'] > (existing[name]['deleted'] || 60) - 60
          existing[name]['updated'] = opts['updated']
          existing[name].delete('deleted')
          existing[name]['words'] = opts['words']
        elsif opts['deleted'] && opts['deleted'] > existing[name]['updated'] - 60
          existing[name]['deleted'] = opts['deleted']
        end
      else
        existing[name] = opts
      end
    end
    existing.each do |name, opts|
      existing.delete(name) if opts['deleted'] && opts['deleted'] < 48.hours.ago.to_i
    end
    self.settings['focus_words'] = existing
    self.save
  end
  

  def process_profile(profile_id, profile_template_id=nil, triggering_org=nil)
    sessions = LogSession.where(user_id: self.user_id, log_type: 'profile', profile_id: profile_id).order('started_at DESC').limit(10)
    recents = []
    # If profile_template_id is defined, the first result should match the template_id
    keep_adding = !profile_template_id
    sessions.each do |session|
      if keep_adding || session.data['profile']['template_id'] == profile_template_id
        keep_adding = true
        recents << {
          template_id: session.data['profile']['template_id'],
          summary: session.data['profile']['summary'],
          summary_color: session.data['profile']['summary_color'],
          log_id: session.global_id,
          added: session.started_at.to_i
        }
      end
    end
    # Save for the user
    self.settings['recent_profiles'] ||= {}
    self.settings['recent_profiles'][profile_id] = recents

    # Also attach to any UserLinks where this might apply
    links = UserLink.where(user_id: self.user_id).select{|l| (l.data['type'] == 'org_supervisor' || l.data['type'] == 'org_user') && !l.data['state']['pending'] }
    orgs = Organization.find_all_by_global_id(links.map{|l| l.record_code.split(/:/)[1] }.uniq)
    soonest_org_cutoff = nil

    links.each do |link|
      # lookup org
      org = orgs.detect{|o| Webhook.get_record_code(o) == link.record_code }
      # if org has comm/sup profile set (even to 'default')
      if org && ((link.data['type'] == 'org_supervisor' && org.matches_profile_id('supervisor', profile_id, profile_template_id)) || (link.data['type'] == 'org_user' && org.matches_profile_id('commnicator', profile_id, profile_template_id)))
        org_cutoff = org.profile_frequency(link.data['type'] == 'org_supervisor' ? 'supervisor' : 'communicator')
        if org_cutoff
          soonest_org_cutoff = [soonest_org_cutoff, org_cutoff].compact.min
          if recents[0]
            recents[0][:expected] = recents[0][:added] + org_cutoff
          end
        end
        link.data['state']['profile_id'] = profile_id
        link.data['state']['profile_template_id'] = profile_template_id
        link.data['state']['profile_history'] = recents
        link.save
      elsif triggering_org && org == triggering_org && !profile_id
        link.data['state'].delete('profile_id')
        link.data['state'].delete('profile_template_id')
        link.data['state'].delete('profile_history')
        link.save
      end
    end
    if recents[0]
      recents[0].delete(:expected)
      if soonest_org_cutoff
        recents[0][:expected] = recents[0][:added] + soonest_org_cutoff
      end
      recents[0][:expected] ||= recents[0][:added] + 12.months.to_i
    end
    self.save
  end

  def active_focus_words
    res = {}
    (self.settings['focus_words'] || {}).to_a.select{|name, opts| !opts['deleted']}.sort_by{|name, opts| opts['updated'] || 0 }.each do |name, opts|
      res[name] = opts
    end
    res
  end

  def tag_board(board, tag, remove, downstream)
    return nil unless board && board.global_id && !tag.blank?
    self.settings['board_tags'] ||= {}
    if remove == true || remove == 'true'
      if self.settings['board_tags'][tag]
        self.settings['board_tags'][tag] = self.settings['board_tags'][tag].select{|id| id != board.global_id }
      end
    else
      self.settings['board_tags'][tag] ||= []
      self.settings['board_tags'][tag] << board.global_id
      if downstream == true || downstream == 'true'
        self.settings['board_tags'][tag] += board.downstream_board_ids
      end
      self.settings['board_tags'][tag].uniq!
    end
    self.settings['board_tags'].each do |k, list|
      self.settings['board_tags'].delete(k) if !list || list.empty?  
    end
    self.save!
    self.settings['board_tags'].keys.sort
  end
end
