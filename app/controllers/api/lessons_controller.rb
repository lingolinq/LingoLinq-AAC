class Api::LessonsController < ApplicationController
  before_action :require_api_token, :except => [:index, :show, :complete]
  def index
    user = nil
    if params['user_id']
      user = User.find_by_path(params['user_id'])
      return unless allowed?(user, 'supervise')
    end 
    lessons = Lesson.all
    # When a user has no assigned lessons, see if there are some
    # public lessons that they haven't taken yet that they can review
    obj = nil
    if params['organization_id']
      org = Organization.find_by_path(params['organization_id'])
      return unless exists?(org, params['organization_id'])
      return unless allowed?(org, 'edit')
      obj = org
      lessons = Lesson.where(id: Lesson.local_ids((org.settings['lessons'] || []).map{|l| l['id'] }))
    elsif params['organization_unit_id']
      unit = OrganizationUnit.find_by_path(params['organization_unit_id'])
      return unless exists?(unit, params['organization_unit_id'])
      return unless allowed?(unit, 'edit')
      obj = unit
      lessons = Lesson.where(id: Lesson.local_ids([(unit.settings['lesson'] || {})['id']]))
    else
      lessons = lessons.where(public: true)
    end
    completed_hash = {}
    if params['active']
    elsif params['concluded']
    end
    if params['history_check'] && obj
      lessons.each{|lesson| lesson.history_check(obj) }
    end
    lessons = lessons.order('id DESC')
    json = JsonApi::Lesson.paginate(params, lessons, {obj: obj})
    json['lesson'] = Lesson.decorate_completion(user, json['lesson']) if user
    render json: json
  end

  def create
    lesson_data = params['lesson']
    lesson_data = lesson_data.permit! if lesson_data.is_a?(ActionController::Parameters)
    initial_target = nil
    if lesson_data['organization_id']
      org = Organization.find_by_path(lesson_data['organization_id'])
      return unless exists?(org, lesson_data['organization_id'])
      return unless allowed?(org, 'edit')
      initial_target = org
    elsif lesson_data['organization_unit_id']
      unit = OrganizationUnit.find_by_path(lesson_data['organization_unit_id'])
      return unless exists?(unit, lesson_data['organization_unit_id'])
      return unless allowed?(unit, 'edit')
      initial_target = unit
    elsif lesson_data['user_id']
      user = User.find_by_path(lesson_data['user_id'])
      return unless exists?(user, lesson_data['user_id'])
      return unless allowed?(user, 'supervise')
      initial_target = user
    else
      return allowed?(@api_user, 'never_allow')
    end
    lesson = Lesson.process_new(lesson_data, {'author' => @api_user, 'target' => initial_target})
    Lesson.assign(lesson, initial_target, lesson_data['target_types'], @api_user) if initial_target
    render json: JsonApi::Lesson.as_json(lesson, {wrapper: true, permissions: @api_user})
  end

  def recent
    # List of lessons recently authored by the user or their org or unit

  end

  def show
    lesson_id, lesson_code, user_token = params['id'].split(/:/)
    lesson = Lesson.find_by_path(lesson_id)
    return unless exists?(lesson, lesson_id)
    return unless lesson.nonce == lesson_code || allowed?(lesson, 'view')
    user = User.find_by_token(user_token)
    render json: JsonApi::Lesson.as_json(lesson, {wrapper: true, permissions: @api_user, extra_user: user})
  end

  def update
    lesson = Lesson.find_by_path(params['id'])
    return unless exists?(lesson, params['id'])
    return unless allowed?(lesson, 'edit')
    lesson_update = params['lesson']
    lesson_update = lesson_update.permit! if lesson_update.is_a?(ActionController::Parameters)
    lesson.process(lesson_update, {'author' => @api_user})
    render json: JsonApi::Lesson.as_json(lesson, {wrapper: true, permissions: @api_user})
  end

  def complete
    lesson_id, lesson_code, user_token = params['lesson_id'].split(/:/)
    lesson = Lesson.find_by_path(lesson_id)
    return unless exists?(lesson, lesson_id)
    if lesson.settings['nonce'] != lesson_code
      return allowed?(lesson, 'never_allow')
    end
    user = User.find_by_token(user_token)
    return unless exists?(user, user_token)

    Lesson.complete(lesson, user, params['rating'].to_i, nil, params['duration'].to_i)

    render json: JsonApi::Lesson.as_json(lesson, {wrapper: true, extra_user: user, permissions: user})
  end

  def assign
    lesson = Lesson.find_by_path(params['lesson_id'])
    return unless exists?(lesson, params['lesson_id'])
    return unless allowed?(lesson, 'view')
    if params['user_id']
      user = User.find_by_path(params['user_id'])
      return unless exists?(user, params['user_id'])
      return unless allowed?(user, 'supervise')
      Lesson.assign(lesson, user, nil, @api_user)
    elsif params['organization_id']
      org = Organization.find_by_path(params['organization_id'])
      return unless exists?(org, params['organization_id'])
      return unless allowed?(org, 'edit')
      Lesson.assign(lesson, org, nil, @api_user)
    elsif params['organization_unit_id']
      unit = OrganizationUnit.find_by_path(params['organization_unit_id'])
      return unless exists?(unit, params['organization_unit_id'])
      return unless allowed?(unit, 'edit')
      Lesson.assign(lesson, unit, nil, @api_user)
    else
      return api_error(400, {error: 'no target specified'})
    end
    render json: JsonApi::Lesson.as_json(lesson, {wrapper: true, permissions: @api_user})
  end

  def unassign
    lesson = Lesson.find_by_path(params['lesson_id'])
    return unless exists?(lesson, params['lesson_id'])
    return unless allowed?(lesson, 'view')
    if params['user_id']
      user = User.find_by_path(params['user_id'])
      return unless exists?(user, params['user_id'])
      return unless allowed?(user, 'supervise')
      Lesson.unassign(lesson, user)
    elsif params['organization_id']
      org = Organization.find_by_path(params['organization_id'])
      return unless exists?(org, params['organization_id'])
      return unless allowed?(org, 'edit')
      Lesson.unassign(lesson, org)
    elsif params['organization_unit_id']
      unit = OrganizationUnit.find_by_path(params['organization_unit_id'])
      return unless exists?(unit, params['organization_unit_id'])
      return unless allowed?(unit, 'edit')
      Lesson.unassign(lesson, unit)
    else
      return api_error(400, {error: 'no target specified'})
    end
    render json: JsonApi::Lesson.as_json(lesson, {wrapper: true, permissions: @api_user})
  end

  def destroy
    lesson = Lesson.find_by_path(params['lesson_id'])
    return unless exists?(lesson, params['lesson_id'])
    return unless authorized?(lesson, 'delete')
    render json: JsonApi::Lesson.as_json(lesson, {wrapper: true, permissions: @api_user})
  end
end
