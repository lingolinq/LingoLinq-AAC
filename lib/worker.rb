module Worker
  @queue = :default
  extend BoyBand::WorkerMethods

  def self.method_stats(queue='default')
    list = Worker.scheduled_actions(queue); list.length
    methods = {}
    list.each do |job|
      code = (job['args'][0] || 'Unknown') + "." + (job['args'][2]['method'] || 'unknown') rescue 'error'
      methods[code] = (methods[code] || 0) + 1
    end; list.length
    puts JSON.pretty_generate(methods.to_a.sort_by(&:last))
    methods
  end

  def self.record_ids(queue='default', method_name)
    list = Worker.scheduled_actions(queue); list.length
    classes = {}
    list.each do |job|
      method = (job['args'][2]['method'] || 'unknown') rescue 'error'
      if method == method_name
        id = job['args'][2]['id'] rescue nil
        class_name = job['args'][0]
        if id && class_name
          classes[class_name] ||= []
          classes[class_name] << id
        end
      end
    end; list.length
    classes.each do |class_name, ids|
      puts class_name
      puts ids.join(',')
    end
    classes
  end

  def self.user_board_counts(queue, method_name, cutoff=25)
    hash = record_ids(queue, method_name)
    puts "found #{(hash['Board'] || []).length}"
    user_id = Board.arel_table[:user_id]
    Board.where(id: hash['Board'])
         .group(:user_id)
         .having(user_id.count.gt(cutoff))
         .count(:user_id)
  end

  def self.process_queues
    RemoteAction.process_all
    super
  end

  def self.find_record(klass, id)
    obj = klass.find_by(id: id)
    ApplicationRecord.using(:master) do
      obj = obj.reload if obj
    end
    obj
  end

  def self.domain_id
    JsonApi::Json.current_host || 'default'
  end

  def note_job(hash)
    # no-op
  end

  def clear_job(hash)
    # no-op
  end

  def self.prune_jobs(queue, method)
    prunes = 0
    dos = []
    while Resque.size(queue) > 0 && (prunes + dos.length) < 100000
      job = Resque.pop(queue)
      if job
        is_match = job['args'] && job['args'][2] && job['args'][2]['method'] == method rescue nil
        if is_match
          prunes += 1
        else
          dos.push(job)
        end
      end
    end
    dos.each{|job| Resque.enqueue(queue == 'slow' ? SlowWorker : Worker, *job['args']) }; dos.length
    prunes
  end

  def self.check_for_big_entries
    lists = [[RedisInit.default, "RedisInit.default", 10000], [RedisInit.permissions, "RedisInit.permissions", 15000], [Resque.redis, "Resque.redis", 10000]]
    bigs = []
    lists.each do |queue, name, cutoff|
      name ||= queue.inspect
      puts name
      queue.keys.each do |key|
        type = queue.type(key)
        str = ""
        if type == 'set'
          str = queue.smembers(key).to_json
        elsif type == 'list'
          str = queue.lrange(key, 0, -1).to_json
        elsif type == 'hash'
          str = queue.hgetall(key).to_json
        elsif type == 'string'
          str = queue.get(key)
        elsif type == 'none'
        else
          puts "  UNKNOWN TYPE #{type}"
        end
        if str.length > cutoff
          puts "  #{str.length} #{key} #{name}\n"
          bigs << "#{key}-#{name}"
        end
      end
    end
    bigs
  end

  def self.set_domain_id(val)
    @@domain_id = val
    JsonApi::Json.set_host(val)
    JsonApi::Json.load_domain(val)
  end

  def self.requeue_failed(method)
    count = Resque::Failure.count
    count.times do |i|
      Resque::Failure.requeue(i)
    end
    count.times do |i|
      Resque::Failure.remove(0)
    end
  end
end

