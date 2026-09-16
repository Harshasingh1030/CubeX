const { ethers } = require('ethers');
require('dotenv').config();

// Contract Configuration
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const RPC_URL = process.env.SEPOLIA_RPC_URL;
let PRIVATE_KEY = process.env.PRIVATE_KEY;

// Sanitize Private Key
if (PRIVATE_KEY) {
    PRIVATE_KEY = PRIVATE_KEY.replace(/\s/g, '').replace(/^["']|["']$/g, '');
    if (!PRIVATE_KEY.startsWith("0x")) PRIVATE_KEY = "0x" + PRIVATE_KEY;
}

// Normalize Contract Address
let NORMALIZED_CONTRACT_ADDRESS = CONTRACT_ADDRESS;
try {
    if (CONTRACT_ADDRESS) {
        // Force lowercase to ensure we generate the correct checksum
        // ignoring any user-provided incorrect casing
        NORMALIZED_CONTRACT_ADDRESS = ethers.getAddress(CONTRACT_ADDRESS.toLowerCase());
    }
} catch (error) {
    console.error("CRITICAL ERROR: Invalid CONTRACT_ADDRESS format in .env");
    console.error(error.message);
}

console.log("--- Configuration Check ---");
console.log("RPC_URL:", RPC_URL ? "Set" : "Missing");
console.log("CONTRACT_ADDRESS:", NORMALIZED_CONTRACT_ADDRESS ? "Set (Normalized)" : "Missing");
console.log("PRIVATE_KEY:", PRIVATE_KEY ? `Set (Length: ${PRIVATE_KEY.length})` : "Missing");

if (PRIVATE_KEY) {
    // Safe Safe Print
    const start = PRIVATE_KEY.substring(0, 4);
    const end = PRIVATE_KEY.substring(PRIVATE_KEY.length - 4);
    console.log(`Key Preview: ${start}...${end}`);
}

if (!PRIVATE_KEY || PRIVATE_KEY.includes("YOUR_PRIVATE_KEY")) {
    console.error("ERROR: PRIVATE_KEY is not set or is still the default value.");
}
console.log("---------------------------");


// Minimal ABI for now to avoid runtime errors before compilation
const MINIMAL_ABI = [
    "function getTokenPrice() view returns (uint256)",
    "function buyTokens(uint256 amount) payable",
    "function sellTokens(uint256 amount) external",
    "function transfer(address to, uint256 amount) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event TokenPurchased(address indexed buyer, uint256 amount, uint256 cost)",
    "event TokenSold(address indexed seller, uint256 amount, uint256 refund)"
];


const getProvider = () => {
    return new ethers.JsonRpcProvider(RPC_URL);
};

const getSigner = () => {
    const provider = getProvider();
    try {
        if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY is undefined or empty");
        // Log length to verify it's still available
        console.log(`[getSigner] Using Key Length: ${PRIVATE_KEY.length}`);
        return new ethers.Wallet(PRIVATE_KEY, provider);
    } catch (error) {
        console.error("[getSigner] FAILED to create wallet!");
        console.error(`[getSigner] Key Value (First 4 chars): ${PRIVATE_KEY ? PRIVATE_KEY.substring(0, 4) : 'undefined'}`);
        throw error;
    }
};

const getContract = (signerOrProvider) => {
    return new ethers.Contract(NORMALIZED_CONTRACT_ADDRESS, MINIMAL_ABI, signerOrProvider);
};

exports.getTokenPrice = async (req, res) => {
    try {
        
        
        res.json({
            inr: 20000,
            eth: 0.080321
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.buyTokens = async (req, res) => {
    let { walletAddress, amount } = req.body;
    try {
        if (!walletAddress) throw new Error("Wallet Address is missing");
        walletAddress = ethers.getAddress(walletAddress.toLowerCase());
        
        
        const signer = getSigner();
        const contract = getContract(signer);
        
        
        
        const amountWei = ethers.parseEther(amount.toString());
        const pricePerToken = ethers.parseEther("0.080321");
        
        const costWei = (BigInt(amountWei) * BigInt(pricePerToken)) / BigInt("1000000000000000000"); // / 1e18
        
       
        const valueToSend = (costWei * BigInt(120)) / BigInt(100);

        console.log(`[buyTokens] Amount: ${amount} CUBEX`);
        console.log(`[buyTokens] Calculated Cost: ${costWei.toString()} Wei`);
        console.log(`[buyTokens] Sending Value (120%): ${valueToSend.toString()} Wei`);

       
        const tx = await contract.buyTokens(amountWei, { value: valueToSend });
        await tx.wait();
        
        // Transfer to user
        const transferTx = await contract.transfer(walletAddress, amountWei);
        await transferTx.wait();

        res.json({ success: true, txHash: transferTx.hash, buyHash: tx.hash });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

exports.sellTokens = async (req, res) => {
    let { walletAddress, amount } = req.body;
    try {
        if (!walletAddress) throw new Error("Wallet Address is missing");
        walletAddress = ethers.getAddress(walletAddress.toLowerCase());
        
        
        
        const signer = getSigner();
        const contract = getContract(signer);
        const amountWei = ethers.parseEther(amount.toString());
        
        const tx = await contract.sellTokens(amountWei);
        await tx.wait();
        
        res.json({ success: true, txHash: tx.hash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getTransactionHistory = async (req, res) => {
    const { wallet } = req.params;
    try {
        const provider = getProvider();
        const contract = getContract(provider); // Read-only
        
        
        let targetWallet = wallet;
        try {
            targetWallet = ethers.getAddress(wallet); // Normalize for safety
        } catch (e) {
            return res.status(400).json({ error: "Invalid wallet address" });
        }

        // 1. Get Transfers TO the user (Buys / Incoming)
        const transferToFilter = contract.filters.Transfer(null, targetWallet);
        const transferToEvents = await contract.queryFilter(transferToFilter);

        // 2. Get TokenSold by user (Sells / Outgoing)
    
        
        // Let's look for Transfers FROM the user.
        const transferFromFilter = contract.filters.Transfer(targetWallet, null);
        const transferFromEvents = await contract.queryFilter(transferFromFilter);

        // Format events
        const history = [
            ...transferToEvents.map(e => ({
                type: 'BUY (In)',
                hash: e.transactionHash,
                amount: ethers.formatEther(e.args.value),
                ethValue: "N/A", // Cannot easily get ETH cost from Transfer event withouttx receipt
                timestamp: Date.now()
            })),
            ...transferFromEvents.map(e => ({
                type: 'SELL (Out)',
                hash: e.transactionHash,
                amount: ethers.formatEther(e.args.value),
                ethValue: "N/A", 
                timestamp: Date.now()
            }))
        ];
        
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
