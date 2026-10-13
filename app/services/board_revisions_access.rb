# Which boards in a user's synced tree (Api::UsersController#board_revisions) the user can view now.
#
# allows?(user, 'view') reads the user's cached available_private_board_ids and a 30-minute
# permission cache, both rebuilt lazily (minutes to hours after a share change), so a board just
# shared reads as hidden and one just unshared as viewable. Another user's private board is
# decided here instead: owned by or shared with the user, their supervisees or their supervisees'
# supervisees (as in board_caching#update_available_boards), or its owner grants the user model
# or edit permission (board.rb add_permissions). Stale caches never decide either way.
#
# Read-only, for a sync GET: each user's shared-board set is computed once per request and never
# stored (all_shared_board_ids_for store: false), since storing it takes that user's row lock and
# writes a versioned settings save, once per user in the caseload. A per-board shared_with? would
# also rebuild that set once per board while it is stale. The owner-permission fallback depends
# only on the owner, so it is checked once per owner.
class BoardRevisionsAccess
  def initialize(user)
    @user = user
    @owner_grants = {}
  end

  def viewable?(board)
    return true if access[:owner_ids].include?(board.user_id) || access[:shared_ids].include?(board.global_id)
    owner_grants?(board.user)
  end

  private

  def access
    @access ||= begin
      users = [@user]
      @user.supervisees.each do |sup|
        users << sup
        users += sup.supervisees
      end
      users = users.uniq(&:id)
      {
        owner_ids: users.map(&:id),
        shared_ids: users.map{|u| Board.all_shared_board_ids_for(u, false, false, store: false) }.flatten.compact.to_set
      }
    end
  end

  def owner_grants?(owner)
    return false unless owner
    return @owner_grants[owner.id] if @owner_grants.key?(owner.id)
    @owner_grants[owner.id] = !!(owner.allows?(@user, 'model') || owner.allows?(@user, 'edit'))
  end
end
