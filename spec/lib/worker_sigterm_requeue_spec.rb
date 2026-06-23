require 'spec_helper'

# Locks in the SIGTERM requeue safety net relied on by the Cloud Run cutover
# (tracker 4.W1). When a worker-pool instance is replaced, Cloud Run sends
# SIGTERM and SIGKILLs after a FIXED, unconfigurable 10s grace, so any
# long-running slow-queue job WILL be interrupted. Resque (with TERM_CHILD)
# raises Resque::TermException in the interrupted child; BoyBand::WorkerMethods
# #perform_at must rescue it and re-enqueue the job rather than drop it. This
# spec guards that behavior so a future boy_band bump cannot silently regress
# it into lost background work.
describe 'worker SIGTERM requeue safety net' do
  # A representative slow-queue job class+method (see app/models/remote_action.rb,
  # board.rb -> Board(Set) recompute work on the :slow queue).
  let(:job_args) { ['BoardDownstreamButtonSet', 'update_for', '1_2', true] }

  it 're-enqueues a slow-queue job interrupted by SIGTERM instead of dropping it' do
    expect(BoardDownstreamButtonSet).to receive(:update_for)
      .with('1_2', true)
      .and_raise(Resque::TermException.new('SIGTERM'))
    # SlowWorker.perform delegates to Worker.perform_at(:slow, ...), so the
    # rescue's `self` is Worker: the interrupted slow job re-enqueues onto the
    # Worker (default) queue. The important guarantee is that it re-enqueues at
    # all (no lost work), not which queue it lands on.
    expect(Resque).to receive(:enqueue).with(Worker, *job_args)

    SlowWorker.perform(*job_args)
  end

  it 're-enqueues a default-queue job interrupted by SIGTERM instead of dropping it' do
    expect(BoardDownstreamButtonSet).to receive(:update_for)
      .with('1_2', true)
      .and_raise(Resque::TermException.new('SIGTERM'))
    expect(Resque).to receive(:enqueue).with(Worker, *job_args)

    Worker.perform(*job_args)
  end

  it 'does NOT requeue when the job completes normally (no spurious re-run)' do
    expect(BoardDownstreamButtonSet).to receive(:update_for).with('1_2', true).and_return(true)
    expect(Resque).not_to receive(:enqueue)

    Worker.perform(*job_args)
  end

  it 'preserves trailing domain:: / chain:: routing args on requeue' do
    # Real jobs carry appended domain::/chain:: markers; perform_at strips them
    # from the dispatch args but the requeue must re-enqueue the ORIGINAL args so
    # the marker context survives the interrupt.
    full_args = ['BoardDownstreamButtonSet', 'update_for', '1_2', true, 'domain::1_5', 'chain::abc']
    expect(BoardDownstreamButtonSet).to receive(:update_for)
      .with('1_2', true)
      .and_raise(Resque::TermException.new('SIGTERM'))
    expect(Resque).to receive(:enqueue).with(Worker, *full_args)

    Worker.perform(*full_args)
  end
end
