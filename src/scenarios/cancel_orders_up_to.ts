import { assetDataUtils, BigNumber, ContractWrappers, Order } from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import { NETWORK_ID, NULL_ADDRESS, ZERO } from '../constants';
import { providerEngine } from '../contracts';
import {
    awaitTransactionMinedSpinnerAsync,
    printData,
    printOrderInfos,
    printScenario,
    printTransaction,
} from '../print_utils';

export async function scenario() {
    // In this scenario, the maker creates and signs many orders for selling ZRX for WETH.
    // The maker is able to cancel all of these orders effeciently by using cancelOrdersUpTo
    printScenario('Cancel Orders Up To');
    // Initialize the ContractWrappers, this provides helper functions around calling
    // contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, { networkId: NETWORK_ID });
    // Initialize the Web3Wraper, this provides helper functions around calling
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [maker, taker] = await web3Wrapper.getAvailableAddressesAsync();
    printData('Accounts', [['Maker', maker], ['Taker', taker]]);

    // the amount the maker is selling in maker asset
    const makerAssetAmount = new BigNumber(100);
    // the amount the maker is wanting in taker asset
    const takerAssetAmount = new BigNumber(10);
    // 0x v2 uses asset data to encode the correct proxy type and additional parameters
    const etherTokenAddress = contractWrappers.etherToken.getContractAddressIfExists();
    const zrxTokenAddress = contractWrappers.exchange.getZRXTokenAddress();
    const makerAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
    const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);

    // Set up the Order and fill it
    const oneMinute = 60 * 1000;
    const tenMinutes = 10 * oneMinute;
    const randomExpiration = new BigNumber(Date.now() + tenMinutes);
    const exchangeAddress = contractWrappers.exchange.getContractAddress();

    // Rather than using a random salt, we use an incrementing salt value.
    // When combined with cancelOrdersUpTo, all lesser values of salt can be cancelled
    // This allows the maker to cancel many orders with one on-chain transaction

    // Create the order
    const order1 = {
        exchangeAddress,
        makerAddress: maker,
        takerAddress: NULL_ADDRESS,
        senderAddress: NULL_ADDRESS,
        feeRecipientAddress: NULL_ADDRESS,
        expirationTimeSeconds: randomExpiration,
        salt: new BigNumber(Date.now() - tenMinutes),
        makerAssetAmount,
        takerAssetAmount,
        makerAssetData,
        takerAssetData,
        makerFee: ZERO,
        takerFee: ZERO,
    } as Order;

    const order2 = {
        ...order1,
        salt: new BigNumber(Date.now() - oneMinute),
    } as Order;

    const order3 = {
        ...order1,
        salt: new BigNumber(Date.now()),
    } as Order;

    // Fetch and print the order info
    let order1Info = await contractWrappers.exchange.getOrderInfoAsync(order1);
    let order2Info = await contractWrappers.exchange.getOrderInfoAsync(order2);
    let order3Info = await contractWrappers.exchange.getOrderInfoAsync(order3);
    printOrderInfos({ order1: order1Info, order2: order2Info, order3: order3Info });

    // Maker cancels all orders before and including order2, order3 remains valid
    const targetOrderEpoch = order2.salt;
    const txHash = await contractWrappers.exchange.cancelOrdersUpToAsync(targetOrderEpoch, maker);
    const txReceipt = await awaitTransactionMinedSpinnerAsync('cancelOrdersUpTo', txHash, web3Wrapper);
    printTransaction('cancelOrdersUpTo', txReceipt, [['targetOrderEpoch', targetOrderEpoch.toString()]]);
    // Fetch and print the order info
    order1Info = await contractWrappers.exchange.getOrderInfoAsync(order1);
    order2Info = await contractWrappers.exchange.getOrderInfoAsync(order2);
    order3Info = await contractWrappers.exchange.getOrderInfoAsync(order3);
    printOrderInfos({ order1: order1Info, order2: order2Info, order3: order3Info });

    // Stop the Provider Engine
    providerEngine.stop();
}

(async () => {
    try {
        if (!module.parent) await scenario();
    } catch (e) {
        console.log(e);
        providerEngine.stop();
    }
})();
