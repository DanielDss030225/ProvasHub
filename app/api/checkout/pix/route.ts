import { NextResponse } from 'next/server';

const PAGSEGURO_TOKEN = process.env.PAGSEGURO_TOKEN;
const PAGSEGURO_EMAIL = process.env.PAGSEGURO_EMAIL;
const PAGSEGURO_ENV = process.env.PAGSEGURO_ENV || 'sandbox'; // 'sandbox' or 'production'

const PAGSEGURO_URL = PAGSEGURO_ENV === 'production'
    ? 'https://api.pagseguro.com'
    : 'https://sandbox.api.pagseguro.com';

const CREDIT_PACKAGES = {
    'silver': { coins: 150, price: 1.50, name: 'Prata' },
    'gold': { coins: 500, price: 4.00, name: 'Ouro' },
    'diamond': { coins: 1500, price: 12.00, name: 'Diamante' },
};

export async function POST(req: Request) {
    try {
        const { packageId, userId, userName, userEmail } = await req.json();

        if (!PAGSEGURO_TOKEN) {
            return NextResponse.json({ error: 'Configuração do PagSeguro faltando' }, { status: 500 });
        }

        const pack = CREDIT_PACKAGES[packageId as keyof typeof CREDIT_PACKAGES];
        if (!pack) {
            return NextResponse.json({ error: 'Pacote inválido' }, { status: 400 });
        }

        // PagSeguro expects value in cents
        const amountValue = Math.round(pack.price * 100);

        const orderBody = {
            reference: `coins_${packageId}_${userId}_${Date.now()}`,
            customer: {
                name: userName || 'Usuário ProvasHub',
                email: userEmail || 'contato@provashub.com.br',
                tax_id: "12345678909", // Standard fake CPF for testing if not provided
                phones: [
                    {
                        country: "55",
                        area: "11",
                        number: "999999999",
                        type: "MOBILE"
                    }
                ]
            },
            items: [
                {
                    reference: packageId,
                    name: `Pacote ${pack.name} - ${pack.coins} Coins`,
                    quantity: 1,
                    unit_amount: amountValue
                }
            ],
            qr_codes: [
                {
                    amount: {
                        value: amountValue
                    },
                    expiration_date: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 mins
                }
            ],
            notification_urls: [
                `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/pagseguro`
            ]
        };

        const response = await fetch(`${PAGSEGURO_URL}/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json',
                'accept': 'application/json'
            },
            body: JSON.stringify(orderBody)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('PagSeguro API Error:', data);
            return NextResponse.json({ error: 'Erro ao criar pedido no PagSeguro', details: data }, { status: response.status });
        }

        // Extract QR Code info
        const qrCode = data.qr_codes?.[0];

        return NextResponse.json({
            orderId: data.id,
            reference: data.reference,
            qrCodeImage: qrCode?.links?.find((l: any) => l.rel === 'QRCODE.PNG')?.href,
            qrCodeText: qrCode?.text,
            status: data.status
        });

    } catch (error: any) {
        console.error('Checkout API Error:', error);
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}
