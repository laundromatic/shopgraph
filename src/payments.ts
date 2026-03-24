import Stripe from 'stripe';
import type { MppChallenge, PaymentReceipt } from './types.js';
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
}
