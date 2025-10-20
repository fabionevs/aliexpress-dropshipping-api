require('dotenv').config();
const { DropshipperClient } = require('ae_sdk');

/**
 * Este script demonstra duas formas:
 * 1) client.productDetails({...}) -> tipada (equivale ao aliexpress.ds.product.get)
 * 2) client.callAPIDirectly('aliexpress.ds.product.get', params) -> chamada direta
 *
 * Observação:
 * - O SDK já assina as requisições e cuida de timestamp/nonce internamente.
 * - Use access tokens VÁLIDOS para a app e escopo de Dropshipping.
 */

async function main() {
    const app_key = '';
    const app_secret = '';
    const session = '';
    const product_id = Number(1005005219784191);

    if (!app_key || !app_secret || !session) {
        console.error('Faltam variáveis no .env (AE_APP_KEY, AE_APP_SECRET, AE_ACCESS_TOKEN).');
        process.exit(1);
    }

    const client = new DropshipperClient({
        app_key,
        app_secret,
        session, // access_token
    });

    const productResponse = await client.productDetails({
        product_id: product_id,
        ship_to_country: "BR",
        target_currency: "BRL",
        target_language: "PT_br",
    });

    if (productResponse.ok) {
        console.log(JSON.stringify(productResponse, null, 2));
    }

}


main().catch((e) => {
    console.error('Falha inesperada:', e);
    process.exit(1);
});