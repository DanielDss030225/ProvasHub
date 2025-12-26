import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '../../../../lib/firebase';
import { doc, runTransaction, increment } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

const getStripe = () => {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY is not defined');
    }
    return new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2024-06-20' as any,
    });
};

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature')!;

    let event: Stripe.Event;
    const stripe = getStripe();

    try {
        if (!endpointSecret) {
            console.warn('STRIPE_WEBHOOK_SECRET is missing. Skipping verification (not recommended for production)');
            event = JSON.parse(body);
        } else {
            event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
        }
    } catch (err: any) {
        console.error(`Webhook Error: ${err.message}`);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;

        const userId = session.metadata?.userId;
        const coins = parseInt(session.metadata?.coins || '0');

        if (userId && coins > 0) {
            try {
                await runTransaction(db, async (transaction) => {
                    const userRef = doc(db, "users", userId);
                    const userDoc = await transaction.get(userRef);

                    if (userDoc.exists()) {
                        transaction.update(userRef, {
                            credits: increment(coins),
                            totalPurchased: increment(coins),
                            lastPurchaseAt: new Date()
                        });

                        // Create notification
                        const notificationRef = doc(db, "users", userId, "notifications", `pay_${session.id}`);
                        transaction.set(notificationRef, {
                            type: 'payment_success',
                            title: 'Pagamento Confirmado!',
                            message: `Parabéns! Você recebeu ${coins} coins.`,
                            read: false,
                            createdAt: new Date(),
                            metadata: {
                                amount: coins,
                                sessionId: session.id
                            }
                        });
                    }
                });
                console.log(`Successfully added ${coins} credits to user ${userId}`);
            } catch (error) {
                console.error('Error updating user credits via webhook:', error);
                return NextResponse.json({ error: 'Firestore update failed' }, { status: 500 });
            }
        }
    }

    return NextResponse.json({ received: true });
}
