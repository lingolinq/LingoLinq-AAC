require 'permissable'

module Permissions
  extend ActiveSupport::Concern
  include Permissable::InstanceMethods

  # The cached permission set MUST NOT be shared between a valet session and an
  # ordinary one.
  #
  # Permissable keys the cache on `user.cache_key` (id + updated_at) plus the
  # scopes — and `valet_mode?` is a transient per-instance flag that appears in
  # neither. But nearly every rule in User is guarded by `&& !user.valet_mode?`,
  # so the two produce very different answers and whichever ran first won the
  # slot for 30 minutes. Observed in the benign direction (a valet-mode
  # computation denying a supervisor `model`/`supervise` over their own
  # communicators, so ordinary requests then 400'd); the inverse is privilege
  # escalation — a valet session reading the full set cached by a normal one.
  #
  # Folding it into the scopes is what puts it in the key. No rule declares a
  # 'valet' scope, and a scope match needs only one intersection hit, so this
  # partitions the cache without altering what any rule grants.
  #
  # Stripping '*' first also collapses a duplicate-key bug: Permissable#allows?
  # appends '*' and then hands the already-appended array to #permissions_for,
  # which appends it AGAIN — so `allows?` read `scopes_full,*,*` while a direct
  # `permissions_for` read `scopes_full,*`. Two entries for one question, free to
  # disagree indefinitely, because a correct value computed via one path never
  # repaired the other. (17k+ permission keys in dev, roughly double.)
  def permissions_for(user, relevant_scopes=nil)
    relevant_scopes ||= user.permission_scopes if user && user.respond_to?(:permission_scopes)
    relevant_scopes ||= self.class.default_permission_scopes
    relevant_scopes = relevant_scopes - ['*']
    # 'none' is a sentinel Permissable compares by equality; leave it exactly as-is.
    if relevant_scopes != ['none'] && user.respond_to?(:valet_mode?) && user.valet_mode?
      relevant_scopes = relevant_scopes + ['valet']
    end
    super(user, relevant_scopes)
  end

  # TODO: remove this once you fold it into permissable and update the gem
  def set_cached(prefix, data, expires=nil)
    return false if ENV['STOP_CACHING']
    expires ||= 1800 # 30 minutes
    begin
      Permissable.permissions_redis.setex(self.cache_key(prefix), expires, data.to_json)
    rescue Redis::CommandError => e
      if e.to_s.match(/OOM/)
        # don't break on out-of-memory errors
      else
        raise e
      end
    end
  end

  def self.setex(redis, key, timeout, value, required=false)
    return false if ENV['STOP_CACHING']
    begin
      redis.setex(key, timeout, value)
    rescue Redis::CommandError => e
      raise e unless e.to_s.match(/OOM/) && !required
    end
  end
  
  module ClassMethods
    include Permissable::ClassMethods
  end
end