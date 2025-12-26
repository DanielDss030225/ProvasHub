import { NextResponse } from 'next/server';
import { db } from '../../../../lib/firebase';
import { doc, runTransaction, increment } from 'firebase/firestore';

const PAGSEGURO_TOKEN = process.env.PAGSEGURO_TOKEN;

const CREDIT_PACKAGES: Record<string, number> = {
    'silver': 150,
    'gold': 500,
    'diamond': 1500,
};

export async function POST(req: Request) {
    try {
        const payload = await req.json();
        console.log('PagSeguro Webhook received:', payload);

        // Verify transaction status
        // status options: PAID, DECLINED, CANCELED, WAITING, ...
        if (payload.status === 'PAID') {
            const reference = payload.reference; // 'coins_silver_USERID_TIMESTAMP'

            if (!reference || !reference.startsWith('coins_')) {
                return NextResponse.json({ message: 'Ignore: Not a coin purchase' }, { status: 200 });
            }

            const parts = reference.split('_');
            const packageId = parts[1];
            const userId = parts[2];
            const coins = CREDIT_PACKAGES[packageId] || 0;

            if (coins > 0 && userId) {
                console.log(`Processing credits for user ${userId}: +${coins} coins`);

                await runTransaction(db, async (transaction) => {
                    const userRef = doc(db, "users", userId);
                    const userDoc = await transaction.get(userRef);

                    if (userDoc.exists()) {
                        transaction.update(userRef, {
                            credits: increment(coins),
                            totalPurchased: increment(coins),
                            lastPurchaseAt: new Date()
                        });
                    } else {
                        throw new Error("User document not found");
                    }
                });

                console.log(`Credits successfully added to user ${userId}`);
                return NextResponse.json({ message: 'Credits applied' }, { status: 200 });
            }
        }

        return NextResponse.json({ message: 'Notification received' }, { status: 200 });

    } catch (error: any) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
