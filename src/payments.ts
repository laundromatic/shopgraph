import Stripe from 'stripe';
import type { MppChallenge, PaymentReceipt, SubscriptionTier } from './types.js';
import { TOOL_PRICING } from './types.js';

/**
 * Payment manager using Stripe for MPP (Machine Payments Protocol).
 *
 * Flow:
 * 1. Agent calls tool without payment credentials
 * 2. Server returns 402 + MppChallenge describing payment requirements
 * 3. Agent obtains payment method and calls again with payment_method_id
 * 4. Server creates PaymentIntent, confirms it, processes request
 * 5. Server returns result + PaymentReceipt
 */
export class PaymentManager {
  private stripe: Stripe;

  constructor(secretKey?: string) {
    const key = secretKey ?? process.env.STRIPE_TEST_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_TEST_SECRET_KEY is required');
    }
    this.stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion });
  }

  /**
   * Generate an MPP challenge for a tool invocation.
   */
  createChallenge(toolName: keyof typeof TOOL_PRICING): MppChallenge {
    const amount = TOOL_PRICING[toolName];
    return {
      type: 'payment_required',
      provider: 'stripe',
      amount,
      currency: 'usd',
      description: `ShopGraph: ${toolName} ($${(amount / 100).toFixed(2)})`,
      payment_methods: ['card'],
    };
  }

  /**
   * Process payment for a tool invocation.
   * Creates and confirms a PaymentIntent in one step.
   */
  async processPayment(
    toolName: keyof typeof TOOL_PRICING,
    paymentMethodId: string,
  ): Promise<PaymentReceipt> {
    const amount = TOOL_PRICING[toolName];

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      description: `ShopGraph: ${toolName}`,
      metadata: {
        tool: toolName,
        protocol: 'mpp',
      },
    });

    return {
      payment_intent_id: paymentIntent.id,
      amount,
      currency: 'usd',
      status: paymentIntent.status,
      tool: toolName,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Verify a payment was successful.
   */
  async verifyPayment(paymentIntentId: string): Promise<boolean> {
    const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    return pi.status === 'succeeded';
  }

  /**
   * Create a Stripe Checkout Session for a subscription tier.
   * Returns the checkout URL.
   */
  async createSubscriptionCheckout(
    tier: SubscriptionTier,
    email: string,
    customerId: string,
  ): Promise<string> {
    const priceEnvMap: Record<string, string | undefined> = {
      starter: process.env.STRIPE_PRICE_STARTER,
      growth: process.env.STRIPE_PRICE_GROWTH,
    };

    const priceId = priceEnvMap[tier];
    if (!priceId) {
      throw new Error(`No Stripe price configured for tier: ${tier}`);
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL ?? 'https://shopgraph.dev'}/dashboard.html?checkout=success`,
      cancel_url: `${process.env.APP_URL ?? 'https://shopgraph.dev'}/dashboard.html?checkout=cancelled`,
      metadata: {
        shopgraph_customer_id: customerId,
      },
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }
    return session.url;
  }

  /**
   * Create a Stripe Customer Portal session.
   * Returns the portal URL.
   */
  async createCustomerPortal(stripeCustomerId: string): Promise<string> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.APP_URL ?? 'https://shopgraph.dev'}/dashboard.html`,
    });
    return session.url;
  }

  /**
   * Verify a Stripe webhook signature and return the parsed event.
   */
  verifyWebhookSignature(payload: Buffer, signature: string): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
