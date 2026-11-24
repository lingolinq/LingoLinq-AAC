require 'spec_helper'

# A failed Resque job otherwise leaves no Rails log line (Resque logs through its own quiet
# logger and keeps the failure in Redis), so a log-based alert cannot see failed mail.
describe JobFailureLog do
  before { allow(Rails.logger).to receive(:error) }

  it "is a failure hook Resque runs for both job classes" do
    expect(Resque::Plugin.failure_hooks(Worker)).to include('on_failure_log')
    expect(Resque::Plugin.failure_hooks(SlowWorker)).to include('on_failure_log')
  end

  it "logs a failed mail job by class, method, mail type and error class only" do
    err = StandardError.new('bob@example.com rejected for 1_5')
    job = Resque::Job.new('priority', {'class' => 'Worker', 'args' => ['UserMailer', 'deliver_message', 'forgot_password', ['1_5']]})
    allow(Resque::Failure).to receive(:create)

    job.fail(err)

    expect(Rails.logger).to have_received(:error).with('[job failed] UserMailer . deliver_message (forgot_password) StandardError').once
    expect(Rails.logger).not_to have_received(:error).with(/@|1_5/)
  end

  it "logs a slow job the same way, without a mail type" do
    job = Resque::Job.new('slow', {'class' => 'SlowWorker', 'args' => ['Board', 'refresh_stats', {'id' => '1_9', 'method' => 'refresh_stats'}]})
    allow(Resque::Failure).to receive(:create)

    job.fail(ArgumentError.new('bad'))

    expect(Rails.logger).to have_received(:error).with('[job failed] Board . refresh_stats ArgumentError').once
  end

  it "names anything not shaped like a class or method as unknown" do
    Worker.on_failure_log(RuntimeError.new('x'), 'not a class; rm -rf', {'a' => 1})
    expect(Rails.logger).to have_received(:error).with('[job failed] unknown . unknown RuntimeError').once
  end

  it "never raises out of the hook" do
    allow(Rails.logger).to receive(:error).and_raise(IOError)
    expect { Worker.on_failure_log(RuntimeError.new('x'), 'UserMailer', 'deliver_message') }.not_to raise_error
  end
end
