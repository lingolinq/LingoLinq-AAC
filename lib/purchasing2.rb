module Purchasing2
  def self.purchase_prep(opts)
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    Stripe.api_version = '2022-08-01'
    extras_price_id = ENV['STRIPE_EXTRAS_PRICE_ID']    
    supporter_price_id = ENV['STRIPE_SUPPORTER_PRICE_ID']
    eval_price_id = supporter_price_id
    monthly_price_id = ENV['STRIPE_SUBSCRIPTION_PRICE_ID']
    sale_price_id = ENV['STRIPE_SALE_PRICE_ID']
    standard_product_id = ENV['STRIPE_PURCHASE_PRODUCT_ID']
    standard_price_id = ENV['STRIPE_PURCHASE_PRICE_ID']
    repurchase_price_id = ENV['STRIPE_REPURCHASE_PRICE_ID']
    custom_product_id = ENV['STRIPE_CUSTOM_PRODUCT_ID']
    purchasing_price_id = active_sale? ? standard_price_id : sale_price_id
    purchasing_price_id = repurchase_price_id if opts[:repurchase]
    session_opts = {
      mode: 'payment',
      success_url: opts[:success_url],
      cancel_url: opts[:cancel_url],
      customer_email: opts[:contact_email],
      payment_method_types: ['card'], # , 'us_bank_account'
      metadata: { platform_source: 'lingolinq', purchase_options: opts },
      line_items: []
    }
    email = nil
    email = user.settings && user.settings['email'] if user && user.external_email_allowed?
    session_opts[:payment_intent_data] = {
      receipt_email: email,
      description: "CoughDrop Purchase",
      statement_descriptor: ""
    }
    discountable = false
    if opts[:subscription]
      session_opts[:metadata][:user_id] = opts[:user_id]
      session_opts[:metadata][:action] = 'subscribe'
      session_opts[:line_items] << {
        price: monthly_price_id, quantity: 1
      }
      session_opts[:mode] = 'subscription'
      session_opts[:subscription_data] = {metadata: { platform_source: 'lingolinq', user_id: opts[:user_id]}}
      if opts[:extras]
        session_opts[:line_items] << {
          price: extras_price_id, quantity: 1
        }
      end
      if opts[:supporter_count]
        session_opts[:line_items] << {
          price: supporter_price_id, quantity: (opts[:supporter_count] || 1)
        }
      end
    elsif opts[:gift]
      session_opts[:metadata][:giver_data] = opts[:giver_data]
      session_opts[:metadata][:action] = 'gift'
      session_opts[:line_items] << {
        price: purchasing_price_id, quantity: opts[:gift_count] || 1
      }
      if opts[:extras]
        session_opts[:line_items] << {
          price: extras_price_id, quantity: opts[:gift_count] || 1
        }
      end
      if opts[:supporter_count]
        session_opts[:line_items] << {
          price: supporter_price_id, quantity: (opts[:gift_count] || 1) * (opts[:supporter_count] || 1)
        }
      end
    elsif opts[:purchase]
      discountable = true
      session_opts[:metadata][:user_id] = opts[:user_id]
      session_opts[:metadata][:action] = 'purchase'
      price_id = purchasing_price_id
      if opts[:eval]
        price_id = eval_price_id
      end
      session_opts[:line_items] << {
        price: purchasing_price_id, quantity: 1
      }
      if opts[:extras]
        session_opts[:line_items] << {
          price: extras_price_id, quantity: 1
        }
      end
      if opts[:supporter_count]
        session_opts[:line_items] << {
          price: supporter_price_id, quantity: (opts[:supporter_count] || 1)
        }
      end
    elsif opts[:extras]
      session_opts[:metadata][:user_id] = opts[:user_id]
      session_opts[:metadata][:action] = 'extras'
      session_opts[:line_items] << {
        price: extras_price_id, quantity: 1
      }
    elsif opts[:custom]
      session_opts[:payment_method_types] = ['card', 'us_bank_account']
      session_opts[:tax_id_collection] = {enabled: true}
      session_opts[:metadata][:action] = 'custom'
      session_opts[:line_items] << {
        price_data: {
          currency: 'USD', 
          unit_amount: opts[:dollars] * 100,
          product_data: {
            name: "CoughDrop Custom Purchase",
            description: opts[:description],
            metadata: {temp_product: true}
          }
        }
      }
    end
    if opts[:discount_code] && !active_sale? && discountable
      # Create a coupon
      gift = GiftPurchase.find_by_code(opts[:discount_code]) rescue nil
      return false unless gift || gift.already_used

      coupon = Stripe::Coupon.create({
        metadata: {discount_code: opts[:discount_code]},
        percent_off: 100.0 * (1.0 - gift.discount_percent),
        applies_to: {
          producs: [standard_product_id]
        }
      })
      session_opts[:discounts] = [{coupon: coupon['id']}]
    end
    session = Stripe::Checkout::Session.create(session_opts)
    opts['opts'] = opts
    opts['nonce'] = GoSecure.nonce('purchase_session_nonce')
    RedisAccess.default.setex("purchase_settings/#{session.id}", 36.hours.to_i, opts.to_json)
    session.id
  end

  def self.confirm_purchase(session_id)
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    Stripe.api_version = '2020-03-02'
    session = Stripe::Checkout::Session.retrieve({id: session_id, expand: ['customer.invoice_settings.default_payment_method', 'subscription.default_payment_method', 'payment_intent.payment_method']})
    return false unless session
    status = session['status'] # open, complete, expired
    payment_status = session['payment_status'] # paid, unpaid, no_payment_required
    subscription = session['subscription']
    customer = session['customer']
    method = (session['payment_intent'] || {})['payment_method']
    method ||= (session['subscription'] || {})['default_payment']
    method ||= ((session['customer'] || {})['invoice_settings'] || {})['default_payment_method']
    opts = JSON.parse(RedisAccess.default.get("purchase_settings/#{session_id}"))['opts'] rescue nil
    opts ||= session.metadata['purchase_options']
    if !customer && !subscription
      return false
    end
    add_purchase_summary(opts, method)
    
    user_id = opts['user_id']
    user = User.find_by_path(user_id)
    customer_meta = customer && customer['metadata'] || {}
    if subscription && (subscription['metadata'] || {})['user_id'] != user_id
      subscription.metadata ||= {}
      subscription.metadata['user_id'] = user_id
      subscription.save
    end
    if (customer_meta['user_id'] != user_id) && customer_meta['platform_source'] == 'lingolinq'
      customer.metadata ||= {}
      customer.metadata['user_id'] = user_id
      customer.save
    end

    if opts['subscription']
      if user && session.metadata['action'] == 'subscribe'
        opts['extras']
        opts['supporter_count']
        # finalize subscription
      else
      end
    elsif opts['gift']
      if user && session.metadata['action'] == 'gift'
        opts['giver_data']
        opts['gift_count']
        opts['extras']
        opts['supporter_count']
        # enable gift
      else
      end
    elsif opts['purchase']
      if user && session.metadata['action'] == 'purchase'
        !!opts['eval']
        opts['extras']
        opts['supporter_count']
        # finalize purchase
      else
      end
    elsif opts['extras']
      if user && session.metadata['action'] == 'extras'
        # add extras
      else
      end
    elsif opts['custom']
      if session.metadata['action'] == 'custom'
        # finalize purchase
      else
      end
    end
    if session.metadata['purchase_options']
      session.metadata['processed'] = true
      # TODO: session.metadata['purchase_options'] = null ???
      session.save
    end

    user
  end
end
