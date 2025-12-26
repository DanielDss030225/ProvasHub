import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

const getStripe = () => {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY is not defined');
    }
    return new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2024-06-20' as any,
    });
};

const CREDIT_PACKAGES = {
    'silver': { coins: 150, price: 1.50, name: 'Prata' },
    'gold': { coins: 500, price: 4.00, name: 'Ouro' },
    'diamond': { coins: 1500, price: 12.00, name: 'Diamante' },
};

export async function POST(req: Request) {
    try {
        const { packageId, userId, userName, userEmail } = await req.json();

        if (!process.env.STRIPE_SECRET_KEY) {
            console.error('STRIPE_SECRET_KEY is missing');
            return NextResponse.json({ error: 'Configuração da Stripe faltando (Secret Key)' }, { status: 500 });
        }

        if (!process.env.NEXT_PUBLIC_APP_URL) {
            console.error('NEXT_PUBLIC_APP_URL is missing');
            return NextResponse.json({ error: 'Configuração do App faltando (APP_URL)' }, { status: 500 });
        }

        const stripe = getStripe();

        const pack = CREDIT_PACKAGES[packageId as keyof typeof CREDIT_PACKAGES];
        if (!pack) {
            return NextResponse.json({ error: 'Pacote inválido' }, { status: 400 });
        }

        const session = await stripe.checkout.sessions.create({
            automatic_payment_methods: {
                enabled: true,
            },
            line_items: [
                {
                    price_data: {
                        currency: 'brl',
                        product_data: {
                            name: `Pacote ${pack.name} - ProvasHub`,
                            description: `${pack.coins} Coins para resolver questões e simulados.`,
                        },
                        unit_amount: Math.round(pack.price * 100),
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?purchase=success`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?purchase=cancel`,
            customer_email: userEmail,
            metadata: {
                userId: userId,
                packageId: packageId,
                coins: pack.coins.toString(),
            },
        } as any);

        return NextResponse.json({ url: session.url });

    } catch (error: any) {
        console.error('Stripe Checkout Error:', error);
        return NextResponse.json({
            error: 'Erro ao criar sessão de checkout',
            details: error.message
        }, { status: 500 });
    }
}
