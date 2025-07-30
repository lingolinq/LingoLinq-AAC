unless ENV['SKIP_VALIDATIONS']
  module Readline
    alias :old_readline :readline
    def readline(*args)
      ln = old_readline(*args)
      puts "#{ENV['USER_KEY']} entered: #{ln}"
      if Rails.env.production?
        AuditEvent.log_command(ENV['USER_KEY'], 'type' => 'rails/console', 'command' => ln)
      end
      ln
    end
  end

  command = defined?(ARGV_COMMAND) ? ARGV_COMMAND : "server"
   # Custom LingoLinq code...
  raise "not allowed, HIPAA-style" if ['db', 'dbconsole'].include?(command) && Rails.env.production?
  if !ENV['USER_KEY'] && ['runner', 'r', 'console', 'c'].include?(command)
    raise "need ENV['USER_KEY'] for console logging with \"#{INIT_ARGS.join(' ')}\""
  end
  if ENV['USER_KEY']
    PaperTrail.request.whodunnit = "admin:#{ENV['USER_KEY']}"
  end
  
  if ['r', 'runner'].include?(command)
    AuditEvent.log_command(ENV['USER_KEY'], 'type' => 'rails/runner', 'command' => INIT_ARGS.join(" "))
  end
  # TODO: log any script/runner calls, any console statements
end

