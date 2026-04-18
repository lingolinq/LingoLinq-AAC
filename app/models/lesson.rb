class Lesson < ApplicationRecord
  include GlobalId
  include SecureSerialize
  include Processable
  include Permissions
  include Async

  secure_serialize :settings
  before_save :generate_defaults
  after_save :check_url

  add_permissions('view', ['*']) { !!self.public }
  add_permissions('view', 'view_ratings', 'edit') {|user| self.user_id == user.id }
  add_permissions('view', 'view_ratings') {|user| (self.settings['usages'] || []).map{|u| u['obj'] }.include?(Webhook.get_record_code(user)) }
  add_permissions('view', 'view_ratings', 'edit') {|user| 
    # First usage gets edit permission
    if self.organization_id
      org = Organization.find(self.organization_id)
      org && org.allows?(user, 'edit')
    elsif self.organization_unit_id
      unit = OrganizationUnit.find(self.organization_unit_id)
      unit && unit.allows?(user, 'edit')
    elsif self.user_id
      user = User.find(self.user_id)
      user && user.allows?(user, 'supervise')
    else
      false
    end
  }
  add_permissions('view', 'view_ratings') {|user| 
    # All usages get view permission
    res = false
    (self.settings['usages'] || []).each do |use|
      if !res
        record_code = use['obj']
        rec = Webhook.find_record(record_code) if record_code
        if rec.is_a?(User)
          res = true if rec.allows?(user, 'supervise')
        elsif rec.is_a?(Organization)
          res = true if rec.allows?(user, 'edit')
        elsif rec.is_a?(OrganizationUnit)
          res = true if rec.allows?(user, 'edit')
        end
      end
    end
    res
  }
  # Lessons assigned to an org/unit may still be stored with user_id only; org/unit managers
  # need edit so they can update links and settings from the organization trainings UI.
  add_permissions('view', 'view_ratings', 'edit') {|user|
    (self.settings['usages'] || []).any? do |use|
      record_code = use['obj']
      next false unless record_code
      rec = Webhook.find_record(record_code)
      !!(rec && (
        (rec.is_a?(Organization) && rec.allows?(user, 'edit')) ||
        (rec.is_a?(OrganizationUnit) && rec.allows?(user, 'edit'))
      ))
    end
  }
  cache_permissions

  # Bare hostnames (e.g. "google.com") are invalid in iframe src without a scheme — browsers
  # resolve them as paths relative to the current URL. Prepend https:// when appropriate.
  def self.normalize_lesson_embed_url(url)
    return nil if url.blank?
    url = url.to_s.strip
    return nil if url.empty?
    return url if url.start_with?('/')
    return url if url.start_with?('//')
    return url if url.match?(/\Ahttps?:\/\//i)
    return nil if url.match?(/\A[a-z][a-z0-9+.-]*:/i)
    "https://#{url}"
  end

  def generate_defaults
    self.settings ||= {}
    self.settings['title'] ||= "Unnamed Lesson"
    # self.settings['past_cutoff'] ||= 1.year.to_i
    tally = 0
    cnt = 0
    (self.settings['completions'] || []).each do |comp|
      if comp['rating']
        cnt += 1
        tally += comp['rating']
      end
    end
    self.settings['average_rating'] = cnt == 0 ? nil : (tally.to_f / cnt.to_f).round(1)
    self.settings['completed_user_ids'] = (self.settings['completions'] || []).map{|c| c['user_id']}.compact.uniq

    self.public ||= false
    self.popularity = 0
    self.popularity += (self.settings['usages'] || []).length
    true
  end

  def nonce
    self.settings ||= {}
    if !self.settings['nonce']
      self.settings['nonce'] = GoSecure.nonce('lesson_nonce')
      self.save
    end
    self.settings['nonce']
  end

  def load_users_and_extras(obj)
    users = []
    if obj.instance_variable_get('@users_and_extras')
      return obj.instance_variable_get('@users_and_extras')
    end
    if obj.is_a?(Organization)
      users = obj.attached_users('all')
    elsif obj.is_a?(OrganizationUnit)
      users = User.find_all_by_global_id(obj.all_user_ids)
    elsif obj.is_a?(User)
      users = [obj]
    end
    extras = UserExtra.where(user: users)
    obj.instance_variable_set('@users_and_extras', [users, extras])
    [users, extras]
  end

  def user_counts(obj)
    users, extras = load_users_and_extras(obj)
    lookups = {}
    completes = 0
    users.each{|u| lookups[u.global_id] = true }
    (self.settings['completions'] || []).each do |comp|
      if lookups[comp['user_id']]
        completes += 1 
        lookups[comp['user_id']] = false
      end
    end
    {total: users.length, complete: completes}
  end

  def check_url(frd=false)
    return if !self.settings['url']
    normalized = Lesson.normalize_lesson_embed_url(self.settings['url'])
    return if !normalized
    return if self.settings['checked_url'] && self.settings['checked_url']['url'] == normalized
    if !frd
      self.schedule(:check_url, true)
      return
    end
    res = Typhoeus.head(normalized, followlocation: true)
    self.settings['checked_url'] = {'url' => normalized, 'ts' => Time.now.to_i}
    if res.code < 300 && res.code > 199
      if ['deny', 'sameorigin'].include?((res.headers['X-Frame-Options'] || '').downcase)
        self.settings['checked_url']['noframe'] = true
      end
      if res.headers['Content-Security-Policy']
        parts = res.headers['Content-Security-Policy'].split(/\s*;\s*/)
        parts.each do |part|
          head, str = part.split(/:\s*/, 2)
          if head.downcase == 'frame-ancestors'
            srcs = str.split(/\s+/)
            self.settings['checked_url']['noframe'] = true
          end
        end
      end
    end
    self.save
  end

  def self.complete(lesson, user, rating, feedback=nil, duration=nil)
    return false unless lesson && user
    lesson.settings['completions'] ||= []
    comp = lesson.settings['completions'].detect{|c| c['user_id'] == user.global_id }
    if comp
      comp['ts'] = Time.now.to_i
      comp['rating'] = rating
      comp['duration'] = duration if duration
    else
      comp = {'user_id' => user.global_id, 'ts' => Time.now.to_i, 'rating' => rating}
      comp['duration'] = duration if duration
      lesson.settings['completions'] << comp
    end
    if feedback && !feedback.blank?
      lesson.settings['feedback'] ||= []
      lesson.settings['feedback'] << {'user_id' => user.global_id, 'text' => feedback, 'ts' => Time.now.to_i}
    end
    lesson.save
    extra = UserExtra.find_or_create_by(user: user)
    extra.settings['completed_lessons'] ||= []
    comp = extra.settings['completed_lessons'].detect{|c| c['id'] == lesson.global_id }
    if comp
      comp['ts'] = Time.now.to_i
      comp['rating'] = rating
    else
      comp = {'id' => lesson.global_id, 'url' => lesson.settings['url'], 'ts' => Time.now.to_i, 'rating' => rating}
      comp['duration'] = duration if duration
      extra.settings['completed_lessons'] << comp
    end
    extra.save
  end

  def self.unassign(lesson, obj)
    return false unless lesson && obj
    lesson.settings['usages'] ||= []
    lesson.settings['usages'] = lesson.settings['usages'].select{|u| u['obj'] != Webhook.get_record_code(obj) }
    lesson.save
    if obj.is_a?(User)
      extra = UserExtra.find_or_create_by(user: obj)
      extra.settings['lessons'] ||= []
      extra.settings['lessons'] = extra.settings['lessons'].select{|l| l['id'] != lesson.global_id }
      extra.save
    elsif obj.is_a?(Organization)
      obj.settings['lessons'] ||= []
      obj.settings['lessons'] = obj.settings['lessons'].select{|l| l['id'] != lesson.global_id }
      obj.save
    elsif obj.is_a?(OrganizationUnit)
      # Rooms can only have one lesson running at a time
      obj.settings['lesson'] = nil if obj.settings['lesson'] && obj.settings['lesson']['id'] == lesson.global_id
      obj.save
    else
      return false
    end
    return true
  end

  def self.assign(lesson, obj, types=nil, assignee=nil)
    # TODO: make required, due date, past_cutoff part of assignment?
    return false unless lesson && obj
    lesson.settings['usages'] ||= []
    lesson.settings['usages'] << {'ts' => Time.now.to_i, 'obj' => Webhook.get_record_code(obj)}
    lesson.save
    if assignee
      ae = UserExtra.find_or_create_by(user: assignee)
      ae.settings['assignee_lessons'] ||= []
      ae.settings['assignee_lessons'] << {'id' => lesson.global_id, 'assigned' => Time.now.to_i}
      ae.settings['assignee_lessons'] = ae.settings['assignee_lessons'][0, 10]
      ae.settings['assignee_lessons'] = ae.settings['assignee_lessons'].select{|l| l['assigned'] > 14.months.ago.to_i }
      ae.save
    end
    user_ids = []
    if obj.is_a?(User)
      extra = UserExtra.find_or_create_by(user: obj)
      extra.settings['lessons'] ||= []
      extra.settings['lessons'] << {
        'id' => lesson.global_id,
        'assigned' => Time.now.to_i
      }
      extra.save
      user_ids << obj.global_id
    elsif obj.is_a?(Organization)
      obj.settings['lessons'] ||= []
      types = types || ['supervisor']
      obj.settings['lessons'] << {
        'id' => lesson.global_id,
        'assigned' => Time.now.to_i,
        'types' => types
      }
      if lesson.settings['required']
        if types.include?('supervisor')
          user_ids += obj.attached_users('supervisor').map(&:global_id)
        end
        if types.include?('manager')
          user_ids += obj.attached_users('manager').map(&:global_id)
        end
        if types.include?('user')
          user_ids += obj.attached_users('approved_user').map(&:global_id)
        end
      end
      obj.save
    elsif obj.is_a?(OrganizationUnit)
      # Rooms can only have one lesson running at a time
      types = types || ['supervisor']
      obj.settings['lesson'] = {
        'id' => lesson.global_id,
        'assigned' => Time.now.to_i,
        'types' => types
      }
      if lesson.settings['required']
        link_types = []
        link_types << 'org_unit_supervisor' if types.include?('supervisor')
        link_types << 'org_unit_supervisor' if types.include?('user')
        links = UserLink.links_for(obj).select{|l| link_types.include?(l['type']) }
        user_ids += links.map{|l| l['user_id'] }.uniq
      end
      obj.save
    else
      return false
    end
    UserMailer.schedule_delivery(:lesson_assigned, lesson.global_id, user_ids) if !user_ids.blank? && lesson.settings['required']
    return true
  end

  def history_check(obj)
    users, extras = load_users_and_extras(obj)
    self.settings['completions'] ||= []
    changed = false
    users.each do |user|
      if !self.settings['completions'].detect{|c| c['user_id'] == user.global_id }
        ue = extras.detect{|e| e.user_id == user.id}
        if ue && ue.settings
          (ue.settings['completed_lessons'] || []).each do |less|
            if less['id'] == self.global_id || less['url'] == self.settings['url']
              if !self.settings['past_cutoff'] || less['ts'] > (Time.now.to_i - self.settings['past_cutoff'])
                self.settings['completions'] << {
                  'user_id' => user.global_id,
                  'ts' => less['ts'],
                  'prior' => true,
                  'rating' => less['rating']
                }
                changed = true
              end
            end
          end
        end
      end
    end
    self.save if changed
    true
  end

  def self.decorate_completion(user, lessons_json)
    if user
      ue = UserExtra.find_by(user: user)
      completed_hash = {}
      rating_hash = {}
      if ue && ue.settings
        (ue.settings['completed_lessons'] || []).each do |comp|
          if comp['id'] && comp['ts']
            completed_hash[comp['id']] = [completed_hash[comp['id']] || 0, comp['ts']].max
            completed_hash[comp['url']] = [completed_hash[comp['url']] || 0, comp['ts']].max if comp['url']
            if comp['rating'] && comp['rating'] > 0
              rating_hash[comp['id']] = [rating_hash[comp['id']] || 0, comp['rating']].max
              rating_hash[comp['url']] = [rating_hash[comp['url']] || 0, comp['rating']].max if comp['url']
            end
          end
        end
      end
      lessons_json.each do |lesson|
        if completed_hash[lesson['id']] || completed_hash[lesson['url']]
          lesson['completed_ts'] = completed_hash[lesson['id']] || completed_hash[lesson['url']]
        end
        if rating_hash[lesson['id']]
          lesson['rating'] = rating_hash[lesson['id']]
        end
        if lesson['past_cutoff']
          cutoff = Time.now.to_i - lesson['past_cutoff']
          comp = [completed_hash[lesson['id']], completed_hash[lesson['url']]].compact.max
          lesson['completed'] = true if comp && comp > cutoff
        else
          lesson['completed'] = true if completed_hash[lesson['id']] || completed_hash[lesson['url']]
        end
      end
    end
    lessons_json
  end

  def process_params(params, non_user_params)
    self.settings ||= {}
    if non_user_params['target']
      self.organization_id = nil
      self.organization_unit_id = nil
      self.user_id = nil
      if non_user_params['target'].is_a?(Organization)
        self.organization_id = non_user_params['target'].id
      elsif non_user_params['target'].is_a?(OrganizationUnit)
        self.organization_unit_id = non_user_params['target'].id
      elsif non_user_params['target'].is_a?(User)
        self.user_id = non_user_params['target'].id
      end        
    end
    self.settings['author_id'] ||= non_user_params['author'].global_id
    self.settings['title'] = process_string(params['title']) if params['title']
    self.settings['description'] = process_string(params['description']) if params['description']
    if params['url']
      self.settings['url'] = Lesson.normalize_lesson_embed_url(process_string(params['url']))
    end
    self.settings['required'] = process_boolean(params['required']) if params['required']
    if params.key?('due_at')
      self.settings['due_at'] = params['due_at'].present? ? Time.parse(params['due_at'].to_s).iso8601 : nil
    end
    self.settings['time_estimate'] = params['time_estimate'].to_i
    self.settings['time_estimate'] = nil if self.settings['time_estimate'] == 0
    self.settings['past_cutoff'] = params['past_cutoff'].to_i
    self.settings['past_cutoff'] = nil if self.settings['past_cutoff'] == 0
    self.settings['state'] = process_string(params['state'])
    if params['badge']
      self.settings['badge'] = params['badge']
    end
    true
  end

  def launch_url
    Lesson.normalize_lesson_embed_url(self.settings['url'])
  end
  
end
