import { useState } from 'react';
import { useWriteContract, usePublicClient, useWalletClient } from 'wagmi';
import { useAccount } from 'wagmi';
import { parseUnits, formatUnits } from "viem";
import type { InputBundlerOperation } from "@morpho-org/bundler-sdk-viem";
import { setupBundle, populateBundle } from "@morpho-org/bundler-sdk-viem";
import { BundlerAction } from "@morpho-org/bundler-sdk-viem";
import { ChainId, VaultV2 } from "@morpho-org/blue-sdk";
import { SimulationState } from "@morpho-org/simulation-sdk";

export function useVaultTransactions() {
  const [isLoading, setIsLoading] = useState(false);
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();

  // Base WETH address
  const BASE_WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

  // Check if vault asset is WETH
  const isWethVault = async (vaultAddress: string): Promise<boolean> => {
    try {
      const { assetAddress } = await getAssetInfo(vaultAddress);
      return assetAddress.toLowerCase() === BASE_WETH_ADDRESS.toLowerCase();
    } catch (error) {
      console.error('Failed to check if WETH vault:', error);
      return false;
    }
  };

  // Helper to detect user cancellations (more precise detection)
  const isUserCancellation = (error: any): boolean => {
    if (!error) return false;
    
    console.log('Checking error for user cancellation:', {
      error,
      message: error?.message,
      name: error?.name,
      code: error?.code,
      reason: error?.reason,
      toString: error?.toString()
    });
    
    const errorMessage = (error?.message || error?.toString() || '').toLowerCase();
    const errorCode = error?.code?.toString() || '';
    const errorReason = (error?.reason || '').toLowerCase();
    
    // Primary indicators of user cancellation (more specific)
    const isExplicitRejection = errorMessage.includes('user rejected') ||
           errorMessage.includes('user denied') ||
           errorMessage.includes('rejected by user') ||
           errorMessage.includes('user cancelled') ||
           errorMessage.includes('cancelled by user') ||
           errorMessage.includes('user rejected the request') ||
           errorMessage.includes('request rejected') ||
           errorMessage.includes('transaction rejected') ||
           errorMessage.includes('action rejected') ||
           errorMessage.includes('user declined') ||
           errorMessage.includes('declined by user') ||
           errorMessage.includes('user aborted') ||
           errorMessage.includes('aborted by user');
    
    // Specific error codes that indicate user rejection
    const isRejectionCode = errorCode === '4001' || // User rejected the request
                           errorCode === 'ACTION_REJECTED' ||
                           errorCode === 'USER_REJECTED' ||
                           errorCode === '4900'; // Unauthorized (user rejected)
    
    // Check error reason as well
    const isRejectionReason = errorReason.includes('user rejected') ||
                             errorReason.includes('user denied') ||
                             errorReason.includes('rejected') ||
                             errorReason.includes('cancelled') ||
                             errorReason.includes('denied') ||
                             errorReason.includes('aborted');
    
    const isCancellation = isExplicitRejection || isRejectionCode || isRejectionReason;
    
    console.log('Cancellation check result:', { 
      isExplicitRejection, 
      isRejectionCode, 
      isRejectionReason,
      isCancellation,
      errorMessage, 
      errorCode, 
      errorReason 
    });
    
    return isCancellation;
  };

  // Helper to get asset info with retry logic
  const getAssetInfo = async (vaultAddress: string, retries = 3) => {
    if (!publicClient) throw new Error('Network not available');
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const assetAddress = await publicClient.readContract({
          address: vaultAddress as `0x${string}`,
          abi: [{ "inputs": [], "name": "asset", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function" }],
          functionName: "asset",
        });

        const decimals = await publicClient.readContract({
          address: assetAddress as `0x${string}`,
          abi: [{ "inputs": [], "name": "decimals", "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}], "stateMutability": "view", "type": "function" }],
          functionName: "decimals",
        });

        return { assetAddress, decimals: Number(decimals) };
      } catch (error) {
        console.error(`getAssetInfo attempt ${attempt + 1} failed:`, error);
        
        if (attempt === retries - 1) {
          // Last attempt failed, throw the error
          throw new Error(`Failed to get asset info after ${retries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    
    throw new Error('Failed to get asset info');
  };

  // Approve tokens (step 1)
  const approveTokens = async (vaultAddress: string, amount: string) => {
    try {
      setIsLoading(true);
      
      if (!address) throw new Error('Wallet not connected');
      
      const { assetAddress, decimals } = await getAssetInfo(vaultAddress);
      const amountToApprove = BigInt(parseUnits(amount, decimals));
      
      console.log('Approving tokens:', {
        assetAddress,
        vaultAddress,
        amount,
        amountToApprove: amountToApprove.toString(),
        decimals,
        spender: vaultAddress,
      });
      
      const txHash = await writeContractAsync({
        address: assetAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "address", "name": "spender", "type": "address"},
              {"internalType": "uint256", "name": "amount", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: "approve",
        args: [vaultAddress as `0x${string}`, amountToApprove],
      });

      console.log('Approval transaction hash:', txHash);
      return txHash;
    } catch (error) {
      if (isUserCancellation(error)) {
        throw new Error('Approval was cancelled by user');
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Check if approval is needed
  const checkApprovalNeeded = async (vaultAddress: string, amount: string) => {
    if (!address || !publicClient) throw new Error('Wallet not connected');
    
    // For WETH vaults using bundler, no approval needed (bundler handles it)
    const isWeth = await isWethVault(vaultAddress);
    if (isWeth) {
      return {
        needsApproval: false,
        currentAllowance: '0',
        requiredAmount: amount
      };
    }
    
    const { assetAddress, decimals } = await getAssetInfo(vaultAddress);
    const amountToCheck = BigInt(parseUnits(amount, decimals));
    
    const allowance = await publicClient.readContract({
      address: assetAddress as `0x${string}`,
      abi: [
        {
          "inputs": [
            {"internalType": "address", "name": "owner", "type": "address"},
            {"internalType": "address", "name": "spender", "type": "address"}
          ],
          "name": "allowance",
          "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        }
      ],
      functionName: "allowance",
      args: [address as `0x${string}`, vaultAddress as `0x${string}`],
    });

    return {
      needsApproval: allowance < amountToCheck,
      currentAllowance: formatUnits(allowance, decimals),
      requiredAmount: amount
    };
  };

  // Get bundler address for Base chain
  const getBundlerAddress = async (): Promise<string> => {
    // Try to get from environment variable first (allows override)
    const envBundlerAddress = process.env.NEXT_PUBLIC_MORPHO_BUNDLER_ADDRESS;
    if (envBundlerAddress) {
      return envBundlerAddress;
    }
    
    // Morpho Bundler contract address on Base chain
    // Source: https://docs.morpho.org/getting-started/resources/contracts/bundlers/
    const BASE_BUNDLER_ADDRESS = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb';
    
    return BASE_BUNDLER_ADDRESS;
  };

  // Deposit ETH via bundler (wraps ETH to WETH and deposits)
  const depositEthViaBundler = async (
    vaultAddress: string,
    amount: string,
    userAddress: string
  ): Promise<string> => {
    if (!publicClient || !walletClient) throw new Error('Network not available');
    
    try {
      // Parse amount to wei (ETH has 18 decimals)
      const amountInWei = BigInt(parseUnits(amount, 18));

      // Check ETH balance and reserve some for gas
      const ethBalance = await publicClient.getBalance({
        address: userAddress as `0x${string}`,
      });

      // Reserve ~0.00002 ETH for gas fees on Base (Base has very low gas prices)
      // This should be enough for most transactions on Base
      const gasReserve = BigInt(parseUnits('0.00002', 18));
      const availableBalance = ethBalance > gasReserve ? ethBalance - gasReserve : BigInt(0);

      // Auto-adjust amount if it exceeds available balance
      let finalAmountInWei = amountInWei;
      if (availableBalance < amountInWei) {
        if (availableBalance <= BigInt(0)) {
          const totalFormatted = formatUnits(ethBalance, 18);
          throw new Error(
            `Insufficient ETH balance. You have ${totalFormatted} ETH, which is not enough to cover gas fees (~0.00002 ETH). ` +
            `Please add more ETH to your wallet.`
          );
        }
        
        // Use the maximum available balance
        finalAmountInWei = availableBalance;
        const availableFormatted = formatUnits(availableBalance, 18);
        const requestedFormatted = formatUnits(amountInWei, 18);
        console.log(
          `Deposit amount adjusted from ${requestedFormatted} ETH to ${availableFormatted} ETH ` +
          `(maximum available after reserving gas)`
        );
      }

      // Get bundler address
      const bundlerAddress = await getBundlerAddress();

      // Get current block to create simulation state
      const block = await publicClient.getBlock();
      const blockNumber = BigInt(block.number);
      const blockTimestamp = BigInt(block.timestamp);

      // Read vault contract to get VaultV2 data
      // MetaMorpho VaultV2 ABI (minimal - just what we need)
      const vaultV2ABI = [
        {
          "inputs": [],
          "name": "asset",
          "outputs": [{"internalType": "address", "name": "", "type": "address"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "totalAssets",
          "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "totalSupply",
          "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "virtualShares",
          "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "maxRate",
          "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "lastUpdate",
          "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "adapters",
          "outputs": [{"internalType": "address[]", "name": "", "type": "address[]"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "liquidityAdapter",
          "outputs": [{"internalType": "address", "name": "", "type": "address"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "liquidityData",
          "outputs": [{"internalType": "bytes", "name": "", "type": "bytes"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "performanceFee",
          "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "managementFee",
          "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "performanceFeeRecipient",
          "outputs": [{"internalType": "address", "name": "", "type": "address"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "managementFeeRecipient",
          "outputs": [{"internalType": "address", "name": "", "type": "address"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "name",
          "outputs": [{"internalType": "string", "name": "", "type": "string"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "symbol",
          "outputs": [{"internalType": "string", "name": "", "type": "string"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "decimals",
          "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
          "stateMutability": "view",
          "type": "function"
        }
      ] as const;

      // Read vault data from contract
      const results = await publicClient.multicall({
        contracts: [
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'asset' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'totalAssets' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'totalSupply' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'virtualShares' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'maxRate' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'lastUpdate' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'adapters' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'liquidityAdapter' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'liquidityData' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'performanceFee' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'managementFee' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'performanceFeeRecipient' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'managementFeeRecipient' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'name' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'symbol' },
          { address: vaultAddress as `0x${string}`, abi: vaultV2ABI, functionName: 'decimals' },
        ],
      });

      // Check for errors in contract reads
      const failedReads = results.filter((r) => r.status === 'failure');
      if (failedReads.length > 0) {
        console.error('Failed to read some vault contract data:', failedReads);
        throw new Error(`Failed to read vault contract data. Please verify the vault address is correct.`);
      }

      // Extract results
      const asset = results[0].result as `0x${string}`;
      const totalAssets = results[1].result as bigint;
      const totalSupply = results[2].result as bigint;
      const virtualShares = results[3].result as bigint;
      const maxRate = results[4].result as bigint;
      const lastUpdate = results[5].result as bigint;
      const adapters = (results[6].result as `0x${string}`[]) || [];
      const liquidityAdapter = results[7].result as `0x${string}`;
      const liquidityData = (results[8].result as `0x${string}`) || '0x' as `0x${string}`;
      const performanceFee = results[9].result as bigint;
      const managementFee = results[10].result as bigint;
      const performanceFeeRecipient = results[11].result as `0x${string}`;
      const managementFeeRecipient = results[12].result as `0x${string}`;
      const name = results[13].result as string;
      const symbol = results[14].result as string;
      const decimals = results[15].result as number;

      // Create VaultV2 object
      const vaultV2 = new VaultV2({
        address: vaultAddress as `0x${string}`,
        asset,
        totalAssets,
        _totalAssets: totalAssets, // Same as totalAssets for VaultV2
        totalSupply,
        virtualShares,
        maxRate,
        lastUpdate,
        adapters,
        liquidityAdapter,
        liquidityData,
        liquidityAllocations: undefined, // Can be fetched separately if needed
        performanceFee,
        managementFee,
        performanceFeeRecipient,
        managementFeeRecipient,
        name,
        symbol,
        decimals,
      });

      // Create simulation state with vault data
      const simulationState = new SimulationState({
        chainId: 8453, // Base chain ID
        block: {
          number: blockNumber,
          timestamp: blockTimestamp,
        },
        // Include the vault in vaultV2s
        markets: {},
        users: {},
        tokens: {},
        vaults: {},
        positions: {},
        holdings: {},
        vaultMarketConfigs: {},
        vaultUsers: {},
        vaultV2s: {
          [vaultAddress.toLowerCase()]: vaultV2,
        },
        vaultV2Adapters: {},
      });

      // Create the deposit operation
      const depositOperation: InputBundlerOperation = {
        type: "MetaMorpho_Deposit",
        sender: userAddress as `0x${string}`,
        address: vaultAddress as `0x${string}`,
        args: {
          assets: finalAmountInWei,
          owner: userAddress as `0x${string}`,
        },
      };

      const chainId = 8453 as ChainId; // Base chain ID
      
      // Populate bundle - this will fetch vault data and handle wrapping ETH to WETH and depositing
      // populateBundle will automatically fetch the vault data from the blockchain
      const { steps } = populateBundle(
        [depositOperation],
        simulationState
      );

      // Get the final simulation state - steps is an array of simulation states
      // The last element contains the final state after all operations
      const finalState = Array.isArray(steps) && steps.length > 0 
        ? steps[steps.length - 1] 
        : simulationState;

      // Finalize and setup the bundle with the populated operations
      const { bundle } = setupBundle(
        [depositOperation],
        finalState as SimulationState,
        userAddress as `0x${string}`,
        {
          unwrapTokens: new Set([BASE_WETH_ADDRESS as `0x${string}`]),
        }
      );

      // Encode the bundle
      const encoded = BundlerAction.encodeBundle(chainId, bundle.actions);

      // Send the transaction with ETH value
      const txHash = await walletClient.sendTransaction({
        to: bundlerAddress as `0x${string}`,
        data: encoded.data,
        value: finalAmountInWei + encoded.value, // Include ETH for wrapping
      });

      console.log('Bundler deposit transaction hash:', txHash);
      return txHash;
    } catch (error) {
      console.error('Bundler deposit error:', error);
      if (isUserCancellation(error)) {
        throw new Error('Deposit was cancelled by user');
      }
      throw error;
    }
  };

  // Execute deposit (step 2)
  const executeDeposit = async (vaultAddress: string, amount: string) => {
    try {
      setIsLoading(true);
      
      if (!address) throw new Error('Wallet not connected');
      
      // Check if this is a WETH vault
      const isWeth = await isWethVault(vaultAddress);
      
      if (isWeth) {
        // Use bundler for ETH deposits
        console.log('Using bundler for ETH deposit');
        return await depositEthViaBundler(vaultAddress, amount, address);
      }
      
      // Regular ERC20 token deposit
      const { assetAddress, decimals } = await getAssetInfo(vaultAddress);
      const amountToDeposit = BigInt(parseUnits(amount, decimals));
      
      // Check balance
      const userBalance = await publicClient!.readContract({
        address: assetAddress as `0x${string}`,
        abi: [{ "inputs": [{"internalType": "address", "name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function" }],
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });

      if (userBalance < amountToDeposit) {
        throw new Error(`Insufficient balance. You have ${formatUnits(userBalance, decimals)} tokens.`);
      }

      // Execute deposit
      const txHash = await writeContractAsync({
        address: vaultAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "uint256", "name": "assets", "type": "uint256"},
              {"internalType": "address", "name": "receiver", "type": "address"}
            ],
            "name": "deposit",
            "outputs": [{"internalType": "uint256", "name": "shares", "type": "uint256"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: "deposit",
        args: [amountToDeposit, address as `0x${string}`],
      });

      console.log('Deposit transaction hash:', txHash);
      return txHash;
    } catch (error) {
      if (isUserCancellation(error)) {
        throw new Error('Deposit was cancelled by user');
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Deposit function
  const deposit = async (vaultAddress: string, amount: string) => {
    try {
      setIsLoading(true);
      
      if (!address) throw new Error('Wallet not connected');
      
      const { assetAddress, decimals } = await getAssetInfo(vaultAddress);
      const amountToDeposit = BigInt(parseUnits(amount, decimals));
      
      // Check balance
      const userBalance = await publicClient!.readContract({
        address: assetAddress as `0x${string}`,
        abi: [{ "inputs": [{"internalType": "address", "name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function" }],
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });

      if (userBalance < amountToDeposit) {
        throw new Error(`Insufficient balance. You have ${formatUnits(userBalance, decimals)} tokens.`);
      }

      // Note: Approval should be handled separately using approveTokens function
      
      // Execute deposit
      const txHash = await writeContractAsync({
        address: vaultAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "uint256", "name": "assets", "type": "uint256"},
              {"internalType": "address", "name": "receiver", "type": "address"}
            ],
            "name": "deposit",
            "outputs": [{"internalType": "uint256", "name": "shares", "type": "uint256"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: "deposit",
        args: [amountToDeposit, address as `0x${string}`],
      });

      console.log('Deposit transaction hash:', txHash);
      return txHash;
    } catch (error) {
      if (isUserCancellation(error)) {
        throw new Error('Transaction was cancelled by user');
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Withdraw all function
  const withdrawAll = async (vaultAddress: string) => {
    try {
      setIsLoading(true);
      
      if (!address) throw new Error('Wallet not connected');

      const userShares = await publicClient!.readContract({
        address: vaultAddress as `0x${string}`,
        abi: [{ "inputs": [{"internalType": "address", "name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function" }],
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });

      if (userShares === BigInt(0)) {
        throw new Error("No vault shares to withdraw");
      }

      const txHash = await writeContractAsync({
        address: vaultAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "uint256", "name": "shares", "type": "uint256"},
              {"internalType": "address", "name": "receiver", "type": "address"},
              {"internalType": "address", "name": "owner", "type": "address"}
            ],
            "name": "redeem",
            "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: "redeem",
        args: [userShares, address as `0x${string}`, address as `0x${string}`],
      });

      console.log('WithdrawAll transaction hash:', txHash);
      return txHash;
    } catch (error) {
      if (isUserCancellation(error)) {
        throw new Error('Transaction was cancelled by user');
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Withdraw specific amount function
  const withdrawAssets = async (vaultAddress: string, amount: string) => {
    try {
      setIsLoading(true);
      
      if (!address) throw new Error('Wallet not connected');
      
      const { assetAddress, decimals } = await getAssetInfo(vaultAddress);
      const amountToWithdraw = BigInt(parseUnits(amount, decimals));
      
      const userShares = await publicClient!.readContract({
        address: vaultAddress as `0x${string}`,
        abi: [{ "inputs": [{"internalType": "address", "name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function" }],
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });

      if (userShares === BigInt(0)) {
        throw new Error("No vault shares to withdraw");
      }

      const txHash = await writeContractAsync({
        address: vaultAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "uint256", "name": "assets", "type": "uint256"},
              {"internalType": "address", "name": "receiver", "type": "address"},
              {"internalType": "address", "name": "owner", "type": "address"}
            ],
            "name": "withdraw",
            "outputs": [{"internalType": "uint256", "name": "shares", "type": "uint256"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: "withdraw",
        args: [amountToWithdraw, address as `0x${string}`, address as `0x${string}`],
      });

      console.log('WithdrawAssets transaction hash:', txHash);
      return txHash;
    } catch (error) {
      if (isUserCancellation(error)) {
        throw new Error('Transaction was cancelled by user');
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Estimate gas for approval
  const estimateApprovalGas = async (vaultAddress: string, amount: string) => {
    if (!address || !publicClient) throw new Error('Wallet not connected');
    
    try {
      const { assetAddress, decimals } = await getAssetInfo(vaultAddress);
      const amountToApprove = BigInt(parseUnits(amount, decimals));
      
      const gas = await publicClient.estimateContractGas({
        address: assetAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "address", "name": "spender", "type": "address"},
              {"internalType": "uint256", "name": "amount", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: "approve",
        args: [vaultAddress as `0x${string}`, amountToApprove],
        account: address as `0x${string}`,
      });
      
      return gas;
    } catch (error) {
      console.error('Failed to estimate approval gas:', error);
      // Return a default estimate if estimation fails
      return BigInt(50000);
    }
  };

  // Estimate gas for deposit
  const estimateDepositGas = async (vaultAddress: string, amount: string) => {
    if (!address || !publicClient) throw new Error('Wallet not connected');
    
    try {
      const { decimals } = await getAssetInfo(vaultAddress);
      const amountToDeposit = BigInt(parseUnits(amount, decimals));
      
      const gas = await publicClient.estimateContractGas({
        address: vaultAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "uint256", "name": "assets", "type": "uint256"},
              {"internalType": "address", "name": "receiver", "type": "address"}
            ],
            "name": "deposit",
            "outputs": [{"internalType": "uint256", "name": "shares", "type": "uint256"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: "deposit",
        args: [amountToDeposit, address as `0x${string}`],
        account: address as `0x${string}`,
      });
      
      return gas;
    } catch (error) {
      console.error('Failed to estimate deposit gas:', error);
      // Return a default estimate if estimation fails
      return BigInt(150000);
    }
  };

  // Estimate gas for withdraw
  const estimateWithdrawGas = async (vaultAddress: string, amount?: string) => {
    if (!address || !publicClient) throw new Error('Wallet not connected');
    
    try {
      if (amount) {
        // Withdraw specific amount
        const { decimals } = await getAssetInfo(vaultAddress);
        const amountToWithdraw = BigInt(parseUnits(amount, decimals));
        
        const gas = await publicClient.estimateContractGas({
          address: vaultAddress as `0x${string}`,
          abi: [
            {
              "inputs": [
                {"internalType": "uint256", "name": "assets", "type": "uint256"},
                {"internalType": "address", "name": "receiver", "type": "address"},
                {"internalType": "address", "name": "owner", "type": "address"}
              ],
              "name": "withdraw",
              "outputs": [{"internalType": "uint256", "name": "shares", "type": "uint256"}],
              "stateMutability": "nonpayable",
              "type": "function"
            }
          ],
          functionName: "withdraw",
          args: [amountToWithdraw, address as `0x${string}`, address as `0x${string}`],
          account: address as `0x${string}`,
        });
        
        return gas;
      } else {
        // Withdraw all (redeem)
        const userShares = await publicClient.readContract({
          address: vaultAddress as `0x${string}`,
          abi: [{ "inputs": [{"internalType": "address", "name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function" }],
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        });

        if (userShares === BigInt(0)) {
          throw new Error("No vault shares to withdraw");
        }

        const gas = await publicClient.estimateContractGas({
          address: vaultAddress as `0x${string}`,
          abi: [
            {
              "inputs": [
                {"internalType": "uint256", "name": "shares", "type": "uint256"},
                {"internalType": "address", "name": "receiver", "type": "address"},
                {"internalType": "address", "name": "owner", "type": "address"}
              ],
              "name": "redeem",
              "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
              "stateMutability": "nonpayable",
              "type": "function"
            }
          ],
          functionName: "redeem",
          args: [userShares, address as `0x${string}`, address as `0x${string}`],
          account: address as `0x${string}`,
        });
        
        return gas;
      }
    } catch (error) {
      console.error('Failed to estimate withdraw gas:', error);
      // Return a default estimate if estimation fails
      return BigInt(150000);
    }
  };

  // Get gas price and calculate cost
  const getGasEstimate = async (gas: bigint) => {
    if (!publicClient) throw new Error('Network not available');
    
    try {
      const gasPrice = await publicClient.getGasPrice();
      const gasCost = gas * gasPrice;
      const ethPrice = await fetch('/api/prices?symbols=ETH').then(r => r.json()).then(d => d.eth || 0);
      const gasCostUsd = ethPrice > 0 ? Number(formatUnits(gasCost, 18)) * ethPrice : 0;
      
      return {
        gas,
        gasPrice,
        gasCost,
        gasCostUsd,
        gasCostFormatted: formatUnits(gasCost, 18),
      };
    } catch (error) {
      console.error('Failed to get gas estimate:', error);
      return {
        gas,
        gasPrice: BigInt(0),
        gasCost: BigInt(0),
        gasCostUsd: 0,
        gasCostFormatted: '0',
      };
    }
  };

  return {
    deposit,
    withdrawAll,
    withdrawAssets,
    approveTokens,
    executeDeposit,
    checkApprovalNeeded,
    estimateApprovalGas,
    estimateDepositGas,
    estimateWithdrawGas,
    getGasEstimate,
    isLoading,
  };
}
