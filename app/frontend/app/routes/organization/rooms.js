import Route from '@ember/routing/route';

export default Route.extend({
  model: function() {
    var model = this.modelFor('organization');
    return model;
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    /* BOTH OF THESE ARE MANAGER-ONLY and were being fired for everyone. `units#index`
       (api/units_controller.rb:6) and `organizations#users` (api/organizations_controller.rb:19)
       each begin with `allowed?(org, 'edit')`, and that helper renders **400**, not 403
       (application_controller.rb:300) -- which is why an org-unit SUPERVISOR opening this page
       saw three 400s in the console and "There was an unexpected problem loading rooms".
       A supervisor does not need them: their own rooms are already on the user record as
       `supervised_units`, which is what the rail and the Modern Rooms card both read. So the
       requests are made only by someone who can actually make them, and the controller falls
       back to that list for everyone else. */
    /* CLEARED FIRST, ON EVERY ENTRY. Picking a different organisation in the picker is a
       transition to this same route with the parent's `:id` changed, which re-runs the parent
       model hook and this `setupController` -- but the controller INSTANCE is reused, so
       whatever `units` held for the previous org is still sitting there. Without this reset a
       manager switching orgs would see the old org's rooms until the new request came back,
       and a manager switching to an org they only supervise would keep seeing the old list
       entirely, since the branch below never touches `units` for them.
       Everything else on this page derives from `model.id` and invalidates on its own. */
    controller.set('units', null);
    if(model && model.get('permissions.edit')) {
      controller.refresh_units();
      model.load_users();
    }
  }
});
