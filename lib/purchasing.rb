require 'stripe'

module Purchasing
  def self.subscription_event(request)
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    Stripe.api_version = '2022-08-01'
    json = JSON.parse(request.body.read) rescue nil
    event_id = json && json['id']
    event = event_id && Stripe::Event.retrieve(event_id) rescue nil
    if !event || !event['type']
      return {:data => {:error => "invalid parameters", :event_id => event_id}, :status => event_id ? 200 : 400}
    end
    data = {:valid => false, :type => event['type'], :event_id => event_id}
    object = event['data'] && event['data']['object']
    previous = event['data'] && event['data']['previous_attributes']
    event_result = nil
    if object
      if object && object['metadata'] && object['metadata']['type'] == 'extras' && (((object['metadata'] || {})['platform_source'] || 'lingolinq') == 'lingolinq')
        data = {:extras => true, :purchase_id => object['id'], :valid => true}
        if event['type'] == 'charge.succeeded'
          if object['metadata'] && (object['metadata']['purchased_symbols'] == 'true' || object['metadata']['purchased_supporters'].to_i > 0)
            User.schedule(:purchase_extras, {
              'user_id' => object['metadata'] && object['metadata']['user_id'],
              'purchase_id' => object['id'],
              'premium_symbols' => object['metadata'] && object['metadata']['purchased_symbols'] == 'true',
              'premium_supporters' => object['metadata'] && object['metadata']['purchased_supporters'].to_i,
              'customer_id' => object['customer'],
              'source' => 'charge.succeeded',
              'notify' => true
            })
          end
        else
          data[:valid] = false
        end
      else
        if event['type'] == 'charge.succeeded' && (((object['metadata'] || {})['platform_source'] || 'lingolinq') == 'lingolinq')
          valid = object['metadata'] && object['metadata']['user_id'] && object['metadata']['plan_id']
          if valid
            time = 5.years.to_i
            User.schedule(:subscription_event, {
              'purchase' => true,
              'user_id' => object['metadata'] && object['metadata']['user_id'],
              'purchase_id' => object['id'],
              'customer_id' => object['customer'],
              'plan_id' => object['metadata'] && object['metadata']['plan_id'],
              'seconds_to_add' => time,
              'source_id' => 'stripe',
              'source' => 'charge.succeeded'
            })
            if object['metadata'] && (object['metadata']['purchased_symbols'] == 'true' || object['metadata']['purchased_supporters'].to_i > 0)
              User.schedule(:purchase_extras, {
                'user_id' =>  object['metadata'] && object['metadata']['user_id'],
                'customer_id' => object['customer'],
                'purchase_id' => object['id'],
                'premium_symbols' => object['metadata']['purchased_symbols'] == 'true',
                'premium_supporters' => object['metadata']['purchased_supporters'].to_i,
                'source' => 'charge.succeeded',
                'notify' => false
              })
            end
          end
          if object['customer'] && object['customer'] != 'free'
            customer = Stripe::Customer.retrieve({id: object['customer']})
            valid = customer && customer['metadata'] && customer['metadata']['user_id']
            if valid
              User.schedule(:subscription_event, {
                'user_id' => customer['metadata'] && customer['metadata']['user_id'],
                'purchase_succeeded' => true,
                'source_id' => 'stripe',
                'source' => 'charge.succeeded'
              })
            end
          end
          data = {:purchase => true, :purchase_id => object['id'], :valid => !!valid}
        elsif event['type'] == 'charge.failed' && (((object['metadata'] || {})['platform_source'] || 'lingolinq') == 'lingolinq')
          valid = false
          if object['customer'] && object['customer'] != 'free'
            customer = Stripe::Customer.retrieve({id: object['customer']})
            valid = customer && customer['metadata'] && customer['metadata']['user_id']

            if valid
              User.schedule(:subscription_event, {
                'user_id' => customer['metadata'] && customer['metadata']['user_id'],
                'purchase_failed' => true,
                'source_id' => 'stripe',
                'source' => 'charge.failed'
              })
            end
          end
          data = {:purchase => false, :notified => true, :valid => !!valid}
        elsif event['type'] == 'charge.dispute.created'
          charge = Stripe::Charge.retrieve(object['id'])
          if charge
            valid = charge['metadata'] && charge['metadata']['user_id']
            if valid
              User.schedule(:subscription_event, {
                'user_id' => charge['metadata'] && charge['metadata']['user_id'],
                'chargeback_created' => true,
                'source_id' => 'stripe',
                'source' => 'charge.dispute.created'
              })
            end
            data = {:dispute => true, :notified => true, :valid => !!valid}
          end
        elsif event['type'] == 'customer.updated'
          customer = Stripe::Customer.retrieve({id: object['id']})
          valid = customer && customer['metadata'] && customer['metadata']['user_id']
          previous = event['data'] && event['data']['previous_attributes'] && event['data']['previous_attributes']['metadata'] && event['data']['previous_attributes']['metadata']['user_id']
          if valid && previous
            prior_user = User.find_by_global_id(previous)
            new_user = User.find_by_global_id(valid)
            if prior_user && new_user && prior_user.settings['subscription'] && prior_user.settings['subscription']['customer_id'] == object['id']
              prior_user.transfer_subscription_to(new_user, true)
            end
          end
        elsif event['type'] == 'customer.subscription.created' && (((object['metadata'] || {})['platform_source'] || 'lingolinq') == 'lingolinq')
          customer = Stripe::Customer.retrieve({id: object['customer']})
          valid = customer && customer['metadata'] && customer['metadata']['user_id'] && object['plan'] && object['plan']['id']
          if valid
            User.schedule(:subscription_event, {
              'subscribe' => true,
              'user_id' => customer['metadata'] && customer['metadata']['user_id'],
              'purchased_supporters' => object['metadata'] && object['metadata']['purchased_supporters'],
              'customer_id' => object['customer'],
              'subscription_id' => object['id'],
              'plan_id' => object['plan'] && object['plan']['id'],
              'source_id' => 'stripe',
              'cancel_others_on_update' => true,
              'source' => 'customer.subscription.created'
            })
          end
          data = {:subscribe => true, :valid => !!valid}
        elsif event['type'] == 'customer.subscription.updated' && (((object['metadata'] || {})['platform_source'] || 'lingolinq') == 'lingolinq')
          customer = Stripe::Customer.retrieve({id: object['customer']})
          valid = customer && customer['metadata'] && customer['metadata']['user_id']
          if object['status'] == 'unpaid' || object['status'] == 'canceled'
            if previous && previous['status'] && previous['status'] != 'unpaid' && previous['status'] != 'canceled'
              if valid
                reason = 'Monthly payment unpaid' if object['status'] == 'unpaid'
                reason = 'Canceled by purchasing system' if object['status'] == 'canceled'
                User.schedule(:subscription_event, {
                  'unsubscribe' => true,
                  'user_id' => customer['metadata'] && customer['metadata']['user_id'],
                  'reason' => reason,
                  'customer_id' => object['customer'],
                  'subscription_id' => object['id'],
                  'source_id' => 'stripe',
                  'cancel_others_on_update' => false,
                  'source' => 'customer.subscription.updated'
                })
              end
              data = {:unsubscribe => true, :valid => !!valid}
            end
          elsif object['status'] == 'past_due'
            # Subscription needs attention
            if previous && previous['status'] && previous['status'] != 'past_due'
              if valid
                SubscriptionMailer.schedule_delivery(:purchase_bounced, customer['metadata'] && customer['metadata']['user_id'])
              end
            end
          elsif object['status'] == 'active' || object['status'] == 'trialing'
            if valid
              User.schedule(:subscription_event, {
                'subscribe' => true,
                'user_id' => customer['metadata'] && customer['metadata']['user_id'],
                'purchased_supporters' => object['metadata'] && object['metadata']['purchased_supporters'],
                'customer_id' => object['customer'],
                'subscription_id' => object['id'],
                'plan_id' => object['plan'] && object['plan']['id'],
                'source_id' => 'stripe',
                'cancel_others_on_update' => true,
                'source' => 'customer.subscription.updated'
              })
            end
            data = {:subscribe => true, :valid => !!valid}
          end
        elsif event['type'] == 'customer.subscription.deleted' && (((object['metadata'] || {})['platform_source'] || 'lingolinq') == 'lingolinq')
          customer = Stripe::Customer.retrieve({id: object['customer']})
          valid = customer && customer['metadata'] && customer['metadata']['user_id']
          if valid
            User.schedule(:subscription_event, {
              'unsubscribe' => true,
              'reason' => 'Deleted by purchasing system',
              'user_id' => customer['metadata'] && customer['metadata']['user_id'],
              'customer_id' => object['customer'],
              'source_id' => 'stripe',
              'subscription_id' => object['id'],
              'source' => 'customer.subscription.deleted'
            })
          end
          data = {:unsubscribe => true, :valid => !!valid}
        elsif event['type'] == 'checkout.session.completed'
          # checkout_session.payment_status == 'paid'
          # call Purchasing2.confirm_purchase
          # else, wait for async event
        elsif event['type'] == 'checkout.session.async_payment_succeeded'
          # finalize payment as totally approved
        elsif event['type'] == 'checkout.session.async_payment_failed'
          # email admins about payment error
        elsif event['type'] == 'ping'
          data = {:ping => true, :valid => true}
        end
      end
    end
    {:data => data, :status => 200}
  end
  
  def self.add_token_summary(token)
    return token unless token.is_a?(Hash)
    token['summary'] = "Unknown Card"
    brand = token['card'] && token['card']['brand']
    last4 = token['card'] && token['card']['last4']
    exp_year = token['card'] && token['card']['exp_year']
    exp_month = token['card'] && token['card']['exp_month']
    if brand && last4
      token['summary'] = brand + " card ending in " + last4
      if exp_year && exp_month
        token['summary'] += " (exp #{exp_month}/#{exp_year})"
      end
    end
    token['summary']
  end

  def self.extras_symbols_cost
    ENV['EXTRAS_COST'] || 25
  end

  def self.extras_supporter_cost
    ENV['EXTRAS_SUPPORTER_COST'] || 25
  end

  def self.communicator_cost
    ENV['COMMUNICATOR_COST'] || 200
  end

  def self.communicator_sale_cost
    ENV['COMMUNICATOR_SALE_COST'] || 100
  end

  def self.communicator_repurchase_cost
    ENV['COMMUNICATOR_REPURCHASE_COST'] || 50
  end

  def self.plan_map
    {
      'monthly_9' => "price_1NQzXZBoyWVHHEVPoaYXBeyy",
      'monthly_6' => "price_1NQzXZBoyWVHHEVPoaYXBeyy"
    }
  end

  def self.purchase(user, token, type, discount_code=nil)
    user && user.log_subscription_event({:log => 'purchase initiated', :token => "#{token['id'][0,3]}..#{token['id'][-3,3]}", :type => type})
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    if type.match(/^slp_/) && type.match(/free/)
      if type.match(/plus_extras/)
        type = 'slp_long_term_free_plus_extras'
      else
        user.update_subscription({
          'subscribe' => true,
          'subscription_id' => 'free',
          'customer_id' => 'free',
          'plan_id' => 'slp_monthly_free'
        })
        Purchasing.cancel_other_subscriptions(user, 'all')
        return {success: true, type: type}
      end
    elsif type == 'long_term_ios' || type == 'monthly_ios' || type == 'eval_long_term_ios' || type == 'slp_long_term_ios'
      valid = false
      hash = user.subscription_hash
      if user.settings['subscription']['plan_id'] == type || user.settings['subscription']['last_purchase_plan_id'] == type
        return {success: true, type: type}
      else
        return {success: false, error: true, type: type, error_message: "subscription type did not match expected value, #{hash['plan_id'] || user.settings['subscription']['plan_id'] || user.settings['subscription']['last_purchase_plan_id'] || 'none'} but expecting #{type}"}
      end
    end
    user && user.log_subscription_event({:log => 'paid subscription'})
    amount = type.sub(/_plus_trial/, '').sub(/_plus_extras/, '').sub(/_plus_\d+_supporters/, '').split(/_/)[-1].to_i
    
    if type.match(/slp_long_term|eval_long_term/) && amount > 0 && [:premium_supporter, :eval_communicator].include?(user.billing_state) && !((user.settings['subscription'] || {})['last_purchase_plan_id'] || 'free').match(/free/)
      # If already purchased the little account, don't re-charge
      amount = 0
    end
    include_extras = type.match(/plus_extras/)
    include_n_supporters = (type.match(/plus_(\d+)_supporters/) || [])[1].to_i
    extras_added = false
    valid_amount = true
    description = type
    if type.match(/^slp_monthly/)
      valid_amount = false
      description = "LingoLinq supporter account"
    elsif type.match(/^slp_long_term/)
      valid_amount = false unless amount >= Purchasing.extras_supporter_cost
      if type.match(/free/)
        amount = 0
        valid_amount = true
      end
      description = "LingoLinq supporter account"
    elsif type.match(/^eval_long_term/)
      valid_amount = false unless amount >= Purchasing.extras_supporter_cost
      description = "LingoLinq evaluator account"
    elsif type.match(/^monthly/)
      valid_amount = false unless amount >= 6
      description = "LingoLinq communicator monthly subscription"
    elsif type.match(/^long_term/)
      if user.communicator_role? && user.fully_purchased? && !user.eval_account?
        valid_amount = false unless amount >= Purchasing.communicator_repurchase_cost
        amount = [145, amount].min
        description = "LingoLinq cloud extras re-purchase"
        type = 'refresh_' + type
      else
        valid_amount = false unless amount >= Purchasing.communicator_cost
        valid_amount = true if amount >= Purchasing.communicator_sale_cost && self.active_sale?
        description = "LingoLinq communicator license purchase"
      end
    else
      return {success: false, error: "unrecognized purchase type, #{type}"}
    end
    if !valid_amount
      user && user.log_subscription_event({:error => true, :log => 'invalid_amount'})
      return {success: false, error: "#{amount} not valid for type #{type}"}
    end
    plan_id = type.sub(/_plus_trial/, '').sub(/_plus_extras/, '').sub(/_plus_\d+_supporters/, '')
    add_token_summary(token)
    begin
      if type.match(/long_term/)
        user && user.log_subscription_event({:log => 'long-term - creating charge'})
        if discount_code
          gift = GiftPurchase.find_by_code(discount_code) rescue nil
          return {success: false, error: "Invalid gift/discount code", code: discount_code} unless gift
          gift.redeem_code!(discount_code, user)
          amount *= (1.0 - gift.discount_percent)
        end
        if include_extras && !  ((user.settings['subscription'] || {})['extras'] || {})['enabled']
          amount += self.extras_symbols_cost
          description += " (plus premium symbols)"
        end
        if include_n_supporters > 0
          amount += (include_n_supporters * self.extras_supporter_cost)
          description += " (plus #{include_n_supporters} premium supporters)"
        end 
    
        return {success: false, error: "Charge amount is zero"} if amount <= 0
        meta = {
          'user_id' => user.global_id,
          'plan_id' => plan_id,
          'platform_source' => 'lingolinq',
          'type' => 'license'
        }
        meta['purchased_symbols'] = 'true' if include_extras
        meta['purchased_supporters'] = include_n_supporters if include_n_supporters > 0
        charge = Stripe::Charge.create({
          :amount => (amount * 100).to_i,
          :currency => 'usd',
          :source => token['id'],
          :description => description,
          :receipt_email => (user && user.external_email_allowed?) ? (user && user.settings && user.settings['email']) : nil,
          :metadata => meta
        })
        if include_extras || include_n_supporters > 0
          extras_added = {:customer_id => charge['customer'], :purchase_id => charge['id'], :symbols => !!include_extras, :supporters => include_n_supporters}
        end
        time = 5.years.to_i
        user && user.log_subscription_event({:log => 'persisting long-term purchase update'})
        if plan_id.match(/free/)
          user.update_subscription({
            'subscribe' => true,
            'subscription_id' => 'free',
            'customer_id' => 'free',
            'plan_id' => 'slp_long_term_free'
          })
        else
          User.subscription_event({
            'purchase' => true,
            'user_id' => user.global_id,
            'purchase_id' => charge['id'],
            'customer_id' => charge['customer'],
            'token_summary' => token['summary'],
            'discount_code' => discount_code,
            'purchase_amount' => amount,
            'source_id' => 'stripe',
            'plan_id' => plan_id,
            'seconds_to_add' => time,
            'source' => 'new purchase'
          })
        end
        cancel_other_subscriptions(user, 'all')
      else
        user && user.log_subscription_event({:log => 'monthly subscription'})
        customer = nil
        one_time_amount = amount
        if user.settings['subscription'] && user.settings['subscription']['customer_id'] && user.settings['subscription']['customer_id'] != 'free'
          user && user.log_subscription_event({:log => 'retrieving existing customer'})
          customer = Stripe::Customer.retrieve({id: user.settings['subscription']['customer_id'], expand: ['subscriptions']}) #rescue nil
        end
        if !customer
          user && user.log_subscription_event({:log => 'creating new customer'})
          customer = Stripe::Customer.create({
            :metadata => { 'user_id' => user.global_id, 'platform_source' => 'lingolinq' },
            :email => (user && user.external_email_allowed?) ? (user && user.settings && user.settings['email']) : nil,
            :expand => ['subscriptions']
          })
        end
        if customer
          user && user.log_subscription_event({:log => 'new subscription for existing customer'})
          plan_id = Purchasing.plan_map[plan_id] || plan_id
          sub = nil
          if customer.subscriptions.count > 0
            sub = customer.subscriptions.data.detect{|s| ((s.metadata || {})['platform_source'] || 'lingolinq') == 'lingolinq' && ['active', 'past_due', 'unpaid'].include?(s.status) }
          end
          if sub
            sub.source = token['id']
            sub.plan = plan_id
            sub.prorate = true
            sub.metadata ||= {}
            sub.metadata['purchased_supporters'] = include_n_supporters if include_n_supporters > 0
            sub.save
          else
            trial_end = 'now'
            if user.created_at > 60.days.ago
              trial_end = (user.created_at + 60.days).to_i
            end
            meta = {
              :platform_source => 'lingolinq'
            }
            meta['purchased_supporters'] = include_n_supporters if include_n_supporters > 0
            sub = customer.subscriptions.create({
              :plan => plan_id,
              :source => token['id'],
              :metadata => meta,
              :trial_end => trial_end
            })
          end
          customer = Stripe::Customer.retrieve({id: customer['id'], expand: ['subscriptions']})
          any_sub = customer.subscriptions.data.detect{|s| ((s.metadata || {})['platform_source'] || 'lingolinq') == 'lingolinq' && (s.status == 'active' || s.status == 'trialing') }
          if include_extras || include_n_supporters > 0
            one_time_amount += self.extras_symbols_cost if include_extras
            one_time_amount += (include_n_supporters * self.extras_supporter_cost)
            desc = ""
            cosst = 0
            if include_extras && include_n_supporters > 0
              desc = "LingoLinq premium symbols and #{include_n_supporters} supporter accounts one-time charge"
              cost = (self.extras_symbols_cost * 100) + (include_n_supporters * self.extras_supporter_cost * 100)
            elsif include_extras
              desc = "LingoLinq premium symbols one-time charge"
              cost = (self.extras_symbols_cost * 100)
            else
              desc = "LingoLinq premium #{include_n_supporters} supporter accounts one-time charge"
              cost = (include_n_supporters * self.extras_supporter_cost * 100)
            end
            charge_id = nil
            if customer['default_source']
              meta = {
                'user_id' => user.global_id,
                'type' => 'extras',
                'platform_source' => 'coughdrop'
              }
              meta['purchased_supporters'] = include_n_supporters if include_n_supporters > 0
              meta['purchased_symbols'] = 'true' if include_extras
              charge = Stripe::Charge.create({
                :amount => cost,
                :currency => 'usd',
                :customer => customer['id'],
                :source => customer['default_source'],
                :receipt_email => user.settings['email'],
                :description => desc,
                :metadata => meta
              })
              charge_id = charge['id']
            else
              Stripe::InvoiceItem.create({
                amount: (self.extras_symbols_cost * 100),
                currency: 'usd',
                customer: customer['id'],
                description: desc,
                metadata: {'platform_source' => 'lingolinq'}
              })
            end
            extras_added = {:customer_id => customer.id, :purchase_id => charge_id, :symbols => !!include_extras, :supporters => include_n_supporters}
          end
          raise "no valid subscription found" unless any_sub
          user && user.log_subscription_event({:log => 'persisting subscription update'})
          updated = User.subscription_event({
            'subscribe' => true,
            'user_id' => user.global_id,
            'subscription_id' => sub['id'],
            'customer_id' => sub['customer'],
            'token_summary' => token['summary'],
            'purchase_amount' => one_time_amount,
            'plan_id' => plan_id,
            'cancel_others_on_update' => true,
            'source_id' => 'stripe',
            'source' => 'new subscription'
          })
        else
          raise "customer should have been created but wasn't"
        end
      end
    rescue Stripe::CardError => err
      json = err.json_body
      err = json[:error]
      user && user.log_subscription_event({:error => 'stripe card_exception', :json => json})
      return {success: false, error: err[:code], decline_code: err[:decline_code]}
    rescue => err
      type = (err.respond_to?('[]') && err[:type])
      code = (err.respond_to?('[]') && err[:code]) || 'unknown'
      if err.to_s.match(/Invalid email address/)
        user && user.log_subscription_event({:error => 'invalid_email', :err => err.to_s + err.backtrace[0].to_s })
        return {success: false, :trace => err.backtrace, error: 'invalid_email', error_message: err.to_s, error_type: type, error_code: code}
      end
      user && user.log_subscription_event({:error => 'other_exception', :err => err.to_s + err.backtrace[0].to_s })
      return {success: false, :trace => err.backtrace, error: 'unexpected_error', error_message: err.to_s, error_type: type, error_code: code}
    end
    if extras_added
      User.schedule(:purchase_extras, {
        'user_id' => user.global_id,
        'customer_id' => extras_added[:customer_id],
        'purchase_id' => extras_added[:purchase_id],
        'premium_symbols' => extras_added[:symbols],
        'premium_supporters' => extras_added[:supporters],
        'source' => 'purchase.include',
        'notify' => false
      })
    end
    {success: true, type: type}
  end
  
  def self.active_sale?
    !!(Purchasing.current_sale && Purchasing.current_sale.to_i > Time.now.to_i)
  end

  def self.purchase_symbol_extras(token, opts)
    user = opts['user_id'] && User.find_by_global_id(opts['user_id'])
    return {success: false, error: 'user required'} unless user
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    amount = self.extras_symbols_cost
    add_token_summary(token)
    charge_type = false
    begin
      customer = nil
      if user && user.settings['subscription'] && user.settings['subscription']['customer_id'] && user.settings['subscription']['customer_id'] != 'free'
        customer = Stripe::Customer.retrieve({id: user.settings['subscription']['customer_id'], expand: ['subscriptions']})  rescue nil
      end
      if token == 'none' && customer && customer['subscriptions'].to_a.any?{|s| s['status'] == 'active' || s['status'] == 'trialing' }
        if customer['default_source']
          # charge the customer immediately if possible
          token = {'id' => customer['default_source'], 'customer_id' => customer['id']}
        end
      end
      if !charge_type && token != 'none'
        charge = Stripe::Charge.create({
          :amount => (amount * 100),
          :currency => 'usd',
          :source => token['id'],
          :customer => token['customer_id'],
          :receipt_email => user.settings['email'],
          :description => "LingoLinq premium symbols access",
          :metadata => {
            'user_id' => user.global_id,
            'purchased_symbols' => 'true',
            'platform_source' => 'lingolinq',
            'type' => 'extras'
          }
        })
        charge_type = 'immediate_purchase'
        Worker.schedule_for(:priority, User, 'purchase_extras', {
          'user_id' => user.global_id,
          'purchase_id' => charge['id'],
          'customer_id' => charge['customer'],
          'premium_symbols' => true,
          'source' => 'purchase.standalone',
          'notify' => true
        })
      elsif !charge_type
        return {success: false, error: 'token required without active subscription'}
      end
    rescue Stripe::CardError => err
      json = err.json_body
      err = json[:error]
      return {success: false, error: err[:code], decline_code: err[:decline_code]}
    rescue => err
      type = (err.respond_to?('[]') && err[:type])
      code = (err.respond_to?('[]') && err[:code]) || 'unknown'
      return {success: false, error: 'unexpected_error', error_message: err.to_s, error_type: type, error_code: code}
    end 
    {success: true, charge: charge_type}   
  end
  
  def self.purchase_gift(token, opts)
    user = opts['user_id'] && User.find_by_global_id(opts['user_id'])
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    type = opts['type'] || ""
    amount = type.split(/_/)[-1].to_i
    valid_amount = true
    description = type
    seconds = 5.years.to_i

    gift = GiftPurchase.find_by_code(opts['code']) if opts['code']
    cutoff = Purchasing.communicator_cost
    cutoff = Purchasing.communicator_sale_cost if self.active_sale?
    cutoff += Purchasing.extras_symbols_cost if opts['extras']
    cutoff += (opts['supporters'] * Purchasing.extras_supporter_cost) if opts['supporters'].to_i > 0
    cutoff += Purchasing.communicator_repurchase_cost if opts['donate']

    if type.match(/^long_term_custom/)
      if gift && gift.settings['amount']
        description = "#{gift.settings['licenses'] || 1} sponsored LingoLinq license(s)"
        if !gift.settings['memo'].blank?
          description += ", #{gift.settings['memo']}"
        end
      else
        valid_amount = false unless amount > cutoff
        description = "sponsored LingoLinq license"
      end
    elsif type.match(/^long_term/)
      valid_amount = false unless amount >= cutoff
      description = "sponsored LingoLinq license"
    else
      return {success: false, error: "unrecognized purchase type, #{type}"}
    end   
    description += " (plus premium symbols)" if opts['extra'] 
    description += " (plus #{opts['supporters']} premium supporters)" if opts['supporters'].to_i > 0
    if !valid_amount
      return {success: false, error: "#{amount} not valid for type #{type}"}
    end
    add_token_summary(token)
    begin
      charge = Stripe::Charge.create({
        :amount => (amount * 100),
        :currency => 'usd',
        :source => token['id'],
        :receipt_email => (opts['email'] || (user && user.settings['email']) || '').strip,
        :description => description,
        :metadata => {
          'giver_id' => user && user.global_id,
          'giver_email' => opts['email'] || (user && user.settings['email']),
          'platform_source' => 'lingolinq',
          'plan_id' => type
        }
      })
      gift ||= GiftPurchase.process_new({}, {
        'giver' => user, 
        'email' => opts['email'],
        'seconds' => seconds
      })
      gift.process({}, {
        'customer_id' => charge['customer'],
        'token_summary' => token['summary'],
        'include_extras' => opts['extras'],
        'include_supporters' => opts['supporters'],
        'extra_donation' => opts['donate'],
        'plan_id' => type,
        'source_id' => 'stripe',
        'purchase_id' => charge['id'],
      })
      gift.notify_of_creation
    rescue Stripe::CardError => err
      json = err.json_body
      err = json[:error]
      return {success: false, error: err[:code], decline_code: err[:decline_code]}
    rescue => err
      type = (err.respond_to?('[]') && err[:type])
      code = (err.respond_to?('[]') && err[:code]) || 'unknown'
      return {success: false, error: 'unexpected_error', error_message: err.to_s, error_type: type, error_code: code}
    end
    {success: true, type: type}
  end
  
  def self.redeem_gift(code, user)
    gift = GiftPurchase.find_by_code(code)
    if !user
      return {success: false, error: "user required"}
    end
    if !gift
      return {success: false, error: "code doesn't match any available gifts"}
    end
    if !gift.settings || gift.settings['seconds_to_add'].to_i <= 0
      return {success: false, error: "gift has no time to add"}
    end
    gift.redeem_code!(code, user)
    
    res = User.subscription_event({
      'user_id' => user.global_id,
      'purchase' => true,
      'plan_id' => 'gift_code',
      'gift_id' => gift.global_id,
      'code' => code,
      'source_id' => 'gift',
      'seconds_to_add' => gift.settings['seconds_to_add'].to_i
    })
    if gift.settings['include_extras'] || gift.settings['include_supporters'].to_i > 0
      User.purchase_extras({
        'user_id' => user.global_id,
        'premium_symbols' => gift.settings['include_extras'],
        'premium_supporters' => gift.settings['include_supporters'].to_i,
        'source' => 'gift.redeemed'
      })
    end
    if res
      {success: true, redeemed: true, code: code}
    else
      {success: false, error: "unexpected_error"}
    end
  end
  
  def self.change_user_id(customer_id, from_user_id, to_user_id)
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    customer = Stripe::Customer.retrieve({id: customer_id}) rescue nil
    if customer
      raise "wrong existing user_id" unless customer.metadata && customer.metadata['user_id'] == from_user_id
      customer.metadata['user_id'] = to_user_id
      customer.save
    else
      raise "customer not found"
    end
  end
  
  def self.unsubscribe(user)
    return false unless user
    # TODO: when a subscription is canceled, any long-term credit should immediately be
    # applied, and if a user is currently on a long-term plan they really shouldn't be
    # able to cancel the "subscription"
    User.subscription_event({
      'unsubscribe' => true,
      'manual_unsubscribe' => true,
      'user_id' => user.global_id,
      'customer_id' => (user.settings['subscription'] || {})['customer_id'],
      'subscription_id' => (user.settings['subscription'] || {})['subscription_id']
    })
    cancel_other_subscriptions(user, 'all')
  end

  # TODO: on frontend init, if not iOS but subscription.plan_id == 'LingoLinqiOSMonthly'
  # then make an API call to verify the latest receipt for the user matching that criteria
  def self.verify_receipt(user, data)
    res = {}
    prepaid_bundle_ids = ['com.lingolinq.paidlingolinq']
    if user && data && data['receipt'] && data['receipt']['appStoreReceipt']
      product_id = data['product_id']
      user.settings['receipts'] = (user.settings['receipts'] || []).select{|r| (product_id && r['product_id'] != product_id) || (r['data'] && r['data']['receipt'] && r['data']['receipt']['appStoreReceipt'] != data['receipt']['appStoreReceipt'])}
      user.settings['receipts'].each{|r| r['data']['receipt'].delete('appStoreReceipt') if r['data'] && r['data']['receipt'] && (!r['product_id'] || r['product_id'] == product_id) }
      user.settings['receipts'] << {'ts' => Time.now.to_i, 'data' => data}
      user.save!
    end
    if data['ios']
      if data['device_id'] && data['pre_purchase'] && (!data['receipt'] || !data['receipt']['appStoreReceipt'])
        token = PurchaseToken.for_device(data['device_id'])
        if token && token.user != user
          return {'error' => true, 'wrong_user' => true, 'error_message' => 'The app has already been purchased for a different user on this device'}
        end
      end
      # look up the transaction_id/original_transaction_id and refuse it if
      # it's already been registered, but for a different user
      if data['receipt'] && data['receipt']['appStoreReceipt']
        # https://developer.apple.com/documentation/storekit/in-app_purchase/validating_receipts_with_the_app_store
        # https://developer.apple.com/library/archive/releasenotes/General/ValidateAppStoreReceipt/Chapters/ValidateRemotely.html
        url = "https://buy.itunes.apple.com/verifyReceipt"
        req = Typhoeus.post(url, body: {
          'receipt-data' => data['receipt']['appStoreReceipt'],
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'})
        json = JSON.parse(req.body) rescue nil
        if json && (json['status'] == 21007 || json['status'] >= 21100)
          url = "https://sandbox.itunes.apple.com/verifyReceipt"
          req = Typhoeus.post(url, body: {
            'receipt-data' => data['receipt']['appStoreReceipt'],
            'password' => ENV['IOS_RECEIPT_SECRET']
          }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'})
          json = JSON.parse(req.body) rescue nil
        end
        if json && json['status'] == 0
          recent_iaps = (json['receipt']['in_app'] || []).sort_by{|a| a['purchase_date_ms'].to_i }
          in_app = recent_iaps.reverse.detect{|iap| iap['product_id'] == data['product_id']}
          in_app = recent_iaps.reverse.detect{|iap| data['pre_purchase'] && prepaid_bundle_ids.include?(iap['product_id'])}
          in_app ||= recent_iaps[-1]
          res['success'] = true
          res['bundle_id'] = json['receipt']['bundle_id']
          if data['pre_purchase'] && prepaid_bundle_ids.include?(res['bundle_id'])
            res['quantity'] = 1
            res['pre_purchase'] = true
            res['product_id'] = 'AppPrePurchase'
            res['transaction_id'] = "pre.#{data['device_id']}"
            res['device_id'] = "ios.#{data['device_id']}"
          elsif in_app
            res['quantity'] = in_app['quantity'].to_i
            res['transaction_id'] = in_app['transaction_id']
            res['device_id'] = "ios.#{data['device_id']}"
            res['subscription_id'] = in_app['original_transaction_id']
            res['product_id'] = in_app['product_id']
            res['expires'] = in_app['expiration_date']
          else
            return {'error' => true, 'error_message' => 'Not a pre-purchase and no in-app receipts to validate'}
          end
          res['customer_id'] = "ios.#{user.global_id}"
          res['one_time_purchase'] = true if ['LingoLinqiOSBundle', 'LingoLinqiOSEval', 'LingoLinqiOSSLP'].include?(res['product_id']) || res['pre_purchase']
          res['subscription'] = true if ['LingoLinqiOSMonthly'].include?(res['product_id'])
          res['extras'] = true if ['LingoLinqiOSMonthly', 'LingoLinqiOSBundle'].include?(res['product_id'])

          # Make sure if the token has already been used, we're applying it to the right user
          existing_user = nil
          if res['one_time_purchase']
            existing_user = PurchaseToken.retrieve("purchase.iap.#{res['transaction_id']}")
          elsif res['subscription']
            existing_user = PurchaseToken.retrieve("subscribe.iap.#{res['subscription_id']}")
          end
          if existing_user && existing_user != user
            return {'error' => true, 'wrong_user' => true, 'error_message' => 'That purchase has already been applied to a different user'}
          end

          if res['subscription']
            if in_app && in_app['expiration_intent']
              res['expired'] = true
              res['reason'] = {
                '1' => "Customer canceled their subscription.",
                '2' => "Billing error; for example customer’s payment information was no longer valid.",
                '3' => "Customer did not agree to a recent price increase.",
                '4' => "Product was not available for purchase at the time of renewal.",
              }[in_app['expiration_intent']] || "Unknown iOS Cancellation"
              if in_app['is_in_billing_retry_period'] == '1'
                # still trying to renew...
                res['expired'] = false
                res['billing_issue'] = true
              end
            end
            res['free_trial'] = in_app && in_app['is_trial_period'] == 'true'
          end
          hash = user.subscription_hash
          if res['expired']
            if hash['plan_id'] == 'monthly_ios'
              User.subscription_event({
                'unsubscribe' => true,
                'user_id' => user.global_id,
                'reason' => res['reason'],
                'customer_id' => res['custoner_id'],
                'subscription_id' => res['subscription_id'],
                'cancel_others_on_update' => true,
                'source_id' => 'iap',
                'source' => 'ios.subscription.updated'
              })
              res['canceled'] = true
            else
              res['canceled'] = false
            end
          elsif res['subscription']
            if hash['plan_id'] != 'monthly_ios'
              updated = User.subscription_event({
                'subscribe' => true,
                'user_id' => user.global_id,
                'source_id' => 'iap',
                'subscription_id' => res['subscription_id'],
                'customer_id' => res['customer_id'],
                'token_summary' => res['product_id'],
                'plan_id' => 'monthly_ios',
                'cancel_others_on_update' => true,
                'source' => 'new iOS subscription'
              })
              if res['extras']
                User.schedule(:purchase_extras, {
                  'user_id' => user.global_id,
                  'customer_id' => res['customer_id'],
                  'purchase_id' => res['subscription_id'],
                  'premium_symbols' => true,
                  'premium_supporters' => 2,
                  'source' => 'iap.subscription.include',
                  'notify' => false
                })
              end
              res['subscribed'] = true
            else
              res['subscribed'] = true
              res['already_subscribed'] = true
            end
          elsif res['one_time_purchase']
            transaction_ids = (user.settings['subscription']['prior_purchase_ids'] || []) + [user.settings['subscription']['last_purchase_id'] || 'xx']
            ios_plan_hash = {
#              'com.mycoughdrop.coughdrop' => 'long_term_ios',
              'AppPrePurchase' => 'long_term_ios',
              'com.lingolinq.paidlingolinq' => 'long_term_ios',
              'CoughDropiOSPlusExtras' => 'long_term_ios',
              'LingoLinqiOSBundle' => 'long_term_ios',
              'LingoLinqiOSEval' => 'eval_long_term_ios',
              'LingoLinqiOSSLP' => 'slp_long_term_ios'
            }
            expected_plan = ios_plan_hash[res['product_id']] || ios_plan_hash[res['bundle_id']]
            if !existing_user && (hash['plan_id'] != expected_plan || !transaction_ids.include?(res['transaction_id']))
              User.subscription_event({
                'purchase' => true,
                'user_id' => user.global_id,
                'source_id' => 'iap',
                'purchase_id' => res['transaction_id'],
                'customer_id' => res['customer_id'],
                'token_summary' => res['product_id'],
                'plan_id' => expected_plan,
                'seconds_to_add' => 5.years.to_i,
                'source' => 'new iOS purchase'
              })
              if res['extras']
                user.reload
                user.settings['premium_voices'] ||= User.default_premium_voices
                if expected_plan == 'long_term_ios'
                  user.allow_additional_premium_voice!
                end
                if expected_plan != 'slp_long_term_ios'
                  user.allow_additional_premium_voice!
                end
                User.schedule(:purchase_extras, {
                  'user_id' => user.global_id,
                  'customer_id' => res['customer_id'],
                  'purchase_id' => res['transaction_id'],
                  'premium_symbols' => true,
                  'source' => 'iap.purchase.include',
                  'notify' => false
                })
              end
              res['purchased'] = true
            else
              res['purchased'] = true
              res['already_purchased'] = true
            end
          else
            res['error'] = true
            res['error_message'] = "Unrecognized receipt data"
          end
        else
          res['error'] = true
          res['error_message'] = "Error retrieving receipt, status #{json && json['status']}"
          if user && data && data['receipt'] && data['receipt']['appStoreReceipt']
            product_id = data['product_id']
            user.settings['receipts'] = (user.settings['receipts'] || []).select{|r| (product_id && r['product_id'] != product_id) || (r['data'] && r['data']['receipt'] && r['data']['receipt']['appStoreReceipt'] != data['receipt']['appStoreReceipt'])}
            user.settings['receipts'].each{|r| r['data']['receipt'].delete('appStoreReceipt') if r['data'] && r['data']['receipt'] && (!r['product_id'] || r['product_id'] == product_id) }
            user.settings['receipts'] << {'ts' => Time.now.to_i, 'data' => data}
            user.save!
          end
        end
      else
        res['error'] = true
        res['error_message'] = "Missing receipt data"
      end
    else
      res['error'] = true
      res['error_message'] = "unrecognized purchase type"
    end
    res
  end

  def self.overdue
    users = User.where(possibly_full_premium: true).where(['updated_at > ?', 10.days.ago]); users.count
    users.select{|u| u.settings['needs_billing_update']}
  end

  def self.validate_user(user)
    # TODO: check the purchasing system and update the user record
    # to match the data in the system
  end

  def self.usage_distribution(month_date)
    # TODO: 
    # - find all users who have daily_use during the month
    start_date = month_date.beginning_of_month
    end_date = start_date >> 1
    uses = LogSession.where(log_type: 'daily_use').where(['created_at < ? AND updated_at > ?', end_date, start_date]); uses.count
    user_ids = []
    uses.find_in_batches(batch_size: 5) do |batch|
      batch.each do |log|
        score = 0
        (log.data['days'] || {}).each do |str, hash|
          d = Date.parse(str) rescue nil
          if d && d >= start_date && d <= end_date
            if hash['active']
              score += 5
            else
              score += (hash['activity_level'] || 2) / 2
            end
          end
        end
        user_ids << log.related_global_id(log.user_id) if score >= 5
      end
    end
    author_scores = {}
    # - retrieve their boards and sidebar boards
    cnt = 0
    User.find_batches_by_global_id(user_ids, {block_size: 10}) do |user|
      # - for subscription (1.0) or long-term (0.5) users, add to author's score
      mult = 0.0
      mult = 1.0 if user.recurring_subscription?
      mult = 0.5 if user.billing_state == :long_term_active_communicator
      mult = 0.1 if user.billing_state == :eval_communicator && false
      mult = 0.5 if user.billing_state == :org_sponsored_communicator
      next if mult == 0.0

      cnt += 1
      puts "#{user.user_name} (#{cnt})"
      root_board_keys = []
      root_board_keys << {id: user.settings['preferences']['home_board']['id'], score: 1.0} if user.settings['preferences'] && user.settings['preferences']['home_board']
      root_board_keys += user.sidebar_boards.map{|b| {id: b['key'], score: 0.3} }
      scores = {}
      root_board_keys.each do |key|
        # - retrieve the original source for each board 
        root_board = Board.find_by_path(key[:id])
        if root_board
          src = root_board.source_board || root_board.parent_board || root_board
          puts "  #{root_board.key} #{src.key}"
          author = src.cached_user_name
          # - tally the author based on the board's depth (sidebar * 0.3)
          scores[author] = (scores[author] || 0) + key[:score]
          Board.find_batches_by_global_id(root_board.downstream_board_ids, {block_size: 10}) do |brd|
            src = brd.source_board || brd.parent_board || brd
            author = src.cached_user_name
            scores[author] = (scores[author] || 0) + (key[:score] * 0.1)
          end
        end
      end
      # - normalize the tallies to 1.0 total for each daily_use user
      total_score = scores.to_a.map(&:last).sum
      scores.each do |un, score|
        if un != user.user_name
          author_scores[un] = (author_scores[un] || 0) + (score / total_score * mult)
        end
      end
    end
    # - return the list of authors with scores above a threshold
    author_scores.to_a.select{|a, b| b > 1 }.sort_by{|a, b| b }.reverse
  end

  def self.reconcile_user(user_id, with_side_effects=false)
    user = User.find_by_path(user_id)
    puts "NO ACTIONS WILL BE PERFORMED" unless with_side_effects
    # check if the user has transferred to another account, and only apply purchases after that timestamp
    timestamp_cutoff = user && user.settings['subscription'] && user.settings['subscription']['transfer_ts']
    Stripe.api_version = '2022-08-01'
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    charges = Stripe::Charge.search({query: "metadata[\"user_id\"]:\"#{user_id}\""})
    charges.data.each do |chrg|
      next if timestamp_cutoff && chrg.created && chrg.created < timestamp_cutoff
      if chrg.metadata.type == 'extras'
        do_apply = false
        if user && !((user.settings['subscription'] || {})['extras'] || {})['enabled']
          do_apply = true
        elsif (chrg['metadata'] || {})['purchased_supporters'] && ((user.settings['subscription'] || {})['purchased_supporters'] || 0).to_i < chrg['metadata']['purchased_supporters'].to_i
          do_apply = true
        end

        if do_apply
          puts "Assure extras for user"
          User.purchase_extras({
            'user_id' => user_id,
            'purchase_id' => chrg.id,
            'premium_symbols' => chrg['metadata'] && chrg['metadata']['purchased_symbols'] == 'true',
            'premium_supporters' => chrg['metadata'] && chrg['metadata']['purchased_supporters'].to_i,
            'customer_id' => chrg['customer'],
            'source' => 'charge.reconcile'
          }) if with_side_effects
        end
      else
        purchase_id = chrg.id
        found = false
        if user && (user.settings['subscription'] || {})['purchase_id'] == purchase_id
          found = true
        elsif user && ((user.settings['subscription'] || {})['prior_purchase_ids'] || []).include?(purchase_id)
          found = true
        end
        if !found
          time = 5.years.to_i
          puts "Assert purchase for user"
          User.schedule(:subscription_event, {
            'purchase' => true,
            'user_id' => user_id,
            'purchase_id' => chrg['id'],
            'customer_id' => chrg['customer'],
            'plan_id' => chrg['metadata'] && chrg['metadata']['plan_id'],
            'seconds_to_add' => time,
            'source_id' => 'stripe',
            'source' => 'charge.reconcile'
          }) if with_side_effects
          if chrg['metadata'] && (chrg['metadata']['purchased_symbols'] == 'true' || chrg['metadata']['purchased_supporters'].to_i > 0)
            puts "Assert extras with regular purchase for user"
            User.schedule(:purchase_extras, {
              'user_id' =>  user_id,
              'customer_id' => chrg['customer'],
              'purchase_id' => chrg['id'],
              'premium_symbols' => chrg['metadata']['purchased_symbols'] == 'true',
              'premium_supporters' => chrg['metadata']['purchased_supporters'].to_i,
              'source' => 'charge.reconcile',
              'notify' => false
            }) if with_side_effects
          end
        end
      end
    end

    customers = Stripe::Customer.search({query: "metadata[\"user_id\"]:\"#{user_id}\""})
    customers.data.each do |cus|
      customer = Stripe::Customer.retrieve(id: cus.id, expand: ['subscriptions'])
      sub = customer.subscriptions.data.detect{|s| ((s.metadata || {})['platform_source'] || 'lingolinq') == 'lingolinq' && ['active', 'past_due', 'unpaid'].include?(s.status) }
      next if sub && sub.created && timestamp_cutoff && sub.created < timestamp_cutoff
      if sub
        # user has active subscription, make sure it is applied
        puts "Asserting active subscription for user"
        User.schedule(:subscription_event, {
          'subscribe' => true,
          'user_id' => customer['metadata'] && customer['metadata']['user_id'],
          'purchased_supporters' => sub['metadata'] && sub['metadata']['purchased_supporters'],
          'customer_id' => customer['id'],
          'subscription_id' => sub['id'],
          'plan_id' => sub['plan'] && sub['plan']['id'],
          'source_id' => 'stripe',
          'cancel_others_on_update' => true,
          'source' => 'customer.subscription.asserted'
        }) if with_side_effects
      else
        puts "Canceling any subscriptions for user"
        # user has no active subscription, cancel any active ones
        User.schedule(:subscription_event, {
          'unsubscribe' => true,
          'user_id' => customer['metadata'] && customer['metadata']['user_id'],
          'reason' => "missing subscription on reconciliation",
          'customer_id' => customer['id'],
          'subscription_id' => 'all',
          'source_id' => 'stripe',
          'cancel_others_on_update' => false,
          'source' => 'customer.subscription.asserted'
        }) if with_side_effects
      end
    end

    customers.data[0]
  end
  
  def self.reconcile(with_side_effects=false)
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    customers = Stripe::Customer.list(:limit => 10)
    customer_active_ids = []
    total = 0
    cancel_months = {}
    cancels = {}
    output "retrieving expired subscriptions..."
    Stripe::Subscription.list(:limit => 20, :status => 'canceled').auto_paging_each do |sub|
      cancels[sub['customer']] ||= []
      cancels[sub['customer']] << sub
    end
    output "retrieving charges..."
    list = Stripe::Charge.list(:limit => 20)
    big_charges = []
    tallies = {}
    while(list && list.data && list.data[0] && list.data[0].created > 3.months.ago.to_i)
      list.data.each do |charge|
        if charge.captured && !charge.refunded
          date = Time.at(charge.created).iso8601[0, 7]
          tallies[date] = (tallies[date] || 0) + (charge.amount / 100)
          if charge.amount > 90
            big_charges << charge
          end
        end
      end
      list = list.next_page
      output "..."
    end
    tally_months = {}
    big_charges.each do |charge|
      time = Time.at(charge.created)
      date = time.iso8601[0, 7]
      if charge.amount > 225
        tally_months[date] = (tally_months[date] || 0) + (charge.amount / 100 / 150).floor
      else
        tally_months[date] = (tally_months[date] || 0) + 1
      end
    end.length
    problems = []
    user_active_ids = []
    years = {}
    customers.auto_paging_each do |customer|
      total += 1
      cus_id = customer['id']
      email = customer['email']
      output "checking #{cus_id} #{email}"
      if !customer
        output "\tcustomer not found"
        next
      end
      user_id = customer['metadata'] && customer['metadata']['user_id']
      user = user_id && User.find_by_global_id(user_id)
      customer_subs = customer['subscriptions'].to_a.select{|s| ((s['metadata'] || {})['platform_source'] || 'lingolinq') == 'lingolinq' }
      if !user && cancels[customer['id']].blank? && !customer_subs.blank?
        problems << "#{customer['id']} no user found"
        output "\tuser not found #{user_id} (ROGUE SUBSCRIPTION??)"
        next
      end

      user_active = user && user.recurring_subscription?
      user_active_ids << user.global_id if user_active
      customer_active = false
      
      if customer_subs.length > 1
        output "\ttoo many subscriptions"
        problems << "#{user.global_id} #{user.user_name} too many subscriptions"
      elsif user && user.long_term_purchase?
        subs = cancels[cus_id] || []
        sub = subs[0]
        str = "\tconverted to a long-term purchase"

        if sub && sub['canceled_at']
          canceled = Time.at(sub['canceled_at'])
          str += " on #{canceled.iso8601}"
        end
        if sub && sub['created']
          created = Time.at(customer['created'])
          str += ", subscribed #{created.iso8601}"
        end
        output str
        if customer_subs.length > 0
          sub = customer_subs[0]
          if sub && (sub['status'] == 'active' || sub['status'] == 'trialing')
            output "\tconverted to long-term purchase, but still has a lingering subscription"
            problems << "#{user.global_id} #{user.user_name} converted to long-term purchase, but still has a lingering subscription"
          end
        end
      elsif customer_subs.length == 0 
        # if no active subscription, this is an old customer record
        check_cancels = false
        # if customer id matches, then we are properly aligned
        if user && user.settings['subscription'] && user.settings['subscription']['customer_id'] == cus_id
          check_cancels = true
          if user_active
            output "\tno subscription found, but expected (FREELOADER)" 
            problems << "#{user.global_id} #{user.user_name} no subscription found, but expected (FREELOADER)"
          end
          if user_active && with_side_effects
            User.schedule(:subscription_event, {
              'unsubscribe' => true,
              'user_id' => user.global_id,
              'customer_id' => cus_id,
              'subscription_id' => object['id'],
              'cancel_others_on_update' => true,
              'source' => 'customer.reconciliation'
            })
          else
            if user_active
              output "\tuser active without a subscription (huh?)" 
              problems << "#{user.global_id} #{user.user_name} user active without a subscription (huh?)"
            end

          end
        else
          # if customer id doesn't match on subscription hash then we don't really care,
          # since there are no subscriptions for this customer, we just shouldn't
          # track this as a cancellation
          if user_active
          else
            check_cancels = true
          end
        end
        if check_cancels
          # Will only get here if there are no active subscriptions in purchasing system
          subs = cancels[cus_id] || []
          sub = subs[0]
          if sub
            canceled = Time.at(sub['canceled_at'])
            created = Time.at(customer['created'])
            # If canceled in the last 6 months, track it for reporting
            if canceled > 6.months.ago
              if user_active
                problems << "#{user.global_id} marked as canceled, but looks like still active"
              end 
              output "\tcanceled #{canceled.iso8601}, subscribed #{created.iso8601}, active #{user_active}" if canceled > 3.months.ago
              cancel_months[(canceled.year * 100) + canceled.month] ||= []
              cancel_months[(canceled.year * 100) + canceled.month] << (canceled - created) / 1.month.to_i
            end
          end
        end
      else
        sub = customer_subs[0]
        if sub && (sub['start'] || sub['start_date'])
          time = Time.at(sub['start'] || sub['start_date']) rescue nil
          if time
            yr = 0
            if time < 3.years.ago
              yr = 3
            elsif time < 2.years.ago
              yr = 2
            elsif time < 1.years.ago
              yr = 1
            elsif time < 4.months.ago
              yr = 0.3
            end
            years[yr] = (years[yr] || 0) + 1
          end
        end
        if user && user.settings['subscription'] && user.settings['subscription']['customer_id'] == cus_id
          customer_active = sub['status'] == 'active'
          customer_active_ids << user.global_id if customer_active
          if user_active != customer_active
            output "\tcustomer is #{sub['status']} but user is #{user_active ? 'subscribed' : 'expired'}" 
            problems << "#{user.global_id} #{user.user_name} customer is #{sub['status']} but user is #{user_active ? 'subscribed' : 'expired'}"
          end
        else
          # if customer id doesn't match on subscription hash:
          # - if the subscription is active, we have a problem
          # - otherwise we can ignore this customer record
          if user_active
            if sub['status'] == 'active' || sub['status'] == 'trialing'
              output "\tcustomer is #{sub['status']} but user is tied to a different customer record #{user.settings['subscription']['customer_id']}" 
              problems << "#{user.global_id} #{user.user_name} but user is tied to a different customer record #{user.settings['subscription']['customer_id']}"
            end
          end
        end
      end
    end
    if problems.length > 0
      output "PROBLEMS:\n#{problems.join("\n")}\n"
    end
    output "LARGE PURCHASES: #{tallies.to_json}"
    output "LICENSES (approx): #{tally_months.to_json}"
    output "YEARS: #{years.to_json}"
    output "TOTALS: checked #{total}, paying customers (not trialing, not duplicates) #{customer_active_ids.uniq.length}, subscription users #{user_active_ids.uniq.length}"
    cancel_months.each{|k, a| 
      res = []
      res << (cancel_months[k].sum / cancel_months[k].length.to_f).round(1) 
      res << (cancel_months[k].length)
      cancel_months[k] = res
    }
    output "CANCELS: #{cancel_months.to_a.sort_by(&:first).reverse.to_json}"
  end

  def self.output(str)
    puts str
  end
  
  def self.cancel_subscription(user_id, customer_id, subscription_id)
    user = User.find_by_global_id(user_id)
    return false unless user
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    begin
      customer = Stripe::Customer.retrieve({id: customer_id, expand: ['subscriptions']})
    rescue => e
      user.log_subscription_event({:log => 'subscription canceling error', :detail => 'error retrieving customer', :error => e.to_s, :trace => e.backtrace})
    end
    
    if customer
      if !customer.metadata || customer.metadata['user_id'] != user_id
        return false
      end
      
      begin
        sub = nil
        customer.subscriptions.auto_paging_each do |s|
          sub = s if s['id'] == subscription_id
        end
      rescue => e
        user.log_subscription_event({:log => 'subscription canceling error', :detail => 'error retrieving subscriptions', :error => e.to_s, :trace => e.backtrace})
      end
      
      if sub && sub['status'] != 'canceled' && sub['status'] != 'past_due'
        begin
          sub.cancel
          user.log_subscription_event({:log => 'subscription canceling success', id: sub['id'], reason: subscription_id})
          return true
        rescue => e
          user.log_subscription_event({:log => 'subscription canceling error', :detail => 'error canceling subscription', :error => e.to_s, :trace => e.backtrace})
        end
      end
    end
    false
  end
  
  def self.cancel_other_subscriptions(user, except_subscription_id)
    return false unless user && user.settings && user.settings['subscription'] && user.settings['subscription']['customer_id']
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    user.log_subscription_event({:log => 'subscription canceling', reason: except_subscription_id}) if user
    customer_ids = []
    # cancel all subscriptions tied to the user, even if their customer_id has changed in the mean time
    customer_ids << user.settings['subscription']['customer_id'] if user.settings['subscription']['customer_id']
    customer_ids += user.settings['subscription']['prior_customer_ids'] || []
    customer_ids = customer_ids.select{|id| id && id != 'free' }
    # need to collect subscriptions for all affiliated customer_ids to try to find the right exception
    subs = []
    customer_ids.each do |customer_id|
      begin
        customer = Stripe::Customer.retrieve({id: customer_id, expand: ['subscriptions']})
      rescue => e
        user.log_subscription_event({:log => 'subscription cancel error', :detail => 'error retrieving customer', :error => e.to_s, :trace => e.backtrace}) if user
      end
      if customer
        begin
          customer.subscriptions.auto_paging_each do |sub|
            subs << sub
          end
        rescue => e
          user.log_subscription_event({:log => 'subscription cancel error', :detail => 'error retrieving subscriptions', :error => e.to_s, :trace => e.backtrace}) if user
          return false
        end
      else
        return false
      end
    end
    do_cancel = (except_subscription_id == 'all')
    subs.each do |sub|
      # plan to cancel all other subscriptions if the specified one is active
      if sub['id'] == except_subscription_id && sub['status'] != 'canceled' && sub['status'] != 'past_due'
        do_cancel = true
      end
    end
    if do_cancel
      subs.each do |sub|
        # don't cancel the specified subscription
        if sub['id'] == except_subscription_id && except_subscription_id != 'all'
        else
          begin
            # record the details of the cancellation, if there are any
            sub['metadata'] ||= {}
            sub['metadata']['cancel_reason'] = except_subscription_id
            sub.save
            sub.cancel
            user.log_subscription_event({:log => 'subscription canceled', id: sub['id'], reason: except_subscription_id}) if user
          rescue => e
            if e.to_s.match(/Status 404/)
              user.log_subscription_event({:log => 'subscription already canceled', id: sub['id'], reason: except_subscription_id}) if user
            else
              user.log_subscription_event({:log => 'subscription cancel error', :detail => 'error deleting subscription', :subscription_id => sub['id'], :error => e.to_s, :trace => e.backtrace}) if user
              return false
            end
          end
        end
      end
    end
    true
  end

  def self.errored_subscription_events_since(cutoff_date)
    # issue started November 15th, apparently
    AuditEvent.where(event_type: 'subscription_event').where(['created_at > ?', cutoff_date]).order('id ASC').map{|e| res = {}.merge(e.data); res['record_id'] = e.record_id; res }.select{|d| d['error'] && d['error'] != "stripe card_exception" }
  end
  
  def self.pause_subscription(user)
    # API call
    return false
  end
  
  def self.resume_subscription(user)
    # API call
    return false
  end

  def self.current_sale
    setting = Setting.get('sale_cutoff_date')
    res = nil
    if setting
      res = (Time.parse(setting.to_s) + 1.day).to_i rescue nil
    end
    res ||= ENV['CURRENT_SALE'].to_i
    res
  end
end
