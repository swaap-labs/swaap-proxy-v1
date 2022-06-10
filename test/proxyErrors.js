const TProxyErr = artifacts.require('TProxyErr');
const truffleAssert = require('truffle-assertions');

contract('Proxy errors Library', async (accounts) => {

    describe('Proxy errors Library', () => {

        let tProxyErr;

        before(async () => {
            tProxyErr = await TProxyErr.new();    
        });

        it('Does not revert when condition is true', async () => {
            await tProxyErr._requireTest(true, 1);
        });
        
        it('Reverts with message "PROOXY#00"', async() => {
            await truffleAssert.reverts(tProxyErr._requireTest(false, 0), 'PROOXY#00');
        });

        it('Reverts with message "PROOXY#01"', async() => {
            await truffleAssert.reverts(tProxyErr._requireTest(false, 1), 'PROOXY#01');
        });

    });
});
