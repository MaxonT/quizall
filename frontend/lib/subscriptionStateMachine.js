/**
 * Subscription State Machine
 * 
 * Manages subscription flow state transitions
 */

export const SubscriptionState = {
  IDLE: 'idle',
  CHECK_AUTH: 'check_auth',
  AUTH_MODAL: 'auth_modal',
  CREATING_CHECKOUT: 'creating_checkout',
  REDIRECTING_TO_STRIPE: 'redirecting_to_stripe',
  CONFIRMING_PAYMENT: 'confirming_payment',
  ACTIVATED: 'activated',
  CHECKOUT_FAILED: 'checkout_failed',
  PAYMENT_FAILED: 'payment_failed',
  WEBHOOK_TIMEOUT: 'webhook_timeout',
  ALREADY_SUBSCRIBED: 'already_subscribed',
  BILLING_PORTAL: 'billing_portal',
  NETWORK_ERROR: 'network_error',
};

export const StateTransitions = {
  [SubscriptionState.IDLE]: {
    SUBSCRIBE_CLICK: SubscriptionState.CHECK_AUTH,
    LOAD_STATUS: SubscriptionState.CHECK_AUTH,
  },
  [SubscriptionState.CHECK_AUTH]: {
    LOGGED_IN: SubscriptionState.CREATING_CHECKOUT,
    NOT_LOGGED_IN: SubscriptionState.AUTH_MODAL,
    ALREADY_SUBSCRIBED: SubscriptionState.ALREADY_SUBSCRIBED,
  },
  [SubscriptionState.AUTH_MODAL]: {
    AUTH_SUCCESS: SubscriptionState.CHECK_AUTH,
    AUTH_CANCEL: SubscriptionState.IDLE,
    AUTH_FAILED: SubscriptionState.AUTH_MODAL,
  },
  [SubscriptionState.CREATING_CHECKOUT]: {
    CHECKOUT_CREATED: SubscriptionState.REDIRECTING_TO_STRIPE,
    CHECKOUT_ERROR: SubscriptionState.CHECKOUT_FAILED,
    NETWORK_ERROR: SubscriptionState.NETWORK_ERROR,
  },
  [SubscriptionState.REDIRECTING_TO_STRIPE]: {
    STRIPE_SUCCESS: SubscriptionState.CONFIRMING_PAYMENT,
    STRIPE_CANCEL: SubscriptionState.IDLE,
  },
  [SubscriptionState.CONFIRMING_PAYMENT]: {
    WEBHOOK_RECEIVED: SubscriptionState.ACTIVATED,
    TIMEOUT: SubscriptionState.WEBHOOK_TIMEOUT,
    VERIFIED: SubscriptionState.ACTIVATED,
  },
  [SubscriptionState.CHECKOUT_FAILED]: {
    RETRY: SubscriptionState.CREATING_CHECKOUT,
    GIVE_UP: SubscriptionState.IDLE,
  },
  [SubscriptionState.NETWORK_ERROR]: {
    RETRY: SubscriptionState.CREATING_CHECKOUT,
    CANCEL: SubscriptionState.IDLE,
  },
  [SubscriptionState.WEBHOOK_TIMEOUT]: {
    RETRY_VERIFY: SubscriptionState.CONFIRMING_PAYMENT,
    CONTACT_SUPPORT: SubscriptionState.IDLE,
  },
  [SubscriptionState.ALREADY_SUBSCRIBED]: {
    MANAGE: SubscriptionState.BILLING_PORTAL,
    CLOSE: SubscriptionState.IDLE,
  },
};

export class SubscriptionStateMachine {
  constructor(initialState = SubscriptionState.IDLE) {
    this.currentState = initialState;
    this.listeners = [];
    this.history = [{ state: initialState, timestamp: Date.now() }];
    this.error = null; // Store error context
  }

  getState() {
    return this.currentState;
  }

  canTransition(event) {
    const transitions = StateTransitions[this.currentState];
    return transitions && transitions[event] !== undefined;
  }

  transition(event, context = {}) {
    if (!this.canTransition(event)) {
      console.warn(`[FSM] Invalid transition: ${this.currentState} -> ${event}`);
      return false;
    }

    const previousState = this.currentState;
    this.currentState = StateTransitions[this.currentState][event];
    
    this.history.push({
      state: this.currentState,
      event,
      context,
      timestamp: Date.now(),
    });

    console.log(`[FSM] ${previousState} --[${event}]--> ${this.currentState}`);

    this.notifyListeners(previousState, this.currentState, event, context);
    return true;
  }

  onStateChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notifyListeners(from, to, event, context) {
    this.listeners.forEach(callback => {
      try {
        callback(from, to, event, context);
      } catch (err) {
        console.error('[FSM] Listener error:', err);
      }
    });
  }

  reset() {
    this.currentState = SubscriptionState.IDLE;
    this.history = [{ state: SubscriptionState.IDLE, timestamp: Date.now() }];
  }

  getHistory() {
    return this.history;
  }

  // Add transitionTo method for direct state transitions (bypasses event system)
  transitionTo(newState, context = {}) {
    const previousState = this.currentState;
    this.currentState = newState;
    
    // Store error in context if provided
    if (context.error) {
      this.error = context.error;
    }
    
    this.history.push({
      state: this.currentState,
      event: 'direct_transition',
      context,
      timestamp: Date.now(),
    });

    console.log(`[FSM] Direct transition: ${previousState} → ${newState}`);

    // Notify listeners (but use onStateChange signature for compatibility)
    this.notifyListeners(previousState, this.currentState, 'direct_transition', context);
    return true;
  }

  // Add on method as alias for onStateChange
  on(event, callback) {
    if (event === 'stateChange') {
      return this.onStateChange(callback);
    }
    console.warn(`[FSM] Unknown event: ${event}`);
  }
}
