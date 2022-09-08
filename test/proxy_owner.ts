import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

describe("Proxy ownership and pausable", async () => {

    let owner: SignerWithAddress, otherAccount:SignerWithAddress;

    const wmaticAddress = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"; // wrapped matic on polygon
    const nativeAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    // Aggregators addresses
    const zeroEx   = "0xdef1c0ded9bec7f1a1670819833240f027b25eff";
    const paraswap = "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57";
    const oneInch  = "0x1111111254fb6c44bAC0beD2854e76F90643097d";

    async function deployProxy() {   
        const PROXY = await ethers.getContractFactory("Proxy");
        const proxy = await PROXY.deploy(wmaticAddress, zeroEx, paraswap, oneInch);
        return proxy;
    }

    before(async() => {
        [owner, otherAccount] = await ethers.getSigners();
        const proxy = await loadFixture(deployProxy);
        expect(proxy.address).not.to.equal(undefined);    
    });

    describe("Transfer ownership", async () => {

        it('Reverts if non-admin tries to set swaaplabs address', async () => {
            const proxy = await loadFixture(deployProxy);
            
            await expect(
                proxy.connect(otherAccount).transferOwnership(otherAccount.address)
            ).to.be.revertedWith("PROOXY#07");
            
            await expect(
                proxy.connect(otherAccount).acceptOwnership()
            ).to.be.revertedWith('PROOXY#08');
        });

        it('Transfer swaaplabs address', async () => {
            const proxy = await loadFixture(deployProxy);
            
            proxy.connect(owner).transferOwnership(otherAccount.address);
            proxy.connect(otherAccount).acceptOwnership();

            expect(await proxy.callStatic.getSwaaplabs()).to.be.equal(otherAccount.address);
        });

    });


    describe("Pausable proxy", async () => {

        let proxy: any;
        let factory: any;
        
        it('Reverts if non-admin tries to pause the proxy', async() => {
            
            proxy = await loadFixture(deployProxy);
            
            await expect(
                proxy.connect(otherAccount).pauseProxy()
            ).to.be.revertedWith('PROOXY#07');
        });
        
        it('Pause the proxy', async () => {

            const MATH = await ethers.getContractFactory("Math");
            const math = await MATH.deploy();

            const FACTORY = await ethers.getContractFactory("Factory", {libraries: {Math: math.address}});
            factory = await FACTORY.deploy();
            
            let bindTokens: any = [];
            const finalize = false;
            const deadline = Math.floor(Date.now()/1000) +30 * 60;

            await proxy.connect(owner).pauseProxy();
            await expect(proxy.createPool(bindTokens, factory.address, finalize, deadline)).to.be.revertedWith("PROOXY#09");

        });

        it('Reverts if non-admin tries to resume the proxy', async () => {
        
            await expect(proxy.connect(otherAccount).resumeProxy()).to.be.revertedWith("PROOXY#07");

        });
        
        
        it('Resume proxy', async () => {
            
            await proxy.connect(owner).resumeProxy();
            
            let bindTokens: any = [];
            const finalize = false;
            const deadline = Math.floor(Date.now()/1000) +30 * 60; 
            
            await proxy.createPool(bindTokens, factory.address, finalize, deadline);
        });

    });

});